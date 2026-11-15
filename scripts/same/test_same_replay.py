"""Interface artefact public/data/same/smoke-analysis.json: reproducibility, kinds, coverage, notices, no invented values."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_same_replay as replay  # noqa: E402

KINDS = {'published', 'measured', 'derived', 'model_assumption', 'unavailable'}


def walk(value, path=''):
    """Yield (path, dict) for every dict in the document."""
    if isinstance(value, dict):
        yield path, value
        for key, item in value.items():
            yield from walk(item, f'{path}.{key}')
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from walk(item, f'{path}[{index}]')


class SmokeAnalysisArtefact(unittest.TestCase):
    DATA = json.loads(replay.normalised_text(replay.OUTPUT))
    TEXT = replay.normalised_text(replay.OUTPUT)
    ANALYSIS = json.loads(replay.normalised_text(replay.INPUTS['analysis']))

    def test_reproducible_from_the_versioned_derived_files(self):
        self.assertEqual(self.TEXT, replay.render(replay.build()))

    def test_every_kind_is_one_of_the_five(self):
        kinds = {entry['kind'] for _, entry in walk(self.DATA) if 'kind' in entry}
        self.assertEqual(kinds, KINDS)
        self.assertEqual(set(self.DATA['kinds']), KINDS)

    def test_unavailable_values_are_null_with_a_reason(self):
        for path, entry in walk(self.DATA):
            if entry.get('kind') == 'unavailable':
                self.assertIsNone(entry['value'], path)
                self.assertTrue(entry.get('reason'), path)

    def test_valued_entries_are_never_null_unless_unavailable(self):
        for path, entry in walk(self.DATA):
            if entry.get('kind') in KINDS - {'unavailable'} and 'value' in entry:
                self.assertIsNotNone(entry['value'], path)

    def test_identification_and_five_materials(self):
        inv = self.DATA['investigation']
        self.assertEqual((inv['id'], inv['acronym'], inv['doi']), ('PSI-102', 'SAME', '10.60555/gd4k-8h62'))
        self.assertIn('Microgravity Science Glovebox', inv['platform'])
        self.assertEqual([m['id'] for m in self.DATA['materials']], ['lampwick', 'kapton', 'silicone', 'teflon', 'dbp'])
        self.assertEqual([m['inTable1'] for m in self.DATA['materials']], [True, True, True, True, False])
        self.assertEqual(sum(m['flightTests']['value'] for m in self.DATA['materials']), 47)

    def test_coverage_matches_p1(self):
        groups = {g['status']: g['count'] for g in self.DATA['coverage']['groups']}
        self.assertEqual(groups, {'processed-state-windows': 15, 'nasa-averaging-window-only': 4,
                                  'downloaded-not-segmented': 11, 'not-downloaded': 17})
        self.assertEqual(self.DATA['coverage']['total'], 47)

    def test_table1_is_aggregated_and_has_no_per_test_distribution(self):
        table = self.DATA['table1']
        self.assertEqual(table['aggregation'], 'por material')
        self.assertEqual(len(table['rows']), 8)
        for row in table['rows']:
            self.assertEqual(row['Dg']['kind'], 'published')
            self.assertEqual(row['DgRecomputed']['kind'], 'derived')
            self.assertEqual(row['massMedian']['kind'], 'model_assumption')
            self.assertEqual(row['perTestDistribution']['kind'], 'unavailable')
            self.assertLessEqual(abs(row['DgRecomputed']['value'] - row['Dg']['value']), 1.0)

    def test_values_equal_the_p1_analysis(self):
        published = {(r['material'], r['aged']): r['published'] for r in self.ANALYSIS['table1']}
        short = {key: s for key, s, _, _ in replay.MATERIALS}
        for row in self.DATA['table1']['rows']:
            source = next(v for (m, aged), v in published.items() if short[m] == row['material'] and aged == row['aged'])
            self.assertEqual(row['Dg']['value'], source['Dg_nm'])
            self.assertEqual(row['sigmaG']['value'], source['sigma_g'])
        for entry in self.DATA['dusttrakRatio']['materials']:
            if 'published' in entry:
                self.assertLess(abs(entry['relativeDifference']['value']), 0.10)

    def test_aging_has_only_two_published_points(self):
        self.assertEqual(self.DATA['aging']['publishedAgingTimes_s'], [0, 720])
        for material in self.DATA['aging']['materials']:
            self.assertIn(len(material['publishedPoints']), (0, 2))
            self.assertEqual(material['measuredNumberChange']['kind'], 'unavailable')

    def test_moments_are_declared_unavailable_with_the_mandatory_notice(self):
        self.assertEqual(self.DATA['momentMethod']['notice'], replay.MOMENTS_NOTICE)
        self.assertIn('M0, M1 e M3 por teste', [u['quantity'] for u in self.DATA['unavailable']])
        notices = {n['id'] for n in self.DATA['notices']}
        self.assertEqual(notices, {'not-flame', 'moments', 'aggregated', 'lognormal', 'dusttrak', 'no-prediction', 'same-r'})
        for key in ('"M0":', '"M1":', '"M3":'):
            self.assertNotIn(key, self.TEXT)

    def test_no_flame_speed_and_no_cache_or_same_r_data(self):
        for forbidden in ('mm/s', 'velocity', 'flameSpeed', 'data/cache', 'PSI-101_'):
            self.assertNotIn(forbidden, self.TEXT)

    def test_sts_off_is_unavailable_not_zero(self):
        for response in self.DATA['detectors']['responses']:
            if response['stsDelta'].get('powered') is False:
                self.assertEqual(response['stsDelta']['kind'], 'unavailable')
                self.assertIsNone(response['stsDelta']['value'])

    def test_file_is_light(self):
        self.assertLess(len(self.TEXT.encode('utf-8')), 100_000)


if __name__ == '__main__':
    unittest.main()
