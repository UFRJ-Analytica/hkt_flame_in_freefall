"""The interface JSON public/data/bass2/b1-replay.json: integrity, units, order, no scale, coherence with P3."""
import csv
import json
import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import annotate_b1 as annotate  # noqa: E402
import build_b1_replay as replay  # noqa: E402


@unittest.skipUnless(replay.OUTPUT.exists(), 'b1-replay.json ainda não gerado')
class ReplayFile(unittest.TestCase):
    DATA = json.loads(replay.OUTPUT.read_text(encoding='utf-8')) if replay.OUTPUT.exists() else {}
    PIXEL = json.loads(replay.INPUTS['flamefrontPixel'].read_text(encoding='utf-8'))

    def test_file_is_reproducible_from_the_p3_artefacts(self):
        self.assertEqual(replay.OUTPUT.read_text(encoding='utf-8'), replay.render(replay.build()))

    def test_identification(self):
        experiment = self.DATA['experiment']
        self.assertEqual((experiment['investigationId'], experiment['recordId'], experiment['test']), ('PSI-25', 'PSI-25:t0:r2', 'B1'))
        self.assertEqual((experiment['material'], experiment['thickness_um']), ('PMMA', 100))

    def test_units_are_pixels_and_seconds(self):
        self.assertEqual(self.DATA['units'], {'time': 's', 'position': 'px', 'velocity': 'px/s'})
        for band, velocity in self.DATA['velocities'].items():
            self.assertIn('value_px_s', velocity)
            self.assertFalse([key for key in velocity if 'mm' in key.split('_')], band)

    def test_no_spatial_scale_and_no_physical_velocity(self):
        self.assertEqual(self.DATA['spatialScale']['status'], 'insufficient')
        self.assertIsNone(self.DATA['spatialScale']['mm_per_px'])
        self.assertIsNone(self.DATA['physicalVelocity']['value_mm_s'])
        self.assertEqual(self.DATA['physicalVelocity']['status'], 'blocked_spatial_calibration')
        self.assertEqual(self.DATA['nasaReference']['comparisonStatus'], 'blocked_spatial_calibration')
        # The only millimetre number in the file is the published reference (and the documented sample width).
        def millimetre_numbers(value, path=''):
            if isinstance(value, dict):
                for key, item in value.items():
                    if '_mm' in key and item is not None:
                        yield f'{path}.{key}'
                    yield from millimetre_numbers(item, f'{path}.{key}')
            elif isinstance(value, list):
                for item in value:
                    yield from millimetre_numbers(item, path)
        self.assertEqual(sorted(millimetre_numbers(self.DATA)), ['.experiment.width_mm_nominal', '.nasaReference.value_mm_s'])

    def test_time_is_strictly_increasing_and_frames_are_consecutive(self):
        series = self.DATA['series']
        t, frames = series['t_s'], series['frame']
        self.assertTrue(all(b > a for a, b in zip(t, t[1:])))
        self.assertEqual(frames, list(range(frames[0], frames[-1] + 1)))
        self.assertEqual(len(series['clock']), len(frames))
        window = self.DATA['window']
        self.assertEqual(t[frames.index(window['frameFirst'])], 0.0)

    def test_series_values_are_finite_or_null_never_zero_fill(self):
        series = self.DATA['series']
        for band, front in series['fronts'].items():
            self.assertEqual(len(front['x_px']), len(series['frame']))
            self.assertEqual(len(front['quality']), len(series['frame']))
            for x, quality in zip(front['x_px'], front['quality']):
                if x is None:
                    self.assertIn(quality, ('absent', 'rejected', 'unseeded'), band)
                else:
                    self.assertTrue(math.isfinite(x) and x > 0, band)
                    self.assertIn(quality, ('ok', 'low'), band)

    def test_series_match_the_tracks_frame_by_frame(self):
        name = f"{self.DATA['method']['id']}_front"
        with replay.INPUTS['flamefrontTracks'].open(encoding='utf-8') as stream:
            rows = {(int(row['ts_frame']), row['band']): row for row in csv.DictReader(stream) if row['series'] == name}
        for band, front in self.DATA['series']['fronts'].items():
            for frame, x in zip(self.DATA['series']['frame'], front['x_px']):
                source = rows[(frame, band)]['tracked_px']
                if source == '':
                    self.assertIsNone(x)
                else:
                    self.assertAlmostEqual(x, float(source), places=2)

    def test_summary_values_equal_p3_and_the_series(self):
        series = self.DATA['series']
        window = self.DATA['window']
        index = [i for i, frame in enumerate(series['frame']) if window['frameFirst'] <= frame <= window['frameLast']]
        for band, velocity in self.DATA['velocities'].items():
            p3 = self.PIXEL['primary']['bands'][band]
            self.assertEqual(velocity['value_px_s'], p3['slope'])
            self.assertEqual(velocity['ci95_px_s'], p3['ci95'])
            self.assertLess(velocity['ci95_px_s'][0], velocity['value_px_s'])
            self.assertGreater(velocity['ci95_px_s'][1], velocity['value_px_s'])
            refit = replay.ols_slope([series['t_s'][i] for i in index], [series['fronts'][band]['x_px'][i] for i in index])
            self.assertAlmostEqual(refit, velocity['value_px_s'], delta=2e-3)

    def test_events_come_from_p2_and_are_ordered(self):
        events = {event['id']: event for event in self.DATA['events']}
        regimes = json.loads(replay.INPUTS['regimes'].read_text(encoding='utf-8'))['events']
        for key in ('light_first_visible', 'fan_drop_start', 'flame_luminous_last', 'flame_dim_last'):
            self.assertEqual(events[key]['frameFirst'], regimes[key]['first']['frame'])
        starts = [event['t_s'] for event in self.DATA['events']]
        self.assertEqual(starts, sorted(starts))
        self.assertEqual(events['front_stable_start']['kind'], 'inference')

    def test_telemetry_is_raw_display_without_velocity(self):
        points = self.DATA['telemetry']['points']
        self.assertTrue(points)
        for point in points:
            self.assertEqual(set(point), {'frameFirst', 't_s', 'fan', 'fanVoltage_v', 'air'})
        self.assertIn('não é uma medição instantânea', self.DATA['telemetry']['airNote'])

    def test_annotations_are_marked_preliminary(self):
        reference = self.DATA['referenceAnnotations']
        self.assertEqual(reference['status'], 'preliminary')
        self.assertFalse(reference['independent'])
        self.assertEqual(len(reference['points']), 32)

    def test_mandatory_limitations_are_present(self):
        ids = {item['id'] for item in self.DATA['limitations']}
        self.assertTrue({'pixels', 'no-scale', 'px-per-s', 'nasa-reference', 'annotations', 'b1-only'} <= ids)

    def test_file_is_small(self):
        self.assertLess(replay.OUTPUT.stat().st_size, 150_000)


class AnnotationTools(unittest.TestCase):
    def test_new_annotator_never_writes_over_the_preliminary_reference(self):
        path = annotate.annotator_file('Maria Silva')
        self.assertEqual(path.name, 'b1-annotations-maria-silva.csv')
        self.assertNotEqual(path.resolve(), annotate.ANNOTATIONS.resolve())
        self.assertEqual(annotate.annotator_file('  ').name, 'b1-annotations-anotador.csv')

    def test_agreement_metrics(self):
        a = {1: 100.0, 2: 110.0, 3: None, 4: 130.0}
        b = {1: 103.0, 2: 108.0, 3: 120.0, 4: None}
        metrics = annotate.agreement(a, b)
        self.assertEqual(metrics['n'], 2)
        self.assertAlmostEqual(metrics['mae'], 2.5)
        self.assertAlmostEqual(metrics['bias'], 0.5)
        self.assertEqual(metrics['maxAbs'], 3.0)
        self.assertEqual(metrics['visibilityDisagreements'], 2)

    def test_template_has_the_32_frames_of_the_reference_and_no_values(self):
        with annotate.TEMPLATE.open(encoding='utf-8') as stream:
            rows = list(csv.DictReader(stream))
        reference = annotate.read_annotations()
        self.assertEqual([int(row['ts_frame']) for row in rows], [entry['ts_frame'] for entry in reference])
        self.assertTrue(all(row['upper_front_px'] == '' and row['lower_front_px'] == '' for row in rows))


if __name__ == '__main__':
    unittest.main()
