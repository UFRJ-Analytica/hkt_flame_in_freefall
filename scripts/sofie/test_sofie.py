"""SoFIE P0/P1 tests: synthetic checks of the pilot-video functions, manifest integrity, provenance and published values.

    python -m unittest discover -s scripts/sofie -p "test_*.py"

Tests that need the cached video are skipped when it is absent.
"""
import json
import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import fetch_sofie as fetch  # noqa: E402
import pilot_video as pilot  # noqa: E402


def rotating_blob(times: np.ndarray, frequency: float, size=(270, 480), radius=60, blob=18) -> np.ndarray:
    """A bright spot circling a centre (seen edge-on: x = cx + r sin(2 pi f t)), one frame per time."""
    h, w = size
    yy, xx = np.mgrid[0:h, 0:w]
    frames = []
    for t in times:
        cx = w / 2 + radius * math.sin(2 * math.pi * frequency * t)
        frame = np.zeros(size, np.uint8)
        frame[(xx - cx) ** 2 + (yy - h / 2) ** 2 <= blob ** 2] = 200
        frame[(xx - w / 2) ** 2 + (yy - h / 2) ** 2 <= 6 ** 2] = 120  # fixed core so both halves are never empty
        frames.append(frame)
    return np.array(frames)


class Cadence(unittest.TestCase):
    def test_triplicated_frames_give_period_three(self):
        rng = np.random.default_rng(0)
        sources = rng.integers(0, 255, size=(40, 27, 48)).astype(np.uint8)
        frames = np.repeat(sources, 3, axis=0)
        result = pilot.cadence(pilot.frame_differences(frames))
        self.assertEqual((result['period'], result['phase']), (3, 0))
        indices = pilot.unique_indices(len(frames), result['period'], result['phase'])
        self.assertEqual(indices.size, 40)
        self.assertTrue(np.array_equal(frames[indices], sources))

    def test_no_repetition_gives_period_one(self):
        rng = np.random.default_rng(1)
        frames = rng.integers(0, 255, size=(60, 27, 48)).astype(np.uint8)
        self.assertEqual(pilot.cadence(pilot.frame_differences(frames))['period'], 1)


class SceneChanges(unittest.TestCase):
    def test_abrupt_transition_splits_segments(self):
        times = np.arange(120) / 10
        frames = rotating_blob(times, 0.5)
        frames[60:] = np.roll(frames[60:], 150, axis=2)  # an edit: the whole scene jumps sideways
        frames[60:, :, :] = np.clip(frames[60:].astype(int) + 80, 0, 255).astype(np.uint8)
        changes = pilot.scene_changes(frames)
        self.assertIn(60, changes)
        segments = pilot.segments_from(len(frames), changes)
        self.assertEqual(segments[0], (0, 59))
        self.assertGreaterEqual(segments[-1][0], 61)

    def test_segments_exclude_transition_frames(self):
        self.assertEqual(pilot.segments_from(10, [4, 5]), [(0, 3), (6, 9)])
        self.assertEqual(pilot.segments_from(5, []), [(0, 4)])


class SpinFrequency(unittest.TestCase):
    def recover(self, frequency, drop=()):
        times = np.arange(0, 8, 0.1)  # 10 samples/s, as the unique frames of the pilot video
        frames = rotating_blob(times, frequency)
        signal = pilot.asymmetry(frames, frames.shape[2] / 2)
        signal[list(drop)] = np.nan  # missing frames are dropped by the periodogram, never zero-filled
        freqs, power = pilot.periodogram(times, signal, f_max=4.9)
        return float(freqs[int(np.argmax(power))])

    def test_known_frequency_is_recovered(self):
        for f in (0.8, 2.0, 3.0, 3.5):
            self.assertAlmostEqual(self.recover(f), f, delta=0.05)

    def test_missing_frames_do_not_shift_the_frequency(self):
        self.assertAlmostEqual(self.recover(3.0, drop=range(10, 18)), 3.0, delta=0.05)

    def test_frequency_above_nyquist_aliases_as_documented(self):
        # 6 Hz sampled at 10 Hz appears at 10 - 6 = 4 Hz: the caveat recorded in the pilot JSON.
        self.assertAlmostEqual(self.recover(6.0), 4.0, delta=0.05)

    def test_asymmetry_is_nan_without_flame(self):
        frames = np.zeros((3, 20, 20), np.uint8)
        self.assertTrue(np.isnan(pilot.asymmetry(frames, 10)).all())

    def test_permutation_threshold_separates_signal_from_noise(self):
        times = np.arange(0, 8, 0.1)
        rng = np.random.default_rng(3)
        noise = rng.normal(size=times.size)
        threshold = pilot.permutation_threshold(times, noise, 4.9, np.random.default_rng(5), n=100)
        periodic = pilot.asymmetry(rotating_blob(times, 3.0), 240)
        _, power = pilot.periodogram(times, periodic, 4.9)
        self.assertGreater(power.max(), threshold)

    def test_dim_windows_are_skipped_not_zero_filled(self):
        times = np.arange(0, 10, 0.1)
        signal = np.sin(2 * np.pi * 3 * times)
        lit = np.full(times.size, pilot.LIT_MIN - 1)
        windows = pilot.window_analysis(times, signal, lit, 4.9)
        self.assertTrue(windows)
        self.assertTrue(all(w['status'] == 'skipped-low-luminosity' and 'peak_Hz' not in w for w in windows))


class Manifest(unittest.TestCase):
    DATA = json.loads(fetch.MANIFEST.read_text(encoding='utf-8'))

    def test_every_file_has_origin_size_date_and_hash(self):
        for entry in self.DATA['files']:
            self.assertTrue(fetch.allowed(entry['url']), entry['id'])
            self.assertGreater(entry['bytes'], 0)
            self.assertEqual(len(entry['sha256']), 64)
            self.assertTrue(entry['retrievedAt'])
            self.assertTrue(entry['cachePath'].startswith('data/cache/sofie/'))

    def test_budgets(self):
        self.assertLessEqual(self.DATA['usedBytes'], fetch.BUDGET)
        videos = [e for e in self.DATA['files'] if e['kind'] == 'video']
        self.assertLessEqual(len(videos), 1)
        self.assertTrue(all(e['bytes'] <= fetch.VIDEO_LIMIT for e in videos))

    def test_pilot_video_association_is_recorded(self):
        video = next(e for e in self.DATA['files'] if e['kind'] == 'video')
        self.assertIn('1410C', video['associatedTest'])

    def test_failures_are_kept_with_reason(self):
        for failure in self.DATA['failures']:
            self.assertTrue(failure['reason'])
        self.assertIn('gel-cnf-2025', {f['id'] for f in self.DATA['failures']} | {e['id'] for e in self.DATA['files']})

    def test_hosts_are_restricted(self):
        self.assertFalse(fetch.allowed('http://ntrs.nasa.gov/x.pdf'))
        self.assertFalse(fetch.allowed('https://example.com/x.pdf'))


class PublishedTable(unittest.TestCase):
    DATA = json.loads((fetch.ROOT / 'data/sofie/gel-extinction-cases-ntrs20240007628.json').read_text(encoding='utf-8'))

    def test_strain_rate_follows_its_footnote_definition(self):
        # Both columns are printed with 2 decimals: 1.5/R x 0.005 + 0.005 = 0.00875 is the rounding bound.
        radius = self.DATA['sample']['diameter_cm'] / 2
        for case in self.DATA['cases']:
            self.assertAlmostEqual(1.5 * case['flow_cm_s'] / radius, case['strainRate_per_s'], delta=0.00875, msg=case['sample'])

    def test_reynolds_is_consistent_with_one_ambient_viscosity(self):
        viscosities = [case['flow_cm_s'] * self.DATA['sample']['diameter_cm'] / case['reynolds'] for case in self.DATA['cases']]
        self.assertLess(max(viscosities) - min(viscosities), 0.002)
        self.assertAlmostEqual(sum(viscosities) / len(viscosities), 0.15, delta=0.005)  # air near ambient, cm^2/s

    def test_missing_value_stays_null(self):
        case5 = next(c for c in self.DATA['cases'] if c['sample'] == '1410C')
        self.assertIsNone(case5['conductiveHeatLoss_W_cm2'])

    def test_pilot_uses_the_same_published_values(self):
        case5 = next(c for c in self.DATA['cases'] if c['sample'] == '1410C')
        published = pilot.PUBLISHED
        self.assertEqual((published['flow_cm_s'], published['o2_pct_at_extinction'], published['p_atm']),
                         (case5['flow_cm_s'], case5['o2_pct'], case5['p_atm']))
        self.assertEqual(published['spinFrequency_Hz'], self.DATA['dynamics']['1410C']['spinFrequency_Hz'])


class PilotResult(unittest.TestCase):
    DATA = json.loads(pilot.OUTPUT.read_text(encoding='utf-8'))

    def test_published_values_match_ntrs_table_1_case_5(self):
        published = self.DATA['published']
        self.assertEqual((published['test'], published['case']), ('1410C', 5))
        self.assertEqual((published['flow_cm_s'], published['o2_pct_at_extinction'], published['p_atm']), (49.68, 14.37, 1.07))
        self.assertEqual(published['spinFrequency_Hz'], [2.0, 3.5])

    def test_time_base_and_cadence(self):
        cadence = self.DATA['cadence']
        self.assertEqual(cadence['period'], 3)
        self.assertAlmostEqual(cadence['uniqueFramesPerVideoSecond'], self.DATA['video']['fps'] / 3)
        step = self.DATA['video']['timestampStep_s']
        self.assertAlmostEqual(step['min'], step['max'], places=4)

    def test_no_spatial_scale_and_no_physical_lengths(self):
        self.assertEqual(self.DATA['spatialScale']['status'], 'not-applied')
        text = pilot.OUTPUT.read_text(encoding='utf-8')
        for unit in ('_mm', 'mm/s', 'cm/s"', 'px_per_mm', 'mm_per_px'):
            self.assertNotIn(unit, text)

    def test_hypotheses_are_both_reported(self):
        hypotheses = self.DATA['spin']['summary']['hypotheses']
        self.assertEqual(set(hypotheses), {'H1_realTime', 'H2_slowMotion'})
        self.assertEqual(hypotheses['H2_slowMotion']['windowsInsidePublishedRange'], 0)
        self.assertGreater(hypotheses['H1_realTime']['windowsInsidePublishedRange'], 0)

    def test_windows_never_contain_nan(self):
        self.assertNotIn('NaN', pilot.OUTPUT.read_text(encoding='utf-8'))

    @unittest.skipUnless(pilot.VIDEO.exists(), 'vídeo piloto ausente do cache')
    def test_reproducible_from_the_cached_video(self):
        self.assertEqual(pilot.OUTPUT.read_text(encoding='utf-8').replace('\r\n', '\n'), pilot.render(pilot.analyse()))
        self.assertEqual(pilot.sha256(pilot.VIDEO), self.DATA['video']['sha256'])


if __name__ == '__main__':
    unittest.main()
