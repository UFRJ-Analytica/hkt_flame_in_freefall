"""Frame-to-frame tracking of the B1 flame fronts detected by segment_b1.py, in pixels.

For each band and each detector series (method A leading edge and peak, B and C leading edges) the raw
per-frame positions are checked against a robust local reference (median of the previous accepted
positions). A position further than the gate from that reference is kept in the raw column but flagged
and left out of the tracked column. Nothing is interpolated, nothing is filled with zero, and the
series is never forced to grow monotonically: a real recession of the front stays in the data.

Columns of data/bass2/b1/flamefront-tracks.csv:
  raw_px       detector output (empty when the detector found nothing)
  tracked_px   raw_px if accepted by the gate, empty otherwise
  smoothed_px  centred running median of tracked_px (only where at least half the window is valid);
               for plots and visual checks only - the velocity fits use tracked_px
  flag         ok | ausente | rejeitado_salto | reaquisicao | baixa_confianca | sem_referencia
  timestamp_experiment_s, timestamp_video_s copied from the observations (the time base is not touched)

    python scripts/bass2/track_b1.py
"""
from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import segment_b1 as segment  # noqa: E402

ROOT = segment.ROOT
TRACKS = segment.B1 / 'flamefront-tracks.csv'
# (series name, observation method, observation field)
SERIES = (
    ('A_front', 'A', 'front_px'),
    ('A_peak', 'A', 'peak_px'),
    ('B_global_front', 'B_global', 'front_px'),
    ('B_otsu_front', 'B_otsu', 'front_px'),
    ('B_adaptive_front', 'B_adaptive', 'front_px'),
    ('C_value_front', 'C_value', 'front_px'),
    ('C_blue_front', 'C_blue', 'front_px'),
)
TRACK_COLUMNS = ['ts_frame', 'band', 'series', 'timestamp_video_s', 'timestamp_experiment_s', 'raw_px', 'tracked_px',
                 'smoothed_px', 'confidence', 'flag']


def to_float(text: str) -> float:
    return float(text) if text not in ('', None) else math.nan


def gate_track(positions: np.ndarray, gate: float, history: int, present: np.ndarray | None = None,
               min_reference: int = 3) -> tuple[np.ndarray, list[str]]:
    """Accept a position when it lies within `gate` px of the median of the last `history` accepted ones.

    Before `min_reference` positions have been accepted there is no reference; the first run of
    mutually consistent detections (each within the gate of the previous) seeds it. If `history`
    consecutive detections are rejected and the last `min_reference` of them agree with each other,
    the reference is considered stale (the tracked feature moved, e.g. the brightest point jumped from
    the ignitor glow to the flame) and is re-seeded from them; those frames are flagged 'reaquisicao'.
    Rejected and absent frames are NaN in the output, with the reason in the flag list. No ordering
    constraint is imposed in either direction.
    """
    positions = np.asarray(positions, dtype=float)
    present = np.isfinite(positions) if present is None else (np.asarray(present, bool) & np.isfinite(positions))
    tracked = np.full(len(positions), np.nan)
    flags = ['ausente'] * len(positions)
    accepted: list[float] = []
    pending: list[int] = []          # candidate seed indices before a reference exists
    rejected_run: list[int] = []     # consecutive rejected detections since the last acceptance
    for i, x in enumerate(positions):
        if not present[i]:
            continue
        if len(accepted) >= min_reference and len(rejected_run) >= history:
            tail = rejected_run[-min_reference:]
            if all(abs(positions[b] - positions[a]) <= gate for a, b in zip(tail, tail[1:])):
                accepted = [positions[j] for j in tail]
                for j in tail:
                    tracked[j] = positions[j]
                    flags[j] = 'reaquisicao'
                rejected_run = []
        if len(accepted) < min_reference:
            if pending and abs(x - positions[pending[-1]]) > gate:
                for j in pending:
                    flags[j] = 'sem_referencia'
                pending = []
            pending.append(i)
            flags[i] = 'sem_referencia'
            if len(pending) >= min_reference:
                for j in pending:
                    tracked[j] = positions[j]
                    flags[j] = 'ok'
                    accepted.append(positions[j])
                pending = []
            continue
        reference = float(np.median(accepted[-history:]))
        if abs(x - reference) <= gate:
            tracked[i] = x
            flags[i] = 'ok'
            accepted.append(x)
            rejected_run = []
        else:
            flags[i] = 'rejeitado_salto'
            rejected_run.append(i)
    return tracked, flags


def running_median(values: np.ndarray, window: int) -> np.ndarray:
    """Centred running median ignoring NaN; NaN where fewer than half of the window is valid."""
    values = np.asarray(values, dtype=float)
    half = window // 2
    out = np.full(len(values), np.nan)
    for i in range(len(values)):
        chunk = values[max(0, i - half):i + half + 1]
        valid = chunk[np.isfinite(chunk)]
        if np.isfinite(values[i]) and len(valid) >= max(1, window // 2):
            out[i] = float(np.median(valid))
    return out


def read_observations(path: Path = segment.OBSERVATIONS) -> list[dict]:
    with path.open(encoding='utf-8') as stream:
        return list(csv.DictReader(stream))


def build_tracks(observations: list[dict], config: dict) -> list[dict]:
    tracking = config['processing']['tracking']
    rows = []
    for band in segment.BANDS:
        band_rows = sorted((row for row in observations if row['band'] == band), key=lambda row: int(row['ts_frame']))
        frames = [int(row['ts_frame']) for row in band_rows]
        if frames != list(range(len(frames))):
            raise ValueError(f'banda {band}: quadros faltando ou repetidos nas observações')
        for name, method, column in SERIES:
            present = np.array([row[f'{method}_present'] == '1' for row in band_rows])
            raw = np.array([to_float(row[f'{method}_{column}']) for row in band_rows])
            if column == 'peak_px':
                # The peak exists whenever the profile was valid, but is only meaningful where the band is lit.
                raw = np.where(present, raw, np.nan)
            tracked, flags = gate_track(raw, tracking['gatePx'], tracking['historyFrames'], present)
            smoothed = running_median(tracked, tracking['smoothingFrames'])
            for k, row in enumerate(band_rows):
                confidence = row[f'{method}_confidence']
                flag = flags[k]
                if flag == 'ok' and confidence == 'low':
                    flag = 'baixa_confianca'      # kept in tracked_px; the analysis can exclude it
                rows.append({'ts_frame': frames[k], 'band': band, 'series': name,
                             'timestamp_video_s': row['timestamp_video_s'],
                             'timestamp_experiment_s': row['timestamp_experiment_s'],
                             'raw_px': segment.fmt(raw[k]), 'tracked_px': segment.fmt(tracked[k]),
                             'smoothed_px': segment.fmt(smoothed[k]), 'confidence': confidence, 'flag': flag})
    return rows


def summary(rows: list[dict], window: tuple[int, int]) -> dict:
    out = {}
    for row in rows:
        if not window[0] <= row['ts_frame'] <= window[1]:
            continue
        key = f"{row['band']}/{row['series']}"
        counts = out.setdefault(key, {})
        counts[row['flag']] = counts.get(row['flag'], 0) + 1
    return out


def main() -> int:
    config = segment.load_config()
    rows = build_tracks(read_observations(), config)
    with TRACKS.open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=TRACK_COLUMNS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    stable = config['windows']['stable']
    print(json.dumps({'rows': len(rows), 'output': TRACKS.relative_to(ROOT).as_posix(),
                      'stableWindowFlags': summary(rows, (stable['first'], stable['last']))}, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
