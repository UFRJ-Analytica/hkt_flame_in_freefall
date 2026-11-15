"""Describe cached BASS-II pilot videos without ffprobe: container facts and visual contact sheets.

The MP4 structure (codec, size, time base, per-sample durations, edit lists, key frames) is
read with the standard library. Contact sheets need OpenCV, which is optional: without it only
the container report is produced. No segmentation and no measurement happens here -- frames are
sampled evenly, labelled with their index and time, and saved for a person to look at.

    python scripts/bass2/inspect_video_bass2.py                 # every MP4 in data/cache/bass2/videos
    python scripts/bass2/inspect_video_bass2.py --frames 24 --crop 0,380,720,100
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VIDEOS = ROOT / 'data/cache/bass2/videos'
PREVIEWS = ROOT / 'data/cache/bass2/previews'
CONTAINERS = {b'moov', b'trak', b'mdia', b'minf', b'stbl', b'edts'}


def boxes(data: bytes, start: int, end: int):
    position = start
    while position + 8 <= end:
        size, kind = struct.unpack('>I4s', data[position:position + 8])
        header = 8
        if size == 1:
            size = struct.unpack('>Q', data[position + 8:position + 16])[0]
            header = 16
        elif size == 0:
            size = end - position
        if size < header:
            return
        yield kind, position + header, position + size
        position += size


def find(data: bytes, start: int, end: int, path: list[bytes]):
    for kind, body, stop in boxes(data, start, end):
        if kind == path[0]:
            if len(path) == 1:
                yield body, stop
            elif kind in CONTAINERS:
                yield from find(data, body, stop, path[1:])


def full_box(data: bytes, body: int) -> tuple[int, int]:
    return data[body], body + 4  # version, first byte after version+flags


def describe(path: Path) -> dict:
    """Track-level facts of an MP4/MOV file; every number is read from the file, none assumed."""
    size = path.stat().st_size
    with path.open('rb') as stream:
        # The index (moov) may sit before or after the media data; read only the boxes needed.
        position, moov = 0, None
        top = []
        while position + 8 <= size:
            stream.seek(position)
            length, kind = struct.unpack('>I4s', stream.read(8))
            if length == 1:
                length = struct.unpack('>Q', stream.read(8))[0]
            elif length == 0:
                length = size - position
            if length < 8:
                break
            top.append(kind.decode('latin-1'))
            if kind == b'moov':
                stream.seek(position)
                moov = stream.read(length)
            position += length
    report = {'file': path.name, 'bytes': size, 'topLevelBoxes': top, 'tracks': []}
    if moov is None:
        return {**report, 'error': 'átomo moov não encontrado'}
    for body, stop in find(moov, 8, len(moov), [b'mvhd']):
        version, cursor = full_box(moov, body)
        cursor += 16 if version == 1 else 8
        timescale = struct.unpack('>I', moov[cursor:cursor + 4])[0]
        duration = struct.unpack('>Q' if version == 1 else '>I', moov[cursor + 4:cursor + (12 if version == 1 else 8)])[0]
        report['movie'] = {'timescale': timescale, 'durationS': duration / timescale if timescale else None}
    for trak, trak_end in find(moov, 8, len(moov), [b'trak']):
        track = {}
        for body, _ in find(moov, trak, trak_end, [b'mdia', b'hdlr']):
            track['handler'] = moov[body + 8:body + 12].decode('latin-1')
        for body, _ in find(moov, trak, trak_end, [b'mdia', b'mdhd']):
            version, cursor = full_box(moov, body)
            cursor += 16 if version == 1 else 8
            track['timescale'] = struct.unpack('>I', moov[cursor:cursor + 4])[0]
            track['durationUnits'] = struct.unpack('>Q' if version == 1 else '>I',
                                                   moov[cursor + 4:cursor + (12 if version == 1 else 8)])[0]
        for body, _ in find(moov, trak, trak_end, [b'mdia', b'minf', b'stbl', b'stsd']):
            entry = body + 8
            track['codec'] = moov[entry + 4:entry + 8].decode('latin-1')
            if track.get('handler') == 'vide':
                track['width'], track['height'] = struct.unpack('>HH', moov[entry + 32:entry + 36])
        for body, _ in find(moov, trak, trak_end, [b'mdia', b'minf', b'stbl', b'stts']):
            count = struct.unpack('>I', moov[body + 4:body + 8])[0]
            runs = [struct.unpack('>II', moov[body + 8 + 8 * i:body + 16 + 8 * i]) for i in range(count)]
            track['samples'] = sum(n for n, _ in runs)
            track['sampleDeltas'] = dict(Counter({delta: 0 for _, delta in runs}) + Counter(
                {delta: sum(n for n, d in runs if d == delta) for _, delta in runs}))
        for body, _ in find(moov, trak, trak_end, [b'mdia', b'minf', b'stbl', b'stss']):
            track['keyFrames'] = struct.unpack('>I', moov[body + 4:body + 8])[0]
        track['hasCompositionOffsets'] = any(True for _ in find(moov, trak, trak_end, [b'mdia', b'minf', b'stbl', b'ctts']))
        edits = []
        for body, _ in find(moov, trak, trak_end, [b'edts', b'elst']):
            version, cursor = full_box(moov, body)
            count = struct.unpack('>I', moov[cursor:cursor + 4])[0]
            cursor += 4
            for _ in range(count):
                if version == 1:
                    length, media_time = struct.unpack('>Qq', moov[cursor:cursor + 16])
                    cursor += 20
                else:
                    length, media_time = struct.unpack('>Ii', moov[cursor:cursor + 8])
                    cursor += 12
                edits.append({'segmentDurationMovieUnits': length, 'mediaTime': media_time})
        track['editList'] = edits
        if track.get('timescale') and track.get('samples'):
            deltas = track['sampleDeltas']
            common = max(deltas, key=deltas.get)
            track['durationS'] = track['durationUnits'] / track['timescale']
            track['nominalFps'] = track['timescale'] / common if common else None
            track['averageFps'] = track['samples'] / track['durationS'] if track['durationS'] else None
            track['constantFrameDuration'] = len(deltas) == 1
        report['tracks'].append(track)
    return report


def contact_sheet(path: Path, frames: int, columns: int, crop: tuple[int, int, int, int] | None, scale: float,
                  gain: float = 1.0, window: tuple[float, float] | None = None) -> dict:
    """Evenly spaced frames in one labelled JPEG. Purely visual; nothing is detected or measured."""
    import cv2  # optional dependency, imported only when sheets are requested
    import numpy as np

    capture = cv2.VideoCapture(str(path))
    total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = capture.get(cv2.CAP_PROP_FPS)
    report = {'decoder': 'OpenCV ' + cv2.__version__, 'decodedFrameCount': total, 'decoderFps': fps,
              'width': int(capture.get(cv2.CAP_PROP_FRAME_WIDTH)), 'height': int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))}
    first, last = 0, total - 1
    if window and fps:
        first, last = max(0, round(window[0] * fps)), min(total - 1, round(window[1] * fps))
    indices = sorted({round(first + i * (last - first) / (frames - 1)) for i in range(frames)}) if last > first else [first]
    tiles, brightness = [], []
    for index in indices:
        capture.set(cv2.CAP_PROP_POS_FRAMES, index)
        ok, frame = capture.read()
        if not ok:
            continue
        brightness.append({'frame': index, 'timeS': round(index / fps, 3) if fps else None,
                           'meanBgr': [round(float(v), 1) for v in frame.reshape(-1, 3).mean(axis=0)]})
        if crop:
            x, y, w, h = crop
            frame = frame[y:y + h, x:x + w]
        if gain != 1:
            # Display aid for dim flames only: a linear stretch of the picture, clipped at white.
            frame = np.clip(frame.astype(np.float32) * gain, 0, 255).astype(np.uint8)
        if scale != 1:
            frame = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_NEAREST if scale > 1 else cv2.INTER_AREA)
        label = f'#{index}  t={index / fps:.2f}s' if fps else f'#{index}'
        cv2.rectangle(frame, (0, 0), (8 + 9 * len(label), 18), (0, 0, 0), -1)
        cv2.putText(frame, label, (4, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
        tiles.append(frame)
    capture.release()
    if not tiles:
        return {**report, 'error': 'nenhum quadro decodificado'}
    height, width = tiles[0].shape[:2]
    rows = -(-len(tiles) // columns)
    sheet = np.zeros((rows * height, columns * width, 3), dtype=np.uint8)
    for position, tile in enumerate(tiles):
        r, c = divmod(position, columns)
        sheet[r * height:(r + 1) * height, c * width:(c + 1) * width] = tile
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    suffix = ('-crop' + '_'.join(map(str, crop)) if crop else '') + (f'-gain{gain:g}' if gain != 1 else '')
    suffix += f'-t{window[0]:g}_{window[1]:g}' if window else ''
    target = PREVIEWS / f'{path.stem}{suffix}-sheet.jpg'
    cv2.imencode('.jpg', sheet, [cv2.IMWRITE_JPEG_QUALITY, 88])[1].tofile(str(target))
    return {**report, 'sampledFrames': brightness, 'sheet': target.relative_to(ROOT).as_posix()}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('files', nargs='*', type=Path)
    parser.add_argument('--frames', type=int, default=20)
    parser.add_argument('--columns', type=int, default=5)
    parser.add_argument('--crop', help='x,y,largura,altura em pixels, para ampliar uma região (ex.: a sobreposição)')
    parser.add_argument('--scale', type=float, default=1.0)
    parser.add_argument('--gain', type=float, default=1.0, help='multiplicador de brilho só para visualização')
    parser.add_argument('--window', help='início,fim em segundos, para amostrar apenas um trecho')
    parser.add_argument('--no-sheets', action='store_true')
    args = parser.parse_args()
    crop = tuple(int(v) for v in args.crop.split(',')) if args.crop else None
    window = tuple(float(v) for v in args.window.split(',')) if args.window else None
    reports = []
    for path in args.files or sorted(VIDEOS.glob('*.mp4')):
        report = describe(path)
        if not args.no_sheets:
            try:
                report['frames'] = contact_sheet(path, args.frames, args.columns, crop, args.scale, args.gain, window)
            except ImportError:
                report['frames'] = {'status': 'OpenCV ausente; apenas o relatório do contêiner foi gerado'}
        reports.append(report)
    PREVIEWS.mkdir(parents=True, exist_ok=True)
    if not crop and not args.files and args.gain == 1 and not window:
        (PREVIEWS / 'video-inspection.json').write_text(json.dumps(reports, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    json.dump(reports, sys.stdout, ensure_ascii=False, indent=1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
