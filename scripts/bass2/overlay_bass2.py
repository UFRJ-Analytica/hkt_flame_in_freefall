"""Read the BASS-II video data overlay (FUEL, AIR, FAN, RAD, date, clock) by glyph template matching.

No OCR engine is installed in this environment, and none is needed: the overlay is a fixed-pitch
character generator. Each character cell is compared with labelled glyph templates by normalised
cross-correlation (OpenCV ``matchTemplate``) allowing a few pixels of shift. The templates and the
cell layout live in data/bass2/overlay-glyphs.json:

  - ``layout``: origin, pitch and size of the character cells and the cells of every field,
    measured on the B1 original transport stream (720 x 480);
  - ``seeds``: for every template, the video (by SHA-256), frames and cell it was averaged from,
    and the label given to it by visual inspection;
  - ``templates``: the averaged 13 x 23 grey-level glyphs, so that reading needs no video.

A cell is read as the best-matching label, with its correlation and the margin to the best
*different* label. Blank cells (no bright pixel) are spaces. Nothing is guessed: a low score or a
small margin keeps the character as '?' and lowers the confidence of the field.

    python scripts/bass2/overlay_bass2.py --build-glyphs   # rebuild templates from the seeds (needs the video)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
GLYPHS = ROOT / 'data/bass2/overlay-glyphs.json'
BLANK_MAX = 110          # a cell whose brightest pixel is below this has no character
MIN_SCORE = 0.80         # correlation below this: character unreadable
MIN_MARGIN = 0.04        # best label must beat the best different label by this much
SEARCH = 3               # +/- pixels of shift explored around the nominal cell position
FIELD_PATTERNS = {
    'fuel': r'-?\d{1,4}', 'air': r'-?\d{1,3}', 'fan': r'\d{1,3}', 'rad': r'\d\.\d\d',
    'date': r'\d\d/\d\d/\d\d', 'time': r'\d\d:\d\d:\d\d',
}


@dataclass(frozen=True)
class Char:
    label: str            # character, ' ' for blank, '?' when unreadable
    score: float          # best correlation (1.0 for a blank cell)
    margin: float         # best score minus best score of a different label
    candidate: str        # best label even when it was rejected


def load_glyphs(path: Path = GLYPHS) -> dict:
    data = json.loads(path.read_text(encoding='utf-8'))
    data['_arrays'] = [(item['label'], np.array(item['pixels'], dtype=np.float32)) for item in data['templates']]
    return data


def cell_box(layout: dict, row: str, cell: int) -> tuple[int, int, int, int]:
    """(x, y, w, h) of a character cell, without the search margin."""
    x = int(round(layout['originX'] + layout['pitchX'] * cell))
    return x, layout['rows'][row], layout['cellWidth'], layout['cellHeight']


def crop_cell(gray: np.ndarray, layout: dict, row: str, cell: int, margin: int = SEARCH) -> np.ndarray:
    """Cell plus a margin, zero-padded where it leaves the frame."""
    x, y, w, h = cell_box(layout, row, cell)
    out = np.zeros((h + 2 * margin, w + 2 * margin), np.float32)
    y0, x0 = y - margin, x - margin
    ys, xs = slice(max(0, y0), min(gray.shape[0], y0 + out.shape[0])), slice(max(0, x0), min(gray.shape[1], x0 + out.shape[1]))
    out[ys.start - y0:ys.stop - y0, xs.start - x0:xs.stop - x0] = gray[ys, xs]
    return out


def classify(patch: np.ndarray, glyphs: dict) -> Char:
    import cv2

    core = patch[SEARCH:-SEARCH, SEARCH:-SEARCH]
    if core.max() < BLANK_MAX:
        return Char(' ', 1.0, 1.0, ' ')
    best: dict[str, float] = {}
    for label, template in glyphs['_arrays']:
        score = float(cv2.matchTemplate(patch, template, cv2.TM_CCOEFF_NORMED).max())
        best[label] = max(best.get(label, -1.0), score)
    ranked = sorted(best.items(), key=lambda item: -item[1])
    label, score = ranked[0]
    margin = score - ranked[1][1] if len(ranked) > 1 else 1.0
    accepted = score >= MIN_SCORE and margin >= MIN_MARGIN
    return Char(label if accepted else '?', score, margin, label)


@dataclass(frozen=True)
class Field:
    name: str
    raw: str              # characters as read, '?' for unreadable cells, spaces stripped
    valid: bool           # every cell readable and the text fits the field pattern
    min_score: float
    min_margin: float
    confidence: str       # 'high' | 'low' | 'unreadable'


def read_field(gray: np.ndarray, glyphs: dict, name: str) -> Field:
    layout = glyphs['layout']
    spec = layout['fields'][name]
    chars = [classify(crop_cell(gray, layout, spec['row'], cell), glyphs) for cell in spec['cells']]
    raw = ''.join(char.label for char in chars).strip()
    readable = [char for char in chars if char.label != ' ']
    min_score = min((char.score for char in readable), default=0.0)
    min_margin = min((char.margin for char in readable), default=0.0)
    valid = bool(raw) and '?' not in raw and re.fullmatch(FIELD_PATTERNS[name], raw) is not None
    confidence = 'high' if valid and min_score >= 0.90 and min_margin >= 0.08 else 'low' if valid else 'unreadable'
    return Field(name, raw, valid, round(min_score, 4), round(min_margin, 4), confidence)


def read_overlay(gray: np.ndarray, glyphs: dict) -> dict[str, Field]:
    return {name: read_field(gray, glyphs, name) for name in glyphs['layout']['fields']}


def write_image(path: Path, image: np.ndarray) -> None:
    """cv2.imwrite silently fails on non-ASCII paths on Windows (this repository lives under 'Portfólio')."""
    import cv2

    path.parent.mkdir(parents=True, exist_ok=True)
    ok, encoded = cv2.imencode(path.suffix, image)
    if not ok:
        raise ValueError(f'falha ao codificar {path.name}')
    encoded.tofile(str(path))


def parse_number(raw: str) -> float | None:
    """Plain numeric reading of a field; None for anything else (never a guess)."""
    return float(raw) if re.fullmatch(r'-?\d+(?:\.\d+)?', raw or '') else None


def parse_clock(raw: str) -> int | None:
    """'10:09:47' -> seconds of the day."""
    match = re.fullmatch(r'(\d\d):(\d\d):(\d\d)', raw or '')
    if not match:
        return None
    hours, minutes, seconds = (int(group) for group in match.groups())
    if hours > 23 or minutes > 59 or seconds > 59:
        return None
    return hours * 3600 + minutes * 60 + seconds


# --------------------------------------------------------------- template building (needs the video)
def read_gray_frames(path: Path) -> tuple[np.ndarray, np.ndarray]:
    """All decodable frames as grey images, and their presentation times in ms (OpenCV/FFmpeg)."""
    import cv2

    capture = cv2.VideoCapture(str(path))
    frames, times = [], []
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY))
        times.append(capture.get(cv2.CAP_PROP_POS_MSEC))
    capture.release()
    return np.stack(frames), np.array(times)


def build_templates(glyphs: dict) -> list[dict]:
    """Average every seed's cells (aligned on the first one) into a template."""
    import cv2

    cache: dict[str, np.ndarray] = {}
    templates = []
    for seed in glyphs['seeds']:
        path = ROOT / seed['video']
        if seed['video'] not in cache:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest != seed['videoSha256']:
                raise ValueError(f'{path.name}: hash diferente do registrado nas sementes')
            cache[seed['video']] = read_gray_frames(path)[0]
        frames = cache[seed['video']]
        layout = glyphs['layout']
        x, y, w, h = cell_box(layout, seed['row'], seed['cell'])
        reference = frames[seed['frames'][0], y:y + h, x:x + w].astype(np.float32)
        stack = []
        for index in seed['frames']:
            patch = crop_cell(frames[index], layout, seed['row'], seed['cell'])
            result = cv2.matchTemplate(patch, reference, cv2.TM_CCOEFF_NORMED)
            _, _, _, (dx, dy) = cv2.minMaxLoc(result)
            stack.append(patch[dy:dy + h, dx:dx + w])
        mean = np.mean(stack, axis=0)
        templates.append({'label': seed['label'], 'pixels': np.round(mean).astype(int).tolist(),
                          'members': len(stack)})
    return templates


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--build-glyphs', action='store_true')
    args = parser.parse_args()
    if args.build_glyphs:
        glyphs = json.loads(GLYPHS.read_text(encoding='utf-8'))
        glyphs['templates'] = build_templates(glyphs)
        GLYPHS.write_text(json.dumps(glyphs, ensure_ascii=False) + '\n', encoding='utf-8')
        print(f"{len(glyphs['templates'])} modelos gravados em {GLYPHS.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
