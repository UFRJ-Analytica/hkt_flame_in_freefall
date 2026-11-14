"""Fit SAFFIRE III transition tables on mapped, green-lit frames."""
from contextlib import ExitStack
from io import BytesIO
import json
from zipfile import BadZipFile, ZipFile

import numpy as np
from PIL import Image, ImageDraw

from calibrate_saffire import (
    COLUMNS, DX, DY, LENGTH, ROWS, ROW_CENTRES, STEP, WIDTH, boundary,
    compare, grid_front, merge, monotone_fronts, nearest, scan_green, simulate,
    transition_counts,
)
from calibrate_saffire_neighbors import contiguous_validation, count_neighborhoods, evaluate, simulate_baseline, simulate_grid
from ingest_saffire import CACHE, sha256
from ingest_saffire_iii import SOURCE, SLUG, frames
from sync_nasa import ROOT, atomic_write, json_bytes

DIRECTORY = CACHE / SLUG
MANIFEST = ROOT / f'data/saffire/{SLUG}/manifest.json'
PUBLIC = ROOT / 'public/data/saffire'
GRID = dict(lengthMm=LENGTH, widthMm=WIDTH, dxMm=DX, dyMm=DY, columns=COLUMNS, rows=ROWS)
# Mounting edges and fabric width as measured in the mapped images.
# Coordinate x increases in the direction of spread, independently of pixel x.
# In S1C2 the left cutoff excludes the dark strip already burned by S2.
CAMERAS = {
    'S1C1': dict(edgeX=1435, edgeMm=0, scale=2.24, top=185, bottom=1094, left=180, right=1420, sign=-1),
    'S1C2': dict(edgeX=326, edgeMm=940, scale=2.24, top=154, bottom=1068, left=550, right=1570, sign=-1),
    'S2C2': dict(edgeX=326, edgeMm=0, scale=2.24, top=154, bottom=1068, left=333, right=645, sign=1),
}
WINDOWS = {'S1': (1496610904000, 292), 'S2': (1496610689000, 62)}
MIN_VALIDATION_POINTS = 21
MAX_SPEED_ERROR_FRACTION = 0.30
MAX_POSITION_MAE_MM = 30


def sequence(stack, assets, camera):
    entries = {}
    for asset in assets:
        if asset.get('camera') != camera:
            continue
        path = DIRECTORY / asset['name']
        if asset['status'] != 'available' or sha256(path) != asset['sha256']:
            raise ValueError(f'Arquivo ausente ou hash inválido para {camera}.')
        archive = stack.enter_context(ZipFile(path))
        for ts, entry in frames(archive, camera).items():
            old = entries.setdefault(ts, (archive, entry))
            if old[1].CRC != entry.CRC:
                raise ValueError(f'{camera}: quadros divergentes em {ts}.')
    if not entries:
        raise ValueError(f'Sem quadros para {camera}.')
    return entries


def observation(entries, timestamps, target, camera):
    # Green illumination is periodic. A few offsets cover the pulse while
    # keeping each timestamp attached to its original 2 s sample.
    best = None
    for offset in (-100, 0, 100, 200, 300, 400, 500):
        ts = nearest(timestamps, target + offset, 22)
        if ts is None:
            continue
        archive, entry = entries[ts]
        with Image.open(BytesIO(archive.read(entry))) as original:
            original.draft('RGB', (240, 180))
            sample = np.asarray(original.convert('RGB'), dtype=np.int16)
        score = float(np.percentile(sample[:, :, 1] - sample[:, :, 0], 85))
        if best is None or score > best[0]:
            best = (score, ts)
    if best is None or best[0] < 30:
        return None, None
    archive, entry = entries[best[1]]
    with Image.open(BytesIO(archive.read(entry))) as original:
        image = original.convert('RGB')
    return best[1], image


def measure(image, camera):
    pixels = np.arange(camera['left'], camera['right']+1)
    if camera['sign'] == 1:
        pixels = pixels[::-1]
    ys = camera['top'] + (camera['bottom']-camera['top']) * ROW_CENTRES / WIDTH
    values = []
    for y in ys:
        # S2 starts close to the ignition edge. Pad only the already dark end
        # so the detector can check fronts within 40 px of the registered edge.
        profile = scan_green(image, np.full_like(pixels, y, dtype=float), pixels)
        pad = 42 if camera['sign'] == 1 else 0
        if pad:
            # An unburned, shaded region at the edge can otherwise look like
            # a char front. The pre-ignition frame has green > 100 here.
            if np.median(profile[-23:-8]) > 50:
                values.append(None)
                continue
            profile = np.pad(profile, (0, pad), mode='edge')
        index = boundary(profile)
        if index is None or index >= len(pixels) or (pad and index > len(pixels)-7):
            values.append(None)
        else:
            mm = camera['edgeMm'] + camera['sign']*(int(pixels[index])-camera['edgeX'])/camera['scale']
            values.append(mm if 0 <= mm <= LENGTH else None)
    return values


def plot_review(image, camera, values, path):
    draw = ImageDraw.Draw(image)
    for row, mm in enumerate(values):
        if mm is None:
            continue
        x = camera['edgeX'] + camera['sign']*(mm-camera['edgeMm'])*camera['scale']
        y = camera['top']+(camera['bottom']-camera['top'])*ROW_CENTRES[row]/WIDTH
        draw.ellipse((x-5, y-5, x+5, y+5), fill='magenta')
    image.thumbnail((760, 580))
    image.save(path)


def collect(run, assets):
    start, duration = WINDOWS[run]
    folder = DIRECTORY / 'analysis'
    folder.mkdir(exist_ok=True)
    cams = [cam for cam in CAMERAS if cam.startswith(run)]
    rows, overlap = [], []
    with ExitStack() as stack:
        files = {c: sequence(stack, assets, c) for c in cams}
        times = {c: sorted(v) for c, v in files.items()}
        if run == 'S2':
            _, before = observation(files['S2C2'], times['S2C2'], 1496610675000, CAMERAS['S2C2'])
            if before is None:
                raise ValueError('Quadro iluminado antes da ignição indisponível.')
            before_front = measure(before, CAMERAS['S2C2'])
            plot_review(before, CAMERAS['S2C2'], before_front, folder / 'S2C2-before-ignition.jpg')
            if any(x is not None for x in before_front):
                raise ValueError('O detector apontou uma frente antes da ignição de S2.')
        for elapsed in range(0, duration+1, STEP):
            observed, stamps = [], {}
            for cam in cams:
                ts, image = observation(files[cam], times[cam], start+elapsed*1000, CAMERAS[cam])
                # At this acquisition cadence a gap in the raw frames makes
                # the following transition unobservable, even with lit endpoints.
                previous = rows[-1]['timestampsMs'][cam] if rows else None
                if previous is not None and ts is not None:
                    lo = np.searchsorted(times[cam], previous)
                    hi = np.searchsorted(times[cam], ts)
                    if abs(ts-previous-STEP*1000) > 500 or any(np.diff(times[cam][lo:hi+1]) > 500):
                        ts, image = None, None
                stamps[cam] = ts
                values = measure(image, CAMERAS[cam]) if image else [None]*ROWS
                if image and elapsed % (20 if run == 'S1' else 10) == 0:
                    plot_review(image, CAMERAS[cam], values, folder / f'{cam}-{elapsed:03d}.jpg')
                observed.append(values)
            if len(cams) == 2:
                a, b = stamps.values()
                if a is not None and b is not None and abs(a-b) > 160:
                    # Do not merge positions from different lighting pulses.
                    best = max(range(len(cams)), key=lambda i: sum(x is not None for x in observed[i]))
                    observed = [observed[best]]
                    stamps[cams[1-best]] = None
            if len(observed) == 2:
                front, differences = merge(*observed, 27)
                overlap.extend(differences)
            else:
                front = observed[0]
            rows.append({'timeS': elapsed, 'timestampsMs': stamps, 'frontMm': front})
    atomic_write(folder / f'{run}-observations.json', json_bytes(rows))
    return rows, overlap


def fit_rows(raw, overlapping):
    grids = [grid_front(row['frontMm']) for row in raw]
    valid = [i for i, row in enumerate(grids) if sum(x is not None for x in row) >= ROWS//2]
    if len(valid) < 10:
        raise ValueError('Cobertura insuficiente para ajuste e validação temporal.')
    first, last = valid[0], valid[-1]
    observed = monotone_fronts(grids[first:last+1])
    split = int((len(observed)-1)*0.7)
    fit, holdout = observed[:split+1], observed[split:]
    training, reserved = transition_counts(fit), transition_counts(holdout)
    if min(training['exposures'], reserved['exposures'], training['transitions'], reserved['transitions']) == 0:
        raise ValueError('Faltaram exposições ou avanços no ajuste ou na validação.')
    p = training['transitions']/training['exposures']
    validation = compare(holdout, simulate(holdout[0], p, len(holdout)-1))
    combination = count_neighborhoods(fit)
    seeds = range(1951, 1971)
    results = [evaluate(holdout, simulate_grid(holdout[0], combination['combinations'],
                        len(holdout)-1, seed)[0]) for seed in seeds]
    baseline = [evaluate(holdout, simulate_baseline(holdout[0], p, len(holdout)-1, seed))
                for seed in seeds]
    metrics = ('positionMaeMm', 'shapeMaeMm', 'simulatedSpeedMmS')

    def summarize(runs):
        return {key: {'mean': float(np.mean([row[key] for row in runs])),
                      'min': min(row[key] for row in runs), 'max': max(row[key] for row in runs)}
                for key in metrics}

    return {
        'grid': GRID, 'durationSeconds': (last-first)*STEP, 'initialFront': observed[0],
        'probability': p, 'train': training, 'validation': {**reserved, **validation},
        'combinations': combination['combinations'],
        'neighborhoodTraining': {'minimumExposures': 30, 'censoredCellSteps': combination['censored']},
        'contiguousValidation': contiguous_validation(holdout, combination['combinations'], p),
        'comparison': {'seedCount': len(results), 'observedSpeedMmS': results[0]['observedSpeedMmS'],
                       'neighborhood': summarize(results), 'baseline': summarize(baseline)},
        'diagnostics': {'coverage': sum(x is not None for row in observed for x in row)/(len(observed)*ROWS),
                        'overlapPoints': len(overlapping),
                        'medianOverlapErrorMm': float(np.median(overlapping)) if overlapping else None,
                        'splitTimeS': split*STEP, 'firstObservedSecond': raw[first]['timeS']},
    }


def accept(product, run):
    diagnostics = product['diagnostics']
    if run == 'S1' and (diagnostics['overlapPoints'] < MIN_VALIDATION_POINTS
                        or diagnostics['medianOverlapErrorMm'] > 27):
        raise ValueError('Concordância insuficiente na região em comum das câmeras.')
    if diagnostics['coverage'] < 0.70 or product['validation']['comparedCellTimes'] < MIN_VALIDATION_POINTS:
        raise ValueError('Cobertura ou validação temporal insuficiente.')
    chosen = product['contiguousValidation']
    observed = chosen['observedSpeedMmS']
    if (observed <= 0 or abs(chosen['simulatedSpeedMmS']-observed) > MAX_SPEED_ERROR_FRACTION*observed
            or chosen['positionMaeMm'] > MAX_POSITION_MAE_MM):
        raise ValueError('O modelo não reproduziu a posição e a velocidade no trecho reservado.')
    if run == 'S2':
        # The opposed front is comparatively flat. The lower-dimensional
        # model pools lateral configurations and is the one validated here.
        product['model'] = 'contiguous-with-longitudinal-fallback'
        product['longitudinal'] = {**product['train'], 'probability': product['probability']}
    else:
        product['model'] = 'contiguous-with-longitudinal-fallback'
    product['status'] = 'ready'


def main():
    manifest = json.loads(MANIFEST.read_bytes())
    for run in ('S1', 'S2'):
        product = {'schemaVersion': 2 if run == 'S1' else 1, 'sourceUrl': SOURCE, 'stepSeconds': STEP,
                   'experimentId': manifest['experiments'][run]['id'], 'status': 'unavailable',
                   'camera': 'S1C1 + S1C2' if run == 'S1' else 'S2C2',
                   'material': manifest['material'], 'conditions': manifest['conditions'],
                   'geometry': manifest['geometry'],
                   'provenance': {'manifestSha256': sha256(MANIFEST), 'registration': CAMERAS,
                                  'samplingWindow': WINDOWS[run],
                                  'review': 'Visual inspection of registered overlays; no independent pixel annotations.'}}
        try:
            raw, overlap = collect(run, manifest['assets'])
            product.update(fit_rows(raw, overlap))
            accept(product, run)
        except (ValueError, OSError, BadZipFile) as error:
            product['reason'] = str(error)
        atomic_write(PUBLIC / f'{SLUG}-{run.lower()}-neighbors.json', json_bytes(product))
        print(run, {k: product.get(k) for k in ('status', 'reason', 'probability', 'contiguousValidation')}, flush=True)


if __name__ == '__main__':
    main()
