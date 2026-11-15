"""Contract tests for the frontend-facing trial registry (no cache/network)."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

import build_trial_registry as registry

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_IDS = {
    'SAFFIRE-I-S1', 'SAFFIRE-I-S2', 'SAFFIRE-II-5', 'SAFFIRE-II-6',
    'SAFFIRE-III-S1', 'SAFFIRE-III-S2', 'SAFFIRE-IV-1', 'SAFFIRE-V-2', 'SAFFIRE-VI-2',
}


class TrialRegistryTests(unittest.TestCase):
    def test_registry_has_the_nine_requested_trials_and_verified_vi_conditions(self):
        data = registry.build_registry(ROOT)
        registry.validate_registry(data, ROOT)
        self.assertEqual(set(data), {'schemaVersion', 'generatedBy', 'trials'})
        self.assertEqual(data['schemaVersion'], 1)
        self.assertEqual(data['generatedBy'], 'scripts/build_trial_registry.py')
        self.assertEqual({t['id'] for t in data['trials']}, EXPECTED_IDS)
        vi = next(t for t in data['trials'] if t['id'] == 'SAFFIRE-VI-2')
        self.assertEqual(vi['conditions'], {'oxygenPct': 31, 'oxygenRangePct': None,
            'pressureKpa': 54.1, 'flowCmS': 20, 'flowDirection': 'concurrent', 'gravity': 'microgravity'})
        self.assertEqual(vi['material'], 'SIBAL')
        self.assertEqual(vi['geometry']['lengthMm'], 500)
        self.assertIsNone(vi['thicknessMm'])
        self.assertEqual(vi['model']['validation'], 'none')

    def test_every_non_null_condition_requires_its_own_source(self):
        data = registry.build_registry(ROOT)
        for trial in data['trials']:
            for field, value in trial['conditions'].items():
                if value is None:
                    continue
                with self.subTest(trial=trial['id'], field=field):
                    changed = copy.deepcopy(data)
                    target = next(t for t in changed['trials'] if t['id'] == trial['id'])
                    target['conditionSources'] = [s for s in target['conditionSources'] if s['field'] != field]
                    with self.assertRaisesRegex(ValueError, 'Missing source'):
                        registry.validate_registry(changed, ROOT)

    def test_mutated_hash_and_unsupported_kinds_are_rejected(self):
        for key, value in [('hash', '0' * 64), ('observable', 'burning'), ('model', 'generic-fire')]:
            with self.subTest(key=key):
                data = registry.build_registry(ROOT)
                trial = data['trials'][0]
                if key == 'hash':
                    trial['model']['artifactSha256'] = value
                elif key == 'observable':
                    trial['observables'][0]['kind'] = value
                else:
                    trial['model']['kind'] = value
                with self.assertRaises(ValueError):
                    registry.validate_registry(data, ROOT)

    def test_distinct_observables_and_unresolved_conditions_remain_explicit(self):
        trials = {t['id']: t for t in registry.build_registry(ROOT)['trials']}
        self.assertIsNone(trials['SAFFIRE-I-S1']['conditions']['oxygenPct'])
        self.assertEqual(trials['SAFFIRE-I-S1']['conditions']['oxygenRangePct'], [21.5, 21.7])
        self.assertIsNone(trials['SAFFIRE-III-S1']['thicknessMm'])
        self.assertIsNone(trials['SAFFIRE-III-S1']['conditions']['pressureKpa'])
        self.assertEqual({o['kind'] for o in trials['SAFFIRE-IV-1']['observables']}, {'flame-base'})
        self.assertEqual({o['kind'] for o in trials['SAFFIRE-III-S1']['observables']}, {'char-front'})
        self.assertEqual({o['kind'] for o in trials['SAFFIRE-VI-2']['observables']}, {'published-rate'})
        self.assertTrue(trials['SAFFIRE-II-6']['conflicts'])
        self.assertEqual(trials['SAFFIRE-IV-1']['conditions']['oxygenPct'], 23.1)
        self.assertEqual(trials['SAFFIRE-V-2']['conditions']['pressureKpa'], 76)

    def test_generated_output_is_reproducible(self):
        self.assertEqual(registry.build_registry(ROOT), registry.build_registry(ROOT))
        saved = json.loads((ROOT / 'public/data/saffire/trial-registry.json').read_text(encoding='utf-8'))
        self.assertEqual(saved, registry.build_registry(ROOT))


if __name__ == '__main__':
    unittest.main()
