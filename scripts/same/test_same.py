"""SAME (PSI-102) pipeline tests: moment method, lognormal, invalid inputs, uncertainty, parsing, normalisation,
material and test association, reproducibility of the derived JSON and Table 1 of the Final Science Report.

    python -m unittest discover -s scripts/same -p "test_*.py"

Tests that need the original spreadsheets (git-ignored cache) are skipped when the cache is absent.
"""
import json
import math
import struct
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import analyze_same as analyze  # noqa: E402
import fetch_same as fetch  # noqa: E402
import inventory_same as inventory  # noqa: E402
import moment_method as mm  # noqa: E402
import normalize_same as normalize  # noqa: E402
import xls_reader  # noqa: E402

CACHE_READY = all((normalize.CACHE / (normalize.PREFIX + name)).exists() for name, _, _ in normalize.STATE_SOURCES.values())


class MomentMethod(unittest.TestCase):
    def test_report_figure_3_example(self):
        # Final Science Report p. 7: Dg = 1.0 um, sigma_g = 1.6 -> D0.5 = 1.117 um, D1.5 = 1.393 um.
        self.assertAlmostEqual(mm.hatch_choate(1.0, 1.6, 0.5), 1.117, places=3)
        self.assertAlmostEqual(mm.hatch_choate(1.0, 1.6, 1.5), 1.393, places=3)

    def test_round_trip_from_known_lognormal(self):
        for nt, dg, sg in ((1e6, 80.0, 2.08), (3e5, 352.0, 1.83), (1.0, 1000.0, 1.6), (5e4, 150.0, 1.05)):
            dist = mm.Lognormal(nt, dg, sg)
            result = mm.lognormal_from_moments(*(mm.moment(dist, k) for k in (0, 1, 3)))
            self.assertAlmostEqual(result['Dg'], dg, delta=dg * 1e-9)
            self.assertAlmostEqual(result['sigma_g'], sg, delta=1e-9)
            self.assertAlmostEqual(result['Nt'], nt, delta=nt * 1e-12)

    def test_eq9_closed_form_equals_eq7(self):
        dist = mm.Lognormal(2e5, 189.0, 2.18)
        m0, m1, m3 = (mm.moment(dist, k) for k in (0, 1, 3))
        self.assertAlmostEqual(mm.dg_direct(m0, m1, m3), mm.lognormal_from_moments(m0, m1, m3)['Dg'], places=6)

    def test_analytical_moments_match_numerical_integration(self):
        dist = mm.Lognormal(1e5, 170.0, 1.84)
        for k in (0, 1, 2, 3):
            self.assertAlmostEqual(mm.numeric_moment(dist, k) / mm.moment(dist, k), 1.0, places=6)

    def test_lognormal_characteristic_diameters_are_ordered(self):
        dg, sg = 189.0, 2.18
        values = [mm.hatch_choate(dg, sg, p) for p in (0, 0.5, 1.5, 3)]
        self.assertEqual(values, sorted(values))
        self.assertEqual(values[0], dg)

    def test_monodisperse_limit(self):
        result = mm.lognormal_from_diameters(200.0, 200.0)
        self.assertAlmostEqual(result['sigma_g'], 1.0)
        self.assertAlmostEqual(result['Dg'], 200.0)

    def test_fractions(self):
        dist = mm.Lognormal(1.0, 100.0, 2.0)
        self.assertAlmostEqual(mm.number_fraction_above(dist, 100.0), 0.5, places=12)
        mass_median = mm.hatch_choate(100.0, 2.0, 3)
        self.assertAlmostEqual(mm.mass_fraction_above(dist, mass_median), 0.5, places=12)
        self.assertGreater(mm.mass_fraction_above(dist, 1000.0), mm.number_fraction_above(dist, 1000.0))


class InvalidInputs(unittest.TestCase):
    def test_non_positive_and_non_finite_moments_are_refused(self):
        for bad in (0.0, -1.0, float('nan'), float('inf'), None, True, '5'):
            with self.assertRaises(ValueError):
                mm.lognormal_from_moments(bad, 1.0, 1.0)
            with self.assertRaises(ValueError):
                mm.lognormal_from_moments(1.0, 1.0, bad)

    def test_d15_below_d05_is_physically_impossible(self):
        with self.assertRaises(ValueError):
            mm.lognormal_from_diameters(300.0, 200.0)
        # M3/M0 < (M1/M0)^3 violates Jensen's inequality.
        with self.assertRaises(ValueError):
            mm.lognormal_from_moments(1.0, 100.0, 100.0 ** 3 * 0.5)

    def test_sigma_below_one_is_refused(self):
        with self.assertRaises(ValueError):
            mm.moment(mm.Lognormal(1.0, 100.0, 0.9), 1)

    def test_uncertainty_inputs(self):
        with self.assertRaises(ValueError):
            mm.relative_uncertainty(1.8, -0.1, 0.1, 0.1)
        with self.assertRaises(ValueError):
            mm.relative_uncertainty(1.0, 0.1, 0.1, 0.1)


class Uncertainty(unittest.TestCase):
    def test_equations_12_13_match_first_order_propagation(self):
        dist = mm.Lognormal(1e5, 200.0, 1.9)
        moments = [mm.moment(dist, k) for k in (0, 1, 3)]
        ur = (0.10, 0.07, 0.25)
        analytic = mm.relative_uncertainty(1.9, *ur)
        numeric = mm.relative_uncertainty_numeric(*moments, ur)
        self.assertAlmostEqual(analytic['ur_Dg'], numeric['ur_Dg'], places=5)
        self.assertAlmostEqual(analytic['ur_sigma_g'], numeric['ur_sigma_g'], places=5)

    def test_m1_contributes_most_and_m3_least(self):
        only = lambda i: mm.relative_uncertainty(1.8, *[0.1 if j == i else 0.0 for j in range(3)])  # noqa: E731
        contributions = [only(i)['ur_Dg'] for i in range(3)]
        self.assertEqual(max(contributions), contributions[1])
        self.assertEqual(min(contributions), contributions[2])

    def test_zero_input_uncertainty_gives_zero(self):
        self.assertEqual(mm.relative_uncertainty(1.8, 0, 0, 0), {'ur_Dg': 0.0, 'ur_sigma_g': 0.0})


class Table1(unittest.TestCase):
    def test_published_dg_and_sigma_follow_from_published_d05_d15(self):
        for row in analyze.table1():
            self.assertLessEqual(abs(row['recomputed']['dDg_nm']), 1.0, row['material'])
            self.assertLessEqual(abs(row['recomputed']['dSigma_g']), 0.01, row['material'])

    def test_aging_increases_every_diameter_and_narrows_the_distribution(self):
        for material, block in analyze.aging_from_table1(analyze.table1()).items():
            self.assertGreater(block['Dg_ratio'], 1, material)
            self.assertGreater(block['D1.5_ratio'], 1, material)
            self.assertLessEqual(block['sigma_g_change'], 0, material)
            self.assertLess(block['numberRatioIfVolumeConserved'], 1, material)

    def test_preliminary_2009_table_is_flagged_where_inconsistent(self):
        entries = analyze.earlier_consistency()['AIAA-2009-956 (Apêndice C, p. C-6, Tabela 1)']['entries']
        self.assertTrue(entries['Kapton']['consistentWithEq7'])
        self.assertFalse(entries['Teflon']['consistentWithEq7'])
        self.assertNotIn('consistentWithEq7', entries['Silicone rubber'])


class Parsing(unittest.TestCase):
    def test_rk_values(self):
        self.assertEqual(xls_reader._rk((42 << 2) | 2), 42.0)
        self.assertEqual(xls_reader._rk((1234 << 2) | 3), 12.34)
        self.assertEqual(xls_reader._rk((((1 << 30) - 5) << 2) | 2), -5.0)
        raw = struct.unpack('<Q', struct.pack('<d', 3.5))[0] >> 32
        self.assertEqual(xls_reader._rk(raw & 0xFFFFFFFC), 3.5)

    def test_shared_string_split_across_continue_records(self):
        first = struct.pack('<HB', 6, 0) + b'abc'
        second = bytes([1]) + 'déf'.encode('utf-16-le')
        pieces = xls_reader._Pieces([first, second])
        self.assertEqual(pieces.string(), 'abcdéf')

    def test_not_an_xls_file(self):
        with self.assertRaises(xls_reader.XlsError):
            xls_reader._ole_stream(b'PK\x03\x04 not an OLE2 file')

    @unittest.skipUnless(CACHE_READY, 'planilhas originais ausentes do cache')
    def test_real_housekeeping_sheet(self):
        rows = normalize.load_sheet(*normalize.STATE_SOURCES[29][:2])
        self.assertIn('TestNumber', rows[0])
        self.assertTrue(str(rows[0]['TimeString']).startswith('2007/271/'))
        self.assertTrue(all(isinstance(row['Time'], float) for row in rows[:50]))


class Normalisation(unittest.TestCase):
    def test_ptrak_error_code_is_dropped_never_zeroed(self):
        values, flags = normalize.clean('ptrak', [100.0, -999.0, 0.0, None, 'x', 2e5])
        self.assertEqual(values, [100.0, 0.0, 2e5])
        self.assertEqual(flags, {'nonNumeric': 2, 'errorCode-999': 1, 'aboveNominalRange_1e5': 1})

    def test_measured_zero_is_kept_and_absence_is_none(self):
        values, _ = normalize.clean('dusttrakA', [0.0, 0.0, None])
        self.assertEqual(values, [0.0, 0.0])
        self.assertIsNone(normalize.summary([]))

    def test_channel_units(self):
        units = {key: unit for _, (key, unit, _) in normalize.CHANNELS.items()}
        self.assertEqual(units['ptrak'], 'pt/cc')
        self.assertEqual(units['dusttrakA'], 'mg/m3')
        self.assertEqual(units['ionB'], 'V')

    def test_material_identification(self):
        self.assertEqual(inventory.material_of('GMT272lampwick32.xls'), 'Lamp wick (cellulose)')
        self.assertEqual(inventory.material_of('GMT267silicon23hkp.xls'), 'Silicone rubber')
        self.assertEqual(inventory.material_of('GMT276dbp37.xls'), 'DBP (dibutyl phthalate on cotton wick)')
        self.assertIsNone(inventory.material_of('GMT256HKP.xls'))
        self.assertIsNone(inventory.material_of('teflon kapton'))

    def test_sources_agree_with_appendix_a(self):
        appendix = {row['test']: row for row in inventory.read_appendix()}
        self.assertEqual(len(appendix), 47)
        for test, (name, _, matrix_number) in normalize.STATE_SOURCES.items():
            self.assertEqual(inventory.material_of(name) or appendix[test]['material'], appendix[test]['material'], name)
            self.assertIn(str(test), name, name)


class DerivedFiles(unittest.TestCase):
    TESTS = json.loads(normalize.OUTPUT.read_text(encoding='utf-8'))
    ANALYSIS = json.loads(analyze.OUTPUT.read_text(encoding='utf-8'))

    def test_no_moment_or_flame_speed_is_claimed(self):
        self.assertFalse(self.TESTS['momentsAvailable'])
        text = normalize.OUTPUT.read_text(encoding='utf-8') + analyze.OUTPUT.read_text(encoding='utf-8')
        for forbidden in ('"M0"', '"M1"', '"M3"', 'mm/s', 'flameSpeed', 'velocity'):
            self.assertNotIn(forbidden, text)

    def test_every_appendix_test_is_present_once_with_a_status(self):
        tests = [t['test'] for t in self.TESTS['tests']]
        self.assertEqual(tests, list(range(1, 48)))
        self.assertTrue(all(t['status'] for t in self.TESTS['tests']))

    def test_processed_tests_have_primary_window_and_consistent_material(self):
        for test in self.TESTS['tests']:
            if test['status'] != 'processed-state-windows':
                self.assertIsNone(test['housekeeping'])
                continue
            roles = [w['role'] for w in test['housekeeping']['windows']]
            self.assertIn('primary', roles, test['test'])
            self.assertEqual(test['material'], inventory.material_of(test['housekeeping']['file']) or test['material'])

    def test_heater_ratio_is_consistent_per_material(self):
        # Set-points cluster per material; lamp wick test 46 (Rt/R0 1.32 vs ~1.245) is a genuinely different set-point.
        for material, block in self.ANALYSIS['flight']['conditions'].items():
            if block['RtOverR0']['n'] > 1:
                self.assertLess(block['RtOverR0']['max'] - block['RtOverR0']['min'], 0.10, material)
        teflon = self.ANALYSIS['flight']['conditions']['Teflon']['RtOverR0']
        kapton = self.ANALYSIS['flight']['conditions']['Kapton']['RtOverR0']
        self.assertGreater(teflon['min'], kapton['max'])

    def test_dusttrak_ratio_reproduces_published_averages_within_ten_percent(self):
        for material, block in self.ANALYSIS['flight']['dusttrakRatio'].items():
            published = block['published08ICES_BoverA']['value']
            self.assertLess(abs(block['primaryBoverA']['mean'] - published) / published, 0.10, material)

    def test_kinds_are_labelled(self):
        self.assertEqual(self.ANALYSIS['table1'][0]['published']['kind'], 'published')
        self.assertEqual(self.ANALYSIS['table1'][0]['recomputed']['kind'], 'derived')
        self.assertEqual(self.ANALYSIS['table1'][0]['lognormal']['kind'], 'model')
        self.assertEqual(self.ANALYSIS['flight']['dusttrakRatio']['Teflon']['kind'], 'measured')

    def test_analysis_is_reproducible_from_tests_json(self):
        self.assertEqual(analyze.render(analyze.build()), analyze.OUTPUT.read_text(encoding='utf-8'))

    @unittest.skipUnless(CACHE_READY, 'planilhas originais ausentes do cache')
    def test_tests_json_is_reproducible_from_the_cache(self):
        self.assertEqual(normalize.render(normalize.build()), normalize.OUTPUT.read_text(encoding='utf-8'))

    def test_inventory_separates_same_from_same_r(self):
        data = json.loads((inventory.DERIVED / 'same-inventory.json').read_text(encoding='utf-8'))
        self.assertEqual(data['investigation']['id'], 'PSI-102')
        self.assertEqual(data['reflight']['id'], 'PSI-101')
        self.assertFalse(data['reflight']['usedHere'])
        self.assertTrue(all('PSI-101' not in entry['fileName'] for entry in data['files']))
        self.assertEqual(data['experimentalTable']['rows'], 8)


class Fetch(unittest.TestCase):
    def test_videos_and_large_archives_are_refused(self):
        item = {'file_size': 10, 'remote_path': '/Home/psi-data/PSI-102/Engineering Documents/x'}
        self.assertIsNotNone(fetch.refusal('PSI-102_Engineering Documents_Resistive Heater Coil-TN001.mp4', item))
        self.assertIsNotNone(fetch.refusal('PSI-102_Engineering Documents_SAME OPS images.zip', item))
        self.assertIsNone(fetch.refusal('PSI-102_metadata_PSI-170_SAME.zip', item))
        self.assertIsNotNone(fetch.refusal('x.pdf', None))
        self.assertIsNotNone(fetch.refusal('x.xml', {**item, 'file_size': 0}))

    def test_manifest_within_budget_and_hashed(self):
        manifest = json.loads(fetch.MANIFEST.read_text(encoding='utf-8'))
        self.assertLessEqual(manifest['usedBytes'], fetch.BUDGET)
        self.assertTrue(all(len(entry['sha256']) == 64 and 'X-Amz' not in entry['sourceUrl'] for entry in manifest['files']))
        self.assertTrue(all(entry['cachePath'].startswith('data/cache/same/') for entry in manifest['files']))


if __name__ == '__main__':
    unittest.main()
