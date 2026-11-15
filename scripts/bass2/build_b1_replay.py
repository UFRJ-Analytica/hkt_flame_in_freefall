"""Small, validated JSON of the B1 flame-front measurements for the HabitatFire interface.

Everything comes from artefacts already produced in this branch; nothing is measured, fitted or
converted here:

  data/bass2/b1/flamefront-pixel.json      velocities, intervals, quality, NASA reference status (P3)
  data/bass2/b1/flamefront-tracks.csv      per-frame tracked positions (P3, series of the selected method)
  data/bass2/b1/annotations/b1-manual-annotations.csv  preliminary visual reference (P3)
  data/bass2/b1/regimes.json, telemetry.csv, timebase-frames.csv  events, FAN/AIR, time base (P2)
  data/bass2/b1/registration.json          spatial calibration status (P2: insufficient)
  public/data/nasa-experiments.json        the catalogue record of B1 (conditions as published)

Output: public/data/bass2/b1-replay.json (columnar arrays, one entry per decoded frame of the replay
range, no point reduction). A frame without a tracked position is null, never zero. The output is
deterministic (no generation time), so rebuilding must give the same bytes.

    python scripts/bass2/build_b1_replay.py           # write
    python scripts/bass2/build_b1_replay.py --check   # rebuild in memory and compare with the file
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
B1 = ROOT / 'data/bass2/b1'
INPUTS = {
    'flamefrontPixel': B1 / 'flamefront-pixel.json',
    'flamefrontTracks': B1 / 'flamefront-tracks.csv',
    'flamefrontConfig': B1 / 'flamefront-config.json',
    'annotations': B1 / 'annotations/b1-manual-annotations.csv',
    'regimes': B1 / 'regimes.json',
    'telemetry': B1 / 'telemetry.csv',
    'timebaseFrames': B1 / 'timebase-frames.csv',
    'registration': B1 / 'registration.json',
    'catalogue': ROOT / 'public/data/nasa-experiments.json',
}
OUTPUT = ROOT / 'public/data/bass2/b1-replay.json'
RECORD_ID = 'PSI-25:t0:r2'
BANDS = ('upper', 'lower')
BAND_LABELS = {'upper': 'lâmina superior', 'lower': 'lâmina inferior'}
# Replay range: first visible light (P2 event) to FAN at its floor, after the last dim flame (P2 event).
FIRST_EVENT, LAST_EVENT = 'light_first_visible', 'fan_reaches_38'
# Delay after the window start at which the P3 start-scan shows all front definitions converging.
STABLE_FRONT_DELAY_S = 3.0
FLAG_CODES = {'ok': 'ok', 'reaquisicao': 'ok', 'baixa_confianca': 'low', 'ausente': 'absent',
              'rejeitado_salto': 'rejected', 'sem_referencia': 'unseeded'}
LIMITATIONS = [
    {'id': 'pixels', 'text': 'A posição da frente é medida em pixels da imagem (coluna x do vídeo lateral), não em milímetros.'},
    {'id': 'no-scale', 'text': 'A calibração espacial ainda não foi determinada: nenhuma dimensão documentada é visível no plano do vídeo (registration.json: insufficient).'},
    {'id': 'px-per-s', 'text': 'As velocidades são em px/s, não em mm/s. Não há conversão para unidades físicas.'},
    {'id': 'nasa-reference', 'text': 'A referência NASA de 2,2 mm/s não foi validada quantitativamente contra esta extração; px/s e mm/s não são comparáveis sem escala.'},
    {'id': 'annotations', 'text': 'As 32 anotações usadas para escolher o método foram feitas por um único anotador (leitura visual do assistente de IA), são preliminares e aguardam revisão humana independente.'},
    {'id': 'b1-only', 'text': 'Os resultados são de um único teste (B1, filme de PMMA de 100 µm) e não devem ser generalizados para outros materiais ou condições do BASS-II.'},
    {'id': 'early-transient', 'text': 'Nos primeiros ~3 s da janela 332–1048 a borda luminosa ainda é o brilho da ignição; a frente só avança de forma estável a partir de ~quadro 422.'},
    {'id': 'not-a-model', 'text': 'É uma reconstrução de uma medição em vídeo, não um modelo de combustão nem uma previsão de incêndio em nave espacial.'},
]


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read_csv(path: Path) -> list[dict]:
    with path.open(encoding='utf-8') as stream:
        return list(csv.DictReader(stream))


def number(text: str) -> float | None:
    return None if text in ('', None) else float(text)


def r(value: float | None, digits: int = 3) -> float | None:
    if value is None or (isinstance(value, float) and not math.isfinite(value)):
        return None
    return round(float(value), digits)


def ols_slope(t: list[float], x: list[float | None]) -> float:
    pairs = [(a, b) for a, b in zip(t, x) if b is not None]
    n = len(pairs)
    tm = sum(a for a, _ in pairs) / n
    xm = sum(b for _, b in pairs) / n
    return sum((a - tm) * (b - xm) for a, b in pairs) / sum((a - tm) ** 2 for a, _ in pairs)


def build() -> dict:
    pixel = json.loads(INPUTS['flamefrontPixel'].read_text(encoding='utf-8'))
    regimes = json.loads(INPUTS['regimes'].read_text(encoding='utf-8'))
    registration = json.loads(INPUTS['registration'].read_text(encoding='utf-8'))
    catalogue = json.loads(INPUTS['catalogue'].read_text(encoding='utf-8'))
    record = next(test for inv in catalogue['investigations'] if inv['id'] == 'PSI-25' for test in inv['tests'] if test['id'] == RECORD_ID)
    if pixel['recordId'] != RECORD_ID or regimes['recordId'] != RECORD_ID or record['label'] != pixel['test']:
        raise ValueError('os artefatos não se referem ao mesmo registro B1')

    primary = pixel['primary']
    method = primary['method']
    series_name = f'{method}_front'
    window = pixel['window']
    t_origin = window['experimentTimeFirst_s']
    events = regimes['events']
    first_frame = events[FIRST_EVENT]['first']['frame']
    last_frame = events[LAST_EVENT]['first']['frame']

    times = {int(row['ts_frame']): row for row in read_csv(INPUTS['timebaseFrames'])}
    tracks = [row for row in read_csv(INPUTS['flamefrontTracks']) if row['series'] == series_name]
    if not tracks:
        raise ValueError(f'série {series_name} ausente de flamefront-tracks.csv')
    by_band = {band: {int(row['ts_frame']): row for row in tracks if row['band'] == band} for band in BANDS}

    frames = list(range(first_frame, last_frame + 1))
    t, clock = [], []
    for frame in frames:
        tb = times[frame]
        experiment = float(tb['timestamp_experiment_fit_s'])
        for band in BANDS:
            if abs(float(by_band[band][frame]['timestamp_experiment_s']) - experiment) > 5e-4:
                raise ValueError(f'quadro {frame}: tempo da trilha difere da base temporal')
        t.append(r(experiment - t_origin))
        clock.append(tb['clock_display_raw'])
    fronts = {}
    for band in BANDS:
        x = [r(number(by_band[band][frame]['tracked_px']), 2) for frame in frames]
        flags = [FLAG_CODES[by_band[band][frame]['flag']] for frame in frames]
        fronts[band] = {'label': BAND_LABELS[band], 'x_px': x, 'quality': flags}

    # Coherence: the slope re-fitted from the replay series over the P3 window must equal the P3 result.
    in_window = [i for i, frame in enumerate(frames) if window['firstFrame'] <= frame <= window['lastFrame']]
    velocities = {}
    for band in BANDS:
        fit = primary['bands'][band]
        refit = ols_slope([t[i] for i in in_window], [fronts[band]['x_px'][i] for i in in_window])
        if abs(refit - fit['slope']) > 2e-3:
            raise ValueError(f'{band}: inclinação recalculada {refit:.4f} difere de flamefront-pixel.json {fit["slope"]:.4f}')
        velocities[band] = {
            'label': BAND_LABELS[band], 'value_px_s': fit['slope'], 'ci95_px_s': fit['ci95'], 'ciMethod': fit['ciMethod'],
            'intercept_px': fit['intercept'], 'r2': fit['r2'], 'residualSd_px': fit['residualSd'], 'n': fit['n'],
            'coverage': fit['coverage'], 'lag1Autocorrelation': fit['lag1Autocorrelation'],
            'seHac_px_s': fit['seHac'], 'slopeIfStartDelayed3s_px_s': next(item['slope'] for item in fit['startScan'] if item['startDelay_s'] == 3),
            'localSlopeRange_px_s': [fit['stability']['localSlopeMin'], fit['stability']['localSlopeMax']],
            'referenceComparison': fit['reference'],
        }

    stable_start = next(frame for frame, value in zip(frames, t) if value >= STABLE_FRONT_DELAY_S)
    event_list = []

    def event(key, label, kind, source, first=None, last=None, note=None):
        start = first if first is not None else events[key]['first']['frame']
        end = last if last is not None else events[key]['last']['frame']
        event_list.append({'id': key, 'label': label, 'kind': kind, 'source': source,
                           'frameFirst': start, 'frameLast': end,
                           't_s': r(float(times[start]['timestamp_experiment_fit_s']) - t_origin),
                           'tEnd_s': r(float(times[end]['timestamp_experiment_fit_s']) - t_origin),
                           'clock': times[start]['clock_display_raw'],
                           'note': note if note is not None else events.get(key, {}).get('note')})

    event('light_first_visible', 'Primeira luz (ignição)', 'visual', 'P2 regimes.json')
    event('ignitor_and_flame_overlap', 'Ignitor e chama sobrepostos', 'visual', 'P2 regimes.json')
    event('flame_two_sheets_visible', 'Chama estabelecida: duas lâminas', 'visual', 'P2 regimes.json')
    event('stable_window', 'Janela de análise (FAN constante)', 'window', 'P2 regimes.json / P3',
          window['firstFrame'], window['lastFrame'], 'intervalo usado nas regressões da fase P3')
    event('front_stable_start', 'Frente estável (aprox.)', 'inference', 'P3 start-scan', stable_start, stable_start,
          f'início aproximado: {STABLE_FRONT_DELAY_S:g} s após o quadro {window["firstFrame"]}, quando todas as definições de frente convergem (inferência)')
    event('fan_drop_start', 'Redução de FAN', 'telemetry', 'P2 regimes.json')
    event('flame_luminous_last', 'Última chama luminosa', 'visual', 'P2 regimes.json')
    event('flame_dim_last', 'Extinção (último traço visível)', 'visual', 'P2 regimes.json')
    event('fan_reaches_38', 'FAN no mínimo (38)', 'telemetry', 'P2 regimes.json')

    telemetry = []
    for row in read_csv(INPUTS['telemetry']):
        first, last = int(row['source_frame']), int(row['last_frame'])
        if last < first_frame or first > last_frame:
            continue
        point = {'frameFirst': max(first, first_frame), 'fan': number(row['fan_display_raw']),
                 'fanVoltage_v': number(row['fan_voltage_v']), 'air': number(row['air_display_raw'])}
        if telemetry and (telemetry[-1]['fan'], telemetry[-1]['air']) == (point['fan'], point['air']):
            continue
        point['t_s'] = r(float(times[point['frameFirst']]['timestamp_experiment_fit_s']) - t_origin)
        telemetry.append(point)

    reference = []
    for row in read_csv(INPUTS['annotations']):
        frame = int(row['ts_frame'])
        reference.append({'frame': frame, 't_s': r(float(times[frame]['timestamp_experiment_fit_s']) - t_origin),
                          **{band: (number(row[f'{band}_front_px']) if row[f'{band}_visible'] == '1' else None) for band in BANDS}})
    annotators = sorted({row['annotator'] for row in read_csv(INPUTS['annotations'])})

    raw = record['raw']
    conditions = regimes['conditionsFromCatalogue']
    return {
        'schemaVersion': 1,
        'kind': 'experimental-observation',
        'statement': 'Reconstrução de uma medição em vídeo do teste B1; não é modelo nem previsão.',
        'experiment': {
            'program': 'NASA BASS-II (Burning and Suppression of Solids II)', 'investigationId': 'PSI-25',
            'recordId': RECORD_ID, 'test': record['label'], 'platform': 'ISS, Microgravity Science Glovebox',
            'material': 'PMMA', 'materialAsPublished': ' '.join(raw['Fuel Sample Material'].split()),
            'thickness_um': 100, 'thicknessSource': 'PSI-25 tabela experimental ("100 micron PMMA film"); SRD p. 5 ("0.1 mm thick")',
            'width_mm_nominal': 20, 'principalInvestigator': raw['PI'], 'date': raw['Date'], 'gmtDay': raw['GMT'],
            'sample': raw['Sample #'],
            'conditions': [
                {'label': 'O₂ inicial (calibrado)', 'value': f"{record['oxygenPct']} % vol", 'note': conditions['oxygenNote']},
                {'label': 'Restritor de fluxo', 'value': str(conditions['flowRestrictor']), 'note': None},
                {'label': 'FAN (display, tabela)', 'value': raw['Fan display'], 'note': 'leitura do painel, não é velocidade'},
                {'label': 'AIR (display, tabela)', 'value': raw['Air display'], 'note': 'transdutor de ar com resposta de ~1 min'},
                {'label': 'Pressão', 'value': None, 'note': 'não informada no registro do catálogo'},
                {'label': 'Configuração', 'value': 'fluxo oposto, chama nos dois lados do filme', 'note': 'Summary Report, PDF p. 29'},
            ],
            'catalogueSource': f"{record['sourceFile']} · registro {record['sourceRow']}",
        },
        'units': {'time': 's', 'position': 'px', 'velocity': 'px/s'},
        'axes': {
            'time': f"tempo experimental (relógio ajustado da P2) menos {t_origin} s, instante do quadro {window['firstFrame']} ({window['clockFirst']}); negativo antes da janela de análise",
            'position': 'coluna x da imagem 720×480 do vídeo lateral, crescendo no sentido da propagação',
        },
        'tOrigin': {'frame': window['firstFrame'], 'timestamp_experiment_s': t_origin, 'clock': window['clockFirst']},
        'window': {'frameFirst': window['firstFrame'], 'frameLast': window['lastFrame'], 't_s': [0.0, r(window['duration_s'])],
                   'clockFirst': window['clockFirst'], 'clockLast': window['clockLast']},
        'method': {'id': method, 'description': 'segmentação por limiar adaptativo (bloco 31 px, C = −10, piso 25), componente mais brilhante, borda em +x',
                   'selectionRule': primary['selection']['rule'], 'tracking': 'porta de 40 px sobre a mediana das 15 últimas posições; sem monotonicidade; sem interpolação',
                   'methodSpread_px_s': {band: {'fullWindow': [primary['methodSpread'][band]['slope']['min'], primary['methodSpread'][band]['slope']['max']],
                                                'secondHalf': [primary['methodSpread'][band]['slopeSecondHalf']['min'], primary['methodSpread'][band]['slopeSecondHalf']['max']]}
                                         for band in BANDS},
                   'candidates': len(primary['selection']['ranking'])},
        'series': {'frame': frames, 't_s': t, 'clock': clock, 'fronts': fronts,
                   'qualityCodes': {'ok': 'posição aceita', 'low': 'aceita, baixa confiança', 'absent': 'sem detecção',
                                    'rejected': 'rejeitada pela porta do rastreamento', 'unseeded': 'antes da referência do rastreamento'},
                   'reduction': 'nenhuma: um ponto por quadro decodificado'},
        'velocities': velocities,
        'bandDifference_px_s': primary['bandDifference_px_s'],
        'spatialScale': {'status': registration['status'], 'mm_per_px': None, 'reason': registration['reason']},
        'physicalVelocity': {'status': pixel['physicalVelocity']['status'], 'value_mm_s': None},
        'nasaReference': {'value_mm_s': pixel['nasaReference']['value_mm_s'], 'source': pixel['nasaReference']['source'],
                          'comparisonStatus': pixel['nasaReference']['comparisonStatus'], 'note': pixel['nasaReference']['note']},
        'events': event_list,
        'telemetry': {'points': telemetry,
                      'fanNote': 'FAN é a leitura do painel do ventilador (×0,1 V). Não é convertida em velocidade do ar nesta visualização.',
                      'airNote': 'AIR é a leitura do transdutor de ar (cm/s), com resposta de ~1 min: não é uma medição instantânea na chama.',
                      'caveats': regimes['velocityCaveats'], 'source': 'P2 telemetry.csv (OCR da sobreposição, mudanças de FAN/AIR apenas)'},
        'referenceAnnotations': {'status': 'preliminary', 'independent': False, 'annotators': annotators,
                                 'note': 'leitura visual de pranchas 3× pelo assistente de IA, antes de executar os detectores; aguarda revisão humana independente (docs/research/BASS2_B1_ANNOTATION_REVIEW.md)',
                                 'points': reference},
        'limitations': LIMITATIONS,
        'provenance': {
            'generator': 'scripts/bass2/build_b1_replay.py',
            'sourceVideo': pixel['source'],
            'inputs': {name: {'path': path.relative_to(ROOT).as_posix(), 'sha256': sha256(path)} for name, path in INPUTS.items()},
            'report': 'docs/research/BASS2_B1_FLAMEFRONT_ANALYSIS.md',
        },
    }


def render(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    text = render(build())
    if args.check:
        same = OUTPUT.exists() and OUTPUT.read_text(encoding='utf-8') == text
        print('b1-replay.json reproduzível' if same else 'b1-replay.json difere da reconstrução')
        return 0 if same else 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(text, encoding='utf-8', newline='\n')
    print(json.dumps({'output': OUTPUT.relative_to(ROOT).as_posix(), 'bytes': OUTPUT.stat().st_size}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
