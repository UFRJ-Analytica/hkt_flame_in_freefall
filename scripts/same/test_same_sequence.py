"""public/data/same/same-sequence.json: reproducible, recorded order, GMT conversions checked against the stored
epochs, values and units equal the P1 reduction, no resampled series."""
import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_same_sequence as sequence  # noqa: E402

DATA = json.loads(sequence.text(sequence.OUTPUT))
SOURCE = json.loads(sequence.text(sequence.SOURCE))
STATE_TESTS = {t['test']: t for t in SOURCE['tests'] if (t.get('housekeeping') or {}).get('method') == 'state'}


class SameSequence(unittest.TestCase):
    def test_reproducible(self):
        self.assertEqual(sequence.text(sequence.OUTPUT), sequence.render(sequence.build()))

    def test_only_tests_with_recorded_windows(self):
        self.assertEqual([t['test'] for t in DATA['tests']], sorted(STATE_TESTS))
        self.assertEqual(len(DATA['tests']), 15)

    def test_gmt_conversion_matches_stored_epochs(self):
        self.assertEqual(sequence.epoch('2007/254/17:12:47'), 1189530767.0)
        for test in STATE_TESTS.values():
            for window in test['housekeeping']['windows']:
                self.assertEqual(sequence.epoch(window['start']), window['startEpoch_s'])
                self.assertEqual(sequence.epoch(window['end']), window['endEpoch_s'])
        with self.assertRaises(ValueError):
            sequence.checked('2007/254/17:12:47', 1189530768.0)

    def test_order_and_bounds(self):
        for test in DATA['tests']:
            starts = [w['start_s'] for w in test['windows']]
            self.assertEqual(starts, sorted(starts))
            self.assertEqual(len(set(starts)), len(starts))
            for window in test['windows']:
                self.assertTrue(0 <= window['start_s'] < window['end_s'] <= test['duration_s'])
                if window['plateau']:
                    self.assertTrue(window['start_s'] <= window['plateau']['start_s'] <= window['plateau']['end_s'] <= window['end_s'])
            if test['sampleHeating']:
                self.assertTrue(0 <= test['sampleHeating']['start_s'] <= test['sampleHeating']['end_s'] <= test['duration_s'])

    def test_heating_is_continuous_only_when_the_sample_count_proves_it(self):
        by_test = {t['test']: t for t in DATA['tests']}
        self.assertFalse(by_test[23]['sampleHeating']['continuousAt1Hz'])  # 106 samples over 4516 s
        self.assertEqual(by_test[23]['sampleHeating']['samples'], 106)
        self.assertTrue(by_test[2]['sampleHeating']['continuousAt1Hz'])
        for test in DATA['tests']:
            h = test['sampleHeating']
            self.assertEqual(h['continuousAt1Hz'], h['samples'] == int(h['end_s'] - h['start_s']) + 1)

    def test_values_and_units_equal_the_reduction(self):
        units = SOURCE['units']['channels']
        for channel in DATA['channels']:
            self.assertEqual(channel['unit'], units[channel['key']]['unit'])
            self.assertEqual(channel['column'], units[channel['key']]['column'])
        for test in DATA['tests']:
            source = STATE_TESTS[test['test']]['housekeeping']
            self.assertEqual(test['baseline']['values'], source['baseline'])
            for window, original in zip(test['windows'], source['windows'], strict=True):
                self.assertEqual(window['role'], original['role'])
                self.assertEqual(window['samples'], original['samples'])
                for key, stats in window['channels'].items():
                    expected = original['channels'].get(key)
                    self.assertEqual(None if stats is None else stats['median'], None if expected is None else expected['median'])
                    if stats:
                        self.assertEqual(stats['n'], expected['n'])

    def test_no_invented_samples(self):
        raw = sequence.text(sequence.OUTPUT)
        for forbidden in ('"series"', '"timeSeries"', 'interpolat', 'resampl', 'concentrationField', 'particleTrajectory'):
            self.assertNotIn(forbidden, raw)
        for test in DATA['tests']:
            for window in test['windows']:
                for stats in window['channels'].values():
                    self.assertFalse(stats and any(isinstance(v, list) for v in stats.values()))

    def test_provenance(self):
        source = DATA['provenance']['inputs']['tests']
        self.assertEqual(source['sha256LfNormalised'], hashlib.sha256(sequence.text(sequence.SOURCE).encode('utf-8')).hexdigest())
        self.assertNotIn('data/cache', sequence.text(sequence.OUTPUT))


if __name__ == '__main__':
    unittest.main()
