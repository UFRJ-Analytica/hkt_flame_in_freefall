"""FLARE P1 analysis: reproduce the published table arithmetic and organise the MLOC evidence per campaign.

    python scripts/flare/analyze_flare.py           # writes data/flare/derived/flare-analysis.json
    python scripts/flare/analyze_flare.py --check

Only relations printed or implied by the tables are reproduced: deltaO2 = MLOC - LOC (Tsuboi 2016) or LOC1g - MLOC
(Takahashi 2018), model error MLOC_pred - MLOC_meas, the MLOC/LOC ratio, and cross-source consistency. No physical
model is evaluated and no value is extrapolated to conditions not tested. Records never mix measured and predicted values.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RECORDS = ROOT / 'data/flare/derived/flare-records.json'
OUTPUT = ROOT / 'data/flare/derived/flare-analysis.json'
TOLERANCE_PP = 0.051  # printed with one decimal: |difference| <= 0.05 pp (+ float slack) counts as reproduced


def text(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n')


def pick(records, **match) -> dict | None:
    found = [r for r in records if all(r.get(k) == v for k, v in match.items())]
    if len(found) > 1:
        raise ValueError(f'ambiguous selection {match}')
    return found[0] if found else None


def delta_checks(records) -> list[dict]:
    out = []
    for gas in ('N2', 'CO2', 'Ar'):
        for kind in ('measured', 'predicted'):
            loc = pick(records, source='tastj-2016-ambient-gas', quantity='LOC', kind=kind, balanceGas=gas)
            mloc = pick(records, source='tastj-2016-ambient-gas', quantity='MLOC', kind=kind, balanceGas=gas)
            delta = pick(records, source='tastj-2016-ambient-gas', quantity='deltaO2', kind=kind, balanceGas=gas)
            computed = round(mloc['value'] - loc['value'], 2)
            out.append({'source': 'tastj-2016-ambient-gas', 'material': 'PMMA', 'balanceGas': gas, 'kind': kind,
                        'convention': 'MLOC - LOC', 'computed_pp': computed, 'printed_pp': delta['value'],
                        'reproduced': abs(computed - delta['value']) <= TOLERANCE_PP,
                        'records': [loc['id'], mloc['id'], delta['id']]})
    for material in ('PMMA', 'NOMEX'):
        loc = pick(records, source='tastj-2018-loc-model', quantity='LOC', kind='measured', material=material)
        for kind in ('measured', 'predicted'):
            mloc = pick(records, source='tastj-2018-loc-model', quantity='MLOC', kind=kind, material=material)
            delta = pick(records, source='tastj-2018-loc-model', quantity='deltaO2', kind=kind, material=material)
            computed = round(loc['value'] - mloc['value'], 2)
            out.append({'source': 'tastj-2018-loc-model', 'material': material, 'balanceGas': 'N2 (air-like)', 'kind': kind,
                        'convention': 'LOC1g - MLOC', 'computed_pp': computed, 'printed_pp': delta['value'],
                        'reproduced': abs(computed - delta['value']) <= TOLERANCE_PP,
                        'records': [loc['id'], mloc['id'], delta['id']]})
    return out


def model_errors(records) -> list[dict]:
    out = []
    for source, keys in (('tastj-2016-ambient-gas', [('PMMA', g) for g in ('N2', 'CO2', 'Ar')]),
                         ('tastj-2018-loc-model', [('PMMA', 'N2 (air-like)'), ('NOMEX', 'N2 (air-like)')])):
        for material, gas in keys:
            meas = pick(records, source=source, quantity='MLOC', kind='measured', material=material, balanceGas=gas)
            pred = pick(records, source=source, quantity='MLOC', kind='predicted', material=material, balanceGas=gas)
            error = round(pred['value'] - meas['value'], 2)
            out.append({'source': source, 'material': material, 'balanceGas': gas, 'MLOC_measured': meas['value'],
                        'MLOC_predicted': pred['value'], 'error_pp': error,
                        'reading': 'previsão abaixo do medido (lado seguro: prevê inflamável onde não queimou)' if error < 0
                        else 'previsão acima do medido' if error > 0 else 'igual'})
    return out


def evidence_points(records) -> list[dict]:
    """(material, gas) points with LOC in 1g, MLOC in microgravity and the opposed velocity where MLOC occurs."""
    out = []
    for gas in ('N2', 'CO2', 'Ar'):
        loc = pick(records, source='tastj-2016-ambient-gas', quantity='LOC', kind='measured', balanceGas=gas)
        mloc = pick(records, source='tastj-2016-ambient-gas', quantity='MLOC', kind='measured', balanceGas=gas)
        vcr = pick(records, source='tastj-2016-ambient-gas', quantity='Vcr', kind='measured', balanceGas=gas)
        out.append({'campaigns': ['ground-1g-japan', 'parabolic-flight'], 'source': 'tastj-2016-ambient-gas', 'material': 'PMMA 0,125 mm',
                    'geometry': 'folha plana fina', 'balanceGas': gas, 'LOC1g_pct': loc['value'], 'MLOC_pct': mloc['value'],
                    'Vcr_cm_s': vcr['value'], 'Vcr_raw': vcr['raw'],
                    'MLOC_over_LOC': round(mloc['value'] / loc['value'], 3)})
    for material in ('PMMA', 'NOMEX'):
        loc = pick(records, source='tastj-2018-loc-model', quantity='LOC', kind='measured', material=material)
        mloc = pick(records, source='tastj-2018-loc-model', quantity='MLOC', kind='measured', material=material)
        out.append({'campaigns': ['ground-1g-japan', 'parabolic-flight'], 'source': 'tastj-2018-loc-model',
                    'material': 'PMMA 0,125 mm' if material == 'PMMA' else 'NOMEX HT90-40',
                    'geometry': 'folha plana fina' if material == 'PMMA' else 'tecido', 'balanceGas': 'N2 (ar)',
                    'LOC1g_pct': loc['value'], 'MLOC_pct': mloc['value'], 'Vcr_cm_s': None, 'Vcr_raw': 'não tabelado',
                    'MLOC_over_LOC': round(mloc['value'] / loc['value'], 3)})
    return out


def build() -> dict:
    records = json.loads(text(RECORDS))['records']
    checks = delta_checks(records)
    pmma_2016 = pick(records, source='tastj-2016-ambient-gas', quantity='MLOC', kind='measured', balanceGas='N2')
    pmma_2018 = pick(records, source='tastj-2018-loc-model', quantity='MLOC', kind='measured', material='PMMA')
    pmma_cited = pick(records, source='tastj-2018-loc-model', quantity='MLOC', kind='measured-as-cited', material='PMMA')
    loc_2016 = pick(records, source='tastj-2016-ambient-gas', quantity='LOC', kind='measured', balanceGas='N2')
    loc_2018 = pick(records, source='tastj-2018-loc-model', quantity='LOC', kind='measured', material='PMMA')
    return {
        'schemaVersion': 1,
        'deltaO2Reproduction': {'kind': 'derived', 'tolerance_pp': TOLERANCE_PP, 'checks': checks,
                                'allReproduced': all(c['reproduced'] for c in checks)},
        'modelErrors': {'kind': 'derived', 'rows': model_errors(records),
                        'note': ('O LOC previsto em N2 (2016) é o ponto de calibração do modelo; o B1 de 2018 também foi '
                                 'calibrado no LOC descendente de 17,0 %. Erros de MLOC não são validações independentes do LOC.')},
        'crossSource': {
            'kind': 'derived',
            'PMMA_LOC1g_N2': {'tsuboi2016': loc_2016['value'], 'takahashi2018': loc_2018['value'],
                              'consistent': loc_2016['value'] == loc_2018['value']},
            'PMMA_MLOC_microgravity': {'tsuboi2016_table': pmma_2016['value'], 'takahashi2018_table': pmma_2018['value'],
                                       'takahashi2018_text_citing_ref17': pmma_cited['value'],
                                       'difference_pp': round(pmma_2018['value'] - pmma_2016['value'], 2),
                                       'reading': ('Divergência de 0,2 p.p. entre a Tabela 2 de 2018 (14,9 %) e a de 2016 / texto '
                                                   'de 2018 (14,7 %, Vg = 6 cm/s). Não é reconciliada aqui; ambas preservadas.')},
            'PMMA_Vcr_N2': {'tsuboi2016_table_measured': pick(records, source='tastj-2016-ambient-gas', quantity='Vcr', kind='measured', balanceGas='N2')['value'],
                            'takahashi2018_text_citing_ref17': pick(records, source='tastj-2018-loc-model', quantity='Vcr', kind='measured-as-cited', material='PMMA')['value'],
                            'reading': 'Vcr de 10 cm/s (Tabela de 2016) contra 6 cm/s (texto de 2018, Ref. 17). Não reconciliado.'},
            'deltaO2SignConvention': '2016: MLOC - LOC (negativo); 2018: LOC1g - MLOC (positivo); registrados como impressos',
        },
        'mlocEvidence': {
            'kind': 'derived', 'relation': 'MLOC = f(U, O2, material, geometria, g)',
            'points': evidence_points(records),
            'coverage': ('Pontos de 1g + voo parabólico para PMMA fino (N2, CO2, Ar) e NOMEX HT90-40 (ar). Os mapas completos '
                         '(O2 × Vg) existem só em figuras; os valores da ISS (papel-filtro 2024, PMMA/NOMEX 2026) estão em '
                         'textos completos não obtidos.'),
            'notDerived': 'nenhuma regressão, interpolação ou extrapolação entre materiais, gases ou geometrias',
        },
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
    OUTPUT.write_bytes(rendered.encode('utf-8'))
    data = json.loads(rendered)
    for c in data['deltaO2Reproduction']['checks']:
        print(c['source'][:10], c['material'], c['balanceGas'], c['kind'], c['computed_pp'], c['printed_pp'], c['reproduced'])
    for r in data['modelErrors']['rows']:
        print('err', r['source'][:10], r['material'], r['balanceGas'], r['error_pp'])
    for p in data['mlocEvidence']['points']:
        print('pt', p['material'], p['balanceGas'], p['LOC1g_pct'], p['MLOC_pct'], p['Vcr_raw'], p['MLOC_over_LOC'])
    return 0


if __name__ == '__main__':
    sys.exit(main())
