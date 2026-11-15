"""Manual reference for the B1 flame front: frame selection, annotation sheets, optional interactive picking.

    python scripts/bass2/annotate_b1.py prepare                         # choose frames, write sheets + CSV template (no detection shown)
    python scripts/bass2/annotate_b1.py interactive --annotator NOME    # click the fronts (matplotlib with a GUI backend)
    python scripts/bass2/annotate_b1.py check [--file CSV]              # validate a filled CSV
    python scripts/bass2/annotate_b1.py compare --file CSV              # agreement with the preliminary reference and the tracks

The sheets show each selected frame unmodified (no gain, no detector output), enlarged 3x around the fronts (x 170-490), with a
10-px grid labelled every 20 px in original image pixels and the two band limits. The annotator records, for each band,
the x of the visible end of the luminous sheet in the propagation direction (+x), or marks it absent.
The preliminary reference (one annotator, the AI assistant) is data/bass2/b1/annotations/b1-manual-annotations.csv and is
never overwritten here: a new annotator writes b1-annotations-<name>.csv (see docs/research/BASS2_B1_ANNOTATION_REVIEW.md).
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import overlay_bass2 as overlay  # noqa: E402
import segment_b1 as segment  # noqa: E402

ROOT = segment.ROOT
ANNOTATIONS = segment.B1 / 'annotations' / 'b1-manual-annotations.csv'
TEMPLATE = segment.B1 / 'annotations' / 'b1-annotation-template.csv'
SHEETS = segment.PREVIEWS / 'annotation'
COLUMNS = ['ts_frame', 'clock_display_raw', 'upper_front_px', 'upper_visible', 'lower_front_px', 'lower_visible',
           'annotator', 'method', 'note']
SCALE = 3
CROP = {'x': (170, 490), 'y': (240, 346)}
PER_SHEET = 4


def select_frames(config: dict, count_stable: int = 28, extra: tuple[int, ...] = (1070, 1090, 1105, 1120)) -> list[int]:
    stable = config['windows']['stable']
    chosen = np.linspace(stable['first'], stable['last'], count_stable).round().astype(int).tolist()
    return sorted(set(chosen) | set(extra))


def render(frame: np.ndarray, config: dict, label: str) -> np.ndarray:
    import cv2

    (x0, x1), (y0, y1) = CROP['x'], CROP['y']
    crop = cv2.resize(frame[y0:y1 + 1, x0:x1 + 1], None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_NEAREST)
    grid = crop.copy()
    for x in range(x0 - x0 % 10 + 10, x1 + 1, 10):
        px = (x - x0) * SCALE
        strong = x % 20 == 0
        cv2.line(grid, (px, 0), (px, grid.shape[0] - 1), (90, 90, 90) if strong else (45, 45, 45), 1)
        if strong:
            cv2.putText(grid, str(x), (px + 2, grid.shape[0] - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (200, 200, 200), 1)
    for band in segment.BANDS:
        for y in config['regions']['bands'][band]['y']:
            py = (y - y0) * SCALE
            for px in range(0, grid.shape[1], 8):
                grid[py, px:px + 3] = (0, 140, 200)
    header = np.zeros((20, grid.shape[1], 3), np.uint8)
    cv2.putText(header, label, (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
    return np.vstack([header, grid])


def prepare() -> None:
    config = segment.load_config()
    source = segment.resolve_source(config)
    frames = segment.read_video(source)
    times = segment.frame_times()
    chosen = select_frames(config)
    tiles = [render(frames[index], config, f'ts_frame {index}  relogio {times[index][2]}  x em pixels do quadro original')
             for index in chosen]
    SHEETS.mkdir(parents=True, exist_ok=True)
    for number, start in enumerate(range(0, len(tiles), PER_SHEET), start=1):
        overlay.write_image(SHEETS / f'sheet-{number:02d}.png', np.vstack(tiles[start:start + PER_SHEET]))
    TEMPLATE.parent.mkdir(parents=True, exist_ok=True)
    with TEMPLATE.open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=COLUMNS, lineterminator='\n')
        writer.writeheader()
        for index in chosen:
            writer.writerow({'ts_frame': index, 'clock_display_raw': times[index][2]})
    print(f'{len(chosen)} quadros; pranchas em {SHEETS.relative_to(ROOT).as_posix()}; modelo em {TEMPLATE.relative_to(ROOT).as_posix()}')


def annotator_file(annotator: str) -> Path:
    slug = re.sub(r'[^a-z0-9]+', '-', annotator.lower()).strip('-') or 'anotador'
    return ANNOTATIONS.parent / f'b1-annotations-{slug}.csv'


def interactive(annotator: str, output: Path) -> None:
    """Two clicks per frame (upper then lower front); right click = not visible. Needs a GUI backend."""
    import matplotlib

    if matplotlib.get_backend().lower() in ('agg', 'pdf', 'svg', 'ps', 'cairo', 'template'):
        raise SystemExit('Sem backend gráfico do matplotlib neste ambiente: use as pranchas de "prepare" e preencha o CSV.')
    import matplotlib.pyplot as plt

    config = segment.load_config()
    frames = segment.read_video(segment.resolve_source(config))
    times = segment.frame_times()
    rows = []
    for index in select_frames(config):
        figure, axis = plt.subplots(figsize=(13, 4))
        axis.imshow(frames[index][..., ::-1], extent=(-0.5, 719.5, 479.5, -0.5))
        axis.set_xlim(*CROP['x'])
        axis.set_ylim(CROP['y'][1], CROP['y'][0])
        axis.set_title(f'ts_frame {index}: clique a frente da banda superior e depois da inferior (botão direito = invisível)')
        clicks = plt.ginput(2, timeout=0, mouse_add=1, mouse_pop=None, mouse_stop=3)
        plt.close(figure)
        values = [round(x, 1) for x, _ in clicks] + [None] * (2 - len(clicks))
        rows.append({'ts_frame': index, 'clock_display_raw': times[index][2],
                     'upper_front_px': values[0], 'upper_visible': int(values[0] is not None),
                     'lower_front_px': values[1], 'lower_visible': int(values[1] is not None),
                     'annotator': annotator, 'method': 'interactive-matplotlib', 'note': ''})
    if output.resolve() == ANNOTATIONS.resolve() or output.exists():
        raise SystemExit(f'{output} já existe ou é a referência preliminar; escolha outro --output')
    with output.open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=COLUMNS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)
    print(f'{len(rows)} quadros gravados em {output}')


def agreement(a: dict[int, float | None], b: dict[int, float | None]) -> dict:
    """b - a over the frames where both have a position; also counts visibility disagreements."""
    common = sorted(set(a) & set(b))
    errors = [b[f] - a[f] for f in common if a[f] is not None and b[f] is not None]
    disagree = sum((a[f] is None) != (b[f] is None) for f in common)
    if not errors:
        return {'n': 0, 'visibilityDisagreements': disagree}
    values = np.array(errors)
    return {'n': len(values), 'mae': round(float(np.abs(values).mean()), 2), 'bias': round(float(values.mean()), 2),
            'rmse': round(float(np.sqrt((values ** 2).mean())), 2), 'maxAbs': round(float(np.abs(values).max()), 2),
            'visibilityDisagreements': disagree}


def compare(path: Path) -> dict:
    """New annotations against the preliminary reference and against every tracked series (stable window)."""
    new = read_annotations(path)
    old = read_annotations()
    stable = segment.load_config()['windows']['stable']
    with (segment.B1 / 'flamefront-tracks.csv').open(encoding='utf-8') as stream:
        tracks = list(csv.DictReader(stream))
    frames = {entry['ts_frame'] for entry in new if stable['first'] <= entry['ts_frame'] <= stable['last']}
    result = {'file': path.as_posix(), 'annotators': sorted({entry['annotator'] for entry in new}), 'frames': len(new),
              'vsPreliminaryReference': {}, 'vsTracksStableWindow': {}}
    for band in segment.BANDS:
        mine = {entry['ts_frame']: entry[band] for entry in new}
        result['vsPreliminaryReference'][band] = agreement({entry['ts_frame']: entry[band] for entry in old}, mine)
        result['vsTracksStableWindow'][band] = {}
        for name in sorted({row['series'] for row in tracks}):
            tracked = {int(row['ts_frame']): (float(row['tracked_px']) if row['tracked_px'] else None)
                       for row in tracks if row['band'] == band and row['series'] == name and int(row['ts_frame']) in frames}
            result['vsTracksStableWindow'][band][name] = agreement({f: mine[f] for f in frames}, tracked)
    return result


def read_annotations(path: Path = ANNOTATIONS) -> list[dict]:
    """Rows with float fronts (None when not visible); refuses inconsistent rows."""
    with path.open(encoding='utf-8') as stream:
        rows = list(csv.DictReader(stream))
    parsed = []
    for row in rows:
        entry = {'ts_frame': int(row['ts_frame']), 'annotator': row['annotator'], 'method': row['method'], 'note': row['note']}
        for band in segment.BANDS:
            visible = row[f'{band}_visible'].strip()
            value = row[f'{band}_front_px'].strip()
            if visible not in ('0', '1'):
                raise ValueError(f"quadro {row['ts_frame']}: {band}_visible deve ser 0 ou 1")
            if visible == '1' and not value:
                raise ValueError(f"quadro {row['ts_frame']}: {band} visível sem coordenada")
            if visible == '0' and value:
                raise ValueError(f"quadro {row['ts_frame']}: {band} invisível com coordenada")
            entry[band] = float(value) if visible == '1' else None
        if not row['annotator'].strip():
            raise ValueError(f"quadro {row['ts_frame']}: anotador ausente")
        parsed.append(entry)
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('command', choices=('prepare', 'interactive', 'check', 'compare'))
    parser.add_argument('--annotator', default='')
    parser.add_argument('--output', type=Path, help='CSV de saída do modo interactive (padrão: b1-annotations-<nome>.csv)')
    parser.add_argument('--file', type=Path, help='CSV a validar (check) ou a comparar (compare)')
    args = parser.parse_args()
    if args.command == 'prepare':
        prepare()
    elif args.command == 'interactive':
        if not args.annotator:
            parser.error('informe --annotator')
        interactive(args.annotator, args.output or annotator_file(args.annotator))
    elif args.command == 'compare':
        if not args.file:
            parser.error('informe --file com o CSV do novo anotador')
        print(json.dumps(compare(args.file), ensure_ascii=False, indent=1))
    else:
        rows = read_annotations(args.file or ANNOTATIONS)
        print(f'{len(rows)} quadros anotados; anotadores: {sorted({row["annotator"] for row in rows})}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
