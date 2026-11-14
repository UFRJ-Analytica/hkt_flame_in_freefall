"""Extract an irreversible downstream transition model from mapped SAFFIRE JPEGs."""
from __future__ import annotations

import argparse
from bisect import bisect_left
from contextlib import ExitStack
from io import BytesIO
import json
from pathlib import Path
from zipfile import BadZipFile, ZipFile

import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import median_filter

from ingest_saffire import CACHE, MANIFEST, RUN, SLUG, archive_frames, sha256
from sync_nasa import ROOT, atomic_write, json_bytes

REGISTRATION = MANIFEST.with_name('registration.json')
PUBLIC = ROOT / f'public/data/saffire/{SLUG}.json'
DIAGNOSTICS = CACHE / SLUG / 'analysis'
LENGTH, WIDTH = 940, 406
DX, DY, STEP = 10, 20, 2
COLUMNS, ROWS = 94, 21
REFERENCE_SPEED = 1.8
ROW_CENTRES = (np.arange(ROWS) * DY + np.minimum((np.arange(ROWS) + 1) * DY, WIDTH)) / 2


def nearest(times: list[int], timestamp: int, tolerance: int) -> int | None:
    idx = bisect_left(times, timestamp)
    candidates = times[max(idx - 1, 0):idx + 1]
    value = min(candidates, key=lambda x: abs(x - timestamp), default=None)
    return value if value is not None and abs(value - timestamp) <= tolerance else None


def position_mm(camera: dict, px: float) -> float:
    return camera['edgeMm'] + (camera['edgeX'] - px) / camera['pixelsPerMm']


def scan_green(image: Image.Image, y: np.ndarray, x: np.ndarray) -> np.ndarray:
    rgb = np.asarray(image.convert('RGB'))
    # Three-pixel median guards against isolated reflections and JPEG artifacts.
    bands = [rgb[np.rint(y + dy).astype(int), x, 1] for dy in (-3, 0, 3)]
    return median_filter(np.median(bands, axis=0), size=13)


def boundary(profile: np.ndarray) -> int | None:
    # Frames without green illumination, or without both regions, are censored.
    light = float(np.percentile(profile, 90))
    dark = float(np.percentile(profile, 15))
    if light < 95 or light - dark < 55:
        return None
    bright = profile >= (dark + 0.43 * (light - dark))
    transitions = np.flatnonzero(bright[:-1] & ~bright[1:]) + 1
    for index in transitions:
        if index < 40 or index > len(bright) - 40:
            continue
        if np.mean(bright[:index]) >= .90 and np.mean(~bright[index:]) >= .90:
            return int(index)
    return None


def measure(image: Image.Image, camera: dict) -> list[float | None]:
    left, right = camera['visibleX']
    px = np.arange(left, right + 1)
    result = []
    for centre in ROW_CENTRES:
        y_at_750 = camera['topAtX750'] + (camera['bottomAtX750'] - camera['topAtX750']) * centre / WIDTH
        profile = scan_green(image, y_at_750 + camera['slopeY'] * (px - 750), px)
        edge = boundary(profile)
        value = position_mm(camera, left + edge) if edge is not None else None
        result.append(value if value is not None and 0 <= value <= LENGTH else None)
    return result


def merge(a: list, b: list, tolerance: float) -> tuple[list, list[float]]:
    values, differences = [], []
    for x, y in zip(a, b, strict=True):
        if x is not None and y is not None:
            difference = abs(x - y)
            differences.append(difference)
            values.append((x + y) / 2 if difference <= tolerance else None)
        else:
            values.append(x if x is not None else y)
    return values, differences


def grid_front(row: list[float | None]) -> list[int | None]:
    return [None if value is None else min(COLUMNS, max(0, int((value + DX / 2) // DX))) for value in row]


def transition_counts(fronts: list[list[int | None]]) -> dict:
    counts = dict(exposures=0, transitions=0, jumps=0, gaps=0, retreats=0)
    for old, new in zip(fronts, fronts[1:]):
        for left, right in zip(old, new, strict=True):
            if left is None or right is None:
                counts['gaps'] += 1
            elif right < left:
                counts['retreats'] += 1
            elif 0 < left < COLUMNS:
                counts['exposures'] += 1
                counts['transitions'] += int(right > left)
                counts['jumps'] += int(right > left + 1)
    return counts


def monotone_fronts(fronts: list[list[int | None]]) -> list[list[int | None]]:
    previous = np.zeros(ROWS, dtype=int)
    clean = []
    for row in fronts:
        result = []
        for index, value in enumerate(row):
            if value is not None:
                # Recede by a cell because of image uncertainty: censor until it recovers.
                if value >= previous[index]:
                    previous[index] = value
                else:
                    value = None
            result.append(value)
        clean.append(result)
    return clean


def simulate(front: list[int | None], probability: float, steps: int) -> list[list[int | None]]:
    seed = 1951
    result = [front]
    for _ in range(steps):
        next_front = []
        for index in result[-1]:
            if index is not None and 0 < index < COLUMNS:
                seed = (1664525 * seed + 1013904223) & 0xffffffff
                index += int(seed / 2**32 < probability)
            next_front.append(index)
        result.append(next_front)
    return result


def compare(observed: list, simulated: list) -> dict:
    differences, times, observed_positions, simulated_positions = [], [], [], []
    for step, (actual, model) in enumerate(zip(observed, simulated, strict=True)):
        pairs = [(a, b) for a, b in zip(actual, model, strict=True) if a is not None and b is not None]
        if not pairs:
            continue
        x, y = np.array(pairs, dtype=float).T * DX
        differences.extend(abs(x - y))
        times.append(step * STEP)
        observed_positions.append(float(np.median(x)))
        simulated_positions.append(float(np.median(y)))
    if len(times) < 3 or not differences:
        raise ValueError('Há poucas posições comparáveis na checagem temporal.')
    return {
        'positionMaeMm': float(np.mean(differences)),
        'observedSpeedMmS': float(np.polyfit(times, observed_positions, 1)[0]),
        'simulatedSpeedMmS': float(np.polyfit(times, simulated_positions, 1)[0]),
        'comparedCellTimes': len(differences),
        'trajectory': [{'timeS': t, 'observedMm': x, 'simulatedMm': y}
                       for t, x, y in zip(times, observed_positions, simulated_positions, strict=True)],
    }


def camera_checks(files: dict, setup: dict, output: Path) -> dict:
    errors = []
    for annotation in setup['annotations']:
        camera_id, timestamp = annotation['camera'], annotation['timestampMs']
        image = read_frame(files[camera_id][timestamp])
        camera = setup['cameras'][camera_id]
        left, right = camera['visibleX']
        pixels = np.arange(left, right + 1)
        draw = ImageDraw.Draw(image)
        for x, y in annotation['pointsPx']:
            predicted = boundary(scan_green(image, y + camera['slopeY'] * (pixels - x), pixels))
            draw.ellipse((x - 10, y - 10, x + 10, y + 10), outline='#ffcc48', width=4)
            if predicted is not None:
                detected = left + predicted
                errors.append(abs(detected - x) / camera['pixelsPerMm'])
                draw.line((detected, y - 18, detected, y + 18), fill='#ed55ff', width=4)
        image.thumbnail((850, 620))
        image.save(output / f'{camera_id}-{timestamp}.jpg', quality=90)
    return {'annotatedPoints': sum(len(row['pointsPx']) for row in setup['annotations']),
            'matchedPoints': len(errors), 'maeMm': float(np.mean(errors)) if errors else None}


def read_frame(entry: tuple[ZipFile, str]) -> Image.Image:
    archive, member = entry
    with Image.open(BytesIO(archive.read(member))) as image:
        return image.convert('RGB')


def calibrate(manifest: dict, setup: dict, output: Path) -> dict:
    if manifest['experimentId'] != setup['experimentId'] or manifest['experimentId'] != RUN:
        raise ValueError('Os metadados e o registro de câmeras pertencem a ensaios diferentes.')
    files: dict[str, dict] = {'S1C1': {}, 'S1C2': {}}
    assets = [asset for asset in manifest['assets'] if 'camera' in asset]
    if len(assets) != 7 or any(asset['status'] != 'available' for asset in assets):
        raise ValueError('As sete partes de imagens oficiais precisam estar disponíveis.')
    with ExitStack() as stack:
        for asset in assets:
            path = CACHE / SLUG / asset['name']
            if sha256(path) != asset['sha256']:
                raise ValueError(f'Hash divergente, confira a ingestão de {path.name}.')
            camera_id = asset['camera']
            archive = stack.enter_context(ZipFile(path))
            for timestamp, name in archive_frames(path, camera_id):
                # Some officially listed parts duplicate the same sequence.
                first = files[camera_id].setdefault(timestamp, (archive, name))
                if first[0].getinfo(first[1]).CRC != archive.getinfo(name).CRC:
                    raise ValueError(f'Imagens diferentes no mesmo timestamp de {camera_id}.')
        times = {camera: sorted(entries) for camera, entries in files.items()}
        checks = camera_checks(files, setup, output)
        if checks['matchedPoints'] < 15 or checks['maeMm'] is None or checks['maeMm'] > 15:
            raise ValueError(f'Detecção não passou na verificação das anotações: {checks}.')
        results, overlaps, raw = [], [], []
        for t in range(0, setup['durationSeconds'] + 1, STEP):
            target = setup['phaseAnchorMs'] + t * 1000
            readings = []
            selected = {}
            for camera_id, camera in setup['cameras'].items():
                timestamp = nearest(times[camera_id], target, setup['maximumTimestampErrorMs'])
                selected[camera_id] = timestamp
                readings.append(measure(read_frame(files[camera_id][timestamp]), camera)
                                if timestamp is not None else [None] * ROWS)
            front, overlaps_mm = merge(*readings, setup['maximumCameraDifferenceMm'])
            raw.append({'timeS': t, 'cameraTimestampsMs': selected, 'frontMm': front})
            overlaps.extend(overlaps_mm)
            results.append(grid_front(front))
    atomic_write(output / 'observations.json', json_bytes(raw))
    if len(overlaps) < 21 or float(np.median(overlaps)) > setup['maximumCameraDifferenceMm']:
        raise ValueError('As câmeras não apresentaram concordância suficiente na passagem da frente.')
    acceptable = [i for i, row in enumerate(results) if sum(x is not None for x in row) >= ROWS // 2]
    if len(acceptable) < 10:
        raise ValueError('Cobertura insuficiente da frente no intervalo selecionado.')
    start, stop = acceptable[0], acceptable[-1]
    raw_fronts = results[start:stop + 1]
    observed = monotone_fronts(raw_fronts)
    split = int((len(observed) - 1) * 0.7)
    train = transition_counts(observed[:split + 1])
    held_out = transition_counts(observed[split:])
    if not train['exposures'] or not held_out['exposures']:
        raise ValueError('Faltaram exposições válidas no ajuste ou no trecho reservado.')
    probability = train['transitions'] / train['exposures']
    evaluation = compare(observed[split:], simulate(observed[split], probability, len(observed) - split - 1))
    observed_trajectory = []
    for step, front in enumerate(raw[start:stop + 1]):
        visible = [x for x in front['frontMm'] if x is not None]
        observed_trajectory.append({
            'timeS': step * STEP,
            'frontMedianMm': float(np.median(visible)) if visible else None,
            'visibleRows': len(visible),
        })
    return {
        'schemaVersion': 1, 'experimentId': RUN, 'status': 'ready', 'sourceUrl': manifest['sourceUrl'],
        'material': manifest['material'], 'geometry': manifest['geometry'], 'conditions': manifest['conditions'],
        'grid': {'lengthMm': LENGTH, 'widthMm': WIDTH, 'dxMm': DX, 'dyMm': DY, 'columns': COLUMNS, 'rows': ROWS},
        'transition': {'from': 'intact', 'to': 'front-reached', 'direction': 'downstream'},
        'stepSeconds': STEP, 'durationSeconds': (stop - start) * STEP,
        'startTimestampMs': setup['phaseAnchorMs'] + start * STEP * 1000,
        'initialFront': observed[0], 'probability': probability,
        'train': train, 'validation': {**held_out, **evaluation},
        'observedTrajectory': observed_trajectory,
        'referenceSpeedMmS': REFERENCE_SPEED,
        'diagnostics': {'annotation': checks, 'overlapPoints': len(overlaps),
                        'medianOverlapErrorMm': float(np.median(overlaps)),
                        'rawCounts': transition_counts(raw_fronts),
                        'coverage': sum(x is not None for row in observed for x in row) / (len(observed) * ROWS),
                        'splitTimeS': split * STEP,
                        'uniqueFramesByCamera': {key: len(value) for key, value in files.items()}},
        'provenance': {'manifestSha256': sha256(MANIFEST), 'registrationSha256': sha256(REGISTRATION),
                       'observationsSha256': sha256(output / 'observations.json')},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--experiment', default=RUN, choices=[RUN])
    parser.parse_args()
    DIAGNOSTICS.mkdir(parents=True, exist_ok=True)
    try:
        product = calibrate(json.loads(MANIFEST.read_bytes()), json.loads(REGISTRATION.read_bytes()), DIAGNOSTICS)
    except (ValueError, KeyError, OSError, BadZipFile) as error:
        product = {'schemaVersion': 1, 'experimentId': RUN, 'status': 'unavailable', 'reason': str(error)}
    atomic_write(PUBLIC, json_bytes(product))
    if product['status'] == 'ready':
        print(f"{RUN}: {product['probability']:.1%} em {STEP} s, "
              f"erro médio de {product['validation']['positionMaeMm']:.1f} mm")
    else:
        print(product['reason'])
    return int(product['status'] != 'ready')


if __name__ == '__main__':
    raise SystemExit(main())
