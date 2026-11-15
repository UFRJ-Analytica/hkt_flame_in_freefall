"""Fetch a small, explicitly named set of public PSI-25 (BASS-II) files into the local cache.

Nothing is downloaded unless it is named on the command line (or is one of the seven
documents below), is listed as public in data/raw/psi/PSI-25/metadata.json, and fits
the byte budget of its kind. Files go to data/cache/bass2/ (ignored by Git); only the
manifest with name, stable endpoint, size, retrieval time and SHA-256 is versioned.
The short-lived signed S3 URL is used in memory and never written anywhere.

    python scripts/bass2/fetch_bass2.py docs
    python scripts/bass2/fetch_bass2.py videos "PSI-25_Raw Data_BASS_GMT178_SAMPLE_135_TEST_T11.mp4"
    python scripts/bass2/fetch_bass2.py docs --verify      # re-hash the cache, no network
    python scripts/bass2/fetch_bass2.py b1 "PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1_Still_Sequence.mp4"
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
ACCESSION = 'PSI-25'
METADATA = ROOT / 'data/raw/psi' / ACCESSION / 'metadata.json'
CACHE = ROOT / 'data/cache/bass2'
MANIFESTS = ROOT / 'data/bass2'
API = 'https://psi.nasa.gov/geode-py/ws/studies'
HOSTS = {'psi.nasa.gov', 'psi-repo-prod.s3.amazonaws.com', 'psi-curation-prod.s3.amazonaws.com'}
AGENT = {'User-Agent': 'psi-public-file-fetch/1.0'}
DOCUMENTS = (
    'PSI-25_Reference Data_Fan calibration data.xlsx',
    'PSI-25_Science Documents_BASS-II_ReadMe.docx',
    'PSI-25_Science Documents_BASS-II_Test.Matrices.xlsx',
    'PSI-25_Science Documents_BASS-II_SRD.pdf',
    'PSI-25_Engineering Documents_BASS-II_Ops.docx',
    'PSI-25_Engineering Documents_BASS-II_Engineering Requirements.pptx',
    'PSI-25_Reports_BASS-II Summary Report.pdf',
)
# Hard ceilings per kind; a request that would cross one is refused before any byte moves.
# "b1": supplementary files of test B1 (top-view still sequence, original-videos ZIP), 20 MB authorised.
BUDGET = {'docs': 60 * 1024 * 1024, 'videos': 60 * 1024 * 1024, 'b1': 20_000_000}
SUFFIXES = {'videos': ('.mp4',), 'b1': ('.mp4', '.zip', '.pdf')}
# B1 supplements must name the B1 run explicitly (GMT 50, sample 147, test B1), in either naming scheme.
REQUIRED_TOKENS = {'b1': ('SAMPLE_147_TEST_B1', 'GMT2014_050_BASS_S147M_TPB1')}
# Per-file ceiling inside a kind (the P3 authorisation covers the B1 proof sheet only if under 1 MB).
FILE_LIMITS = {'b1': {'.pdf': 1_000_000}}
MANIFEST_PATHS = {'b1': MANIFESTS / 'b1' / 'supplements-manifest.json'}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def allowed(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == 'https' and parsed.hostname in HOSTS


def catalog() -> dict[str, dict]:
    """Public, visible files of the already synchronised PSI-25 metadata, by file name."""
    metadata = json.loads(METADATA.read_text(encoding='utf-8'))
    removed = {item['file_name'] for item in metadata.get('removed') or []}
    files = {}
    for item in metadata.get('added') or []:
        if item.get('visible') and not item.get('restricted'):
            files[item['file_name']] = item
    # The PSI change log lists some names under both "added" and "removed"; the listing
    # order alone does not say which is current, so the download itself is the test.
    return {name: {**item, 'alsoListedAsRemoved': name in removed} for name, item in files.items()}


def stable_url(name: str, version: int) -> str:
    return f'{API}/{ACCESSION}/download?' + urlencode({'file': name, 'version': version, 'redirect': 'false'})


def download(url: str, target: Path, expected: int) -> None:
    """Resolve the stable endpoint to its signed URL and stream it to target atomically."""
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
    # Resume an interrupted download when the server honours the byte range; otherwise start over.
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
        # The partial file is kept so that the next run can resume with a Range request.
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
    Path(handle.name).replace(path)


def fetch(kind: str, names: list[str], verify_only: bool) -> dict:
    files = catalog()
    directory = CACHE / kind
    manifest_path = MANIFEST_PATHS.get(kind, MANIFESTS / f'{kind}-manifest.json')
    previous = json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    known = {entry['name']: entry for entry in previous.get('files', [])}
    # Earlier downloads of this kind stay in the manifest and count against the budget.
    wanted = list(dict.fromkeys([*known, *names]))
    total = sum(int(float(files[name]['file_size'])) for name in wanted if name in files)
    if total > BUDGET[kind]:
        raise SystemExit(f'Recusado: {total} bytes pedidos excedem o limite de {BUDGET[kind]} para {kind}.')
    entries = []
    for name in wanted:
        item = files.get(name)
        if item is None:
            entries.append({'name': name, 'status': 'not-listed',
                            'reason': 'ausente, restrito ou oculto em data/raw/psi/PSI-25/metadata.json'})
            continue
        expected = int(float(item['file_size']))
        version = item.get('version', 1)
        entry = {
            'name': name, 'investigationId': ACCESSION,
            'psiResourceId': (item.get('resource_id') or {}).get('$oid'),
            'psiFolder': Path(item.get('remote_path', '')).parent.name,
            's3Path': item.get('s3_path'), 'version': version,
            'sourceUrl': stable_url(name, version), 'catalogBytes': expected,
            'path': (directory / name).relative_to(ROOT).as_posix(),
        }
        target = directory / name
        old = known.get(name, {})
        try:
            if kind in SUFFIXES and not name.lower().endswith(SUFFIXES[kind]):
                raise ValueError(f'tipo de arquivo não autorizado para {kind}: {", ".join(SUFFIXES[kind])}')
            tokens = REQUIRED_TOKENS.get(kind, ())
            if tokens and not any(token in name for token in tokens):
                raise ValueError(f'arquivo não pertence ao conjunto autorizado para {kind}')
            limit = FILE_LIMITS.get(kind, {}).get(Path(name).suffix.lower())
            if limit is not None and expected > limit:
                raise ValueError(f'arquivo de {expected} bytes excede o limite de {limit} bytes autorizado')
            intact = target.is_file() and target.stat().st_size == expected and (
                'sha256' not in old or sha256(target) == old['sha256'])
            if target.is_file() and not intact:
                entry['integrityNote'] = 'cópia local divergia do tamanho ou do hash registrado; substituída'
            if not intact:
                if verify_only:
                    raise ValueError('cópia local ausente ou divergente (modo --verify, sem rede)')
                download(entry['sourceUrl'], target, expected)
                entry['retrievedAt'] = now()
            else:
                entry['retrievedAt'] = old.get('retrievedAt') or now()
            entry.update(status='available', bytes=target.stat().st_size, sha256=sha256(target))
        except (OSError, ValueError, HTTPError, URLError) as error:
            entry.update(status='error', reason=reason(error))
        entries.append(entry)
        print(f"{entry['status']:10} {name} {entry.get('reason', '')}", flush=True)
    manifest = {
        'schemaVersion': 1, 'investigationId': ACCESSION, 'kind': kind,
        'source': 'NASA Physical Sciences Informatics (PSI), arquivos públicos listados no metadata.json local',
        'portalUrl': f'https://psi.nasa.gov/physci/repo/data/investigations/{ACCESSION}',
        'budgetBytes': BUDGET[kind],
        'totalBytes': sum(entry.get('bytes', 0) for entry in entries),
        'note': 'Os arquivos ficam em data/cache/bass2/ (fora do Git). URLs assinadas temporárias não são gravadas.',
        'files': entries,
    }
    write_json(manifest_path, manifest)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('kind', choices=sorted(BUDGET))
    parser.add_argument('files', nargs='*', help='nomes exatos do metadata.json (obrigatório para videos)')
    parser.add_argument('--verify', action='store_true', help='apenas confere tamanho e hash do cache, sem rede')
    args = parser.parse_args()
    names = list(args.files) or (list(DOCUMENTS) if args.kind == 'docs' else [])
    if not names and not args.verify:
        parser.error('informe os nomes exatos dos vídeos piloto')
    manifest = fetch(args.kind, names, args.verify)
    return int(any(entry['status'] != 'available' for entry in manifest['files']))


if __name__ == '__main__':
    sys.exit(main())
