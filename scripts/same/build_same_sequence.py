"""Measured window sequence of the SAME tests for the replay "SAME — Smoke Generation and Detection Evidence".

    python scripts/same/build_same_sequence.py          # writes public/data/same/same-sequence.json
    python scripts/same/build_same_sequence.py --check  # rebuilds in memory and compares with the file

Input: data/same/derived/same-tests.json (P1 reduction of the PSI-102 housekeeping files, 1 Hz). Only the
15 tests reduced with solenoid state windows have a recorded sequence. For each one this keeps, in their
recorded order, the record span, the sample-heating period, every sampling window (solenoid open) with its
plateau span and the plateau medians per instrument, exactly as reduced in P1.

Times are re-expressed as seconds from the first sample of the record. Each conversion of a GMT time string
is checked against the epoch already stored next to it; any mismatch stops the build. Nothing is
interpolated, resampled, smoothed or calibrated: values are window summaries in instrument units.
"""
from __future__ import annotations

import argparse
import calendar
import hashlib
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'data/same/derived/same-tests.json'
OUTPUT = ROOT / 'public/data/same/same-sequence.json'
CHANNELS = [
    ('ptrak', 'P-Trak, condensation nuclei count'),
    ('dusttrakA', 'DustTrak A, 1 µm impactor'),
    ('dusttrakB', 'DustTrak B, 10 µm impactor'),
    ('ionA', 'Ionization chamber A'),
    ('ionB', 'Ionization chamber B'),
    ('issScatter', 'ISS detector, scattering'),
    ('issObscuration', 'ISS detector, obscuration'),
    ('sts', 'STS (Shuttle) detector, ionization'),
]
ROLE_LABEL = {'primary': 'primary smoke window', 'secondary': 'secondary smoke window', 'additional': 'additional smoke window',
              'no-smoke': 'window without smoke'}
RATIO_NOTE = {'diluição dos dois DustTraks em estados diferentes nesta janela': 'the two DustTraks had different dilution states in this window'}


def text(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n')


def epoch(gmt: str) -> float:
    """'2007/254/17:12:47' (year / day of year / UTC time) -> POSIX seconds."""
    year, day, clock = gmt.split('/')
    moment = datetime(int(year), 1, 1, tzinfo=timezone.utc) + timedelta(days=int(day) - 1)
    hh, mm, ss = (int(part) for part in clock.split(':'))
    return float(calendar.timegm((moment + timedelta(hours=hh, minutes=mm, seconds=ss)).timetuple()))


def checked(gmt: str, stored: float | None) -> float:
    value = epoch(gmt)
    if stored is not None and value != stored:
        raise ValueError(f'GMT {gmt} converts to {value}, but the reduction stores {stored}')
    return value


def channel(stats: dict | None) -> dict | None:
    if stats is None:
        return None
    keep = ('median', 'min', 'max', 'n', 'deltaFromBaseline', 'clippedAtRail', 'powered')
    return {key: stats[key] for key in keep if key in stats}


def build() -> dict:
    source = json.loads(text(SOURCE))
    units = source['units']['channels']
    method = source['method']
    tests = []
    for test in source['tests']:
        hk = test.get('housekeeping')
        if not hk or hk.get('method') != 'state':
            continue
        t0 = epoch(hk['start'])
        rel = lambda gmt, stored=None: round(checked(gmt, stored) - t0, 1)  # noqa: E731
        cond = hk['conditions']
        windows = []
        for index, w in enumerate(hk['windows']):
            plateau = None
            if w['plateauSamples']:
                plateau = {'start_s': rel(w['plateauStart'], w['plateauStartEpoch_s']), 'end_s': rel(w['plateauEnd']),
                           'samples': w['plateauSamples']}
            windows.append({
                'index': index + 1, 'role': w['role'], 'roleLabel': ROLE_LABEL[w['role']], 'smoke': w['smoke'],
                'start_s': rel(w['start'], w['startEpoch_s']), 'end_s': rel(w['end'], w['endEpoch_s']), 'samples': w['samples'],
                'plateau': plateau,
                'channels': {key: channel(w['channels'].get(key)) for key, _ in CHANNELS},
                'flags': w.get('flags') or {},
                'dusttrakRatioBoverA': w.get('dusttrakRatioBoverA'),
                'dusttrakRatioNote': RATIO_NOTE.get(w.get('dusttrakRatioNote'), w.get('dusttrakRatioNote')),
                'ageAtPlateauStart_s': w.get('ageAtPlateauStart_s'),
            })
        heating = None
        if cond.get('heatingStart'):
            first, last = rel(cond['heatingStart']), rel(cond['heatingEnd'], cond['heatingEndEpoch_s'])
            # The reduction keeps only the first and last HeatingInProgress = 1 samples and their count. The span is
            # drawn as continuous only when the count equals one sample per second over it; otherwise the heating
            # samples in between are not located in this file (e.g. test 23: 106 samples over 4516 s).
            heating = {'start_s': first, 'end_s': last, 'samples': cond['heatingSamples_s'],
                       'continuousAt1Hz': cond['heatingSamples_s'] == int(last - first) + 1,
                       'definition': 'first and last sample with HeatingInProgress = 1',
                       'RtOverR0': cond.get('RtOverR0'),
                       'lfeFlowMedian_sccm': (cond.get('lfeFlowDuringHeating_sccm') or {}).get('median')}
        tests.append({
            'test': test['test'], 'sampleId': test['sampleId'], 'material': test['material'], 'heating': test['heating'],
            'gmtDay': test['gmtDay'], 'recordStart': hk['start'], 'recordEnd': hk['end'],
            'duration_s': rel(hk['end']), 'rows': hk['rows'],
            'sampleHeating': heating,
            'baseline': {'samples': hk['baselineSamples'], 'values': hk['baseline'],
                         'definition': f"median of the {hk['baselineSamples']} samples before the first window"},
            'windows': windows,
            'sourceFile': hk['file'], 'sourceSha256': hk['sha256'],
        })
    return {
        'schemaVersion': 1,
        'title': 'SAME — Smoke Generation and Detection Evidence',
        'kind': 'measurement-sequence',
        'investigationId': source['investigationId'],
        'statement': ('Recorded sequence of the SAME flight tests: sample heating, solenoid sampling windows and the plateau '
                      'median of each instrument, in measured order. Not a smoke or particle simulation.'),
        'timeReference': 'seconds from the first sample of each housekeeping record (1 Hz); GMT strings kept',
        'channels': [{'key': key, 'label': label, 'unit': units[key]['unit'], 'column': units[key]['column']} for key, label in CHANNELS],
        'definitions': {
            'window': 'contiguous samples with the P-Trak sampling solenoid open (PTrakSolenoid[VR06] = 1)',
            'plateau': (f"samples of the window with DustTrak B >= {method['plateauFraction']:.0%} of its peak; first to last such "
                        'sample, which need not be contiguous'),
            'noSmoke': f"window whose DustTrak B peak is below {method['noSmokeThreshold_mg_m3']} mg/m3",
            'delta': 'plateau median minus baseline, for the ionization and detector voltages only',
        },
        'notes': [
            'Values are plateau medians over many samples, not instantaneous readings; they are revealed when the plateau ends.',
            'Detector signals are uncalibrated flight volts and are not equivalent quantities across detectors.',
            ('Dynamic dilution acts during the diagnostics: the raw P-Trak count is not proportional to smoke concentration and '
             'is not comparable between windows or tests without the dilution ratio, absent from the PSI-102 files.'),
            'No spatial concentration, particle transport or smoke cloud is reconstructed.',
        ],
        'tests': tests,
        'provenance': {'generator': 'scripts/same/build_same_sequence.py',
                       'inputs': {'tests': {'path': SOURCE.relative_to(ROOT).as_posix(),
                                            'sha256LfNormalised': hashlib.sha256(text(SOURCE).encode('utf-8')).hexdigest()}}},
    }


def render(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    rendered = render(build())
    if args.check:
        same = OUTPUT.exists() and text(OUTPUT) == rendered
        print('reproducible' if same else 'DIFFERENT')
        return 0 if same else 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(rendered.encode('utf-8'))
    print(f'{OUTPUT.relative_to(ROOT).as_posix()}: {len(rendered.encode("utf-8"))} bytes, {len(build()["tests"])} tests')
    return 0


if __name__ == '__main__':
    sys.exit(main())
