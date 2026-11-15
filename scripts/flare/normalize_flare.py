"""FLARE P1 normalisation: one record per published value, with campaign, material, geometry, gravity, atmosphere,
quantity, kind (measured / predicted / calibration / published_summary), numeric value, unit and the original string.

    python scripts/flare/normalize_flare.py           # writes data/flare/derived/flare-records.json
    python scripts/flare/normalize_flare.py --check

Rules: the printed string is kept in `raw`; percentages and velocities are parsed only when they are a single number;
ranges such as "2~6cm/s" keep value = null and expose the printed bounds separately (never averaged); "unknown" stays
null. Measured and predicted values are separate records and are never merged. Sign conventions of deltaO2 differ
between sources and are recorded, not silently flipped.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCES = ROOT / 'data/flare/sources'
OUTPUT = ROOT / 'data/flare/derived/flare-records.json'
NUMBER = re.compile(r'^\s*([-+]?\d+(?:\.\d+)?)\s*(%|cm/s)?\s*$')
RANGE = re.compile(r'^\s*(\d+(?:\.\d+)?)\s*~\s*(\d+(?:\.\d+)?)\s*(cm/s)?\s*$')
SCI = re.compile(r'^\s*(\d+(?:\.\d+)?)×10\^([-+]?\d+)\s*$')


def text(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n')


def parse(raw: str | float | int | None) -> dict:
    """Numeric value of a printed cell, or null with the reason; never invents a number."""
    if raw is None:
        return {'value': None, 'parse': 'missing'}
    if isinstance(raw, (int, float)):
        return {'value': float(raw), 'parse': 'number'}
    s = raw.replace(' ', '') if 'cm/s' in raw else raw
    if s.strip().lower() == 'unknown':
        return {'value': None, 'parse': 'unknown-as-printed'}
    m = SCI.match(raw)
    if m:
        return {'value': float(m.group(1)) * 10 ** int(m.group(2)), 'parse': 'scientific'}
    m = RANGE.match(s)
    if m:
        return {'value': None, 'parse': 'range-as-printed', 'rangeLow': float(m.group(1)), 'rangeHigh': float(m.group(2))}
    m = NUMBER.match(s)
    if m:
        return {'value': float(m.group(1)), 'parse': 'number'}
    return {'value': None, 'parse': 'unparsed'}


def record(**fields) -> dict:
    parsed = parse(fields.get('raw'))
    return {**fields, **parsed}


def tsuboi_2016(data: dict) -> list[dict]:
    out = []
    table = data['table2']
    base = {'source': 'tastj-2016-ambient-gas', 'doi': data['source']['doi'], 'table': 'Table 2',
            'material': 'PMMA', 'thickness_mm': 0.125, 'geometry': 'flat sheet 8 cm x 2 cm', 'flow': 'opposed'}
    gravity = {'LOC': ('1g', 'ground-1g-japan'), 'MLOC': ('microgravity-parabolic', 'parabolic-flight'),
               'deltaO2': ('microgravity-parabolic vs 1g', 'parabolic-flight'), 'Vcr': ('microgravity-parabolic', 'parabolic-flight')}
    units = {'LOC': '% O2', 'MLOC': '% O2', 'deltaO2': 'percentage points (MLOC - LOC)', 'Vcr': 'cm/s'}
    for quantity in ('LOC', 'MLOC', 'deltaO2', 'Vcr'):
        for kind in ('measured', 'predicted'):
            for gas, raw in zip(table['columns'], table[quantity][kind]):
                g, campaign = gravity[quantity]
                note = None
                if quantity == 'LOC' and kind == 'predicted' and gas == 'N2':
                    note = 'calibration point: the model uses the N2 LOC in 1g as input (not an independent prediction)'
                out.append(record(**base, campaign=campaign, gravity=g, balanceGas=gas, quantity=quantity, kind=kind,
                                  unit=units[quantity], raw=raw, note=note))
    for row in data['table1_gasProperties_300K_1atm']:
        for key, unit in (('cp_J_molK', 'J/(mol K)'), ('lambda_W_mK', 'W/(m K)'), ('alpha_mm2_s', 'mm²/s'), ('aabs', '-')):
            out.append(record(source='tastj-2016-ambient-gas', doi=data['source']['doi'], table='Table 1', campaign='property-table',
                              material=None, thickness_mm=None, geometry=None, flow=None, gravity=None, balanceGas=row['gas'],
                              quantity=f'gas.{key}', kind='property', unit=unit, raw=row[key], note='300 K, 1 atm'))
    return out


def takahashi_2018(data: dict) -> list[dict]:
    out = []
    table = data['table2']
    rows = [('LOC1g_experiment_pct', 'LOC', 'measured', '1g', 'ground-1g-japan', '% O2'),
            ('MLOC_experiment_pct', 'MLOC', 'measured', 'microgravity-parabolic', 'parabolic-flight', '% O2'),
            ('MLOC_prediction_pct', 'MLOC', 'predicted', 'microgravity', 'parabolic-flight', '% O2'),
            ('deltaO2_experiment_pct', 'deltaO2', 'measured', 'microgravity-parabolic vs 1g', 'parabolic-flight', 'percentage points (LOC1g - MLOC)'),
            ('deltaO2_prediction_pct', 'deltaO2', 'predicted', 'microgravity vs 1g', 'parabolic-flight', 'percentage points (LOC1g - MLOC)'),
            ('E_literature_J_mol', 'E', 'literature', None, 'property-table', 'J/mol'),
            ('E_star_blowoff_J_mol', 'E*', 'calibration', '1g', 'ground-1g-japan', 'J/mol'),
            ('A_literature_m3_kgs', 'A', 'literature', None, 'property-table', 'm³/(kg s)'),
            ('A_star_blowoff_m3_kgs', 'A*', 'calibration', '1g', 'ground-1g-japan', 'm³/(kg s)')]
    for key, quantity, kind, gravity, campaign, unit in rows:
        for material, raw in zip(table['columns'], table[key]):
            out.append(record(source='tastj-2018-loc-model', doi=data['source']['doi'], table='Table 2', campaign=campaign,
                              material=material, thickness_mm=0.125 if material == 'PMMA' else None,
                              geometry='flat sheet (PMMA) / fabric (NOMEX)', flow='opposed', gravity=gravity,
                              balanceGas='N2 (air-like)', quantity=quantity, kind=kind, unit=unit, raw=raw, note=None))
    for name in ('B1', 'B2'):
        out.append(record(source='tastj-2018-loc-model', doi=data['source']['doi'], table='text p. 30', campaign='model-constant',
                          material='PMMA and NOMEX (same constants)', thickness_mm=None, geometry=None, flow='opposed',
                          gravity=None, balanceGas=None, quantity=name, kind='calibration', unit='-',
                          raw=data['model'][name]['value'], note=data['model'][name]['calibratedFrom']))
    out.append(record(source='tastj-2018-loc-model', doi=data['source']['doi'], table='text p. 30', campaign='parabolic-flight',
                      material='PMMA', thickness_mm=0.125, geometry='flat sheet', flow='opposed', gravity='microgravity',
                      balanceGas='N2 (air-like)', quantity='MLOC', kind='measured-as-cited', unit='% O2', raw='14.7%',
                      note='cited from Ref. 17 at Vg = 6 cm/s; Table 2 of the same paper prints 14.9 %'))
    out.append(record(source='tastj-2018-loc-model', doi=data['source']['doi'], table='text p. 30', campaign='parabolic-flight',
                      material='PMMA', thickness_mm=0.125, geometry='flat sheet', flow='opposed', gravity='microgravity',
                      balanceGas='N2 (air-like)', quantity='Vcr', kind='measured-as-cited', unit='cm/s', raw='6cm/s',
                      note='opposed flow velocity at which the cited MLOC of 14.7 % was observed (Ref. 17)'))
    return out


def iss_summaries(publications: dict) -> list[dict]:
    """Abstract-level facts of the ISS campaigns (published_summary): conditions and ranges, not table values."""
    out = []
    facts = [
        ('proci-2024-filter-paper', 'iss-kibo-filter-paper', 'filter paper', 'flat 130 mm x 40 or 20 mm', 'experiments', 19, 'count', '19 flame spread experiments (opposed flow)'),
        ('proci-2024-filter-paper', 'iss-kibo-filter-paper', 'filter paper', 'flat 130 mm x 40 or 20 mm', 'ambientTemperature', 298, 'K', '298 K'),
        ('proci-2024-filter-paper', 'iss-kibo-filter-paper', 'filter paper', 'flat 130 mm x 40 or 20 mm', 'pressure', 100, 'kPa', '100 kPa'),
        ('proci-2024-filter-paper', 'iss-kibo-filter-paper', 'filter paper', 'flat 130 mm x 40 or 20 mm', 'oxygenSweepCondition', 15.5, '% O2', '15.5 % oxygen, opposed flow 10 to 18 cm/s in 2 cm/s steps'),
    ]
    for source, campaign, material, geometry, quantity, value, unit, raw in facts:
        out.append({'source': source, 'doi': next(p['doi'] for p in publications['publications'] if p['id'] == source),
                     'table': 'abstract', 'campaign': campaign, 'material': material, 'thickness_mm': None, 'geometry': geometry,
                     'flow': 'opposed', 'gravity': 'microgravity-ISS', 'balanceGas': None, 'quantity': quantity,
                     'kind': 'published_summary', 'unit': unit, 'raw': raw, 'value': float(value), 'parse': 'abstract', 'note': None})
    out.append({'source': 'proci-2024-filter-paper', 'doi': '10.1016/j.proci.2024.105200', 'table': 'abstract',
                'campaign': 'iss-kibo-filter-paper', 'material': 'filter paper', 'thickness_mm': None,
                'geometry': 'flat 130 mm x 40 or 20 mm', 'flow': 'opposed', 'gravity': 'microgravity-ISS', 'balanceGas': None,
                'quantity': 'opposedFlowSweep', 'kind': 'published_summary', 'unit': 'cm/s', 'raw': '10 to 18 cm/s in 2 cm/s steps',
                'value': None, 'parse': 'range-as-printed', 'rangeLow': 10.0, 'rangeHigh': 18.0, 'note': 'at 15.5 % O2'})
    out.append({'source': 'proci-2026-filter-paper-dynamics', 'doi': '10.1016/j.proci.2026.106032', 'table': 'abstract',
                'campaign': 'iss-kibo-filter-paper', 'material': 'filter paper', 'thickness_mm': None, 'geometry': 'flat sheet',
                'flow': 'opposed', 'gravity': 'microgravity-ISS', 'balanceGas': None, 'quantity': 'spreadRate2D',
                'kind': 'published_summary', 'unit': 'mm/s', 'raw': 'typically 1.0–1.5 mm/s in the thermal regime',
                'value': None, 'parse': 'range-as-printed', 'rangeLow': 1.0, 'rangeHigh': 1.5,
                'note': 'flamelet spread significantly slower; spread observed below the LOC predicted by the 2-D model'})
    return out


def build() -> dict:
    tsuboi = json.loads(text(SOURCES / 'tastj2016-tsuboi-table1-table2.json'))
    takahashi = json.loads(text(SOURCES / 'tastj2018-takahashi-table1-table2.json'))
    publications = json.loads(text(SOURCES / 'publications-metadata.json'))
    records = tsuboi_2016(tsuboi) + takahashi_2018(takahashi) + iss_summaries(publications)
    for index, item in enumerate(records):
        item['id'] = f'r{index:03d}'
    return {'schemaVersion': 1,
            'kinds': {'measured': 'valor experimental impresso em tabela', 'predicted': 'previsão do modelo dos autores',
                      'calibration': 'constante ou parâmetro ajustado pelos autores a dados', 'literature': 'propriedade da literatura',
                      'property': 'propriedade tabelada do gás', 'measured-as-cited': 'valor experimental citado no texto',
                      'published_summary': 'fato quantitativo do resumo (não é valor de tabela)'},
            'records': records}


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
    records = json.loads(rendered)['records']
    print(len(records), 'registros;', sum(r['value'] is None for r in records), 'sem valor numérico (faixa/unknown/texto)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
