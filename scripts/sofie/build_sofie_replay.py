"""Interface artefact for the HabitatFire "SoFIE-GEL — Published Experimental Evidence" module.

    python scripts/sofie/build_sofie_replay.py          # writes public/data/sofie/gel-evidence.json
    python scripts/sofie/build_sofie_replay.py --check  # verifies the committed file is reproduced exactly

Inputs are only versioned P0/P1 files (data/sofie/gel-extinction-cases-ntrs20240007628.json, data/sofie/pilot/
pilot-1410c.json, data/sofie/docs-manifest.json); the git-ignored cache is never read. Every value carries one kind:
    published          printed in a NASA/NIST-affiliated source (NTRS 20240007628, CNF 2025 abstract, NASA captions)
    derived            computed here from published numbers (equation given)
    video_observation  read from the public video file itself (metadata, frame cadence, edit transition)
    exploratory        statistic of the public video under stated choices; not validated, never a model parameter
    hypothesis         an interpretation that the available data cannot decide
    unavailable        not obtainable from public data (reason given); value is null
Published results and video results live in separate top-level blocks and are never merged.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / 'data/sofie/gel-extinction-cases-ntrs20240007628.json'
PILOT = ROOT / 'data/sofie/pilot/pilot-1410c.json'
MANIFEST = ROOT / 'data/sofie/docs-manifest.json'
OUTPUT = ROOT / 'public/data/sofie/gel-evidence.json'
SYMPOSIUM = "Li C., T'ien J.S., Ferkul P.V., Olson S.L., Johnston M.C., NASA NTRS 20240007628, Tabela 1"
CNF = "T'ien J.S., Li C., Ferkul P.V., Olson S.L., Johnston M.C., Combustion and Flame 277 (2025) 114244 (resumo)"
EXPLORATORY_LABEL = 'Análise exploratória — não validada experimentalmente'
LIMITATIONS = [
    ('no-telemetry', 'Não há telemetria bruta pública (O₂, pressão, fluxo, termopares) para nenhum teste SoFIE-GEL.'),
    ('no-flight-video', 'Não há vídeos originais de voo públicos; o único vídeo é uma edição de divulgação do teste 1410C.'),
    ('no-scale', 'O vídeo público não tem calibração espacial: nenhuma medida em mm é extraída dele.'),
    ('time-base', 'A base temporal do vídeo é ambígua: cada quadro-fonte aparece 3 vezes (tempo real a 10 fps ou câmera lenta 3x).'),
    ('five-cases', 'Cinco casos publicados não sustentam generalização preditiva nem uma regra de extinção.'),
    ('spin-unvalidated', 'A frequência de rotação medida no vídeo não está validada e não é parâmetro de modelo.'),
    ('geometry', 'A esfera de PMMA não é equivalente às amostras planas do BASS-II nem às placas do Saffire.'),
]


def text(path: Path) -> str:
    return path.read_text(encoding='utf-8').replace('\r\n', '\n')


def digest(path: Path) -> str:
    return hashlib.sha256(text(path).encode('utf-8')).hexdigest()


def val(kind: str, value, unit: str | None = None, **extra) -> dict:
    entry = {'kind': kind, 'value': value}
    if unit:
        entry['unit'] = unit
    entry.update(extra)
    return entry


def cases(table: dict) -> list[dict]:
    radius = table['sample']['diameter_cm'] / 2
    out = []
    for case in table['cases']:
        dyn = table['dynamics'].get(case['sample'], {})
        heat = case['conductiveHeatLoss_W_cm2']
        out.append({
            'case': case['case'], 'sample': case['sample'],
            'extinctionMode': val('published', case['mode']),
            'location': val('published', case['location']),
            'flow': val('published', case['flow_cm_s'], 'cm/s'),
            'o2AtExtinction': val('published', case['o2_pct'], '%'),
            'pressure': val('published', case['p_atm'], 'atm'),
            'reynolds': val('published', case['reynolds']),
            'strainRate': val('published', case['strainRate_per_s'], '1/s'),
            'conductiveHeatLoss': (val('published', heat, 'W/cm²') if heat is not None
                                   else val('unavailable', None, 'W/cm²', reason='"not recorded" na Tabela 1')),
            'strainRateCheck': val('derived', round(1.5 * case['flow_cm_s'] / radius, 3), '1/s',
                                   equation='a = 3U/(2R), R = 2 cm (nota b da Tabela 1)'),
            'impliedViscosity': val('derived', round(case['flow_cm_s'] * table['sample']['diameter_cm'] / case['reynolds'], 4),
                                    'cm²/s', equation='ν = U·D/Re (Re a temperatura ambiente, nota a)'),
            'publishedDynamics': {key: val('published', value) for key, value in dyn.items()},
        })
    return out


def video_block(pilot: dict) -> dict:
    spin = pilot['spin']
    summary = spin['summary']
    windows = [{'video_s': w['video_s'], 'status': w['status'],
                **({'peak_Hz': w['peak_Hz'], 'peakPower': w['peakPower'], 'threshold99': w['threshold99'],
                    'significant': w['significant']} if w['status'] == 'analysed' else {})}
               for w in spin['windows']]
    published = pilot['published']
    return {
        'label': EXPLORATORY_LABEL,
        'test': '1410C',
        'video': {
            'kind': 'video_observation', 'title': 'SoFIE-GEL - flame appearing to spin itself into extinction',
            'origin': 'https://images.nasa.gov/details/SoFIE-GEL', 'publicRelease': '2023-05-05',
            'sha256': pilot['video']['sha256'], 'codec': pilot['video']['codec'],
            'resolution': [pilot['video']['width'], pilot['video']['height']], 'fps': pilot['video']['fps'],
            'duration_s': pilot['video']['duration_s'], 'frames': pilot['video']['framesDecoded'],
            'association': pilot['video']['associationEvidence'], 'overlay': pilot['video']['overlay'],
            'editing': 'edição de divulgação (Adobe Premiere Pro 2023) com trilha sonora; não é o arquivo de voo',
        },
        'cadence': val('video_observation', pilot['cadence']['period'],
                       uniqueFramesPerVideoSecond=pilot['cadence']['uniqueFramesPerVideoSecond'],
                       note='cada quadro-fonte aparece em 3 quadros consecutivos do MP4'),
        'editTransition_video_s': val('video_observation', [pilot['sceneChanges']['video_s'][0], pilot['sceneChanges']['video_s'][-1]]),
        'segments': [val('video_observation', s['video_s'], 's') for s in pilot['segments']],
        'method': {'kind': 'exploratory', 'signal': spin['signal'], 'window_s': spin['window_s'], 'step_s': spin['step_s'],
                   'permutations': spin['permutations'], 'seed': spin['seed'], 'spinFloor_Hz': 1.0,
                   'nyquist_videoHz': spin['nyquist_videoHz']},
        'windows': val('exploratory', windows, 'Hz (tempo de vídeo)'),
        'summary': val('exploratory', {'spinningWindows': summary['spinningWindows'],
                                       'analysedWindows': summary['analysedWindows'],
                                       'peakRange_videoHz': summary['peakRange_videoHz'],
                                       'spinningSpan_video_s': summary['spinningSpan_video_s']}),
        'timeBase': {
            'H1_realTime': val('hypothesis', summary['hypotheses']['H1_realTime']['physical_Hz_range'], 'Hz',
                               assumes=summary['hypotheses']['H1_realTime']['assumes'],
                               windowsInsidePublishedRange=summary['hypotheses']['H1_realTime']['windowsInsidePublishedRange']),
            'H2_slowMotion': val('hypothesis', summary['hypotheses']['H2_slowMotion']['physical_Hz_range'], 'Hz',
                                 assumes=summary['hypotheses']['H2_slowMotion']['assumes'],
                                 windowsInsidePublishedRange=summary['hypotheses']['H2_slowMotion']['windowsInsidePublishedRange']),
            'note': ('A faixa publicada foi usada para comparar as hipóteses; por isso não serve como validação '
                     'independente. A duração da fase giratória (~30 s de vídeo) é coerente com ~35 s publicados só sob H1.'),
        },
        'aliasing': val('hypothesis', 'componentes acima de 5 Hz de vídeo aparecem refletidas (ex.: 6 Hz → 4 Hz)',
                        note='picos de 4,2–4,4 Hz podem ser aliasing ou várias chamas passando pela face visível'),
        'publishedReference': val('published', published['spinFrequency_Hz'], 'Hz', source=SYMPOSIUM.replace('Tabela 1', '§3.5'),
                                  note='faixa de giro publicada para 1410C; mostrada lado a lado, nunca misturada'),
        'spatialScale': val('unavailable', None, 'mm/px', reason=pilot['spatialScale']['reason']),
        'useAsModelParameter': False,
    }


def build() -> dict:
    table = json.loads(text(CASES))
    pilot = json.loads(text(PILOT))
    manifest = json.loads(text(MANIFEST))
    radius = table['sample']['diameter_cm'] / 2
    built = cases(table)
    viscosities = [c['impliedViscosity']['value'] for c in built]
    return {
        'schemaVersion': 1,
        'title': 'NASA SoFIE-GEL — Published Experimental Evidence',
        'statement': ('Evidência experimental publicada sobre crescimento e extinção de chama em esfera de PMMA em '
                      'microgravidade. Não é modelo de propagação nem previsão de incêndio.'),
        'kinds': {
            'published': 'Publicado pela NASA/pesquisadores (fonte citada)',
            'derived': 'Calculado aqui a partir de números publicados (equação indicada)',
            'video_observation': 'Lido do próprio arquivo de vídeo público (metadados, cadência, transição)',
            'exploratory': 'Estatística exploratória do vídeo; não validada e não usada como parâmetro',
            'hypothesis': 'Interpretação que os dados disponíveis não decidem',
            'unavailable': 'Não obtido de dados públicos (motivo indicado)',
        },
        'investigation': {
            'name': 'SoFIE-GEL (Solid Fuel Ignition and Extinction — Growth and Extinction Limit)',
            'agency': 'NASA (Biological and Physical Sciences); hardware e operação ZIN Technologies; NASA Glenn',
            'principalInvestigator': "James S. T'ien (Case Western Reserve University)",
            'platform': 'Combustion Integrated Rack (CIR), Estação Espacial Internacional; microgravidade',
            'objective': ('Medir crescimento e extinção de chama sobre um combustível sólido espesso (esfera de PMMA) em '
                          'função da velocidade do escoamento, da fração de O₂, da pressão e do grau de aquecimento '
                          'interno do combustível.'),
            'officialPage': 'https://science.nasa.gov/biological-physical/investigations/sofie-gel/',
            'psi': val('unavailable', None, reason=('Nenhum dataset público SoFIE-GEL no NASA PSI (índice e PSI-1 a PSI-230 '
                                                    'consultados em 15/11/2026); nenhum ID PSI ou DOI de dataset atribuído.')),
            'firstTest': val('published', '2023-01-13', note='legenda NASA jsc2023e002281 (17,5 % O₂, 20 cm/s)'),
        },
        'sample': {
            'material': val('published', 'PMMA (polimetilmetacrilato)'),
            'geometry': val('published', 'esfera', note='sustentada por tubo de aço inoxidável de 6,35 mm'),
            'diameter': val('published', table['sample']['diameter_cm'], 'cm',
                            note='artigo: 4 cm; página NASA Glenn: 4–5 cm; slide de 2019: "40 cm" (provável erro)'),
            'instrumentation': val('published', '5 termopares embutidos (3 no eixo, perto do ponto de estagnação frontal)'),
            'ignition': val('published', 'fio enrolado aquecido eletricamente perto do ponto de estagnação a montante'),
        },
        'facility': {
            'duct': val('published', '13,3 × 13,3 cm de seção, 24,6 cm de comprimento'),
            'flowRange': val('published', [0.2, 80], 'cm/s', source=CNF),
            'o2Range': val('published', [13, 34], '%', source=CNF),
            'pressureRange': val('published', [0.15, 1.1], 'atm', source=CNF),
            'chamberFreeVolume': val('published', 85.7, 'L'),
            'cameras': val('published', '3 × Sony FCB-MA130 (1400 × 1200 px) + Allied Vision GC-1380CH (1360 × 1024 px); 30 fps citado'),
            'extinctionMethod': val('published', table['definitions']['extinctionMethod']),
        },
        'cases': {
            'source': SYMPOSIUM, 'transcription': table['transcription'],
            'definitions': table['definitions'], 'rows': built,
            'consistency': {
                'strainRate': val('derived', round(max(abs(c['strainRateCheck']['value'] - c['strainRate']['value']) for c in built), 4),
                                  '1/s', note='maior diferença |3U/(2R) − a publicado|; limite de arredondamento 0,00875'),
                'viscosity': val('derived', [min(viscosities), max(viscosities)], 'cm²/s',
                                 note='uma única viscosidade explica todos os Re (ar a temperatura ambiente)'),
                'radius_cm': radius,
            },
        },
        'publishedFindings': [
            val('published', 'Dois modos de extinção: quenching a baixa velocidade (ponta da chama recua para a estagnação) '
                             'e blowoff a alta velocidade (buraco no ponto de estagnação).', source=SYMPOSIUM.replace(', Tabela 1', '')),
            val('published', 'Os ramos de quenching e blowoff se encontram em taxa de deformação de 7,5 1/s; O₂ mínimo '
                             'ligeiramente abaixo de 14 %.', source=CNF),
            val('published', 'Mais pré-aquecimento do combustível alarga o domínio inflamável.', source=CNF),
            val('published', 'Cerca de 7 h de queima de PMMA em microgravidade registradas.', source=CNF),
        ],
        'video1410C': video_block(pilot),
        'context': {
            'role': ('Evidência especializada em crescimento de chama sobre combustível esférico, condições de extinção, '
                     'efeito das condições ambientais e resposta da chama ao fluxo.'),
            'notConnectedTo': ['modelo BASS-II', 'cabine 3D', 'catálogo PSI'],
            'noUniversalRule': True,
        },
        'limitations': [{'id': key, 'text': value} for key, value in LIMITATIONS],
        'sources': [
            {'label': SYMPOSIUM.replace(', Tabela 1', ''), 'url': 'https://ntrs.nasa.gov/citations/20240007628'},
            {'label': CNF.replace(' (resumo)', '') + ' — texto completo não obtido (HTTP 403)', 'url': 'https://doi.org/10.1016/j.combustflame.2025.114244'},
            {'label': 'NASA SoFIE-GEL', 'url': 'https://science.nasa.gov/biological-physical/investigations/sofie-gel/'},
            {'label': 'Vídeo público SoFIE-GEL (teste 1410C)', 'url': 'https://images.nasa.gov/details/SoFIE-GEL'},
            {'label': 'Revisão dos dados', 'path': 'docs/research/SOFIE_DATA_REVIEW.md'},
            {'label': 'Revisão do piloto', 'path': 'docs/research/SOFIE_PILOT_REVIEW.md'},
        ],
        'provenance': {
            'generator': 'scripts/sofie/build_sofie_replay.py',
            'inputs': {name: {'path': path.relative_to(ROOT).as_posix(), 'sha256LfNormalised': digest(path)}
                       for name, path in (('cases', CASES), ('pilot', PILOT), ('manifest', MANIFEST))},
            'symposiumPdfSha256': next(e['sha256'] for e in manifest['files'] if e['id'] == 'gel-symposium-2024'),
        },
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
