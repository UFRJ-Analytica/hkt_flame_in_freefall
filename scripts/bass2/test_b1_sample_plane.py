"""public/data/bass2/b1-sample-plane.json: reproducible, copied from the P3 front-tracking configuration,
pixel units only (no mm/px), bands consistent with the replay series."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_b1_sample_plane as plane  # noqa: E402

DATA = json.loads(plane.OUTPUT.read_text(encoding='utf-8'))
CONFIG = json.loads(plane.CONFIG.read_text(encoding='utf-8'))
REPLAY = json.loads((plane.ROOT / 'public/data/bass2/b1-replay.json').read_text(encoding='utf-8'))


class B1SamplePlane(unittest.TestCase):
    def test_reproducible(self):
        self.assertEqual(plane.OUTPUT.read_bytes(), plane.render(plane.build()))

    def test_regions_are_copied_from_the_tracking_config(self):
        regions = CONFIG['regions']
        self.assertEqual(DATA['regions']['flame']['x'], regions['flame']['x'])
        self.assertEqual(DATA['regions']['flame']['y'], regions['flame']['y'])
        for band in ('upper', 'lower'):
            self.assertEqual(DATA['regions']['bands'][band]['y'], regions['bands'][band]['y'])
        self.assertEqual(DATA['regions']['gap']['y'], regions['gap']['y'])
        self.assertEqual(DATA['regions']['ignitor']['x'], regions['ignitor']['x'])

    def test_pixels_only(self):
        self.assertEqual(DATA['units'], 'px')
        self.assertIsNone(DATA['spatialScale']['mm_per_px'])
        self.assertEqual(DATA['spatialScale']['status'], 'insufficient')
        self.assertNotIn('mm/s', plane.OUTPUT.read_text(encoding='utf-8'))

    def test_tracked_positions_fall_inside_the_flame_region(self):
        x0, x1 = DATA['regions']['flame']['x']
        for band in ('upper', 'lower'):
            values = [x for x in REPLAY['series']['fronts'][band]['x_px'] if x is not None]
            self.assertTrue(values)
            self.assertTrue(all(x0 <= x <= x1 for x in values), band)

    def test_provenance(self):
        inputs = DATA['provenance']['inputs']
        self.assertEqual(inputs['flamefrontConfig']['sha256'], plane.sha256(plane.CONFIG))
        self.assertEqual(inputs['registration']['sha256'], plane.sha256(plane.REGISTRATION))


if __name__ == '__main__':
    unittest.main()
