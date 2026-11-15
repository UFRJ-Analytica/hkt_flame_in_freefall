"""Flame-front detection in the side-view video of BASS-II test B1, in pixels.

The two luminous sheets seen edge-on (one per side of the PMMA film) are treated as separate bands.
In each band and frame three families of detectors are applied (all configured in
data/bass2/b1/flamefront-config.json):

  A  intensity profile (NASA/TM-20210011385 §2.2.4 adapted to the side view): luminance averaged
     across the band -> profile I(x); leading edge = last x >= T reached from the peak in the
     propagation direction (sub-pixel crossing); peak = argmax of the smoothed profile;
  B  intensity segmentation: global threshold, Otsu or adaptive threshold, opening, connected
     components; the component holding the brightest pixel gives the front, length, area, centroid;
  C  colour: HSV value channel profile, and the extent of blue-dominant emission (B > k*R).

Nothing is filled in: a frame without a valid detection keeps NaN and a reason. Coordinates are
image pixels (x right, y down); see the config for the propagation sign. No millimetres here.

    python scripts/bass2/segment_b1.py            # all TS frames -> data/bass2/b1/flamefront-observations.csv
"""
from __future__ import annotations

import csv
import hashlib
import json
import math
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import overlay_bass2 as overlay  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
B1 = ROOT / 'data/bass2/b1'
CONFIG = B1 / 'flamefront-config.json'
TIMEBASE = B1 / 'timebase.json'
TIMEBASE_FRAMES = B1 / 'timebase-frames.csv'
OBSERVATIONS = B1 / 'flamefront-observations.csv'
PREVIEWS = ROOT / 'data/cache/bass2/previews/b1'
BANDS = ('upper', 'lower')
NAN = float('nan')


# ------------------------------------------------------------------ configuration and sources
def load_config(path: Path = CONFIG) -> dict:
    config = json.loads(path.read_text(encoding='utf-8'))
    validate_config(config)
    return config


def validate_config(config: dict, width: int = 720, height: int = 480) -> None:
    """Regions must lie inside the frame, below the overlay, and the bands must not overlap."""
    regions = config['regions']
    overlay_bottom = regions['overlay']['y'][1]
    for name in ('flame', 'ignitor', 'background'):
        (x0, x1), (y0, y1) = regions[name]['x'], regions[name]['y']
        if not (0 <= x0 < x1 < width and 0 <= y0 < y1 < height):
            raise ValueError(f'região {name} fora do quadro')
        if y0 <= overlay_bottom and name != 'background':
            raise ValueError(f'região {name} invade a sobreposição')
    flame_y = regions['flame']['y']
    spans = []
    for band in BANDS:
        y0, y1 = regions['bands'][band]['y']
        if not (flame_y[0] <= y0 < y1 <= flame_y[1]):
            raise ValueError(f'banda {band} fora da região da chama')
        spans.append((y0, y1))
    spans.sort()
    if spans[0][1] >= spans[1][0]:
        raise ValueError('as bandas se sobrepõem')
    if config['coordinates']['propagationSign'] not in (1, -1):
        raise ValueError('propagationSign deve ser 1 ou -1')


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def resolve_source(config: dict) -> dict:
    """The TS extracted from the B1 original-videos ZIP (hash-checked), else the MP4 with the frame offset."""
    timebase = json.loads(TIMEBASE.read_text(encoding='utf-8'))
    ts_info = timebase['sources']['ts']
    ts_path = ROOT / ts_info['path']
    if config['source']['preferred'] == 'ts' and ts_path.exists() and sha256(ts_path) == ts_info['sha256']:
        return {'kind': 'ts', 'path': ts_path, 'sha256': ts_info['sha256'], 'offset': 0}
    manifest = json.loads((ROOT / 'data/bass2/videos-manifest.json').read_text(encoding='utf-8'))
    entry = next(item for item in manifest['files'] if 'SAMPLE_147_TEST_B1.mp4' in item['name'] and item['status'] == 'available')
    path = ROOT / entry['path']
    if sha256(path) != entry['sha256']:
        raise ValueError('MP4 do B1 diverge do manifesto')
    return {'kind': 'mp4', 'path': path, 'sha256': entry['sha256'], 'offset': timebase['mp4ToTs']['offsetFrames'],
            'note': 'TS indisponível; MP4 usado com o deslocamento de quadros da fase P2'}


def read_video(source: dict) -> np.ndarray:
    """BGR frames indexed by ts_frame (the MP4 lead-in copies are dropped)."""
    import cv2

    capture = cv2.VideoCapture(str(source['path']))
    frames = []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(frame)
    capture.release()
    return np.stack(frames[source['offset']:])


def frame_times(path: Path = TIMEBASE_FRAMES) -> dict[int, tuple[float, float, str]]:
    """ts_frame -> (video time s, experiment time s from the fitted line, displayed clock)."""
    with path.open(encoding='utf-8') as stream:
        return {int(row['ts_frame']): (float(row['timestamp_video_s']), float(row['timestamp_experiment_fit_s']), row['clock_display_raw'])
                for row in csv.DictReader(stream)}


# ------------------------------------------------------------------------------ detectors
def luminance(frame: np.ndarray) -> np.ndarray:
    import cv2

    return cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY).astype(np.float32) if frame.ndim == 3 else frame.astype(np.float32)


def band_profile(image: np.ndarray, y_range: tuple[int, int], x_range: tuple[int, int], smoothing: int = 1) -> np.ndarray:
    """Mean over the band rows for each column (the NASA 'width-averaged intensity'), optionally smoothed."""
    y0, y1 = y_range
    x0, x1 = x_range
    profile = image[y0:y1 + 1, x0:x1 + 1].astype(np.float32).mean(axis=0)
    if smoothing > 1:
        kernel = np.ones(smoothing, np.float32) / smoothing
        padded = np.pad(profile, smoothing // 2, mode='edge')
        profile = np.convolve(padded, kernel, mode='valid')[:len(profile)]
    return profile


@dataclass
class Front:
    present: bool
    front: float = NAN          # leading edge, image x (sub-pixel)
    peak: float = NAN           # x of maximum intensity
    peak_value: float = NAN
    mean_value: float = NAN     # mean intensity of the above-threshold part of the profile
    trailing: float = NAN       # other end of the above-threshold run (length = |front - trailing|)
    length: float = NAN
    area: float = NAN
    centroid: float = NAN
    threshold: float = NAN
    confidence: str = 'none'
    reason: str = ''
    extra: dict = field(default_factory=dict)


def profile_front(profile: np.ndarray, x0: int, threshold: float, sign: int = 1, edge_margin: int = 3) -> Front:
    """Method A on one profile: run above the threshold that contains the peak, edge in the propagation direction."""
    if not np.isfinite(profile).all() or len(profile) < 3:
        return Front(False, threshold=threshold, reason='perfil inválido')
    k = int(np.argmax(profile))
    peak_value = float(profile[k])
    if peak_value < threshold:
        return Front(False, peak=x0 + k, peak_value=peak_value, threshold=threshold, reason='pico abaixo do limiar')
    above = profile >= threshold
    step = 1 if sign > 0 else -1
    j = k
    while 0 <= j + step < len(profile) and above[j + step]:
        j += step
    i = k
    while 0 <= i - step < len(profile) and above[i - step]:
        i -= step
    # Sub-pixel crossing between the last sample above and the first sample below the threshold.
    front = float(j)
    if 0 <= j + step < len(profile):
        a, b = profile[j], profile[j + step]
        front = j + step * (a - threshold) / (a - b) if a != b else float(j)
    run = profile[min(i, j):max(i, j) + 1]
    result = Front(True, front=x0 + front, peak=float(x0 + k), peak_value=peak_value, mean_value=float(run.mean()),
                   trailing=float(x0 + i), length=float(abs(j - i)), threshold=threshold)
    touches = (j + step < edge_margin) if sign < 0 else (j + step >= len(profile) - edge_margin)
    if touches:
        result.present, result.reason = False, 'frente no limite da ROI'
        return result
    contrast = peak_value / threshold
    result.confidence = 'high' if contrast >= 2 and result.length >= 10 else 'low'
    return result


def segment_band(image: np.ndarray, y_range: tuple[int, int], x_range: tuple[int, int], mode: str, params: dict,
                 sign: int = 1, edge_margin: int = 3) -> Front:
    """Method B: binary mask in the band, opening, component with the brightest pixel."""
    import cv2

    y0, y1 = y_range
    x0, x1 = x_range
    patch = image[y0:y1 + 1, x0:x1 + 1].astype(np.float32)
    patch8 = np.clip(patch, 0, 255).astype(np.uint8)
    if mode == 'global':
        threshold = float(params['globalThreshold'])
        mask = patch8 >= threshold
    elif mode == 'otsu':
        if patch8.max() < params.get('globalThreshold', 50) / 2:
            return Front(False, threshold=NAN, reason='banda sem emissão (Otsu indefinido)')
        threshold, _ = cv2.threshold(patch8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        threshold = float(threshold)
        mask = patch8 > threshold
    elif mode == 'adaptive':
        adaptive = cv2.adaptiveThreshold(patch8, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY,
                                         params['adaptiveBlock'], params['adaptiveC'])
        threshold = NAN
        mask = (adaptive > 0) & (patch8 >= params['globalThreshold'] / 2)
    else:
        raise ValueError(mode)
    kernel = np.ones((params['openKernel'], params['openKernel']), np.uint8)
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, kernel)
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if count <= 1:
        return Front(False, threshold=threshold, reason='nenhum componente acima do limiar')
    brightest = np.unravel_index(int(np.argmax(np.where(mask > 0, patch, -1))), patch.shape)
    label = labels[brightest]
    if label == 0 or stats[label, cv2.CC_STAT_AREA] < params['minArea']:
        return Front(False, threshold=threshold, reason='componente principal pequeno demais')
    left = stats[label, cv2.CC_STAT_LEFT]
    right = left + stats[label, cv2.CC_STAT_WIDTH] - 1
    front, trailing = (right, left) if sign > 0 else (left, right)
    touches = right >= patch.shape[1] - edge_margin if sign > 0 else left < edge_margin
    pixels = patch[labels == label]
    result = Front(not touches, front=float(x0 + front), peak=float(x0 + brightest[1]), peak_value=float(patch.max()),
                   mean_value=float(pixels.mean()), trailing=float(x0 + trailing), length=float(right - left),
                   area=float(stats[label, cv2.CC_STAT_AREA]), centroid=float(x0 + centroids[label][0]),
                   threshold=threshold, confidence='high' if stats[label, cv2.CC_STAT_AREA] >= 5 * params['minArea'] else 'low',
                   reason='' if not touches else 'frente no limite da ROI', extra={'components': int(count - 1)})
    return result


def colour_fronts(frame: np.ndarray, y_range: tuple[int, int], x_range: tuple[int, int], params: dict,
                  sign: int = 1, smoothing: int = 1, edge_margin: int = 3) -> dict[str, Front]:
    """Method C: HSV value-channel profile, and the extent of blue-dominant emission."""
    if frame.ndim != 3:
        raise ValueError('o método C precisa de uma imagem colorida')
    y0, y1 = y_range
    x0, x1 = x_range
    patch = frame[y0:y1 + 1, x0:x1 + 1].astype(np.float32)
    value = patch.max(axis=2)                                   # HSV V = max(B, G, R)
    value_profile = band_profile(value, (0, value.shape[0] - 1), (0, value.shape[1] - 1), smoothing)
    by_value = profile_front(value_profile, x0, params['valueThreshold'], sign, edge_margin)
    blue, red = patch[..., 0], patch[..., 2]
    blue_mask = (blue >= params['blueMinValue']) & (blue > params['blueDominance'] * red)
    columns = np.flatnonzero(blue_mask.sum(axis=0) >= 2)
    if len(columns):
        front = columns.max() if sign > 0 else columns.min()
        trailing = columns.min() if sign > 0 else columns.max()
        by_blue = Front(True, front=float(x0 + front), trailing=float(x0 + trailing), length=float(columns.max() - columns.min()),
                        area=float(blue_mask.sum()), threshold=params['blueMinValue'], confidence='low',
                        extra={'bluePixels': int(blue_mask.sum())})
    else:
        by_blue = Front(False, threshold=params['blueMinValue'], reason='sem emissão azul dominante')
    return {'value': by_value, 'blue': by_blue}


def detect_frame(frame: np.ndarray, config: dict, band: str, threshold: float | None = None,
                 band_shift: int = 0, half_width_delta: int = 0) -> dict[str, Front]:
    """All detectors for one band of one frame. Shifts/width changes are for the ROI sensitivity study."""
    regions, processing = config['regions'], config['processing']
    sign = config['coordinates']['propagationSign']
    y0, y1 = regions['bands'][band]['y']
    y0, y1 = y0 + band_shift - half_width_delta, y1 + band_shift + half_width_delta
    if y1 <= y0:
        raise ValueError('banda vazia')
    x_range = tuple(regions['flame']['x'])
    margin = processing['roiEdgeMarginPx']
    gray = luminance(frame)
    primary = processing['methodA']['primaryThreshold'] if threshold is None else threshold
    profile = band_profile(gray, (y0, y1), x_range, processing['profileSmoothingPx'])
    results = {'A': profile_front(profile, x_range[0], primary, sign, margin)}
    params_b = {**processing['methodB'], 'globalThreshold': primary}
    for mode in ('global', 'otsu', 'adaptive'):
        results[f'B_{mode}'] = segment_band(gray, (y0, y1), x_range, mode, params_b, sign, margin)
    if frame.ndim == 3:
        colour = colour_fronts(frame, (y0, y1), x_range, {**processing['methodC'], 'valueThreshold': primary}, sign,
                               processing['profileSmoothingPx'], margin)
        results['C_value'], results['C_blue'] = colour['value'], colour['blue']
    return results


# ------------------------------------------------------------------------------ output
OBS_COLUMNS = ['ts_frame', 'band', 'timestamp_video_s', 'timestamp_experiment_s', 'clock_display_raw']
METHOD_FIELDS = ('present', 'front_px', 'peak_px', 'peak_value', 'mean_value', 'length_px', 'area_px', 'centroid_px',
                 'threshold', 'confidence', 'reason')
METHODS = ('A', 'B_global', 'B_otsu', 'B_adaptive', 'C_value', 'C_blue')


def fmt(value: float) -> str:
    return '' if value is None or (isinstance(value, float) and math.isnan(value)) else f'{value:.3f}'


def observation_rows(frames: np.ndarray, config: dict, times: dict) -> list[dict]:
    rows = []
    for index, frame in enumerate(frames):
        video_s, experiment_s, clock = times[index]
        for band in BANDS:
            row = {'ts_frame': index, 'band': band, 'timestamp_video_s': f'{video_s:.4f}',
                   'timestamp_experiment_s': f'{experiment_s:.3f}', 'clock_display_raw': clock}
            for method, result in detect_frame(frame, config, band).items():
                values = {'present': int(result.present), 'front_px': fmt(result.front) if result.present else '',
                          'peak_px': fmt(result.peak), 'peak_value': fmt(result.peak_value), 'mean_value': fmt(result.mean_value),
                          'length_px': fmt(result.length) if result.present else '', 'area_px': fmt(result.area) if result.present else '',
                          'centroid_px': fmt(result.centroid) if result.present else '', 'threshold': fmt(result.threshold),
                          'confidence': result.confidence if result.present else 'none', 'reason': result.reason}
                row.update({f'{method}_{name}': value for name, value in values.items()})
            rows.append(row)
    return rows


def main() -> int:
    config = load_config()
    source = resolve_source(config)
    frames = read_video(source)
    times = frame_times()
    if len(frames) != len(times):
        raise ValueError(f'{len(frames)} quadros decodificados, {len(times)} na base temporal: índices não conferem')
    rows = observation_rows(frames, config, times)
    columns = OBS_COLUMNS + [f'{method}_{name}' for method in METHODS for name in METHOD_FIELDS]
    with OBSERVATIONS.open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    print(json.dumps({'source': source['kind'], 'sha256': source['sha256'], 'frames': len(frames), 'rows': len(rows),
                      'output': OBSERVATIONS.relative_to(ROOT).as_posix()}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
