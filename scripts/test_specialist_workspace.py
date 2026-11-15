"""Public dataset and dossier contract tests; no providers or new experiments."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from build_specialist_workspace import build_workspace, trajectory, export_dossier, select_trials

ROOT = Path(__file__).resolve().parents[1]


class WorkspaceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        (ROOT / '.scratch').mkdir(exist_ok=True)

    def test_real_workspace_keeps_registry_values_and_exact_artifact_identity(self):
        result = build_workspace(ROOT)
        registry = json.loads((ROOT / 'public/data/saffire/trial-registry.json').read_text(encoding='utf-8'))
        self.assertEqual(len(result['trials']), 9)
        self.assertEqual([{k: v for k, v in t.items() if k != 'analysis'} for t in result['trials']], registry['trials'])
        self.assertEqual(len(result['comparisons']), 36)
        for artifact in result['artifacts']:
            self.assertEqual(artifact['sha256'], hashlib.sha256((ROOT / artifact['path']).read_bytes()).hexdigest())
        self.assertEqual(build_workspace(ROOT), result)
        json.dumps(result, allow_nan=False)

    def test_curve_diagnostics_are_computed_from_paired_points_not_reported_mae(self):
        trial = {'model': {'artifact': 'public/data/saffire/example.json', 'kind': 'image-neighborhood'},
                 'observables': [{'kind': 'char-front'}]}
        data = {'validation': {'positionMaeMm': 999, 'trajectory': [
            {'timeS': 0, 'observedMm': 100, 'simulatedMm': 100},
            {'timeS': 1, 'observedMm': 102, 'simulatedMm': 103},
            {'timeS': 2, 'observedMm': 104, 'simulatedMm': 106}]}}
        curve = trajectory(data, trial)
        self.assertEqual(curve['relationToRegisteredModel'], 'baseline-not-registered-model')
        metrics = curve['metrics']
        self.assertEqual(metrics['positionMaeMm'], 1)
        self.assertAlmostEqual(metrics['positionRmseMm'], 1.2909944487358056)
        self.assertEqual(metrics['positionBiasMm'], 1)
        self.assertEqual(metrics['observedOlsSpeedMmS'], 2)
        self.assertEqual(metrics['simulatedOlsSpeedMmS'], 3)
        self.assertEqual([p['residualMm'] for p in curve['points']], [0, 1, 2])

    def test_missing_trajectory_and_incompatible_observables_do_not_become_fake_curves(self):
        result = build_workspace(ROOT)
        trials = {t['id']: t for t in result['trials']}
        vi = trials['SAFFIRE-VI-2']['analysis']
        self.assertEqual(vi['trajectory']['status'], 'unavailable')
        self.assertEqual(vi['trajectory']['points'], [])
        self.assertIsNone(vi['speedComparison'])
        pair = select_trials(result, ['SAFFIRE-I-S1', 'SAFFIRE-IV-1'])['comparisons'][0]
        self.assertFalse(pair['observableCompatible'])
        self.assertIsNone(pair['speedDeltaPct'])
        pressure = next(d for d in pair['conditionDiffs'] if d['field'] == 'pressureKpa')
        self.assertEqual(pressure['status'], 'unknown')

    def test_s2_is_visible_but_not_a_habitat_anchor(self):
        for t in build_workspace(ROOT)['trials']:
            if t['sample'] == 'S2':
                self.assertEqual(t['analysis']['reviewStatus'], 'review-required')
                self.assertFalse(t['analysis']['capabilities']['habitatAnchor'])

    def test_selection_rejects_unknown_duplicate_and_empty_ids(self):
        workspace = build_workspace(ROOT)
        for ids in [[], ['not-a-trial'], ['SAFFIRE-I-S1', 'SAFFIRE-I-S1']]:
            with self.subTest(ids=ids), self.assertRaises(ValueError):
                select_trials(workspace, ids)

    def test_dossier_exports_full_curve_and_comparison_csvs(self):
        workspace = build_workspace(ROOT)
        with tempfile.TemporaryDirectory(dir=ROOT / '.scratch') as folder:
            directory = Path(folder)
            dossier = export_dossier(workspace, ['SAFFIRE-I-S1', 'SAFFIRE-III-S1'], directory)
            self.assertEqual(json.loads((directory / 'dossier.json').read_text(encoding='utf-8')), dossier)
            self.assertEqual(len(dossier['trials']), 2)
            self.assertEqual(len(dossier['comparisons']), 1)
            self.assertIn('residualMm', (directory / 'trajectories.csv').read_text(encoding='utf-8'))
            self.assertIn('speedDeltaPct', (directory / 'comparisons.csv').read_text(encoding='utf-8'))
            self.assertIn('SHA256', (directory / 'dossier.md').read_text(encoding='utf-8'))

    def test_invalid_curve_times_and_nonfinite_values_are_rejected(self):
        trial = {'model': {'artifact': 'public/data/saffire/example.json', 'kind': 'image-longitudinal'},
                 'observables': [{'kind': 'char-front'}]}
        for second in [{'timeS': 0, 'observedMm': 2, 'simulatedMm': 2},
                       {'timeS': 1, 'observedMm': float('nan'), 'simulatedMm': 2},
                       {'timeS': True, 'observedMm': 2, 'simulatedMm': 2}]:
            with self.subTest(second=second), self.assertRaises(ValueError):
                trajectory({'validation': {'trajectory': [
                    {'timeS': 0, 'observedMm': 1, 'simulatedMm': 1}, second]}}, trial)

    def test_dossier_verification_checks_entire_payload_not_just_two_metrics(self):
        from build_specialist_workspace import verify_dossier
        workspace = build_workspace(ROOT)
        with tempfile.TemporaryDirectory(dir=ROOT / '.scratch') as folder:
            dossier = export_dossier(workspace, ['SAFFIRE-I-S1', 'SAFFIRE-III-S1'], Path(folder))
            self.assertEqual(verify_dossier(dossier, ROOT)['status'], 'identical')
            dossier['trials'][0]['analysis']['trajectory']['points'][0]['observedMm'] += 1
            with self.assertRaises(ValueError):
                verify_dossier(dossier, ROOT)

    def test_dossier_self_consistency_does_not_prove_current_source_identity(self):
        from build_specialist_workspace import verify_dossier, encoded, digest
        workspace = build_workspace(ROOT)
        with tempfile.TemporaryDirectory(dir=ROOT / '.scratch') as folder:
            dossier = export_dossier(workspace, ['SAFFIRE-I-S1'], Path(folder))
            dossier.pop('dossierId')
            dossier['registry']['sha256'] = '0' * 64
            dossier['dossierId'] = digest(encoded(dossier))
            self.assertEqual(verify_dossier(dossier, ROOT)['status'], 'different-inputs-or-results')

    def test_incomplete_or_wrongly_typed_dossiers_are_rejected_even_with_valid_self_hash(self):
        import copy
        from build_specialist_workspace import verify_dossier, encoded, digest
        workspace = select_trials(build_workspace(ROOT), ['SAFFIRE-I-S1'])
        incomplete = {'schemaVersion': 1, 'trials': [{'id': 'SAFFIRE-I-S1'}]}
        bad_pressure = copy.deepcopy(workspace)
        bad_pressure['trials'][0]['conditions']['pressureKpa'] = 'nonsense'
        bad_curve = copy.deepcopy(workspace)
        bad_curve['trials'][0]['analysis']['trajectory']['points'][0]['observedMm'] = True
        for content in [incomplete, bad_pressure, bad_curve]:
            content['dossierId'] = digest(encoded(content))
            with self.subTest(content=content.keys()), self.assertRaises(ValueError):
                verify_dossier(content, ROOT)

    def test_verifier_enumerates_input_and_derived_result_mismatches(self):
        from build_specialist_workspace import verify_dossier, encoded, digest
        dossier = select_trials(build_workspace(ROOT), ['SAFFIRE-I-S1'])
        dossier['registry']['sha256'] = '0' * 64
        dossier['trials'][0]['analysis']['speedComparison']['observedMmS'] += 1
        dossier['dossierId'] = digest(encoded(dossier))
        report = verify_dossier(dossier, ROOT)
        mismatches = {m['path']: m for m in report['mismatches']}
        self.assertEqual(mismatches['/registry/sha256']['kind'], 'input-identity')
        self.assertEqual(mismatches['/trials/0/analysis/speedComparison/observedMmS']['kind'], 'derived-results')
        self.assertEqual(mismatches['/registry/sha256']['received'], '0' * 64)

    def test_unknown_null_field_is_reported_and_object_key_order_is_not_a_scientific_difference(self):
        from build_specialist_workspace import verify_dossier, encoded, digest
        dossier = select_trials(build_workspace(ROOT), ['SAFFIRE-I-S1'])
        dossier = dict(reversed(list(dossier.items())))
        dossier['dossierId'] = digest(encoded(dossier))
        self.assertEqual(verify_dossier(dossier, ROOT)['status'], 'identical')
        dossier.pop('dossierId')
        dossier['unrecognizedField'] = None
        dossier['dossierId'] = digest(encoded(dossier))
        report = verify_dossier(dossier, ROOT)
        self.assertEqual(report['status'], 'different-inputs-or-results')
        self.assertIn('/unrecognizedField', [m['path'] for m in report['mismatches']])


if __name__ == '__main__':
    unittest.main()
