"""Interface artefact for the HabitatFire module "FLARE — Flammability Limits at Reduced Gravity".

    python scripts/flare/build_flare_replay.py          # writes public/data/flare/flare-evidence.json
    python scripts/flare/build_flare_replay.py --check  # verifies the committed file is reproduced exactly

Built only from the versioned P0/P1 outputs (data/flare/derived/*.json, data/flare/sources/publications-metadata.json);
no value is typed here. Records keep their kind (measured / predicted / calibration / measured-as-cited /
published_summary), printed cell (`raw`) and source. Nothing is averaged, interpolated, regressed or predicted;
ranges such as "2~6cm/s" stay textual; divergences between publications are shown side by side.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DERIVED = ROOT / 'data/flare/derived'
INPUTS = {
    'inventory': DERIVED / 'flare-inventory.json',
    'records': DERIVED / 'flare-records.json',
    'analysis': DERIVED / 'flare-analysis.json',
    'publications': ROOT / 'data/flare/sources/publications-metadata.json',
}
OUTPUT = ROOT / 'public/data/flare/flare-evidence.json'
REFERENCES = {
    'tastj-2016-ambient-gas': {'short': 'Tsuboi et al. 2016', 'citation': 'Tsuboi, Maruta, Takahashi, Ihara, Bhattacharjee, Trans. JSASS Aerospace Tech. Japan 14 (ists30) Ph_1 (2016)', 'doi': '10.2322/tastj.14.ph_1'},
    'tastj-2018-loc-model': {'short': 'Takahashi & Maruta 2018', 'citation': 'Takahashi, Maruta, Trans. JSASS Aerospace Tech. Japan 16 (1) 28-34 (2018)', 'doi': '10.2322/tastj.16.28'},
}
LIMITATIONS = [
    ('not-iss-maps', 'Os valores apresentados não constituem uma reprodução dos mapas completos da ISS.'),
    ('different-setups', 'As campanhas de 1g e de microgravidade usam configurações experimentais distintas (propagação descendente com empuxo em 1g; fluxo oposto forçado em microgravidade).'),
    ('no-causal-gravity', 'As diferenças de O₂ não isolam causalmente o efeito da gravidade.'),
    ('maps-not-digitized', 'Os mapas O₂ × velocidade ainda não foram digitalizados.'),
    ('iss-papers-missing', 'Os artigos completos da ISS de 2024 e 2026 não estão disponíveis nesta base (apenas resumos).'),
    ('model-not-implemented', 'O critério R_rad + 1/Da = 1 ainda não foi implementado nem validado neste projeto.'),
]
GAS_LABEL = {'N2': 'N₂', 'CO2': 'CO₂', 'Ar': 'Ar', 'N2 (air-like)': 'ar (N₂)'}


def text(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n')


def digest(path: Path) -> str:
    return hashlib.sha256(text(path).encode('utf-8')).hexdigest()


def slim(record: dict) -> dict:
    keep = ('id', 'source', 'table', 'campaign', 'material', 'thickness_mm', 'gravity', 'balanceGas', 'quantity', 'kind',
            'unit', 'raw', 'value', 'parse', 'rangeLow', 'rangeHigh', 'note')
    out = {key: record[key] for key in keep if key in record}
    out['gasLabel'] = GAS_LABEL.get(record.get('balanceGas'), record.get('balanceGas'))
    return out


def limits(records: list[dict]) -> list[dict]:
    """LOC and MLOC values grouped by (source, material, gas); each value keeps its own kind."""
    groups: dict[tuple, dict] = {}
    for record in records:
        if record['quantity'] not in ('LOC', 'MLOC') or record['source'] not in REFERENCES:
            continue
        key = (record['source'], record['material'], record['balanceGas'])
        group = groups.setdefault(key, {'source': record['source'], 'reference': REFERENCES[record['source']]['short'],
                                        'material': record['material'], 'thickness_mm': record['thickness_mm'],
                                        'balanceGas': record['balanceGas'],
                                        'gasLabel': GAS_LABEL.get(record['balanceGas'], record['balanceGas']), 'values': []})
        group['values'].append(slim(record))
    order = {'tastj-2016-ambient-gas': 0, 'tastj-2018-loc-model': 1}
    gas_order = {'N2': 0, 'CO2': 1, 'Ar': 2, 'N2 (air-like)': 0}
    return sorted(groups.values(), key=lambda g: (order[g['source']], g['material'], gas_order.get(g['balanceGas'], 9)))


def build() -> dict:
    inventory = json.loads(text(INPUTS['inventory']))
    records = json.loads(text(INPUTS['records']))['records']
    analysis = json.loads(text(INPUTS['analysis']))
    publications = json.loads(text(INPUTS['publications']))
    campaigns = {c['id']: c for c in inventory['campaigns']}
    vcr = [slim(r) for r in records if r['quantity'] == 'Vcr']
    iss = [slim(r) for r in records if r['campaign'].startswith('iss-')]
    return {
        'schemaVersion': 1,
        'title': 'FLARE — Flammability Limits at Reduced Gravity',
        'group': 'Evidência publicada · fora do PSI',
        'statement': ('Evidência publicada da investigação FLARE (JAXA): limites de inflamabilidade de combustíveis sólidos '
                      'finos. Esta versão mostra sobretudo campanhas anteriores em 1g e em voo parabólico, não os '
                      'experimentos completos da ISS. Não é modelo nem previsão de cenário.'),
        'scope': 'Valores quantitativos: Tabelas 2 de Tsuboi et al. 2016 e de Takahashi & Maruta 2018 (1g e voo parabólico).',
        'program': {'name': inventory['program'], 'principalInvestigator': inventory['principalInvestigator'],
                    'partners': inventory['partners'], 'officialPages': inventory['officialPages'],
                    'psi': {'kind': 'unavailable', 'value': None, 'reason': inventory['psi']['detail']}},
        'kinds': {
            'measured': 'valor experimental impresso em tabela',
            'predicted': 'previsão do modelo dos autores (não é medição)',
            'calibration': 'ponto ou constante usado para ajustar o modelo',
            'measured-as-cited': 'valor experimental citado no texto (outra fonte)',
            'published_summary': 'fato do resumo publicado (não é valor de tabela)',
        },
        'overview': {
            'objective': ('Medir em microgravidade a concentração mínima de O₂ que sustenta a propagação de chama (MLOC) e '
                          'verificar um método que a prevê a partir de ensaios em solo, como base de uma norma internacional.'),
            'locVsMloc': ('LOC (em 1g): menor O₂ com propagação descendente estável. MLOC: o mínimo da curva-limite em '
                          'microgravidade quando se varia o fluxo oposto; Vcr é a velocidade em que esse mínimo ocorre.'),
            'opposedFlow': ('Com fluxo oposto lento a chama se extingue por perda radiativa; com fluxo rápido, por blowoff. '
                            'Entre os dois existe um mínimo de O₂ (a curva-limite tem forma de "U").'),
            'sustain': 'Abaixo da curva-limite a chama não se sustenta; acima dela a propagação continua.',
            'platforms': [{'id': cid, 'group': campaigns[cid]['group'], 'gravity': campaigns[cid]['gravity'],
                           'quantitative': campaigns[cid]['quantitative']}
                          for cid in ('ground-1g-japan', 'parabolic-flight', 'iss-kibo-filter-paper', 'iss-kibo-pmma-nomex')],
        },
        'limits': limits(records),
        'deltaO2': [{**check, 'reference': REFERENCES[check['source']]['short'],
                     'gasLabel': GAS_LABEL.get(check['balanceGas'], check['balanceGas'])}
                    for check in analysis['deltaO2Reproduction']['checks']],
        'deltaO2AllReproduced': analysis['deltaO2Reproduction']['allReproduced'],
        'vcr': vcr,
        'ratios': [{**p, 'reference': REFERENCES[p['source']]['short'],
                    'gasLabel': GAS_LABEL.get(p['balanceGas'].split(' ')[0], p['balanceGas'])}
                   for p in analysis['mlocEvidence']['points']],
        'ratioNote': ('MLOC/LOC é uma razão descritiva entre valores medidos em configurações diferentes (1g descendente e '
                      'microgravidade com fluxo oposto); não é um efeito isolado da gravidade nem um parâmetro de modelo.'),
        'modelErrors': analysis['modelErrors'],
        'divergences': {
            'mloc': analysis['crossSource']['PMMA_MLOC_microgravity'],
            'vcr': analysis['crossSource']['PMMA_Vcr_N2'],
            'loc': analysis['crossSource']['PMMA_LOC1g_N2'],
            'signConvention': analysis['crossSource']['deltaO2SignConvention'],
        },
        'iss': {
            'note': ('Somente fatos dos resumos publicados (2024 e 2026); os textos completos não foram obtidos. Nenhum '
                     'valor de LOC/MLOC da ISS é apresentado.'),
            'records': iss,
            'publications': [{k: p[k] for k in ('id', 'doi', 'title', 'venue', 'license', 'fullTextRetrieved')}
                             for p in publications['publications']],
        },
        'complementarity': [
            {'module': 'BASS-II', 'role': 'evolução de frentes de propagação sobre combustível sólido fino'},
            {'module': 'Saffire', 'role': 'observações de propagação em escala maior'},
            {'module': 'SoFIE-GEL', 'role': 'evidências de extinção em configuração esférica'},
            {'module': 'FLARE', 'role': 'limites de inflamabilidade: O₂ mínimo que sustenta a chama em função do fluxo oposto'},
        ],
        'complementarityNote': 'Sem pontuação conjunta e sem conversão entre grandezas; cada módulo mantém sua própria evidência.',
        'limitations': [{'id': key, 'text': value} for key, value in LIMITATIONS],
        'references': [{'id': key, **value} for key, value in REFERENCES.items()],
        'excludedNotFlare': inventory['excludedNotFlare'],
        'provenance': {'generator': 'scripts/flare/build_flare_replay.py',
                       'inputs': {name: {'path': path.relative_to(ROOT).as_posix(), 'sha256LfNormalised': digest(path)}
                                  for name, path in INPUTS.items()}},
    }


def render(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n'


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
    print(f'{OUTPUT.relative_to(ROOT).as_posix()}: {len(rendered.encode("utf-8"))} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
