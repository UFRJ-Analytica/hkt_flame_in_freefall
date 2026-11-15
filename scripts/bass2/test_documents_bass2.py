"""Focused checks of the document parsers on small synthetic inputs (no cache, no pdftotext)."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from documents_bass2 import (MATRIX_COLUMNS, excel_date, observation, parse_appendix_a,  # noqa: E402
                             parse_fan_calibration, parse_test_matrices, slab_row, tokens)

PAGE = """TABLE A.1.--TEST MATRIX
Actual date (for video display date,
2/14/2014
GMT
2014-45
12:45:40 to
12:47:10
1 T1 128 SIBAL 2 cm Integrated 2 1 80 10 50 0.97
maximum
10 0 N CL M NA NA 1/8 F2 1,000 100 s 2 85 18.5 18.5 17.3 17.3 0.35 0.41 0 40 Flow velocity held
constant
6/27/2014 ---------- 42 T11 135m 2 cm SIBAL Integral 2 Concurrent 48 5 250 --------- NA NA N CL M NA NA ---- F2 1,000 Cont 12 109 17.1 17.0 16.2 16.1 0.35 0.39 1 45 Burned completely, steady, HCl 0.3 to 0.9
6/13/2014
GMT 164
-------- 23 O3a 205M 6.35-mm
clear rod
-23 2 Concurrent ------------ 5, 3 1,000 ---- 8 NA N CL A -4 NA --- F2 1,000 Cont 9 85 18.0 18.0 15.9 15.9 0.25 0.28 16 22 Flame extinguished
-------- 24 O3b 205M 6.35-mm clear rod -23 2 Concurrent ------------ 5, 3, 2, 1, low 1,000 ---- NA NA N CL A -4 NA --- F2 1,000 Cont 9 306 18.0 17.7 15.9 15.6 0.28 0.53 22 116 Flame sooty
6/26/2014 -------- 37 O6 206M 6.35-mm clear rod -24 2 Stagnation 5, 0.36 See fan 250 ---- NA NA N CL A -4 NA --- F2 1,000 Cont 2 241 16.7 16.0 15.8 15.1 0.32 0.74 1 232 ---------------
aGreenwich Mean Time.
NASA/TM-20210011385 112
"""


def sheet(rows):
    return {'name': 'Fan Calibration data', 'cells': {
        (r + 1, c + 1): {'value': value, 'formula': None}
        for r, row in enumerate(rows) for c, value in enumerate(row) if value is not None}}


class AppendixA(unittest.TestCase):
    def setUp(self):
        self.result = parse_appendix_a(['cover', PAGE, 'Appendix B.--Model'])
        self.rows = {row['test']: row for row in self.result['rows']}

    def test_every_as_run_row_is_found_once_even_without_a_leading_date(self):
        self.assertEqual([row['asRun'] for row in self.result['rows']], [1, 23, 24, 37, 42])
        self.assertEqual((self.result['asRunMissing'][:2], self.result['asRunDuplicated']), ([2, 3], []))
        self.assertEqual(self.rows['O3b']['printedDate'], None)
        self.assertEqual(self.rows['T11']['pdfPage'], 2)

    def test_clock_direction_and_observation_stay_with_their_row(self):
        t1 = self.rows['T1']
        self.assertEqual((t1['videoDisplayStart'], t1['videoDisplayEnd'], t1['flowDirection']), ('12:45:40', '12:47:10', None))
        self.assertEqual(t1['observationsRaw'], 'Flow velocity held constant')
        t11 = self.rows['T11']
        self.assertEqual((t11['flowDirection'], t11['videoDisplayStart']), ('concurrent', None))
        self.assertEqual(t11['observationsRaw'], 'Burned completely, steady, HCl 0.3 to 0.9')
        self.assertEqual(self.rows['O3a']['observationsRaw'], 'Flame extinguished')

    def test_dashes_and_footnotes_are_not_observations(self):
        self.assertIsNone(self.rows['O6']['observationsRaw'])
        self.assertEqual(self.rows['O6']['flowDirection'], 'stagnation')
        self.assertIsNone(observation('no camera block on this line'))

    def test_missing_table_is_reported_not_invented(self):
        self.assertEqual(parse_appendix_a(['nothing here'])['status'], 'unavailable')


class PublishedSlabTable(unittest.TestCase):
    def test_velocity_and_spread_lists_split_by_parity_despite_a_stray_final_o2(self):
        row = slab_row('M7   1   1.2         2         10, 6, 5, and 3 0.106, 0.099, 0.083, and 0.07 18.4  18.9             18.7')
        self.assertEqual((row['velocityCmS'], row['spreadRateMmS']), ([10, 6, 5, 3], [0.106, 0.099, 0.083, 0.07]))
        self.assertEqual((row['burnTimeMin'], row['initialO2Pct'], row['widthCm'], row['sidesBurning']), (18.4, 18.9, 1.2, 2))
        row = slab_row('M10  4   1.2         2         15 and 10       0.0373 and 0.03            30.5     20.1')
        self.assertEqual((row['spreadRateMmS'], row['burnTimeMin'], row['initialO2Pct']), ([0.0373, 0.03], 30.5, 20.1))

    def test_untracked_or_unreadable_lines_do_not_get_numbers(self):
        row = slab_row('M6   1   2.2         2         10 and 8            Not tracked            16.8     21.8             21.6')
        self.assertEqual((row['velocityCmS'], row['spreadRateMmS'], row['initialO2Pct']), ([10, 8], None, 21.8))
        self.assertIsNone(slab_row('M9   3   1.2         2         14 16.8'))
        self.assertIsNone(slab_row('Test Thickness, Width, One or  Velocity'))


class Workbooks(unittest.TestCase):
    def test_calibration_blocks_follow_descending_pot_sweeps(self):
        rows = [[None] * 3 for _ in range(14)]
        rows[2] = ['DATE', '41817', None]
        rows[3] = ['GMT', '2014-178', None]
        rows[5] = ['Pot', 'Fan Display', 'Air Display']
        rows[6:8] = [['10', '122', None], ['0', '38', '0']]
        rows[8] = [None, None, 'decr']
        rows[9:11] = [['10', '122', None], ['0', '38', None]]
        rows[11] = [None, None, 'Air']
        rows[12:14] = [['10', '122', '33'], ['2', '55', '7']]
        day = parse_fan_calibration(sheet(rows))['days'][0]
        self.assertEqual((day['gmtDay'], day['year'], day['date'], day['columns']), (178, 2014, '2014-06-27', 'A:C'))
        self.assertEqual([(block['restrictors'], block['measuredPoints']) for block in day['blocks']], [(0, 1), (1, 0), (2, 2)])
        self.assertEqual(day['blocks'][2]['points'][0], {'pot': 10, 'fanDisplay': 122, 'airDisplayCmS': 33, 'airCell': 'C13', 'row': 13})

    def test_workbook_rows_are_compared_with_the_csv_by_tokens(self):
        self.assertEqual(tokens('0.9, 1.3, 2.75'), tokens('0.9   1.3   2.75'))
        self.assertEqual(tokens('17.399999999999999'), tokens('17.4'))
        self.assertEqual(excel_date(41689), '2014-02-19')
        values = ['41689', '50', 'B1', '147', '100 micron pmma film, 2 cm wide', '2', '62', '5', '50', '57',
                  '22.2', '22.2', '0.44', '0.44', '0', '6']
        cells = {(1, c + 1): {'value': name, 'formula': None} for c, name in enumerate(MATRIX_COLUMNS)}
        cells.update({(2, c + 1): {'value': value, 'formula': None} for c, value in enumerate(values)})
        source = dict(zip(MATRIX_COLUMNS, ['2/19/2014', '50', 'B1', '147', '100 micron PMMA film   2 cm wide', '2', '62',
                                           '5', '50', '57', '22.2', '22.2', '0.44', '0.44', '0', '7']), PI='Bhattacharjee')
        result = parse_test_matrices([{'name': 'Bhattacharjee', 'cells': cells}], [source])
        self.assertEqual((result['rowCount'], result['testsOnlyInCsv']), (1, []))
        self.assertEqual([(item['field'], item['workbook'], item['csv']) for item in result['differencesFromCsv']],
                         [('Final CO (ppm)', '6', '7')])


if __name__ == '__main__':
    unittest.main()
