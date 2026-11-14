"""Calibrate opposed spread from the green-lit S2C2 char front."""
from __future__ import annotations

from collections import Counter
from io import BytesIO
import json
from zipfile import ZipFile

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import median_filter

from calibrate_saffire import CACHE, DX, STEP, ROW_CENTRES, WIDTH, COLUMNS
from calibrate_saffire_neighbors import neighbors, MIN_EXPOSURES
from ingest_saffire import sha256
from sync_nasa import ROOT, atomic_write, json_bytes

ID = 'PSI-98:t0:r3'
OUTPUT = ROOT / 'public/data/saffire/psi-98-s2-neighbors.json'
BASE = 1465937796510
EDGE, SCALE = 301, 2.24
X = np.arange(EDGE, 711)
Y = np.rint(152 + (1065 - 152) * ROW_CENTRES / WIDTH).astype(int)
START, END = 15, 35


def profile(image):
    green = np.asarray(image)[:, :, 1]
    return median_filter(np.median(green[Y[:, None, None] + np.arange(-5, 6)[None, :, None],
                                         X[None, None, :]], axis=1), size=(1, 9))


def front(sample, intact):
    detected = []
    for row, limit in zip(sample, intact, strict=True):
        candidates = []
        for x in range(40, limit - 13):
            before, after = np.median(row[x-12:x-3]), np.median(row[x+3:x+12])
            if before < 70 and after >= 65 and after - before >= 24:
                candidates.append((after - before, x))
        detected.append(max(candidates)[1] / SCALE if candidates else None)
    return detected


def states(fronts, intact):
    return [[None if f is None or (x+.5)*DX >= limit else int((x+.5)*DX <= f)
             for x in range(COLUMNS)] for f, limit in zip(fronts, intact, strict=True)]


def counts(grids, observations):
    n, advances = Counter(), Counter()
    for i, (previous, following) in enumerate(zip(grids, grids[1:])):
        a, b = (o['timestampMs'] for o in observations[i:i+2])
        if a is None or b is None or abs(b - a - STEP*1000) > 450:
            continue
        for y, row in enumerate(previous):
            for x, state in enumerate(row):
                if state != 0 or following[y][x] is None:
                    continue
                key = neighbors(previous, y, x)
                if key and key != '000':
                    n[key] += 1
                    advances[key] += following[y][x] == 1
    return {f'{k:03b}': {'exposures': n[f'{k:03b}'], 'transitions': advances[f'{k:03b}'],
                         'probability': advances[f'{k:03b}']/n[f'{k:03b}'] if n[f'{k:03b}'] >= MIN_EXPOSURES else None}
            for k in range(8)}


def longitudinal(combinations):
    exposures = sum(combinations[key]['exposures'] for key in ('100', '101', '110', '111'))
    transitions = sum(combinations[key]['transitions'] for key in ('100', '101', '110', '111'))
    return {'exposures': exposures, 'transitions': transitions,
            'probability': transitions / exposures if exposures >= MIN_EXPOSURES else None}


def validate(history, split, combinations, baseline):
    # Fixed set of comparable rows. An observation falling out of view must
    # not change the measured median speed by changing the set of rows.
    reserved = history[split:]
    rows = [y for y in range(len(reserved[0])) if all(1 in frame[y] and 0 in frame[y] for frame in reserved)]
    if len(reserved) < 3 or len(rows) < 3 or baseline['probability'] is None:
        return None
    steps = np.arange(len(reserved)) * STEP
    actual = np.array([[sum(cell == 1 for cell in frame[y]) * DX for y in rows] for frame in reserved])
    observed_speed = float(np.polyfit(steps, np.median(actual, axis=1), 1)[0])
    runs = []
    for seed in range(1951, 1971):
        grid = [row[:] for row in reserved[0]]
        positions = []
        for _ in reserved:
            positions.append([sum(cell == 1 for cell in grid[y]) * DX for y in rows])
            updated = [row[:] for row in grid]
            for y, row in enumerate(grid):
                x = next((i for i, cell in enumerate(row) if cell == 0), None)
                if x is None or x == 0 or row[x-1] != 1:
                    continue
                key = neighbors(grid, y, x)
                p = combinations[key]['probability'] if key else None
                seed = (1664525 * seed + 1013904223) & 0xffffffff
                if seed / 2**32 < (baseline['probability'] if p is None else p):
                    updated[y][x] = 1
            grid = updated
        speed = np.polyfit(steps, np.median(positions, axis=1), 1)[0]
        runs.append((np.abs(actual - positions).mean(), speed))
    error, speed = np.mean(runs, axis=0).tolist()
    return {'seedCount': len(runs), 'comparableRows': len(rows),
            'positionMaeMm': error, 'observedSpeedMmS': observed_speed, 'simulatedSpeedMmS': speed}


def main():
    directory = CACHE / 'psi-98-s2'
    path = next(directory.glob('*S2C2_JPEG_Mapped.zip'))
    out = directory / 'analysis'
    out.mkdir(exist_ok=True)
    with ZipFile(path) as z:
        entries = {int(n.rsplit('-', 1)[-1].split('.')[0]): n for n in z.namelist()
                   if n.startswith('Mapped_S2C2-')}
        times = sorted(entries)

        def load(ts):
            return Image.open(BytesIO(z.read(entries[ts]))).convert('RGB')

        def lit(t):
            # Match each green LED pulse independently. Do not snap across gaps.
            candidates = [ts for ts in times if abs(ts - (BASE + t*1000)) <= 550]
            frames = [(float(np.percentile(p, 90)), ts, im, p)
                      for ts in candidates for im in [load(ts)] for p in [profile(im)]]
            lit_frames = [row for row in frames if 90 <= row[0] <= 235]
            return max(lit_frames or frames, key=lambda row: row[0]) if frames else (0, None, None, None)

        _, baseline_ts, baseline_image, baseline = lit(1)
        limits = [next((i for i in range(35, len(row)) if row[i] < 70), len(row))
                  for row in baseline]
        intact = np.maximum(0, (np.array(limits) - 18) / SCALE).tolist()
        montage = Image.new('RGB', (1200, 1000))
        for y, limit in zip(Y, intact, strict=True):
            ImageDraw.Draw(baseline_image).point((EDGE + limit*SCALE, int(y)), fill='yellow')
        montage.paste(baseline_image.crop((280, 145, 650, 1085)).resize((200, 450)), (0, 0))
        history, observations = [], []
        previous = [0.] * len(Y)
        for j, t in enumerate(range(START, END + 1, STEP)):
            score, ts, image, sample = lit(t)
            values = front(sample, limits) if 90 <= score <= 235 else [None] * len(Y)
            for i, v in enumerate(values):
                if v is not None and (v < previous[i] - 4 or v >= intact[i]):
                    values[i] = None
                elif v is not None:
                    previous[i] = max(previous[i], v)
                    values[i] = previous[i]
            history.append(states(values, intact))
            observations.append({'timeS': t, 'timestampMs': ts, 'frontMm': values})
            if image is not None and j % 2 == 0:
                draw = ImageDraw.Draw(image)
                for y, v, limit in zip(Y, values, intact, strict=True):
                    draw.ellipse((EDGE + limit*SCALE-3, y-3, EDGE + limit*SCALE+3, y+3), fill='yellow')
                    if v is not None:
                        draw.ellipse((EDGE + v*SCALE-4, y-4, EDGE + v*SCALE+4, y+4), fill='magenta')
                position = (200 * ((j//2+1) % 6), 500 * ((j//2+1) // 6))
                montage.paste(image.crop((280, 145, 650, 1085)).resize((200, 450)), position)
                ImageDraw.Draw(montage).text((position[0]+4, position[1]+460), str(ts))
        montage.save(out / 'review.jpg')
    split = int((len(history)-1)*.7)
    combinations = counts(history[:split+1], observations[:split+1])
    holdout = counts(history[split:], observations[split:])
    diagnostic = {'schemaVersion': 1, 'experimentId': ID, 'camera': 'S2C2',
                  'baselineTimestampMs': baseline_ts, 'mappedZipSha256': sha256(path),
                  'intactLimitMmByRow': intact, 'observations': observations,
                  'candidateTraining': combinations, 'candidateHoldout': holdout,
                  'coverage': sum(v is not None for o in observations for v in o['frontMm'])/(len(Y)*len(observations))}
    atomic_write(out / 'diagnostic.json', json_bytes(diagnostic))
    baseline = longitudinal(combinations)
    checks = validate(history, split, combinations, baseline)
    ready = bool(checks and checks['observedSpeedMmS'] > 0 and checks['positionMaeMm'] <= 10
                 and abs(checks['simulatedSpeedMmS'] - checks['observedSpeedMmS'])
                 <= .30 * checks['observedSpeedMmS'])
    product = {**diagnostic, 'status': 'ready' if ready else 'unavailable',
               'stepSeconds': STEP, 'combinations': combinations, 'longitudinal': baseline,
               'validation': checks, 'contiguousValidation': checks,
               'review': 'Visual review of detector overlays; not independently annotated.'}
    if not ready:
        product['reason'] = 'O ajuste contra o fluxo ficou inconclusivo no trecho reservado de S2C2.'
    atomic_write(OUTPUT, json_bytes(product))
    print(json.dumps({key: product[key] for key in ('status', 'longitudinal', 'validation')}))


if __name__ == '__main__':
    main()
