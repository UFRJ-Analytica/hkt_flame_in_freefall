"""Retrospective cross-trial check of SAFFIRE-III S1 and provenance of its observations.

Complements scripts/calibrate_saffire_iii.py (the lab calibration with both cameras): this script
uses camera 1 only, an independent manual registration, and produces the simulation-calibrated
kernels and the flow exponent used by the 3D habitat.

Reuses the green-channel contrast detector and nominal grid, but camera, registration,
window and experimental conditions differ. The fitted flow exponent is not a controlled
causal effect; matching both observed speeds is calibration, not external validation.

Outputs public/data/saffire/crosstrial-i-iii.json with:
  - the observed median front and its speed (camera 1 field of view, ~590 mm);
  - neighbourhood probabilities fitted at 25 cm/s;
  - an out-of-trial prediction: the SAFFIRE-I kernel run unchanged and with the hazard scaled
    by (25/20)^beta, compared with the observed front; beta fitted from the two trials.

Run: python scripts/crosstrial_saffire.py   (needs data/cache/saffire/psi-100-s1/*.zip)
"""
from __future__ import annotations

import hashlib
import json
import re
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import numpy as np
from PIL import Image, ImageDraw

from calibrate_saffire import COLUMNS, ROWS, grid_front, measure, monotone_fronts
from calibrate_saffire_neighbors import count_neighborhoods, simulate_grid
from sync_nasa import ROOT, atomic_write, json_bytes

CACHE = ROOT / 'data/cache/saffire/psi-100-s1'
OUTPUT = ROOT / 'public/data/saffire/crosstrial-i-iii.json'
SAFFIRE_I = ROOT / 'public/data/saffire/psi-98-s1-neighbors.json'
FRAME = re.compile(r'Mapped_S1C1-(\d{13})\.jpe?g$', re.I)
# Manual registration on the illuminated frame at t = 100 s (Mapped_S1C1, 1581 x 1202 px):
# sample holder top edge y = 186, bottom edge y = 1095 (406 mm), upstream (ignition) edge x = 1432.
CAMERA = {
    'id': 'S1C1', 'edgeX': 1432, 'edgeMm': 0.0, 'pixelsPerMm': (1095 - 186) / 406,
    'topAtX750': 186, 'bottomAtX750': 1095, 'slopeY': 0.0, 'visibleX': [110, 1420],
}
VISIBLE_MM = (CAMERA['edgeX'] - CAMERA['visibleX'][0]) / CAMERA['pixelsPerMm']
# Flow 25 cm/s and 21.2% O2 per Combustion and Flame 199 (2018) 168-182, doi 10.1016/j.combustflame.2018.10.012;
# the PSI-100 table lists 30 cm/s, kept in the manifest as a documented conflict.
FLOW_I, FLOW_III = 20.0, 25.0
OXYGEN_III = 21.2
SEEDS = list(range(1951, 1971))


def script_digest(path: Path = Path(__file__)) -> str:
    """Portable fingerprint of source text; ZIP fingerprints remain exact byte SHA256."""
    return hashlib.sha256(path.read_bytes().replace(bytes((13, 10)), bytes((10,)))).hexdigest()


def frame_lineage(archive: ZipFile, name: str) -> dict:
    info = archive.getinfo(name)
    return {'zip': Path(archive.filename).name, 'member': name,
            'crc32': f'{info.CRC:08x}', 'uncompressedBytes': info.file_size,
            'compressedBytes': info.compress_size}


def index_frames(cache: Path) -> tuple[list, dict]:
    """Validate actual member CRCs before accepting timestamp/CRC deduplication."""
    found, assets, duplicates, archives = {}, [], [], []
    try:
        for path in sorted(cache.glob('*S1C1_JPEG_Mapped_part*.zip')):
            digest = hashlib.sha256()
            with path.open('rb') as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b''):
                    digest.update(block)
            archive = ZipFile(path)
            archives.append(archive)
            entries = archive.infolist()
            if len({entry.filename for entry in entries}) != len(entries):
                raise ValueError(f'Membros ambíguos com nomes repetidos: {path.name}')
            bad = archive.testzip()  # Reads every member, not just the central-directory CRC.
            if bad is not None:
                raise ValueError(f'CRC inválido: {path.name}:{bad}')
            stamps = []
            for entry in entries:
                match = FRAME.search(entry.filename)
                if not match or entry.filename.startswith('__MACOSX'):
                    continue
                stamp = int(match[1])
                stamps.append(stamp)
                previous = found.setdefault(stamp, (archive, entry.filename))
                if previous != (archive, entry.filename):
                    prior = previous[0].getinfo(previous[1])
                    if (prior.CRC, prior.file_size) != (entry.CRC, entry.file_size):
                        raise ValueError(f'CRC/tamanho conflitante no timestamp {stamp}')
                    duplicates.append({'timestampMs': stamp, 'kept': frame_lineage(*previous),
                                       'duplicate': frame_lineage(archive, entry.filename)})
            assets.append({'name': path.name, 'bytes': path.stat().st_size, 'sha256': digest.hexdigest(),
                           'crcValidatedMembers': len(entries),
                           'crcValidatedUncompressedBytes': sum(e.file_size for e in entries),
                           'frameEntries': len(stamps), 'memberTimestampsOrdered': stamps == sorted(stamps)})
        items = [(t, *found[t]) for t in sorted(found)]
        used = {id(a) for _, a, _ in items}
        for archive in archives:
            if id(archive) not in used:
                archive.close()
        audit = {'zipAssets': assets, 'zipBytesObserved': sum(a['bytes'] for a in assets),
                 'crcValidatedUncompressedBytes': sum(a['crcValidatedUncompressedBytes'] for a in assets),
                 'uniqueFrames': len(items), 'frameEntries': sum(a['frameEntries'] for a in assets),
                 'duplicateEntries': len(duplicates),
                 'duplicateTimestamps': len({d['timestampMs'] for d in duplicates}),
                 'duplicateLineage': duplicates,
                 'deduplication': 'Timestamp da câmera; CRC32 e tamanho iguais após leitura/CRC de todos os membros. Não é prova criptográfica de igualdade dos JPEGs.',
                 'ordering': 'Partes por nome; primeira ocorrência mantida; timestamps únicos ordenados numericamente antes da seleção.'}
        return items, audit
    except Exception:
        for archive in archives:
            archive.close()
        raise


def frames(cache: Path = CACHE) -> list[tuple[int, ZipFile, str]]:
    return index_frames(cache)[0]


def fit_interval_hazard(durations: list[float], events: list[int]) -> dict:
    """Grouped/interval-censored Bernoulli likelihood, NOT exact event-time MLE."""
    from scipy.optimize import brentq
    dt, y = np.asarray(durations, dtype=float), np.asarray(events, dtype=float)
    if (dt.ndim != 1 or y.shape != dt.shape or not np.all(np.isfinite(dt))
            or not np.all(dt > 0) or not np.all(np.isin(y, [0, 1]))):
        raise ValueError('Intervalos finitos positivos e eventos binários pareados são obrigatórios.')
    if not len(dt):
        rate, status = None, 'no-exposures'
    elif not y.sum():
        rate, status = 0., 'no-events-boundary'
    elif y.sum() == len(y):
        rate, status = None, 'all-events-unbounded'
    else:
        event_dt = dt[y == 1]
        survival_time = float(dt[y == 0].sum())
        def score(rate):
            z = rate * event_dt
            # exp(-z) form avoids overflow at large z.
            return float(np.sum(event_dt * np.exp(-z) / (-np.expm1(-z))) - survival_time)
        hi = 1. / float(dt.min())
        while score(hi) > 0:
            hi *= 2
        rate = float(brentq(score, np.finfo(float).eps / float(dt.sum()), hi, xtol=1e-14))
        status = 'finite-grouped-interval-mle'
    return {'ratePerSecond': rate, 'probabilityAt2Seconds': None if rate is None else float(-np.expm1(-2 * rate)),
            'status': status}


def interval_sensitivity(fronts: list, times: list[float], columns: int = COLUMNS) -> dict:
    from calibrate_saffire_neighbors import make_grid, neighbors
    t = np.asarray(times, dtype=float)
    if t.ndim != 1 or len(t) != len(fronts) or len(t) < 2 or not np.all(np.isfinite(t)) or not np.all(np.diff(t) > 0):
        raise ValueError('Tempos finitos estritamente crescentes pareados às frentes são obrigatórios.')
    width = len(fronts[0])
    for row in fronts:
        if len(row) != width or any(v is not None and (not np.isfinite(v) or int(v) != v or not 0 <= v <= columns) for v in row):
            raise ValueError('Frentes discretas inválidas.')
    groups = {f'{n:03b}': ([], []) for n in range(8)}
    censored = excluded = unknown = 0
    for old, new, dt in zip(fronts, fronts[1:], np.diff(t)):
        if any(a is not None and b is not None and b < a for a, b in zip(old, new)):
            raise ValueError('Frentes devem ser monotônicas.')
        before, after = make_grid(old, columns), make_grid(new, columns)
        for r, row in enumerate(before):
            for c, cell in enumerate(row):
                if cell is None:
                    unknown += 1
                    continue
                if cell != 0:
                    continue
                key = neighbors(before, r, c)
                if key is None or after[r][c] is None:
                    censored += 1
                elif key == '000':
                    excluded += 1
                else:
                    groups[key][0].append(float(dt))
                    groups[key][1].append(int(after[r][c] == 1))
    combinations = {}
    for key, (dt, events) in groups.items():
        actual = fit_interval_hazard(dt, events)
        fixed = fit_interval_hazard([2.] * len(dt), events)
        a, b = actual['ratePerSecond'], fixed['ratePerSecond']
        combinations[key] = {'exposures': len(dt), 'transitions': sum(events),
                             'observedCellSeconds': sum(dt), 'fixedCellSeconds': 2 * len(dt),
                             'variableInterval': actual, 'fixed2Seconds': fixed,
                             'rateDifferencePct': None if a is None or b in (None, 0) else 100 * (a / b - 1),
                             'probabilityAt2SecondsDifference': None if a is None or b is None else actual['probabilityAt2Seconds'] - fixed['probabilityAt2Seconds']}
    delta = np.diff(t)
    return {'deltaSeconds': delta.tolist(),
            'deltaSummary': {'min': float(delta.min()), 'max': float(delta.max()), 'mean': float(delta.mean()),
                             'median': float(np.median(delta)), 'total': float(delta.sum()),
                             'fixedTotal': 2. * len(delta), 'maxAbsoluteDeviationFrom2Seconds': float(np.max(abs(delta - 2)))},
            'censoredCellIntervals': censored, 'unknownAtStartCellIntervals': unknown,
            'excludedNoActiveNeighborCellIntervals': excluded, 'combinations': combinations,
            'riskDefinition': 'Mesmo conjunto do count_neighborhoods legado: célula intacta no início, vizinhos esquerda/acima/abaixo conhecidos e pelo menos um ativo (000 excluído), estado final conhecido. Classe congelada no início de cada intervalo; célula pode retornar em intervalos posteriores se observada. Nenhuma exposição além do último quadro.',
            'censoring': 'Estado final ou vizinhança desconhecidos: intervalo excluído integralmente, sem imputar sobrevivência nem tempo parcial; início desconhecido fora da população de risco. Evento observado apenas em (t_i,t_i+1], não no instante exato; sem evento contribui sobrevivência por Δt. Perda de observação não é tratada como censura independente demonstrada.',
            'likelihood': 'sum_event log(1-exp(-lambda*dt)) - sum_no_event lambda*dt; hazard constante por classe congelada. MLE agrupado/intervalar condicional ao conjunto observado; NÃO events/sum(dt), que exigiria tempos exatos de evento/exposição apropriados.',
            'fixedEquivalence': 'Com dt=2 uniforme, p=events/exposures e lambda=-log(1-p)/2 são equivalentes no modelo Bernoulli agrupado, não ao MLE de tempos exatos. Classes com menos de 30 exposições são apenas descritivas; regra operacional de mínimo 30 permanece intacta.',
            'interpretation': 'Sensibilidade descritiva da hipótese temporal, sem reajuste operacional e sem validação física. Dependência espacial/temporal, ativações dentro dos intervalos, monotonicização e censura podem enviesar a hipótese de hazard constante.'}


def green_mean(archive: ZipFile, name: str) -> float:
    image = Image.open(BytesIO(archive.read(name)))
    image.draft('RGB', (200, 150))
    return float(np.asarray(image.convert('RGB'))[:, :, 1].mean())


def lit_bursts(items: list[tuple[int, ZipFile, str]]) -> list[tuple[int, ZipFile, str, float]]:
    """Brightest frame of each 2 s illumination burst."""
    if any(not np.isfinite(t) for t, _, _ in items) or any(b[0] <= a[0] for a, b in zip(items, items[1:])):
        raise ValueError('Timestamps finitos únicos e estritamente crescentes são obrigatórios.')
    chosen, burst = [], []
    for t, archive, name in items[::2]:
        g = green_mean(archive, name)
        if g < 8:  # dark frames ~2.5; lit frames fall from ~165 to ~19 as the burnt area grows
            continue
        if burst and t - burst[-1][0] > 600:
            chosen.append(max(burst, key=lambda b: b[3]))
            burst = []
        burst.append((t, archive, name, g))
    if burst:
        chosen.append(max(burst, key=lambda b: b[3]))
    return chosen


def median_front_mm(fronts: list[list[int | None]]) -> list[float | None]:
    out = []
    for row in fronts:
        values = [v for v in row if v is not None]
        out.append(float(np.median(values)) * 10 if len(values) >= ROWS // 2 else None)
    return out


def fit_speed(times: np.ndarray, positions: np.ndarray) -> dict:
    slope, intercept = np.polyfit(times, positions, 1)
    residual = positions - (slope * times + intercept)
    se = float(np.sqrt(residual.var(ddof=2) / ((times - times.mean()) ** 2).sum()))
    return {'speedMmS': float(slope), 'standardErrorMmS': se, 'points': int(len(times)),
            'note': 'OLS sobre a mediana entre faixas; erro padrão ignora autocorrelação temporal (subestima a incerteza).'}


def scaled(combinations: dict, factor: float) -> dict:
    out = {}
    for key, value in combinations.items():
        p = value.get('probability')
        out[key] = {**value, 'probability': None if p is None else 1 - (1 - p) ** factor}
    return out


def simulated_speed(front: list[int | None], combinations: dict, steps: int) -> tuple[float, list[float]]:
    speeds = []
    for seed in SEEDS:
        history, _, _ = simulate_grid(front, combinations, steps, seed)
        positions = []
        for grid in history:
            fronts = [max((x + 1 for x, c in enumerate(row) if c == 1), default=0) for row in grid]
            positions.append(float(np.median(fronts)) * 10)
        t = np.arange(len(positions)) * 2.0
        speeds.append(float(np.polyfit(t, positions, 1)[0]))
    return float(np.median(speeds)), speeds


def match_speed(front: list[int], combinations: dict, steps: int, target: float) -> dict:
    """Bisection on a hazard factor so the median simulated speed equals the target (mm/s)."""
    before, _ = simulated_speed(front, combinations, steps)
    lo, hi = 0.3, 3.0
    for _ in range(14):
        mid = (lo * hi) ** 0.5
        speed, _ = simulated_speed(front, scaled(combinations, mid), steps)
        lo, hi = (mid, hi) if speed < target else (lo, mid)
    factor = (lo * hi) ** 0.5
    after, runs = simulated_speed(front, scaled(combinations, factor), steps)
    return {'factor': factor, 'targetSpeedMmS': target, 'simulatedBeforeMmS': before, 'simulatedAfterMmS': after,
            'spreadAfterMmS': [min(runs), max(runs)],
            'combinations': {k: {**v, 'probability': None if v.get('probability') is None else 1 - (1 - v['probability']) ** factor}
                             for k, v in combinations.items()}}


def enrich_payload(payload: dict, items: list, audit: dict, bursts: list,
                   times: list, raw: list, fronts: list) -> None:
    from datetime import datetime, timezone
    from calibrate_saffire import ROW_CENTRES
    median = median_front_mm(fronts)
    trajectory = [{'timeS': round(t, 2), 'frontMedianMm': m} for t, m in zip(times, median)]
    # Fail closed instead of silently attaching new observations to stale science.
    if (trajectory != payload['observedTrajectory'] or len(items) != payload['frames']['total']
            or len(bursts) != payload['frames']['illuminatedBursts']
            or count_neighborhoods(fronts) != payload['neighborhood']):
        raise ValueError('Observações reais divergem do artefato legado; publicação aditiva interrompida.')
    sensitivity = interval_sensitivity(fronts, times)
    window = [i for i, m in enumerate(median) if m is not None and 60 <= m <= VISIBLE_MM - 60]
    positions = np.array([median[i] for i in window])
    actual = fit_speed(np.array([times[i] for i in window]), positions)
    fixed = fit_speed(np.array([2. * i for i in window]), positions)
    sensitivity['frontSpeedOLS'] = {'actualTimestamps': actual, 'fixed2Seconds': fixed,
                                    'differencePct': 100 * (actual['speedMmS'] / fixed['speedMmS'] - 1),
                                    'selection': 'Mesmas medianas e índices da janela legada 60 <= frente <= visibleLength-60; só o eixo temporal muda.'}
    if not np.isclose(actual['speedMmS'], payload['observed']['speedMmS'], rtol=1e-12, atol=1e-12):
        raise ValueError('Velocidade observada diverge do legado.')
    payload['observations'] = {
        'rowCentersMm': ROW_CENTRES.tolist(), 'gridCellLengthMm': 10,
        'epochInitialMs': bursts[0][0],
        'epochInitialUtc': datetime.fromtimestamp(bursts[0][0] / 1000, timezone.utc).isoformat(),
        'epochDefinition': 'Timestamp do primeiro quadro iluminado selecionado; não identifica ignição nem sincronização externa. Interpretação Unix ms do nome do arquivo, não verificada contra relógio independente.',
        'selection': 'Estimador legado inalterado: frames únicos ordenados [::2], média verde >=8, rajada separada por lacuna >600ms, maior média verde (primeiro em empate).',
        'frontDefinition': 'frontMm: fronteira verde medida, censurada acima de visibleLength-15mm; frontGridCells: arredondamento 10mm e monotonicização legados. Índice da faixa 0..20, centros conforme calibrate_saffire. Valores null não imputados.',
        'selectedJpegBytes': sum(a.getinfo(n).file_size for _, a, n, _ in bursts),
        'selectedFrames': [
            {'timestampMs': stamp, 'timeS': round(t, 2), 'greenMean': green,
             'lineage': frame_lineage(archive, name), 'frontMm': row, 'frontGridCells': front}
            for (stamp, archive, name, green), t, row, front in zip(bursts, times, raw, fronts, strict=True)],
        'notMeasured': ['Instante exato de ignição/transição de cada célula e ativação dos vizinhos dentro do intervalo.',
                        'Calibração absoluta do relógio, sincronização independente e duração real de iluminação.',
                        'Temperatura, fluxo térmico, taxa de liberação de calor, pressão e incerteza de registro.',
                        'Câmera 2, frente fora do campo visível, cinética física e validação independente de hazard.']}
    payload['timeSensitivity'] = sensitivity
    payload['provenance']['frameAudit'] = audit
    payload['provenance']['script'] = script_digest()
    payload['provenance']['scriptHashConvention'] = 'SHA-256 of source bytes with CRLF normalized to LF; ZIP hashes use exact bytes.'
    # Reject all non-standard JSON floats before the atomic publication.
    json.dumps(payload, allow_nan=False)


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache-dir', type=Path, default=CACHE)
    parser.add_argument('--provenance-only', action='store_true', help='Re-extrai observações reais e preserva todos os resultados científicos já publicados; não recalibra simulações.')
    args = parser.parse_args()
    items, audit = index_frames(args.cache_dir)
    if not items:
        raise SystemExit(f'Nenhum frame em {CACHE}; baixe os ZIPs S1C1_JPEG_Mapped do PSI-100.')
    bursts = lit_bursts(items)
    t0 = bursts[0][0]
    times, raw = [], []
    for t, archive, name, _ in bursts:
        values = measure(Image.open(BytesIO(archive.read(name))), CAMERA)
        times.append((t - t0) / 1000)
        raw.append([v if v is None or v <= VISIBLE_MM - 15 else None for v in values])
    fronts = monotone_fronts([grid_front(r) for r in raw])
    median = median_front_mm(fronts)

    t = np.array([a for a, m in zip(times, median) if m is not None and 60 <= m <= VISIBLE_MM - 60])
    x = np.array([m for m in median if m is not None and 60 <= m <= VISIBLE_MM - 60])
    observed = fit_speed(t, x)

    if args.provenance_only:
        payload = json.loads(OUTPUT.read_text(encoding='utf-8'))
        enrich_payload(payload, items, audit, bursts, times, raw, fronts)
        atomic_write(OUTPUT, json_bytes(payload))
        for archive in {a for _, a, _ in items}:
            archive.close()
        print(json.dumps({'mode': 'provenance-only', 'zipBytesObserved': audit['zipBytesObserved'],
                          'uniqueFrames': len(items), 'duplicateEntries': audit['duplicateEntries'],
                          'selectedFrames': len(bursts), 'epochInitialMs': bursts[0][0],
                          'deltaSummary': payload['timeSensitivity']['deltaSummary'],
                          'frontSpeedOLS': payload['timeSensitivity']['frontSpeedOLS']}, ensure_ascii=False))
        return 0

    counts = count_neighborhoods(fronts)
    saffire_i = json.loads(SAFFIRE_I.read_text(encoding='utf-8'))
    observed_i = saffire_i['comparison']['observedSpeedMmS']

    # Out-of-trial test: start from the first well-formed observed front inside the fit window.
    start = next(i for i, m in enumerate(median) if m is not None and m >= 60)
    end = max(i for i, m in enumerate(median) if m is not None and m <= VISIBLE_MM - 60)
    steps = end - start
    initial = [v if v is not None else 0 for v in fronts[start]]
    unscaled, unscaled_runs = simulated_speed(initial, saffire_i['combinations'], steps)
    linear, linear_runs = simulated_speed(initial, scaled(saffire_i['combinations'], FLOW_III / FLOW_I), steps)
    beta = float(np.log(observed['speedMmS'] / observed_i) / np.log(FLOW_III / FLOW_I))

    # Simulation-based calibration: one hazard factor per trial so that the simulated median front
    # speed equals the measured one, keeping the neighbourhood structure fitted from the counts.
    filled_iii = {k: (v if v['probability'] is not None else saffire_i['combinations'][k])
                  for k, v in counts['combinations'].items()}
    match_iii = match_speed(initial, filled_iii, steps, observed['speedMmS'])
    initial_i = [v if v is not None else 0 for v in saffire_i['initialFront']]
    steps_i = int(saffire_i['durationSeconds'] // 2)
    match_i = match_speed(initial_i, saffire_i['combinations'], steps_i, observed_i)

    payload = {
        'schemaVersion': 1,
        'experimentId': 'PSI-100:S1',
        'sourceUrl': 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-100',
        'material': 'SIBAL',
        'conditions': {'flowCmS': FLOW_III, 'flowDirection': 'concurrent', 'oxygenPct': OXYGEN_III, 'pressureKpa': None,
                       'source': 'doi:10.1016/j.combustflame.2018.10.012', 'conflict': 'Tabela PSI-100 registra 30 cm/s.'},
        'camera': CAMERA,
        'visibleLengthMm': round(VISIBLE_MM, 1),
        'frames': {'total': len(items), 'illuminatedBursts': len(bursts), 'stepSeconds': 2},
        'observedTrajectory': [{'timeS': round(a, 2), 'frontMedianMm': m} for a, m in zip(times, median)],
        'observed': observed,
        'neighborhood': counts,
        'comparisonWithSaffireI': {
            'saffireIObservedSpeedMmS': observed_i,
            'saffireIIIObservedSpeedMmS': observed['speedMmS'],
            'speedRatio': observed['speedMmS'] / observed_i,
            'flowRatio': FLOW_III / FLOW_I,
            'beta': beta,
            'betaNote': 'v ∝ u^beta a partir de dois ensaios (20 e 25 cm/s); beta = 1 é a hipótese linear. Dois pontos não testam a forma funcional.',
        },
        'prediction': {
            'description': 'Modelo de vizinhança do SAFFIRE-I aplicado sem reajuste ao SAFFIRE-III, a partir da frente observada.',
            'startTimeS': times[start], 'steps': steps, 'seeds': len(SEEDS),
            'unscaledSpeedMmS': unscaled, 'unscaledRuns': unscaled_runs,
            'linearFlowSpeedMmS': linear, 'linearFlowRuns': linear_runs,
            'observedSpeedMmS': observed['speedMmS'],
        },
        'speedMatch': {
            'description': 'Fator único de intensidade (lambda) por ensaio para que a simulação reproduza a velocidade mediana medida; a estrutura de vizinhança vem das contagens.',
            'saffireI': match_i,
            'saffireIII': match_iii,
        },
        'limits': [
            'Contagens por vizinhança reconstruídas por faixa não reproduzem sozinhas a velocidade agregada (SAFFIRE-III simula +16% sem o fator); por isso a calibração por simulação.',
            'Só a câmera 1 (cerca de 590 mm a partir da borda de ignição); a câmera 2 não foi processada.',
            'Registro manual em um quadro (t = 100 s), escala 2,24 px/mm pela largura de 406 mm; sem propagação de erro de registro.',
            'O₂ (21,2%) e escoamento (25 cm/s) do artigo da equipe; a tabela PSI-100 registra 30 cm/s. Pressão não tabulada.',
            'A calibração do laboratório (calibrate_saffire_iii.py, duas câmeras, trecho reservado) mede 2,43 mm/s; esta, só câmera 1 e janela inteira, mede ~2,2 mm/s.',
            'Espessura tabulada como ".33 cm" (provavelmente 0,33 mm), diferente dos 0,37 mm do SAFFIRE-I.',
        ],
        'provenance': {
            'zips': {p.name: p.stat().st_size for p in sorted(args.cache_dir.glob('*S1C1_JPEG_Mapped_part*.zip'))},
            'script': script_digest(),
        },
    }
    enrich_payload(payload, items, audit, bursts, times, raw, fronts)
    atomic_write(OUTPUT, json_bytes(payload))

    # Diagnostic overlay for visual review (not published).
    out = args.cache_dir / 'analysis'
    out.mkdir(exist_ok=True)
    for k in (len(bursts) // 4, len(bursts) // 2, 3 * len(bursts) // 4):
        _, archive, name, _ = bursts[k]
        image = Image.open(BytesIO(archive.read(name))).convert('RGB')
        draw = ImageDraw.Draw(image)
        for row, value in enumerate(raw[k]):
            if value is None:
                continue
            px = CAMERA['edgeX'] - value * CAMERA['pixelsPerMm']
            y = CAMERA['topAtX750'] + (row + 0.5) * 20 * CAMERA['pixelsPerMm']
            draw.ellipse([px - 6, y - 6, px + 6, y + 6], outline=(255, 0, 255), width=3)
        image.save(out / f'front-{k:03d}.jpg', quality=80)

    print(f'bursts {len(bursts)}; observed {observed["speedMmS"]:.3f} ± {observed["standardErrorMmS"]:.3f} mm/s '
          f'(SAFFIRE-I {observed_i:.3f}); beta {beta:.2f}; predicted unscaled {unscaled:.3f}, linear {linear:.3f}')
    for key, value in counts['combinations'].items():
        print(key, value['transitions'], '/', value['exposures'], value['probability'])
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
