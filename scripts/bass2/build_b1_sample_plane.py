"""Image-plane geometry of BASS-II test B1 for the "BASS-II B1 — Experimental Replay" renderer.

    python scripts/bass2/build_b1_sample_plane.py          # writes public/data/bass2/b1-sample-plane.json
    python scripts/bass2/build_b1_sample_plane.py --check  # rebuilds in memory and compares with the file

Copies, without measuring, fitting or converting anything, the regions and axes that the P3 front
tracking used (data/bass2/b1/flamefront-config.json): the 720 x 480 side-video frame, the flame region,
the two luminous bands, the dark gap and the saturated ignitor area. Coordinates stay in image pixels;
there is no mm/px scale (registration.json: insufficient). The replay draws the sample in this image
plane instead of a perspective sample, because no 3-D geometry of the B1 film is registered to the video.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONFIG = ROOT / 'data/bass2/b1/flamefront-config.json'
REGISTRATION = ROOT / 'data/bass2/b1/registration.json'
OUTPUT = ROOT / 'public/data/bass2/b1-sample-plane.json'
FRAME = {'width_px': 720, 'height_px': 480}
LABELS = {
    'flame': 'region containing both luminous sheets and the ignitor',
    'upper': 'upper luminous band (one side of the film)',
    'lower': 'lower luminous band (other side of the film)',
    'gap': 'dark gap between the bands (not used for the front)',
    'ignitor': 'saturated ignitor glow (frames 280–331)',
    'overlay': 'telemetry overlay (excluded)',
}


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def build() -> dict:
    config = json.loads(CONFIG.read_text(encoding='utf-8'))
    registration = json.loads(REGISTRATION.read_text(encoding='utf-8'))
    regions = config['regions']
    coordinates = config['coordinates']
    if coordinates['propagationAxis'] != 'x' or coordinates['propagationSign'] != 1:
        raise ValueError('B1 propagation is expected along +x of the image')
    status = registration.get('status') or registration.get('spatialScale', {}).get('status')
    return {
        'schemaVersion': 1,
        'recordId': config['recordId'],
        'test': config['test'],
        'units': 'px',
        'frame': FRAME,
        'origin': 'top-left corner of the 720 x 480 TS frame; x grows to the right, y grows downwards',
        'propagation': {'axis': 'x', 'sign': 1,
                        'leadingEdge': 'end of the emission in the propagation direction (+x), i.e. upstream of the opposed flow'},
        'regions': {
            'flame': {'x': regions['flame']['x'], 'y': regions['flame']['y'], 'label': LABELS['flame']},
            'bands': {band: {'y': regions['bands'][band]['y'], 'label': LABELS[band]} for band in ('upper', 'lower')},
            'gap': {'y': regions['gap']['y'], 'label': LABELS['gap']},
            'ignitor': {'x': regions['ignitor']['x'], 'y': regions['ignitor']['y'], 'label': LABELS['ignitor']},
            'overlay': {'x': regions['overlay']['x'], 'y': regions['overlay']['y'], 'label': LABELS['overlay']},
        },
        'spatialScale': {'status': status, 'mm_per_px': None},
        'drawingNote': ('Drawn in the image plane of the side video, to scale in pixels. A perspective sample (parallelogram) '
                        'is not used: no 3-D geometry of the B1 film is registered to this view.'),
        'provenance': {
            'generator': 'scripts/bass2/build_b1_sample_plane.py',
            'inputs': {
                'flamefrontConfig': {'path': CONFIG.relative_to(ROOT).as_posix(), 'sha256': sha256(CONFIG)},
                'registration': {'path': REGISTRATION.relative_to(ROOT).as_posix(), 'sha256': sha256(REGISTRATION)},
            },
        },
    }


def render(value: dict) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=1) + '\n').encode('utf-8')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    rendered = render(build())
    if args.check:
        same = OUTPUT.exists() and OUTPUT.read_bytes() == rendered
        print('reproducible' if same else 'DIFFERENT')
        return 0 if same else 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(rendered)
    print(f'{OUTPUT.relative_to(ROOT).as_posix()}: {len(rendered)} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
