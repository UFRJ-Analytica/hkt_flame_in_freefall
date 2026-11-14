"""Export original frames for the SAFFIRE II runs without a calibrated grid model."""
import argparse
from bisect import bisect_left, bisect_right
from contextlib import ExitStack
from io import BytesIO
import json
from pathlib import Path
from zipfile import ZipFile

import numpy as np
from PIL import Image

from ingest_saffire_ii import DIRECTORY, MANIFEST, frames, sha256
from sync_nasa import atomic_write, json_bytes

REPLAYS = {
    1: ('S1C2', (2, 6, 9, 12, 14, 16, 20, 28, 40, 60)),
    2: ('S2C2', (2, 6, 9, 12, 14, 16, 20, 28, 40, 60)),
    3: ('S3C2', (2, 6, 9, 12, 14, 16, 20, 28, 40, 60)),
    4: ('S4C2', (2, 6, 9, 12, 14, 16, 20, 28, 40, 60)),
    7: ('S7C1', (2, 6, 10, 20, 28, 40, 60, 80, 100, 120, 140, 170)),
    8: ('S8C1', (2, 6, 12, 20, 30, 40, 80, 120, 170, 260, 450, 600, 640)),
    9: ('S9C1', (2, 6, 12, 20, 30, 40, 80, 120, 170, 260, 450, 600, 750, 900, 940)),
}


def score(data, prefer_glow):
    with Image.open(BytesIO(data)) as frame:
        frame.draft('RGB', (100, 40))
        image = np.asarray(frame.convert('RGB'), dtype=np.int16)
    red, green, blue = image.transpose(2, 0, 1)
    lit = np.mean(green - red > 30)
    orange = np.mean((red > 105) & (red - blue > 30) & (red > green + 15))
    return orange + lit*.002 if prefer_glow else lit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_bytes())
    for sample, (camera, targets) in REPLAYS.items():
        sequence = {}
        sources = []
        with ExitStack() as stack:
            for asset in manifest['assets']:
                if asset['status'] != 'available' or camera not in asset.get('sequences', {}):
                    continue
                path = DIRECTORY / asset['name']
                if sha256(path) != asset['sha256']:
                    raise ValueError(f'Hash divergente: {path.name}')
                archive = stack.enter_context(ZipFile(path))
                for label, timestamp, entry in frames(archive):
                    if label != camera:
                        continue
                    prior = sequence.setdefault(timestamp, (archive, entry))
                    if prior[1].CRC != entry.CRC:
                        raise ValueError(f'Quadros conflitantes em {timestamp}')
                sources.append(asset['name'])
            stamps = sorted(sequence)
            if not stamps:
                raise ValueError(f'Sem quadros para {camera}.')
            baseline = stamps[0]
            folder = args.output / 'ii-replays' / str(sample)
            folder.mkdir(parents=True, exist_ok=True)
            selected = []
            for ordinal, target_s in enumerate(targets):
                target = baseline + target_s * 1000
                selected_stamps = stamps[bisect_left(stamps, target-550):bisect_right(stamps, target+550):3]
                if not selected_stamps:
                    raise ValueError(f'{camera}: lacuna perto de {target_s} s.')
                prefer_glow = (8 <= target_s <= 16) if sample < 5 else (8 <= target_s < targets[-1])
                options = [(t, sequence[t][0].read(sequence[t][1])) for t in selected_stamps]
                stamp, data = max(options, key=lambda option: score(option[1], prefer_glow))
                path = f'ii-replays/{sample}/{ordinal:02d}.jpg'
                atomic_write(args.output / path, data)
                selected.append({'timeSeconds': (stamp-baseline)/1000, 'path': path})
        artifact = {
            'schemaVersion': 1, 'experimentId': f'PSI-99:t0:r{sample+1}', 'camera': camera,
            'kind': 'observed-frames', 'frames': selected, 'durationSeconds': selected[-1]['timeSeconds'],
            'frameCountInArchives': len(stamps), 'timestampOriginMs': baseline,
            'inputArchives': sources, 'sourceUrl': 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-99',
        }
        atomic_write(args.output / f'psi-99-ii{sample}-replay.json', json_bytes(artifact))
        print(f'II-{sample}: {camera} · {len(stamps)} quadros no cache · {len(selected)} quadros publicados')


if __name__ == '__main__':
    main()
