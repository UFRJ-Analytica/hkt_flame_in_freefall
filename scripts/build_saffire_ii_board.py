"""Classify local orange luminosity in the selected PSI-99 camera frames."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('artifacts', type=Path)
    args = parser.parse_args()
    for sample in (1, 2, 3, 4, 7, 8, 9):
        path = args.artifacts / f'psi-99-ii{sample}-replay.json'
        source = json.loads(path.read_bytes())
        left = sample == 4
        observations = []
        for frame in source['frames']:
            with Image.open(args.artifacts / frame['path']) as image:
                rgb = np.asarray(image.convert('RGB'), dtype=np.int16)
            width = rgb.shape[1]
            roi = rgb[:, :width//3] if left else rgb[:, -width//3:]
            red, green, blue = roi.transpose(2, 0, 1)
            orange = (red >= 115) & (red - green >= 18) & (red - blue >= 45)
            count = int(orange.sum())
            observations.append({'timeSeconds': frame['timeSeconds'], 'orangePixels': count,
                                 'edgeGlow': count >= 12})
        result = {
            'schemaVersion': 1, 'experimentId': source['experimentId'],
            'kind': 'localized-observation', 'camera': source['camera'],
            'durationSeconds': source['durationSeconds'],
            'ignitionEdge': 'right' if left else 'left',
            'observations': observations, 'sourceUrl': source['sourceUrl'],
            'inputArchives': source['inputArchives'],
            'probability': None,
        }
        if sample == 7:
            # The experiment table reports a completely consumed 50 mm PMMA
            # section. The first sampled image after the reported burn with
            # no edge glow supplies a display timestamp for that end state.
            finished = next(o for o in observations if o['timeSeconds'] >= 139 and not o['edgeGlow'])
            result['endState'] = {'timeSeconds': finished['timeSeconds'], 'reachedMm': 50,
                                  'source': 'PSI-99 experimental table, sample 2-7, note 2'}
        print(sample, [(round(o['timeSeconds'],1), o['orangePixels']) for o in observations])
        (args.artifacts / f'psi-99-ii{sample}-board.json').write_text(json.dumps(result, indent=2)+'\n', encoding='utf-8', newline='\n')


if __name__ == '__main__':
    main()
