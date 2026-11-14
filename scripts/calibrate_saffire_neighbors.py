"""Fit and evaluate the neighborhood model from the recorded SAFFIRE front."""
from __future__ import annotations

import json
from contextlib import ExitStack
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import numpy as np
from PIL import Image, ImageDraw

from calibrate_saffire import COLUMNS, DIAGNOSTICS, DX, ROWS, RUN, STEP, WIDTH, ROW_CENTRES, grid_front, monotone_fronts
from ingest_saffire import CACHE, MANIFEST, SLUG, archive_frames, sha256
from sync_nasa import ROOT, atomic_write, json_bytes

SOURCE = ROOT / 'public/data/saffire/psi-98-s1.json'
OUTPUT = ROOT / 'public/data/saffire/psi-98-s1-neighbors.json'
MIN_EXPOSURES = 30


def make_grid(front: list[int | None], columns: int = COLUMNS) -> list[list[int | None]]:
    return [[None if value is None else int(x < value) for x in range(columns)] for value in front]


def neighbors(grid: list[list[int | None]], row: int, col: int) -> str | None:
    rows, columns = len(grid), len(grid[0])
    def state(y: int, x: int) -> int | None:
        return grid[y][x] if 0 <= y < rows and 0 <= x < columns else 0
    values = (state(row, col - 1), state(row - 1, col), state(row + 1, col))
    if None in values:
        return None
    return ''.join(str(value) for value in values)


def count_neighborhoods(fronts: list[list[int | None]], columns: int = COLUMNS) -> dict:
    combinations = {f'{n:03b}': {'exposures': 0, 'transitions': 0} for n in range(8)}
    censored = 0
    for old, new in zip(fronts, fronts[1:]):
        before, after = make_grid(old, columns), make_grid(new, columns)
        for y in range(len(before)):
            for x in range(columns):
                if before[y][x] != 0:
                    continue
                key = neighbors(before, y, x)
                if key is None or after[y][x] is None:
                    censored += 1
                    continue
                if key == '000':
                    continue
                combinations[key]['exposures'] += 1
                combinations[key]['transitions'] += int(after[y][x] == 1)
    for key, value in combinations.items():
        count = value['exposures']
        value['probability'] = value['transitions'] / count if count >= MIN_EXPOSURES else None
        value['reason'] = ('nenhum vizinho ativo' if key == '000' else
                           'sem exposições' if count == 0 else
                           f'menos de {MIN_EXPOSURES} exposições' if count < MIN_EXPOSURES else None)
    return {'combinations': combinations, 'censored': censored}


def simulate_grid(front: list[int | None], combinations: dict, steps: int, seed: int,
                  columns: int = COLUMNS) -> tuple[list, list[int], list[int]]:
    grid = make_grid(front, columns)
    history = [grid]
    blocked = [0]
    eligible = [0]
    for _ in range(steps):
        previous = history[-1]
        next_grid = [row[:] for row in previous]
        skipped = 0
        candidates = 0
        for y, row in enumerate(previous):
            for x, cell in enumerate(row):
                if cell != 0:
                    continue
                key = neighbors(previous, y, x)
                if key is None or key == '000':
                    continue
                candidates += 1
                probability = combinations[key]['probability']
                if probability is None:
                    skipped += 1
                    continue
                seed = (1664525 * seed + 1013904223) & 0xffffffff
                if seed / 2**32 < probability:
                    next_grid[y][x] = 1
        history.append(next_grid)
        blocked.append(skipped)
        eligible.append(candidates)
    return history, blocked, eligible


def simulate_baseline(front: list[int | None], probability: float, steps: int, seed: int) -> list:
    history = [front]
    for _ in range(steps):
        new = []
        for index in history[-1]:
            if index is not None and 0 < index < COLUMNS:
                seed = (1664525 * seed + 1013904223) & 0xffffffff
                index += int(seed / 2**32 < probability)
            new.append(index)
        history.append(new)
    return [make_grid(row) for row in history]


def simulate_contiguous(front, combinations, probability, steps, seed):
    """Advance at the first intact cell in each row; lateral states modulate its rate."""
    history = [make_grid(front)]
    for _ in range(steps):
        previous = history[-1]
        following = [row[:] for row in previous]
        for y, row in enumerate(previous):
            x = next((i for i, cell in enumerate(row) if cell == 0), None)
            if x is None or x == 0 or row[x-1] != 1:
                continue
            key = neighbors(previous, y, x)
            joint = combinations[key]['probability'] if key else None
            seed = (1664525 * seed + 1013904223) & 0xffffffff
            if seed / 2**32 < (probability if joint is None else joint):
                following[y][x] = 1
        history.append(following)
    return history


def contiguous_validation(observed, combinations, probability):
    runs = [evaluate(observed, simulate_contiguous(observed[0], combinations, probability, len(observed)-1, seed))
            for seed in range(1951, 1971)]
    return {key: float(np.mean([run[key] for run in runs])) for key in
            ('positionMaeMm', 'shapeMaeMm', 'observedSpeedMmS', 'simulatedSpeedMmS')} | {'seedCount': len(runs)}


def front_positions(grid: list[list[int | None]]) -> list[int | None]:
    return [None if any(value is None for value in row) else max((i + 1 for i, value in enumerate(row) if value == 1), default=0)
            for row in grid]


def evaluate(observed: list, simulated: list) -> dict:
    distances, shapes, times, obs_positions, sim_positions = [], [], [], [], []
    for step, (actual, grid) in enumerate(zip(observed, simulated, strict=True)):
        predicted = front_positions(grid)
        pairs = [(a * DX, b * DX) for a, b in zip(actual, predicted, strict=True)
                 if a is not None and b is not None]
        if len(pairs) < 2:
            continue
        points = np.array(pairs, dtype=float)
        a, b = points[:, 0], points[:, 1]
        distances.extend(abs(a - b))
        shapes.extend(abs((a - np.mean(a)) - (b - np.mean(b))))
        times.append(step * STEP)
        obs_positions.append(np.median(a))
        sim_positions.append(np.median(b))
    if len(times) < 3:
        raise ValueError('Poucas observações comparáveis no trecho reservado.')
    return {
        'positionMaeMm': float(np.mean(distances)),
        'shapeMaeMm': float(np.mean(shapes)),
        'observedSpeedMmS': float(np.polyfit(times, obs_positions, 1)[0]),
        'simulatedSpeedMmS': float(np.polyfit(times, sim_positions, 1)[0]),
        'comparedCellTimes': len(distances),
    }


def lateral_overlays(observations: list[dict], registration: dict) -> list[dict]:
    """Highlight one neighboring-row pair with a notable front offset in each third."""
    manifest = json.loads(MANIFEST.read_bytes())
    records = []
    with ExitStack() as stack:
        entries = {'S1C1': {}, 'S1C2': {}}
        for asset in manifest['assets']:
            if 'camera' not in asset or asset['status'] != 'available':
                continue
            path = CACHE / SLUG / asset['name']
            archive = stack.enter_context(ZipFile(path))
            for timestamp, name in archive_frames(path, asset['camera']):
                entries[asset['camera']].setdefault(timestamp, (archive, name))
        for third in range(3):
            subset = observations[third * len(observations) // 3:(third + 1) * len(observations) // 3]
            candidates = []
            for frame in subset:
                for y in range(1, ROWS - 2):
                    a, b = frame['frontMm'][y:y + 2]
                    if a is not None and b is not None:
                        candidates.append((abs(a - b), frame, y))
            for difference, frame, y in sorted(candidates, key=lambda item: item[0], reverse=True):
                selected = None
                for camera_id, camera in registration['cameras'].items():
                    timestamp = frame['cameraTimestampsMs'][camera_id]
                    positions = [camera['edgeX'] - (frame['frontMm'][i] - camera['edgeMm']) * camera['pixelsPerMm']
                                 for i in (y, y + 1)]
                    if timestamp in entries[camera_id] and all(camera['visibleX'][0] <= x <= camera['visibleX'][1] for x in positions):
                        selected = (camera_id, camera, timestamp, positions)
                        break
                if not selected:
                    continue
                camera_id, camera, timestamp, positions = selected
                archive, name = entries[camera_id][timestamp]
                with Image.open(BytesIO(archive.read(name))) as original:
                    image = original.convert('RGB')
                draw = ImageDraw.Draw(image)
                for row, x in zip((y, y + 1), positions, strict=True):
                    yy = camera['topAtX750'] + (camera['bottomAtX750'] - camera['topAtX750']) * ROW_CENTRES[row] / WIDTH
                    yy += camera['slopeY'] * (x - 750)
                    draw.ellipse((x - 12, yy - 12, x + 12, yy + 12), outline='#ff00ff', width=5)
                image.thumbnail((1000, 720))
                output = DIAGNOSTICS / f'lateral-{third + 1}-{camera_id}-{timestamp}.jpg'
                image.save(output, quality=90)
                records.append({'timeS': frame['timeS'], 'camera': camera_id, 'timestampMs': timestamp,
                                'rows': [y, y + 1], 'differenceMm': difference, 'image': output.name})
                break
    return records


def main() -> None:
    original = json.loads(SOURCE.read_bytes())
    if original.get('status') != 'ready':
        raise ValueError('O artefato longitudinal original não está disponível.')
    observations_path = DIAGNOSTICS / 'observations.json'
    if sha256(observations_path) != original['provenance']['observationsSha256']:
        raise ValueError('As observações não correspondem ao artefato longitudinal.')
    if sha256(MANIFEST) != original['provenance']['manifestSha256']:
        raise ValueError('O manifesto mudou após a extração das observações.')
    raw = json.loads(observations_path.read_bytes())
    # The original sample window starts at registration phaseAnchorMs, not the nearby camera timestamp.
    registration = json.loads((MANIFEST.parent / 'registration.json').read_bytes())
    offset = (original['startTimestampMs'] - registration['phaseAnchorMs']) // 1000
    selected = [row for row in raw if offset <= row['timeS'] <= offset + original['durationSeconds']]
    observed = monotone_fronts([grid_front(row['frontMm']) for row in selected])
    split = int(original['diagnostics']['splitTimeS'] / STEP)
    train = count_neighborhoods(observed[:split + 1])
    holdout = count_neighborhoods(observed[split:])
    overlays = lateral_overlays(selected, registration)
    if len(overlays) < 3:
        raise ValueError('Não foi possível criar os três quadros de conferência lateral.')
    combinations = train['combinations']
    baseline_probability = original['probability']
    validation = []
    for seed in range(1951, 1971):
        grids, blocked, eligible = simulate_grid(observed[split], combinations, len(observed) - split - 1, seed)
        baseline = simulate_baseline(observed[split], baseline_probability, len(observed) - split - 1, seed)
        validation.append({'seed': seed, 'neighborhood': evaluate(observed[split:], grids),
                           'baseline': evaluate(observed[split:], baseline),
                           'blockedCellSteps': sum(blocked), 'eligibleCellSteps': sum(eligible)})
    def summary(model: str) -> dict:
        keys = ('positionMaeMm', 'shapeMaeMm', 'simulatedSpeedMmS')
        return {key: {'mean': float(np.mean([v[model][key] for v in validation])),
                      'min': float(np.min([v[model][key] for v in validation])),
                      'max': float(np.max([v[model][key] for v in validation]))} for key in keys}
    product = {
        **original, 'schemaVersion': 2, 'model': 'neighborhood', 'combinations': combinations,
        'neighborhoodTraining': {'censoredCellSteps': train['censored'], 'minimumExposures': MIN_EXPOSURES},
        'contiguousValidation': contiguous_validation(observed[split:], combinations, baseline_probability),
        'neighborhoodHoldout': holdout,
        'lateralOverlays': overlays,
        'comparison': {'seedCount': len(validation), 'observedSpeedMmS': validation[0]['baseline']['observedSpeedMmS'],
                       'neighborhood': summary('neighborhood'), 'baseline': summary('baseline'),
                       'blockedCellStepsMean': float(np.mean([v['blockedCellSteps'] for v in validation])),
                       'blockedFraction': sum(v['blockedCellSteps'] for v in validation) / sum(v['eligibleCellSteps'] for v in validation),
                       'runs': validation},
        'provenance': {**original['provenance'], 'baselineSha256': sha256(SOURCE)},
    }
    atomic_write(OUTPUT, json_bytes(product))
    print(json.dumps({'combinations': combinations, 'comparison': {k: v for k, v in product['comparison'].items() if k != 'runs'}}, indent=2))


if __name__ == '__main__':
    main()
