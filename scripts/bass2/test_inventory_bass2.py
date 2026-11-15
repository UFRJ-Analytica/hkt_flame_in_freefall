"""Focused checks of the BASS-II inventory rules. No network, no cached documents needed.

    python -m unittest discover -s scripts/bass2 -p "test_*.py"
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from inventory_bass2 import (METADATA, SNAPSHOT, associate, build_inventory, calibration_for, classify_file,  # noqa: E402
                             current_files, flow_steps, record_keys)


def record(test, sample, gmt, day_month_year, **raw):
    return {'id': f'PSI-25:t0:{test}', 'label': test, 'oxygenPct': 21.0,
            'raw': {'PI': 'X', 'Test #': test, 'Sample #': sample, 'GMT': str(gmt), 'Date': day_month_year,
                    'Fuel Sample Material': '2 cm SIBAL', 'Flow restrictor': '2', 'Fan display': '48',
                    'Air display': '5', **raw}}


RECORDS = [
    record('B1', '147', 50, '2/19/2014'),
    record('B15', '149m', 188, '7/7/2014'),
    record('B17', '175m', 183, '7/2/2014'),
    record('O3a', '205M', 164, '6/13/2014'),
    record('O3b', '205M', 164, '6/13/2014'),
    record('O6', '206M', 177, '6/26/2014'),
    record('O8a', '208m', 177, '6/26/2014'),
    record('O8b', '208m', 177, '6/26/2014'),
    record('O10', '210m', 213, '7/22/2014'),  # the CSV says GMT 213; 22 July is day 203
    record('P1', '185M', 167, '6/16/2014'),
    record('P13b', '203m', 195, '7/14/2014'),
    record('T9', '133M', 175, '6/24/2018'),   # year typo of the source, kept verbatim
    record('T11', '135m', 178, '6/27/2014'),
    record('O20', '204m', 57, '2/26/2016'),
]
KEYS = [record_keys(item) for item in RECORDS]


def link(name):
    return associate(classify_file(name)['keys'], KEYS)


class Classification(unittest.TestCase):
    def test_roles_of_the_listed_media_types(self):
        expected = {
            'PSI-25_Raw Data_BASS_GMT178_SAMPLE_135_TEST_T11.mp4': ('video', 'primary-video'),
            'PSI-25_Raw Data_BASS_GMT178_SAMPLE_135_TEST_T11_2ND_VIEW.mp4': ('video', 'second-view'),
            'PSI-25_Raw Data_BASS_GMT178_SAMPLE_135_TEST_T11_Still_Sequence.mp4': ('video', 'still-sequence'),
            'PSI-25_Raw Data_BASS_GMT100_sample139_test-T16-shifted-video.mp4': ('video', 'shifted-video'),
            'PSI-25_Raw Data_vlc-record-2014-12-05-17h06m58s-BASS_GMT190_SAMPLE_145_TEST_T21.ts-.mp4': ('video', 'vlc-recording'),
            'PSI-25_Raw Data_M10-lab-camera-LOS.mp4': ('video', 'auxiliary-video'),
            'PSI-25_Raw Data_BASS_GMT188_SAMPLE_154_TESTB9 original vidoes.zip': ('archive', 'original-videos-zip'),
            'PSI-25_Raw Data_BASS_GMT51_SAMPLE_223_TEST_M14.zip': ('archive', 'test-zip-unspecified'),
            'PSI-25_Raw Data_GMT2014_190_BASS_S143M_TPT19.zip': ('archive', 'test-point-zip'),
            'PSI-25_Raw Data_iss040e082016.zip': ('archive', 'iss-image-zip'),
            'PSI-25_Raw Data_GMT2014_183_BASS_S150M_TPB16ProofSheet.pdf': ('pdf', 'proof-sheet-pdf'),
        }
        for name, (kind, role) in expected.items():
            info = classify_file(name)
            self.assertEqual((info['kind'], info['role']), (kind, role), name)
        document = classify_file('PSI-25_Reports_BASS-II Summary Report.pdf', 'Reports')
        self.assertEqual((document['kind'], document['keys']['test']), ('document', None))

    def test_keys_survive_irregular_spellings(self):
        cases = {
            'BASS_GMT100_sample 131_test T5 original videos.zip': ('T5', 131, 100),
            'BASS_GMT_100_sample137_test T13.mp4': ('T13', 137, 100),
            'BASS_GMT188_SAMPLE_153_TESTB6_2ND_VIEW.mp4': ('B6', 153, 188),
            'BASS_GMT175_SAMPLE_039_TEST_F4.mp4': ('F4', 39, 175),
            'GMT2014_175_BASS_S133M_TPT09_ProofSheet.pdf': ('T9', 133, 175),
            'GMT2014_213_BASS_D300sGMT2014_213_BASS_D300sGMT2014_213_BASS_S172M_TPM20.zip': ('M20', 172, 213),
            'Flame-Blowoff-BASS-GMT177-Test-O7.mp4': ('O7', None, 177),
        }
        for name, (test, sample, gmt) in cases.items():
            keys = classify_file('PSI-25_Raw Data_' + name)['keys']
            self.assertEqual((keys['test'], keys['sample'], keys['gmtDay']), (test, sample, gmt), name)
        # A name with no test number must not borrow one from the word that follows "TEST".
        keys = classify_file('PSI-25_Raw Data_BASS_GMT167_SAMPLE_185_TEST original videos.zip')['keys']
        self.assertEqual((keys['test'], keys['sample'], keys['gmtDay']), (None, 185, 167))

    def test_qualifiers_mark_partial_or_repeated_takes(self):
        info = classify_file('PSI-25_Raw Data_BASS_GMT210_SAMPLE_219_TEST_O16_Second_Ignition_Attempt_2ND_VIEW.mp4')
        self.assertEqual((info['role'], info['qualifiers']), ('second-view', ['second-ignition-attempt']))
        self.assertIn('los-portion', classify_file('PSI-25_Raw Data_BASS_GMT192_SAMPLE_226_TEST_M3_LOS_Portion_1-2.mp4')['qualifiers'])


class Association(unittest.TestCase):
    def test_common_identifier_with_three_agreeing_keys_is_confirmed(self):
        ids, grade, _ = link('PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1.mp4')
        self.assertEqual((ids, grade), (['PSI-25:t0:B1'], 'confirmada'))

    def test_alphabetic_suffixes_select_the_right_run(self):
        for name, test in [('BASS_GMT164_SAMPLE_205_TEST_O3a.mp4', 'O3a'),
                           ('BASS_GMT164_SAMPLE_205_TEST_O3b_2ND_VIEW.mp4', 'O3b'),
                           ('BASS_GMT195_SAMPLE_203_TEST_P13b_Still_Sequence.mp4', 'P13b'),
                           ('GMT2014_164_BASS_S205M_TPO3a_ProofSheet.pdf', 'O3a')]:
            ids, grade, _ = link('PSI-25_Raw Data_' + name)
            self.assertEqual((ids, grade), ([f'PSI-25:t0:{test}'], 'confirmada'), name)

    def test_name_without_suffix_is_shared_by_both_runs_not_guessed(self):
        ids, grade, basis = link('PSI-25_Raw Data_BASS_GMT177_SAMPLE_208_TEST_O8.mp4')
        self.assertEqual((sorted(ids), grade), (['PSI-25:t0:O8a', 'PSI-25:t0:O8b'], 'ambígua'))
        self.assertIn('O8a', basis)

    def test_missing_pi_letter_is_resolved_only_by_sample_gmt_and_number(self):
        ids, grade, _ = link('PSI-25_Raw Data_GMT2014_177_BASS_S206M_TP06_ProofSheet.pdf')
        self.assertEqual((ids, grade), (['PSI-25:t0:O6'], 'provável'))
        ids, grade, _ = link('PSI-25_Raw Data_GMT2014_177_BASS_S208M_TP08b_ProofSheet.pdf')
        self.assertEqual((ids, grade), (['PSI-25:t0:O8b'], 'provável'))

    def test_gmt_divergence_is_reported_not_hidden(self):
        ids, grade, basis = link('PSI-25_Raw Data_BASS_GMT203_SAMPLE_210_TEST_O10.mp4')
        self.assertEqual((ids, grade), (['PSI-25:t0:O10'], 'provável'))
        self.assertIn('213', basis)
        # The 2018 year typo does not change the day of the year, so the link stays fully supported.
        self.assertEqual(link('PSI-25_Raw Data_BASS_GMT175_SAMPLE_133_TEST_T9.mp4')[1], 'confirmada')

    def test_name_that_contradicts_its_own_test_number_is_ambiguous(self):
        ids, grade, basis = link('PSI-25_Raw Data_BASS_GMT183_SAMPLE_175_TESTB15.mp4')
        self.assertEqual((sorted(ids), grade), (['PSI-25:t0:B15', 'PSI-25:t0:B17'], 'ambígua'))
        self.assertIn('B17', basis)

    def test_sample_and_gmt_without_test_number(self):
        ids, grade, _ = link('PSI-25_Raw Data_BASS_GMT167_SAMPLE_185_TEST original videos.zip')
        self.assertEqual((ids, grade), (['PSI-25:t0:P1'], 'provável'))
        ids, grade, _ = link('PSI-25_Raw Data_BASS_GMT164_SAMPLE_205_TEST original videos.zip')
        self.assertEqual((sorted(ids), grade), (['PSI-25:t0:O3a', 'PSI-25:t0:O3b'], 'ambígua'))

    def test_similar_looking_names_are_not_enough(self):
        # Same sample as O20 but another day, and an unknown test number: nothing to hold on to.
        self.assertEqual(link('PSI-25_Raw Data_BASS_GMT49_SAMPLE_204_TEST_O99.mp4')[0], [])
        self.assertEqual(link('PSI-25_Raw Data_crew-ops-overview.mp4')[0], [])
        self.assertEqual(link('PSI-25_Raw Data_iss040e082016.zip')[0], [])


class Inventory(unittest.TestCase):
    FILES = [{'name': 'PSI-25_Raw Data_' + name, 'bytes': size, 'folder': 'Raw Data'} for name, size in [
        ('BASS_GMT178_SAMPLE_135_TEST_T11.mp4', 12), ('BASS_GMT178_SAMPLE_135_TEST_T11_2ND_VIEW.mp4', 31),
        ('BASS_GMT178_SAMPLE_135_TEST_T11_Still_Sequence.mp4', 3), ('BASS_GMT178_SAMPLE_135_TEST_T11 original videos.zip', 70),
        ('GMT2014_178_BASS_S135M_TPT11_ProofSheet.pdf', 1), ('BASS_GMT183_SAMPLE_175_TESTB15.mp4', 21),
        ('GMT2014_050_BASS_S147M_TPB1_ProofSheet.pdf', 1), ('iss040e082016.zip', 1600),
    ]] + [{'name': 'PSI-25_Reports_BASS-II Summary Report.pdf', 'bytes': 49, 'folder': 'Reports'}]

    def setUp(self):
        self.product = build_inventory(RECORDS, self.FILES, None)
        self.by_test = {item['test']: item for item in self.product['records']}

    def test_multiple_videos_and_second_view_of_one_record(self):
        t11 = self.by_test['T11']
        self.assertEqual(t11['videoAssociation'], {'status': 'confirmada', 'videoCount': 3, 'videoBytes': 46,
                                                   'roles': {'primary-video': 1, 'second-view': 1, 'still-sequence': 1}})
        self.assertEqual(len(t11['files']), 5)
        self.assertEqual(t11['material']['family'], 'SIBAL')

    def test_records_without_video_and_with_documents_only(self):
        self.assertEqual(self.by_test['O20']['videoAssociation']['status'], 'não encontrada')
        b1 = self.by_test['B1']  # a proof sheet is evidence of the test, not a video of it
        self.assertEqual((b1['videoAssociation']['status'], [item['role'] for item in b1['files']]),
                         ('não encontrada', ['proof-sheet-pdf']))
        self.assertEqual(self.by_test['B17']['videoAssociation']['status'], 'ambígua')

    def test_non_experiment_files_stay_outside_the_records(self):
        roles = {item['role'] for item in self.product['unassigned']}
        self.assertEqual(roles, {'iss-image-zip', 'document'})
        self.assertEqual(self.product['summary']['unassignedFiles'], 2)
        self.assertEqual(self.product['summary']['records'], len(RECORDS))

    def test_sample_reuse_and_reconciliation_fields(self):
        self.assertEqual(self.by_test['O3a']['sample']['alsoUsedBy'], ['O3b'])
        self.assertEqual(self.product['reconciliation']['testsRunTwice'], ['O3', 'O8', 'P13'])
        self.assertEqual(self.product['reconciliation']['rowsByYearOfDateCell'], {'2014': 12, '2016': 1, '2018': 1})
        self.assertEqual(self.by_test['O10']['notes'], ['GMT do CSV (213) difere do dia do ano da data (203)'])

    def test_free_text_flow_cells_are_kept_verbatim(self):
        steps = flow_steps('5, 3,  pot 0.4, <1')
        self.assertEqual([step['raw'] for step in steps], ['5', '3', 'pot 0.4', '<1'])
        self.assertEqual([step['value'] for step in steps], [5.0, 3.0, None, None])
        self.assertIsNone(flow_steps(None))

    def test_calibration_is_never_borrowed_from_another_day_or_restrictor(self):
        calibration = {'days': [{'gmtDay': 178, 'year': 2014, 'gmtLabel': '2014-178', 'columns': 'AM:AO', 'blocks': [
            {'restrictors': 0, 'measuredPoints': 0, 'points': []},
            {'restrictors': 2, 'measuredPoints': 2, 'points': [
                {'fanDisplay': 55, 'airDisplayCmS': 7}, {'fanDisplay': 38, 'airDisplayCmS': 0}]}]}]}
        self.assertEqual(calibration_for(178, '2', calibration)['days'][0]['fanDisplayRange'], [38, 55])
        self.assertEqual(calibration_for(178, '0', calibration)['days'], [])
        self.assertEqual(calibration_for(177, '2', calibration)['status'], 'sem calibração registrada para este dia')
        self.assertEqual(calibration_for(178, '2', None)['status'], 'documento não disponível')


class RepositorySnapshot(unittest.TestCase):
    """The real listing: every one of the 129 records is present exactly once."""

    def test_all_catalogue_records_are_inventoried(self):
        snapshot = json.loads(SNAPSHOT.read_text(encoding='utf-8'))
        records = next(item for item in snapshot['investigations'] if item['id'] == 'PSI-25')['tests']
        files = current_files(json.loads(METADATA.read_text(encoding='utf-8')))
        product = build_inventory(records, files, None)
        self.assertEqual([item['recordId'] for item in product['records']], [item['id'] for item in records])
        self.assertEqual(len(product['records']), 129)
        self.assertEqual(sum(product['summary']['recordsByVideoAssociation'].values()), 129)
        attached = {item['name'] for entry in product['records'] for item in entry['files']}
        loose = {item['name'] for item in product['unassigned']}
        self.assertEqual(attached | loose, {item['name'] for item in files})
        self.assertFalse(attached & loose)
        o3a = next(item for item in product['records'] if item['test'] == 'O3a')
        self.assertEqual(o3a['videoAssociation']['status'], 'confirmada')


if __name__ == '__main__':
    unittest.main()
