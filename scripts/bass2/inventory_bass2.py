"""Rebuild data/bass2/inventory.json: every PSI-25 (BASS-II) record and the PSI files that show it.

Offline and standard-library only. Inputs, all already in the repository or its cache manifest:
  - public/data/nasa-experiments.json   the 129 catalogue records (ids, raw cells, normalised O2);
  - data/raw/psi/PSI-25/metadata.json   the PSI file listing (names and sizes only; nothing is downloaded);
  - data/bass2/documents-derived.json   optional facts extracted from the NASA documents
                                        (documents_bass2.py): Appendix A, test-matrix workbook,
                                        fan calibration, published tables.

A file is tied to a record by the keys printed in its name -- test number, sample number and
GMT day -- compared with the record's own cells. The association is graded:
  confirmada      test, sample and GMT all agree;
  provável        the test number agrees and nothing in the name contradicts the record
                  (or sample+GMT single out one record when the name has no test number);
  ambígua         the name fits more than one record, or contradicts the record it names;
  não encontrada  no MP4 of the listing can be tied to the record.
Similar-looking names are never enough: a name with no key that matches the record stays unassigned.

    python scripts/bass2/inventory_bass2.py
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ACCESSION = 'PSI-25'
SNAPSHOT = ROOT / 'public/data/nasa-experiments.json'
METADATA = ROOT / 'data/raw/psi' / ACCESSION / 'metadata.json'
DERIVED = ROOT / 'data/bass2/documents-derived.json'
OUTPUT = ROOT / 'data/bass2/inventory.json'
PREFIX = re.compile(r'^PSI-25_Raw Data_')
TEST = r'[BFMOPT]\d{1,2}[ab]?'
# "BASS_GMT188_SAMPLE_153_TESTB6", "BASS_GMT100_sample 131_test T5", "BASS_GMT_100_sample137_test T13"
NAME_A = re.compile(rf'BASS_GMT[ _]?(\d+)_ ?sample[ _]?(\d+)_ ?test(?:[ _-]*({TEST})(?![A-Za-z0-9]))?', re.I)
# "GMT2014_188_BASS_S153M_TPB6", "GMT2014_177_BASS_S206M_TP06" (PI letter missing), "..._TPT09"
NAME_B = re.compile(r'GMT(\d{4})_(\d{3})_BASS_S(\d+)[A-Za-z]?_TP_?([A-Za-z]?)0*(\d+)([ab]?)(?![0-9])')
NAME_LEADING_TEST = re.compile(rf'^({TEST})(?![0-9])')
NAME_LOOSE = re.compile(rf'GMT[-_ ]?(\d+)[-_ ]+Test[-_ ]+({TEST})(?![A-Za-z0-9])', re.I)
VIDEO = ('.mp4', '.mov', '.avi', '.ts')
GRADES = ('confirmada', 'provável', 'ambígua', 'não encontrada')
# Who burned what, as stated in PSI-25_Science Documents_BASS-II_ReadMe.docx ("Tabs in spreadsheet for each PI").
PI_SAMPLES = {
    'B': ('PMMA', 'filme fino de PMMA'), 'M': ('PMMA', 'placa (slab) de PMMA'),
    'O': ('PMMA', 'bastão de PMMA, ignição a montante'), 'P': ('PMMA', 'bastão de PMMA, ignição a jusante'),
    'T': ('SIBAL', 'tecido SIBAL (75% algodão / 25% fibra de vidro)'), 'F': ('Nomex', 'tecido Nomex III'),
}


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def normalize_test(letter: str, digits: str, suffix: str = '') -> str:
    return f'{letter.upper()}{int(digits)}{suffix.lower()}'


def canonical_test(text: str) -> str | None:
    match = re.fullmatch(r'\s*([A-Za-z])0*(\d{1,2})([abAB]?)\s*', text or '')
    return normalize_test(match[1], match[2], match[3]) if match else None


def sample_number(text: object) -> int | None:
    """"153m", "039", "S205M", "819L" -> the number that identifies the physical sample."""
    match = re.search(r'\d+', str(text or ''))
    return int(match[0]) if match else None


def day_of_year(text: str) -> int | None:
    match = re.fullmatch(r'\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*', text or '')
    if not match:
        return None
    try:
        return date(int(match[3]), int(match[1]), int(match[2])).timetuple().tm_yday
    except ValueError:
        return None


def classify_file(name: str, folder: str = 'Raw Data') -> dict:
    """Kind, role and the association keys printed in one PSI file name."""
    base = PREFIX.sub('', name)
    lower = base.lower()
    suffix = Path(base).suffix.lower()
    keys = {'test': None, 'testNumber': None, 'testSuffix': None, 'sample': None, 'gmtDay': None, 'year': None}
    pattern = None
    match_b = None
    for match_b in NAME_B.finditer(base):
        pass  # names that repeat the "GMT..._BASS_" stem keep the complete last occurrence
    match_a = NAME_A.search(base)
    if match_a:
        pattern = 'GMT_SAMPLE_TEST'
        keys.update(gmtDay=int(match_a[1]), sample=int(match_a[2]), test=canonical_test(match_a[3] or ''))
    elif match_b:
        pattern = 'GMTyyyy_ddd_BASS_S_TP'
        keys.update(year=int(match_b[1]), gmtDay=int(match_b[2]), sample=int(match_b[3]),
                    testNumber=int(match_b[5]), testSuffix=match_b[6].lower() or None)
        if match_b[4]:
            keys['test'] = normalize_test(match_b[4], match_b[5], match_b[6])
    else:
        loose = NAME_LOOSE.search(base)
        leading = NAME_LEADING_TEST.match(base)
        if loose:
            pattern = 'loose GMT + Test'
            keys.update(gmtDay=int(loose[1]), test=canonical_test(loose[2]))
        elif leading and folder == 'Raw Data':
            pattern = 'leading test number'
            keys['test'] = canonical_test(leading[1])
    qualifiers = [label for label, rule in (
        ('first-ignition-attempt', r'first_ignition_attempt'), ('second-ignition-attempt', r'second_ignition_attempt'),
        ('los-portion', r'\blos\b|_los_|-los'), ('part', r'_part-\d+'), ('post-burn', r'post-burn'),
    ) if re.search(rule, lower)]
    if folder != 'Raw Data':
        kind, role = 'document', 'document'
    elif suffix in VIDEO:
        kind = 'video'
        if 'vlc-record' in lower:
            role = 'vlc-recording'
        elif 'shifted' in lower:
            role = 'shifted-video'
        elif 'still_sequence' in lower:
            role = 'still-sequence'
        elif '2nd_view' in lower:
            role = 'second-view'
        elif pattern == 'GMT_SAMPLE_TEST':
            role = 'primary-video'
        else:
            role = 'auxiliary-video'
    elif suffix == '.zip':
        kind = 'archive'
        if re.fullmatch(r'iss\d+e\d+\.zip', lower):
            role = 'iss-image-zip'
        elif re.search(r'or\w+ vid\w+\.zip$', lower):
            role = 'original-videos-zip'
        elif pattern == 'GMTyyyy_ddd_BASS_S_TP':
            role = 'test-point-zip'
        else:
            role = 'test-zip-unspecified'
    elif suffix == '.pdf':
        kind, role = 'pdf', 'proof-sheet-pdf' if 'proofsheet' in lower else 'pdf'
    else:
        kind, role = 'other', 'other'
    return {'name': name, 'kind': kind, 'role': role, 'qualifiers': qualifiers, 'namePattern': pattern, 'keys': keys}


def record_keys(record: dict) -> dict:
    raw = record['raw']
    test = canonical_test(raw.get('Test #') or record.get('label') or '')
    gmt = int(raw['GMT']) if str(raw.get('GMT') or '').strip().isdigit() else None
    from_date = day_of_year(raw.get('Date') or '')
    return {'id': record['id'], 'test': test, 'base': re.sub(r'[ab]$', '', test or ''),
            'sample': sample_number(raw.get('Sample #')), 'gmtCsv': gmt, 'gmtFromDate': from_date}


def associate(keys: dict, records: list[dict]) -> tuple[list[str], str | None, str]:
    """Record ids a file name points to, the grade of that link and its justification."""
    test, sample, gmt = keys.get('test'), keys.get('sample'), keys.get('gmtDay')

    def gmt_state(record: dict) -> str | None:
        if gmt is None:
            return None
        if gmt == record['gmtCsv']:
            return 'csv'
        return 'date' if gmt == record['gmtFromDate'] else 'conflict'

    def sample_state(record: dict) -> bool | None:
        return None if sample is None else sample == record['sample']

    exact = [record for record in records if test and record['test'] == test]
    if len(exact) == 1:
        record = exact[0]
        sample_ok, day = sample_state(record), gmt_state(record)
        if sample_ok and day == 'csv':
            return [record['id']], 'confirmada', 'teste, amostra e GMT do nome coincidem com o registro'
        if sample_ok and day == 'date':
            return [record['id']], 'provável', (
                f"teste e amostra coincidem; GMT {gmt} do nome coincide com o dia do ano da data do registro, "
                f"mas a coluna GMT do CSV diz {record['gmtCsv']}")
        if sample_ok is False and day == 'conflict':
            # e.g. "GMT183_SAMPLE_175_TESTB15": B15 ran on GMT 188 with sample 149; sample 175 on GMT 183 is B17.
            owners = [other for other in records if other['sample'] == sample and gmt in (other['gmtCsv'], other['gmtFromDate'])]
            return [record['id'], *(other['id'] for other in owners)], 'ambígua', (
                f"o nome cita o teste {test}, mas amostra {sample} e GMT {gmt} divergem desse registro "
                f"(amostra {record['sample']}, GMT {record['gmtCsv']})"
                + (' e pertencem a ' + ', '.join(other['test'] for other in owners) if owners else ''))
        if sample_ok is False:
            return [record['id']], 'ambígua', f"teste coincide, mas a amostra do nome ({sample}) difere da do registro ({record['sample']})"
        if day == 'conflict':
            return [record['id']], 'provável' if sample_ok else 'ambígua', (
                f"teste{' e amostra' if sample_ok else ''} coincidem; GMT {gmt} do nome difere do registro "
                f"(CSV {record['gmtCsv']}, data {record['gmtFromDate']})")
        present = [label for label, state in (('amostra', sample_ok), ('GMT', day)) if state]
        if present:
            return [record['id']], 'provável', f"teste e {present[0]} coincidem; o nome não traz {'GMT' if present[0] == 'amostra' else 'amostra'}"
        return [record['id']], 'provável', 'apenas o número do teste aparece no nome (convenção descrita no ReadMe do PSI-25)'
    if test and not exact and not re.search(r'[ab]$', test):
        # "TEST_O8" when the catalogue only has O8a / O8b: the name cannot tell the two runs apart.
        variants = [record for record in records if record['base'] == test
                    and sample_state(record) is not False and gmt_state(record) != 'conflict']
        if len(variants) == 1:
            return [variants[0]['id']], 'provável', f"nome sem sufixo a/b; só {variants[0]['test']} tem a mesma amostra/GMT"
        if variants:
            return [record['id'] for record in variants], 'ambígua', (
                'nome sem sufixo a/b: compatível com ' + ', '.join(record['test'] for record in variants))
    if sample is not None and gmt is not None:
        both = [record for record in records if record['sample'] == sample and gmt_state(record) in ('csv', 'date')]
        if test and both:
            return [record['id'] for record in both], 'ambígua', (
                f"o nome cita {test}, que não existe com essa amostra/GMT; amostra {sample} e GMT {gmt} pertencem a "
                + ', '.join(record['test'] for record in both))
        number = keys.get('testNumber')
        if number is not None and not test:
            ending = keys.get('testSuffix') or '[ab]?'
            numbered = [record for record in both if re.fullmatch(rf'[A-Z]{number}{ending}', record['test'] or '')]
            if len(numbered) == 1:
                return [numbered[0]['id']], 'provável', (
                    f"amostra, GMT e número {number}{keys.get('testSuffix') or ''} coincidem; "
                    'a letra do pesquisador falta no nome')
            both = numbered or both
        if len(both) == 1:
            return [both[0]['id']], 'provável', 'amostra e GMT coincidem; o nome não traz o número do teste'
        if both:
            return [record['id'] for record in both], 'ambígua', (
                'amostra e GMT coincidem com mais de um registro: ' + ', '.join(record['test'] for record in both))
    return [], None, 'nenhuma chave do nome corresponde a um registro do catálogo'


def current_files(metadata: dict) -> list[dict]:
    """Files whose latest add/modify/remove event (per remote path) is not a removal."""
    latest = {}
    for kind in ('added', 'modified', 'removed'):
        for item in metadata.get(kind) or []:
            path = item.get('remote_path') or item.get('file_name')
            stamp = item.get('date_modified')
            stamp = stamp.get('$date', 0) if isinstance(stamp, dict) else 0
            if path and (path not in latest or stamp >= latest[path][0]):
                latest[path] = (stamp, kind, item)
    files = []
    for _, kind, item in latest.values():
        if kind != 'removed' and item.get('visible', True) and not item.get('restricted'):
            files.append({'name': item['file_name'], 'bytes': int(float(item.get('file_size') or 0)),
                          'folder': Path(item.get('remote_path', '')).parent.name})
    return sorted(files, key=lambda entry: entry['name'])


def flow_steps(cell: object) -> list[dict] | None:
    """Comma-separated entries of a workbook cell, verbatim; a value only for plain numbers."""
    if not isinstance(cell, str) or not cell.strip():
        return None
    steps = []
    for part in cell.split(','):
        text = part.strip()
        if text:
            plain = re.fullmatch(r'\d+\.?\d*|\.\d+', text)
            steps.append({'raw': text, 'value': float(text) if plain else None})
    return steps


def calibration_for(day: int | None, restrictor: str | None, calibration: dict | None) -> dict:
    if not calibration or 'days' not in calibration:
        return {'status': 'documento não disponível', 'days': []}
    count = int(restrictor) if str(restrictor or '').strip().isdigit() else None
    days = []
    for entry in calibration['days']:
        if entry['gmtDay'] != day or entry['year'] != 2014:
            continue
        for block in entry['blocks']:
            if block['restrictors'] == count and block['measuredPoints']:
                days.append({'gmtLabel': entry['gmtLabel'], 'columns': entry['columns'], 'restrictors': count,
                             'measuredPoints': block['measuredPoints'],
                             'fanDisplayRange': [min(p['fanDisplay'] for p in block['points'] if p['airDisplayCmS'] is not None),
                                                 max(p['fanDisplay'] for p in block['points'] if p['airDisplayCmS'] is not None)]})
    if days:
        status = 'calibração do dia e do restritor disponível'
    elif any(entry['gmtDay'] == day and entry['year'] == 2014 for entry in calibration['days']):
        status = 'dia calibrado, mas não para este número de restritores'
    else:
        status = 'sem calibração registrada para este dia'
    return {'status': status, 'days': days}


def build_inventory(records: list[dict], files: list[dict], derived: dict | None) -> dict:
    derived = derived or {}
    keys = [record_keys(record) for record in records]
    by_id = {entry['id']: entry for entry in keys}
    appendix = {row['test']: row for row in (derived.get('appendixA') or {}).get('rows', [])}
    matrix = {row['test']: (sheet['sheet'], row) for sheet in (derived.get('testMatrixWorkbook') or {}).get('sheets', [])
              for row in sheet['rows']}
    published = derived.get('publishedResults') or {}
    slabs = {row['test']: row for row in (published.get('table5_1') or {}).get('rows', [])}
    fabric = {row['test']: row for row in (published.get('table7_1') or {}).get('rows', []) if row.get('series') == 'BASS-II'}
    samples = defaultdict(list)
    for entry in keys:
        samples[entry['sample']].append(entry['test'])

    attached, unassigned = defaultdict(list), []
    for item in files:
        info = classify_file(item['name'], item['folder'])
        entry = {'name': item['name'], 'bytes': item['bytes'], 'kind': info['kind'], 'role': info['role'],
                 'qualifiers': info['qualifiers'], 'namePattern': info['namePattern'], 'nameKeys': info['keys']}
        if info['kind'] == 'document' or info['role'] == 'iss-image-zip':
            unassigned.append({**entry, 'reason': 'documento da investigação' if info['kind'] == 'document'
                               else 'pacote de imagens identificado só pelo número de foto da ISS; sem chave de teste no nome'})
            continue
        ids, grade, basis = associate(info['keys'], keys)
        if not ids:
            unassigned.append({**entry, 'reason': basis})
            continue
        for identifier in ids:
            attached[identifier].append({**entry, 'confidence': grade, 'basis': basis,
                                         'sharedWith': [by_id[other]['test'] for other in ids if other != identifier]})

    inventory = []
    for record, entry in zip(records, keys, strict=True):
        raw = record['raw']
        test = entry['test']
        letter = (test or '?')[0]
        family, form = PI_SAMPLES.get(letter, (None, None))
        material_raw = raw.get('Fuel Sample Material')
        lowered = (material_raw or '').lower()
        if 'candle' in lowered:
            family, form = 'cera (vela)', 'vela de cera'
        elif 'spher' in lowered:
            family, form = 'PMMA', 'seção esférica de PMMA de 4 cm'
        row = appendix.get(test)
        sheet = matrix.get(test)
        cells = sheet[1]['cells'] if sheet else {}
        air_steps = flow_steps(cells.get('Air display'))
        fan_steps = flow_steps(cells.get('Fan display'))
        single = bool(fan_steps and air_steps and len(fan_steps) == 1 and len(air_steps) == 1
                      and fan_steps[0]['value'] is not None and air_steps[0]['value'] is not None)
        media = sorted(attached.get(record['id'], []), key=lambda item: (item['kind'] != 'video', item['role'], item['name']))
        videos = [item for item in media if item['kind'] == 'video']
        grade = next((label for label in GRADES if any(item['confidence'] == label for item in videos)), 'não encontrada')
        documents = []
        if sheet:
            documents.append({'type': 'test-matrix-workbook', 'file': 'PSI-25_Science Documents_BASS-II_Test.Matrices.xlsx',
                              'sheet': sheet[0], 'row': sheet[1]['row']})
        if row:
            documents.append({'type': 'summary-report-appendix-a', 'file': 'PSI-25_Reports_BASS-II Summary Report.pdf',
                              'pdfPage': row['pdfPage'], 'asRun': row['asRun']})
        if test in slabs:
            documents.append({'type': 'summary-report-table-5.1', 'pdfPage': published['table5_1']['pdfPage']})
        if test in fabric:
            documents.append({'type': 'summary-report-table-7.1', 'pdfPage': published['table7_1']['pdfPage']})
        notes = []
        if entry['gmtCsv'] is not None and entry['gmtFromDate'] is not None and entry['gmtCsv'] != entry['gmtFromDate']:
            notes.append(f"GMT do CSV ({entry['gmtCsv']}) difere do dia do ano da data ({entry['gmtFromDate']})")
        if re.search(r'/20(?!14)\d\d$', raw.get('Date') or '') and row:
            notes.append('ano da data fora de 2014, mas o teste consta da série as-run de 2014 do relatório')
        if not row and derived.get('appendixA', {}).get('status') == 'parsed':
            notes.append('ausente do Apêndice A do Summary Report (que lista os 126 testes as-run)')
        inventory.append({
            'recordId': record['id'], 'test': test, 'pi': raw.get('PI'), 'asRun': row['asRun'] if row else None,
            'date': raw.get('Date'), 'gmtCsv': entry['gmtCsv'], 'gmtFromDate': entry['gmtFromDate'],
            'sample': {'raw': raw.get('Sample #'), 'number': entry['sample'],
                       'alsoUsedBy': [other for other in samples[entry['sample']] if other != test]},
            'material': {'raw': material_raw, 'family': family, 'form': form,
                         'basis': 'aba do pesquisador + ReadMe do PSI-25; texto original preservado em raw'},
            'conditions': {
                'oxygenPctInitial': record.get('oxygenPct'), 'flowRestrictor': raw.get('Flow restrictor'),
                'fanDisplayRaw': raw.get('Fan display'), 'airDisplayRaw': raw.get('Air display'),
                'fanDisplaySteps': fan_steps, 'airDisplaySteps': air_steps, 'singleFlowSetting': single,
                'flowDirection': row['flowDirection'] if row else None,
            },
            'timing': {'videoDisplayStart': row['videoDisplayStart'] if row else None,
                       'videoDisplayEnd': row['videoDisplayEnd'] if row else None},
            'observationsRaw': row['observationsRaw'] if row else None,
            'published': {key: value for key, value in (('table5_1', slabs.get(test)), ('table7_1', fabric.get(test))) if value},
            'fanCalibration': calibration_for(entry['gmtFromDate'] or entry['gmtCsv'], raw.get('Flow restrictor'),
                                              derived.get('fanCalibration')),
            'videoAssociation': {'status': grade, 'videoCount': len(videos),
                                 'videoBytes': sum(item['bytes'] for item in videos),
                                 'roles': dict(Counter(item['role'] for item in videos))},
            'files': media, 'documents': documents, 'notes': notes,
        })

    status = Counter(item['videoAssociation']['status'] for item in inventory)
    file_grades = Counter(item['confidence'] for record in inventory for item in record['files'])
    all_roles = Counter(classify_file(item['name'], item['folder'])['role'] for item in files)
    years = Counter((record['raw'].get('Date') or '').rsplit('/', 1)[-1] for record in records)
    return {
        'schemaVersion': 1, 'investigationId': ACCESSION,
        'grading': {
            'confirmada': 'teste, amostra e GMT do nome do arquivo coincidem com o registro',
            'provável': 'o número do teste coincide e nada no nome contradiz o registro, ou amostra+GMT isolam um único registro',
            'ambígua': 'o nome serve a mais de um registro ou contradiz o registro que cita',
            'não encontrada': 'nenhum MP4 da listagem pôde ser ligado ao registro',
        },
        'summary': {
            'records': len(inventory), 'listedFiles': len(files), 'listedBytes': sum(item['bytes'] for item in files),
            'filesByRole': dict(sorted(all_roles.items())),
            'recordsByVideoAssociation': {label: status.get(label, 0) for label in GRADES},
            'fileLinksByConfidence': {label: file_grades.get(label, 0) for label in GRADES[:3]},
            'recordsWithSecondView': sum('second-view' in record['videoAssociation']['roles'] for record in inventory),
            'recordsWithStillSequence': sum('still-sequence' in record['videoAssociation']['roles'] for record in inventory),
            'recordsWithSingleFlowSetting': sum(record['conditions']['singleFlowSetting'] for record in inventory),
            'unassignedFiles': len(unassigned),
        },
        'reconciliation': {
            'catalogueRows': len(records), 'rowsByYearOfDateCell': dict(sorted(years.items())),
            'appendixARows': (derived.get('appendixA') or {}).get('rowCount'),
            'rowsNotInAppendixA': [record['test'] for record in inventory if record['asRun'] is None],
            'distinctTestNumbers': len({entry['base'] for entry in keys}),
            'testsRunTwice': sorted({entry['base'] for entry in keys if entry['test'] != entry['base']}),
            'samplesUsedMoreThanOnce': {str(number): tests for number, tests in sorted(samples.items(), key=lambda item: item[0] or 0)
                                        if len(tests) > 1},
        },
        'records': inventory,
        'unassigned': sorted(unassigned, key=lambda item: (item['role'], item['name'])),
    }


def main() -> int:
    snapshot = json.loads(SNAPSHOT.read_text(encoding='utf-8'))
    records = next(item for item in snapshot['investigations'] if item['id'] == ACCESSION)['tests']
    files = current_files(json.loads(METADATA.read_text(encoding='utf-8')))
    derived = json.loads(DERIVED.read_text(encoding='utf-8')) if DERIVED.exists() else None
    product = build_inventory(records, files, derived)
    product['inputs'] = {
        'snapshot': {'path': SNAPSHOT.relative_to(ROOT).as_posix(), 'retrievedAt': snapshot.get('retrievedAt')},
        'metadata': {'path': METADATA.relative_to(ROOT).as_posix(), 'sha256': sha256(METADATA)},
        'documentsDerived': ({'path': DERIVED.relative_to(ROOT).as_posix(), 'sha256': sha256(DERIVED)} if derived
                             else {'status': 'ausente: execute fetch_bass2.py docs e documents_bass2.py'}),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(product, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(json.dumps({**product['summary'], 'output': OUTPUT.relative_to(ROOT).as_posix()}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
