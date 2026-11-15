"""Extract the machine-readable facts of the cached PSI-25 (BASS-II) documents.

Reads data/cache/bass2/docs/ (fetched by fetch_bass2.py) and writes
data/bass2/documents-derived.json with:
  - fanCalibration: every (day, restrictor block, pot, fan display, air display) cell of
    "Fan calibration data.xlsx", with its cell address;
  - testMatrixWorkbook: the six PI tabs of "BASS-II_Test.Matrices.xlsx" and how each row
    compares with the PSI CSV that the catalogue imports;
  - appendixA: as-run number, flow direction, video-display time and observation text of
    each row of Appendix A of the Summary Report (NASA/TM-20210011385);
  - publishedResults: Table 5.1 (PMMA slabs) and Table 7.1 (SIBAL fabric) of the report.

XLSX is read with the standard library. The PDF needs the external `pdftotext` (Xpdf or
Poppler) on PATH; without it the PDF-derived sections are reported as unavailable, never
guessed. Nothing here converts a free-text cell into a number unless the cell is a plain
number, and cell text is kept verbatim next to anything derived from it.

    python scripts/bass2/documents_bass2.py
"""
from __future__ import annotations

import csv
import io
import json
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DOCS = ROOT / 'data/cache/bass2/docs'
MANIFEST = ROOT / 'data/bass2/docs-manifest.json'
OUTPUT = ROOT / 'data/bass2/documents-derived.json'
CSV_PATH = ROOT / 'data/raw/psi/PSI-25/PSI-25_Experimental table_BASS-II.csv'
FAN_XLSX = 'PSI-25_Reference Data_Fan calibration data.xlsx'
MATRIX_XLSX = 'PSI-25_Science Documents_BASS-II_Test.Matrices.xlsx'
REPORT_PDF = 'PSI-25_Reports_BASS-II Summary Report.pdf'
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'
# Order of the workbook columns A..P; the CSV adds a leading PI column taken from the tab name.
MATRIX_COLUMNS = ['Date', 'GMT', 'Test #', 'Sample #', 'Fuel Sample Material', 'Flow restrictor',
                  'Fan display', 'Air display', 'Radiometer gain   (1000   250   50   10)',
                  'Total Frames Shot', 'Calibrated  initial O2 % by vol ', 'Calibrated final O2 % by vol',
                  'Initial CO2 % by vol', 'Final CO2 % by vol', 'Initial CO (ppm)', 'Final CO (ppm)']
TEST_ID = r'[BFMOPT]\d{1,2}[ab]?'


# ---------------------------------------------------------------- spreadsheets
def column_index(letters: str) -> int:
    index = 0
    for char in letters:
        index = index * 26 + ord(char) - 64
    return index


def column_letters(index: int) -> str:
    letters = ''
    while index:
        index, rest = divmod(index - 1, 26)
        letters = chr(65 + rest) + letters
    return letters


def read_workbook(path: Path) -> list[dict]:
    """Sheets in workbook order: {'name', 'cells': {(row, col): {'value', 'formula'}}}."""
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        shared = []
        if 'xl/sharedStrings.xml' in names:
            for item in ET.fromstring(archive.read('xl/sharedStrings.xml')).iter(NS + 'si'):
                shared.append(''.join(node.text or '' for node in item.iter(NS + 't')))
        targets = {rel.get('Id'): rel.get('Target') for rel in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = []
        for sheet in ET.fromstring(archive.read('xl/workbook.xml')).iter(NS + 'sheet'):
            target = targets[sheet.get(REL)]
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            cells = {}
            for cell in ET.fromstring(archive.read(target)).iter(NS + 'c'):
                match = re.fullmatch(r'([A-Z]+)(\d+)', cell.get('r'))
                value = cell.find(NS + 'v')
                formula = cell.find(NS + 'f')
                text = value.text if value is not None else None
                if cell.get('t') == 's' and text is not None:
                    text = shared[int(text)]
                elif cell.get('t') == 'inlineStr':
                    text = ''.join(node.text or '' for node in cell.iter(NS + 't'))
                if text is None and formula is None:
                    continue
                cells[(int(match[2]), column_index(match[1]))] = {
                    'value': text, 'formula': formula.text if formula is not None else None}
            sheets.append({'name': sheet.get('name'), 'cells': cells})
        return sheets


def number(text: object) -> float | None:
    if not isinstance(text, str) or not re.fullmatch(r'\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*', text):
        return None
    return float(text)


def tidy(value: float) -> float | int:
    """Undo binary float noise of the XLSX storage (17.399999999999999 -> 17.4)."""
    rounded = float(f'{value:.10g}')
    return int(rounded) if rounded.is_integer() else rounded


def excel_date(serial: float) -> str:
    return (date(1899, 12, 30) + timedelta(days=int(serial))).isoformat()


def parse_fan_calibration(sheet: dict) -> dict:
    """One entry per calibration day; blocks follow the sheet's 0/1/2-restrictor order."""
    cells = sheet['cells']
    text = lambda row, col: (cells.get((row, col)) or {}).get('value')
    header_row = next(row for (row, col), cell in sorted(cells.items()) if cell['value'] == 'Pot')
    last_row = max(row for row, _ in cells)
    days = []
    for (row, col), cell in sorted(cells.items(), key=lambda item: item[0][1]):
        if row != header_row or cell['value'] != 'Pot':
            continue
        fan_col, air_col = col + 1, col + 2
        label = text(4, fan_col) or ''
        gmt = re.match(r'\s*(\d{4})-0*(\d+)\s*-?\s*(.*)', label)
        stamp = text(3, fan_col)
        serial = number(stamp)
        blocks, current, previous_pot = [], None, None
        for data_row in range(header_row + 1, last_row + 1):
            pot, fan = number(text(data_row, col)), number(text(data_row, fan_col))
            if pot is None or fan is None:
                continue
            # Each restrictor block is one descending potentiometer sweep (10 -> 0).
            if current is None or pot > previous_pot:
                current = []
                blocks.append(current)
            previous_pot = pot
            air = number(text(data_row, air_col))
            current.append({'pot': tidy(pot), 'fanDisplay': tidy(fan),
                            'airDisplayCmS': tidy(air) if air is not None else None,
                            'airCell': f'{column_letters(air_col)}{data_row}' if air is not None else None,
                            'row': data_row})
        notes = [value for r in (3, 4) for c in (col, air_col, air_col + 1)
                 if isinstance(value := text(r, c), str) and number(value) is None and value not in ('DATE', 'GMT')]
        days.append({
            'columns': f'{column_letters(col)}:{column_letters(air_col)}',
            'gmtLabel': label.strip(), 'year': int(gmt[1]) if gmt else None,
            'gmtDay': int(gmt[2]) if gmt else None, 'qualifier': (gmt[3].strip() or None) if gmt else None,
            'date': excel_date(serial) if serial is not None else None, 'dateCellText': stamp,
            'notes': notes,
            'blocks': [{'restrictors': index, 'measuredPoints': sum(p['airDisplayCmS'] is not None for p in block),
                        'points': block} for index, block in enumerate(blocks)],
        })
    labels = [value for (row, col), cell in cells.items()
              if isinstance(value := cell['value'], str) and re.search(r'res\w*trictor', value) and len(value) < 30]
    return {
        'sheet': sheet['name'],
        'sheetNote': text(1, 4),
        'restrictorLabels': labels,
        'velocityNote': [text(33, 1), text(34, 1)],
        'velocityFormulaCells': {f'{column_letters(col)}{row}': cells[(row, col)]['formula']
                                 for row, col in [(7, 4), (7, 5)] if (row, col) in cells},
        'blockOrderBasis': 'Rótulos "no restrictor / 1 restrictor / 2 resrictor" existem apenas na coluna D do primeiro dia; '
                           'para os demais dias a ordem 0/1/2 dos blocos segue a nota da célula D1 e é uma inferência.',
        'days': days,
    }


def tokens(value: object) -> list[str]:
    """Comparison key: the PSI CSV export replaced the workbook's commas by spaces."""
    parts = [part for part in re.split(r'[,\s]+', str(value if value is not None else '').strip()) if part]
    return [str(tidy(float(part))) if number(part) is not None else part.lower() for part in parts]


def parse_test_matrices(sheets: list[dict], csv_rows: list[dict]) -> dict:
    by_test = {row['Test #'].strip(): row for row in csv_rows}
    result, differences, seen = [], [], []
    for sheet in sheets:
        cells = sheet['cells']
        rows = []
        for row in range(2, max(r for r, _ in cells) + 1):
            values = {name: (cells.get((row, index + 1)) or {}).get('value') for index, name in enumerate(MATRIX_COLUMNS)}
            test = (values['Test #'] or '').strip()
            if not test:
                continue
            seen.append(test)
            serial = number(values['Date'])
            entry = {'test': test, 'row': row, 'dateSerial': values['Date'],
                     'date': excel_date(serial) if serial is not None else None,
                     'cells': {name: values[name] for name in MATRIX_COLUMNS[1:]}}
            rows.append(entry)
            source = by_test.get(test)
            if source is None:
                differences.append({'test': test, 'sheet': sheet['name'], 'row': row, 'issue': 'ausente no CSV'})
                continue
            if source.get('PI') != sheet['name']:
                differences.append({'test': test, 'sheet': sheet['name'], 'row': row, 'field': 'PI',
                                    'workbook': sheet['name'], 'csv': source.get('PI')})
            month, day, year = (int(part) if part.isdigit() else None for part in (source['Date'].split('/') + ['', '', ''])[:3])
            csv_date = date(year, month, day).isoformat() if year and month and day and 1 <= month <= 12 else source['Date']
            if entry['date'] != csv_date:
                differences.append({'test': test, 'sheet': sheet['name'], 'row': row, 'field': 'Date',
                                    'workbook': entry['date'], 'csv': source['Date']})
            for name in MATRIX_COLUMNS[1:]:
                if tokens(values[name]) != tokens(source.get(name)):
                    differences.append({'test': test, 'sheet': sheet['name'], 'row': row, 'field': name.strip(),
                                        'workbook': values[name], 'csv': source.get(name)})
        header = {column_letters(index + 1): (cells.get((1, index + 1)) or {}).get('value') for index in range(len(MATRIX_COLUMNS))}
        result.append({'sheet': sheet['name'], 'header': header, 'rowCount': len(rows), 'rows': rows})
    return {
        'sheets': result, 'rowCount': len(seen), 'csvRowCount': len(csv_rows),
        'testsOnlyInCsv': sorted(set(by_test) - set(seen)),
        'duplicateTests': sorted({test for test in seen if seen.count(test) > 1}),
        'comparisonRule': 'Células comparadas por tokens separados por vírgula ou espaço (o CSV do PSI trocou vírgulas '
                          'por espaços); números comparados após remover ruído binário do XLSX.',
        'differencesFromCsv': differences,
    }


# ------------------------------------------------------------------------- PDF
def pdf_pages(path: Path, mode: str) -> list[str] | None:
    """Text of each page via pdftotext (`-raw` keeps table rows together, `-layout` keeps columns)."""
    tool = shutil.which('pdftotext')
    if tool is None:
        return None
    with tempfile.TemporaryDirectory() as folder:
        target = Path(folder) / 'report.txt'
        subprocess.run([tool, f'-{mode}', '-enc', 'UTF-8', str(path), str(target)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return target.read_text(encoding='utf-8', errors='replace').split('\f')


ROW = re.compile(rf'(?<![\d./:-])(\d{{1,3}})[ \t]+({TEST_ID})[ \t]+(\d{{2,3}}[mML]?)(?=\s)')
DATE_LINE = re.compile(r'(?m)^[ \t]*\d{1,2}/\d{1,2}/\d{2,4}\b')
FOOTER = re.compile(r'(?m)^(?:aGreenwich Mean Time|NASA/TM-|TABLE A\.|A\.\d+ |Appendix [A-Z]|Actual date \().*')
VALUE = re.compile(r'[-−–—]*\d[\d.,]*\+?|[-−–—]+|OR|none|over|NA|video|[<>]\d+|\+\d+', re.I)
CLOCK = r'\d{1,2}:\d{2}(?::\d{2})?'


def observation(body: str) -> str | None:
    """Free text after the still-camera settings and the eight gas readings of a row."""
    flat = ' '.join(body.split())
    # Columns "F stop | ISO | Shutter hold" (e.g. "F2 1,000 Cont", "F4 1,600 7s") end the camera block.
    marker = None
    for marker in re.finditer(r'\bF\d+\s+\d,?\d{3}\s+(?:Cont|Man|\d+\s?s)\b', flat):
        pass
    if marker is None:
        return None
    words = flat[marker.end():].split()
    skipped = 0
    while skipped < len(words) and skipped < 14 and VALUE.fullmatch(words[skipped]):
        skipped += 1
    # A following row without a printed date starts with its "--------" time cell: not part of this text.
    text = re.sub(r'[\s\-−–—]+$', '', ' '.join(words[skipped:]))
    return text if re.search(r'[A-Za-z]', text) else None


def parse_appendix_a(pages: list[str]) -> dict:
    start = next((i for i, page in enumerate(pages) if 'TABLE A.1' in page), None)
    if start is None:
        return {'status': 'unavailable', 'reason': 'Tabela A.1 não encontrada no texto extraído.'}
    stop = next((i for i in range(start, len(pages)) if re.search(r'Appendix B\.', pages[i]) and 'TABLE A.' not in pages[i]), len(pages))
    rows, pending_prefix = [], ''
    for page_index in range(start, stop):
        page = pages[page_index]
        matches = list(ROW.finditer(page))
        for position, match in enumerate(matches):
            head = page[matches[position - 1].start() if position else 0:match.start()]
            # The date / GMT / clock cells of a row are printed just before its as-run number.
            dated = list(DATE_LINE.finditer(head))
            prefix = head[dated[-1].start():] if dated else ''
            segment = page[match.start():matches[position + 1].start() if position + 1 < len(matches) else len(page)]
            footer = FOOTER.search(segment)
            if footer:
                segment = segment[:footer.start()]
            next_date = list(DATE_LINE.finditer(segment))
            body = segment[:next_date[-1].start()] if next_date and next_date[-1].start() > 0 else segment
            flat_prefix = ' '.join(prefix.split())
            clock = re.search(rf'({CLOCK})(?:\s*to\s*({CLOCK}))?', flat_prefix)
            printed_date = re.match(r'\d{1,2}/\d{1,2}/\d{2,4}', flat_prefix)
            direction = re.search(r'\b(Opposed|Concurrent|Stagnation)\b', body)
            rows.append({
                'test': match[2], 'asRun': int(match[1]), 'sample': match[3],
                'printedDate': printed_date[0] if printed_date else None,
                'videoDisplayStart': clock[1] if clock else None,
                'videoDisplayEnd': clock[2] if clock else None,
                'flowDirection': direction[1].lower() if direction else None,
                'observationsRaw': observation(body),
                'pdfPage': page_index + 1,
            })
    numbers = sorted(row['asRun'] for row in rows)
    return {
        'status': 'parsed', 'source': 'NASA/TM-20210011385, Appendix A, Tables A.1–A.6',
        'parse': 'best-effort a partir de pdftotext -raw; conferir no PDF antes de citar um valor',
        'rowCount': len(rows), 'asRunMin': numbers[0] if numbers else None, 'asRunMax': numbers[-1] if numbers else None,
        'asRunMissing': sorted(set(range(1, (numbers[-1] if numbers else 0) + 1)) - set(numbers)),
        'asRunDuplicated': sorted({n for n in numbers if numbers.count(n) > 1}),
        'rows': sorted(rows, key=lambda row: row['asRun']),
    }


def number_list(text: str) -> list[float] | None:
    parts = [part for part in re.split(r',\s*|\s+and\s+|\s+to\s+', text.replace(', and ', ', ').strip()) if part]
    values = [number(part) for part in parts]
    return [tidy(value) for value in values] if parts and all(value is not None for value in values) else None


def slab_row(line: str) -> dict | None:
    """One Table 5.1 line: test, thickness, width, sides, velocities, spread rates, burn time, initial O2.

    The extracted line may end with a stray Final-O2 value of a neighbouring row, so the
    velocity list (cm/s, >= 1) and the equally long spread-rate list (mm/s, < 1) are
    recognised by their parity and magnitude; a line that fits neither reading is dropped.
    """
    match = re.match(r'\s*(M\d+)\s+(\d)\s+([\d.]+)\s+(\d)\s+(.*)$', line)
    if not match:
        return None
    tail = match[5]
    row = {'test': match[1], 'thicknessMm': tidy(float(match[2])), 'widthCm': tidy(float(match[3])),
           'sidesBurning': int(match[4]), 'lineRaw': ' '.join(line.split())}
    values = [float(item) for item in re.findall(r'\d+\.?\d*', tail)]
    if 'Not tracked' in tail:
        before, after = tail.split('Not tracked', 1)
        trailing = [float(item) for item in re.findall(r'\d+\.?\d*', after)]
        if len(trailing) < 2:
            return None
        return {**row, 'velocityCmS': [tidy(float(item)) for item in re.findall(r'\d+\.?\d*', before)],
                'spreadRateMmS': None, 'spreadRateNote': 'Not tracked',
                'burnTimeMin': tidy(trailing[0]), 'initialO2Pct': tidy(trailing[1])}
    for extra in (2, 3):
        body = values[:-extra]
        half = len(body) // 2
        if body and len(body) % 2 == 0 and all(item >= 1 for item in body[:half]) and all(item < 1 for item in body[half:]):
            return {**row, 'velocityCmS': [tidy(item) for item in body[:half]],
                    'spreadRateMmS': [tidy(item) for item in body[half:]],
                    'burnTimeMin': tidy(values[-extra]), 'initialO2Pct': tidy(values[-extra + 1])}
    return None


def parse_published_tables(pages: list[str]) -> dict:
    """Per-test values printed in Table 5.1 (Miller, PMMA slabs) and Table 7.1 (T'ien, SIBAL)."""
    result = {}
    page = next((i for i, text in enumerate(pages) if 'TABLE 5.1' in text), None)
    if page is not None:
        rows = [row for line in pages[page].splitlines() if (row := slab_row(line))]
        result['table5_1'] = {'source': 'NASA/TM-20210011385, Table 5.1', 'pdfPage': page + 1,
                              'note': 'Velocidade (cm/s) e taxa de propagação (mm/s) na mesma ordem, um par por regime. '
                                      'Coluna Final O2 omitida: o texto extraído desalinha essa coluna.', 'rows': rows}
    page = next((i for i, text in enumerate(pages) if 'TABLE 7.1' in text), None)
    if page is not None:
        rows = []
        for line in pages[page].splitlines():
            match = re.match(r'\s*GMT(\d+)-(T\d+[ab]?)\s+([\d.]+)\s+(.+?)\s{2,}([\d.]+)(b?)\s*(.*)$', line)
            if match:
                comment = match[7].strip(' -')
                rows.append({'series': 'BASS' if comment == 'BASS' else 'BASS-II',
                             'gmtDay': int(match[1]), 'test': match[2], 'sampleWidthCm': tidy(float(match[3])),
                             'flowCmSRaw': match[4].strip(), 'flowCmS': number_list(match[4]),
                             'o2Pct': tidy(float(match[5])),
                             'o2Flagged': bool(match[6]), 'comment': comment or None})
        result['table7_1'] = {'source': 'NASA/TM-20210011385, Table 7.1', 'pdfPage': page + 1,
                              'note': 'Linhas com series = BASS (GMT96/131/222) pertencem ao BASS (PSI-26), não ao BASS-II. '
                                      'o2Flagged: nota b da tabela ("O2 reading in these two tests might be inaccurate").',
                              'rows': rows}
    return result


# ------------------------------------------------------------------------ main
def build() -> dict:
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {'files': []}
    hashes = {entry['name']: entry.get('sha256') for entry in manifest['files']}
    product = {'schemaVersion': 1, 'investigationId': 'PSI-25',
               'sources': {name: hashes.get(name) for name in (FAN_XLSX, MATRIX_XLSX, REPORT_PDF)}}
    fan = DOCS / FAN_XLSX
    product['fanCalibration'] = (parse_fan_calibration(read_workbook(fan)[0]) if fan.is_file()
                                 else {'status': 'unavailable', 'reason': 'planilha ausente do cache'})
    matrix = DOCS / MATRIX_XLSX
    if matrix.is_file():
        text = CSV_PATH.read_bytes().decode('utf-8-sig')
        product['testMatrixWorkbook'] = parse_test_matrices(read_workbook(matrix), list(csv.DictReader(io.StringIO(text))))
    else:
        product['testMatrixWorkbook'] = {'status': 'unavailable', 'reason': 'planilha ausente do cache'}
    report = DOCS / REPORT_PDF
    raw = pdf_pages(report, 'raw') if report.is_file() else None
    layout = pdf_pages(report, 'layout') if report.is_file() else None
    if raw is None or layout is None:
        missing = 'relatório ausente do cache' if not report.is_file() else 'pdftotext não encontrado no PATH'
        product['appendixA'] = {'status': 'unavailable', 'reason': missing}
        product['publishedResults'] = {'status': 'unavailable', 'reason': missing}
    else:
        product['appendixA'] = parse_appendix_a(raw)
        product['publishedResults'] = parse_published_tables(layout)
    return product


def main() -> int:
    product = build()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(product, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    calibration, appendix, matrix = product['fanCalibration'], product['appendixA'], product['testMatrixWorkbook']
    print(json.dumps({
        'calibrationDays': len(calibration.get('days', [])),
        'matrixRows': matrix.get('rowCount'), 'matrixDifferences': len(matrix.get('differencesFromCsv', [])),
        'appendixRows': appendix.get('rowCount'), 'appendixStatus': appendix.get('status'),
        'publishedTables': sorted(key for key in product['publishedResults'] if key.startswith('table')),
        'output': OUTPUT.relative_to(ROOT).as_posix(),
    }, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
