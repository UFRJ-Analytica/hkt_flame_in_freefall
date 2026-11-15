"""Checks of the overlay reader, the telemetry table and the B1 timebase.

Unit tests use synthetic frames composed with the versioned glyph templates and synthetic clock ticks.
The last class checks the real B1 products when the cache and the derived files are present.

    python -m unittest discover -s scripts/bass2 -p "test_b1_*.py"
"""
import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_b1_timebase as timebase  # noqa: E402
import extract_b1_telemetry as telemetry  # noqa: E402
import overlay_bass2 as overlay  # noqa: E402

GLYPHS = overlay.load_glyphs()
TEMPLATE = {}
for label, pixels in GLYPHS['_arrays']:
    TEMPLATE.setdefault(label, pixels)


def render(fields: dict[str, str], noise: float = 3.0, seed: int = 0, shift: tuple[int, int] = (0, 0)) -> np.ndarray:
    """A 480 x 720 grey frame with the given field texts drawn right-aligned in their cells."""
    rng = np.random.default_rng(seed)
    frame = rng.normal(8, noise, (480, 720)).clip(0, 255).astype(np.float32)
    layout = GLYPHS['layout']
    for name, text in fields.items():
        spec = layout['fields'][name]
        cells = spec['cells'][-len(text):] if text else []
        for char, cell in zip(text, cells):
            if char == ' ':
                continue
            x, y, w, h = overlay.cell_box(layout, spec['row'], cell)
            x, y = x + shift[0], y + shift[1]
            glyph = TEMPLATE[char]
            frame[y:y + h, x:x + w] = np.maximum(frame[y:y + h, x:x + w], glyph[:, :max(0, min(w, 720 - x))])
    return frame


DEFAULT = {'fuel': '-2', 'air': '5', 'fan': '62', 'rad': '1.29', 'date': '02/20/14', 'time': '10:10:06'}


class OverlayReading(unittest.TestCase):
    def test_every_field_is_read_from_a_clean_synthetic_frame(self):
        fields = overlay.read_overlay(render(DEFAULT), GLYPHS)
        self.assertEqual({name: field.raw for name, field in fields.items()}, DEFAULT)
        self.assertTrue(all(field.confidence == 'high' for field in fields.values()))

    def test_small_shift_and_noise_are_tolerated(self):
        values = {**DEFAULT, 'fan': '38', 'air': '4', 'rad': '0.22', 'fuel': '-3', 'time': '10:10:19'}
        fields = overlay.read_overlay(render(values, noise=6, seed=3, shift=(2, -1)), GLYPHS)
        self.assertEqual({name: field.raw for name, field in fields.items()}, values)

    def test_three_digit_fan_and_all_digits(self):
        fields = overlay.read_overlay(render({**DEFAULT, 'fan': '122', 'time': '23:45:59', 'rad': '8.70'}), GLYPHS)
        self.assertEqual((fields['fan'].raw, fields['time'].raw, fields['rad'].raw), ('122', '23:45:59', '8.70'))

    def test_missing_field_is_unreadable_not_zero(self):
        fields = overlay.read_overlay(render({**DEFAULT, 'air': ''}), GLYPHS)
        self.assertEqual((fields['air'].raw, fields['air'].confidence), ('', 'unreadable'))
        self.assertIsNone(overlay.parse_number(fields['air'].raw))

    def test_blended_transition_glyph_is_refused(self):
        frame = render(DEFAULT)
        layout = GLYPHS['layout']
        x, y, w, h = overlay.cell_box(layout, 'values', 19)   # last RAD digit
        frame[y:y + h, x:x + w] = 0.5 * TEMPLATE['9'] + 0.5 * TEMPLATE['3']
        field = overlay.read_field(frame, GLYPHS, 'rad')
        self.assertEqual((field.raw, field.valid, field.confidence), ('1.2?', False, 'unreadable'))

    def test_text_that_breaks_the_field_pattern_is_not_valid(self):
        field = overlay.read_field(render({**DEFAULT, 'rad': '1290'}), GLYPHS, 'rad')
        self.assertFalse(field.valid)

    def test_number_and_clock_parsing(self):
        self.assertEqual(overlay.parse_number('-2'), -2.0)
        self.assertEqual(overlay.parse_number('0.05'), 0.05)
        for raw in ('', '-?', '1.2?', '5 ', 'pot 1'):
            self.assertIsNone(overlay.parse_number(raw), raw)
        self.assertEqual(overlay.parse_clock('10:09:47'), 36587)
        for raw in ('10:9:47', '24:00:00', '10:60:00', '10:09:4?', ''):
            self.assertIsNone(overlay.parse_clock(raw), raw)


def frame_row(index, **values):
    row = {'frame': str(index), 'pts_ms': f'{167 + 33.37 * index:.3f}'}
    for name in telemetry.FIELDS:
        raw = values.get(name, DEFAULT[name])
        row.update({f'{name}_raw': raw, f'{name}_confidence': 'unreadable' if '?' in raw or not raw else 'high',
                    f'{name}_score': '0.95', f'{name}_margin': '0.12'})
    return row


class TelemetryTable(unittest.TestCase):
    def test_repeated_readings_collapse_into_one_displayed_state(self):
        rows = [frame_row(0), frame_row(1), frame_row(2, fan='61'), frame_row(3, fan='61'), frame_row(4)]
        table = telemetry.telemetry_rows(rows, None)
        self.assertEqual([(row['source_frame'], row['last_frame'], row['frames']) for row in table],
                         [('0', '1', 2), ('2', '3', 2), ('4', '4', 1)])

    def test_raw_text_and_documented_conversions_are_separate_columns(self):
        row = telemetry.telemetry_rows([frame_row(0)], None)[0]
        self.assertEqual((row['fan_display_raw'], row['fan_voltage_v']), ('62', '6.2'))
        self.assertEqual((row['air_display_raw'], row['air_transducer_cm_s']), ('5', '5'))
        self.assertEqual((row['fuel_display_raw'], row['n2_flow_cm3_min']), ('-2', '-2'))
        self.assertEqual((row['rad_display_raw'], row['radiometer_gain']), ('1.29', '50'))
        self.assertNotIn('flow_velocity_cm_s', row)          # the velocity at the flame is not a column

    def test_unreadable_value_stays_blank_with_its_confidence(self):
        row = telemetry.telemetry_rows([frame_row(0, fuel='-?')], None)[0]
        self.assertEqual((row['fuel_display_raw'], row['n2_flow_cm3_min']), ('-?', ''))
        self.assertEqual((row['ocr_confidence'], row['unreadable_fields']), ('unreadable', 'fuel'))

    def test_experiment_time_only_from_a_valid_timebase(self):
        self.assertEqual(telemetry.experiment_time(None, 1.0), ('', ''))
        base = {'fit': {'status': 'ok', 'intercept_s': 36576.0, 'slope': 1.0, 'videoTimeOrigin_s': 0.0}}
        self.assertEqual(telemetry.experiment_time(base, 11.5), ('36587.500', '10:09:47.50'))
        self.assertEqual(telemetry.experiment_time({'fit': {'status': 'insufficient'}}, 1.0), ('', ''))

    def test_manual_question_mark_agrees_only_with_a_refused_character(self):
        rows = [frame_row(0, rad='1.2?'), frame_row(1, rad='1.23')]
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'manual.csv'
            with path.open('w', newline='', encoding='utf-8') as stream:
                writer = csv.writer(stream)
                writer.writerow(['frame', 'source', 'fuel', 'air', 'fan', 'rad', 'date', 'time', 'note'])
                for index in (0, 1):
                    writer.writerow([index, 'ts', '-2', '5', '62', '1.2?', '02/20/14', '10:10:06', ''])
            result = telemetry.compare_with_manual(rows, path)
        self.assertEqual(result['agreements'], 11)
        self.assertEqual(result['mismatches'], [{'frame': '1', 'field': 'rad', 'manual': '1.2?', 'ocr': '1.23'}])


class FanCalibration(unittest.TestCase):
    CAL = {'points': [(38, 0, 'Q32'), (47, 2.5, 'Q31'), (55, 5, 'Q30'), (72, 9, 'Q29')]}

    def test_interpolation_inside_the_calibrated_range_with_section_factor(self):
        self.assertAlmostEqual(telemetry.fan_to_velocity(55, self.CAL), 5 * 1.0066)
        self.assertAlmostEqual(telemetry.fan_to_velocity(62, self.CAL), (5 + 7 * 4 / 17) * 1.0066)

    def test_no_value_outside_the_range_or_near_the_fan_stop(self):
        for fan in (38, 41.9, 73, None):
            self.assertIsNone(telemetry.fan_to_velocity(fan, self.CAL), fan)
        self.assertIsNone(telemetry.fan_to_velocity(62, None))

    def test_calibration_is_never_borrowed_from_another_day_or_restrictor(self):
        derived = {'fanCalibration': {'days': [{'gmtDay': 49, 'year': 2014, 'gmtLabel': '2014-49', 'columns': 'K:M', 'blocks': [
            {'restrictors': 2, 'points': [{'fanDisplay': 55, 'airDisplayCmS': 7.5, 'airCell': 'M29'}]}]}]}}
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'derived.json'
            path.write_text(json.dumps(derived), encoding='utf-8')
            self.assertIsNone(telemetry.fan_calibration(path, day=50, restrictors=2))
            self.assertIsNone(telemetry.fan_calibration(path, day=49, restrictors=1))
            self.assertEqual(telemetry.fan_calibration(path, day=49, restrictors=2)['points'], [(55, 7.5, 'M29')])


class Timebase(unittest.TestCase):
    @staticmethod
    def synthetic(offset=36576.3, rate=1.0, refresh=0.2, fps=30000 / 1001, seconds=40, phase=0.05):
        """Clock shown on an overlay that refreshes every `refresh` s, sampled at `fps`."""
        t = np.arange(int(seconds * fps)) / fps
        refreshes = np.floor((t - phase) / refresh) * refresh + phase   # instant of the last refresh
        clock = np.floor(offset + rate * np.maximum(refreshes, 0)).astype(int).tolist()
        return t, clock

    def test_ticks_are_first_frames_of_each_new_second(self):
        t, clock = self.synthetic(seconds=5)
        ticks = timebase.clock_ticks(t, clock)
        self.assertEqual([tick['clockS'] - ticks[0]['clockS'] for tick in ticks], list(range(len(ticks))))
        self.assertTrue(all(tick['step'] == 1 for tick in ticks))

    def test_fit_recovers_offset_and_drift_within_the_refresh_quantisation(self):
        for rate in (1.0, 0.96):
            t, clock = self.synthetic(rate=rate)
            fit = timebase.fit_ticks(timebase.clock_ticks(t, clock), 0.0)
            self.assertAlmostEqual(fit['slope'], rate, delta=0.002)
            self.assertLess(fit['residualMaxAbs_s'], 0.21)
            # Ticks appear after the true second boundary (up to one refresh plus one frame), so the line
            # through them predicts a clock that is EARLY: intercept = true offset - mean lag.
            self.assertLessEqual(fit['intercept_s'], 36576.3 + 0.01)
            self.assertGreaterEqual(fit['intercept_s'], 36576.3 - 0.2 - 1001 / 30000 - 0.01)

    def test_discontinuity_is_excluded_and_unreadable_frames_skipped(self):
        t, clock = self.synthetic(seconds=12)
        clock = [value + (5 if index > 200 else 0) for index, value in enumerate(clock)]
        clock[50] = None
        ticks = timebase.clock_ticks(t, clock)
        self.assertEqual(sum(tick['step'] != 1 for tick in ticks), 1)
        fit = timebase.fit_ticks(ticks, 0.0)
        self.assertEqual(fit['ticksUsed'], sum(tick['step'] == 1 for tick in ticks))

    def test_too_few_ticks_is_insufficient(self):
        t, clock = self.synthetic(seconds=3)
        self.assertEqual(timebase.fit_ticks(timebase.clock_ticks(t, clock), 0.0)['status'], 'insufficient')

    def test_interpolation_between_ticks_preserves_the_displayed_seconds(self):
        t, clock = self.synthetic(seconds=10)
        ticks = timebase.clock_ticks(t, clock)
        interp = np.interp(t, [tick['videoS'] for tick in ticks], [tick['clockS'] for tick in ticks])
        inside = (t >= ticks[0]['videoS']) & (t <= ticks[-1]['videoS'])
        self.assertTrue(np.all(np.floor(interp[inside] + 1e-9) == np.array(clock)[inside]))

    def test_constant_offset_with_leading_padding(self):
        rng = np.random.default_rng(1)
        ts = rng.uniform(0, 255, (80, 8, 12)).astype(np.float32)
        mp4 = np.concatenate([np.repeat(ts[:1], 7, axis=0), ts]) + rng.normal(0, 0.5, (87, 8, 12)).astype(np.float32)
        result = timebase.best_offset(mp4, ts, max_offset=20)
        self.assertEqual((result['offsetFrames'], result['leadingMp4Frames'], result['mp4FramesAfterTsEnd']), (7, 7, 0))

    def test_transport_stream_pts_are_read(self):
        def packet(pid, payload, start=True):
            head = bytes([0x47, (0x40 if start else 0) | (pid >> 8), pid & 0xFF, 0x10])
            return (head + payload).ljust(188, b'\xff')

        def pts_bytes(value, prefix=0x2):
            return bytes([(prefix << 4) | (((value >> 30) & 7) << 1) | 1, (value >> 22) & 0xFF,
                          (((value >> 15) & 0x7F) << 1) | 1, (value >> 7) & 0xFF, ((value & 0x7F) << 1) | 1])

        pat = bytes([0, 0x00, 0xB0, 13, 0, 1, 0xC1, 0, 0, 0, 1, 0xE5, 0x00]) + bytes(4)          # program 1 -> PMT 1280
        pmt = bytes([0, 0x02, 0xB0, 23, 0, 1, 0xC1, 0, 0, 0xE0, 42, 0xF0, 0,
                     0x1B, 0xE0, 42, 0xF0, 0, 0x0F, 0xE0, 45, 0xF0, 0]) + bytes(4)                 # H.264 on 42, AAC on 45
        pes = lambda sid, value: b'\x00\x00\x01' + bytes([sid, 0, 0, 0x80, 0x80, 5]) + pts_bytes(value)
        stream = b''.join([packet(0, pat), packet(1280, pmt), packet(45, pes(0xC0, 1000)),
                           packet(42, pes(0xE0, 9000)), packet(42, pes(0xE0, 6000)), packet(42, b'\x00' * 20, start=False)])
        result = timebase.ts_video_pts(stream)
        self.assertEqual((result['videoPid'], result['audioPid']), (42, 45))
        self.assertEqual((result['pts'], result['audioPts']), ([6000, 9000], [1000]))
        with self.assertRaises(ValueError):
            timebase.ts_video_pts(stream[:-1])


class RealB1Products(unittest.TestCase):
    """Versioned products of the B1 run, plus the cached per-frame reading when available."""

    def test_timebase_fit_and_mp4_mapping(self):
        if not timebase.OUTPUT.exists():
            self.skipTest('timebase.json ainda não gerado')
        product = json.loads(timebase.OUTPUT.read_text(encoding='utf-8'))
        fit = product['fit']
        self.assertEqual(fit['status'], 'ok')
        self.assertAlmostEqual(fit['slope'], 1.0, delta=3 * fit['slopeStdErr'] + 0.002)
        self.assertLess(fit['residualMaxAbs_s'], 0.21)
        self.assertEqual(product['clock']['ts']['dateDisplayed'], {'02/20/14': 1313})
        self.assertEqual(product['mp4ToTs']['offsetFrames'], 30)
        self.assertEqual(product['sources']['ts']['undecodedPes'], [0, 1, 2, 3])

    def test_telemetry_table_matches_the_observed_regimes(self):
        if not telemetry.TELEMETRY.exists():
            self.skipTest('telemetry.csv ainda não gerado')
        with telemetry.TELEMETRY.open(encoding='utf-8') as stream:
            rows = list(csv.DictReader(stream))
        fan = [row['fan_display_raw'] for row in rows]
        self.assertTrue(set(fan[:200]) <= {'61', '62'})
        self.assertEqual(fan[-1], '38')
        self.assertEqual({row['date_display_raw'] for row in rows}, {'02/20/14'})
        self.assertEqual(sum(row['ocr_confidence'] == 'unreadable' for row in rows), 3)
        self.assertTrue(all(row['timestamp_experiment_s'] for row in rows))

    def test_ocr_agrees_with_manual_annotations(self):
        cached = Path(str(telemetry.FRAMES_CSV).format(source='ts'))
        if not cached.exists():
            self.skipTest('leitura por quadro (cache) ausente')
        result = telemetry.compare_with_manual(telemetry.read_frames_csv('ts'))
        self.assertEqual(result['annotatedFrames'], 28)
        self.assertEqual(result['mismatches'], [])

    def test_regimes_keep_air_lag_and_fan_calibration_apart(self):
        if not telemetry.REGIMES.exists():
            self.skipTest('regimes.json ainda não gerado')
        regimes = json.loads(telemetry.REGIMES.read_text(encoding='utf-8'))['regimes']
        established, ramp, stopped = regimes[2], regimes[3], regimes[4]
        self.assertEqual(established['fan']['values'], ['61', '62'])
        self.assertEqual(established['velocityFromAirTransducer_cm_s'], round(5 * 1.0066, 2))
        self.assertIsNotNone(established['velocityFromFanCalibration_cm_s'])
        self.assertIsNone(ramp['velocityFromFanCalibration_cm_s'])
        self.assertIsNone(stopped['velocityFromAirTransducer_cm_s'])     # AIR still shows 5 by lag
        self.assertIn('5', stopped['air']['values'])


if __name__ == '__main__':
    unittest.main()
