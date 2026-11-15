"""Interface artefact public/data/flare/flare-evidence.json: values equal the derived JSONs, kinds kept apart, sign
conventions, textual ranges, divergences, no ISS limit values, no predictive content, reproducibility."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_flare_replay as replay  # noqa: E402

DATA = json.loads(replay.text(replay.OUTPUT))
RECORDS = {r['id']: r for r in json.loads(replay.text(replay.INPUTS['records']))['records']}
ANALYSIS = json.loads(replay.text(replay.INPUTS['analysis']))


class FlareEvidence(unittest.TestCase):
    def test_reproducible(self):
        self.assertEqual(replay.text(replay.OUTPUT), replay.render(replay.build()))

    def test_positioning_outside_psi(self):
        self.assertEqual(DATA['group'], 'Evidência publicada · fora do PSI')
        self.assertIsNone(DATA['program']['psi']['value'])
        self.assertNotRegex(json.dumps(DATA['limits']), r'PSI-\d')
        self.assertIn('1g e em voo parabólico', DATA['statement'])

    def test_limit_values_equal_the_records(self):
        groups = DATA['limits']
        self.assertEqual(len(groups), 5)
        for group in groups:
            for value in group['values']:
                source = RECORDS[value['id']]
                self.assertEqual((value['value'], value['raw'], value['kind'], value['quantity']),
                                 (source['value'], source['raw'], source['kind'], source['quantity']))
                self.assertEqual(group['source'], source['source'])

    def test_measured_and_predicted_never_share_a_value_entry(self):
        for group in DATA['limits']:
            pairs = [(v['quantity'], v['kind']) for v in group['values']]
            self.assertEqual(len(pairs), len(set(pairs)), group)
        n2 = next(g for g in DATA['limits'] if g['source'] == 'tastj-2016-ambient-gas' and g['balanceGas'] == 'N2')
        loc_pred = next(v for v in n2['values'] if v['quantity'] == 'LOC' and v['kind'] == 'predicted')
        self.assertIn('calibration', loc_pred['note'])

    def test_divergences_are_preserved(self):
        div = DATA['divergences']
        self.assertEqual((div['mloc']['tsuboi2016_table'], div['mloc']['takahashi2018_table']), (14.7, 14.9))
        self.assertEqual((div['vcr']['tsuboi2016_table_measured'], div['vcr']['takahashi2018_text_citing_ref17']), (10.0, 6.0))
        pmma_2018 = next(g for g in DATA['limits'] if g['source'] == 'tastj-2018-loc-model' and g['material'] == 'PMMA')
        mlocs = sorted((v['kind'], v['value']) for v in pmma_2018['values'] if v['quantity'] == 'MLOC')
        self.assertEqual(mlocs, [('measured', 14.9), ('measured-as-cited', 14.7), ('predicted', 14.8)])

    def test_sign_conventions(self):
        conventions = {(d['source'], d['convention']) for d in DATA['deltaO2']}
        self.assertEqual(conventions, {('tastj-2016-ambient-gas', 'MLOC - LOC'), ('tastj-2018-loc-model', 'LOC1g - MLOC')})
        for d in DATA['deltaO2']:
            if d['source'] == 'tastj-2016-ambient-gas':
                self.assertLess(d['printed_pp'], 0)
            else:
                self.assertGreater(d['printed_pp'], 0)
            self.assertTrue(d['reproduced'])
        self.assertEqual(DATA['deltaO2'], [{**c, 'reference': d['reference'], 'gasLabel': d['gasLabel']}
                                           for c, d in zip(ANALYSIS['deltaO2Reproduction']['checks'], DATA['deltaO2'])])

    def test_vcr_range_stays_textual(self):
        co2 = next(v for v in DATA['vcr'] if v['balanceGas'] == 'CO2' and v['kind'] == 'measured')
        self.assertEqual(co2['raw'], '2~6cm/s')
        self.assertIsNone(co2['value'])
        measured = {v['balanceGas']: v['value'] for v in DATA['vcr'] if v['kind'] == 'measured'}
        self.assertEqual((measured['N2'], measured['Ar']), (10.0, 9.0))

    def test_ratios_are_descriptive_and_match_analysis(self):
        self.assertEqual(len(DATA['ratios']), 5)
        for r, a in zip(DATA['ratios'], ANALYSIS['mlocEvidence']['points']):
            self.assertEqual(r['MLOC_over_LOC'], a['MLOC_over_LOC'])
        self.assertIn('descritiva', DATA['ratioNote'])

    def test_no_iss_limit_values(self):
        for record in DATA['iss']['records']:
            self.assertEqual(record['kind'], 'published_summary')
            self.assertNotIn(record['quantity'], ('LOC', 'MLOC', 'Vcr', 'deltaO2'))
        self.assertTrue(all(g['source'] in replay.REFERENCES for g in DATA['limits']))

    def test_no_predictive_or_model_content(self):
        text = replay.text(replay.OUTPUT)
        for forbidden in ('regression', 'interpolat', 'forecast', 'score', 'weight', 'spreadRateFromLOC'):
            self.assertNotIn(forbidden, text)
        ids = {item['id'] for item in DATA['limitations']}
        self.assertEqual(ids, {'not-iss-maps', 'different-setups', 'no-causal-gravity', 'maps-not-digitized',
                               'iss-papers-missing', 'model-not-implemented'})

    def test_provenance(self):
        for item in DATA['provenance']['inputs'].values():
            self.assertEqual(item['sha256LfNormalised'], replay.digest(replay.ROOT / item['path']))
        self.assertNotIn('data/cache', replay.text(replay.OUTPUT))

    def test_file_is_light(self):
        self.assertLess(len(replay.text(replay.OUTPUT).encode('utf-8')), 60_000)


if __name__ == '__main__':
    unittest.main()
