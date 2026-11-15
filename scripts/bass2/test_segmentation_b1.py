"""Flame-front detectors of segment_b1.py on synthetic profiles and frames (no video needed)."""
import copy
import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import segment_b1 as segment  # noqa: E402

CONFIG = segment.load_config()


def ramp_profile(length=200, start=20, front=120, level=150.0, taper=10):
    """Flat emission from `start` to `front`, then a linear decay to zero over `taper` pixels."""
    x = np.arange(length, dtype=float)
    profile = np.where((x >= start) & (x <= front), level, 0.0)
    tail = (x > front) & (x <= front + taper)
    profile[tail] = level * (1 - (x[tail] - front) / taper)
    return profile


def synthetic_frame(fronts: dict, level=150, start=100, taper=10, peak=None):
    """720 x 480 BGR frame with a grey luminous sheet in each band ending at fronts[band] (None = dark band)."""
    frame = np.zeros((480, 720, 3), np.uint8)
    for band, front in fronts.items():
        if front is None:
            continue
        y0, y1 = CONFIG['regions']['bands'][band]['y']
        row = ramp_profile(720, start, front, level, taper)
        if peak is not None:
            row[peak] = 250
        frame[y0:y1 + 1] = np.clip(row, 0, 255).astype(np.uint8)[None, :, None]
    return frame


class ProfileFront(unittest.TestCase):
    def test_single_band_leading_edge_is_the_threshold_crossing(self):
        # Linear decay 150 -> 0 over 10 px after x=120: I = 50 at x = 120 + 10*(100/150).
        result = segment.profile_front(ramp_profile(), 0, 50)
        self.assertTrue(result.present)
        self.assertAlmostEqual(result.front, 120 + 10 * 100 / 150, places=6)
        self.assertEqual(result.trailing, 20.0)

    def test_offset_of_the_roi_is_added(self):
        result = segment.profile_front(ramp_profile(), 40, 50)
        self.assertAlmostEqual(result.front, 40 + 120 + 10 * 100 / 150, places=6)

    def test_peak_is_the_maximum_and_independent_of_the_threshold(self):
        profile = ramp_profile()
        profile[70] = 220
        low, high = segment.profile_front(profile, 0, 30), segment.profile_front(profile, 0, 100)
        self.assertEqual(low.peak, 70.0)
        self.assertEqual(high.peak, 70.0)
        self.assertEqual(low.peak_value, 220.0)
        self.assertGreater(low.front, high.front)

    def test_negative_propagation_sign_takes_the_other_edge(self):
        profile = ramp_profile()[::-1].copy()          # emission decays towards smaller x
        result = segment.profile_front(profile, 0, 50, sign=-1)
        self.assertAlmostEqual(result.front, 199 - (120 + 10 * 100 / 150), places=6)

    def test_dark_profile_is_absent_with_a_reason_and_nan(self):
        result = segment.profile_front(np.full(200, 3.0), 0, 50)
        self.assertFalse(result.present)
        self.assertTrue(math.isnan(result.front))
        self.assertEqual(result.reason, 'pico abaixo do limiar')

    def test_front_touching_the_roi_edge_is_not_accepted(self):
        result = segment.profile_front(ramp_profile(front=198, taper=1), 0, 50)
        self.assertFalse(result.present)
        self.assertEqual(result.reason, 'frente no limite da ROI')


class FrameDetection(unittest.TestCase):
    def test_two_bands_are_measured_separately(self):
        frame = synthetic_frame({'upper': 300, 'lower': 260})
        upper = segment.detect_frame(frame, CONFIG, 'upper', 50)
        lower = segment.detect_frame(frame, CONFIG, 'lower', 50)
        expected = 10 * 100 / 150
        self.assertAlmostEqual(upper['A'].front, 300 + expected, delta=0.5)
        self.assertAlmostEqual(lower['A'].front, 260 + expected, delta=0.5)
        # Segmentation (global threshold) returns the last column at or above the threshold.
        self.assertEqual(upper['B_global'].front, 306.0)
        self.assertEqual(lower['B_global'].front, 266.0)
        self.assertTrue(all(result.present for name, result in upper.items() if name != 'C_blue'))

    def test_peak_location_in_a_frame(self):
        frame = synthetic_frame({'upper': 300, 'lower': 260}, peak=200)
        self.assertAlmostEqual(segment.detect_frame(frame, CONFIG, 'upper', 50)['A'].peak, 200, delta=2)

    def test_frame_without_flame_reports_absence_in_every_detector(self):
        frame = synthetic_frame({'upper': None, 'lower': None})
        for band in segment.BANDS:
            for name, result in segment.detect_frame(frame, CONFIG, band, 50).items():
                self.assertFalse(result.present, name)
                self.assertTrue(math.isnan(result.front), name)
                self.assertTrue(result.reason, name)

    def test_partial_interruption_keeps_the_lit_band(self):
        frame = synthetic_frame({'upper': None, 'lower': 280})
        self.assertFalse(segment.detect_frame(frame, CONFIG, 'upper', 50)['A'].present)
        self.assertTrue(segment.detect_frame(frame, CONFIG, 'lower', 50)['A'].present)

    def test_absent_values_are_written_empty_never_zero(self):
        frames = np.stack([synthetic_frame({'upper': None, 'lower': 280})])
        rows = segment.observation_rows(frames, CONFIG, {0: (0.167, 36576.143, '10:09:36')})
        upper = next(row for row in rows if row['band'] == 'upper')
        lower = next(row for row in rows if row['band'] == 'lower')
        for method in segment.METHODS:
            self.assertEqual(upper[f'{method}_present'], 0)
            self.assertEqual(upper[f'{method}_front_px'], '')
            self.assertNotEqual(upper[f'{method}_reason'], '')
        self.assertNotEqual(lower['A_front_px'], '')
        self.assertEqual(upper['timestamp_experiment_s'], '36576.143')

    def test_blue_detector_needs_blue_dominant_pixels(self):
        frame = synthetic_frame({'upper': 300, 'lower': None})
        self.assertFalse(segment.detect_frame(frame, CONFIG, 'upper', 50)['C_blue'].present)   # grey, not blue
        y0, y1 = CONFIG['regions']['bands']['upper']['y']
        frame[y0:y1 + 1, 310:330] = (120, 20, 20)                                           # BGR: blue tip
        blue = segment.detect_frame(frame, CONFIG, 'upper', 50)['C_blue']
        self.assertTrue(blue.present)
        self.assertEqual(blue.front, 329.0)


class ConfigValidation(unittest.TestCase):
    def test_versioned_config_is_valid(self):
        segment.validate_config(CONFIG)

    def test_overlapping_bands_are_refused(self):
        bad = copy.deepcopy(CONFIG)
        bad['regions']['bands']['lower']['y'] = [270, 300]
        with self.assertRaisesRegex(ValueError, 'sobrep'):
            segment.validate_config(bad)

    def test_region_inside_the_overlay_is_refused(self):
        bad = copy.deepcopy(CONFIG)
        bad['regions']['flame']['y'] = [60, 355]
        with self.assertRaisesRegex(ValueError, 'sobreposição'):
            segment.validate_config(bad)

    def test_region_outside_the_frame_is_refused(self):
        bad = copy.deepcopy(CONFIG)
        bad['regions']['flame']['x'] = [40, 760]
        with self.assertRaisesRegex(ValueError, 'fora do quadro'):
            segment.validate_config(bad)

    def test_band_outside_the_flame_region_is_refused(self):
        bad = copy.deepcopy(CONFIG)
        bad['regions']['bands']['upper']['y'] = [200, 240]
        with self.assertRaisesRegex(ValueError, 'fora da região'):
            segment.validate_config(bad)

    def test_invalid_propagation_sign_is_refused(self):
        bad = copy.deepcopy(CONFIG)
        bad['coordinates']['propagationSign'] = 0
        with self.assertRaises(ValueError):
            segment.validate_config(bad)

    def test_empty_band_after_roi_change_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'banda vazia'):
            segment.detect_frame(synthetic_frame({'upper': 300}), CONFIG, 'upper', 50, half_width_delta=-20)


if __name__ == '__main__':
    unittest.main()
