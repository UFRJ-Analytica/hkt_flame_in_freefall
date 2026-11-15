"""Invariants of the published SAFFIRE I/III cross-trial artefact (no frames needed)."""
import json
import unittest
from pathlib import Path

DATA = json.loads((Path(__file__).resolve().parents[1] / 'public/data/saffire/crosstrial-i-iii.json').read_text(encoding='utf-8'))


class SaffireIIIArtefact(unittest.TestCase):
    def test_counts_are_consistent(self):
        for key, value in DATA['neighborhood']['combinations'].items():
            with self.subTest(key=key):
                self.assertLessEqual(value['transitions'], value['exposures'])
                if value['probability'] is not None:
                    self.assertAlmostEqual(value['probability'], value['transitions'] / value['exposures'])

    def test_beta_matches_the_two_speeds(self):
        import math
        c = DATA['comparisonWithSaffireI']
        self.assertAlmostEqual(c['beta'], math.log(c['saffireIIIObservedSpeedMmS'] / c['saffireIObservedSpeedMmS']) / math.log(c['flowRatio']))

    def test_front_is_monotone_and_inside_the_camera_field(self):
        values = [p['frontMedianMm'] for p in DATA['observedTrajectory'] if p['frontMedianMm'] is not None]
        self.assertEqual(values, sorted(values))
        self.assertLessEqual(max(values), DATA['visibleLengthMm'])

    def test_prediction_is_out_of_trial(self):
        self.assertIn('sem reajuste', DATA['prediction']['description'])


class ProvenanceTests(unittest.TestCase):
    def test_source_fingerprint_survives_windows_git_line_endings(self):
        import hashlib
        import tempfile
        import crosstrial_saffire as cross
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'source.py'
            path.write_bytes(b'first\r\nsecond\r\n')
            self.assertEqual(cross.script_digest(path), hashlib.sha256(b'first\nsecond\n').hexdigest())

    def test_archive_identity_and_crc_deduplication(self):
        import tempfile
        import hashlib
        from zipfile import ZipFile
        import crosstrial_saffire as cross
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for part in (1, 2):
                with ZipFile(root / f'xS1C1_JPEG_Mapped_part{part}.zip', 'w') as z:
                    z.writestr('Mapped_S1C1-1500000000000.jpg', b'identical')
            items, audit = cross.index_frames(root)
            try:
                self.assertEqual(len(items), 1)
                self.assertEqual(audit['duplicateTimestamps'], 1)
                self.assertEqual(audit['duplicateEntries'], 1)
                self.assertEqual(len(audit['duplicateLineage']), 1)
                self.assertEqual(audit['zipAssets'][0]['sha256'], hashlib.sha256(next(root.glob('*part1.zip')).read_bytes()).hexdigest())
                self.assertEqual(audit['zipAssets'][0]['crcValidatedMembers'], 1)
            finally:
                for _, archive, _ in items:
                    archive.close()
            with ZipFile(root / 'xS1C1_JPEG_Mapped_part2.zip', 'w') as z:
                z.writestr('Mapped_S1C1-1500000000000.jpg', b'conflict')
            with self.assertRaisesRegex(ValueError, 'CRC'):
                cross.index_frames(root)

    def test_rejects_corrupted_member_bytes_before_deduplication(self):
        import tempfile
        from zipfile import ZipFile
        import crosstrial_saffire as cross
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / 'xS1C1_JPEG_Mapped_part1.zip'
            with ZipFile(path, 'w') as z:
                z.writestr('Mapped_S1C1-1500000000000.jpg', b'original-payload')
            path.write_bytes(path.read_bytes().replace(b'original-payload', b'corrupt!-payload'))
            with self.assertRaisesRegex(ValueError, 'CRC'):
                cross.index_frames(root)

    def test_rejects_ambiguous_duplicate_member_names(self):
        import tempfile
        import warnings
        from zipfile import ZipFile
        import crosstrial_saffire as cross
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                with ZipFile(root / 'xS1C1_JPEG_Mapped_part1.zip', 'w') as z:
                    z.writestr('Mapped_S1C1-1500000000000.jpg', b'first')
                    z.writestr('Mapped_S1C1-1500000000000.jpg', b'other')
            with self.assertRaisesRegex(ValueError, 'amb'):
                cross.index_frames(root)

    def test_selection_rejects_unordered_timestamps(self):
        import crosstrial_saffire as cross
        # Invalid input must be rejected before attempting image access.
        for items in ([(2, None, ''), (1, None, '')], [(1, None, ''), (1, None, '')]):
            with self.assertRaises(ValueError):
                cross.lit_bursts(items)

    def test_grouped_interval_mle_and_fixed_hazard_equivalence(self):
        import math
        import crosstrial_saffire as cross
        result = cross.fit_interval_hazard([2., 2., 2., 2.], [1, 0, 0, 0])
        self.assertAlmostEqual(result['ratePerSecond'], -math.log(.75) / 2)
        self.assertAlmostEqual(result['probabilityAt2Seconds'], .25)
        variable = cross.fit_interval_hazard([1., 3.], [1, 0])
        self.assertAlmostEqual(variable['ratePerSecond'], math.log(4 / 3))
        self.assertNotAlmostEqual(variable['ratePerSecond'], 1 / 4)
        self.assertEqual(cross.fit_interval_hazard([1.], [0])['ratePerSecond'], 0)
        self.assertIsNone(cross.fit_interval_hazard([1.], [1])['ratePerSecond'])
        self.assertIsNone(cross.fit_interval_hazard([], [])['ratePerSecond'])

    def test_rejects_nonfinite_unordered_or_invalid_data(self):
        import crosstrial_saffire as cross
        for times in ([0., 0.], [2., 1.], [0., float('nan')]):
            with self.assertRaises(ValueError):
                cross.interval_sensitivity([[1], [2]], times, columns=4)
        for dt, events in (([float('nan')], [1]), ([0.], [1]), ([1.], [2]), ([1.], [])):
            with self.assertRaises(ValueError):
                cross.fit_interval_hazard(dt, events)
        with self.assertRaises(ValueError):
            cross.interval_sensitivity([[2], [1]], [0., 1.], columns=4)

    def test_risk_set_censoring_and_interval_exposure(self):
        import crosstrial_saffire as cross
        # first intact cell is exposed; following cells with 000 are excluded.
        result = cross.interval_sensitivity([[1], [2], [None]], [0., 1., 4.], columns=4)
        combo = result['combinations']['100']
        self.assertEqual(combo['exposures'], 1)
        self.assertEqual(combo['transitions'], 1)
        self.assertEqual(combo['observedCellSeconds'], 1.)
        self.assertEqual(result['censoredCellIntervals'], 2)
        self.assertEqual(result['excludedNoActiveNeighborCellIntervals'], 2)
        self.assertEqual(result['deltaSeconds'], [1., 3.])
        self.assertEqual(result['combinations']['100']['variableInterval']['status'], 'all-events-unbounded')

    def test_published_provenance_and_observations(self):
        import hashlib
        audit = DATA['provenance']['frameAudit']
        self.assertEqual(len(audit['zipAssets']), 4)
        self.assertEqual(audit['uniqueFrames'], DATA['frames']['total'])
        script_bytes = Path(__file__).with_name('crosstrial_saffire.py').read_bytes().replace(b'\r\n', b'\n')
        self.assertEqual(DATA['provenance']['script'], hashlib.sha256(script_bytes).hexdigest())
        self.assertIn('CRLF normalized to LF', DATA['provenance']['scriptHashConvention'])
        observations = DATA['observations']['selectedFrames']
        self.assertEqual(len(observations), DATA['frames']['illuminatedBursts'])
        self.assertEqual(observations[0]['timestampMs'], DATA['observations']['epochInitialMs'])
        self.assertEqual([p['timeS'] for p in observations], [p['timeS'] for p in DATA['observedTrajectory']])
        for point in observations:
            self.assertEqual(len(point['frontGridCells']), 21)
            self.assertEqual(len(point['frontMm']), 21)
            self.assertGreater(point['lineage']['uncompressedBytes'], 0)
            self.assertIn('crc32', point['lineage'])
        self.assertEqual(len(DATA['timeSensitivity']['deltaSeconds']), len(observations) - 1)
        json.dumps(DATA, allow_nan=False)


if __name__ == '__main__':
    unittest.main()
