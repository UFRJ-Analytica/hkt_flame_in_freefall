"""Harmonised SAME (PSI-102) test base: one record per flight test of Appendix A, with the housekeeping signals reduced
to sampling-window statistics in the instruments' own units.

    python scripts/same/normalize_same.py          # writes data/same/derived/same-tests.json
    python scripts/same/normalize_same.py --check  # verifies the committed JSON is reproduced from the cache

What is measured (direct, instrument units, 1 Hz, 8-bit A/D per the Final Science Report §5): P-Trak count (pt/cc, after
the instrument's dilution path), DustTrak A (1 um impactor) and B (10 um impactor) in mg/m3 on the factory scale, ion
chamber A/B voltage, ISS detector scatter/obscuration voltage, STS detector voltage, sample-wire resistance (ohm), plume
temperature, LFE flow (sccm), solenoid states. Nothing here is a calibrated moment: the NASA calibration coefficients
(P-Trak per size, ion chamber vs EAD, DustTrak vs TEOM per smoke source, dilution ratios, material densities) are not in
the PSI-102 files. No value is converted to M0, M1 or M3.

Sampling windows ("state" method): contiguous runs of PTrakSolenoid[VR06] = 1 within the rows whose TestNumber is the
test-matrix number of that test. Windows with DustTrak B < 0.05 mg/m3 throughout are "no-smoke" (purge, aborted fills);
the first smoke window is "primary" (smoke after primary aging only), the second "secondary" (after secondary aging).
Inside a window the "plateau" is the set of samples with DustTrak B >= 50 % of the window maximum; statistics are
medians over the plateau. These are this project's choices (inferences), documented as such; NASA's own averaging
intervals ("for average" sheets, when present) are reported next to them for comparison.

P-Trak: -999 is an instrument error code and is dropped (never averaged, never zero); counts above 1e5 pt/cc exceed the
range given in the report (0 to 1e5) and are flagged. Zeros in a channel are kept as measured zeros.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import inventory_same as inventory  # noqa: E402
import xls_reader  # noqa: E402

ROOT = inventory.ROOT
CACHE = ROOT / 'data/cache/same/Analyzed Data'
OUTPUT = inventory.DERIVED / 'same-tests.json'
PREFIX = 'PSI-102_Analyzed Data_'
CHANNELS = {
    'PTrakMeasurement(PtPerCC)': ('ptrak', 'pt/cc', 'P-Trak (contador de núcleos de condensação)'),
    'DustTrakAMeasurement(MgPerM3)': ('dusttrakA', 'mg/m3', 'DustTrak A, impactador 1 um'),
    'DustTrakBMeasurement(MgPerM3)': ('dusttrakB', 'mg/m3', 'DustTrak B, impactador 10 um'),
    'IonDetectorAMeasurement(Volts)': ('ionA', 'V', 'câmara de ionização A'),
    'IonDetectorBMeasurement(Volts)': ('ionB', 'V', 'câmara de ionização B'),
    'ISSDetectorScatterMeasurement(Volts)': ('issScatter', 'V', 'detector ISS, espalhamento'),
    'ISSDetectorObscurationMeasurement(Volts)': ('issObscuration', 'V', 'detector ISS, obscurecimento'),
    'STSDetectorMeasurement(Volts)': ('sts', 'V', 'detector STS (ônibus espacial), ionização'),
}
STATE_COLUMNS = ('TimeString', 'Time', 'TestNumber', 'ElapsedTestTime(Secs)', 'HeatingInProgress', 'SampleResistance(Ohms)',
                 'GasPlumeTemperature(DegC)', 'LFEFlowRate[AT08](SCCM)', 'PTrakSolenoid[VR06]',
                 'CommDiagADilutionSolenoid[PN24]', 'CommDiagBDilutionSolenoid[PN27]', 'DynamicDilutorSolenoid[PN15]',
                 'STSDetectorAlarm')
PTRAK_ERROR = -999.0
ISS_SCATTER_RAIL_V = -6.2  # lowest A/D reading observed is about -6.256 V: plateau minima at or below this are clipped
LONG_AGING_GAP_S = 300  # gaps observed: 14-140 s (secondary aging 60 s "medium" or shorter) vs 570-1653 s (720 s / 30 min)
PTRAK_RANGE_MAX = 1e5
NO_SMOKE_MG_M3 = 0.05
PLATEAU_FRACTION = 0.5
BASELINE_SAMPLES = 30
# Downloaded housekeeping files: Appendix A test -> (file, sheet holding the 98-column housekeeping, TestNumber value).
STATE_SOURCES = {
    2: ('GMT254run2btesthkp with zgy average.xls', 'Copy of GMT254run2btesthkp', 2),
    17: ('GMT264 Run 17 lampwick.xls', 'GMT264lampwick17hkp (2)', 17),
    23: ('GMT267silicon23hkp.xls', 'Copy (2) of GMT267silicon23hkp', 23),
    24: ('GMT267silicon24hkp.xls', 'GMT267silicon23hkp', 24),
    25: ('GMT268teflon25.xls', 'GMT268teflon25hkp', 25),
    26: ('GMT268teflon26.xls', 'GMT268teflon26hkp', 26),
    27: ('GMT269silicon27.xls', 'GMT269silicon27hkp', 27),
    28: ('GMT269teflon28hkp.xls', 'GMT269teflon28hkp', 28),
    29: ('GMT271kapton29.xls', 'GMT271kapton29hkp', 29),
    32: ('GMT272lampwick32.xls', 'GMT272lampwick32HKP', 32),
    33: ('GMT273kapton33.xls', 'GMT273kapton33hkp', 33),
    34: ('GMT273lampwick34.xls', 'GMT273lampwick34hkp', 34),
    35: ('GMT276silicone35.xls', 'GMT6silicone35hkp', 35),
    37: ('GMT276dbp37.xls', 'GMT276dbp37hkp', 37),
    46: ('GMT278Lampwick46.xls', 'GMT278Lampwick46hkp', 46),
}
# NASA analysts' averaging sheets (time range = their averaging interval), by Appendix A test.
NASA_AVERAGE_SHEETS = {
    2: [('GMT254run2btesthkp with zgy average.xls', 'For Average', 'primary')],
    11: [('GMT262 Run 11 DBP hkp.xls', 'for average', 'primary'), ('GMT262 Run 11 DBP hkp.xls', 'for aged average', 'secondary')],
    13: [('GMT262 RUN 13 teflon.xls', 'for average', 'primary')],
    14: [('GMT263 run 14 kapton avg.xls', 'for average', 'primary')],
    15: [('GMT263 Run 15 DBP.xls', 'for average', 'primary')],
    35: [('GMT276silicone35.xls', 'for Average', 'primary')],
    37: [('GMT276dbp37.xls', 'for average', 'primary')],
}
# Downloaded files that cannot be reduced to one test without guessing.
NOT_SEGMENTED_TESTS = {'GMT255hkp.xlsx': (4, 5), 'GMT256HKP.xls': (6, 7), 'TeflonGMT257hkp.xls': (10,), 'kaptonGMT257.xls': (8,),
                       'DBP  GMT257hkp.xls': (9,), 'GMT262 Run 12 dbp.xls': (12,), 'GMT263 Run 16 DBP.xls': (16,),
                       'GMT272kapton30.xls': (30,), 'GMT272lampwick31.xls': (31,)}
NOT_SEGMENTED = {
    'GMT255hkp.xlsx': 'TestNumber = 2 para todo o dia 255 (testes 4 DBP e 5 silicone no Apêndice A) e só traços de fumaça (DustTrak B <= 0,16 mg/m3): identificação ambígua.',
    'GMT256HKP.xls': 'Planilha de 13 colunas sem TestNumber nem estados de solenoide; cobre os testes 6 (Teflon) e 7 (lamp wick).',
    'TeflonGMT257hkp.xls': 'Planilha de 13 colunas sem TestNumber nem estados de solenoide (teste 10, Teflon, reaquecimento).',
    'kaptonGMT257.xls': 'Planilha de 13 colunas sem TestNumber nem estados de solenoide (teste 8, Kapton, abortado segundo o Apêndice A).',
    'DBP  GMT257hkp.xls': 'Planilha de 13 colunas sem TestNumber nem estados de solenoide (teste 9, DBP).',
    'GMT262 Run 12 dbp.xls': 'Planilha de 19 colunas sem estados de solenoide e sem aba de média da NASA.',
    'GMT263 Run 16 DBP.xls': 'Planilha de 19 colunas sem estados de solenoide e sem aba de média da NASA.',
    'GMT272kapton30.xls': 'Planilha de 19 colunas sem estados de solenoide e sem aba de média da NASA.',
    'GMT272lampwick31.xls': 'Planilha de 21 colunas sem estados de solenoide e sem aba de média da NASA.',
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_sheet(name: str, sheet: str) -> list[dict]:
    """Rows of one sheet as dicts keyed by the original header (the raw column names are preserved)."""
    cells = xls_reader.read_workbook(CACHE / (PREFIX + name))[sheet]
    table = xls_reader.to_rows(cells)
    header = table[0]
    return [{key: row[index] for index, key in enumerate(header) if key is not None and index < len(row)} for row in table[1:]]


def number(value) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def clean(channel: str, values: list) -> tuple[list[float], dict]:
    """Numeric samples of a channel; P-Trak error codes removed and counted, out-of-range counts flagged."""
    numeric = [number(v) for v in values]
    flags = {'nonNumeric': sum(v is None for v in numeric)}
    numeric = [v for v in numeric if v is not None]
    if channel == 'ptrak':
        flags['errorCode-999'] = sum(v == PTRAK_ERROR for v in numeric)
        numeric = [v for v in numeric if v != PTRAK_ERROR]
        flags['aboveNominalRange_1e5'] = sum(v > PTRAK_RANGE_MAX for v in numeric)
        flags['negative'] = sum(v < 0 for v in numeric)
        numeric = [v for v in numeric if v >= 0]
    return numeric, {key: value for key, value in flags.items() if value}


def summary(values: list[float]) -> dict | None:
    if not values:
        return None
    return {'median': round(statistics.median(values), 4), 'max': round(max(values), 4), 'min': round(min(values), 4), 'n': len(values)}


def segments(rows: list[dict]) -> list[tuple[int, int]]:
    out, start = [], None
    for index, row in enumerate(rows):
        on = row.get('PTrakSolenoid[VR06]') == 1.0
        if on and start is None:
            start = index
        elif not on and start is not None:
            out.append((start, index - 1))
            start = None
    if start is not None:
        out.append((start, len(rows) - 1))
    return out


def window_stats(rows: list[dict], baseline: dict) -> dict:
    dtb = [number(row.get('DustTrakBMeasurement(MgPerM3)')) or 0.0 for row in rows]
    peak = max(dtb) if dtb else 0.0
    smoke = peak >= NO_SMOKE_MG_M3
    plateau = [row for row, value in zip(rows, dtb) if value >= PLATEAU_FRACTION * peak] if smoke else []
    stats, flags = {}, {}
    for column, (key, _, _) in CHANNELS.items():
        values, channel_flags = clean(key, [row.get(column) for row in plateau])
        stats[key] = summary(values)
        if channel_flags:
            flags[key] = channel_flags
        if stats[key] and baseline.get(key) is not None and key not in ('ptrak', 'dusttrakA', 'dusttrakB'):
            stats[key]['deltaFromBaseline'] = round(stats[key]['median'] - baseline[key], 4)
    if stats['issScatter'] and stats['issScatter']['min'] <= ISS_SCATTER_RAIL_V:
        stats['issScatter']['clippedAtRail'] = True
        flags['issScatter'] = {'clippedAtRail_samples': sum(1 for row in plateau if (number(row.get('ISSDetectorScatterMeasurement(Volts)')) or 0) <= ISS_SCATTER_RAIL_V)}
    sts_power = {number(row.get('STSDetectorPower')) for row in rows}
    if stats['sts'] is not None:
        stats['sts']['powered'] = sts_power == {1.0} if None not in sts_power else None
        if stats['sts']['powered'] is False:
            stats['sts'].pop('deltaFromBaseline', None)
            flags['sts'] = {'detectorNotPowered': True}
    states = {column: sorted({number(row.get(column)) for row in rows if number(row.get(column)) is not None})
              for column in ('CommDiagADilutionSolenoid[PN24]', 'CommDiagBDilutionSolenoid[PN27]', 'DynamicDilutorSolenoid[PN15]', 'STSDetectorAlarm')}
    a, b = stats['dusttrakA'], stats['dusttrakB']
    ratio = round(b['median'] / a['median'], 3) if a and b and a['median'] > 0 else None
    return {'start': rows[0].get('TimeString'), 'end': rows[-1].get('TimeString'),
            'startEpoch_s': number(rows[0].get('Time')), 'endEpoch_s': number(rows[-1].get('Time')),
            'samples': len(rows), 'smoke': smoke, 'plateauSamples': len(plateau),
            'plateauStart': plateau[0].get('TimeString') if plateau else None,
            'plateauEnd': plateau[-1].get('TimeString') if plateau else None,
            'plateauStartEpoch_s': number(plateau[0].get('Time')) if plateau else None,
            'channels': stats, 'flags': flags, 'solenoidStates': states,
            'dusttrakRatioBoverA': ratio,
            'dusttrakRatioNote': None if ratio is None or states['CommDiagADilutionSolenoid[PN24]'] == states['CommDiagBDilutionSolenoid[PN27]']
            else 'diluição dos dois DustTraks em estados diferentes nesta janela'}


def conditions(rows: list[dict]) -> dict:
    heating = [row for row in rows if row.get('HeatingInProgress') == 1.0]
    first_hot = next((index for index, row in enumerate(rows) if row.get('HeatingInProgress') == 1.0), None)
    before = rows[max(first_hot - 10, 0):first_hot] if first_hot else []
    cold = [number(row.get('SampleResistance(Ohms)')) for row in before if number(row.get('SampleResistance(Ohms)'))]
    hot = [number(row.get('SampleResistance(Ohms)')) for row in heating if number(row.get('SampleResistance(Ohms)'))]
    flow = [number(row.get('LFEFlowRate[AT08](SCCM)')) for row in heating if number(row.get('LFEFlowRate[AT08](SCCM)')) is not None]
    plume = [number(row.get('GasPlumeTemperature(DegC)')) for row in heating if number(row.get('GasPlumeTemperature(DegC)')) is not None]
    r0 = statistics.median(cold) if cold else None
    rt = statistics.median(sorted(hot)[len(hot) // 2:]) if hot else None  # median of the hotter half (set-point plateau)
    return {
        'heatingStart': heating[0].get('TimeString') if heating else None,
        'heatingEnd': heating[-1].get('TimeString') if heating else None,
        'heatingEndEpoch_s': number(heating[-1].get('Time')) if heating else None,
        'heatingSamples_s': len(heating),
        'R0_ohm': round(r0, 4) if r0 else None,
        'RtPlateau_ohm': round(rt, 4) if rt else None,
        'RtOverR0': round(rt / r0, 3) if r0 and rt else None,
        'RtMax_ohm': round(max(hot), 4) if hot else None,
        'lfeFlowDuringHeating_sccm': summary(flow),
        'plumeTemperatureDuringHeating_C': summary(plume),
        'note': ('R0 = mediana dos 10 s anteriores ao início do aquecimento (fio frio, amostra posicionada); Rt = mediana da metade mais quente das amostras '
                 'com HeatingInProgress = 1. Rt/R0 é a grandeza de controle do aquecedor (SetTestSetup/MaxRt nos logs); a '
                 'conversão para temperatura exige o coeficiente do fio, não aplicado aqui.'),
    }


def reduce_state_test(test: int) -> dict:
    name, sheet, matrix_number = STATE_SOURCES[test]
    rows = [row for row in load_sheet(name, sheet) if number(row.get('TestNumber')) == float(matrix_number)]
    windows = segments(rows)
    first = windows[0][0] if windows else len(rows)
    base_rows = rows[max(first - BASELINE_SAMPLES, 0):first]
    baseline = {}
    for column, (key, _, _) in CHANNELS.items():
        values, _ = clean(key, [row.get(column) for row in base_rows])
        baseline[key] = round(statistics.median(values), 4) if values else None
    reduced = [window_stats(rows[a:b + 1], baseline) for a, b in windows]
    smoke = [window for window in reduced if window['smoke']]
    for window in reduced:
        window['role'] = 'no-smoke'
    if smoke:
        smoke[0]['role'] = 'primary'
    if len(smoke) > 1:
        smoke[1]['role'] = 'secondary'
    for extra in smoke[2:]:
        extra['role'] = 'additional'
    cond = conditions(rows)
    for window in reduced:
        if cond['heatingEndEpoch_s'] and window['plateauStartEpoch_s'] is not None:
            # Time from the end of sample heating to the first plateau sample: a measured upper bound on smoke age
            # at the instruments (it includes fill, aging and transit times).
            window['ageAtPlateauStart_s'] = round(window['plateauStartEpoch_s'] - cond['heatingEndEpoch_s'], 1)
    roles = {window['role']: window for window in reduced}
    gap, aging, mass_ratio = None, None, None
    if 'primary' in roles and 'secondary' in roles:
        gap = round(roles['secondary']['startEpoch_s'] - roles['primary']['endEpoch_s'], 1)
        aging = 'long' if gap >= LONG_AGING_GAP_S else 'short'
        p, s = roles['primary']['channels']['dusttrakB'], roles['secondary']['channels']['dusttrakB']
        dilution = ('CommDiagADilutionSolenoid[PN24]', 'CommDiagBDilutionSolenoid[PN27]')
        same_dilution = all(roles['primary']['solenoidStates'][key] == roles['secondary']['solenoidStates'][key] for key in dilution)
        if p and s and p['median'] > 0 and same_dilution:
            mass_ratio = round(s['median'] / p['median'], 3)
    return {'method': 'state', 'file': PREFIX + name, 'sheet': sheet, 'sha256': sha256(CACHE / (PREFIX + name)),
            'testNumberColumn': matrix_number, 'rows': len(rows),
            'start': rows[0].get('TimeString') if rows else None, 'end': rows[-1].get('TimeString') if rows else None,
            'baselineSamples': len(base_rows), 'baseline': baseline, 'conditions': cond, 'windows': reduced,
            'secondaryAfterPrimaryGap_s': gap, 'secondaryAgingClass': aging,
            'dusttrakBSecondaryOverPrimary': mass_ratio}


def nasa_average(test: int) -> list[dict]:
    out = []
    for name, sheet, role in NASA_AVERAGE_SHEETS.get(test, []):
        rows = load_sheet(name, sheet)
        stamps = [row.get('TimeString') for row in rows if isinstance(row.get('TimeString'), str) and row['TimeString'].startswith('2007')]
        header = list(rows[0]) if rows else []
        # The averaging sheets were edited for plotting (e.g. P-Trak rescaled, signs flipped): only DustTraks are summarised,
        # located by the instrument prefix of the column name (the suffix varies between sheets).
        stats, means = {}, {}
        for prefix, key in (('DustTrakAMeasurement', 'dusttrakA'), ('DustTrakBMeasurement', 'dusttrakB')):
            column = next((c for c in header if isinstance(c, str) and c.startswith(prefix)), None)
            values = [number(row.get(column)) for row in rows if column and number(row.get(column)) is not None]
            stats[key] = summary(values)
            means[key] = statistics.fmean(values) if values else None
        a, b = stats['dusttrakA'], stats['dusttrakB']
        out.append({'role': role, 'file': PREFIX + name, 'sheet': sheet, 'start': stamps[0] if stamps else None,
                    'end': stamps[-1] if stamps else None, 'samples': len(stamps), 'dusttrak': stats,
                    'dusttrakRatioBoverA_medians': round(b['median'] / a['median'], 3) if a and b and a['median'] > 0 else None,
                    'dusttrakRatioBoverA_means': round(means['dusttrakB'] / means['dusttrakA'], 3)
                    if means['dusttrakA'] and means['dusttrakB'] is not None and means['dusttrakA'] > 0 else None})
    return out


def downloaded_names() -> set[str]:
    manifest = json.loads(inventory.MANIFEST.read_text(encoding='utf-8'))
    return {entry['fileName'] for entry in manifest['files']}


def build() -> dict:
    appendix = inventory.read_appendix()
    have = downloaded_names()
    tests = []
    for row in appendix:
        test = row['test']
        record = {'investigationId': 'PSI-102', 'test': test, 'sampleId': f"C{row['carousel']}-P{row['position']}",
                  'material': row['material'], 'heating': row['heating'], 'gmtDay': row['gmt_day'],
                  'appendixA': {key: row[key] for key in ('material_raw', 'carousel', 'position', 'record_time_raw', 'comment_raw')},
                  'housekeeping': None, 'nasaAveragingWindows': [], 'status': None}
        if test in STATE_SOURCES and PREFIX + STATE_SOURCES[test][0] in have:
            record['housekeeping'] = reduce_state_test(test)
            record['status'] = 'processed-state-windows'
        if NASA_AVERAGE_SHEETS.get(test) and all(PREFIX + name in have for name, _, _ in NASA_AVERAGE_SHEETS[test]):
            record['nasaAveragingWindows'] = nasa_average(test)
            record['status'] = record['status'] or 'nasa-averaging-window-only'
        if record['status'] is None:
            files = sorted(name for name, tests_of in NOT_SEGMENTED_TESTS.items() if PREFIX + name in have and test in tests_of)
            record['status'] = 'downloaded-not-segmented' if files else 'not-downloaded'
            record['notSegmentedReason'] = [NOT_SEGMENTED[name] for name in files] or None
        tests.append(record)
    channels = {key: {'column': column, 'unit': unit, 'description': text} for column, (key, unit, text) in CHANNELS.items()}
    return {
        'schemaVersion': 1, 'investigationId': 'PSI-102',
        'source': 'NASA PSI-102 "Analyzed Data" (housekeeping .hkp exportado para Excel) + Final Science Report, Apêndice A',
        'units': {'channels': channels, 'time': 's', 'resistance': 'ohm', 'flow': 'sccm'},
        'method': {'windows': 'state (PTrakSolenoid[VR06] = 1)', 'plateauFraction': PLATEAU_FRACTION,
                   'noSmokeThreshold_mg_m3': NO_SMOKE_MG_M3, 'baselineSamples': BASELINE_SAMPLES,
                   'ptrakErrorCode': PTRAK_ERROR, 'ptrakNominalMax_pt_cc': PTRAK_RANGE_MAX},
        'measurementKind': 'direct-instrument-units',
        'momentsAvailable': False,
        'ptrakNote': ('O controle dinâmico de diluição ("Dilution control enabled" nos logs de voo) atua durante os diagnósticos: '
                      'a contagem bruta do P-Trak não é proporcional à concentração da fumaça e não é comparável entre janelas '
                      'ou testes sem a razão de diluição, que não consta dos arquivos PSI-102.'),
        'momentsNote': ('Nenhum M0, M1 ou M3 é calculado: faltam nos arquivos PSI-102 as razões de diluição, as curvas de '
                        'calibração (P-Trak por tamanho, câmara de ionização vs EAD, DustTrak vs TEOM por fonte de fumaça) e '
                        'as densidades estimadas dos materiais.'),
        'notSegmentedFiles': {PREFIX + name: reason for name, reason in NOT_SEGMENTED.items() if PREFIX + name in have},
        'tests': tests,
    }


def render(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, indent=1) + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    text = render(build())
    if args.check:
        same = OUTPUT.exists() and OUTPUT.read_text(encoding='utf-8') == text
        print('reproduzível' if same else 'DIVERGENTE')
        return 0 if same else 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(text, encoding='utf-8')
    data = json.loads(text)
    for test in data['tests']:
        hk = test['housekeeping']
        if hk:
            roles = {w['role']: w for w in hk['windows']}
            p, s = roles.get('primary'), roles.get('secondary')
            print(test['test'], test['material'], 'Rt/R0', hk['conditions']['RtOverR0'], 'gap', hk['secondaryAfterPrimaryGap_s'],
                  'B/A', p and p['dusttrakRatioBoverA'], s and s['dusttrakRatioBoverA'],
                  'PT', p and p['channels']['ptrak'] and p['channels']['ptrak']['median'], s and s['channels']['ptrak'] and s['channels']['ptrak']['median'])
        else:
            print(test['test'], test['material'], test['status'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
