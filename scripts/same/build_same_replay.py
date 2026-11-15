"""Light interface artefact for the HabitatFire "Smoke & Detection" module (SAME, PSI-102).

    python scripts/same/build_same_replay.py          # writes public/data/same/smoke-analysis.json
    python scripts/same/build_same_replay.py --check  # verifies the committed file is reproduced exactly

Inputs are only the versioned P0/P1 outputs (data/same/derived/*.json and data/same/appendix-a-flight-log.csv); the
git-ignored cache of original NASA files is never read, and no number is created here that is not already in those
inputs or a direct re-statement of them. Every value carries one of five kinds:
    published         reported by NASA/NIST (page/table cited)
    measured          statistic of the flight housekeeping, in instrument units
    derived           computed in P0/P1 from published or measured numbers (equations cited)
    model_assumption  consequence of the lognormal hypothesis applied to published parameters
    unavailable       cannot be computed from the PSI-102 files (reason given); value is null
Input hashes are taken over the text with normalised line endings, so the check does not depend on core.autocrlf.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import inventory_same as inventory  # noqa: E402

ROOT = inventory.ROOT
DERIVED = inventory.DERIVED
INPUTS = {
    'inventory': DERIVED / 'same-inventory.json',
    'tests': DERIVED / 'same-tests.json',
    'analysis': DERIVED / 'same-analysis.json',
    'flightLog': inventory.APPENDIX,
}
OUTPUT = ROOT / 'public/data/same/smoke-analysis.json'
REPORT = 'SAME Final Science Report (Urban et al., NIST/NASA, 15 mar 2010)'
MOMENTS_NOTICE = ('Os momentos M0, M1 e M3 por teste não estão disponíveis devido à ausência das calibrações e razões de '
                  'diluição necessárias.')
MATERIALS = [
    # key in the derived files, short id, display name, Portuguese description
    ('Lamp wick (cellulose)', 'lampwick', 'Cellulose (lamp wick)', 'Celulose: pavio de lamparina'),
    ('Kapton', 'kapton', 'Kapton', 'Poli-imida (filme/isolante)'),
    ('Silicone rubber', 'silicone', 'Silicone rubber', 'Borracha de silicone'),
    ('Teflon', 'teflon', 'Teflon', 'PTFE'),
    ('DBP (dibutyl phthalate on cotton wick)', 'dbp', 'Dibutyl phthalate (DBP)', 'DBP em pavio de algodão; material de referência'),
]
SHORT = {key: short for key, short, _, _ in MATERIALS}
STATUS_LABELS = {
    'processed-state-windows': 'Janelas definidas pelos solenoides (HKP completo)',
    'nasa-averaging-window-only': 'Somente a janela média dos analistas NASA',
    'downloaded-not-segmented': 'Baixado, não segmentável sem suposições',
    'not-downloaded': 'Não baixado (orçamento de download)',
}
NOTICES = [
    ('not-flame', 'O SAME investiga a fumaça de materiais superaquecidos abaixo da ignição, não a propagação de chama. '
                  'Nenhum número deste módulo é velocidade de chama.'),
    ('moments', MOMENTS_NOTICE),
    ('aggregated', 'Os resultados de distribuição (Tabela 1) são agregados por material ("baseline" e "720 s aged"); '
                   'não são resultados individuais dos 47 testes e não se sabe quais testes entraram em cada linha.'),
    ('lognormal', 'A distribuição lognormal unimodal é uma hipótese do método; para silicone e lamp wick ela não é '
                  'totalmente coerente com a razão medida entre os DustTraks (possível bimodalidade, corte aerodinâmico).'),
    ('dusttrak', 'A razão DustTrak B/A é uma razão entre dois instrumentos na escala de fábrica; não é calibração '
                 'absoluta de massa nem de tamanho.'),
    ('no-prediction', 'Não existe modelo preditivo validado para condições não observadas: material e set-point de '
                      'aquecimento estão confundidos e faltam Nt absoluto, taxa de perda de massa e temperatura do fio.'),
    ('same-r', 'O SAME-R (PSI-101, voo de 2010) não está incluído nesta análise e não deve ser unido por número de teste.'),
]


def normalised_text(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n')


def digest(path: Path) -> str:
    return hashlib.sha256(normalised_text(path).encode('utf-8')).hexdigest()


def load() -> dict:
    return {key: json.loads(normalised_text(path)) for key, path in INPUTS.items() if path.suffix == '.json'}


def value(kind: str, number, unit: str | None = None, source: str | None = None, **extra) -> dict:
    entry = {'kind': kind, 'value': number}
    if unit:
        entry['unit'] = unit
    if source:
        entry['source'] = source
    entry.update(extra)
    return entry


def stat(block: dict) -> dict | None:
    if not block or not block.get('n'):
        return None
    return {key: block.get(key) for key in ('n', 'mean', 'sd', 'min', 'max')}


def roles(test: dict) -> dict:
    return {window['role']: window for window in (test.get('housekeeping') or {}).get('windows', [])}


def materials(data: dict) -> list[dict]:
    flight_log = data['inventory']['flightLog']
    conditions = data['analysis']['flight']['conditions']
    in_table1 = {row['material'] for row in data['analysis']['table1']}
    out = []
    for key, short, name, description in MATERIALS:
        tests = [t for t in data['tests']['tests'] if t['material'] == key]
        cond = conditions.get(key, {})
        out.append({
            'id': short, 'name': name, 'description': description,
            'inTable1': key in in_table1,
            'flightTests': value('published', flight_log['byMaterial'][key], source=f'{REPORT}, Apêndice A'),
            'initialHeatings': value('published', flight_log['initialHeatings'][key], source=f'{REPORT}, Apêndice A'),
            'processedTests': [t['test'] for t in tests if t['status'] == 'processed-state-windows'],
            'heaterRtOverR0': value('measured', stat(cond.get('RtOverR0')), 'Rt/R0',
                                    note='Razão de resistência do fio (controle); conversão para temperatura indisponível.'),
            'heatingDuration': value('measured', stat(cond.get('heating_s')), 's',
                                     note='Amostras com HeatingInProgress = 1 (1 Hz).'),
            'lfeFlowDuringHeating': value('measured', stat(cond.get('lfeFlowDuringHeating_sccm_median')), 'sccm',
                                          note='Vazão LFE; a conversão para cm/s exige a área do duto (indisponível).'),
        })
    return out


def coverage(data: dict) -> dict:
    tests = data['tests']['tests']
    groups = []
    for status, label in STATUS_LABELS.items():
        ids = [t['test'] for t in tests if t['status'] == status]
        groups.append({'status': status, 'label': label, 'count': len(ids), 'tests': ids})
    return {'kind': 'measured', 'total': len(tests), 'groups': groups,
            'perTest': [{'test': t['test'], 'material': SHORT[t['material']], 'heating': t['heating'],
                         'gmtDay': t['gmtDay'], 'status': t['status']} for t in tests],
            'note': ('Os 8 registros da tabela experimental do PSI-102 no catálogo reproduzem a matriz planejada (EIRD), '
                     'não os 47 testes voados do Apêndice A.')}


def table1(data: dict) -> dict:
    rows = []
    for row in data['analysis']['table1']:
        pub, rec, model = row['published'], row['recomputed'], row['lognormal']
        rows.append({
            'material': SHORT[row['material']], 'aged': row['aged'],
            'agingLabel': '720 s' if row['aged'] else 'sem envelhecimento',
            'Dg': value('published', pub['Dg_nm'], 'nm'),
            'D05': value('published', pub['D0.5_nm'], 'nm'),
            'D15': value('published', pub['D1.5_nm'], 'nm'),
            'sigmaG': value('published', pub['sigma_g']),
            'DgRecomputed': value('derived', rec['Dg_nm'], 'nm', equation='Eq. 7: Dg = sqrt(D0.5^3 / D1.5)'),
            'sigmaGRecomputed': value('derived', rec['sigma_g'], equation='Eq. 8: sigma_g = exp(sqrt(ln(D1.5/D0.5)))'),
            'massMedian': value('model_assumption', model['massMedian_nm'], 'nm'),
            'massFractionAbove1um': value('model_assumption', model['massFractionAbove1um']),
            'numberFractionAbove300nm': value('model_assumption', model['numberFractionAbove300nm']),
            'numberPerUnitVolumeRelative': value('model_assumption', model['numberPerUnitVolumeRelative'],
                                                 note='M0/M3 relativo a D1.5 = 100 nm (= (100/D1.5)^3).'),
            'perTestDistribution': value('unavailable', None, reason=MOMENTS_NOTICE),
        })
    reproduction = data['analysis']['table1Reproduction']
    return {'source': f'{REPORT}, §5, Tabela 1, p. 17', 'aggregation': 'por material',
            'rowsMeaning': '"baseline runs (no aging)" e "720 second aging runs" (p. 15)', 'rows': rows,
            'reproduction': {'kind': 'derived', 'maxAbs_dDg_nm': reproduction['maxAbs_dDg_nm'],
                             'maxAbs_dSigma_g': reproduction['maxAbs_dSigma_g'], 'statement': reproduction['statement']}}


def earlier(data: dict) -> list[dict]:
    out = []
    for source, block in data['analysis']['earlierPublishedVersions'].items():
        entries = []
        for material, entry in block['entries'].items():
            item = {'material': SHORT[material], 'value': value('published', entry['value'])}
            if 'consistentWithEq7' in entry:
                item['consistentWithEq7'] = value('derived', entry['consistentWithEq7'],
                                                  DgFromEq7_um=entry['DgFromEq7_um'])
            entries.append(item)
        out.append({'source': source, 'quantity': block['quantity'], 'entries': entries})
    return out


def aging(data: dict) -> dict:
    published = data['analysis']['agingTable1']
    tests = {t['test']: t for t in data['tests']['tests']}
    per_material = []
    for key, short, _, _ in MATERIALS:
        block = published.get(key)
        flight = data['analysis']['flight']['aging'].get(key)
        measured = []
        for test_id in (flight or {}).get('tests', []):
            test = tests[test_id]
            r = roles(test)
            measured.append({
                'test': test_id,
                'agePrimary_s': value('measured', r['primary'].get('ageAtPlateauStart_s'), 's'),
                'ageSecondary_s': value('measured', r['secondary'].get('ageAtPlateauStart_s'), 's'),
                'dusttrakBSecondaryOverPrimary': value('measured', test['housekeeping']['dusttrakBSecondaryOverPrimary']),
                'BoverAPrimary': value('measured', r['primary']['dusttrakRatioBoverA']),
                'BoverASecondary': value('measured', r['secondary']['dusttrakRatioBoverA']),
            })
        per_material.append({
            'material': short,
            'publishedPoints': ['sem envelhecimento', '720 s'] if block else [],
            'ratios': None if not block else {
                'Dg': value('derived', block['Dg_ratio'], source='Tabela 1 (envelhecido ÷ sem envelhecimento)'),
                'D05': value('derived', block['D0.5_ratio']),
                'D15': value('derived', block['D1.5_ratio']),
                'sigmaGChange': value('derived', block['sigma_g_change']),
                'numberRatioIfVolumeConserved': value('model_assumption', block['numberRatioIfVolumeConserved'],
                                                      note='Se M3 se conserva, M0 escala com D1.5^-3.'),
            },
            'longAgingTests': measured,
            'measuredNumberChange': value('unavailable', None,
                                          reason='O P-Trak está sob diluição em malha fechada: sua contagem não é proporcional à concentração.'),
        })
    return {'publishedAgingTimes_s': [0, 720],
            'note': ('Só existem dois pontos publicados por material (sem envelhecimento e 720 s); o teste 46 (lamp wick) '
                     'teve cerca de 30 min. Não há curva contínua de evolução.'),
            'shortSecondaryWindowsNote': ('Janelas secundárias com intervalo de 14 a 140 s não são interpretadas: '
                                          'refletem o volume residual da câmara, não um processo do aerossol.'),
            'materials': per_material}


def dusttrak_ratio(data: dict) -> dict:
    flight = data['analysis']['flight']
    detectors = {d['test']: d for d in flight['detectors']}
    rows = []
    for key, short, _, _ in MATERIALS:
        block = flight['dusttrakRatio'].get(key)
        per_test = [{'test': t, 'value': value('measured', round(detectors[t]['dusttrakB_mg_m3'] / detectors[t]['dusttrakA_mg_m3'], 3)
                                                if detectors[t]['dusttrakA_mg_m3'] else None)}
                    for t in sorted(detectors) if detectors[t]['material'] == key]
        entry = {'material': short, 'perTest': per_test}
        if block:
            published = block['published08ICES_BoverA']['value']
            entry.update({
                'mean': value('derived', stat(block['primaryBoverA'])),
                'published': value('published', published, source='08ICES-2089, Tabela 1 (Apêndice D do relatório final)'),
                'relativeDifference': value('derived', round((block['primaryBoverA']['mean'] - published) / published, 3)),
                'nasaAveragingSheets': value('measured', block['nasaAveragingSheetBoverA']),
                'massFractionAbove1umFromDustTraks': value('derived', stat(block['massFractionAbove1umFromDustTraks']),
                                                           note='(B - A)/B: supõe sinal proporcional à massa e mesma diluição.'),
                'lognormalExpectation': value('model_assumption',
                                              round(1 / (1 - block['lognormalMassFractionAbove1um_Table1']['value']), 3),
                                              note='1/(1 - fração de massa > 1 um) da lognormal da Tabela 1, com corte geométrico.'),
            })
        else:
            entry['note'] = 'DBP: DustTrak A quase zero (B/A de 30 a 771); fora da Tabela 1.'
        rows.append(entry)
    return {'window': 'janela primária, mediana do platô (DustTrak B >= 50 % do máximo)', 'materials': rows,
            'caveat': NOTICES[4][1]}


INSTRUMENTS = [
    {'id': 'ptrak', 'name': 'P-Trak (TSI)', 'principle': 'Contador de núcleos de condensação (isopropanol)',
     'moment': 'M0', 'unit': 'pt/cc', 'range': '0 a 1e5 /cm³; 20 nm a 1 um',
     'calibration': value('unavailable', None, reason='Curvas por tamanho (DOP, Fig. 7) sem coeficientes publicados.'),
     'limitations': ['Diluição dinâmica em malha fechada: leitura não proporcional à concentração.',
                     'Código de erro -999 e leituras acima de 1e5 nos dados de voo.']},
    {'id': 'ion', 'name': 'Câmara de ionização', 'principle': 'Queda da corrente iônica (Am-241) por ligação de íons às partículas',
     'moment': '≈ M1 (proporcional, não igual)', 'unit': 'V',
     'range': '~1e5 /cm³, sem diluição',
     'calibration': value('unavailable', None, reason='Correlação única contra o EAD (Fig. 8) sem coeficientes publicados.'),
     'limitations': ['Depende do baseline de cada teste.', 'Pouca dependência do tamanho segundo a calibração NIST.']},
    {'id': 'dusttrak', 'name': 'DustTrak A (1 um) e B (10 um) (TSI)', 'principle': 'Espalhamento a 90° de laser vermelho',
     'moment': '≈ M3, dependente do tamanho', 'unit': 'mg/m³ (escala de fábrica)', 'range': '0,001 a 100 mg/m³',
     'calibration': value('unavailable', None, reason='Fator TEOM por fonte de fumaça e densidades estimadas não publicados.'),
     'limitations': ['Proporcional a M3 só entre ~0,2 e 2 um.', 'Corte do impactador é aerodinâmico.',
                     'Diluição fixa em alguns testes.']},
    {'id': 'iss', 'name': 'Detector de fumaça da ISS', 'principle': 'Espalhamento direto a 30° de laser IR + transmissão',
     'moment': 'nenhum momento único (pesa partículas > ~0,3-1 um)', 'unit': 'V',
     'range': 'sensibilidade mínima 0,3 um',
     'calibration': value('unavailable', None, reason='Ajustado a 1 %/pé de obscurecimento (UL); sem conversão dos volts de voo.'),
     'limitations': ['Satura em cerca de -6,25 V no arquivo (silicone, lamp wick, DBP).',
                     'Pouco sensível abaixo do comprimento de onda: resposta fraca ao Teflon.']},
    {'id': 'sts', 'name': 'Detector de fumaça do Space Shuttle (STS)', 'principle': 'Ionização com bomba e separador inercial (> 1 um)',
     'moment': '~M1 de partículas < 1 um', 'unit': 'V', 'range': 'alarme de projeto: 2 mg/m³ (partículas de 1 um)',
     'calibration': value('unavailable', None, reason='Sem conversão dos volts de voo.'),
     'limitations': ['Desligado (STSDetectorPower = 0) nos testes de envelhecimento longo.']},
]


def detectors(data: dict) -> dict:
    responses = []
    for d in data['analysis']['flight']['detectors']:
        responses.append({
            'test': d['test'], 'material': SHORT[d['material']],
            'dusttrakB': value('measured', d['dusttrakB_mg_m3'], 'mg/m³'),
            'dusttrakA': value('measured', d['dusttrakA_mg_m3'], 'mg/m³'),
            'ionBDelta': value('measured', d['ionB_delta_V'], 'V'),
            'issScatterDelta': value('measured', d['issScatter_delta_V'], 'V', clipped=d['issScatterClipped']),
            'issObscurationDelta': value('measured', d['issObscuration_delta_V'], 'V'),
            'stsDelta': (value('measured', d['sts_delta_V'], 'V', powered=True) if d['stsPowered']
                         else value('unavailable', None, 'V', powered=False, reason='Detector STS desligado neste teste.')),
            'ageAtPlateauStart_s': value('measured', d['ageAtPlateauStart_s'], 's'),
        })
    summary = []
    for key, short, _, _ in MATERIALS:
        own = [d for d in data['analysis']['flight']['detectors'] if d['material'] == key]
        iss = [d['issScatter_delta_V'] for d in own]
        clipped = sum(d['issScatterClipped'] for d in own)
        sts = [d['sts_delta_V'] for d in own if d['stsPowered']]
        summary.append({
            'material': short, 'tests': [d['test'] for d in own],
            'ionBDeltaRange': value('measured', [min(d['ionB_delta_V'] for d in own), max(d['ionB_delta_V'] for d in own)], 'V'),
            'issScatterDeltaRange': value('measured', [min(iss), max(iss)], 'V', clippedTests=clipped),
            'stsDeltaRange': value('measured', [min(sts), max(sts)], 'V') if sts else value('unavailable', None, 'V',
                                                                                             reason='STS desligado em todos os testes processados.'),
        })
    return {'window': 'janela primária; delta = mediana do platô - baseline (30 s antes da primeira janela)',
            'instruments': INSTRUMENTS, 'responses': responses, 'byMaterial': summary,
            'note': 'Volts de voo sem calibração; os sinais dos detectores não são grandezas equivalentes entre si.'}


def moment_method() -> dict:
    return {
        'source': f'{REPORT}, §3.A, Eqs. 1-13 (pp. 4-9)',
        'definitions': [
            {'symbol': 'f_N(D) = dN/dD', 'meaning': 'distribuição numérica (partículas por volume por diâmetro)'},
            {'symbol': 'M_i = ∫ D^i f_N(D) dD', 'meaning': 'momento de ordem i'},
            {'symbol': 'M0 = Nt', 'meaning': 'concentração numérica (P-Trak)'},
            {'symbol': 'M1', 'meaning': '"concentração de diâmetro" (≈ câmara de ionização)'},
            {'symbol': 'M3', 'meaning': 'proporcional ao volume/massa (≈ DustTrak)'},
            {'symbol': 'D0.5 = M1/M0', 'meaning': 'diâmetro médio aritmético (CMD)'},
            {'symbol': 'D1.5 = (M3/M0)^(1/3)', 'meaning': 'diâmetro de massa média'},
            {'symbol': 'Dg = sqrt(D0.5³ / D1.5)', 'meaning': 'diâmetro geométrico médio (Eq. 7)'},
            {'symbol': 'σg = exp(sqrt(ln(D1.5/D0.5)))', 'meaning': 'desvio-padrão geométrico (Eq. 8)'},
        ],
        'hypothesis': value('model_assumption', 'lognormal unimodal',
                            note='Três parâmetros (Nt, Dg, σg) e portanto três momentos; Hatch-Choate D_p = Dg·exp(p·ln²σg).'),
        'verification': value('derived', {'Dg_um': 1.0, 'sigmaG': 1.6, 'D05_um': 1.117, 'D15_um': 1.393},
                              note='Exemplo da Fig. 3 do relatório reproduzido pela implementação (scripts/same/moment_method.py).'),
        'calculated': ['Dg e σg a partir dos D0.5 e D1.5 publicados (Tabela 1)',
                       'Consequências lognormais: mediana de massa, frações acima de 300 nm e 1 um'],
        'measured': ['Sinais de voo em unidades do instrumento (pt/cc, mg/m³, V)', 'Razão DustTrak B/A',
                     'Rt/R0 do fio, vazão LFE, idade da fumaça nas janelas'],
        'notReconstructible': ['M0, M1 e M3 por teste', 'Dg, σg e Nt por teste',
                               'Distribuição de tamanhos por teste'],
        'missing': ['Razões de diluição (P-Trak em malha fechada; diluição fixa dos DustTraks)',
                    'Coeficientes de calibração NIST (P-Trak por tamanho, ionização vs EAD, DustTrak vs TEOM por fonte)',
                    'Densidades estimadas dos materiais'],
        'notice': MOMENTS_NOTICE,
    }


def unavailable() -> list[dict]:
    items = [
        ('M0, M1 e M3 por teste', MOMENTS_NOTICE),
        ('Dg, σg e Nt por teste', 'Dependem dos momentos por teste.'),
        ('Temperatura do fio', 'O coeficiente do fio não foi aplicado; só Rt/R0 é medido.'),
        ('Taxa de perda de massa por teste', 'Não consta dos arquivos PSI-102; a tabela PSI traz apenas a matriz planejada.'),
        ('Velocidade do ar em cm/s', 'A vazão LFE (sccm) exige a área do duto para conversão.'),
        ('Efeito isolado do fluxo de ar', 'Não há variação de fluxo dentro de um mesmo material nos testes processados.'),
        ('Variação medida do número de partículas no envelhecimento', 'P-Trak sob diluição em malha fechada.'),
        ('Modelo preditivo de geração/crescimento', 'Material e set-point confundidos; faltam Nt absoluto e temperatura.'),
    ]
    return [{'quantity': name, 'kind': 'unavailable', 'value': None, 'reason': reason} for name, reason in items]


def build() -> dict:
    data = load()
    inv = data['inventory']['investigation']
    return {
        'schemaVersion': 1,
        'statement': ('Evidência de fumaça e detecção do SAME (PSI-102): resultados publicados, sinais de voo e '
                      'cálculos reproduzidos, cada um rotulado. Não é um simulador de partículas.'),
        'kinds': {
            'published': 'Publicado pela NASA/NIST (página ou tabela citada)',
            'measured': 'Sinal de voo, em unidades do instrumento',
            'derived': 'Calculado a partir de números publicados ou medidos',
            'model_assumption': 'Consequência da hipótese lognormal aplicada a parâmetros publicados',
            'unavailable': 'Não pode ser calculado com os arquivos PSI-102',
        },
        'investigation': {
            'id': inv['id'], 'acronym': inv['acronym'], 'title': inv['title'], 'doi': inv['doi'],
            'portal': 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-102',
            'platform': 'Microgravity Science Glovebox (MSG), International Space Station',
            'flight': 'Expedição 15, setembro e início de outubro de 2007',
            'principalInvestigator': 'David L. Urban (NASA GRC); NIST: T. Cleary, J. Yang, G. Mulholland',
            'objective': ('Medir a distribuição de tamanhos da fumaça de materiais de espaçonave superaquecidos abaixo da '
                          'ignição, em microgravidade, e a resposta dos detectores da ISS e do Space Shuttle, para '
                          'orientar o projeto de detectores futuros.'),
            'agingRange': value('published', [10, 1800], 's', source=f'{REPORT}, Resumo'),
            'flightTests': value('published', data['inventory']['flightLog']['tests'], source=f'{REPORT}, Apêndice A'),
        },
        'notices': [{'id': key, 'text': text} for key, text in NOTICES],
        'materials': materials(data),
        'coverage': coverage(data),
        'table1': table1(data),
        'earlierPublishedVersions': earlier(data),
        'aging': aging(data),
        'dusttrakRatio': dusttrak_ratio(data),
        'detectors': detectors(data),
        'momentMethod': moment_method(),
        'unavailable': unavailable(),
        'sources': [
            {'label': REPORT, 'url': 'https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=904707'},
            {'label': 'NASA PSI-102 (SAME), DOI 10.60555/gd4k-8h62', 'url': 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-102'},
            {'label': 'Revisão dos dados (P0/P1)', 'path': 'docs/research/SAME_DATA_REVIEW.md'},
            {'label': 'Método dos momentos', 'path': 'docs/research/SAME_MOMENT_METHOD.md'},
            {'label': 'Análise científica', 'path': 'docs/research/SAME_ANALYSIS.md'},
        ],
        'provenance': {
            'generator': 'scripts/same/build_same_replay.py',
            'inputs': {key: {'path': path.relative_to(ROOT).as_posix(), 'sha256LfNormalised': digest(path)}
                       for key, path in INPUTS.items()},
        },
    }


def render(value_: dict) -> str:
    return json.dumps(value_, ensure_ascii=False, separators=(',', ':')) + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    text = render(build())
    if args.check:
        same = OUTPUT.exists() and normalised_text(OUTPUT) == text
        print('reproduzível' if same else 'DIVERGENTE')
        return 0 if same else 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(text.encode('utf-8'))
    print(f'{OUTPUT.relative_to(ROOT).as_posix()}: {len(text.encode("utf-8"))} bytes')
    return 0


if __name__ == '__main__':
    sys.exit(main())
