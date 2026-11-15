"""Data-only scientific acceptance gates; no UI, cache, network or simulation."""
import copy
import hashlib
import json
import math
import unittest
from pathlib import Path

from build_trial_registry import build_registry, validate_registry

ROOT = Path(__file__).resolve().parents[1]


class AcceptanceDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.payload = json.loads((ROOT / 'public/data/saffire/trial-registry.json').read_text(encoding='utf-8'))
        cls.trials = {t['id']: t for t in cls.payload['trials']}

    def test_saved_registry_is_exactly_rebuildable_from_published_bytes(self):
        validate_registry(self.payload, ROOT)
        self.assertEqual(self.payload, build_registry(ROOT))
        for trial in self.trials.values():
            artifact = trial['model']['artifact']
            self.assertEqual(trial['model']['artifactSha256'], hashlib.sha256((ROOT / artifact).read_bytes()).hexdigest())

    def test_unmeasured_pressure_is_never_an_atmospheric_default(self):
        for trial_id, trial in self.trials.items():
            if trial['investigation'] is not None:
                self.assertIsNone(trial['conditions']['pressureKpa'], trial_id)
                self.assertTrue(any('pressureKpa' in note for note in trial['notes']), trial_id)

    def test_lunar_gravity_is_not_an_experimental_label(self):
        self.assertEqual({t['conditions']['gravity'] for t in self.trials.values()}, {'microgravity'})
        invalid = copy.deepcopy(self.payload)
        invalid['trials'][0]['conditions']['gravity'] = 'lunar'
        with self.assertRaises(ValueError):
            validate_registry(invalid, ROOT)

    def test_char_front_and_flame_base_are_not_pooled_as_one_target(self):
        for trial_id in ('SAFFIRE-I-S1', 'SAFFIRE-I-S2', 'SAFFIRE-II-5', 'SAFFIRE-II-6', 'SAFFIRE-III-S1', 'SAFFIRE-III-S2'):
            self.assertEqual({o['kind'] for o in self.trials[trial_id]['observables']}, {'char-front'})
        for trial_id in ('SAFFIRE-IV-1', 'SAFFIRE-V-2'):
            self.assertEqual({o['kind'] for o in self.trials[trial_id]['observables']}, {'flame-base'})
        self.assertEqual({o['kind'] for o in self.trials['SAFFIRE-VI-2']['observables']}, {'published-rate'})

    def test_same_curve_and_numerical_speed_checks_are_not_external_validation(self):
        for trial_id in ('SAFFIRE-IV-1', 'SAFFIRE-V-2'):
            self.assertEqual(self.trials[trial_id]['model']['validation'], 'published-curve-consistency')
        self.assertEqual(self.trials['SAFFIRE-VI-2']['model']['validation'], 'none')
        self.assertNotIn('cross-trial', {t['model']['validation'] for t in self.trials.values()})

    def test_different_cameras_are_not_a_statistical_confidence_interval(self):
        trial = self.trials['SAFFIRE-III-S1']
        self.assertEqual(len(trial['observables']), 2)
        one_camera = next(o for o in trial['observables'] if o['artifact'].endswith('crosstrial-i-iii.json'))
        self.assertEqual(one_camera['uncertainty']['kind'], 'ols-se-iid')
        self.assertIn('autocorrelação', one_camera['uncertainty']['note'])
        self.assertTrue(any('intervalo de confiança' in note for note in trial['notes']))

    def test_condition_sources_cover_values_without_hidden_tolerance(self):
        for trial in self.trials.values():
            source_fields = {s['field'] for s in trial['conditionSources'] if s['url'] and s['label']}
            self.assertTrue({k for k, v in trial['conditions'].items() if v is not None} <= source_fields)
            self.assertNotIn('tolerance', trial['conditions'])
        self.assertTrue(self.trials['SAFFIRE-III-S1']['conflicts'])
        self.assertTrue(self.trials['SAFFIRE-II-6']['conflicts'])

    def test_registry_has_no_nonfinite_numbers(self):
        def visit(value):
            if isinstance(value, float):
                self.assertTrue(math.isfinite(value))
            elif isinstance(value, dict):
                for item in value.values():
                    visit(item)
            elif isinstance(value, list):
                for item in value:
                    visit(item)
        visit(self.payload)


if __name__ == '__main__':
    unittest.main()
