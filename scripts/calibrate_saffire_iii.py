"""SAFFIRE-III S1 (PSI-100): measure the front at 30 cm/s and test the SAFFIRE-I model on it.

Same observable and estimator as the SAFFIRE-I S1 pipeline (green-channel contrast boundary,
2 s illumination bursts, 10 x 20 mm cells, neighbourhood counts), so the two trials differ in
the flow speed (20 vs 30 cm/s, both concurrent, same SIBAL fabric) and not in the method.

Outputs public/data/saffire/psi-100-s1.json with:
  - the observed median front and its speed (camera 1 field of view, ~590 mm);
  - neighbourhood probabilities fitted at 30 cm/s;
  - an out-of-trial prediction: the SAFFIRE-I kernel run unchanged and with the hazard scaled
    by (30/20)^beta, compared with the observed front; beta fitted from the two trials.

Run: python scripts/calibrate_saffire_iii.py   (needs data/cache/saffire/psi-100-s1/*.zip)
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
OUTPUT = ROOT / 'public/data/saffire/psi-100-s1.json'
SAFFIRE_I = ROOT / 'public/data/saffire/psi-98-s1-neighbors.json'
FRAME = re.compile(r'Mapped_S1C1-(\d{13})\.jpe?g$', re.I)
# Manual registration on the illuminated frame at t = 100 s (Mapped_S1C1, 1581 x 1202 px):
# sample holder top edge y = 186, bottom edge y = 1095 (406 mm), upstream (ignition) edge x = 1432.
CAMERA = {
    'id': 'S1C1', 'edgeX': 1432, 'edgeMm': 0.0, 'pixelsPerMm': (1095 - 186) / 406,
    'topAtX750': 186, 'bottomAtX750': 1095, 'slopeY': 0.0, 'visibleX': [110, 1420],
}
VISIBLE_MM = (CAMERA['edgeX'] - CAMERA['visibleX'][0]) / CAMERA['pixelsPerMm']
FLOW_I, FLOW_III = 20.0, 30.0
SEEDS = list(range(1951, 1971))


def frames() -> list[tuple[int, ZipFile, str]]:
    found: dict[int, tuple[ZipFile, str]] = {}
    for path in sorted(CACHE.glob('*S1C1_JPEG_Mapped_part*.zip')):
        archive = ZipFile(path)
        for name in archive.namelist():
            match = FRAME.search(name)
            if match and not name.startswith('__MACOSX'):
                found.setdefault(int(match[1]), (archive, name))
    return [(t, *found[t]) for t in sorted(found)]


def green_mean(archive: ZipFile, name: str) -> float:
    image = Image.open(BytesIO(archive.read(name)))
    image.draft('RGB', (200, 150))
    return float(np.asarray(image.convert('RGB'))[:, :, 1].mean())


def lit_bursts(items: list[tuple[int, ZipFile, str]]) -> list[tuple[int, ZipFile, str, float]]:
    """Brightest frame of each 2 s illumination burst."""
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


def main() -> int:
    items = frames()
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
        'conditions': {'flowCmS': FLOW_III, 'flowDirection': 'concurrent', 'oxygenPct': None, 'pressureKpa': None},
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
            'betaNote': 'v ∝ u^beta a partir de dois ensaios (20 e 30 cm/s); beta = 1 é a hipótese linear. Dois pontos não testam a forma funcional.',
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
            'O₂ e pressão não constam da tabela PSI-100; assumidos semelhantes ao SAFFIRE-I, não verificados.',
            'Espessura tabulada como ".33 cm" (provavelmente 0,33 mm), diferente dos 0,37 mm do SAFFIRE-I.',
        ],
        'provenance': {
            'zips': {p.name: p.stat().st_size for p in sorted(CACHE.glob('*S1C1_JPEG_Mapped_part*.zip'))},
            'script': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        },
    }
    atomic_write(OUTPUT, json_bytes(payload))

    # Diagnostic overlay for visual review (not published).
    out = CACHE / 'analysis'
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
