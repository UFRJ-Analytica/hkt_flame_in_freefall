"""Cache the public mapped SAFFIRE II camera sequences listed across PSI versions."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import re
import shutil
from urllib.parse import urlencode
from urllib.request import urlopen
from zipfile import BadZipFile, ZipFile

from ingest_saffire import CACHE, fetch, sha256
from sync_nasa import API, ROOT, atomic_write, json_bytes

HISTORY = f'{API}/repo/investigations/PSI-99/versions'
DIRECTORY = CACHE / 'psi-99'
MANIFEST = ROOT / 'data/saffire/psi-99/manifest.json'
PACKAGE = re.compile(
    r'[_-](S[1-9]C[12])_(?:.*JPEGs?_Mapped.*|Image_Data_All[_-]JPEGs_part\d+|BIT_jpeg)\.zip$', re.I)
MEMBER = re.compile(r'(S[1-9]C[12])-(\d{13})\.jpe?g$', re.I)


def frames(archive):
    for entry in archive.infolist():
        if entry.filename.startswith('__MACOSX/'):
            continue
        match = MEMBER.search(Path(entry.filename).name)
        if match:
            yield match[1].upper(), int(match[2]), entry


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--import-dir', type=Path)
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    DIRECTORY.mkdir(parents=True, exist_ok=True)
    previous = json.loads(MANIFEST.read_bytes())['assets'] if MANIFEST.is_file() else []
    if args.offline:
        if not previous:
            parser.error('Execute uma ingestão online para obter o inventário.')
        assets = previous
    else:
        with urlopen(HISTORY, timeout=25) as response:
            history = json.load(response)['versions']
        assets = {}
        for version in sorted(history, key=lambda item: item['version']):
            for entry in version['added'] + version['modified']:
                name = entry['file_name']
                camera = PACKAGE.search(name)
                if not entry['visible'] or entry['restricted']:
                    continue
                # Prefer mapped sequences. The raw S2C2 JPEGs are required
                # because the mapped packages with that name contain S3C2.
                if (camera and ('_mapped' in name.lower() or camera[1].upper() == 'S2C2')) or 'Image_Directory_Nomenclature' in name:
                    url = f'{API}/studies/PSI-99/download?' + urlencode({
                        'file': name, 'version': entry['version'], 'redirect': 'false',
                    })
                    assets[name] = {'name': name, 'sizeBytes': int(entry['file_size']), 'url': url,
                                    'cameraInCatalog': camera[1].upper() if camera else None}
        assets = list(assets.values())
    verified = {item['name']: item.get('sha256') for item in previous}

    def prepare(asset):
        record = {k: asset[k] for k in ('name', 'sizeBytes', 'url', 'cameraInCatalog')}
        target = DIRECTORY / record['name']
        size = record['sizeBytes']
        try:
            usable = target.is_file() and target.stat().st_size == size
            if usable and verified.get(target.name):
                usable = sha256(target) == verified[target.name]
            imported = args.import_dir / target.name if args.import_dir else None
            if not usable and imported and imported.is_file() and imported.stat().st_size == size:
                shutil.copyfile(imported, target)
                usable = True
            if not usable:
                if args.offline:
                    return {**record, 'status': 'missing'}
                fetch(record['url'], target, size)
            if record['cameraInCatalog']:
                with ZipFile(target) as archive:
                    observed = {}
                    for camera, stamp, _ in frames(archive):
                        observed.setdefault(camera, []).append(stamp)
                    if not observed or archive.testzip():
                        raise ValueError('ZIP sem sequência válida')
                record['sequences'] = {k: {'frames': len(v), 'firstMs': min(v), 'lastMs': max(v)}
                                       for k, v in observed.items()}
            return {**record, 'status': 'available', 'sha256': sha256(target)}
        except (OSError, ValueError, BadZipFile) as error:
            return {**record, 'status': 'error', 'error': getattr(error, 'code', type(error).__name__)}

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(prepare, sorted(assets, key=lambda asset: asset['name'])))
    atomic_write(MANIFEST, json_bytes({'schemaVersion': 1, 'investigationId': 'PSI-99',
                                      'inventorySource': HISTORY, 'assets': results}))
    for asset in results:
        print(asset['status'], asset['name'], asset.get('sequences', asset.get('error', '')), flush=True)
    return int(any(asset['status'] != 'available' for asset in results))


if __name__ == '__main__':
    raise SystemExit(main())
