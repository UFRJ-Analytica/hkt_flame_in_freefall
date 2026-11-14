"""Invariants of the published SAFFIRE I/III cross-trial artefact (no frames needed)."""
import json
import unittest
from pathlib import Path

DATA = json.loads((Path(__file__).resolve().parents[1] / 'public/data/saffire/crosstrial-i-iii.json').read_text(encoding='utf-8'))


class SaffireIIIArtefact(unittest.TestCase):
    def test_counts_are_consistent(self):
        for key, value in DATA['neighborhood']['combinations'].items():
            with self.subTest(key=key):
                self.assertLessEqual(value['transitions'], value['exposures'])
                if value['probability'] is not None:
                    self.assertAlmostEqual(value['probability'], value['transitions'] / value['exposures'])

    def test_beta_matches_the_two_speeds(self):
        import math
        c = DATA['comparisonWithSaffireI']
        self.assertAlmostEqual(c['beta'], math.log(c['saffireIIIObservedSpeedMmS'] / c['saffireIObservedSpeedMmS']) / math.log(c['flowRatio']))

    def test_front_is_monotone_and_inside_the_camera_field(self):
        values = [p['frontMedianMm'] for p in DATA['observedTrajectory'] if p['frontMedianMm'] is not None]
        self.assertEqual(values, sorted(values))
        self.assertLessEqual(max(values), DATA['visibleLengthMm'])

    def test_prediction_is_out_of_trial(self):
        self.assertIn('sem reajuste', DATA['prediction']['description'])


if __name__ == '__main__':
    unittest.main()
