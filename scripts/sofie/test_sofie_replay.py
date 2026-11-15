"""Interface artefact public/data/sofie/gel-evidence.json: five cases, provenance, units, no invented values,
separation between published and exploratory results, reproducibility."""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_sofie_replay as replay  # noqa: E402

KINDS = {'published', 'derived', 'video_observation', 'exploratory', 'hypothesis', 'unavailable'}


def walk(value, path=''):
    if isinstance(value, dict):
        yield path, value
        for key, item in value.items():
            yield from walk(item, f'{path}.{key}')
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from walk(item, f'{path}[{index}]')


class GelEvidence(unittest.TestCase):
    TEXT = replay.text(replay.OUTPUT)
    DATA = json.loads(TEXT)
    TABLE = json.loads(replay.text(replay.CASES))

    def test_reproducible(self):
        self.assertEqual(self.TEXT, replay.render(replay.build()))

    def test_five_cases_match_the_transcribed_table(self):
        rows = self.DATA['cases']['rows']
        self.assertEqual([r['sample'] for r in rows], ['1409B', '1408A', '1402C', '1409C', '1410C'])
        for row, source in zip(rows, self.TABLE['cases']):
            self.assertEqual(row['flow']['value'], source['flow_cm_s'])
            self.assertEqual(row['o2AtExtinction']['value'], source['o2_pct'])
            self.assertEqual(row['pressure']['value'], source['p_atm'])
            self.assertEqual(row['reynolds']['value'], source['reynolds'])
            self.assertEqual(row['strainRate']['value'], source['strainRate_per_s'])
            self.assertEqual(row['extinctionMode']['value'], source['mode'])

    def test_units(self):
        row = self.DATA['cases']['rows'][0]
        self.assertEqual((row['flow']['unit'], row['o2AtExtinction']['unit'], row['pressure']['unit'], row['strainRate']['unit']),
                         ('cm/s', '%', 'atm', '1/s'))
        self.assertEqual(self.DATA['sample']['diameter']['unit'], 'cm')
        self.assertEqual(self.DATA['video1410C']['spatialScale']['unit'], 'mm/px')

    def test_kinds_and_no_invented_values(self):
        kinds = {entry['kind'] for _, entry in walk(self.DATA) if 'kind' in entry}
        self.assertEqual(kinds, KINDS)
        for path, entry in walk(self.DATA):
            if entry.get('kind') == 'unavailable':
                self.assertIsNone(entry['value'], path)
                self.assertTrue(entry.get('reason'), path)
            elif entry.get('kind') in KINDS and 'value' in entry:
                self.assertIsNotNone(entry['value'], path)

    def test_missing_heat_loss_stays_unavailable(self):
        case5 = self.DATA['cases']['rows'][4]
        self.assertEqual(case5['conductiveHeatLoss']['kind'], 'unavailable')
        self.assertIsNone(case5['conductiveHeatLoss']['value'])

    def test_no_psi_id_or_dataset_doi_is_invented(self):
        psi = self.DATA['investigation']['psi']
        self.assertEqual((psi['kind'], psi['value']), ('unavailable', None))
        # The only PSI identifiers allowed are the searched range quoted in the reason of the unavailability.
        rest = self.TEXT.replace(psi['reason'], '')
        self.assertNotRegex(rest, r'PSI-\d')
        self.assertNotIn('10.60555', self.TEXT)  # PSI dataset DOI prefix

    def test_published_and_exploratory_are_separate(self):
        cases_text = json.dumps(self.DATA['cases'])
        for forbidden in ('exploratory', 'hypothesis', 'video_observation'):
            self.assertNotIn(forbidden, cases_text)
        video = self.DATA['video1410C']
        self.assertEqual(video['label'], 'Análise exploratória — não validada experimentalmente')
        self.assertIs(video['useAsModelParameter'], False)
        self.assertEqual(video['windows']['kind'], 'exploratory')
        self.assertEqual(video['publishedReference']['kind'], 'published')
        self.assertEqual({h['kind'] for k, h in video['timeBase'].items() if k != 'note'}, {'hypothesis'})

    def test_derived_checks_are_consistent(self):
        consistency = self.DATA['cases']['consistency']
        self.assertLess(consistency['strainRate']['value'], 0.00875)
        low, high = consistency['viscosity']['value']
        self.assertLess(high - low, 0.002)

    def test_mandatory_limitations(self):
        ids = {item['id'] for item in self.DATA['limitations']}
        self.assertEqual(ids, {'no-telemetry', 'no-flight-video', 'no-scale', 'time-base', 'five-cases', 'spin-unvalidated', 'geometry'})

    def test_provenance(self):
        provenance = self.DATA['provenance']
        self.assertEqual(set(provenance['inputs']), {'cases', 'pilot', 'manifest'})
        for item in provenance['inputs'].values():
            self.assertEqual(item['sha256LfNormalised'], replay.digest(replay.ROOT / item['path']))
        self.assertEqual(len(provenance['symposiumPdfSha256']), 64)
        self.assertNotIn('data/cache', self.TEXT.replace('data/cache/sofie/media/SoFIE-GEL_large.mp4', ''))

    def test_no_physical_lengths_or_speeds_from_the_video(self):
        video_text = json.dumps(self.DATA['video1410C'], ensure_ascii=False)
        for unit in ('"mm"', 'mm/s', 'cm/s'):
            self.assertNotIn(unit, video_text)

    def test_file_is_light(self):
        self.assertLess(len(self.TEXT.encode('utf-8')), 60_000)


if __name__ == '__main__':
    unittest.main()
