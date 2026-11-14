"""Import small, public NASA PSI experimental tables; no media archives or invented values.

Run: python scripts/sync_nasa.py
Rebuild from already downloaded originals: python scripts/sync_nasa.py --offline
"""
from __future__ import annotations

import argparse
import concurrent.futures
import csv
import hashlib
import html
import io
import json
import math
from pathlib import Path
import re
import sys
import tempfile
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'raw' / 'psi'
PUBLIC = ROOT / 'public' / 'data'
API = 'https://psi.nasa.gov/geode-py/ws'
PORTAL = 'https://psi.nasa.gov/physci/repo/data/investigations'
# The 24 accession identifiers cited in the supplied PROJECT.md, not an assertion
# that each is a flight experiment or contains downloadable numerical tables.
CATALOG = {
    'PSI-25': ('BASS-II', 'solid'), 'PSI-69': ('FLEX', 'droplet'),
    'PSI-99': ('SAFFIRE-II', 'large-scale'), 'PSI-98': ('SAFFIRE-I', 'large-scale'),
    'PSI-100': ('SAFFIRE-III', 'large-scale'), 'PSI-20': ('ACME BRE', 'gas'),
    'PSI-102': ('SAME', 'detection'), 'PSI-101': ('SAME-R', 'detection'),
    'PSI-159': ('ACME CFI-G', 'gas'), 'PSI-117': ('PSI-117', 'other'),
    'PSI-115': ('Smoke modeling', 'other'), 'PSI-26': ('BASS', 'solid'),
    'PSI-68': ('FLEX-2', 'droplet'), 'PSI-10': ('ACME Flame Design', 'gas'),
    'PSI-21': ('ACME CLD', 'gas'), 'PSI-22': ('ACME E-FIELD', 'gas'),
    'PSI-23': ('ACME s-Flame', 'gas'), 'PSI-39': ('CFI', 'droplet'),
    'PSI-106': ('SLICE', 'gas'), 'PSI-107': ('SPICE', 'gas'),
    'PSI-47': ('DAFT / DAFT-2', 'detection'), 'PSI-62': ('PSI-62', 'other'),
    'PSI-60': ('PSI-60', 'other'), 'PSI-142': ('PSI-142', 'other'),
}
MAX_METADATA = 16 * 1024 * 1024
MAX_TABLE = 2 * 1024 * 1024
MMHG_TO_KPA = 101.325 / 760.0


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_bytes() == data:
        return
    # A fixed .new filename can overwrite unrelated work and races other writers.
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + '.', suffix='.tmp', delete=False) as handle:
        handle.write(data)
        temporary = Path(handle.name)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')


def request(url: str, limit: int) -> bytes:
    parsed = urlparse(url)
    allowed = {'psi.nasa.gov', 'psi-repo-prod.s3.amazonaws.com'}
    if parsed.scheme != 'https' or parsed.hostname not in allowed:
        raise ValueError('Host de download fora da origem NASA PSI esperada.')
    with urlopen(Request(url, headers={'User-Agent': 'HabitatFire/0.1 public-PSI-table-import'}), timeout=25) as response:
        if urlparse(response.url).hostname not in allowed:
            raise ValueError('Redirecionamento para origem não autorizada.')
        content = response.read(limit + 1)
    if len(content) > limit:
        raise ValueError('Arquivo ultrapassa o limite de importação de tabelas pequenas.')
    return content


def safe_error(error: Exception) -> str:
    # Never persist the service's temporary signed S3 URL or its query credentials.
    if isinstance(error, HTTPError):
        return f'HTTP {error.code}'
    if isinstance(error, URLError):
        return f'Falha de rede: {type(error.reason).__name__}'
    return f'{type(error).__name__}: {str(error).split("https://")[0][:180]}'


def scalar(value: object, units: tuple[str, ...] = ()) -> float | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    suffix = '(?:' + '|'.join(re.escape(u) for u in units) + ')?' if units else ''
    match = re.fullmatch(r'([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*' + suffix, text, re.I)
    if not match:
        return None
    result = float(match.group(1))
    return result if math.isfinite(result) else None


def field(raw: dict, *names: str) -> str | None:
    # Trim headers for lookup only. Original keys and original values remain in raw.
    lookup = {key.strip().casefold(): value for key, value in raw.items()}
    for name in names:
        value = lookup.get(name.strip().casefold())
        if value is not None and str(value).strip():
            return str(value)
    return None


def normalized(raw: dict, accession: str) -> dict:
    material = field(raw, 'Fuel Sample Material', 'Sample Material', 'Sample Type', 'Material', 'Fuel', 'Fuel Bottle', 'Fuel Type', 'Sample (Fuel Type)')
    oxygen = pressure = flow = None
    notes = []
    if accession == 'PSI-25':
        oxygen = scalar(field(raw, 'Calibrated  initial O2 % by vol'), ('%',))
    elif accession == 'PSI-69':
        fraction = scalar(field(raw, 'O initial ambient composition; mole fraction'))
        oxygen = fraction * 100 if fraction is not None and 0 <= fraction <= 1 else None
        mmhg = scalar(field(raw, 'Ambient pressure; mmHg'), ('mmHg',))
        pressure = mmhg * MMHG_TO_KPA if mmhg is not None else None
        notes.append('O₂ convertido de fração molar para %; pressão de mmHg para kPa (101,325 kPa = 760 mmHg).')
    else:
        oxygen = scalar(field(raw, 'Percent O2', 'Percent O2 (Note 1)', 'Oxygen Conc (percent)', 'Oxygen concentration (%)'), ('%',))
    if accession in {'PSI-10', 'PSI-159', 'PSI-68'}:
        fraction = scalar(field(raw, 'XO2 (init)', 'XO2 before test', 'Oxygen Mole Fraction'))
        if fraction is not None and 0 <= fraction <= 1:
            oxygen = fraction * 100
            notes.append('O₂ inicial convertido de fração molar explicitamente nomeada para %.')
        if accession == 'PSI-10':
            atm = scalar(field(raw, 'pinit (atm)'))
            if atm is not None:
                pressure = atm * 101.325
                notes.append('Pressão inicial convertida de atm para kPa (1 atm = 101,325 kPa).')
    # Never reinterpret BASS-II fan/air display settings as calibrated cm/s.
    flow = scalar(field(raw, 'Air Flow (cm/s)', 'Inlet velocity (cm/s)', 'Flow Velocity (cm/s)', 'Air Rate (cm/s)'), ('cm/s',))
    unqualified_flow = field(raw, 'Air Flow')
    if flow is None and unqualified_flow and unqualified_flow.strip().lower().endswith('cm/s'):
        flow = scalar(unqualified_flow, ('cm/s',))
    if oxygen is not None and not 0 <= oxygen <= 100:
        notes.append('O₂ tabular fora de 0–100%; mantido no original e não convertido em condição do cenário.')
        oxygen = None
    if pressure is not None and pressure <= 0:
        pressure = None
    if flow is not None and flow < 0:
        flow = None
    if accession == 'PSI-20':
        notes.append('Registro agregado por dia, não um ensaio individual. Listas e valores anômalos de O₂ não são reduzidos a um escalar.')
    return {'material': material, 'oxygenPct': oxygen, 'pressureKpa': pressure, 'flowCmS': flow,
            'outcome': None, 'normalizationNotes': notes}


def row_is_record(raw: dict, accession: str) -> bool:
    if not any(value is not None and str(value).strip() for value in raw.values()):
        return False
    if accession in {'PSI-98', 'PSI-100'}:
        return bool(re.fullmatch(r'S\d+', (field(raw, 'Sample Number') or '').strip(), re.I))
    if accession == 'PSI-99':
        return bool(re.fullmatch(r'2-\d+', (field(raw, 'Sample Number') or '').strip()))
    if accession == 'PSI-25':
        return field(raw, 'Test #') is not None
    if accession == 'PSI-69':
        return (field(raw, 'FLEX Test #') or '').strip().isdigit()
    if accession == 'PSI-20':
        return bool(re.fullmatch(r'\d{4}', (field(raw, 'Year') or '').strip()))
    first = next((str(v).strip() for v in raw.values() if v is not None and str(v).strip()), '')
    return not re.match(r'^(?:note\b|notes\b|nota\b|\(note\b)', first, re.I)


def label_for(raw: dict, accession: str, row_number: int) -> str:
    if accession == 'PSI-20':
        return 'Dia ' + '-'.join(field(raw, key) or '?' for key in ['Year', 'Month', 'Date'])
    identifier = field(raw, 'Test #', 'As Run Test #', 'FLEX Test #', 'SAME Test #', 'Sample Number', 'Sample #', 'Test Number', 'Test ID', 'Test', 'Sample', 'Data ID', 'Flex Number', 'Session Name')
    return identifier.strip() if identifier else f'Registro {row_number}'


def decode_csv(content: bytes) -> tuple[str, str]:
    try:
        return content.decode('utf-8-sig'), 'utf-8-sig'
    except UnicodeDecodeError:
        return content.decode('cp1252'), 'cp1252'


def parse_csv(content: bytes, accession: str, table_index: int, filename: str) -> tuple[list, list, list, str]:
    text, encoding = decode_csv(content)
    reader = csv.reader(io.StringIO(text))
    columns = next(reader, [])
    if not columns or len(set(columns)) != len(columns) or not any(columns):
        raise ValueError('Cabeçalho CSV vazio ou duplicado; importação ambígua recusada.')
    records, excluded = [], []
    for row_number, values in enumerate(reader, start=2):
        if not any(value.strip() for value in values):
            continue
        if len(values) > len(columns):
            raise ValueError(f'Linha {row_number} contém mais campos que o cabeçalho.')
        values = values + [''] * (len(columns) - len(values))
        raw = {key: (value if value != '' else None) for key, value in zip(columns, values)}
        if not row_is_record(raw, accession):
            excluded.append({'row': row_number, 'raw': raw})
            continue
        records.append({'id': f'{accession}:t{table_index}:r{row_number}', 'investigationId': accession,
                        'label': label_for(raw, accession, row_number), 'raw': raw,
                        'sourceFile': filename, 'sourceRow': row_number, **normalized(raw, accession)})
    return columns, records, excluded, encoding


def plain(value: object, limit: int = 1100) -> str:
    if not isinstance(value, str):
        return ''
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', value))).strip()[:limit]


def import_investigation(accession: str, offline: bool) -> tuple[dict, list, list]:
    fallback, category = CATALOG[accession]
    directory = RAW / accession
    metadata_path = directory / 'metadata.json'
    manifest_path = directory / 'manifest.json'
    old_manifest = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    entries, errors = [], []
    source = f'{API}/repo/investigations/{accession}'
    investigation = {'id': accession, 'name': fallback, 'title': fallback, 'platform': 'Não informado',
                     'category': category, 'description': '', 'sourceUrl': f'{PORTAL}/{accession}',
                     'doi': None, 'status': 'unavailable', 'testCount': 0, 'columns': [], 'tests': [],
                     'dataUrl': None, 'limitations': [], 'recordGrain': 'registros da tabela original'}
    try:
        if offline:
            metadata_bytes = metadata_path.read_bytes()
            if digest(metadata_bytes) != old_manifest['metadata']['sha256']:
                raise ValueError('Metadados locais divergiram do hash recuperado; refaça a sincronização online.')
            fetched_at = old_manifest['metadata']['retrievedAt']
        else:
            metadata_bytes = request(source, MAX_METADATA)
            fetched_at = now()
            json.loads(metadata_bytes)
            atomic_write(metadata_path, metadata_bytes)
        metadata = json.loads(metadata_bytes)
        if metadata.get('accession') != accession or metadata.get('restricted') is True:
            raise ValueError('Identificador divergente ou investigação restrita.')
        meta_evidence = {'sourceUrl': source, 'retrievedAt': fetched_at, 'sha256': digest(metadata_bytes),
                         'bytes': len(metadata_bytes), 'path': str(metadata_path.relative_to(ROOT)).replace('\\', '/')}
        investigation.update(name=plain(metadata.get('investigationAcronym')) or fallback,
                             title=plain(metadata.get('title')) or fallback,
                             description=plain(metadata.get('objective')) or plain(metadata.get('description')),
                             platform=plain(metadata.get('flightProgram')) or 'Não informado na fonte',
                             doi=metadata.get('doi') or None, status='metadata-only')
        if accession in {'PSI-20', 'PSI-21', 'PSI-22', 'PSI-23'}:
            investigation['recordGrain'] = 'resumos de sessões/dias de ignição em queimador a gás'
            investigation['limitations'].append('Linhas agregam sessões e contagens de chamas; não representam necessariamente ensaios individuais.')
        if accession == 'PSI-68':
            investigation['recordGrain'] = 'combustíveis e faixas de parâmetros, não ensaios individuais'
            investigation['limitations'].append('Tabela de faixas e listas de condições por combustível; não representa oito ensaios individuais. Intervalos não são substituídos por médias.')
        if accession == 'PSI-142':
            investigation['recordGrain'] = 'referências a conjuntos de dados e figuras'
            investigation['limitations'].append('As linhas desta tabela são referências a dados/figuras, não medições independentes.')
        if accession in {'PSI-98', 'PSI-100'}:
            investigation['limitations'].append('O campo de plataforma do catálogo PSI é preservado; não foi usado para inferir o local de cada ensaio Saffire.')
        if accession == 'PSI-117':
            investigation['limitations'].append('O PSI-117 atual é um estudo computacional de cool flames, não a tabela FLEX descrita na especificação inicial.')
        if accession == 'PSI-25':
            investigation['limitations'].append('A tabela não informa pressão, desfecho binário ou velocidade calibrada em cm/s. Fan display e Air display não foram tratados como velocidade.')
        if accession == 'PSI-69':
            investigation['limitations'].append('Ensaios de gotículas; não usar como rótulos de inflamabilidade ou propagação de materiais sólidos.')
        if accession == 'PSI-20':
            investigation['recordGrain'] = 'resumos diários de ignições em queimador a gás'
            investigation['limitations'].append('BRE usa misturas gasosas em queimadores; esta tabela resume dias e contagens de ignições, não atrasos de ignição de materiais sólidos. O₂ pode conter listas ou valores anômalos, preservados sem correção.')
        if accession in {'PSI-98', 'PSI-99', 'PSI-100'}:
            investigation['limitations'].append('Linhas de notas e visualização pré-ensaio foram excluídas da contagem; valores aproximados e intervalos de O₂ continuam no original e não viram um escalar.')
        tables = metadata.get('experimentalTable') or []
        csv_tables = [table for table in tables if table.get('file_name', '').lower().endswith('.csv') and not table.get('restricted') and table.get('visible', True)]
        for table_index, table in enumerate(csv_tables):
            filename = Path(table['file_name']).name
            if filename != table['file_name']:
                raise ValueError('Nome de arquivo não é um basename seguro.')
            stable_url = f'{API}/studies/{accession}/download?' + urlencode({'file': filename, 'version': table.get('version', 1), 'redirect': 'false'})
            csv_path = directory / filename
            try:
                if int(table.get('file_size') or 0) > MAX_TABLE:
                    raise ValueError('Tabela excede 2 MiB; importação ignorada.')
                if offline:
                    content = csv_path.read_bytes()
                    old = next(entry for entry in old_manifest.get('tables', []) if entry['filename'] == filename)
                    if digest(content) != old['sha256']:
                        raise ValueError('CSV local divergiu do hash recuperado; refaça a sincronização online.')
                    table_at = old['retrievedAt']
                else:
                    response = request(stable_url, MAX_TABLE)
                    if response.strip().startswith(b'https://'):
                        content = request(response.decode('utf-8').strip(), MAX_TABLE)
                    else:
                        content = response
                    table_at = now()
                columns, records, excluded, encoding = parse_csv(content, accession, table_index, filename)
                if not offline:
                    atomic_write(csv_path, content)
                entry = {'filename': filename, 'sourceUrl': stable_url, 'retrievedAt': table_at, 'sha256': digest(content),
                         'bytes': len(content), 'version': table.get('version', 1), 'encoding': encoding,
                         'recordsImported': len(records), 'excludedRows': excluded,
                         'path': str(csv_path.relative_to(ROOT)).replace('\\', '/')}
                entries.append(entry)
                investigation['tests'].extend(records)
                investigation['columns'] = list(dict.fromkeys(investigation['columns'] + columns))
                investigation['dataUrl'] = investigation['dataUrl'] or stable_url.replace('redirect=false', 'redirect=true')
                investigation['status'] = 'downloaded'
            except Exception as error:
                message = f'{filename}: {safe_error(error)}'
                errors.append({'id': accession, 'message': message})
                investigation['limitations'].append(message)
        investigation['testCount'] = len(investigation['tests'])
        if not csv_tables:
            investigation['limitations'].append('Sem tabela experimental CSV pública listada neste registro PSI. Metadados e referências permanecem disponíveis.')
        if investigation['tests']:
            investigation['limitations'].append('Contagem de registros tabulares, não de observações independentes. Desfechos não foram inventados; listas, intervalos e aproximações não são convertidos em condições escalares.')
        manifest = {'investigationId': accession, 'metadata': meta_evidence, 'tables': entries,
                    'normalization': 'raw preserva chaves/valores; apenas escalares explícitos, com conversão de unidade documentada', 'errors': errors}
        if not offline:
            atomic_write(manifest_path, json_bytes(manifest))
        return investigation, [meta_evidence, *entries], errors
    except Exception as error:
        message = safe_error(error)
        investigation['limitations'].append(message)
        return investigation, [], [{'id': accession, 'message': message}]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true', help='Rebuild from downloaded files without network access.')
    parser.add_argument('--ids', nargs='+', choices=list(CATALOG), default=list(CATALOG))
    args = parser.parse_args()
    investigations, sources, errors = [], [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for investigation, evidence, failures in pool.map(lambda id: import_investigation(id, args.offline), args.ids):
            investigations.append(investigation)
            sources.extend(evidence)
            errors.extend(failures)
            print(f"{investigation['id']}: {investigation['status']}, {investigation['testCount']} registros", flush=True)
    count = sum(len(i['tests']) for i in investigations)
    if errors:
        print('Importação incompleta ou verificação falhou; snapshot público anterior preservado.', file=sys.stderr)
        return 1
    if count == 0:
        print('Nenhum registro recuperado; snapshot anterior preservado.', file=sys.stderr)
        return 1
    timestamp = max(source['retrievedAt'] for source in sources)
    snapshot = {'schemaVersion': 1, 'retrievedAt': timestamp, 'source': 'NASA Physical Sciences Informatics (PSI)',
                'investigations': investigations, 'errors': errors}
    PUBLIC.mkdir(parents=True, exist_ok=True)
    atomic_write(PUBLIC / 'nasa-experiments.json', json_bytes(snapshot))
    atomic_write(PUBLIC / 'nasa-provenance.json', json_bytes({'generatedAt': now(), 'sourceRetrievedAt': timestamp,
                 'offlineRebuild': args.offline, 'sources': sources, 'errors': errors}))
    print(json.dumps({'investigations': len(investigations), 'records': count,
                      'downloaded': sum(i['status'] == 'downloaded' for i in investigations),
                      'errors': len(errors), 'snapshot': str(PUBLIC / 'nasa-experiments.json')}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
