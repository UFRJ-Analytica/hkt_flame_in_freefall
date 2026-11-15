"""FLARE P0/P1 tests: parsing, normalisation, units, campaigns, provenance, material association, measured vs predicted,
reproduction of published values and reproducibility of the derived JSONs.

    python -m unittest discover -s scripts/flare -p "test_*.py"
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import analyze_flare as analyze  # noqa: E402
import fetch_flare as fetch  # noqa: E402
import inventory_flare as inventory  # noqa: E402
import normalize_flare as normalize  # noqa: E402

RECORDS = json.loads(normalize.text(normalize.OUTPUT))['records']
ANALYSIS = json.loads(analyze.text(analyze.OUTPUT))
INVENTORY = json.loads(inventory.text(inventory.OUTPUT))
MANIFEST = json.loads(fetch.MANIFEST.read_text(encoding='utf-8'))


class Parsing(unittest.TestCase):
    def test_numbers_percent_and_velocity(self):
        self.assertEqual(normalize.parse('17.0%')['value'], 17.0)
        self.assertEqual(normalize.parse('-8.6%')['value'], -8.6)
        self.assertEqual(normalize.parse('8 cm/s')['value'], 8.0)
        self.assertEqual(normalize.parse('9cm/s')['value'], 9.0)
        self.assertEqual(normalize.parse(0.28)['value'], 0.28)

    def test_ranges_and_unknowns_are_never_numbers(self):
        cell = normalize.parse('2~6cm/s')
        self.assertIsNone(cell['value'])
        self.assertEqual((cell['parse'], cell['rangeLow'], cell['rangeHigh']), ('range-as-printed', 2.0, 6.0))
        self.assertIsNone(normalize.parse('unknown')['value'])
        self.assertIsNone(normalize.parse('about 15')['value'])
        self.assertIsNone(normalize.parse(None)['value'])

    def test_scientific_notation(self):
        self.assertAlmostEqual(normalize.parse('1.37×10^24')['value'], 1.37e24, delta=1e10)
        self.assertAlmostEqual(normalize.parse('1.46×10^5')['value'], 1.46e5)


class Normalisation(unittest.TestCase):
    def test_every_record_keeps_its_raw_cell_and_source(self):
        for record in RECORDS:
            self.assertIn('raw', record, record['id'])
            self.assertTrue(record['source'] and record['doi'], record['id'])
            self.assertTrue(record['kind'], record['id'])

    def test_units(self):
        for record in RECORDS:
            if record['quantity'] in ('LOC', 'MLOC'):
                self.assertEqual(record['unit'], '% O2', record['id'])
            if record['quantity'] == 'Vcr':
                self.assertEqual(record['unit'], 'cm/s', record['id'])
            if record['quantity'] == 'deltaO2':
                self.assertTrue(record['unit'].startswith('percentage points'), record['id'])

    def test_material_association(self):
        pmma = [r for r in RECORDS if r['source'] == 'tastj-2016-ambient-gas' and r['quantity'] in ('LOC', 'MLOC')]
        self.assertTrue(all(r['material'] == 'PMMA' and r['thickness_mm'] == 0.125 for r in pmma))
        nomex_mloc = [r for r in RECORDS if r['material'] == 'NOMEX' and r['quantity'] == 'MLOC']
        self.assertEqual({(r['kind'], r['value']) for r in nomex_mloc}, {('measured', 29.5), ('predicted', 29.6)})

    def test_measured_and_predicted_are_separate_records(self):
        keys = {}
        for r in RECORDS:
            if r['kind'] in ('measured', 'predicted'):
                key = (r['source'], r['quantity'], r['material'], r['balanceGas'])
                keys.setdefault(key, set()).add(r['kind'])
        self.assertTrue(any(kinds == {'measured', 'predicted'} for kinds in keys.values()))
        for r in RECORDS:
            self.assertIn(r['kind'], {'measured', 'predicted', 'calibration', 'literature', 'property', 'measured-as-cited', 'published_summary'})

    def test_calibration_point_is_flagged(self):
        n2 = next(r for r in RECORDS if r['source'] == 'tastj-2016-ambient-gas' and r['quantity'] == 'LOC'
                  and r['kind'] == 'predicted' and r['balanceGas'] == 'N2')
        self.assertIn('calibration', n2['note'])

    def test_gravity_is_never_mixed(self):
        for r in RECORDS:
            if r['quantity'] == 'LOC' and r['kind'] == 'measured':
                self.assertEqual(r['gravity'], '1g', r['id'])
            if r['quantity'] == 'MLOC' and r['kind'] == 'measured':
                self.assertEqual(r['gravity'], 'microgravity-parabolic', r['id'])
        iss = [r for r in RECORDS if r['campaign'].startswith('iss-')]
        self.assertTrue(iss)
        self.assertTrue(all(r['gravity'] == 'microgravity-ISS' and r['kind'] == 'published_summary' for r in iss))


class Reproduction(unittest.TestCase):
    def test_all_printed_delta_o2_are_reproduced(self):
        checks = ANALYSIS['deltaO2Reproduction']['checks']
        self.assertEqual(len(checks), 10)
        self.assertTrue(ANALYSIS['deltaO2Reproduction']['allReproduced'])

    def test_model_errors_match_published_tables(self):
        errors = {(r['source'], r['material'], r['balanceGas']): r['error_pp'] for r in ANALYSIS['modelErrors']['rows']}
        self.assertEqual(errors[('tastj-2016-ambient-gas', 'PMMA', 'N2')], -1.7)
        self.assertEqual(errors[('tastj-2016-ambient-gas', 'PMMA', 'CO2')], -3.8)
        self.assertEqual(errors[('tastj-2018-loc-model', 'NOMEX', 'N2 (air-like)')], 0.1)

    def test_cross_source_discrepancy_is_kept_not_reconciled(self):
        mloc = ANALYSIS['crossSource']['PMMA_MLOC_microgravity']
        self.assertEqual((mloc['tsuboi2016_table'], mloc['takahashi2018_table'], mloc['takahashi2018_text_citing_ref17']), (14.7, 14.9, 14.7))
        self.assertTrue(ANALYSIS['crossSource']['PMMA_LOC1g_N2']['consistent'])

    def test_evidence_points_have_no_extrapolation(self):
        points = ANALYSIS['mlocEvidence']['points']
        self.assertEqual(len(points), 5)
        for p in points:
            self.assertLess(p['MLOC_pct'], p['LOC1g_pct'])
        co2 = next(p for p in points if p['balanceGas'] == 'CO2')
        self.assertIsNone(co2['Vcr_cm_s'])
        self.assertEqual(co2['Vcr_raw'], '2~6cm/s')


class CampaignsAndProvenance(unittest.TestCase):
    def test_campaigns_are_separate_and_complete(self):
        ids = [c['id'] for c in INVENTORY['campaigns']]
        self.assertEqual(len(ids), len(set(ids)))
        for required in ('ground-1g-nasa-wstf', 'ground-1g-japan', 'parabolic-flight', 'drop-tower',
                         'iss-kibo-filter-paper', 'iss-kibo-pmma-nomex', 'iss-kibo-wire'):
            self.assertIn(required, ids)
        for c in INVENTORY['campaigns']:
            for key in ('platform', 'gravity', 'materials', 'geometry', 'atmosphere', 'measured', 'objective', 'sources'):
                self.assertTrue(c[key], (c['id'], key))

    def test_no_psi_id_or_dataset_doi(self):
        self.assertEqual(INVENTORY['psi']['status'], 'not-found')
        text = json.dumps(INVENTORY)
        self.assertNotIn('10.60555', text)

    def test_sofie_paper_is_excluded_from_flare(self):
        excluded = {e['doi'] for e in INVENTORY['excludedNotFlare']}
        self.assertIn('10.1016/j.proci.2026.106484', excluded)
        self.assertNotIn('10.1016/j.proci.2026.106484', {r['doi'] for r in RECORDS})

    def test_manifest_integrity_and_budget(self):
        self.assertLessEqual(MANIFEST['usedBytes'], fetch.BUDGET)
        for entry in MANIFEST['files']:
            self.assertEqual(len(entry['sha256']), 64)
            self.assertTrue(fetch.allowed(entry['url']))
            self.assertTrue(entry['cachePath'].startswith('data/cache/flare/'))
        blocked = {e['id'] for e in MANIFEST['blocked']}
        self.assertTrue({'proci-2024-filter-paper', 'cnf-2026-pmma-nomex'} <= blocked)
        self.assertFalse(fetch.allowed('https://www.sciencedirect.com/x.pdf'))

    def test_every_record_source_is_known(self):
        known = {e['id'] for e in MANIFEST['files']} | {e['id'] for e in MANIFEST['blocked']}
        for r in RECORDS:
            self.assertIn(r['source'], known, r['id'])


class Reproducibility(unittest.TestCase):
    def test_derived_files_are_reproduced(self):
        self.assertEqual(inventory.text(inventory.OUTPUT), inventory.render(inventory.build()))
        self.assertEqual(normalize.text(normalize.OUTPUT), normalize.render(normalize.build()))
        self.assertEqual(analyze.text(analyze.OUTPUT), analyze.render(analyze.build()))


if __name__ == '__main__':
    unittest.main()
