"""Download the public FLARE (JAXA) documents identified in P0 into data/cache/flare/ and record them in
data/flare/docs-manifest.json.

    python scripts/flare/fetch_flare.py --list     # catalogue (no network)
    python scripts/flare/fetch_flare.py docs       # every catalogued document
    python scripts/flare/fetch_flare.py --verify   # re-hash the cache against the manifest

No FLARE investigation exists on NASA PSI (docs/research/FLARE_DATA_REVIEW.md). Sources are official NASA/JAXA documents
and open-access copies on academic hosts (J-STAGE, ICES/Texas Tech repository). The two main papers (PROCI 2024,
Combustion and Flame 2026) are open access on ScienceDirect but refuse automated access (HTTP 403); the Fire Technology
2023 paper's open copy is on the JAXA repository, which is under maintenance (HTTP 503). Those are recorded as failures,
not worked around. Combined ceiling: 120 MB. Resumable (.part + HTTP Range), atomic rename, content-type check, SHA-256.
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
CACHE = ROOT / 'data/cache/flare'
MANIFEST = ROOT / 'data/flare/docs-manifest.json'
HOSTS = {'ntrs.nasa.gov', 'www.nasa.gov', 'humans-in-space.jaxa.jp', 'www.jstage.jst.go.jp', 'ttu-ir.tdl.org'}
AGENT = {'User-Agent': 'public-document-fetch/1.0'}
BUDGET = 120_000_000
FILE_LIMIT = 40_000_000
CATALOGUE = [
    {'id': 'ntrs-flare-2016', 'campaign': 'FLARE (projeto)', 'kind': 'presentation', 'origin': 'NASA NTRS',
     'title': 'Flammability Limits at Reduced-g Experiment (FLARE) — Task Group 5: Fundamental Research on International Standard of Fire Safety in Space',
     'identifier': 'NTRS 20160001023', 'landing': 'https://ntrs.nasa.gov/citations/20160001023',
     'url': 'https://ntrs.nasa.gov/api/citations/20160001023/downloads/20160001023.pdf', 'file': 'NTRS-20160001023_FLARE.pdf'},
    {'id': 'nasa-ahr-2024', 'campaign': 'FLARE (resultados ISS)', 'kind': 'report', 'origin': 'NASA',
     'title': 'NASA Biological and Physical Sciences — Annual Highlights of Results 2024',
     'identifier': 'ahr-2024-final.pdf', 'landing': 'https://www.nasa.gov/wp-content/uploads/2025/02/ahr-2024-final.pdf',
     'url': 'https://www.nasa.gov/wp-content/uploads/2025/02/ahr-2024-final.pdf', 'file': 'NASA_AHR_2024.pdf'},
    {'id': 'jaxa-leaflet-2026', 'campaign': 'Solid Combustion / FLARE (Kibo)', 'kind': 'leaflet', 'origin': 'JAXA',
     'title': 'Combustion Experiment in Microgravity (JAXA leaflet)', 'identifier': 'Leaflet_CombustionExperimentInMicrogravity.pdf',
     'landing': 'https://humans-in-space.jaxa.jp/2026/07/Leaflet_CombustionExperimentInMicrogravity.pdf',
     'url': 'https://humans-in-space.jaxa.jp/2026/07/Leaflet_CombustionExperimentInMicrogravity.pdf', 'file': 'JAXA_Leaflet_Combustion_2026.pdf'},
    {'id': 'tastj-2018-loc-model', 'campaign': 'FLARE (modelo)', 'kind': 'journal-paper', 'origin': 'J-STAGE (open access)',
     'title': 'Prediction of Limiting Oxygen Concentration of Thin Materials in Microgravity (Takahashi, Maruta)',
     'identifier': 'doi:10.2322/tastj.16.28', 'landing': 'https://doi.org/10.2322/tastj.16.28',
     'url': 'https://www.jstage.jst.go.jp/article/tastj/16/1/16_28/_pdf', 'file': 'TASTJ_2018_16_28_LOC_prediction.pdf'},
    {'id': 'tastj-2016-ambient-gas', 'campaign': 'Solid Combustion (pré-FLARE)', 'kind': 'journal-paper', 'origin': 'J-STAGE (open access)',
     'title': 'Effect of Ambient Gas on Flammability Limit of Flat Materials in Microgravity (Tsuboi et al.)',
     'identifier': 'doi:10.2322/tastj.14.ph_1', 'landing': 'https://doi.org/10.2322/tastj.14.ph_1',
     'url': 'https://www.jstage.jst.go.jp/article/tastj/14/ists30/14_Ph_1/_pdf', 'file': 'TASTJ_2016_14_Ph1_ambient_gas.pdf'},
    {'id': 'ices-2026-cfrp', 'campaign': 'FLARE (extensão, previsão)', 'kind': 'conference-paper', 'origin': 'ICES / Texas Tech repository',
     'title': 'Predicting the Flammability of Carbon-Fiber-Reinforced Plastic Sheets in Microgravity Environments (Kobayashi et al.)',
     'identifier': 'doi:10.32865/2346/109009', 'landing': 'https://doi.org/10.32865/2346/109009',
     'url': 'https://ttu-ir.tdl.org/bitstreams/3fc9a49b-c58a-4094-9bf5-515626122548/download', 'file': 'ICES_2026_109009_CFRP.pdf'},
    {'id': 'ices-2026-partial-g', 'campaign': 'FLARE (extensão, gravidade parcial)', 'kind': 'conference-paper', 'origin': 'ICES / Texas Tech repository',
     'title': 'Predictive Assessment of Solid-Material Flammability in Partial-Gravity Space Habitats (Takahashi et al.)',
     'identifier': 'doi:10.32865/2346/108903', 'landing': 'https://doi.org/10.32865/2346/108903',
     'url': 'https://ttu-ir.tdl.org/bitstreams/755f75b3-7b3d-49bf-8053-81d97938b0cf/download', 'file': 'ICES_2026_108903_partial_g.pdf'},
]
# Identified, open access in principle, but not retrievable by automation in this phase (recorded, never bypassed).
BLOCKED = [
    {'id': 'proci-2024-filter-paper', 'title': 'Quantitative prediction of the flammability limits of filter paper in microgravity conditions',
     'identifier': 'doi:10.1016/j.proci.2024.105200', 'license': 'CC BY-NC-ND 4.0 (hybrid open access)',
     'landing': 'https://www.sciencedirect.com/science/article/pii/S1540748924000105',
     'reason': 'ScienceDirect HTTP 403 a acesso automatizado; usados apenas metadados Crossref e resumo OpenAlex'},
    {'id': 'cnf-2026-pmma-nomex', 'title': 'Flame spread over charring and non-charring materials in microgravity on ISS/Kibo',
     'identifier': 'doi:10.1016/j.combustflame.2026.114803', 'license': 'CC BY-NC-ND 4.0 (hybrid open access)',
     'landing': 'https://www.sciencedirect.com/science/article/pii/S0010218026000398',
     'reason': 'ScienceDirect HTTP 403 a acesso automatizado; usados apenas metadados Crossref e resumo OpenAlex'},
    {'id': 'proci-2026-filter-paper-dynamics', 'title': 'Dynamics of flame spread over filter papers in microgravity aboard the ISS',
     'identifier': 'doi:10.1016/j.proci.2026.106032', 'license': 'CC BY 4.0 (hybrid open access)',
     'landing': 'https://www.sciencedirect.com/science/article/pii/S1540748926000337',
     'reason': 'não tentado: mesmo host (ScienceDirect) que bloqueia acesso automatizado; usados metadados Crossref e resumo OpenAlex'},
    {'id': 'firetech-2023-filter-paper', 'title': 'Flame Spread Behavior Over a Filter Paper Near Extinction Limit Under Microgravity on the ISS/Kibo',
     'identifier': 'doi:10.1007/s10694-023-01507-3', 'license': 'cópia aberta no repositório JAXA (record 2001801)',
     'landing': 'https://jaxa.repo.nii.ac.jp/records/2001801',
     'reason': 'Repositório JAXA (JAIRO Cloud) em manutenção desde 2026-10-28, HTTP 503; versão da editora não aberta'},
]
MAGIC = {'.pdf': b'%PDF'}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def sha256(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def allowed(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == 'https' and parsed.hostname in HOSTS


def download(url: str, target: Path) -> int:
    if not allowed(url):
        raise ValueError('origem fora das fontes autorizadas')
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_name(target.name + '.part')
    offset = partial.stat().st_size if partial.exists() else 0
    headers = {**AGENT, 'Range': f'bytes={offset}-'} if offset else AGENT
    with urlopen(Request(url, headers=headers), timeout=120) as response:
        if not allowed(response.url):
            raise ValueError('redirecionamento fora das fontes autorizadas')
        resumed = offset > 0 and response.status == 206
        declared = response.headers.get('Content-Length')
        total = (offset if resumed else 0) + int(declared) if declared else None
        if total is not None and total > FILE_LIMIT:
            raise ValueError(f'arquivo de {total} bytes excede o limite por arquivo')
        received = offset if resumed else 0
        with partial.open('ab' if resumed else 'wb') as out:
            while chunk := response.read(1024 * 1024):
                received += len(chunk)
                if received > FILE_LIMIT:
                    raise ValueError('arquivo excede o limite por arquivo')
                out.write(chunk)
    if total is not None and received != total:
        raise ValueError(f'download incompleto: {received} de {total} bytes; execute de novo para retomar')
    with partial.open('rb') as stream:
        head = stream.read(8)
    expected = MAGIC.get(target.suffix.lower())
    if expected and not head.startswith(expected):
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


def fetch() -> dict:
    previous = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {}
    entries = {entry['id']: entry for entry in previous.get('files', [])}
    failures = {entry['id']: entry for entry in previous.get('failures', [])}
    used = sum(entry['bytes'] for entry in entries.values())
    for item in CATALOGUE:
        target = CACHE / item['file']
        if item['id'] in entries and target.exists() and sha256(target) == entries[item['id']]['sha256']:
            print(f'já presente: {item["file"]}')
            continue
        try:
            size = download(item['url'], target)
        except Exception as error:  # noqa: BLE001 - recorded per file
            failures[item['id']] = {'id': item['id'], 'url': item['url'], 'reason': reason(error), 'attemptedAt': now()}
            print(f'falhou: {item["file"]}: {reason(error)}')
            continue
        if used + size > BUDGET:
            target.unlink()
            failures[item['id']] = {'id': item['id'], 'url': item['url'], 'reason': 'excederia o limite combinado de 120 MB'}
            continue
        failures.pop(item['id'], None)
        used += size
        entries[item['id']] = {**{k: v for k, v in item.items() if k != 'file'}, 'fileName': item['file'], 'bytes': size,
                               'sha256': sha256(target), 'retrievedAt': now(),
                               'cachePath': target.relative_to(ROOT).as_posix()}
        print(f'baixado: {item["file"]} ({size} bytes)')
    manifest = {
        'program': 'FLARE (Flammability Limits at Reduced-g Experiment), JAXA', 'budgetBytes': BUDGET,
        'usedBytes': sum(entry['bytes'] for entry in entries.values()),
        'psiStatus': ('Nenhuma investigação FLARE no NASA PSI (busca no índice em 2026-11-15; IDs públicos PSI-1 a '
                      'PSI-230 já verificados nesta sessão); ocorrências do índice são coautorias em outras investigações.'),
        'localCopies': [{'id': 'nasa-flare-page', 'path': 'data/raw/research/nasa-flare.html',
                         'note': 'página NASA GRC do FLARE já preservada no corpus de pesquisa; não baixada de novo'}],
        'cacheNote': 'Originais em data/cache/flare/ (ignorado pelo Git); este manifesto é a única parte versionada.',
        'files': sorted(entries.values(), key=lambda entry: entry['id']),
        'blocked': BLOCKED,
        'failures': sorted(failures.values(), key=lambda entry: entry['id']),
        'videos': 'nenhum vídeo baixado: nenhum vídeo público com associação comprovada a um teste FLARE foi identificado',
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
    parser.add_argument('kind', nargs='?', choices=('docs',))
    parser.add_argument('--list', action='store_true')
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.list:
        for item in CATALOGUE:
            print(f"{item['id']:<26} {item['url']}")
        for item in BLOCKED:
            print(f"{item['id']:<26} BLOQUEADO: {item['reason']}")
        return 0
    if args.verify:
        return verify()
    if args.kind == 'docs':
        fetch()
        return 0
    parser.error('informe docs, --list ou --verify')
    return 2


if __name__ == '__main__':
    sys.exit(main())
