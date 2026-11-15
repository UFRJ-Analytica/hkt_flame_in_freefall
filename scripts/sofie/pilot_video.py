"""SoFIE-GEL pilot: inspection of the public NASA video of test 1410C and one scale-free metric (flamelet spin frequency).

    python scripts/sofie/pilot_video.py           # writes data/sofie/pilot/pilot-1410c.json (needs the cached video)
    python scripts/sofie/pilot_video.py --check   # verifies the committed JSON is reproduced

What the video is (facts from its own metadata, data/cache/sofie/media/SoFIE-GEL_metadata.json): a 46-s H.264 1920x1080,
30-fps public-outreach edit (Adobe Premiere, music track) whose single source is "1410C with Interstellar theme.mp4".
1410C is Case 5 of NTRS 20240007628 (50 cm/s, duct exit, local blowoff, side-stabilized flame ~40 s, spinning flamelets
at 2-3.5 Hz for ~35 s). The edit is not raw flight data: every source frame is repeated (cadence) and there is an edit
transition.

Steps (each a function, tested on synthetic arrays in test_sofie.py):
1. decode frames at reduced resolution (blue-dominant flame: per-pixel max of the three channels);
2. cadence: how many consecutive output frames repeat one source frame; keep one frame per source frame;
3. scene changes: unique-frame differences far above their local median (edit transitions), which split segments;
4. in the longest segment, sliding windows: left/right luminosity asymmetry A(t) = (L - R)/(L + R) around the flame's
   horizontal centre, Lomb-Scargle periodogram on the unique-frame times, and a permutation threshold (fixed seed) for the
   peak power; windows with too little luminous area are skipped (never zero-filled);
5. report the dominant frequency in VIDEO Hz and its physical value under two time-base hypotheses:
   H1 real time (source sampled at 30/cadence fps); H2 slow motion by the cadence factor (source 30 fps).
The published 2-3.5 Hz is used only to say which hypothesis is consistent; it is not an independent validation, and no
spatial scale is applied (the sphere is a 3-D curved body seen in projection, partly hidden by the flame).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
VIDEO = ROOT / 'data/cache/sofie/media/SoFIE-GEL_large.mp4'
OUTPUT = ROOT / 'data/sofie/pilot/pilot-1410c.json'
SIZE = (480, 270)
FLAME_LEVEL = 40          # 8-bit level on the reduced max-channel image counted as luminous flame
DUP_ABS = 0.35            # mean |difference| (8-bit) under which two consecutive frames are the same source frame
SCENE_RATIO = 3.0         # unique-frame difference / local median above which a frame belongs to an edit transition
SCENE_HALF_WINDOW = 20    # unique frames on each side for the local median
WINDOW_S = 8.0
STEP_S = 2.0
LIT_MIN = 1500            # luminous pixels (reduced frame) below which a window is not analysed
PERMUTATIONS = 200
SEED = 1410
SPIN_FLOOR_HZ = 1.0     # below this a significant peak is slow drift of the flame, not spinning
PUBLISHED = {'test': '1410C', 'case': 5, 'source': "NTRS 20240007628 (Li, T'ien, Ferkul, Olson, Johnston), §3.5 e Tabela 1",
             'flow_cm_s': 49.68, 'o2_pct_at_extinction': 14.37, 'p_atm': 1.07, 'reynolds': 1324.8,
             'strainRate_per_s': 37.26, 'sampleLocation': 'duct exit', 'extinctionMode': 'blowoff',
             'sideStabilizedDuration_s': 40, 'spinningDuration_s': 35, 'spinFrequency_Hz': [2.0, 3.5]}


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read_frames(path: Path) -> tuple[np.ndarray, float, dict]:
    import cv2

    capture = cv2.VideoCapture(str(path))
    fps = capture.get(cv2.CAP_PROP_FPS)
    fourcc = int(capture.get(cv2.CAP_PROP_FOURCC))
    info = {'codec': ''.join(chr((fourcc >> 8 * i) & 255) for i in range(4)), 'fps': fps,
            'width': int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), 'height': int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))}
    frames, stamps = [], []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        stamps.append(capture.get(cv2.CAP_PROP_POS_MSEC) / 1000)
        frames.append(cv2.resize(frame, SIZE, interpolation=cv2.INTER_AREA).max(axis=2))
    capture.release()
    stamps = np.array(stamps)
    steps = np.diff(stamps)
    info.update({'framesDecoded': len(frames),
                 'timestampStep_s': {'median': round(float(np.median(steps)), 6), 'min': round(float(steps.min()), 6),
                                     'max': round(float(steps.max()), 6)},
                 'duration_s': round(float(stamps[-1] + np.median(steps)), 3)})
    return np.array(frames), fps, info


def frame_differences(frames: np.ndarray) -> np.ndarray:
    return np.abs(np.diff(frames.astype(np.float32), axis=0)).mean(axis=(1, 2))


def cadence(differences: np.ndarray, max_period: int = 6) -> dict:
    """Repeat period k and phase: source frames change only at output indices i with i % k == phase."""
    changed = differences > DUP_ABS
    best = {'period': 1, 'phase': 0, 'score': 0.0}
    positions = np.arange(1, changed.size + 1)
    for period in range(2, max_period + 1):
        for phase in range(period):
            on = changed[(positions % period) == phase]
            off = changed[(positions % period) != phase]
            if on.size and off.size and on.mean() > 0.5 and off.mean() < 0.15:
                score = float(on.mean() - off.mean())
                if score > best['score']:
                    best = {'period': period, 'phase': phase, 'score': round(score, 3),
                            'changedAtPhase': round(float(on.mean()), 3), 'changedOffPhase': round(float(off.mean()), 3)}
    return best


def unique_indices(n_frames: int, period: int, phase: int) -> np.ndarray:
    """Index of the first output frame of every source frame (frame 0 always included)."""
    if period <= 1:
        return np.arange(n_frames)
    return np.array([0] + [i for i in range(1, n_frames) if i % period == phase])


def scene_changes(unique_frames: np.ndarray) -> list[int]:
    """Positions p (difference between unique frames p-1 and p) that belong to edit transitions."""
    d = np.abs(np.diff(unique_frames.astype(np.float32), axis=0)).mean(axis=(1, 2))
    out = []
    for i, value in enumerate(d):
        local = np.median(d[max(0, i - SCENE_HALF_WINDOW):i + SCENE_HALF_WINDOW + 1])
        if value > SCENE_RATIO * max(local, 0.5):
            out.append(i + 1)
    return out


def segments_from(n_unique: int, changes: list[int]) -> list[tuple[int, int]]:
    """Uncut runs [first, last] of unique frames; frames inside a transition belong to no segment."""
    segments, start = [], 0
    for position in changes:
        if position - 1 >= start:
            segments.append((start, position - 1))
        start = position + 1
    if start <= n_unique - 1:
        segments.append((start, n_unique - 1))
    return [s for s in segments if s[1] > s[0]]


def lit_area(frame: np.ndarray) -> int:
    return int((frame >= FLAME_LEVEL).sum())


def flame_centre_x(frames: np.ndarray) -> float:
    centres = []
    for frame in frames:
        xs = np.nonzero(frame >= FLAME_LEVEL)[1]
        if xs.size >= 20:
            centres.append((xs.min() + xs.max()) / 2)
    return float(np.median(centres))


def asymmetry(frames: np.ndarray, centre_x: float) -> np.ndarray:
    """(L - R) / (L + R) of luminous intensity above FLAME_LEVEL; NaN when no flame is visible."""
    x = int(round(centre_x))
    values = []
    for frame in frames:
        lit = np.where(frame >= FLAME_LEVEL, frame.astype(np.float64), 0.0)
        left, right = lit[:, :x].sum(), lit[:, x:].sum()
        values.append((left - right) / (left + right) if left + right > 0 else np.nan)
    return np.array(values)


def periodogram(times: np.ndarray, signal: np.ndarray, f_max: float, n: int = 1000) -> tuple[np.ndarray, np.ndarray]:
    """Normalised Lomb-Scargle power on [0.1, f_max] Hz; NaN samples (missing frames) are dropped, never filled."""
    from scipy.signal import lombscargle

    keep = np.isfinite(signal)
    t, y = times[keep], signal[keep] - np.mean(signal[keep])
    freqs = np.linspace(0.1, f_max, n)
    return freqs, lombscargle(t, y, 2 * np.pi * freqs, normalize=True)


def permutation_threshold(times: np.ndarray, signal: np.ndarray, f_max: float, rng: np.random.Generator,
                          n: int = PERMUTATIONS, quantile: float = 0.99) -> float:
    """Quantile of the maximum periodogram power over random permutations of the samples (no periodicity)."""
    keep = np.isfinite(signal)
    t, y = times[keep], signal[keep]
    maxima = [periodogram(t, rng.permutation(y), f_max, n=400)[1].max() for _ in range(n)]
    return float(np.quantile(maxima, quantile))


def window_analysis(times: np.ndarray, signal: np.ndarray, lit: np.ndarray, f_max: float) -> list[dict]:
    rng = np.random.default_rng(SEED)
    out, start = [], times[0]
    while start + WINDOW_S <= times[-1] + 1e-9:
        mask = (times >= start) & (times < start + WINDOW_S)
        entry = {'video_s': [round(float(start), 2), round(float(start + WINDOW_S), 2)], 'samples': int(mask.sum()),
                 'medianLitPixels': int(np.median(lit[mask]))}
        if entry['medianLitPixels'] < LIT_MIN or mask.sum() < 20:
            entry['status'] = 'skipped-low-luminosity'
        else:
            freqs, power = periodogram(times[mask], signal[mask], f_max)
            peak = int(np.argmax(power))
            threshold = permutation_threshold(times[mask], signal[mask], f_max, rng)
            entry.update({'status': 'analysed', 'peak_Hz': round(float(freqs[peak]), 3),
                          'peakPower': round(float(power[peak]), 3), 'threshold99': round(threshold, 3),
                          'significant': bool(power[peak] > threshold)})
        out.append(entry)
        start += STEP_S
    return out


def analyse() -> dict:
    frames, fps, info = read_frames(VIDEO)
    cad = cadence(frame_differences(frames))
    indices = unique_indices(len(frames), cad['period'], cad['phase'])
    unique_fps = fps / cad['period']
    changes = scene_changes(frames[indices])
    segments = segments_from(indices.size, changes)
    described = [{'uniqueFrames': [a, b], 'video_s': [round(indices[a] / fps, 2), round(indices[b] / fps, 2)],
                  'duration_s': round((indices[b] - indices[a]) / fps, 2)} for a, b in segments]
    a, b = max(segments, key=lambda s: s[1] - s[0])
    selected = indices[a:b + 1]
    times = selected / fps
    centre = flame_centre_x(frames[selected])
    signal = asymmetry(frames[selected], centre)
    lit = np.array([lit_area(frames[i]) for i in selected])
    f_max = round(unique_fps / 2 * 0.98, 3)
    windows = window_analysis(times, signal, lit, f_max)
    significant = [w for w in windows if w.get('significant')]
    # Periodic spinning is separated from slow drift of the envelope flame by a 1-Hz floor (stated, not tuned).
    spinning = [w for w in significant if w['peak_Hz'] >= SPIN_FLOOR_HZ]
    lo, hi = PUBLISHED['spinFrequency_Hz']
    summary = None
    if spinning:
        peaks = [w['peak_Hz'] for w in spinning]
        def verdict(factor: float) -> dict:
            physical = [round(p * factor, 3) for p in peaks]
            inside = sum(lo <= p <= hi for p in physical)
            return {'physical_Hz_range': [min(physical), max(physical)], 'windowsInsidePublishedRange': inside,
                    'windowsOutside': len(physical) - inside}
        summary = {
            'analysedWindows': sum(w['status'] == 'analysed' for w in windows),
            'significantWindows': len(significant),
            'slowDriftWindows': [w['video_s'] for w in significant if w['peak_Hz'] < SPIN_FLOOR_HZ],
            'spinningWindows': len(spinning),
            'spinningSpan_video_s': [spinning[0]['video_s'][0], spinning[-1]['video_s'][1]],
            'peakRange_videoHz': [min(peaks), max(peaks)],
            'hypotheses': {
                'H1_realTime': {'assumes': f'fonte a {unique_fps:g} quadros/s exibida em tempo real', **verdict(1.0)},
                'H2_slowMotion': {'assumes': f'fonte a {fps:g} quadros/s em câmera lenta {cad["period"]}x',
                                  **verdict(float(cad['period']))},
            },
            'reading': ('H1 é a única hipótese com janelas dentro da faixa publicada, e a duração da fase giratória no vídeo '
                        'é comparável aos ~35 s publicados; picos acima de 3,5 Hz podem refletir mais de uma chama '
                        'giratória ou aliasing (componente real acima de 5 Hz). Coerência, não validação.'),
        }
    return {
        'schemaVersion': 1,
        'video': {'file': VIDEO.relative_to(ROOT).as_posix(), 'sha256': sha256(VIDEO), 'bytes': VIDEO.stat().st_size,
                  'origin': 'https://images.nasa.gov/details/SoFIE-GEL (derivado ~large)', **info,
                  'sourceIngredient': '1410C with Interstellar theme.mp4 (XMP), editado no Adobe Premiere Pro 2023',
                  'associatedTest': '1410C',
                  'associationEvidence': 'nome do arquivo-fonte no XMP; corresponde ao Caso 5 de NTRS 20240007628',
                  'overlay': 'nenhum relógio, régua ou rótulo sobreposto nos quadros inspecionados'},
        'cadence': {**cad, 'uniqueFramesPerVideoSecond': round(unique_fps, 3), 'uniqueFrames': int(indices.size),
                    'meaning': 'cada quadro-fonte aparece em `period` quadros consecutivos do MP4'},
        'sceneChanges': {'uniqueFramePositions': changes, 'video_s': [round(indices[p] / fps, 2) for p in changes],
                         'rule': f'diferença entre quadros únicos > {SCENE_RATIO:g} x mediana local (±{SCENE_HALF_WINDOW} quadros)'},
        'segments': described,
        'analysisSegment': {'uniqueFrames': [int(a), int(b)], 'video_s': [round(float(times[0]), 2), round(float(times[-1]), 2)],
                            'flameCentreX_px_reduced': round(centre, 1), 'reducedSize': list(SIZE),
                            'samples': int(selected.size), 'missingSamples': int(np.isnan(signal).sum())},
        'spin': {
            'kind': 'measured-video-time',
            'signal': 'A(t) = (L - R)/(L + R) da luminosidade acima do limiar, em torno do centro horizontal da chama',
            'window_s': WINDOW_S, 'step_s': STEP_S, 'litMinPixels': LIT_MIN, 'permutations': PERMUTATIONS, 'seed': SEED,
            'nyquist_videoHz': round(unique_fps / 2, 3), 'windows': windows, 'summary': summary,
            'caveats': [
                'O vídeo é uma edição de divulgação, não o arquivo de voo; a base de tempo não está documentada.',
                'A assimetria esquerda/direita oscila na frequência de passagem das chamas pela face visível; com mais de '
                'uma chama giratória, essa frequência é um múltiplo da frequência de rotação de cada chama.',
                'Com 10 quadros únicos por segundo (H1), 2-3,5 Hz fica abaixo de Nyquist (5 Hz), mas perto; aliasing de '
                'componentes acima de 5 Hz não pode ser excluído.',
                'A faixa publicada (2-3,5 Hz) só indica qual hipótese de base de tempo é coerente; não é validação independente.',
            ],
        },
        'published': {**PUBLISHED, 'kind': 'published'},
        'spatialScale': {'status': 'not-applied',
                         'reason': ('Sem régua no quadro; a esfera de 4 cm é um corpo 3-D visto em projeção, parcialmente '
                                    'encoberta pela chama e com enquadramento alterado na transição de edição.')},
    }


def render(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, indent=1) + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if not VIDEO.exists():
        raise SystemExit('vídeo piloto ausente: python scripts/sofie/fetch_sofie.py video')
    text = render(analyse())
    if args.check:
        same = OUTPUT.exists() and OUTPUT.read_text(encoding='utf-8').replace('\r\n', '\n') == text
        print('reproduzível' if same else 'DIVERGENTE')
        return 0 if same else 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(text.encode('utf-8'))
    data = json.loads(text)
    print(json.dumps({k: data[k] for k in ('cadence', 'sceneChanges', 'segments', 'analysisSegment')}, ensure_ascii=False))
    for w in data['spin']['windows']:
        print(w)
    print(json.dumps(data['spin']['summary'], ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    sys.exit(main())
