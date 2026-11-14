"""Download and inventory the mapped JPEGs and supporting files for PSI-100."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import re
from urllib.parse import urlencode
from zipfile import BadZipFile, ZipFile

from ingest_saffire import CACHE, fetch, sha256
from sync_nasa import API, RAW, ROOT, atomic_write, json_bytes

SLUG = 'psi-100'
SOURCE = 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-100'
ARTICLE = 'https://doi.org/10.1016/j.combustflame.2018.10.012'
PACKAGE = re.compile(r'_(S[12]C[12])_JPEG_Mapped(?:_part\d+)?\.zip$', re.I)
FRAME = re.compile(r'(?:^|/)(?:Mapped_)?(S[12]C[12])-(\d{13})\.jpe?g$', re.I)


def frames(archive, camera):
    result = {}
    for entry in archive.infolist():
        match = FRAME.search(entry.filename)
        if not match or match[1].upper() != camera or entry.filename.startswith('__MACOSX/'):
            continue
        ts = int(match[2])
        prior = result.setdefault(ts, entry)
        if prior.CRC != entry.CRC:
            raise ValueError(f'{camera}: quadros divergentes em {ts}')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    meta = json.loads((RAW / 'PSI-100/metadata.json').read_bytes())
    directory = CACHE / SLUG
    directory.mkdir(parents=True, exist_ok=True)
    inventory = [a for a in meta['added'] if a['visible'] and not a['restricted'] and (
        PACKAGE.search(a['file_name']) or 'Image Directory Nomenclature' in a['file_name']
        or 'Sample 1 Sensors' in a['file_name'] or 'Sample 2 Sensors' in a['file_name'])]

    def prepare(asset):
        name = asset['file_name']
        size = int(asset['file_size'])
        target = directory / name
        url = f'{API}/studies/PSI-100/download?' + urlencode(
            {'file': name, 'version': asset['version'], 'redirect': 'false'})
        camera = PACKAGE.search(name)
        record = {'name': name, 'sizeBytes': size, 'url': url, 'version': asset['version']}
        if camera:
            record['camera'] = camera[1].upper()
        try:
            if not target.is_file() or target.stat().st_size != size:
                if args.offline:
                    return {**record, 'status': 'missing'}
                fetch(url, target, size)
            if camera:
                with ZipFile(target) as archive:
                    timestamps = sorted(frames(archive, record['camera']))
                    if not timestamps or archive.testzip() is not None:
                        raise ValueError('ZIP inválido ou sem quadros reconhecidos')
                record.update(frameCount=len(timestamps), firstMs=timestamps[0], lastMs=timestamps[-1])
            return {**record, 'status': 'available', 'sha256': sha256(target)}
        except (OSError, ValueError, RuntimeError, BadZipFile) as error:
            # Never persist an expiring signed URL from an exception.
            return {**record, 'status': 'error', 'error': type(error).__name__,
                    **({'httpStatus': error.code} if hasattr(error, 'code') else {})}

    with ThreadPoolExecutor(max_workers=6) as pool:
        assets = list(pool.map(prepare, sorted(inventory, key=lambda a: a['file_name'])))
    manifest = {
        'schemaVersion': 1, 'investigationId': 'PSI-100', 'doi': meta['doi'],
        'sourceUrl': SOURCE, 'conditionsSource': ARTICLE, 'material': 'SIBAL',
        'geometry': {'lengthMm': 940, 'widthMm': 406},
        'conditions': {'flowCmS': 25, 'oxygenPct': 21.2},
        'sourceTable': {'flowCmS': 30, 'thickness': '.33 cm'},
        'experiments': {'S1': {'id': 'PSI-100:t0:r2', 'direction': 'concurrent'},
                        'S2': {'id': 'PSI-100:t0:r3', 'direction': 'opposed'}},
        'assets': assets,
    }
    atomic_write(ROOT / 'data/saffire/psi-100/manifest.json', json_bytes(manifest))
    for asset in assets:
        print(asset['status'], asset.get('frameCount', ''), asset['name'], flush=True)
    return int(any(asset['status'] != 'available' for asset in assets))


if __name__ == '__main__':
    raise SystemExit(main())
