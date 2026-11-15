"""Gated tracking of track_b1.py: known positions, outliers, gaps, no monotonic constraint, time preserved."""
import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import segment_b1 as segment  # noqa: E402
import track_b1 as track  # noqa: E402


class Gate(unittest.TestCase):
    def test_known_positions_are_returned_unchanged(self):
        positions = 200 + 0.33 * np.arange(100)
        tracked, flags = track.gate_track(positions, gate=40, history=15)
        np.testing.assert_array_equal(tracked, positions)
        self.assertEqual(set(flags), {'ok'})

    def test_isolated_jumps_are_flagged_and_left_out(self):
        positions = 200 + 0.33 * np.arange(60)
        positions[[20, 41]] = [400, 10]
        tracked, flags = track.gate_track(positions, gate=40, history=15)
        self.assertTrue(math.isnan(tracked[20]) and math.isnan(tracked[41]))
        self.assertEqual(flags[20], 'rejeitado_salto')
        self.assertEqual(flags[41], 'rejeitado_salto')
        self.assertEqual(tracked[21], positions[21])

    def test_missing_frames_stay_missing_without_interpolation_or_zero(self):
        positions = 200 + 0.33 * np.arange(40)
        positions[10:15] = np.nan
        tracked, flags = track.gate_track(positions, gate=40, history=15)
        self.assertTrue(np.isnan(tracked[10:15]).all())
        self.assertEqual(flags[10:15], ['ausente'] * 5)
        self.assertFalse((tracked == 0).any())

    def test_detector_absence_flag_wins_over_a_stale_value(self):
        positions = 200 + 0.33 * np.arange(20)
        present = np.ones(20, bool)
        present[5] = False
        tracked, flags = track.gate_track(positions, gate=40, history=15, present=present)
        self.assertTrue(math.isnan(tracked[5]))
        self.assertEqual(flags[5], 'ausente')

    def test_a_real_recession_is_kept_no_monotonic_constraint(self):
        positions = np.concatenate([np.linspace(200, 260, 30), np.linspace(259, 240, 20), np.linspace(241, 300, 30)])
        tracked, _ = track.gate_track(positions, gate=40, history=15)
        np.testing.assert_array_equal(tracked, positions)
        self.assertTrue((np.diff(tracked) < 0).any())

    def test_persistent_jump_is_reacquired(self):
        positions = np.concatenate([np.full(30, 180.0), np.full(40, 240.0)])
        tracked, flags = track.gate_track(positions, gate=40, history=15)
        self.assertIn('reaquisicao', flags)
        self.assertEqual(tracked[-1], 240.0)
        self.assertEqual(flags[30], 'rejeitado_salto')

    def test_inconsistent_start_does_not_seed_the_reference(self):
        positions = np.array([500.0, 200, 201, 202, 203, 204])
        tracked, flags = track.gate_track(positions, gate=40, history=15)
        self.assertTrue(math.isnan(tracked[0]))
        self.assertEqual(flags[0], 'sem_referencia')
        np.testing.assert_array_equal(tracked[1:], positions[1:])


class Smoothing(unittest.TestCase):
    def test_running_median_ignores_nan_and_does_not_fill_gaps(self):
        values = np.array([1.0, 2, np.nan, 4, 5, 6, np.nan, 8, 9])
        smoothed = track.running_median(values, 3)
        self.assertTrue(math.isnan(smoothed[2]) and math.isnan(smoothed[6]))
        self.assertEqual(smoothed[4], 5.0)


class Rows(unittest.TestCase):
    CONFIG = segment.load_config()

    def observations(self, n=30):
        rows = []
        for frame in range(n):
            for band in segment.BANDS:
                row = {'ts_frame': str(frame), 'band': band, 'timestamp_video_s': f'{0.167 + frame / 29.97:.4f}',
                       'timestamp_experiment_s': f'{36576.143 + 0.99955 * frame / 29.97:.3f}', 'clock_display_raw': '10:09:36'}
                for method in segment.METHODS:
                    lit = not (band == 'upper' and 10 <= frame < 13)
                    row.update({f'{method}_present': '1' if lit else '0',
                                f'{method}_front_px': f'{250 + frame:.3f}' if lit else '',
                                f'{method}_peak_px': f'{200 + frame:.3f}', f'{method}_confidence': 'high' if lit else 'none'})
                rows.append(row)
        return rows

    def test_experiment_time_is_copied_unchanged(self):
        observations = self.observations()
        tracks = track.build_tracks(observations, self.CONFIG)
        source = {(row['ts_frame'], row['band']): row['timestamp_experiment_s'] for row in observations}
        for row in tracks:
            self.assertEqual(row['timestamp_experiment_s'], source[(str(row['ts_frame']), row['band'])])
        self.assertEqual(len(tracks), len(observations) * len(track.SERIES) // 1)

    def test_absent_frames_are_empty_in_the_tracks(self):
        tracks = track.build_tracks(self.observations(), self.CONFIG)
        gap = [row for row in tracks if row['band'] == 'upper' and row['series'] == 'A_front' and 10 <= row['ts_frame'] < 13]
        self.assertEqual([row['tracked_px'] for row in gap], ['', '', ''])
        self.assertEqual([row['flag'] for row in gap], ['ausente'] * 3)
        # The peak of an unlit band is not reported as a front position either.
        peak = [row for row in tracks if row['band'] == 'upper' and row['series'] == 'A_peak' and 10 <= row['ts_frame'] < 13]
        self.assertEqual([row['raw_px'] for row in peak], ['', '', ''])

    def test_missing_frame_in_the_observations_is_refused(self):
        observations = [row for row in self.observations() if row['ts_frame'] != '5']
        with self.assertRaisesRegex(ValueError, 'faltando'):
            track.build_tracks(observations, self.CONFIG)


if __name__ == '__main__':
    unittest.main()
