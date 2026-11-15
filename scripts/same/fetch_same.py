"""Download selected public PSI-102 (SAME) files into data/cache/same/ and record them in data/same/docs-manifest.json.

    python scripts/same/fetch_same.py --list                      # catalogue from the local metadata.json (no network)
    python scripts/same/fetch_same.py docs                        # the priority documents
    python scripts/same/fetch_same.py files "NAME" ["NAME" ...]   # explicit PSI-102 file names
    python scripts/same/fetch_same.py --verify                    # re-hash the cache against the manifest

Rules (authorisation of the SAME P0/P1 phase):
- only files listed as public and visible in data/raw/psi/PSI-102/metadata.json (PSI-101 is never fetched here);
- combined ceiling of 120 MB over everything recorded in the manifest, checked before any byte moves;
- no video (.mp4), no image collection or large archive (.zip, other than the 13-kB metadata archive);
- resumable (HTTP Range on a .part file) and atomic (rename after the size check); SHA-256 of every file;
- the signed S3 URL returned by the PSI endpoint is never written to disk.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
ACCESSION = 'PSI-102'
METADATA = ROOT / 'data/raw/psi' / ACCESSION / 'metadata.json'
CACHE = ROOT / 'data/cache/same'
MANIFEST = ROOT / 'data/same/docs-manifest.json'
API = 'https://psi.nasa.gov/geode-py/ws/studies'
PORTAL = 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-102'
HOSTS = {'psi.nasa.gov', 'psi-repo-prod.s3.amazonaws.com', 'psi-curation-prod.s3.amazonaws.com'}
AGENT = {'User-Agent': 'psi-public-file-fetch/1.0'}
BUDGET = 120_000_000
BLOCKED_SUFFIXES = ('.mp4', '.mov', '.avi', '.zip')
ALLOWED_ZIPS = ('PSI-102_metadata_PSI-170_SAME.zip',)
DOCUMENTS = (
    'PSI-102_Reports_SAME_Final Science Report.pdf',
    'PSI-102_Science Documents_SAME_Operations Manual_007.pdf',
    'PSI-102_Science Documents_SAME_Baseline Concept Description Doc.pdf',
    'PSI-102_Reference Data_SAME_Software Description Document.pdf',
    'PSI-102_metadata_PSI-170_SAME.zip',
    'PSI-102_Analyzed Data_Run 1 GMT252 testlog.xls',
    'PSI-102_Analyzed Data_Run 2 GMT254 testlog.xlsx',
    'PSI-102_Analyzed Data_Run 2 GMT254 testlog b.xlsx',
    'PSI-102_Analyzed Data_GMT255 log.xlsx',
    'PSI-102_Analyzed Data_GMT256LOG.xlsx',
    'PSI-102_Analyzed Data_GMT267silicon test 23 and 24 log.xlsx',
)
KINDS = {'.pdf': 'document', '.doc': 'document', '.ppt': 'presentation', '.pptx': 'presentation',
         '.xls': 'spreadsheet', '.xlsx': 'spreadsheet', '.zip': 'metadata-archive', '.xml': 'xml'}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def allowed(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == 'https' and parsed.hostname in HOSTS


def catalog() -> dict[str, dict]:
    """Public, visible PSI-102 files of the local metadata.json, by file name."""
    metadata = json.loads(METADATA.read_text(encoding='utf-8'))
    if metadata.get('accession') != ACCESSION:
        raise ValueError('metadata.json não é do PSI-102')
    files = {}
    for item in metadata.get('added') or []:
        if item.get('visible', True) and not item.get('restricted') and f'/psi-data/{ACCESSION}/' in item.get('remote_path', ''):
            files[item['file_name']] = item
    return files


def category(item: dict) -> str:
    """PSI folder of the file (Analyzed Data, Reports, ...)."""
    parts = item['remote_path'].split('/')
    return parts[4] if len(parts) > 5 else ''


def refusal(name: str, item: dict | None) -> str | None:
    if item is None:
        return 'ausente, restrito ou oculto em data/raw/psi/PSI-102/metadata.json'
    if Path(name).name != name:
        return 'nome de arquivo não é um basename seguro'
    lower = name.lower()
    if lower.endswith(BLOCKED_SUFFIXES) and name not in ALLOWED_ZIPS:
        return 'vídeo ou arquivo compactado grande: fora da autorização desta fase'
    if int(item.get('file_size') or 0) <= 0:
        return 'tamanho 0 no catálogo (entrada sem conteúdo)'
    return None


def stable_url(name: str, version: int) -> str:
    return f'{API}/{ACCESSION}/download?' + urlencode({'file': name, 'version': version, 'redirect': 'false'})


def download(url: str, target: Path, expected: int) -> None:
    """Resolve the stable endpoint to its signed URL and stream it to target atomically (resumable)."""
    if not allowed(url):
        raise ValueError('origem fora do repositório público PSI')
    with urlopen(Request(url, headers=AGENT), timeout=40) as response:
        if not allowed(response.url):
            raise ValueError('redirecionamento fora do repositório público PSI')
        signed = response.read(32768).decode('utf-8', errors='replace').strip()
    if not allowed(signed):
        raise ValueError('o serviço não devolveu um endereço PSI válido')
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + '.part')
    offset = partial.stat().st_size if partial.exists() else 0
    if offset >= expected:
        offset = 0
    headers = {**AGENT, 'Range': f'bytes={offset}-'} if offset else AGENT
    with urlopen(Request(signed, headers=headers), timeout=90) as response:
        if not allowed(response.url):
            raise ValueError('redirecionamento fora do repositório público PSI')
        resumed = offset > 0 and response.status == 206
        if resumed and response.headers.get('Content-Range') != f'bytes {offset}-{expected - 1}/{expected}':
            raise ValueError('intervalo de retomada inesperado')
        declared = response.headers.get('Content-Length')
        remaining = expected - offset if resumed else expected
        if declared is not None and int(declared) != remaining:
            raise ValueError(f'tamanho HTTP {declared} difere do catálogo {remaining}')
        received = offset if resumed else 0
        with partial.open('ab' if resumed else 'wb') as out:
            while chunk := response.read(1024 * 1024):
                received += len(chunk)
                if received > expected:
                    raise ValueError('arquivo excede o tamanho informado pelo catálogo')
                out.write(chunk)
    if received != expected:
        raise ValueError(f'download incompleto: {received} de {expected} bytes; execute de novo para retomar')
    partial.replace(target)


def reason(error: Exception) -> str:
    # Signed URLs and their query credentials must never reach the manifest.
    if isinstance(error, HTTPError):
        return f'HTTP {error.code}'
    if isinstance(error, URLError):
        return f'falha de rede: {type(error.reason).__name__}'
    return f'{type(error).__name__}: {str(error).split("https://")[0][:160]}'


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=path.name + '.', suffix='.tmp', delete=False) as handle:
        handle.write(data)
        temporary = Path(handle.name)
    try:
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def load_manifest() -> dict:
    return json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}


def fetch(names: list[str]) -> dict:
    files = catalog()
    previous = load_manifest()
    entries = {entry['fileName']: entry for entry in previous.get('files', [])}
    refused = {entry['fileName']: entry for entry in previous.get('refused', [])}
    used = sum(entry['bytes'] for entry in entries.values())
    for name in names:
        item = files.get(name)
        why = refusal(name, item)
        if why:
            refused[name] = {'fileName': name, 'reason': why}
            print(f'recusado: {name}: {why}')
            continue
        expected = int(item['file_size'])
        target = CACHE / category(item) / name
        if name in entries and target.exists() and sha256(target) == entries[name]['sha256']:
            print(f'já presente: {name}')
            continue
        if used + expected > BUDGET:
            refused[name] = {'fileName': name, 'reason': f'excederia o limite combinado de {BUDGET} bytes ({used} já usados)'}
            print(f'recusado: {name}: limite')
            continue
        url = stable_url(name, int(item.get('version') or 1))
        try:
            if not (target.exists() and target.stat().st_size == expected):
                download(url, target, expected)
        except Exception as error:  # noqa: BLE001 - recorded, never fatal for the other files
            refused[name] = {'fileName': name, 'reason': reason(error)}
            print(f'falhou: {name}: {reason(error)}')
            continue
        refused.pop(name, None)
        entries[name] = {
            'fileName': name, 'psiFolder': category(item), 'kind': KINDS.get(Path(name).suffix.lower(), 'other'),
            'bytes': expected, 'sha256': sha256(target), 'psiVersion': int(item.get('version') or 1),
            'psiDateModified': datetime.fromtimestamp(item['date_modified']['$date'] / 1000, timezone.utc).date().isoformat()
            if isinstance(item.get('date_modified'), dict) else None,
            'sourceUrl': url, 'retrievedAt': now(),
            'cachePath': target.relative_to(ROOT).as_posix(),
        }
        used += expected
        print(f'baixado: {name} ({expected} bytes)')
    manifest = {
        'investigationId': ACCESSION, 'acronym': 'SAME', 'doi': '10.60555/gd4k-8h62', 'portal': PORTAL,
        'source': 'NASA Physical Sciences Informatics (PSI), arquivos públicos listados em data/raw/psi/PSI-102/metadata.json',
        'metadataSha256': sha256(METADATA), 'budgetBytes': BUDGET,
        'usedBytes': sum(entry['bytes'] for entry in entries.values()),
        'cacheNote': 'Originais em data/cache/same/ (ignorado pelo Git); este manifesto é a única parte versionada.',
        'files': sorted(entries.values(), key=lambda entry: (entry['psiFolder'], entry['fileName'])),
        'refused': sorted(refused.values(), key=lambda entry: entry['fileName']),
    }
    write_json(MANIFEST, manifest)
    return manifest


def verify() -> int:
    bad = 0
    for entry in load_manifest().get('files', []):
        path = ROOT / entry['cachePath']
        status = 'ok' if path.exists() and sha256(path) == entry['sha256'] else 'AUSENTE/DIVERGENTE'
        bad += status != 'ok'
        print(f'{status}: {entry["fileName"]}')
    return 1 if bad else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('kind', nargs='?', choices=('docs', 'files'))
    parser.add_argument('names', nargs='*')
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.list:
        for name, item in sorted(catalog().items(), key=lambda pair: (category(pair[1]), pair[0])):
            print(f'{int(item["file_size"]):>11}  {category(item):<22} {name}  {refusal(name, item) or ""}')
        return 0
    if args.verify:
        return verify()
    if args.kind == 'docs':
        fetch(list(DOCUMENTS))
    elif args.kind == 'files' and args.names:
        fetch(args.names)
    else:
        parser.error('informe docs, files NOME..., --list ou --verify')
    return 0


if __name__ == '__main__':
    sys.exit(main())
