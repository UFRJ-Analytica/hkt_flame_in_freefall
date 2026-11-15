"""Read the overlay telemetry of BASS-II test B1 frame by frame and summarise it per displayed state.

Sources (both cached, git-ignored):
  - the original transport stream from "…TEST_B1 original videos.zip" (primary: real PTS per frame);
  - the PSI re-encoded MP4 (secondary, for comparison).

Outputs:
  data/cache/bass2/b1/overlay/frames-<source>.csv   one row per decoded frame (every field, score, margin)
  data/bass2/b1/telemetry.csv                       one row per displayed overlay state of the TS
  data/cache/bass2/b1/overlay/*.png                 regions of interest and crop sheets for review

Each telemetry row keeps the characters exactly as displayed (``*_display_raw``) next to the only
conversions that the NASA documents support:
  FAN  -> fan_voltage_v = FAN / 10        (ReadMe: "fan voltage x10"; Summary Report p. 13)
  AIR  -> air_transducer_cm_s = AIR       (ReadMe and p. 12-13: transducer reading in cm/s, ~1 min response)
  FUEL -> n2_flow_cm3_min = FUEL          (p. 13: N2 flow rate, cm3/min)
RAD stays dimensionless (uncalibrated, p. 13). The flow velocity reaching the flame is NOT derived here:
AIR lags by ~1 min and FAN needs the day's fan calibration (see build_b1_timebase.py for the regimes).
The experimental time column is filled from data/bass2/b1/timebase.json when it exists.

    python scripts/bass2/extract_b1_telemetry.py            # TS and MP4
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import overlay_bass2 as overlay  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'data/cache/bass2/b1'
SOURCES = {
    'ts': CACHE / 'original/BASS_GMT50_SAMPLE_147_TEST_B1.ts',
    'mp4': ROOT / 'data/cache/bass2/videos/PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1.mp4',
}
FRAMES_CSV = CACHE / 'overlay/frames-{source}.csv'
TELEMETRY = ROOT / 'data/bass2/b1/telemetry.csv'
TIMEBASE = ROOT / 'data/bass2/b1/timebase.json'
RECORD = 'PSI-25:t0:r2'
RADIOMETER_GAIN = '50'   # CSV / Test.Matrices (Bhattacharjee tab, I2) and Appendix A (PDF p. 111)
FIELDS = ('fuel', 'air', 'fan', 'rad', 'date', 'time')
FRAME_COLUMNS = ['frame', 'pts_ms'] + [f'{name}_{suffix}' for name in FIELDS for suffix in ('raw', 'confidence', 'score', 'margin')]
TELEMETRY_COLUMNS = [
    'record_id', 'state', 'source', 'source_frame', 'last_frame', 'frames',
    'timestamp_video_s', 'timestamp_video_end_s',
    'date_display_raw', 'clock_display_raw', 'timestamp_experiment_s', 'timestamp_experiment_clock',
    'fuel_display_raw', 'n2_flow_cm3_min', 'air_display_raw', 'air_transducer_cm_s',
    'fan_display_raw', 'fan_voltage_v', 'rad_display_raw', 'radiometer_gain',
    'ocr_confidence', 'ocr_min_score', 'ocr_min_margin', 'unreadable_fields',
]


def read_source(source: str, glyphs: dict) -> list[dict]:
    frames, times = overlay.read_gray_frames(SOURCES[source])
    rows = []
    for index, gray in enumerate(frames):
        fields = overlay.read_overlay(gray, glyphs)
        row = {'frame': index, 'pts_ms': round(float(times[index]), 3)}
        for name in FIELDS:
            field = fields[name]
            row.update({f'{name}_raw': field.raw, f'{name}_confidence': field.confidence,
                        f'{name}_score': field.min_score, f'{name}_margin': field.min_margin})
        rows.append(row)
    return rows


def write_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=columns, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def read_frames_csv(source: str) -> list[dict]:
    with FRAMES_CSV.with_name(FRAMES_CSV.name.format(source=source)).open(encoding='utf-8') as stream:
        return list(csv.DictReader(stream))


def number_or_blank(raw: str, factor: float = 1.0) -> str:
    value = overlay.parse_number(raw)
    return '' if value is None else f'{value * factor:g}'


def states(rows: list[dict]) -> list[list[dict]]:
    """Runs of consecutive frames that show exactly the same overlay text."""
    runs: list[list[dict]] = []
    for row in rows:
        key = tuple(row[f'{name}_raw'] for name in FIELDS)
        if runs and tuple(runs[-1][0][f'{name}_raw'] for name in FIELDS) == key:
            runs[-1].append(row)
        else:
            runs.append([row])
    return runs


def experiment_time(timebase: dict | None, pts_s: float) -> tuple[str, str]:
    """Overlay-clock time (s of day) predicted by the timebase fit, and its hh:mm:ss.ss form."""
    if not timebase or timebase.get('fit', {}).get('status') != 'ok':
        return '', ''
    fit = timebase['fit']
    seconds = fit['intercept_s'] + fit['slope'] * (pts_s - fit['videoTimeOrigin_s'])
    hours, rest = divmod(seconds, 3600)
    minutes, secs = divmod(rest, 60)
    return f'{seconds:.3f}', f'{int(hours):02d}:{int(minutes):02d}:{secs:05.2f}'


def telemetry_rows(rows: list[dict], timebase: dict | None) -> list[dict]:
    output = []
    for number, run in enumerate(states(rows), start=1):
        first, last = run[0], run[-1]
        start_s = float(first['pts_ms']) / 1000
        experiment_s, experiment_clock = experiment_time(timebase, start_s)
        unreadable = [name for name in FIELDS if first[f'{name}_confidence'] == 'unreadable']
        confidences = {first[f'{name}_confidence'] for name in FIELDS}
        output.append({
            'record_id': RECORD, 'state': number, 'source': 'ocr-template:ts',
            'source_frame': first['frame'], 'last_frame': last['frame'], 'frames': len(run),
            'timestamp_video_s': f'{start_s:.3f}', 'timestamp_video_end_s': f"{float(last['pts_ms']) / 1000:.3f}",
            'date_display_raw': first['date_raw'], 'clock_display_raw': first['time_raw'],
            'timestamp_experiment_s': experiment_s, 'timestamp_experiment_clock': experiment_clock,
            'fuel_display_raw': first['fuel_raw'], 'n2_flow_cm3_min': number_or_blank(first['fuel_raw']),
            'air_display_raw': first['air_raw'], 'air_transducer_cm_s': number_or_blank(first['air_raw']),
            'fan_display_raw': first['fan_raw'], 'fan_voltage_v': number_or_blank(first['fan_raw'], 0.1),
            'rad_display_raw': first['rad_raw'], 'radiometer_gain': RADIOMETER_GAIN,
            'ocr_confidence': 'unreadable' if unreadable else 'low' if 'low' in confidences else 'high',
            'ocr_min_score': min(float(first[f'{name}_score']) for name in FIELDS),
            'ocr_min_margin': min(float(first[f'{name}_margin']) for name in FIELDS),
            'unreadable_fields': ' '.join(unreadable),
        })
    return output


MANUAL = ROOT / 'data/bass2/b1/overlay-manual-annotations.csv'
EVENTS = ROOT / 'data/bass2/b1/event-annotations.csv'
REGIMES = ROOT / 'data/bass2/b1/regimes.json'
DERIVED = ROOT / 'data/bass2/documents-derived.json'
# B1 ran on GMT 50 of 2014 with 2 flow restrictors (CSV / Test.Matrices, Bhattacharjee tab, row 2).
TEST_DAY, RESTRICTORS = 50, 2
# Below this fan display the calibration is not usable: the fan stops above 3.8 V (sheet note D1).
FAN_MIN_USABLE = 42.0
SECTION_FACTOR = 1.0066   # U = 1.0066 * AIR in the test section (Fan calibration data.xlsx, A33 and E7)


def fan_calibration(derived_path: Path = DERIVED, day: int = TEST_DAY, restrictors: int = RESTRICTORS) -> dict | None:
    """Calibration points (fan display -> air display) of the same day and number of restrictors, if any."""
    if not derived_path.exists():
        return None
    derived = json.loads(derived_path.read_text(encoding='utf-8'))
    for entry in derived.get('fanCalibration', {}).get('days', []):
        if entry['gmtDay'] != day or entry['year'] != 2014:
            continue
        for block in entry['blocks']:
            points = [(p['fanDisplay'], p['airDisplayCmS'], p['airCell']) for p in block['points'] if p['airDisplayCmS'] is not None]
            if block['restrictors'] == restrictors and points:
                return {'gmtLabel': entry['gmtLabel'], 'columns': entry['columns'], 'restrictors': restrictors,
                        'points': sorted(points), 'blockOrder': 'inferida (ver BASS2_DOCUMENTATION_REVIEW.md §4.3)'}
    return None


def fan_to_velocity(fan: float, calibration: dict | None) -> float | None:
    """Section velocity from the same-day calibration by linear interpolation; None outside the usable range."""
    if calibration is None or fan is None:
        return None
    xs = [point[0] for point in calibration['points']]
    ys = [point[1] for point in calibration['points']]
    if fan < max(FAN_MIN_USABLE, min(xs)) or fan > max(xs):
        return None
    return float(np.interp(fan, xs, ys)) * SECTION_FACTOR


def read_events(path: Path = EVENTS) -> dict[str, dict]:
    with path.open(encoding='utf-8') as stream:
        return {row['event']: {**row, 'frame_first': int(row['frame_first']), 'frame_last': int(row['frame_last'])}
                for row in csv.DictReader(stream)}


def summarise(rows: list[dict], field: str) -> dict:
    values = [row[f'{field}_raw'] for row in rows]
    numbers = [overlay.parse_number(value) for value in values]
    readable = [value for value in numbers if value is not None]
    return {'values': sorted(set(values), key=lambda raw: (overlay.parse_number(raw) is None, overlay.parse_number(raw) or 0)),
            'min': min(readable) if readable else None, 'max': max(readable) if readable else None,
            'first': values[0], 'last': values[-1], 'unreadableFrames': len(values) - len(readable)}


def build_regimes(rows: list[dict], timebase: dict | None, events: dict[str, dict], calibration: dict | None) -> dict:
    """Operating intervals of B1 from overlay telemetry plus the visually annotated events.

    Boundaries: light first visible, flame clearly established, start of the fan ramp-down,
    fan at its minimum display. FAN changes are instantaneous on the display; the air velocity
    follows with an unknown transport delay, and AIR lags by ~1 min (Summary Report p. 12-13, 21).
    """
    def clock(frame: int) -> dict:
        pts_s = float(rows[frame]['pts_ms']) / 1000
        seconds, text = experiment_time(timebase, pts_s)
        return {'frame': frame, 'timestamp_video_s': round(pts_s, 3), 'clock_display_raw': rows[frame]['time_raw'],
                'timestamp_experiment_s': float(seconds) if seconds else None, 'timestamp_experiment_clock': text}

    last = len(rows) - 1
    bounds = [
        ('antes da ignição', 0, events['light_first_visible']['frame_last'] - 1),
        ('ignição: ignitor e chama sobrepostos', events['light_first_visible']['frame_last'], events['flame_two_sheets_visible']['frame_last'] - 1),
        ('chama estabelecida, FAN constante', events['flame_two_sheets_visible']['frame_last'], events['fan_drop_start']['frame_first'] - 1),
        ('redução de FAN (corte do ventilador)', events['fan_drop_start']['frame_first'], events['fan_reaches_38']['frame_first'] - 1),
        ('FAN no mínimo (38)', events['fan_reaches_38']['frame_first'], last),
    ]
    cut = events['fan_drop_start']['frame_first']
    regimes = []
    for name, first, final in bounds:
        segment = rows[first:final + 1]
        fan, air = summarise(segment, 'fan'), summarise(segment, 'air')
        steady = fan['min'] is not None and fan['max'] - fan['min'] <= 1
        velocities = [fan_to_velocity(value, calibration) for value in (fan['min'], fan['max'])] if steady else [None, None]
        # AIR is only meaningful as a velocity while FAN has not changed recently; after the cut it lags.
        before_cut = final < cut
        typical_air = overlay.parse_number(max(set(row['air_raw'] for row in segment), key=[row['air_raw'] for row in segment].count))
        regimes.append({
            'regime': name, 'start': clock(first), 'end': clock(final), 'frames': len(segment),
            'fan': fan, 'air': air, 'fuel': summarise(segment, 'fuel'), 'rad': summarise(segment, 'rad'),
            'fanVoltageRange_v': [fan['min'] / 10, fan['max'] / 10] if fan['min'] is not None else None,
            'velocityFromFanCalibration_cm_s': ([round(v, 2) for v in velocities] if all(v is not None for v in velocities) else None),
            'velocityFromFanCalibrationNote': (None if all(v is not None for v in velocities) else
                                               'FAN variando no intervalo' if not steady else
                                               f'FAN abaixo de {FAN_MIN_USABLE:g} ou fora da faixa calibrada'),
            'airTransducerModal_cm_s': typical_air if before_cut else None,
            'velocityFromAirTransducer_cm_s': round(typical_air * SECTION_FACTOR, 2) if before_cut and steady and typical_air is not None else None,
            'airTransducerState': ('FAN constante desde antes do início do vídeo; leitura estável, mas o tempo de '
                                   'acomodação de ~1 min não pode ser verificado' if before_cut else
                                   'não acomodado: FAN mudou há menos de 1 min (resposta lenta do transdutor)'),
        })
    timed_events = {name: {**{key: value for key, value in event.items() if key not in ('frame_first', 'frame_last')},
                           'first': clock(event['frame_first']), 'last': clock(event['frame_last'])}
                    for name, event in events.items()}
    return {
        'schemaVersion': 1, 'recordId': RECORD, 'test': 'B1',
        'conditionsFromCatalogue': {'flowRestrictor': RESTRICTORS, 'fanDisplayCsv': '62', 'airDisplayCsv': '5',
                                    'radiometerGain': RADIOMETER_GAIN, 'oxygenPctInitialCsv': 22.2,
                                    'oxygenNote': 'O₂ de GMT 50 incerto: Apêndice A sugere ~20,6 % (ver revisão documental §7.3)'},
        'fanCalibration': calibration and {**calibration, 'sectionFactor': SECTION_FACTOR, 'minimumUsableFanDisplay': FAN_MIN_USABLE},
        'velocityCaveats': [
            'AIR é a leitura do transdutor, com resposta de ~1 min: não acompanha mudanças rápidas de FAN.',
            'A velocidade pela calibração usa a calibração do fim do dia GMT 50 (rotulada "post soot cleaning"); '
            'durante o teste o transdutor mostrou 5 cm/s com FAN 61-62, abaixo do previsto pela calibração.',
            'Durante a rampa de FAN a velocidade real na chama é desconhecida (atraso de transporte não documentado).',
        ],
        'events': timed_events, 'regimes': regimes,
    }


def compare_with_manual(rows: list[dict], manual_path: Path = MANUAL) -> dict:
    """Agreement of the template reading with independent visual annotations of the same frames.

    A manual '?' means the character is not legible to a person either; the reader agrees only if it
    also refused that character (it never counts as a correct guess)."""
    with manual_path.open(encoding='utf-8') as stream:
        manual = [row for row in csv.DictReader(stream) if row['source'] == 'ts']
    by_frame = {int(row['frame']): row for row in rows}
    checks, mismatches = 0, []
    for note in manual:
        frame = by_frame.get(int(note['frame']))
        if frame is None:
            mismatches.append({'frame': note['frame'], 'issue': 'quadro inexistente'})
            continue
        for name in FIELDS:
            checks += 1
            if frame[f'{name}_raw'] != note[name]:
                mismatches.append({'frame': note['frame'], 'field': name, 'manual': note[name], 'ocr': frame[f'{name}_raw']})
    return {'annotatedFrames': len(manual), 'fieldChecks': checks, 'agreements': checks - len(mismatches),
            'mismatches': mismatches}


def diagnostics(glyphs: dict, frame_index: int = 900) -> list[str]:
    """Regions of interest drawn on one TS frame, and an enlarged strip of every field."""
    import cv2

    capture = cv2.VideoCapture(str(SOURCES['ts']))
    capture.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    ok, frame = capture.read()
    capture.release()
    if not ok:
        return []
    layout = glyphs['layout']
    colours = {'fuel': (0, 200, 255), 'air': (0, 255, 0), 'fan': (255, 160, 0), 'rad': (255, 0, 255),
               'date': (200, 200, 200), 'time': (0, 0, 255)}
    boxed = frame.copy()
    strips = []
    for name, spec in layout['fields'].items():
        boxes = [overlay.cell_box(layout, spec['row'], cell) for cell in spec['cells']]
        x0, y0 = boxes[0][0], boxes[0][1]
        x1, y1 = boxes[-1][0] + boxes[-1][2], boxes[-1][1] + boxes[-1][3]
        cv2.rectangle(boxed, (x0 - 2, y0 - 2), (min(719, x1 + 1), y1 + 1), colours[name], 1)
        cv2.putText(boxed, name.upper(), (x0, y1 + 12), cv2.FONT_HERSHEY_SIMPLEX, 0.35, colours[name], 1)
        strip = cv2.resize(frame[max(0, y0 - 3):y1 + 3, max(0, x0 - 3):min(720, x1 + 3)], None, fx=4, fy=4,
                           interpolation=cv2.INTER_NEAREST)
        label = np.zeros((18, strip.shape[1], 3), np.uint8)
        cv2.putText(label, f'{name} x={x0}-{x1} y={y0}-{y1}', (2, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        strips.append(np.vstack([label, strip]))
    out = CACHE / 'overlay'
    out.mkdir(parents=True, exist_ok=True)
    width = max(strip.shape[1] for strip in strips)
    sheet = np.vstack([cv2.copyMakeBorder(strip, 0, 4, 0, width - strip.shape[1], cv2.BORDER_CONSTANT) for strip in strips])
    paths = [out / f'roi-frame{frame_index}.png', out / f'roi-crops-frame{frame_index}.png']
    overlay.write_image(paths[0], cv2.resize(boxed, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST))
    overlay.write_image(paths[1], sheet)
    return [path.relative_to(ROOT).as_posix() for path in paths]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--sources', nargs='+', choices=sorted(SOURCES), default=['ts', 'mp4'])
    parser.add_argument('--reuse', action='store_true', help='usa os CSV por quadro já gerados em vez de reler o vídeo')
    args = parser.parse_args()
    glyphs = overlay.load_glyphs()
    per_source = {}
    for source in args.sources:
        path = FRAMES_CSV.with_name(FRAMES_CSV.name.format(source=source))
        if args.reuse and path.exists():
            per_source[source] = read_frames_csv(source)
        else:
            per_source[source] = read_source(source, glyphs)
            write_csv(path, FRAME_COLUMNS, per_source[source])
    timebase = json.loads(TIMEBASE.read_text(encoding='utf-8')) if TIMEBASE.exists() else None
    if 'ts' in per_source:
        rows = telemetry_rows(per_source['ts'], timebase)
        write_csv(TELEMETRY, TELEMETRY_COLUMNS, rows)
        images = diagnostics(glyphs)
        validation = compare_with_manual(per_source['ts']) if MANUAL.exists() else None
        if EVENTS.exists():
            regimes = build_regimes(per_source['ts'], timebase, read_events(), fan_calibration())
            REGIMES.write_text(json.dumps(regimes, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
        print(json.dumps({'states': len(rows), 'frames': len(per_source['ts']),
                          'unreadableStates': sum(row['ocr_confidence'] == 'unreadable' for row in rows),
                          'experimentTime': bool(timebase), 'manualValidation': validation,
                          'diagnostics': images}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
