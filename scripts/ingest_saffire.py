"""Cache public PSI assets and create a versioned manifest for a SAFFIRE run."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen
from zipfile import BadZipFile, ZipFile

from sync_nasa import API, RAW, ROOT, atomic_write, json_bytes

CACHE = ROOT / 'data/cache/saffire'
RUN = 'PSI-98:t0:r2'
SLUG = 'psi-98-s1'
MANIFEST = ROOT / f'data/saffire/{SLUG}/manifest.json'
REPORT = 'https://ntrs.nasa.gov/citations/20180005168'
FRAME = re.compile(r'^Mapped_(S1C[12])-(\d{13})\.jpe?g$', re.I)
CAMERA_PACKAGE = re.compile(r'_(S1C[12])_JPEG_Mapped_part\d+\.zip$', re.I)
DOCUMENTS = ('Image Directory Nomenclature', 'ImageFrameSizes_ROI_Offsets',
             'Thermocouple Placement', 'Sample 1 Sensor Data')


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def archive_frames(path: Path, camera: str) -> list[tuple[int, str]]:
    with ZipFile(path) as archive:
        frames = []
        for entry in archive.infolist():
            match = FRAME.fullmatch(Path(entry.filename).name)
            if match and match[1].upper() == camera and not entry.filename.startswith('__MACOSX/'):
                frames.append((int(match[2]), entry.filename))
    if not frames:
        raise ValueError(f'{path.name}: nenhum JPEG mapeado de {camera}')
    return sorted(frames)


def on_allowed_host(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == 'https' and parsed.hostname in {
        'psi.nasa.gov', 'psi-repo-prod.s3.amazonaws.com', 'psi-curation-prod.s3.amazonaws.com',
    }


def fetch(url: str, target: Path, expected_size: int) -> None:
    if not on_allowed_host(url):
        raise ValueError('Origem fora do repositório público PSI')
    with urlopen(url, timeout=30) as response:
        if not on_allowed_host(response.url):
            raise ValueError('Redirecionamento fora do repositório público PSI')
        signed = response.read(32768).decode('utf-8').strip()
    if not on_allowed_host(signed):
        raise ValueError('Origem do arquivo fora do repositório público PSI')
    partial = target.with_suffix(target.suffix + '.part')
    offset = partial.stat().st_size if partial.exists() else 0
    if offset >= expected_size:
        offset = 0
    headers = {'Range': f'bytes={offset}-'} if offset else {}
    with urlopen(Request(signed, headers=headers), timeout=60) as response:
        if not on_allowed_host(response.url):
            raise ValueError('Redirecionamento fora do repositório público PSI')
        resume = response.status == 206
        if resume and response.headers.get('Content-Range') != f'bytes {offset}-{expected_size - 1}/{expected_size}':
            raise ValueError('Intervalo de download inesperado')
        with partial.open('ab' if resume else 'wb') as out:
            remaining = expected_size - (offset if resume else 0)
            while chunk := response.read(1024 * 1024):
                remaining -= len(chunk)
                if remaining < 0:
                    raise ValueError('Arquivo excede o tamanho informado pelo catálogo')
                out.write(chunk)
    if partial.stat().st_size != expected_size:
        raise ValueError('Download incompleto; execute novamente para retomar')
    partial.replace(target)


def inventory(offline: bool, import_dir: Path | None) -> dict:
    accession = RUN.split(':')[0]
    metadata = json.loads((RAW / accession / 'metadata.json').read_bytes())
    previous = json.loads(MANIFEST.read_bytes()) if MANIFEST.exists() else {}
    verified = {asset['name']: asset['sha256'] for asset in previous.get('assets', []) if 'sha256' in asset}
    catalog = [
        asset for asset in metadata['added']
        if asset['visible'] and not asset['restricted']
        and (CAMERA_PACKAGE.search(asset['file_name']) or any(
            name in asset['file_name'] for name in DOCUMENTS
        ))
    ]
    directory = CACHE / SLUG
    directory.mkdir(parents=True, exist_ok=True)

    def prepare(asset: dict) -> dict:
        name = asset['file_name']
        expected = int(asset['file_size'])
        url = f'{API}/studies/{accession}/download?' + urlencode({
            'file': name, 'version': asset['version'], 'redirect': 'false',
        })
        record = {'name': name, 'sizeBytes': expected, 'url': url, 'version': asset['version']}
        target = directory / name
        camera = CAMERA_PACKAGE.search(name)
        record['required'] = 'ImageFrameSizes_ROI_Offsets' not in name
        if camera:
            record['camera'] = camera[1].upper()
        try:
            usable = target.exists() and target.stat().st_size == expected
            if usable and name in verified:
                usable = sha256(target) == verified[name]
            if not usable and import_dir:
                original_name = re.sub(r'^PSI-98_(Raw Data|Science Documents)_', '', name)
                original = import_dir / original_name
                if original.is_file() and original.stat().st_size == expected:
                    shutil.copyfile(original, target)
                    usable = True
            if not usable and not offline:
                fetch(url, target, expected)
                usable = True
            if not usable:
                return {**record, 'status': 'missing'}
            if camera:
                frames = archive_frames(target, record['camera'])
                record.update(frameCount=len(frames), firstMs=frames[0][0], lastMs=frames[-1][0])
            return {**record, 'status': 'available', 'sha256': sha256(target)}
        except (OSError, ValueError, BadZipFile) as exc:
            # Signed URLs and query credentials from HTTP errors stay out of the manifest.
            reason = f'HTTP {exc.code}' if isinstance(exc, HTTPError) else type(exc).__name__
            return {**record, 'status': 'error', 'error': reason}

    with ThreadPoolExecutor(max_workers=4) as pool:
        assets = list(pool.map(prepare, sorted(catalog, key=lambda asset: asset['file_name'])))
    return {
        'schemaVersion': 1,
        'experimentId': RUN,
        'investigationId': accession,
        'label': 'SAFFIRE I · S1',
        'doi': metadata['doi'],
        'sourceUrl': f'https://psi.nasa.gov/physci/repo/data/investigations/{accession}',
        'material': 'SIBAL',
        'fiberOrientation': None,
        'geometry': {'lengthMm': 940, 'widthMm': 406, 'thicknessMm': 0.37},
        'conditions': {'flowCmS': 20, 'oxygenPct': [21.5, 21.7], 'pressureKpa': None, 'flowDirection': 'concurrent'},
        'ignition': {'edge': 'upstream', 'durationS': 8, 'powerW': 182},
        'sourceRecord': {'file': metadata['experimentalTable'][0]['file_name'], 'row': 2},
        'corrections': [
            {'field': 'thicknessMm', 'raw': '0.37 under Sample Thickness (cm)',
             'adopted': 0.37, 'source': REPORT, 'locator': 'Tabela 1'},
            {'field': 'geometry', 'raw': 'Length 40.6 cm, Width 94 cm',
             'adopted': 'Length 94 cm, Width 40.6 cm', 'source': REPORT, 'locator': 'Tabela 1'},
        ],
        'assets': assets,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--experiment', default=RUN, choices=[RUN])
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--import-dir', type=Path)
    args = parser.parse_args()
    manifest = inventory(args.offline, args.import_dir)
    atomic_write(MANIFEST, json_bytes(manifest))
    for asset in manifest['assets']:
        print(asset['status'], asset['name'], asset.get('error', ''))
    return int(any(asset['required'] and asset['status'] != 'available' for asset in manifest['assets']))


if __name__ == '__main__':
    raise SystemExit(main())
