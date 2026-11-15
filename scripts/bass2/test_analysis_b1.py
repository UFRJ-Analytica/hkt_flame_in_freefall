"""Velocity analysis of analyze_b1.py on synthetic data, and the rules of the versioned result."""
import json
import re
import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import analyze_b1 as analyze  # noqa: E402
import segment_b1 as segment  # noqa: E402
import track_b1 as track  # noqa: E402
from test_segmentation_b1 import CONFIG, synthetic_frame  # noqa: E402

DT = 1001 / 30000


class Regression(unittest.TestCase):
    def test_exact_line_is_recovered(self):
        t = np.arange(700) * DT
        fit = analyze.ols(t, 230 + 9.5 * t)
        self.assertAlmostEqual(fit['slope'], 9.5, places=9)
        self.assertAlmostEqual(fit['intercept'], 230, places=6)
        self.assertAlmostEqual(fit['r2'], 1.0, places=12)

    def test_missing_positions_are_ignored_not_zeroed(self):
        t = np.arange(300) * DT
        x = 230 + 9.5 * t
        x[50:80] = np.nan
        self.assertAlmostEqual(analyze.ols(t, x)['slope'], 9.5, places=9)

    def test_known_velocity_with_correlated_noise_is_inside_the_block_bootstrap_interval(self):
        rng = np.random.default_rng(7)
        t = np.arange(717) * DT
        noise = np.zeros(717)
        for i in range(1, 717):                       # AR(1), like flicker that persists over frames
            noise[i] = 0.9 * noise[i - 1] + rng.normal(0, 1.5)
        x = 230 + 9.5 * t + noise
        processing = CONFIG['processing']
        fit = analyze.velocity_fit(t, x, processing, DT)
        low, high = fit['ci95']
        self.assertLess(low, 9.5)
        self.assertGreater(high, 9.5)
        # Autocorrelated residuals: the block interval is wider than the naive one.
        self.assertGreater((high - low) / 3.92, fit['seNaive'])
        self.assertGreater(fit['lag1Autocorrelation'], 0.7)
        self.assertGreater(fit['seHac'], fit['seNaive'])

    def test_bootstrap_is_reproducible_with_the_seed(self):
        t = np.arange(200) * DT
        x = 230 + 9.5 * t + np.sin(t * 7)
        a = analyze.block_bootstrap_slopes(t, x, 30, 200, 2014)
        b = analyze.block_bootstrap_slopes(t, x, 30, 200, 2014)
        np.testing.assert_array_equal(a, b)


class Stability(unittest.TestCase):
    def test_steady_propagation_has_constant_local_and_start_scan_slopes(self):
        t = np.arange(717) * DT
        x = 230 + 9.5 * t
        local = analyze.local_velocity(t, x, 4.0, 1.0)
        self.assertGreater(len(local), 15)
        self.assertTrue(all(abs(item['slope'] - 9.5) < 1e-9 for item in local))
        summary = analyze.stability(t, x, local)
        self.assertAlmostEqual(summary['halfRatio'], 1.0, places=9)
        self.assertTrue(all(abs(item['slope'] - 9.5) < 1e-9 for item in analyze.start_scan(t, x)))

    def test_early_transient_is_visible_in_the_halves_and_the_start_scan(self):
        t = np.arange(717) * DT
        x = np.where(t < 3, 240.0, 240 + 9.5 * (t - 3))  # front held still for 3 s, then steady
        summary = analyze.stability(t, x, analyze.local_velocity(t, x, 4.0, 1.0))
        self.assertGreater(summary['halfRatio'], 1.1)
        scan = {item['startDelay_s']: item['slope'] for item in analyze.start_scan(t, x)}
        self.assertLess(scan[0], 9.5)
        self.assertAlmostEqual(scan[3], 9.5, delta=0.01)


class ThresholdSensitivity(unittest.TestCase):
    def test_tapered_flame_moves_at_the_same_speed_for_every_threshold(self):
        # A flame of fixed shape moving 10 px per frame: the threshold shifts the position, not the speed.
        frames = [synthetic_frame({'upper': 220 + 10 * k, 'lower': 210 + 10 * k}, taper=30) for k in range(12)]
        t = np.arange(12) * DT
        offsets, slopes = [], []
        for threshold in (30, 70, 120):
            x = np.array([segment.detect_frame(frame, CONFIG, 'upper', threshold)['A'].front for frame in frames])
            fit = analyze.ols(t, x)
            slopes.append(fit['slope'])
            offsets.append(x[0])
        self.assertTrue(all(abs(slope - 10 / DT) < 0.01 / DT for slope in slopes))
        self.assertGreater(offsets[0], offsets[1])
        self.assertGreater(offsets[1], offsets[2])


class ReferenceComparison(unittest.TestCase):
    def test_metrics_on_known_differences(self):
        reference = [{'ts_frame': 1, 'upper': 100.0}, {'ts_frame': 2, 'upper': 110.0}, {'ts_frame': 3, 'upper': 120.0},
                     {'ts_frame': 4, 'upper': None}, {'ts_frame': 5, 'upper': 130.0}]
        tracked = {1: 102.0, 2: 106.0, 3: math.nan, 4: 50.0, 5: math.nan}
        raw = {1: 102.0, 2: 106.0, 3: 160.0, 4: 50.0, 5: math.nan}
        metrics = analyze.compare_with_reference(tracked, raw, reference, 'upper')
        self.assertEqual(metrics['n'], 2)
        self.assertAlmostEqual(metrics['mae'], 3.0)
        self.assertAlmostEqual(metrics['bias'], -1.0)
        self.assertAlmostEqual(metrics['rmse'], math.sqrt(10))
        self.assertEqual(metrics['maxAbs'], 4.0)
        self.assertAlmostEqual(metrics['coverage'], 0.5)
        self.assertAlmostEqual(metrics['rejection'], 0.25)
        self.assertEqual(metrics['falsePositives'], 1)


class Units(unittest.TestCase):
    def test_px_per_second_is_not_converted_without_validated_calibration(self):
        registration = json.loads(analyze.REGISTRATION.read_text(encoding='utf-8'))
        self.assertNotEqual(registration['status'], 'validated')
        with self.assertRaisesRegex(ValueError, 'não validada'):
            analyze.physical_velocity(9.5, registration)

    def test_conversion_only_with_a_validated_registration(self):
        validated = {'status': 'validated', 'transformation': {'axes': {'x': {'scale_mm_per_px': 0.2, 'origin_px': 0}}}}
        self.assertAlmostEqual(analyze.physical_velocity(10.0, validated), 2.0)


@unittest.skipUnless(analyze.RESULT.exists(), 'flamefront-pixel.json ainda não gerado')
class VersionedResult(unittest.TestCase):
    RESULT = json.loads(analyze.RESULT.read_text(encoding='utf-8')) if analyze.RESULT.exists() else {}

    def test_velocities_are_pixels_and_the_nasa_value_is_reference_only(self):
        result = self.RESULT
        self.assertEqual(result['units']['velocity'], 'px/s')
        self.assertEqual(result['physicalVelocity']['status'], 'blocked_spatial_calibration')
        self.assertIsNone(result['physicalVelocity']['value_mm_s'])
        self.assertEqual(result['nasaReference']['comparisonStatus'], 'blocked_spatial_calibration')
        self.assertEqual(result['nasaReference']['value_mm_s'], 2.2)
        def keys(value):
            if isinstance(value, dict):
                for key, item in value.items():
                    yield key
                    yield from keys(item)
            elif isinstance(value, list):
                for item in value:
                    yield from keys(item)
        for section in ('primary', 'trackedSeries', 'candidates', 'thresholdSensitivity', 'roiSensitivity'):
            self.assertFalse([key for key in keys(result[section]) if re.search(r'(_mm|mm_|Mm|mm/s)', key)], section)
        self.assertNotIn('mm/s', json.dumps(result['primary'], ensure_ascii=False))

    def test_window_matches_the_p2_time_base(self):
        window = self.RESULT['window']
        times = segment.frame_times()
        self.assertEqual((window['firstFrame'], window['lastFrame']), (332, 1048))
        self.assertEqual(window['clockFirst'], times[332][2])
        self.assertAlmostEqual(window['experimentTimeFirst_s'], times[332][1], places=3)
        self.assertEqual(window['frames'], 717)

    def test_both_bands_and_both_front_definitions_are_reported(self):
        for band in segment.BANDS:
            for series in ('A_front', 'A_peak'):
                fit = self.RESULT['trackedSeries'][band][series]
                self.assertIsNotNone(fit['slope'])
                self.assertEqual(len(fit['ci95']), 2)
            self.assertIn(band, self.RESULT['primary']['bands'])

    def test_tracked_series_names_match_the_tracker(self):
        self.assertEqual(set(self.RESULT['trackedSeries']['upper']), {name for name, _, _ in track.SERIES})


if __name__ == '__main__':
    unittest.main()
