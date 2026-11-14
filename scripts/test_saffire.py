import io
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from zipfile import ZipFile

import numpy as np

from calibrate_saffire import boundary, merge, nearest, simulate, transition_counts
from ingest_saffire import archive_frames, fetch
from calibrate_saffire_neighbors import count_neighborhoods, make_grid, neighbors, simulate_grid


class Response(io.BytesIO):
    def __init__(self, body, url, status=200, headers=None):
        super().__init__(body)
        self.url = url
        self.status = status
        self.headers = headers or {}


class SaffireTests(unittest.TestCase):
    def test_resume_after_incomplete_download(self):
        endpoint = 'https://psi.nasa.gov/geode-py/ws/studies/PSI-98/download'
        signed = 'https://psi-curation-prod.s3.amazonaws.com/file'
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / 'test.zip'
            with patch('ingest_saffire.urlopen', side_effect=[
                Response(signed.encode(), endpoint), Response(b'123', signed),
            ]):
                with self.assertRaisesRegex(ValueError, 'incompleto'):
                    fetch(endpoint, target, 6)
            self.assertFalse(target.exists())
            with patch('ingest_saffire.urlopen', side_effect=[
                Response(signed.encode(), endpoint),
                Response(b'456', signed, 206, {'Content-Range': 'bytes 3-5/6'}),
            ]) as open_url:
                fetch(endpoint, target, 6)
                self.assertEqual(open_url.call_args.args[0].get_header('Range'), 'bytes=3-')
            self.assertEqual(target.read_bytes(), b'123456')
            self.assertFalse(target.with_suffix('.zip.part').exists())

    def test_archive_timestamps_are_sorted_and_camera_filtered(self):
        with TemporaryDirectory() as tmp:
            path = Path(tmp) / 'example.zip'
            with ZipFile(path, 'w') as archive:
                for name in ('Mapped_S1C1-1465937148510.jpeg', 'Mapped_S1C2-1465937148500.jpeg',
                             'sub/Mapped_S1C1-1465937148477.jpeg'):
                    archive.writestr(name, b'jpeg')
            frames = archive_frames(path, 'S1C1')
        self.assertEqual([t for t, _ in frames], [1465937148477, 1465937148510])
        self.assertEqual(nearest([1000, 1033, 1066], 1030, 10), 1033)
        self.assertIsNone(nearest([1000, 1033, 1066], 1030, 2))

    def test_boundary_and_camera_agreement(self):
        profile = np.r_[np.full(81, 230), np.full(59, 22)]
        self.assertEqual(boundary(profile), 81)
        self.assertIsNone(boundary(np.full(140, 22)))
        self.assertEqual(merge([100, 200, None], [108, 250, 302], 27), ([104, None, 302], [8, 50]))

    def test_known_transitions_and_censoring(self):
        frames = [[1, None, 3, 1, 0], [2, 1, 2, 3, 0], [2, 2, None, 4, 0]]
        self.assertEqual(transition_counts(frames),
                         {'exposures': 5, 'transitions': 4, 'jumps': 1, 'gaps': 2, 'retreats': 1})
        self.assertEqual(simulate([1, None, 94, 0], 1, 2),
                         [[1, None, 94, 0], [2, None, 94, 0], [3, None, 94, 0]])

    def test_neighbor_states_boundaries_and_unknown(self):
        grid = [[1, 1, 1, 0], [1, 0, 0, 0], [1, 1, 1, 0]]
        self.assertEqual(neighbors(grid, 1, 1), '111')
        self.assertEqual(neighbors(grid, 0, 3), '100')
        self.assertEqual(neighbors(grid, 1, 2), '011')
        self.assertEqual(neighbors(grid, 0, 0), '001')
        grid[0][1] = None
        self.assertIsNone(neighbors(grid, 1, 1))

    def test_neighbor_counts_and_gaps(self):
        result = count_neighborhoods([[3, 1, 3], [3, 2, 3]], columns=4)
        self.assertEqual(result['combinations']['111']['exposures'], 1)
        self.assertEqual(result['combinations']['111']['transitions'], 1)
        self.assertEqual(result['combinations']['011']['exposures'], 1)
        self.assertEqual(result['combinations']['011']['transitions'], 0)
        self.assertIsNone(result['combinations']['111']['probability'])
        missing = count_neighborhoods([[2, 1, None], [2, 2, None]], columns=4)
        self.assertGreater(missing['censored'], 0)

    def test_simulation_is_simultaneous_and_missing_combinations_are_blocked(self):
        combinations = {f'{n:03b}': {'probability': 1.0} for n in range(8)}
        combos_missing = {**combinations, '100': {'probability': None}}
        history, blocked, _ = simulate_grid([1], combos_missing, 2, 1951, columns=4)
        self.assertEqual(history[-1], [[1, 0, 0, 0]])
        self.assertEqual(sum(blocked), 2)
        history, _, _ = simulate_grid([1], combinations, 2, 1951, columns=4)
        self.assertEqual(history, [[[1, 0, 0, 0]], [[1, 1, 0, 0]], [[1, 1, 1, 0]]])
        self.assertEqual(history, simulate_grid([1], combinations, 2, 1951, columns=4)[0])


if __name__ == '__main__':
    unittest.main()
