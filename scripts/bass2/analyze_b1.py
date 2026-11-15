"""Pixel-space velocity of the B1 flame fronts: regression, uncertainty, sensitivity, reference comparison.

Inputs (all produced earlier in this branch):
  data/bass2/b1/flamefront-config.json     regions, windows, parameters
  data/bass2/b1/flamefront-observations.csv  per-frame detections (segment_b1.py)
  data/bass2/b1/flamefront-tracks.csv      gated tracks (track_b1.py)
  data/bass2/b1/annotations/b1-manual-annotations.csv  visual reference (annotate_b1.py)
  data/bass2/b1/timebase-frames.csv, registration.json (P2)

What it does, separately for each band and each front definition:
  * x_f(t) = b0 + b1 t by ordinary least squares over the stable window, t = experiment time (fitted clock);
  * R², residuals, lag-1 autocorrelation and Durbin-Watson of the residuals;
  * 95% intervals for b1 from a moving-block bootstrap of (t, x) pairs (blocks of 0.5, 1 and 2 s) and,
    as a cross-check, a Newey-West (HAC) standard error; the naive OLS error is reported but not used;
  * local slopes in sliding windows, half-window and trimmed-window slopes (stability);
  * re-detection with every threshold of the config (sensitivity) and with shifted / widened bands (ROI);
  * agreement with the visual reference annotations (MAE, RMSE, bias, max, coverage, rejection);
  * the same detector on the PSI MP4 (re-encode) to check that the source does not change the result.
Writes data/bass2/b1/flamefront-pixel.json and diagnostic figures (cache; small copies in docs/research/img).

Velocities are in px/s. The published 2.2 mm/s is recorded as a reference only: without a validated
spatial registration (registration.json) no conversion and no quantitative comparison is made.

    python scripts/bass2/analyze_b1.py            # analysis + figures + diagnostic video
    python scripts/bass2/analyze_b1.py --no-media # analysis only
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import annotate_b1 as annotate  # noqa: E402
import calibrate_b1 as calibrate  # noqa: E402
import overlay_bass2 as overlay  # noqa: E402
import segment_b1 as segment  # noqa: E402
import track_b1 as track  # noqa: E402

ROOT = segment.ROOT
RESULT = segment.B1 / 'flamefront-pixel.json'
REGISTRATION = segment.B1 / 'registration.json'
PREVIEWS = segment.PREVIEWS
DOC_IMAGES = ROOT / 'docs/research/img/bass2_b1'
NASA_REFERENCE = {
    'quantity': 'velocidade de propagação estável da chama, teste B1 (filme de PMMA de 100 µm, fluxo oposto)',
    'value_mm_s': 2.2,
    'source': 'PSI-25, BASS-II Summary Report (NASA/TM-20210011385), PDF p. 21; método na p. 30',
    'method': 'fotos de topo, perfil de intensidade com limiar, regressão linear sobre posições sucessivas',
}
# Colours (BGR for OpenCV, hex for matplotlib): band identity keeps the same hue everywhere.
BAND_HEX = {'upper': '#2a78d6', 'lower': '#eb6834'}
BAND_BGR = {'upper': (214, 120, 42), 'lower': (52, 104, 235)}
INK, INK_2, SURFACE = '#0b0b0b', '#52514e', '#fcfcfb'


# ------------------------------------------------------------------------------ statistics
def ols(t: np.ndarray, x: np.ndarray) -> dict:
    """Ordinary least squares x = b0 + b1 t on the finite pairs, with residual diagnostics."""
    t, x = np.asarray(t, float), np.asarray(x, float)
    keep = np.isfinite(t) & np.isfinite(x)
    t, x = t[keep], x[keep]
    n = len(t)
    if n < 3 or np.ptp(t) == 0:
        return {'n': int(n), 'slope': math.nan, 'intercept': math.nan, 'r2': math.nan}
    tm, xm = t.mean(), x.mean()
    sxx = float(((t - tm) ** 2).sum())
    slope = float(((t - tm) * (x - xm)).sum() / sxx)
    intercept = float(xm - slope * tm)
    residuals = x - (intercept + slope * t)
    ss_res = float(residuals @ residuals)
    ss_tot = float(((x - xm) ** 2).sum())
    sigma = math.sqrt(ss_res / (n - 2))
    lag1 = float(np.corrcoef(residuals[:-1], residuals[1:])[0, 1]) if n > 3 and residuals.std() > 0 else math.nan
    dw = float((np.diff(residuals) ** 2).sum() / ss_res) if ss_res > 0 else math.nan
    return {'n': int(n), 'slope': slope, 'intercept': intercept, 'r2': 1 - ss_res / ss_tot if ss_tot > 0 else math.nan,
            'residualSd': sigma, 'residualMaxAbs': float(np.abs(residuals).max()), 'seNaive': sigma / math.sqrt(sxx),
            'lag1Autocorrelation': lag1, 'durbinWatson': dw}


def residuals_of(t: np.ndarray, x: np.ndarray, fit: dict) -> np.ndarray:
    return np.asarray(x, float) - (fit['intercept'] + fit['slope'] * np.asarray(t, float))


def hac_se(t: np.ndarray, x: np.ndarray, lags: int) -> float:
    """Newey-West (Bartlett kernel) standard error of the slope."""
    keep = np.isfinite(t) & np.isfinite(x)
    t, x = np.asarray(t, float)[keep], np.asarray(x, float)[keep]
    if len(t) < 3:
        return math.nan
    design = np.column_stack([np.ones_like(t), t - t.mean()])
    beta, *_ = np.linalg.lstsq(design, x, rcond=None)
    scores = design * (x - design @ beta)[:, None]
    meat = scores.T @ scores
    for lag in range(1, min(lags, len(t) - 1) + 1):
        weight = 1 - lag / (lags + 1)
        gamma = scores[lag:].T @ scores[:-lag]
        meat += weight * (gamma + gamma.T)
    bread = np.linalg.inv(design.T @ design)
    return float(math.sqrt((bread @ meat @ bread)[1, 1]))


def block_bootstrap_slopes(t: np.ndarray, x: np.ndarray, block: int, reps: int, seed: int) -> np.ndarray:
    """Moving-block bootstrap of consecutive (t, x) pairs; missing positions stay missing inside the blocks.

    The series is indexed by frame, so a block of `block` rows spans the same time in every resample and
    keeps the short-range dependence (flicker, overlay-independent) of the residuals.
    """
    t, x = np.asarray(t, float), np.asarray(x, float)
    n = len(t)
    block = max(1, min(block, n))
    count = math.ceil(n / block)
    rng = np.random.default_rng(seed)
    starts = rng.integers(0, n - block + 1, size=(reps, count))
    index = (starts[:, :, None] + np.arange(block)).reshape(reps, -1)[:, :n]
    tt, xx = t[index], x[index]
    valid = np.isfinite(tt) & np.isfinite(xx)
    w = valid.astype(float)
    tt, xx = np.where(valid, tt, 0.0), np.where(valid, xx, 0.0)
    total = w.sum(axis=1)
    with np.errstate(invalid='ignore', divide='ignore'):
        tm = tt.sum(axis=1) / total
        xm = xx.sum(axis=1) / total
        cov = (w * (tt - tm[:, None]) * (xx - xm[:, None])).sum(axis=1)
        var = (w * (tt - tm[:, None]) ** 2).sum(axis=1)
        slopes = cov / var
    return slopes[np.isfinite(slopes)]


def velocity_fit(t: np.ndarray, x: np.ndarray, processing: dict, frame_dt: float) -> dict:
    """OLS plus block-bootstrap intervals for each configured block length and a HAC cross-check."""
    velocity = processing['velocity']
    fit = ols(t, x)
    if not math.isfinite(fit['slope']):
        return {**fit, 'status': 'insuficiente'}
    intervals = {}
    for seconds in velocity['blockSeconds']:
        block = max(1, round(seconds / frame_dt))
        slopes = block_bootstrap_slopes(t, x, block, velocity['bootstrap'], velocity['seed'])
        intervals[f'{seconds:g}s'] = {'blockFrames': block, 'reps': int(len(slopes)),
                                      'ci95': [float(np.percentile(slopes, 2.5)), float(np.percentile(slopes, 97.5))],
                                      'sd': float(slopes.std(ddof=1))}
    primary = intervals[f"{velocity['primaryBlockSeconds']:g}s"]
    lags = max(1, round(velocity['primaryBlockSeconds'] / frame_dt))
    return {**fit, 'status': 'ok', 'ci95': primary['ci95'], 'ciMethod': f"moving-block bootstrap, bloco {velocity['primaryBlockSeconds']:g} s",
            'bootstrap': intervals, 'seHac': hac_se(t, x, lags), 'hacLags': lags}


def local_velocity(t: np.ndarray, x: np.ndarray, window: float, step: float, min_fraction: float = 0.5) -> list[dict]:
    """Slopes over sliding windows of `window` s every `step` s (windows with too few positions are skipped)."""
    t, x = np.asarray(t, float), np.asarray(x, float)
    finite_t = t[np.isfinite(t)]
    if len(finite_t) < 2:
        return []
    dt = float(np.median(np.diff(finite_t)))
    out = []
    start = float(finite_t.min())
    while start + window <= finite_t.max() + 1e-9:
        inside = (t >= start) & (t < start + window)
        expected = window / dt
        fit = ols(t[inside], x[inside])
        if fit['n'] >= min_fraction * expected and math.isfinite(fit['slope']):
            out.append({'start_s': start, 'center_s': start + window / 2, 'n': fit['n'], 'slope': fit['slope'], 'r2': fit['r2']})
        start += step
    return out


def stability(t: np.ndarray, x: np.ndarray, local: list[dict], trim: float = 2.0) -> dict:
    t, x = np.asarray(t, float), np.asarray(x, float)
    finite = np.isfinite(t) & np.isfinite(x)
    if finite.sum() < 6:
        return {}
    t0, t1 = t[finite].min(), t[finite].max()
    middle = (t0 + t1) / 2
    first, second = ols(t[t < middle], x[t < middle]), ols(t[t >= middle], x[t >= middle])
    trimmed = ols(t[(t >= t0 + trim) & (t <= t1 - trim)], x[(t >= t0 + trim) & (t <= t1 - trim)])
    slopes = np.array([item['slope'] for item in local])
    return {'firstHalfSlope': first['slope'], 'secondHalfSlope': second['slope'],
            'halfRatio': second['slope'] / first['slope'] if first['slope'] else math.nan,
            'trimmedSlope': trimmed['slope'], 'trimSeconds': trim,
            'localSlopeMin': float(slopes.min()) if len(slopes) else math.nan,
            'localSlopeMax': float(slopes.max()) if len(slopes) else math.nan,
            'localSlopeCv': float(slopes.std(ddof=1) / slopes.mean()) if len(slopes) > 1 else math.nan,
            'localWindows': int(len(slopes))}


def compare_with_reference(positions: dict[int, float], raw: dict[int, float], reference: list[dict], band: str,
                           frames: set[int] | None = None) -> dict:
    """Automatic positions (tracked) against the visual reference of one band.

    coverage: share of reference-visible frames with a tracked position; rejection: share of them where the
    detector produced a position but the tracker rejected it; falsePositives: tracked positions in frames the
    reference marks as without visible flame.
    """
    errors, visible, covered, rejected, false_positive, invisible = [], 0, 0, 0, 0, 0
    for entry in reference:
        frame = entry['ts_frame']
        if frames is not None and frame not in frames:
            continue
        value = positions.get(frame, math.nan)
        if entry[band] is None:
            invisible += 1
            false_positive += int(math.isfinite(value))
            continue
        visible += 1
        if math.isfinite(value):
            covered += 1
            errors.append(value - entry[band])
        elif math.isfinite(raw.get(frame, math.nan)):
            rejected += 1
    e = np.array(errors)
    return {'n': int(len(e)), 'referenceVisible': visible, 'referenceInvisible': invisible,
            'mae': float(np.abs(e).mean()) if len(e) else math.nan,
            'rmse': float(np.sqrt((e ** 2).mean())) if len(e) else math.nan,
            'bias': float(e.mean()) if len(e) else math.nan,
            'maxAbs': float(np.abs(e).max()) if len(e) else math.nan,
            'coverage': covered / visible if visible else math.nan,
            'rejection': rejected / visible if visible else math.nan,
            'falsePositives': false_positive}


def physical_velocity(px_per_s: float, registration: dict) -> float:
    """mm/s from px/s; refuses unless the spatial registration is validated (it is not, for B1)."""
    calibrate.to_mm(registration, 0.0)        # raises for any status other than 'validated'
    return px_per_s * registration['transformation']['axes']['x']['scale_mm_per_px']


# ------------------------------------------------------------------------------ data access
def read_range(source: dict, first: int, last: int) -> dict[int, np.ndarray]:
    """BGR frames ts_frame in [first, last] without keeping the whole video in memory."""
    import cv2

    capture = cv2.VideoCapture(str(source['path']))
    frames, index = {}, -source['offset']
    while index <= last:
        ok, frame = capture.read()
        if not ok:
            break
        if index >= first:
            frames[index] = frame
        index += 1
    capture.release()
    return frames


def mp4_source() -> dict:
    timebase = json.loads(segment.TIMEBASE.read_text(encoding='utf-8'))
    info = timebase['sources']['mp4']
    path = ROOT / info['path']
    if not path.exists() or segment.sha256(path) != info['sha256']:
        return {}
    return {'kind': 'mp4', 'path': path, 'sha256': info['sha256'], 'offset': timebase['mp4ToTs']['offsetFrames']}


def series_arrays(tracks: list[dict], band: str, series: str, frames: list[int]) -> tuple[np.ndarray, np.ndarray, np.ndarray, list[str]]:
    wanted = {row['ts_frame']: row for row in tracks if row['band'] == band and row['series'] == series}
    rows = [wanted[str(frame)] for frame in frames]
    tracked = np.array([track.to_float(row['tracked_px']) for row in rows])
    raw = np.array([track.to_float(row['raw_px']) for row in rows])
    return tracked, raw, np.array([float(row['timestamp_experiment_s']) for row in rows]), [row['flag'] for row in rows]


def front_of(frame: np.ndarray, config: dict, band: str, method: str, threshold: float, shift: int = 0, delta: int = 0) -> float:
    """Leading edge of one detector (used by the ROI and source checks); NaN when nothing valid was found."""
    result = segment.detect_frame(frame, config, band, threshold, shift, delta)[method]
    return result.front if result.present else math.nan


def start_scan(t: np.ndarray, x: np.ndarray, delays: tuple[float, ...] = (0, 1, 2, 3, 4, 5, 6, 8, 10)) -> list[dict]:
    """Slope of the fit when the window start is moved later (the end is kept): shows the early transient."""
    out = []
    for delay in delays:
        inside = t >= t[0] + delay
        fit = ols(t[inside], x[inside])
        out.append({'startDelay_s': delay, 'n': fit['n'], 'slope': fit['slope'], 'r2': fit['r2'],
                    'residualSd': fit.get('residualSd', math.nan), 'lag1Autocorrelation': fit.get('lag1Autocorrelation', math.nan)})
    return out


# ------------------------------------------------------------------------------ analysis
def analyse(config: dict, with_media: bool) -> dict:
    processing = config['processing']
    tracking = processing['tracking']
    stable = config['windows']['stable']
    first, last = stable['first'], stable['last']
    frames = list(range(first, last + 1))
    times = segment.frame_times()
    t_abs = np.array([times[frame][1] for frame in frames])
    t_video = np.array([times[frame][0] for frame in frames])
    t0 = float(t_abs[0])
    t = t_abs - t0
    frame_dt = float(np.median(np.diff(t_video)))
    tracks = track.read_observations(track.TRACKS)
    reference = annotate.read_annotations()
    stable_reference = {entry['ts_frame'] for entry in reference if first <= entry['ts_frame'] <= last}
    late_reference = {entry['ts_frame'] for entry in reference if entry['ts_frame'] > last}

    window = {'firstFrame': first, 'lastFrame': last, 'frames': len(frames),
              'clockFirst': times[first][2], 'clockLast': times[last][2],
              'experimentTimeFirst_s': t0, 'experimentTimeLast_s': float(t_abs[-1]), 'duration_s': float(t[-1]),
              'medianFrameInterval_s': frame_dt, 'source': stable['source'],
              'check': 'índices e horários conferidos com timebase-frames.csv e regimes.json (fase P2)'}

    # --- 1. fits of the tracked series written by track_b1.py (primary threshold of the config)
    fits = {}
    for band in segment.BANDS:
        fits[band] = {}
        for name, _, _ in track.SERIES:
            x, raw, t_rows, flags = series_arrays(tracks, band, name, frames)
            if not np.allclose(t_rows, t_abs):
                raise ValueError('o tempo das trilhas difere da base temporal')
            fit = velocity_fit(t, x, processing, frame_dt)
            high = np.array([flag in ('ok', 'reaquisicao') for flag in flags])
            fit['slopeHighConfidenceOnly'] = ols(t[high], x[high])['slope'] if high.sum() > 10 else math.nan
            fit['coverage'] = float(np.isfinite(x).mean())
            fit['flags'] = {flag: flags.count(flag) for flag in sorted(set(flags))}
            fit['local'] = local_velocity(t, x, processing['velocity']['localWindowSeconds'], processing['velocity']['localStepSeconds'])
            fit['stability'] = stability(t, x, fit['local'])
            fit['startScan'] = start_scan(t, x)
            fit['videoTimeSlope'] = ols(t_video, x)['slope']
            positions = {frame: value for frame, value in zip(frames, x)}
            raw_positions = {frame: value for frame, value in zip(frames, raw)}
            fit['reference'] = compare_with_reference(positions, raw_positions, reference, band, stable_reference)
            fits[band][name] = fit

    # Late frames (FAN ramp / extinction) from the full-length tracks, for the reference comparison only.
    late = {}
    late_frames = sorted(late_reference)
    for band in segment.BANDS:
        late[band] = {}
        for name, _, _ in track.SERIES:
            x, raw, _, _ = series_arrays(tracks, band, name, late_frames)
            late[band][name] = compare_with_reference(dict(zip(late_frames, x)), dict(zip(late_frames, raw)), reference, band,
                                                       late_reference)

    # --- 2. threshold sensitivity (re-detection of every frame of the stable window)
    source = segment.resolve_source(config)
    images = read_range(source, first, last)
    if sorted(images) != frames:
        raise ValueError('quadros do intervalo estável não decodificados por inteiro')
    thresholds = processing['methodA']['thresholds']
    sensitivity = {band: {} for band in segment.BANDS}
    candidates = {}
    detections = {}
    for threshold in thresholds:
        per_frame = {frame: {band: segment.detect_frame(images[frame], config, band, threshold) for band in segment.BANDS}
                     for frame in frames}
        detections[threshold] = per_frame
        # B_otsu chooses its own threshold and B_adaptive only uses T/2 as a floor: evaluated once, at the config primary.
        methods = ('A', 'B_global', 'C_value')
        for method in methods + (('B_otsu', 'B_adaptive') if threshold == processing['methodA']['primaryThreshold'] else ()):
            key = method if method in ('B_otsu', 'B_adaptive') else f'{method}@{threshold:g}'
            candidates[key] = {}
            for band in segment.BANDS:
                raw = np.array([per_frame[frame][band][method].front if per_frame[frame][band][method].present else math.nan
                                for frame in frames])
                x, _ = track.gate_track(raw, tracking['gatePx'], tracking['historyFrames'])
                fit = ols(t, x)
                comparison = compare_with_reference(dict(zip(frames, x)), dict(zip(frames, raw)), reference, band, stable_reference)
                half = t >= t[-1] / 2
                candidates[key][band] = {'slope': fit['slope'], 'slopeSecondHalf': ols(t[half], x[half])['slope'],
                                         'r2': fit['r2'], 'residualSd': fit.get('residualSd', math.nan),
                                         'coverage': float(np.isfinite(x).mean()), 'referenceMae': comparison['mae'],
                                         'referenceBias': comparison['bias'], 'referenceMaxAbs': comparison['maxAbs']}
                if method in ('A', 'B_global', 'C_value'):
                    sensitivity[band].setdefault(method, {})[f'{threshold:g}'] = candidates[key][band]

    # Primary definition: rule fixed before looking at the slopes.
    eligible = {key: value for key, value in candidates.items()
                if all(value[band]['coverage'] >= 0.95 for band in segment.BANDS)}
    def score(key: str) -> float:
        return float(np.mean([candidates[key][band]['referenceMae'] for band in segment.BANDS]))
    selected = min(eligible, key=score)
    selection = {
        'rule': 'entre os candidatos com cobertura ≥ 95% no intervalo estável nas duas bandas, o de menor MAE médio '
                'em relação à referência visual; a referência é uma leitura visual do assistente, não verdade de campo',
        'selected': selected, 'score_mae_px': score(selected),
        'ranking': sorted(((key, round(score(key), 2)) for key in eligible), key=lambda item: item[1]),
        'ineligible': sorted(set(candidates) - set(eligible)),
        'configPrimaryThreshold': processing['methodA']['primaryThreshold'],
    }
    spread = {}
    for band in segment.BANDS:
        spread[band] = {}
        for part in ('slope', 'slopeSecondHalf'):
            slopes = np.array([eligible[key][band][part] for key in eligible])
            spread[band][part] = {'candidates': len(slopes), 'min': float(slopes.min()), 'max': float(slopes.max()),
                                  'median': float(np.median(slopes)),
                                  'iqr': [float(np.percentile(slopes, 25)), float(np.percentile(slopes, 75))]}

    # Full uncertainty treatment for the selected definition (re-detected series, gated as in track_b1.py).
    method, _, threshold_text = selected.partition('@')
    selected_threshold = float(threshold_text) if threshold_text else float(processing['methodA']['primaryThreshold'])
    primary, primary_series = {}, {}
    for band in segment.BANDS:
        raw = np.array([detections[selected_threshold][frame][band][method].front
                        if detections[selected_threshold][frame][band][method].present else math.nan for frame in frames])
        x, flags = track.gate_track(raw, tracking['gatePx'], tracking['historyFrames'])
        fit = velocity_fit(t, x, processing, frame_dt)
        fit['coverage'] = float(np.isfinite(x).mean())
        fit['flags'] = {flag: flags.count(flag) for flag in sorted(set(flags))}
        fit['local'] = local_velocity(t, x, processing['velocity']['localWindowSeconds'], processing['velocity']['localStepSeconds'])
        fit['stability'] = stability(t, x, fit['local'])
        fit['startScan'] = start_scan(t, x)
        fit['videoTimeSlope'] = ols(t_video, x)['slope']
        fit['reference'] = compare_with_reference(dict(zip(frames, x)), dict(zip(frames, raw)), reference, band, stable_reference)
        primary[band] = fit
        primary_series[band] = x

    # --- 2b. parameters of the adaptive segmentation (block size and offset C)
    adaptive_scan = {band: [] for band in segment.BANDS}
    gray = {frame: segment.luminance(images[frame]) for frame in frames}
    x_range = tuple(config['regions']['flame']['x'])
    for block in (21, 31, 51):
        for offset in (-5, -10, -20):
            params = {**processing['methodB'], 'adaptiveBlock': block, 'adaptiveC': offset,
                      'globalThreshold': processing['methodA']['primaryThreshold']}
            for band in segment.BANDS:
                y_range = tuple(config['regions']['bands'][band]['y'])
                raw = []
                for frame in frames:
                    found = segment.segment_band(gray[frame], y_range, x_range, 'adaptive', params,
                                                 config['coordinates']['propagationSign'], processing['roiEdgeMarginPx'])
                    raw.append(found.front if found.present else math.nan)
                raw = np.array(raw)
                x, _ = track.gate_track(raw, tracking['gatePx'], tracking['historyFrames'])
                fit = ols(t, x)
                comparison = compare_with_reference(dict(zip(frames, x)), dict(zip(frames, raw)), reference, band, stable_reference)
                adaptive_scan[band].append({'block': block, 'C': offset, 'slope': fit['slope'], 'r2': fit['r2'],
                                            'coverage': float(np.isfinite(x).mean()), 'referenceMae': comparison['mae'],
                                            'referenceBias': comparison['bias']})
    del gray

    # --- 3. ROI sensitivity for the selected definition
    roi = {band: [] for band in segment.BANDS}
    for band in segment.BANDS:
        for shift in processing['sensitivity']['bandShiftPx']:
            for delta in processing['sensitivity']['bandHalfWidthDeltaPx']:
                raw = np.array([front_of(images[frame], config, band, method, selected_threshold, shift, delta) for frame in frames])
                x, _ = track.gate_track(raw, tracking['gatePx'], tracking['historyFrames'])
                fit = ols(t, x)
                roi[band].append({'shiftPx': shift, 'halfWidthDeltaPx': delta, 'slope': fit['slope'], 'r2': fit['r2'],
                                  'coverage': float(np.isfinite(x).mean())})

    # --- 4. reference annotations on their own (independent of every detector)
    reference_fit = {}
    for band in segment.BANDS:
        pairs = [(times[entry['ts_frame']][1] - t0, entry[band]) for entry in reference
                 if entry['ts_frame'] in stable_reference and entry[band] is not None]
        tt, xx = np.array(pairs).T
        fit = ols(tt, xx)
        reference_fit[band] = {**fit, 'note': 'pontos espaçados ~0,9 s; erro de leitura ±4 px; IC ingênuo t de Student',
                               'ci95Naive': [fit['slope'] - 2.06 * fit['seNaive'], fit['slope'] + 2.06 * fit['seNaive']]}

    # --- 5. source check: same detector on the PSI MP4
    source_check = {'status': 'mp4 indisponível'}
    mp4 = mp4_source()
    if mp4:
        mp4_images = read_range(mp4, first, last)
        source_check = {'mp4Sha256': mp4['sha256'], 'offsetFrames': mp4['offset'], 'threshold': selected_threshold,
                        'note': 'posições brutas (sem filtro de rastreamento) nos dois arquivos'}
        for name in dict.fromkeys((method, 'A')):
            source_check[name] = {}
            for band in segment.BANDS:
                ts_x = np.array([front_of(images[frame], config, band, name, selected_threshold) for frame in frames])
                mp4_x = np.array([front_of(mp4_images[frame], config, band, name, selected_threshold) for frame in frames])
                diff = mp4_x - ts_x
                both = np.isfinite(diff)
                source_check[name][band] = {'framesCompared': int(both.sum()), 'meanDiffPx': float(diff[both].mean()),
                                            'maxAbsDiffPx': float(np.abs(diff[both]).max()),
                                            'framesOver2Px': int((np.abs(diff[both]) > 2).sum()),
                                            'slopeTs': ols(t, ts_x)['slope'], 'slopeMp4': ols(t, mp4_x)['slope']}
        del mp4_images

    # --- 6. reference value and the conversion that is not made
    registration = json.loads(REGISTRATION.read_text(encoding='utf-8'))
    try:
        physical = physical_velocity(primary['upper']['slope'], registration)
        conversion = {'status': 'converted', 'value_mm_s': physical}
    except (ValueError, KeyError, TypeError) as error:
        conversion = {'status': 'blocked_spatial_calibration', 'registrationStatus': registration.get('status'),
                      'reason': str(error), 'value_mm_s': None}
    nasa = {**NASA_REFERENCE, 'comparisonStatus': conversion['status'],
            'note': 'valor publicado registrado apenas como referência; não é usado para derivar mm/pixel nem para validar; '
                    'px/s e mm/s não são comparados'}

    result = {
        'schemaVersion': 1, 'recordId': config['recordId'], 'test': config['test'],
        'generatedBy': 'scripts/bass2/analyze_b1.py',
        'source': {'kind': source['kind'], 'sha256': source['sha256'], 'path': Path(source['path']).relative_to(ROOT).as_posix()},
        'frameConvention': config['source']['frameIndex'],
        'timeAxis': 'tempo do experimento (reta do relógio, timebase.json) menos o instante do primeiro quadro da janela',
        'units': {'position': 'px (coluna da imagem, origem à esquerda)', 'velocity': 'px/s', 'time': 's'},
        'window': window,
        'primary': {'selection': selection, 'method': method, 'threshold': selected_threshold, 'bands': primary,
                    'methodSpread': spread,
                    'bandDifference_px_s': primary['lower']['slope'] - primary['upper']['slope']},
        'trackedSeries': fits,
        'lateFramesReference': late,
        'thresholdSensitivity': sensitivity,
        'candidates': candidates,
        'roiSensitivity': roi,
        'adaptiveParameterSensitivity': adaptive_scan,
        'referenceAnnotations': {'path': annotate.ANNOTATIONS.relative_to(ROOT).as_posix(),
                                 'annotator': sorted({entry['annotator'] for entry in reference}),
                                 'nature': 'leitura visual de pranchas 3x (assistente de IA); não é anotação de especialista nem verdade de campo',
                                 'fits': reference_fit},
        'sourceCheck': source_check,
        'physicalVelocity': conversion,
        'nasaReference': nasa,
    }
    if with_media:
        media(config, result, images, primary_series, frames, t, tracks, reference, selected_threshold, method, source)
    return result


# ------------------------------------------------------------------------------ figures and video
def media(config, result, images, primary_series, frames, t, tracks, reference, threshold, method, source) -> None:
    import matplotlib

    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    PREVIEWS.mkdir(parents=True, exist_ok=True)
    DOC_IMAGES.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({'font.size': 9, 'axes.edgecolor': INK_2, 'axes.labelcolor': INK, 'xtick.color': INK_2,
                         'ytick.color': INK_2, 'axes.spines.top': False, 'axes.spines.right': False,
                         'figure.facecolor': SURFACE, 'axes.facecolor': SURFACE, 'savefig.facecolor': SURFACE,
                         'axes.grid': True, 'grid.color': '#e4e3df', 'grid.linewidth': 0.6})
    t0 = result['window']['experimentTimeFirst_s']
    times = segment.frame_times()
    primary = result['primary']['bands']
    label = result['primary']['selection']['selected']

    def save(figure, name):
        figure.savefig(PREVIEWS / f'{name}.png', dpi=130, bbox_inches='tight')
        figure.savefig(DOC_IMAGES / f'flamefront-{name}.png', dpi=90, bbox_inches='tight')
        plt.close(figure)

    # Trajectory: primary series, peaks, reference points, fits.
    figure, axes = plt.subplots(2, 1, figsize=(8.5, 6.2), sharex=True)
    for axis, band in zip(axes, segment.BANDS):
        x = primary_series[band]
        fit = primary[band]
        peak, _, _, _ = series_arrays(tracks, band, 'A_peak', frames)
        axis.plot(t, peak, '.', ms=2, color='#9a9994', label='pico de intensidade (A)')
        axis.plot(t, x, '-', lw=1.2, color=BAND_HEX[band], label=f'frente {label}')
        axis.plot(t, fit['intercept'] + fit['slope'] * t, '--', lw=1, color=INK, label=f"reta: {fit['slope']:.2f} px/s")
        ref = [(times[e['ts_frame']][1] - t0, e[band]) for e in reference if e[band] is not None and frames[0] <= e['ts_frame'] <= frames[-1]]
        axis.plot(*zip(*ref), 'o', ms=4, mfc='none', mec=INK, label='referência visual')
        axis.set_ylabel(f'x (px), banda {"superior" if band == "upper" else "inferior"}')
        axis.legend(loc='upper left', frameon=False, fontsize=8)
    axes[-1].set_xlabel(f"t (s) desde o quadro {frames[0]} ({result['window']['clockFirst']})")
    figure.suptitle('B1: posição da frente de chama no intervalo estável (pixels)', fontsize=10, color=INK)
    save(figure, 'trajectory')

    # Residuals.
    figure, axes = plt.subplots(2, 1, figsize=(8.5, 4.6), sharex=True)
    for axis, band in zip(axes, segment.BANDS):
        residual = residuals_of(t, primary_series[band], primary[band])
        axis.plot(t, residual, '-', lw=0.8, color=BAND_HEX[band])
        axis.axhline(0, color=INK_2, lw=0.8)
        axis.set_ylabel(f'resíduo (px), {"sup." if band == "upper" else "inf."}')
        axis.text(0.99, 0.92, f"DP {primary[band]['residualSd']:.1f} px · autocorr. lag 1 {primary[band]['lag1Autocorrelation']:.2f}",
                  transform=axis.transAxes, ha='right', fontsize=8, color=INK_2)
    axes[-1].set_xlabel('t (s)')
    figure.suptitle(f'Resíduos da regressão linear ({label})', fontsize=10, color=INK)
    save(figure, 'residuals')

    # Local velocity.
    figure, axis = plt.subplots(figsize=(8.5, 3.4))
    for band in segment.BANDS:
        local = primary[band]['local']
        axis.plot([item['center_s'] for item in local], [item['slope'] for item in local], 'o-', ms=4, lw=1.2,
                  color=BAND_HEX[band], label=f'banda {"superior" if band == "upper" else "inferior"}')
        lo, hi = primary[band]['ci95']
        axis.axhspan(lo, hi, color=BAND_HEX[band], alpha=0.12, lw=0)
    axis.set_xlabel('centro da janela de 4 s (s)')
    axis.set_ylabel('velocidade local (px/s)')
    axis.legend(frameon=False, fontsize=8)
    axis.set_title('Velocidade em janelas deslizantes; faixas = IC 95% global (bootstrap em blocos)', fontsize=9, color=INK)
    save(figure, 'velocity-local')

    # Slope versus start of the fit window (early transient).
    figure, axis = plt.subplots(figsize=(8.5, 3.0))
    for band in segment.BANDS:
        scan = primary[band]['startScan']
        axis.plot([item['startDelay_s'] for item in scan], [item['slope'] for item in scan], 'o-', ms=4, lw=1.2,
                  color=BAND_HEX[band], label=f'{label}, banda {"superior" if band == "upper" else "inferior"}')
        scan = result['trackedSeries'][band]['A_front']['startScan']
        axis.plot([item['startDelay_s'] for item in scan], [item['slope'] for item in scan], 's--', ms=3, lw=1,
                  color=BAND_HEX[band], alpha=0.6, label=f'A@{config["processing"]["methodA"]["primaryThreshold"]:g}, '
                                                        f'banda {"superior" if band == "upper" else "inferior"}')
    axis.set_xlabel(f'início do ajuste atrasado em relação ao quadro {frames[0]} (s); fim fixo no quadro {frames[-1]}')
    axis.set_ylabel('velocidade (px/s)')
    axis.legend(frameon=False, fontsize=7, ncol=2)
    save(figure, 'start-scan')

    # All detectors on the same axes.
    figure, axes = plt.subplots(2, 1, figsize=(8.5, 6.0), sharex=True)
    palette = ('#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4')
    for axis, band in zip(axes, segment.BANDS):
        for colour, name in zip(palette, ('A_front', 'B_global_front', 'B_otsu_front', 'B_adaptive_front', 'C_value_front')):
            x, _, _, _ = series_arrays(tracks, band, name, frames)
            axis.plot(t, x, '-', lw=1, color=colour, label=name)
        ref = [(times[e['ts_frame']][1] - t0, e[band]) for e in reference if e[band] is not None and frames[0] <= e['ts_frame'] <= frames[-1]]
        axis.plot(*zip(*ref), 'o', ms=4, mfc='none', mec=INK, label='referência visual')
        axis.set_ylabel(f'x (px), {"superior" if band == "upper" else "inferior"}')
    axes[0].legend(frameon=False, fontsize=7, ncol=3, loc='upper left')
    axes[-1].set_xlabel('t (s)')
    figure.suptitle(f'Frentes de todos os detectores (limiar {config["processing"]["methodA"]["primaryThreshold"]:g} onde se aplica)',
                    fontsize=10, color=INK)
    save(figure, 'methods')

    # Threshold sensitivity.
    figure, axes = plt.subplots(1, 2, figsize=(8.5, 3.2), sharey=True)
    styles = {'A': ('o-', '#2a78d6'), 'B_global': ('s-', '#eb6834'), 'C_value': ('^-', '#1baf7a')}
    for axis, band in zip(axes, segment.BANDS):
        for method_name, values in result['thresholdSensitivity'][band].items():
            xs = [float(k) for k in values]
            axis.plot(xs, [values[k]['slope'] for k in values], styles[method_name][0], ms=4, lw=1.2,
                      color=styles[method_name][1], label=method_name)
        axis.set_title(f'banda {"superior" if band == "upper" else "inferior"}', fontsize=9, color=INK)
        axis.set_xlabel('limiar de intensidade (0–255)')
    axes[0].set_ylabel('velocidade (px/s)')
    axes[0].legend(frameon=False, fontsize=8)
    figure.suptitle('Sensibilidade da velocidade ao limiar', fontsize=10, color=INK)
    save(figure, 'threshold-sensitivity')

    # Contact sheets: detections and threshold masks, before / during / after.
    import cv2

    sheet_frames = [250, 300, 332, 465, 597, 730, 862, 995, 1048, 1090, 1105, 1120]
    extra = read_range(source, min(sheet_frames), max(sheet_frames))
    (x0, x1), (y0, y1) = config['regions']['flame']['x'], config['regions']['flame']['y']
    ref_by_frame = {entry['ts_frame']: entry for entry in reference}
    tiles, masks = [], []
    for frame in sheet_frames:
        image = extra[frame]
        crop = image[y0:y1 + 1, x0:x1 + 1].copy()
        gray = segment.luminance(image)[y0:y1 + 1, x0:x1 + 1]
        mask_tile = (0.35 * crop).astype(np.uint8)
        for band in segment.BANDS:
            by0, by1 = config['regions']['bands'][band]['y']
            detection = segment.detect_frame(image, config, band, threshold)
            a = detection[method] if method in detection else detection['A']
            band_mask = np.zeros(gray.shape, bool)
            band_mask[by0 - y0:by1 - y0 + 1] = gray[by0 - y0:by1 - y0 + 1] >= threshold
            mask_tile[band_mask] = BAND_BGR[band]
            for tile in (crop, mask_tile):
                cv2.line(tile, (0, by0 - y0), (tile.shape[1] - 1, by0 - y0), (70, 70, 70), 1)
                cv2.line(tile, (0, by1 - y0), (tile.shape[1] - 1, by1 - y0), (70, 70, 70), 1)
                if a.present:
                    xf = int(round(a.front - x0))
                    cv2.line(tile, (xf, by0 - y0), (xf, by1 - y0), (255, 255, 255), 2)
                    cv2.line(tile, (xf, by0 - y0), (xf, by1 - y0), BAND_BGR[band], 1)
                if math.isfinite(detection['A'].peak) and detection['A'].present:
                    cv2.circle(tile, (int(detection['A'].peak - x0), (by0 + by1) // 2 - y0), 3, (200, 200, 200), 1)
                entry = ref_by_frame.get(frame)
                if entry and entry[band] is not None:
                    xr = int(round(entry[band] - x0))
                    cv2.drawMarker(tile, (xr, by0 - y0 - 4), (255, 255, 255), cv2.MARKER_TRIANGLE_DOWN, 7, 1)
        clock = times[frame][2]
        for tile, kind in ((crop, 'deteccao'), (mask_tile, f'mascara I>={threshold:g}')):
            head = np.zeros((16, tile.shape[1], 3), np.uint8)
            cv2.putText(head, f'ts_frame {frame}  {clock}  {kind}', (3, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
            (tiles if kind == 'deteccao' else masks).append(np.vstack([head, tile]))
    for name, items in (('detections', tiles), ('masks', masks)):
        rows = [np.hstack(items[i:i + 2]) for i in range(0, len(items), 2)]
        sheet = np.vstack(rows)
        overlay.write_image(PREVIEWS / f'contact-{name}.png', sheet)
        small = cv2.resize(sheet, None, fx=0.85, fy=0.85, interpolation=cv2.INTER_AREA)
        ok, data = cv2.imencode('.jpg', small, [cv2.IMWRITE_JPEG_QUALITY, 82])
        (DOC_IMAGES / f'flamefront-contact-{name}.jpg').write_bytes(data.tobytes())

    # Short diagnostic video (frames 280-1150 of the TS, crop of the flame region, detections drawn).
    video_frames = read_range(source, 280, 1150)
    previous = os.getcwd()
    os.chdir(ROOT)
    try:
        relative = (PREVIEWS / 'diagnostic-b1.mp4').relative_to(ROOT).as_posix()
        size = ((x1 - x0 + 1), (y1 - y0 + 1) + 16)
        writer = cv2.VideoWriter(relative, cv2.VideoWriter_fourcc(*'mp4v'), 30.0, size)
        for frame in sorted(video_frames):
            image = video_frames[frame]
            crop = image[y0:y1 + 1, x0:x1 + 1].copy()
            for band in segment.BANDS:
                by0, by1 = config['regions']['bands'][band]['y']
                detection = segment.detect_frame(image, config, band, threshold)
                a = detection[method] if method in detection else detection['A']
                if a.present:
                    xf = int(round(a.front - x0))
                    cv2.line(crop, (xf, by0 - y0), (xf, by1 - y0), BAND_BGR[band], 2)
            head = np.zeros((16, crop.shape[1], 3), np.uint8)
            cv2.putText(head, f'ts_frame {frame}  {times[frame][2]}  {label}', (3, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
            writer.write(np.vstack([head, crop]))
        writer.release()
    finally:
        os.chdir(previous)


def clean(value):
    if isinstance(value, float):
        return None if not math.isfinite(value) else round(value, 5)
    if isinstance(value, dict):
        return {key: clean(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(item) for item in value]
    if isinstance(value, np.generic):
        return clean(value.item())
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--no-media', action='store_true')
    args = parser.parse_args()
    config = segment.load_config()
    result = analyse(config, not args.no_media)
    RESULT.write_text(json.dumps(clean(result), ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    summary = {'selected': result['primary']['selection']['selected'],
               **{band: {key: clean(result['primary']['bands'][band][key]) for key in ('slope', 'ci95', 'r2', 'residualSd', 'coverage')}
                  for band in segment.BANDS},
               'spread': clean(result['primary']['methodSpread']), 'conversion': result['physicalVelocity']['status']}
    print(json.dumps(summary, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
