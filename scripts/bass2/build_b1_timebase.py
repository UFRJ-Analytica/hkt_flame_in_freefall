"""Relate video time to the experiment clock shown in the B1 overlay, for the TS original and the PSI MP4.

Inputs (from extract_b1_telemetry.py and the cache):
  data/cache/bass2/b1/overlay/frames-ts.csv, frames-mp4.csv   per-frame overlay readings
  data/cache/bass2/b1/original/BASS_GMT50_SAMPLE_147_TEST_B1.ts   (PES time stamps, read with the stdlib)
Outputs:
  data/bass2/b1/timebase.json         structure of both files, clock ticks, fit, residuals, MP4 <-> TS map
  data/bass2/b1/timebase-frames.csv   per TS frame: PTS, displayed clock, fitted and interpolated clock time

Video time: the presentation time stamp of each decoded frame, relative to the first decodable frame.
Experiment time: the overlay clock (seconds of the day, as displayed; the display runs one day ahead of
the real date, see the ReadMe). The clock only shows whole seconds and the overlay refreshes ~5 times a
second, so a "tick" (first frame showing a new second) lags the true second boundary by 0 to one refresh
interval. Ticks are fitted with  t_clock = a + b * (t_video - t0)  by least squares; the residuals show
whether a single straight line is adequate. The displayed clock values are kept unchanged per frame.

    python scripts/bass2/build_b1_timebase.py
"""
from __future__ import annotations

import csv
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import overlay_bass2 as overlay  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'data/cache/bass2/b1'
TS = CACHE / 'original/BASS_GMT50_SAMPLE_147_TEST_B1.ts'
MP4 = ROOT / 'data/cache/bass2/videos/PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1.mp4'
FRAMES = CACHE / 'overlay/frames-{}.csv'
OUTPUT = ROOT / 'data/bass2/b1/timebase.json'
FRAMES_OUT = ROOT / 'data/bass2/b1/timebase-frames.csv'
PTS_CLOCK = 90_000


# ------------------------------------------------------------------ MPEG-TS (stdlib)
def ts_video_pts(data: bytes) -> dict:
    """PIDs, stream types and the PTS of every video PES of an MPEG transport stream."""
    if len(data) % 188 or any(data[i] != 0x47 for i in range(0, len(data), 188)):
        raise ValueError('não é um transport stream de pacotes de 188 bytes alinhados')
    pmt_pid, streams, pts = None, {}, {}
    for offset in range(0, len(data), 188):
        packet = data[offset:offset + 188]
        pid = ((packet[1] & 0x1F) << 8) | packet[2]
        start = bool(packet[1] & 0x40)
        control = (packet[3] >> 4) & 3
        body = 4 + (1 + packet[4] if control & 2 else 0)
        if not control & 1 or body >= 188 or not start:
            continue
        payload = packet[body:]
        if pid == 0:
            section = payload[1 + payload[0]:]
            pmt_pid = ((section[10] & 0x1F) << 8) | section[11]
        elif pid == pmt_pid:
            section = payload[1 + payload[0]:]
            length = ((section[1] & 0x0F) << 8) | section[2]
            index = 12 + (((section[10] & 0x0F) << 8) | section[11])
            while index < 3 + length - 4:
                streams[((section[index + 1] & 0x1F) << 8) | section[index + 2]] = section[index]
                index += 5 + (((section[index + 3] & 0x0F) << 8) | section[index + 4])
        elif payload[:3] == b'\x00\x00\x01' and payload[7] & 0x80:
            b = payload[9:14]
            value = ((b[0] >> 1) & 7) << 30 | b[1] << 22 | (b[2] >> 1) << 15 | b[3] << 7 | b[4] >> 1
            pts.setdefault(pid, []).append(value)
    video = next((pid for pid, kind in streams.items() if kind in (0x1B, 0x02, 0x24)), None)
    audio = next((pid for pid, kind in streams.items() if kind in (0x0F, 0x03, 0x04, 0x11)), None)
    return {'streams': {str(pid): kind for pid, kind in streams.items()}, 'videoPid': video,
            'pts': sorted(pts.get(video, [])), 'audioPid': audio, 'audioPts': sorted(pts.get(audio, []))}


# ------------------------------------------------------------------------- clock
def read_frames(source: str) -> list[dict]:
    with Path(str(FRAMES).format(source)).open(encoding='utf-8') as stream:
        return list(csv.DictReader(stream))


def clock_ticks(times_s: np.ndarray, clock_s: list[int | None]) -> list[dict]:
    """First frame of every newly displayed second (only +1 s steps between readable frames)."""
    ticks, previous = [], None
    for index, (t, value) in enumerate(zip(times_s, clock_s)):
        if value is None:
            continue
        if previous is not None and value != previous[1]:
            ticks.append({'frame': index, 'videoS': round(float(t), 4), 'clockS': value,
                          'step': value - previous[1], 'framesSincePrevious': index - previous[0]})
        if previous is None or value != previous[1]:
            previous = (index, value)
    return ticks


def fit_ticks(ticks: list[dict], origin: float) -> dict:
    """Least-squares line through the ticks that follow a regular +1 s step."""
    usable = [tick for tick in ticks if tick['step'] == 1]
    if len(usable) < 5:
        return {'status': 'insufficient', 'reason': 'menos de 5 viradas de segundo legíveis'}
    x = np.array([tick['videoS'] for tick in usable]) - origin
    y = np.array([tick['clockS'] for tick in usable], dtype=float)
    design = np.vstack([np.ones_like(x), x]).T
    (a, b), *_ = np.linalg.lstsq(design, y, rcond=None)
    residuals = y - (a + b * x)
    dof = len(x) - 2
    sigma = float(np.sqrt(residuals @ residuals / dof))
    covariance = sigma ** 2 * np.linalg.inv(design.T @ design)
    return {
        'status': 'ok', 'model': 't_clock_s = intercept_s + slope * (t_video_s - videoTimeOrigin_s)',
        'videoTimeOrigin_s': origin, 'intercept_s': float(a), 'slope': float(b),
        'interceptStdErr_s': float(np.sqrt(covariance[0, 0])), 'slopeStdErr': float(np.sqrt(covariance[1, 1])),
        'driftPercent': float((b - 1) * 100), 'ticksUsed': len(usable),
        'residualRms_s': float(np.sqrt(np.mean(residuals ** 2))), 'residualMaxAbs_s': float(np.abs(residuals).max()),
        'residuals_s': [round(float(value), 4) for value in residuals],
    }


def refresh_intervals(rows: list[dict], times_s: np.ndarray, merge: int = 2) -> dict:
    """Period of the overlay refresh, from the instants at which the displayed text changes.

    A change is often spread over two frames (one blended frame, then the settled text), so changes
    closer than `merge` frames are counted as one refresh. Not every refresh changes the text, so gaps
    are multiples of the period; the period is fitted as  t_k = t_0 + P * n_k  with integer n_k.
    """
    keys = [tuple(row[f'{name}_raw'] for name in ('fuel', 'air', 'fan', 'rad', 'time')) for row in rows]
    raw = [index for index in range(1, len(keys)) if keys[index] != keys[index - 1]]
    events = [index for position, index in enumerate(raw) if position == 0 or index - raw[position - 1] > merge]
    gaps = np.diff(events)
    regular = gaps[gaps <= 8]
    period_frames = float(np.mean(regular)) if len(regular) else None
    fitted = None
    if period_frames:
        t = times_s[events]
        counts = np.round((t - t[0]) / (period_frames * np.median(np.diff(times_s)))).astype(int)
        slope, intercept = np.polyfit(counts, t, 1)
        residual = t - (intercept + slope * counts)
        fitted = {'period_s': float(slope), 'rate_hz': float(1 / slope), 'residualRms_s': float(np.sqrt(np.mean(residual ** 2))),
                  'refreshesSpanned': int(counts[-1]), 'eventsUsed': len(events)}
    return {'textChangeFrames': len(raw), 'refreshEvents': len(events), 'mergedWithinFrames': merge,
            'framesBetweenRefreshEventsHistogram': {str(k): v for k, v in sorted(Counter(gaps.tolist()).items())},
            'regularGapMeanFrames': period_frames, 'fit': fitted,
            'interpretation': 'intervalos mais frequentes de 6 ou 7 quadros (ou múltiplos, quando nada muda na tela): '
                              'atualização a cada ~0,20 s, com variação de cerca de 2 quadros; um mesmo valor fica na tela '
                              'por vários quadros e não representa observações independentes'}


def describe_clock(rows: list[dict], times_s: np.ndarray) -> dict:
    clock = [overlay.parse_clock(row['time_raw']) for row in rows]
    dates = Counter(row['date_raw'] for row in rows)
    readable = [value for value in clock if value is not None]
    steps = Counter(b - a for a, b in zip(readable, readable[1:]))
    ticks = clock_ticks(times_s, clock)
    origin = float(times_s[0])
    return {'clock': clock, 'ticks': ticks, 'summary': {
        'dateDisplayed': dict(dates), 'firstClock': rows[0]['time_raw'], 'lastClock': rows[-1]['time_raw'],
        'distinctSeconds': len(set(readable)), 'unreadableClockFrames': len(clock) - len(readable),
        'stepsBetweenFrames': {str(k): v for k, v in sorted(steps.items())},
        'framesPerDisplayedSecondHistogram': {str(k): v for k, v in sorted(Counter(t['framesSincePrevious'] for t in ticks[1:]).items())},
        'videoSpan_s': float(times_s[-1] - times_s[0]),
    }, 'fit': fit_ticks(ticks, origin)}


# ---------------------------------------------------------------------- MP4 <-> TS
def thumbnails(path: Path, size=(96, 64)) -> np.ndarray:
    import cv2

    frames, _ = overlay.read_gray_frames(path)
    return np.stack([cv2.resize(frame, size, interpolation=cv2.INTER_AREA).astype(np.float32) for frame in frames])


def best_offset(mp4: np.ndarray, ts: np.ndarray, max_offset: int = 90) -> dict:
    """Constant frame offset k such that MP4[i] matches TS[i - k], by mean absolute pixel difference.

    A frame-by-frame monotone alignment is unstable here (the scene is static between overlay refreshes,
    so many TS frames look the same); a single offset is tested and then checked frame by frame.
    """
    scores = []
    for offset in range(0, max_offset + 1):
        n = min(len(mp4) - offset, len(ts))
        if n < len(ts) // 2:
            break
        scores.append((float(np.abs(mp4[offset:offset + n] - ts[:n]).mean()), offset))
    scores.sort()
    error, offset = scores[0]
    n = min(len(mp4) - offset, len(ts))
    per_frame = np.abs(mp4[offset:offset + n] - ts[:n]).mean(axis=(1, 2))
    leading = mp4[:offset]
    return {
        'offsetFrames': offset, 'meanAbsDifference': error, 'secondBest': {'offsetFrames': scores[1][1], 'meanAbsDifference': scores[1][0]},
        'perFrameDifference': {'median': float(np.median(per_frame)), 'p99': float(np.percentile(per_frame, 99)),
                               'max': float(per_frame.max()), 'argmaxMp4Frame': int(per_frame.argmax()) + offset},
        'leadingMp4Frames': offset,
        'leadingDiffToFirstTsFrame': float(np.abs(leading - ts[0]).mean()) if offset else None,
        'leadingInternalDiff': float(np.abs(np.diff(leading, axis=0)).mean()) if offset > 1 else None,
        'mp4FramesAfterTsEnd': len(mp4) - offset - n,
    }


def main() -> int:
    data = TS.read_bytes()
    stream = ts_video_pts(data)
    pes = np.array(stream['pts'], dtype=np.int64)
    ts_rows, mp4_rows = read_frames('ts'), read_frames('mp4')
    ts_times = np.array([float(row['pts_ms']) for row in ts_rows]) / 1000
    mp4_times = np.array([float(row['pts_ms']) for row in mp4_rows]) / 1000
    relative = (pes - pes[0]) / PTS_CLOCK
    matched = [int(np.argmin(np.abs(relative - t))) for t in ts_times]
    match_error = float(max(abs(relative[j] - t) for j, t in zip(matched, ts_times)))
    steps = Counter(np.round(np.diff(pes) / PTS_CLOCK * 1000, 1).tolist())
    ts_clock = describe_clock(ts_rows, ts_times)
    mp4_clock = describe_clock(mp4_rows, mp4_times)

    mapping = best_offset(thumbnails(MP4), thumbnails(TS))
    offset = mapping['offsetFrames']
    pairs = [(i, i - offset) for i in range(offset, len(mp4_rows)) if i - offset < len(ts_rows)]
    overlay_agree = sum(all(mp4_rows[i][f'{name}_raw'] == ts_rows[j][f'{name}_raw'] for name in ('fuel', 'air', 'fan', 'rad', 'date', 'time'))
                        for i, j in pairs)
    disagreements = [{'mp4Frame': i, 'tsFrame': j, **{name: [mp4_rows[i][f'{name}_raw'], ts_rows[j][f'{name}_raw']]
                      for name in ('fuel', 'air', 'fan', 'rad', 'time') if mp4_rows[i][f'{name}_raw'] != ts_rows[j][f'{name}_raw']}}
                     for i, j in pairs if any(mp4_rows[i][f'{name}_raw'] != ts_rows[j][f'{name}_raw'] for name in ('fuel', 'air', 'fan', 'rad', 'time'))]
    reverse = {j: [i] for i, j in pairs}
    reverse.setdefault(0, []).extend(range(offset))  # leading padding copies of the first TS frame
    reverse[0] = sorted(reverse[0])

    fit = ts_clock['fit']
    interpolated = (np.interp(ts_times, [t['videoS'] for t in ts_clock['ticks']], [t['clockS'] for t in ts_clock['ticks']])
                    if len(ts_clock['ticks']) > 1 else np.full(len(ts_times), np.nan))
    fitted = fit['intercept_s'] + fit['slope'] * (ts_times - fit['videoTimeOrigin_s']) if fit['status'] == 'ok' else np.full(len(ts_times), np.nan)
    inside = (ts_times >= ts_clock['ticks'][0]['videoS']) & (ts_times <= ts_clock['ticks'][-1]['videoS'])

    product = {
        'schemaVersion': 1, 'recordId': 'PSI-25:t0:r2', 'test': 'B1',
        'definitions': {
            'timestamp_video_s': 'PTS do quadro no TS original menos o PTS do primeiro quadro decodificável',
            'timestamp_experiment_s': 'relógio da sobreposição em segundos do dia (data exibida 02/20/14; data real 2014-02-19, ReadMe)',
            'tick': 'primeiro quadro que exibe um novo segundo; atrasa a virada real de 0 a 1 período de atualização da sobreposição',
        },
        'sources': {
            'ts': {'path': TS.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
                   'container': 'MPEG-TS', 'streams': stream['streams'], 'videoPid': stream['videoPid'],
                   'videoPes': len(pes), 'decodedFrames': len(ts_rows),
                   'undecodedPes': sorted(set(range(len(pes))) - set(matched)),
                   'undecodedReason': 'o fluxo começa no meio de um GOP: os primeiros PES referenciam um PPS ainda não recebido',
                   'decodedPtsMatchMaxError_s': match_error,
                   'ptsStepsMs': {str(k): v for k, v in sorted(steps.items())},
                   'ptsSpan_s': float((pes[-1] - pes[0]) / PTS_CLOCK),
                   'decodedSpan_s': float(ts_times[-1] - ts_times[0])},
            'mp4': {'path': MP4.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(MP4.read_bytes()).hexdigest(),
                    'frames': len(mp4_rows), 'frameDuration': '1001/30000 s (constante)',
                    'span_s': float(mp4_times[-1] - mp4_times[0])},
        },
        'overlayRefresh': refresh_intervals(ts_rows, ts_times),
        'clock': {'ts': ts_clock['summary'], 'mp4': mp4_clock['summary']},
        'fit': fit,
        'fitMp4': mp4_clock['fit'],
        'ticks': ts_clock['ticks'],
        'interpolationVsFit': {
            'maxAbsDifference_s': float(np.nanmax(np.abs(interpolated[inside] - fitted[inside]))) if inside.any() else None,
            'note': 'interpolação linear entre viradas consecutivas comparada com a reta única, dentro do intervalo coberto por viradas'},
        'mp4ToTs': {
            'method': 'deslocamento constante de quadros escolhido pela menor diferença média de pixels (miniaturas 96 x 64), '
                      'conferido quadro a quadro e pelo texto da sobreposição',
            'rule': f'MP4[i] = TS[i - {offset}] para i >= {offset}; MP4[0..{offset - 1}] são cópias do primeiro quadro do TS',
            **mapping,
            'mp4LeadIn_s': offset * 1001 / 30000,
            'tsAudioLeadBeforeFirstVideoPes_s': (float((pes[0] - stream['audioPts'][0]) / PTS_CLOCK)
                                                 if stream['audioPts'] else None),
            'tsAudioLeadBeforeFirstDecodedFrame_s': (float((pes[0] - stream['audioPts'][0]) / PTS_CLOCK + ts_times[0])
                                                     if stream['audioPts'] else None),
            'overlayTextAgreement': f'{overlay_agree}/{len(pairs)}', 'overlayDisagreements': disagreements,
        },
    }
    if fit['status'] == 'ok':
        period = (product['overlayRefresh'].get('fit') or {}).get('period_s')
        frame = float(np.median(np.diff(ts_times)))
        product['fit']['tickLag'] = {
            'note': 'cada virada aparece depois da virada real do segundo (próxima atualização da sobreposição e '
                    'próximo quadro); a reta pelas viradas fica adiantada pelo atraso médio. Nenhuma correção foi aplicada.',
            'lagRange_s': [0.0, round((period or 0.0) + frame, 3)],
            'expectedMeanLag_s': round(((period or 0.0) + frame) / 2, 3),
            'trueClockIs': 'timestamp_experiment_fit_s + atraso (0 a lagRange_s[1])',
        }
        product['fit']['interceptClock'] = f"{int(fit['intercept_s'] // 3600):02d}:{int(fit['intercept_s'] % 3600 // 60):02d}:{fit['intercept_s'] % 60:06.3f}"
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(product, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    with FRAMES_OUT.open('w', newline='', encoding='utf-8') as stream_out:
        writer = csv.writer(stream_out, lineterminator='\n')
        writer.writerow(['ts_frame', 'timestamp_video_s', 'clock_display_raw', 'timestamp_experiment_fit_s',
                         'timestamp_experiment_interp_s', 'mp4_frames'])
        for index, row in enumerate(ts_rows):
            writer.writerow([index, f'{ts_times[index]:.4f}', row['time_raw'], f'{fitted[index]:.3f}',
                             f'{interpolated[index]:.3f}' if inside[index] else '',
                             ' '.join(map(str, reverse.get(index, [])))])
    print(json.dumps({'fit': {k: v for k, v in fit.items() if k != 'residuals_s'},
                      'fitMp4': {k: v for k, v in mp4_clock['fit'].items() if k != 'residuals_s'},
                      'mp4ToTs': {k: v for k, v in product['mp4ToTs'].items() if 'Positions' not in k},
                      'refresh': product['overlayRefresh']}, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
