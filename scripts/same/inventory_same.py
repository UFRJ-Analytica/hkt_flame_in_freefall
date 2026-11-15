"""P0 inventory of SAME (PSI-102), with SAME-R (PSI-101) kept apart and summarised only for its differences.

    python scripts/same/inventory_same.py            # writes data/same/derived/same-inventory.json
    python scripts/same/inventory_same.py --appendix # also re-transcribes Appendix A of the Final Science Report

Inputs: data/raw/psi/PSI-102 (metadata.json, experimental table CSV), data/raw/psi/PSI-101 (metadata.json, table CSV),
data/same/docs-manifest.json (what was downloaded into the git-ignored cache). Appendix A (log of the 47 flight tests,
Final Science Report pp. A-1/A-2) is transcribed into data/same/appendix-a-flight-log.csv from `pdftotext -raw`; the
CSV is versioned so the pipeline does not need the PDF. Only facts present in the sources are written.
"""
from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / 'data/raw/psi'
SAME = ROOT / 'data/same'
DERIVED = SAME / 'derived'
MANIFEST = SAME / 'docs-manifest.json'
APPENDIX = SAME / 'appendix-a-flight-log.csv'
REPORT_PDF = ROOT / 'data/cache/same/Reports/PSI-102_Reports_SAME_Final Science Report.pdf'
APPENDIX_COLUMNS = ['test', 'gmt_day', 'material_raw', 'material', 'heating', 'carousel', 'position', 'record_time_raw',
                    'comment_raw']
MATERIALS = {'teflon': 'Teflon', 'kapton': 'Kapton', 'silicone': 'Silicone rubber', 'silicon': 'Silicone rubber',
             'lampwick': 'Lamp wick (cellulose)', 'dbp': 'DBP (dibutyl phthalate on cotton wick)'}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def material_of(text: str) -> str | None:
    """Canonical material named in a free-text label or file name; None when absent or ambiguous."""
    lower = text.lower().replace(' ', '')
    found = {name for key, name in MATERIALS.items() if key in lower}
    return found.pop() if len(found) == 1 else None


def classify(name: str, folder: str, size: int) -> str:
    lower = name.lower()
    if size == 0:
        return 'empty-entry'
    if lower.endswith('.mp4') or ('tn00' in lower and lower.endswith('.zip')):
        return 'video-engineering'
    if lower.endswith('.zip') and 'images' in lower:
        return 'image-collection'
    if folder == 'Analyzed Data' and 'log' in lower:
        return 'flight-software-log'
    if folder == 'Analyzed Data':
        return 'flight-housekeeping-timeseries'
    if folder in ('Reports', 'Science Documents', 'Reference Data'):
        return 'science-or-reference-document'
    if folder == 'Presentations':
        return 'presentation'
    if folder == 'metadata':
        return 'metadata-archive'
    return 'engineering-document'


def catalogue(accession: str) -> dict:
    metadata = json.loads((RAW / accession / 'metadata.json').read_text(encoding='utf-8'))
    files = []
    for item in metadata.get('added') or []:
        parts = item['remote_path'].split('/')
        folder = parts[4] if len(parts) > 5 else ''
        files.append({'fileName': item['file_name'], 'psiFolder': folder, 'bytes': int(item.get('file_size') or 0),
                      'public': bool(item.get('visible', True)) and not item.get('restricted')})
    return {'metadata': metadata, 'files': files}


def appendix_from_pdf(pdf: Path = REPORT_PDF) -> list[dict]:
    """Rows of Appendix A as printed (pdftotext -raw), material mapped to the canonical name; nothing inferred."""
    text = subprocess.run(['pdftotext', '-enc', 'UTF-8', '-raw', str(pdf), '-'], capture_output=True, check=True).stdout
    block = text.decode('utf-8').split('Appendix A Log of SAME flight tests', 1)[1].split('A-2', 1)[0]
    rows = []
    pattern = re.compile(r'^(\d{1,2}) (\d{3}) (\w+) (Initial|Reheat|Intiial) (\d) (\d) ?(.*)$')
    for line in block.splitlines():
        match = pattern.match(line.strip())
        if not match:
            continue
        test, day, material, heating, carousel, position, rest = match.groups()
        time_match = re.match(r'^([<\d][\d.: ]*(?:-\s*[\d.: ]+)?)(.*)$', rest)
        record, comment = (time_match.group(1).strip(), time_match.group(2).strip()) if time_match else ('', rest.strip())
        rows.append({'test': int(test), 'gmt_day': int(day), 'material_raw': material, 'material': material_of(material),
                     'heating': 'Initial' if heating == 'Intiial' else heating, 'carousel': int(carousel),
                     'position': int(position), 'record_time_raw': record, 'comment_raw': comment})
    return rows


def write_appendix(rows: list[dict]) -> None:
    APPENDIX.parent.mkdir(parents=True, exist_ok=True)
    with APPENDIX.open('w', newline='', encoding='utf-8') as stream:
        writer = csv.DictWriter(stream, fieldnames=APPENDIX_COLUMNS, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def read_appendix() -> list[dict]:
    with APPENDIX.open(encoding='utf-8') as stream:
        rows = list(csv.DictReader(stream))
    for row in rows:
        for key in ('test', 'gmt_day', 'carousel', 'position'):
            row[key] = int(row[key])
    return rows


def experimental_table(path: Path) -> dict:
    with path.open(encoding='utf-8-sig') as stream:
        rows = list(csv.reader(stream))
    return {'file': path.relative_to(ROOT).as_posix(), 'sha256': sha256(path), 'columns': [c.strip() for c in rows[0]],
            'rows': len(rows) - 1, 'raw': rows[1:]}


def build() -> dict:
    same = catalogue('PSI-102')
    reflight = catalogue('PSI-101')
    downloaded = {entry['fileName']: entry for entry in json.loads(MANIFEST.read_text(encoding='utf-8'))['files']}
    files = []
    for item in sorted(same['files'], key=lambda entry: (entry['psiFolder'], entry['fileName'])):
        entry = downloaded.get(item['fileName'])
        files.append({**item, 'class': classify(item['fileName'], item['psiFolder'], item['bytes']),
                      'material': material_of(item['fileName']) if item['psiFolder'] == 'Analyzed Data' else None,
                      'downloaded': entry is not None, 'sha256': entry['sha256'] if entry else None})
    classes = collections.Counter(entry['class'] for entry in files)
    appendix = read_appendix()
    table = experimental_table(RAW / 'PSI-102' / 'PSI-102_Experimental table_SAME.csv')
    reflight_table = experimental_table(RAW / 'PSI-101' / 'PSI-101_Experimental table_SAME-R.csv')
    meta = same['metadata']
    return {
        'schemaVersion': 1,
        'investigation': {'id': 'PSI-102', 'acronym': meta.get('investigationAcronym'), 'title': meta.get('title'),
                          'doi': meta.get('doi'), 'platform': meta.get('flightProgram'),
                          'psiStudyDates': [meta.get('investigationStartDate'), meta.get('investigationEndDate')],
                          'psiTotalFileSize_bytes': int(meta.get('totalFileSize') or 0), 'psiVersion': meta.get('version'),
                          'relatedInvestigation': meta.get('related_glds'),
                          'metadataSha256': sha256(RAW / 'PSI-102' / 'metadata.json')},
        'files': files,
        'summary': {'listed': len(files), 'listedBytes': sum(entry['bytes'] for entry in files),
                    'byClass': dict(sorted(classes.items())),
                    'downloaded': sum(entry['downloaded'] for entry in files),
                    'downloadedBytes': sum(entry['bytes'] for entry in files if entry['downloaded']),
                    'housekeepingListed': classes['flight-housekeeping-timeseries'],
                    'housekeepingDownloaded': sum(entry['downloaded'] for entry in files
                                                  if entry['class'] == 'flight-housekeeping-timeseries'),
                    'flightVideosListed': 0,
                    'note': ('Nenhum vídeo de voo está listado no PSI-102; os dois MP4/ZIP "Resistive Heater Coil TN001/TN002" '
                             'são ensaios de engenharia do fio aquecedor.')},
        'experimentalTable': {**table, 'interpretation': (
            'Reproduz a matriz de testes PLANEJADA (EIRD Rev. 1.01, Baseline Concept Description Doc §6.4, Tabela 1), '
            'resumida em 8 linhas; não é o registro dos 47 pontos de teste voados (Final Science Report, Apêndice A).')},
        'flightLog': {'source': 'Final Science Report (15 mar 2010), Apêndice A, pp. A-1/A-2', 'file': APPENDIX.relative_to(ROOT).as_posix(),
                      'tests': len(appendix),
                      'byMaterial': dict(sorted(collections.Counter(row['material'] for row in appendix).items())),
                      'initialHeatings': dict(sorted(collections.Counter(row['material'] for row in appendix if row['heating'] == 'Initial').items())),
                      'note': ('Transcrição de pdftotext -raw; os comentários ficam como texto bruto e seu alinhamento com a '
                               'linha do teste não é garantido pela extração.')},
        'reflight': {
            'id': 'PSI-101', 'acronym': reflight['metadata'].get('investigationAcronym'), 'title': reflight['metadata'].get('title'),
            'psiStudyDates': [reflight['metadata'].get('investigationStartDate'), reflight['metadata'].get('investigationEndDate')],
            'listedFiles': len(reflight['files']), 'listedBytes': sum(entry['bytes'] for entry in reflight['files']),
            'byFolder': dict(sorted(collections.Counter(entry['psiFolder'] for entry in reflight['files']).items())),
            'experimentalTable': {key: reflight_table[key] for key in ('file', 'sha256', 'columns', 'rows')},
            'differencesStatedByNasa': reflight['metadata'].get('approach'),
            'usedHere': False,
            'note': 'Somente para identificar diferenças; nenhum arquivo ou valor do PSI-101 entra nas análises do SAME.'},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--appendix', action='store_true', help='re-transcribe Appendix A from the cached PDF')
    args = parser.parse_args()
    if args.appendix or not APPENDIX.exists():
        write_appendix(appendix_from_pdf())
    inventory = build()
    DERIVED.mkdir(parents=True, exist_ok=True)
    (DERIVED / 'same-inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(json.dumps(inventory['summary'], ensure_ascii=False, indent=1))
    print('Apêndice A:', inventory['flightLog']['tests'], 'testes', inventory['flightLog']['byMaterial'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
