"""Download the public SoFIE documents identified in P0 into data/cache/sofie/ and record them in data/sofie/docs-manifest.json.

    python scripts/sofie/fetch_sofie.py --list     # catalogue (no network)
    python scripts/sofie/fetch_sofie.py docs       # every catalogued document and public image
    python scripts/sofie/fetch_sofie.py video      # the pilot video only (separate 50 MB authorisation)
    python scripts/sofie/fetch_sofie.py --verify   # re-hash the cache against the manifest

Why a fixed catalogue: no SoFIE investigation is public on NASA PSI (see docs/research/SOFIE_DATA_REVIEW.md), so the
sources are NASA NTRS records, the open-access institutional copy of the SoFIE-GEL journal paper and the NASA Image and
Video Library (images-assets.nasa.gov). Each entry names its origin; nothing is fetched outside the allowed hosts.
Combined ceiling: 120 MB of documents and images; one pilot video of at most 50 MB is a separate authorisation.
Resumable (.part + HTTP Range), atomic rename after the size check, SHA-256 per file.
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
from urllib.parse import urlparse
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'data/cache/sofie'
MANIFEST = ROOT / 'data/sofie/docs-manifest.json'
HOSTS = {'ntrs.nasa.gov', 'commons.case.edu', 'images-assets.nasa.gov'}
AGENT = {'User-Agent': 'public-document-fetch/1.0'}
BUDGET = 120_000_000
FILE_LIMIT = 40_000_000
VIDEO_LIMIT = 50_000_000
MAGIC = {'.pdf': (b'%PDF',), '.jpg': (b'\xff\xd8\xff',), '.mp4': (b'ftyp',), '.json': (b'{',)}
CATALOGUE = [
    {'id': 'gel-cnf-2025', 'investigation': 'SoFIE-GEL', 'kind': 'journal-paper',
     'title': 'Experimental Determination of Diffusion Flame Extinction Boundaries Over A PMMA Sphere: The Effect of Sub-Surface Solid Heating',
     'citation': "T'ien J.S., Li C., Ferkul P.V., Olson S.L., Johnston M.C., Combustion and Flame 277 (2025) 114244",
     'doi': '10.1016/j.combustflame.2025.114244', 'license': 'CC BY-NC-ND 4.0 (final publisher version, institutional repository)',
     'landing': 'https://commons.case.edu/facultyworks/1290',
     'url': 'https://commons.case.edu/cgi/viewcontent.cgi?article=2299&context=facultyworks', 'file': 'GEL_CNF2025_114244.pdf'},
    {'id': 'gel-symposium-2024', 'investigation': 'SoFIE-GEL', 'kind': 'conference-paper',
     'title': 'Extinction of Solid Diffusion Flame in Microgravity: Details of Quenching and Blowoff Processes',
     'citation': 'NASA NTRS 20240007628', 'landing': 'https://ntrs.nasa.gov/citations/20240007628',
     'url': 'https://ntrs.nasa.gov/api/citations/20240007628/downloads/GELsymposiumfinalRev1.pdf', 'file': 'NTRS-20240007628_GELsymposiumfinalRev1.pdf'},
    {'id': 'sofie-design-2019', 'investigation': 'SoFIE (facility)', 'kind': 'presentation',
     'title': 'SoFIE Design/Status', 'citation': 'NASA NTRS 20190030735', 'landing': 'https://ntrs.nasa.gov/citations/20190030735',
     'url': 'https://ntrs.nasa.gov/api/citations/20190030735/downloads/20190030735.pdf', 'file': 'NTRS-20190030735.pdf'},
    {'id': 'sofie-project-2019', 'investigation': 'SoFIE (facility)', 'kind': 'presentation',
     'title': 'Solid Fuel Ignition and Extinction (SoFIE) Project on ISS', 'citation': 'NASA NTRS 20200000361',
     'landing': 'https://ntrs.nasa.gov/citations/20200000361',
     'url': 'https://ntrs.nasa.gov/api/citations/20200000361/downloads/20200000361.pdf', 'file': 'NTRS-20200000361.pdf'},
    {'id': 'nca-2013', 'investigation': 'SoFIE-NCA (ground)', 'kind': 'conference-paper',
     'title': 'Opposed-Flow Flame Spread in a Narrow Channel Apparatus over Thin PMMA Sheets', 'citation': 'NASA NTRS 20140004923',
     'landing': 'https://ntrs.nasa.gov/citations/20140004923',
     'url': 'https://ntrs.nasa.gov/api/citations/20140004923/downloads/20140004923.pdf', 'file': 'NTRS-20140004923.pdf'},
    {'id': 'img-gel-first-test', 'investigation': 'SoFIE-GEL', 'kind': 'image',
     'title': 'jsc2023e002281: first GEL test, 13 Jan 2023 (4-cm sphere, 17.5 % O2, 20 cm/s right to left)',
     'citation': 'NASA Image and Video Library jsc2023e002281', 'landing': 'https://images.nasa.gov/details/jsc2023e002281',
     'url': 'https://images-assets.nasa.gov/image/jsc2023e002281/jsc2023e002281~orig.jpg', 'file': 'media/jsc2023e002281_orig.jpg'},
    {'id': 'img-gel-pressure-montage', 'investigation': 'SoFIE-GEL', 'kind': 'image',
     'title': 'jsc2023e013681: snapshots ~3 s apart, 28 % O2, extinction by pressure reduction (9 Mar 2023)',
     'citation': 'NASA Image and Video Library jsc2023e013681', 'landing': 'https://images.nasa.gov/details/jsc2023e013681',
     'url': 'https://images-assets.nasa.gov/image/jsc2023e013681/jsc2023e013681~orig.jpg', 'file': 'media/jsc2023e013681_orig.jpg'},
    {'id': 'img-gel-led', 'investigation': 'SoFIE-GEL', 'kind': 'image',
     'title': 'jsc2024e021222: GEL test image just before extinction with the green LED on (fuel surface visible)',
     'citation': 'NASA Image and Video Library jsc 2024e021222', 'landing': 'https://images.nasa.gov/details/jsc 2024e021222',
     'url': 'https://images-assets.nasa.gov/image/jsc%202024e021222/jsc%202024e021222~orig.jpg', 'file': 'media/jsc2024e021222_orig.jpg'},
    {'id': 'video-gel-1410c-metadata', 'investigation': 'SoFIE-GEL', 'kind': 'media-metadata',
     'title': 'Technical metadata (exiftool/XMP) of the public SoFIE-GEL video; ingredient "1410C with Interstellar theme.mp4"',
     'citation': 'NASA Image and Video Library SoFIE-GEL', 'landing': 'https://images.nasa.gov/details/SoFIE-GEL',
     'url': 'https://images-assets.nasa.gov/video/SoFIE-GEL/metadata.json', 'file': 'media/SoFIE-GEL_metadata.json'},
]
VIDEO = {'id': 'video-gel-1410c', 'investigation': 'SoFIE-GEL', 'kind': 'video',
         'title': 'SoFIE-GEL - flame appearing to spin itself into extinction (public release, 5 May 2023)',
         'citation': 'NASA Image and Video Library SoFIE-GEL (~large derivative; ~orig is 59 451 335 bytes, above the 50 MB cap)',
         'landing': 'https://images.nasa.gov/details/SoFIE-GEL',
         'associatedTest': '1410C (XMP ingredient file name "1410C with Interstellar theme.mp4"; Case 5 of NTRS 20240007628)',
         'url': 'https://images-assets.nasa.gov/video/SoFIE-GEL/SoFIE-GEL~large.mp4', 'file': 'media/SoFIE-GEL_large.mp4'}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def allowed(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == 'https' and parsed.hostname in HOSTS


def download(url: str, target: Path, limit: int = FILE_LIMIT) -> int:
    """Stream url to target through a resumable .part file; returns the size. Refuses redirects off the allowed hosts."""
    if not allowed(url):
        raise ValueError('origem fora das fontes autorizadas')
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + '.part')
    offset = partial.stat().st_size if partial.exists() else 0
    headers = {**AGENT, 'Range': f'bytes={offset}-'} if offset else AGENT
    with urlopen(Request(url, headers=headers), timeout=90) as response:
        if not allowed(response.url):
            raise ValueError('redirecionamento fora das fontes autorizadas')
        resumed = offset > 0 and response.status == 206
        declared = response.headers.get('Content-Length')
        total = (offset if resumed else 0) + int(declared) if declared else None
        if total is not None and total > limit:
            raise ValueError(f'arquivo de {total} bytes excede o limite por arquivo')
        received = offset if resumed else 0
        with partial.open('ab' if resumed else 'wb') as out:
            while chunk := response.read(1024 * 1024):
                received += len(chunk)
                if received > limit:
                    raise ValueError('arquivo excede o limite por arquivo')
                out.write(chunk)
    if total is not None and received != total:
        raise ValueError(f'download incompleto: {received} de {total} bytes; execute de novo para retomar')
    with partial.open('rb') as stream:
        head = stream.read(16)
    expected = MAGIC.get(target.suffix.lower(), ())
    if expected and not any(magic in head for magic in expected):
        raise ValueError(f'conteúdo recebido não corresponde a {target.suffix}')
    partial.replace(target)
    return received


def reason(error: Exception) -> str:
    if isinstance(error, HTTPError):
        return f'HTTP {error.code}'
    if isinstance(error, URLError):
        return f'falha de rede: {type(error.reason).__name__}'
    return f'{type(error).__name__}: {str(error)[:160]}'


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


def fetch(items: list[dict], video: bool = False) -> dict:
    previous = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}
    entries = {entry['id']: entry for entry in previous.get('files', [])}
    # Failures of earlier runs are kept until that item is downloaded successfully.
    failures = {entry['id']: entry for entry in previous.get('failures', [])}
    used = sum(entry['bytes'] for entry in entries.values() if entry['kind'] != 'video')
    for item in items:
        target = CACHE / item['file']
        if item['id'] in entries and target.exists() and sha256(target) == entries[item['id']]['sha256']:
            print(f'já presente: {item["file"]}')
            continue
        try:
            size = download(item['url'], target, VIDEO_LIMIT if video else FILE_LIMIT)
        except Exception as error:  # noqa: BLE001 - recorded per file
            failures[item['id']] = {'id': item['id'], 'url': item['url'], 'landing': item.get('landing'),
                                    'reason': reason(error), 'attemptedAt': now()}
            print(f'falhou: {item["file"]}: {reason(error)}')
            continue
        if not video and used + size > BUDGET:
            target.unlink()
            failures[item['id']] = {'id': item['id'], 'url': item['url'], 'reason': 'excederia o limite combinado de 120 MB'}
            continue
        failures.pop(item['id'], None)
        used += 0 if video else size
        entries[item['id']] = {**{k: v for k, v in item.items() if k != 'file'}, 'fileName': item['file'], 'bytes': size,
                               'sha256': sha256(target), 'retrievedAt': now(),
                               'cachePath': target.relative_to(ROOT).as_posix()}
        print(f'baixado: {item["file"]} ({size} bytes)')
    video_entry = entries.get(VIDEO['id'])
    manifest = {
        'program': 'SoFIE (Solid Fuel Ignition and Extinction)', 'priority': 'SoFIE-GEL',
        'psiStatus': ('Nenhuma investigação SoFIE pública no NASA PSI em 2026-11-15 (busca no índice e consulta direta '
                      'aos metadados PSI-1 a PSI-230); fontes desta fase: NTRS e repositório institucional (artigo em acesso aberto).'),
        'budgetBytes': BUDGET, 'usedBytes': sum(entry['bytes'] for entry in entries.values() if entry['kind'] != 'video'),
        'videoBudgetBytes': VIDEO_LIMIT, 'videoDownloaded': video_entry['fileName'] if video_entry else None,
        'videoNote': ('Vídeo piloto: versão pública editada (Adobe Premiere, trilha sonora) do teste 1410C; associação pelo '
                      'nome do arquivo-fonte nos metadados XMP. Derivado ~large usado porque o ~orig excede 50 MB.'),
        'cacheNote': 'Originais em data/cache/sofie/ (ignorado pelo Git); este manifesto é a única parte versionada.',
        'files': sorted(entries.values(), key=lambda entry: entry['id']),
        'failures': sorted(failures.values(), key=lambda entry: entry['id']),
    }
    write_json(MANIFEST, manifest)
    return manifest


def verify() -> int:
    bad = 0
    for entry in json.loads(MANIFEST.read_text(encoding='utf-8')).get('files', []):
        path = ROOT / entry['cachePath']
        ok = path.exists() and sha256(path) == entry['sha256']
        bad += not ok
        print(('ok' if ok else 'AUSENTE/DIVERGENTE') + f': {entry["fileName"]}')
    return 1 if bad else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('kind', nargs='?', choices=('docs', 'video'))
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.list:
        for item in CATALOGUE:
            print(f"{item['id']:<20} {item['investigation']:<18} {item['url']}")
        return 0
    if args.verify:
        return verify()
    if args.kind == 'docs':
        fetch(CATALOGUE)
        return 0
    if args.kind == 'video':
        fetch([VIDEO], video=True)
        return 0
    parser.error('informe docs, --list ou --verify')
    return 2


if __name__ == '__main__':
    sys.exit(main())
