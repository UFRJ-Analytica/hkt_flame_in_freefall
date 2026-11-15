"""FLARE P0 inventory: sources, campaigns and data availability, kept per campaign (never merged).

    python scripts/flare/inventory_flare.py           # writes data/flare/derived/flare-inventory.json
    python scripts/flare/inventory_flare.py --check

Inputs (all versioned): data/flare/docs-manifest.json, data/flare/sources/*.json. No cache file is read.
Campaigns are those documented by the sources; each carries platform, gravity, materials, geometry, atmosphere, measured
variables, objective, sources and whether quantitative values are available in this repository.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'data/flare/docs-manifest.json'
SOURCES = ROOT / 'data/flare/sources'
OUTPUT = ROOT / 'data/flare/derived/flare-inventory.json'

CAMPAIGNS = [
    {'id': 'ground-1g-nasa-wstf', 'group': '1g terrestre (NASA)', 'platform': 'NASA White Sands Test Facility, laboratório',
     'gravity': '1g', 'materials': ['LDPE', 'ETFE (Tefzel 750)', 'HDPE', 'PMMA fundido (0,8 / 2,99 / 5,99 mm)', 'Nomex HT90-40'],
     'geometry': 'placas e fios (configuração de fio com LDPE e ETFE)',
     'atmosphere': '101,3 kPa (14,7 psia), temperatura ambiente nos testes de qualificação do ignitor',
     'measured': 'MOC pelo NASA-STD-6001 Test 1; desenvolvimento de ignitor de fio quente; critério de autoextinção de 6"',
     'objective': 'correlacionar NASA-STD-6001 Test 1 com o LOI de voo (Task Group 5)',
     'sources': ['ntrs-flare-2016'], 'quantitative': 'não (tabela de MOC só com "MOC below Igniter"; sem valores numéricos)'},
    {'id': 'ground-1g-japan', 'group': '1g terrestre (Japão)', 'platform': 'laboratório (Gifu): propagação descendente e túnel de blowoff em glovebox de 1 m³',
     'gravity': '1g', 'materials': ['PMMA 0,125 mm (Acryplen)', 'NOMEX HT90-40'],
     'geometry': 'folha plana fina, 8 cm × 2 cm', 'atmosphere': 'O2 0-50 % em N2 (blowoff); N2, CO2 ou Ar (LOC 2016); ~1 atm',
     'measured': 'LOC1g (descendente); LOC de blowoff em fluxo forçado 40-130 cm/s; A* e E* empíricos',
     'objective': 'fornecer em solo os parâmetros que preveem o MLOC em microgravidade',
     'sources': ['tastj-2016-ambient-gas', 'tastj-2018-loc-model'], 'quantitative': 'sim: Tabela 2 de 2016 e Tabela 2 de 2018'},
    {'id': 'parabolic-flight', 'group': 'voo parabólico', 'platform': 'aeronave Diamond Air Service, ~20 s de microgravidade',
     'gravity': 'microgravidade de curta duração (~20 s)', 'materials': ['PMMA 0,125 mm (Acryplen)', 'NOMEX HT90-40'],
     'geometry': 'folha plana fina, 8 cm × 2 cm', 'atmosphere': 'O2 em N2, CO2 ou Ar; câmara fechada; fluxo oposto 0-20 cm/s',
     'measured': 'MLOC e Vcr; taxa de propagação (mm/s); comprimento de pré-aquecimento (IR)',
     'objective': 'validar o modelo de escala que prevê o MLOC a partir de dados de 1g',
     'sources': ['tastj-2016-ambient-gas', 'tastj-2018-loc-model'], 'quantitative': 'sim: MLOC medido nas Tabelas 2 de 2016 e 2018'},
    {'id': 'drop-tower', 'group': 'torre de queda', 'platform': 'torre de queda de 4,5 s (resultado anterior citado)',
     'gravity': 'microgravidade de curtíssima duração (4,5 s)', 'materials': ['PMMA fino'], 'geometry': 'folha plana fina',
     'atmosphere': '21 % O2', 'measured': 'extinção radiativa a Vg = 3 cm/s',
     'objective': 'calibrar a constante empírica B2 do modelo (B2 = 2,76)',
     'sources': ['tastj-2018-loc-model'], 'quantitative': 'só o ponto de calibração citado no texto'},
    {'id': 'iss-kibo-filter-paper', 'group': 'ISS/Kibo — papel-filtro', 'platform': 'Solid Combustion Experiment Module (SCEM), MSPR, Kibo; desde maio de 2022',
     'gravity': 'microgravidade de longa duração', 'materials': ['papel-filtro'], 'geometry': 'folha plana, 130 mm × 40 ou 20 mm',
     'atmosphere': '298 K, 100 kPa; ex.: 15,5 % O2 com fluxo oposto de 10 a 18 cm/s em passos de 2 cm/s',
     'measured': 'mapa de inflamabilidade (O2 × Vg), taxa de propagação, distribuição de velocidade em órbita, imagens visível/IR/alta velocidade',
     'objective': 'verificar a curva-limite prevista em solo; modo "flamelet" perto do limite',
     'sources': ['proci-2024-filter-paper', 'firetech-2023-filter-paper', 'proci-2026-filter-paper-dynamics', 'nasa-ahr-2024'],
     'quantitative': 'só o que está nos resumos (19 ensaios; condições; 1,0-1,5 mm/s em 2-D); textos completos não obtidos'},
    {'id': 'iss-kibo-pmma-nomex', 'group': 'ISS/Kibo — PMMA e NOMEX', 'platform': 'SCEM, Kibo',
     'gravity': 'microgravidade de longa duração', 'materials': ['PMMA (não carbonizante)', 'NOMEX HT90-40 (carbonizante)'],
     'geometry': 'folha plana termicamente fina', 'atmosphere': 'fluxo oposto, inclusive quiescente',
     'measured': 'LOC, MLOC, raio da chama 3-D Rf, comprimento de pré-aquecimento Lg',
     'objective': 'estender o mapa a materiais carbonizantes e não carbonizantes; critério de raio crítico para chamas 3-D',
     'sources': ['cnf-2026-pmma-nomex'], 'quantitative': 'não: valores no texto completo, que não foi obtido (HTTP 403)'},
    {'id': 'iss-kibo-wire', 'group': 'ISS/Kibo — fios isolados', 'platform': 'SCEM, Kibo (carretel de fios)',
     'gravity': 'microgravidade de longa duração', 'materials': ['fios com isolamento polimérico'], 'geometry': 'fio isolado',
     'atmosphere': 'não informada', 'measured': 'não informado (experimentos "em andamento" segundo o folheto)',
     'objective': 'efeito da geometria; autoignição por sobrecorrente', 'sources': ['jaxa-leaflet-2026'], 'quantitative': 'não'},
    {'id': 'extensions-2026', 'group': 'extensões (CFRP, gravidade parcial)', 'platform': 'previsões (ICES 2026)',
     'gravity': 'microgravidade e gravidade parcial (previsão)', 'materials': ['CFRP', 'materiais sólidos diversos'],
     'geometry': 'folhas', 'atmosphere': 'não informada', 'measured': 'previsões de modelo',
     'objective': 'aplicar o método a novos materiais e a habitats lunares/marcianos',
     'sources': ['ices-2026-cfrp', 'ices-2026-partial-g'], 'quantitative': 'não: PDFs com HTTP 403'},
]


def text(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n')


def build() -> dict:
    manifest = json.loads(text(MANIFEST))
    publications = json.loads(text(SOURCES / 'publications-metadata.json'))
    downloaded = {entry['id'] for entry in manifest['files']}
    blocked = {entry['id']: entry['reason'] for entry in manifest['blocked']}
    failed = {entry['id']: entry['reason'] for entry in manifest['failures']}
    sources = []
    for entry in manifest['files']:
        sources.append({'id': entry['id'], 'title': entry['title'], 'identifier': entry['identifier'], 'origin': entry['origin'],
                        'status': 'downloaded', 'bytes': entry['bytes'], 'sha256': entry['sha256']})
    for entry in manifest['blocked']:
        sources.append({'id': entry['id'], 'title': entry['title'], 'identifier': entry['identifier'], 'origin': entry['landing'],
                        'status': 'blocked', 'reason': entry['reason']})
    for entry in manifest['failures']:
        sources.append({'id': entry['id'], 'title': entry['id'], 'identifier': entry['url'], 'origin': entry['url'],
                        'status': 'failed', 'reason': entry['reason']})
    campaigns = []
    for campaign in CAMPAIGNS:
        status = {sid: ('downloaded' if sid in downloaded else 'blocked' if sid in blocked else 'failed' if sid in failed
                        else 'metadata-only') for sid in campaign['sources']}
        campaigns.append({**campaign, 'sourceStatus': status})
    return {
        'schemaVersion': 1, 'program': 'FLARE — Fundamental Research on International Standard of Fire Safety in Space (JAXA)',
        'principalInvestigator': 'Osamu Fujita (Hokkaido University)',
        'partners': 'JAXA, NASA (GRC, WSTF), ESA, universidades no Japão, EUA e França',
        'officialPages': ['https://humans-in-space.jaxa.jp/en/biz-lab/experiment/theme/detail/000807.html',
                          'https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/flammability-limits-at-reduced-g-experiment-flare/',
                          'https://science.nasa.gov/mission/flare/'],
        'psi': {'status': 'not-found', 'detail': manifest['psiStatus']},
        'campaigns': campaigns,
        'sources': sorted(sources, key=lambda s: (s['status'], s['id'])),
        'publications': [{k: p[k] for k in ('id', 'doi', 'title', 'venue', 'license', 'fullTextRetrieved')} for p in publications['publications']],
        'excludedNotFlare': publications['excludedNotFlare'],
        'downloadBytes': manifest['usedBytes'],
    }


def render(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, indent=1) + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    rendered = render(build())
    if args.check:
        same = OUTPUT.exists() and text(OUTPUT) == rendered
        print('reproduzível' if same else 'DIVERGENTE')
        return 0 if same else 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(rendered.encode('utf-8'))
    data = json.loads(rendered)
    for c in data['campaigns']:
        print(f"{c['id']:<24} {c['gravity']:<40} quant: {c['quantitative'][:60]}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
