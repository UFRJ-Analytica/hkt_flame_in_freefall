"""Focused safeguards for real-source ingestion. No network calls or broad suite."""
import csv
import hashlib
import io
import json
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch

from sync_nasa import ROOT, RAW, PUBLIC, atomic_write, decode_csv, main as sync_main, normalized, parse_csv, scalar


class NasaImportChecks(unittest.TestCase):
    def test_unqualified_airflow_is_not_a_measured_velocity(self):
        self.assertIsNone(normalized({'Air Flow': '20'}, 'PSI-99')['flowCmS'])
        self.assertEqual(normalized({'Air Flow': '20 cm/s'}, 'PSI-99')['flowCmS'], 20)

    def test_atomic_write_preserves_an_unrelated_new_file(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.scratch') as folder:
            target = Path(folder) / 'snapshot.json'
            foreign = Path(folder) / 'snapshot.json.new'
            foreign.write_bytes(b'unrelated work')
            atomic_write(target, b'actual snapshot')
            self.assertEqual(target.read_bytes(), b'actual snapshot')
            self.assertEqual(foreign.read_bytes(), b'unrelated work')

    def test_partial_online_import_keeps_previous_public_snapshot(self):
        with tempfile.TemporaryDirectory(dir=ROOT / '.scratch') as folder:
            target = Path(folder) / 'nasa-experiments.json'
            target.write_bytes(b'previous complete snapshot')
            result = ({'id': 'PSI-25', 'status': 'downloaded', 'testCount': 1, 'tests': [{}]},
                      [{'retrievedAt': '2026-01-01T00:00:00+00:00'}],
                      [{'id': 'PSI-25', 'message': 'one table unavailable'}])
            with patch('sync_nasa.PUBLIC', Path(folder)), patch('sync_nasa.import_investigation', return_value=result), patch('sys.argv', ['sync_nasa.py', '--ids', 'PSI-25']):
                self.assertEqual(sync_main(), 1)
            self.assertEqual(target.read_bytes(), b'previous complete snapshot')

    def test_intervals_lists_and_approximations_are_not_point_measurements(self):
        for value in ['~ 21.5', '21.5 - 21.7', '22.1 to 22.0', '21; 26.5; 40', '', 'n/a']:
            self.assertIsNone(scalar(value))
        self.assertEqual(scalar('20 cm/s', ('cm/s',)), 20)

    def test_flex_converts_only_explicit_units(self):
        result = normalized({'Fuel': 'Methanol', 'Ambient pressure; mmHg': '760',
                             'O initial ambient composition; mole fraction': '0.21'}, 'PSI-69')
        self.assertAlmostEqual(result['pressureKpa'], 101.325, places=6)
        self.assertEqual(result['oxygenPct'], 21)

    def test_bass_air_display_is_not_a_calibrated_velocity(self):
        result = normalized({'Air display': '5', 'Fan display': '62',
                             'Calibrated  initial O2 % by vol ': '22.2'}, 'PSI-25')
        self.assertEqual(result['oxygenPct'], 22.2)
        self.assertIsNone(result['flowCmS'])
        self.assertIsNone(result['outcome'])

    def test_bre_anomalies_are_not_repaired(self):
        raw = {'Fuel Bottle': '50% C2H4', 'Oxygen Conc (percent)': '3400%'}
        result = normalized(raw, 'PSI-20')
        self.assertIsNone(result['oxygenPct'])
        self.assertEqual(raw['Oxygen Conc (percent)'], '3400%')

    def test_saffire_notes_are_not_experiment_records(self):
        folder = RAW / 'PSI-99'
        content = (folder / 'PSI-99_Experimental table_SAFFIRE-2.csv').read_bytes()
        _, records, excluded, _ = parse_csv(content, 'PSI-99', 0, 'original.csv')
        self.assertEqual([record['label'] for record in records], [f'2-{i}' for i in range(1, 10)])
        self.assertEqual(len(excluded), 6)
        self.assertIsNone(records[5]['material'])  # blank source cell: no forward-fill
        self.assertIsNone(records[0]['oxygenPct'])  # source is approximate
        self.assertEqual(records[0]['raw']['Percent O2 (Note 1)'], '~ 21.5')

    def test_snapshot_is_traceable_to_every_original_csv_cell(self):
        data = json.loads((PUBLIC / 'nasa-experiments.json').read_text(encoding='utf-8'))
        seen = set()
        for investigation in data['investigations']:
            self.assertEqual(investigation['testCount'], len(investigation['tests']))
            manifest = json.loads((RAW / investigation['id'] / 'manifest.json').read_text(encoding='utf-8'))
            metadata = manifest['metadata']
            self.assertEqual(hashlib.sha256((ROOT / metadata['path']).read_bytes()).hexdigest(), metadata['sha256'])
            originals = {}
            for table in manifest['tables']:
                content = (ROOT / table['path']).read_bytes()
                self.assertEqual(hashlib.sha256(content).hexdigest(), table['sha256'])
                text, _ = decode_csv(content)
                rows = list(csv.reader(io.StringIO(text)))
                originals[table['filename']] = rows
            for record in investigation['tests']:
                self.assertNotIn(record['id'], seen)
                seen.add(record['id'])
                rows = originals[record['sourceFile']]
                values = rows[record['sourceRow'] - 1]
                values += [''] * (len(rows[0]) - len(values))
                expected = {key: value if value != '' else None for key, value in zip(rows[0], values)}
                self.assertEqual(record['raw'], expected)
        self.assertEqual(len(seen), sum(i['testCount'] for i in data['investigations']))
        self.assertGreater(len(seen), 0)
        public_text = (PUBLIC / 'nasa-provenance.json').read_text(encoding='utf-8')
        self.assertNotIn('AWSAccessKeyId', public_text)
        self.assertNotIn('x-amz-security-token', public_text)


if __name__ == '__main__':
    unittest.main()
