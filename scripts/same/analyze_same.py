"""First SAME analysis: Table 1 reproduction from published diameters, lognormal consequences, and the
calibration-independent checks that the flight housekeeping allows.

    python scripts/same/analyze_same.py            # writes data/same/derived/same-analysis.json and the figures
    python scripts/same/analyze_same.py --check    # JSON reproducible from same-tests.json (figures not compared)

Kinds of number in the output (field "kind"):
- "published"  : transcribed from the Final Science Report (page and table cited);
- "derived"    : computed here from published numbers with the report's equations (moment_method);
- "measured"   : a statistic of the flight housekeeping in instrument units (normalize_same windows);
- "model"      : a consequence of the lognormal assumption applied to published parameters (not a measurement).
Nothing here is a calibrated moment of the flight data and no SAME number is turned into a flame speed.
"""
from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import moment_method as mm  # noqa: E402
import normalize_same as normalize  # noqa: E402

ROOT = normalize.ROOT
TESTS = normalize.OUTPUT
OUTPUT = normalize.inventory.DERIVED / 'same-analysis.json'
FIGURES = ROOT / 'docs/research/img/same'
SOLIDS = ('Kapton', 'Lamp wick (cellulose)', 'Silicone rubber', 'Teflon')
SHORT = {'Kapton': 'Kapton', 'Lamp wick (cellulose)': 'Lamp wick', 'Silicone rubber': 'Silicone', 'Teflon': 'Teflon'}

# Final Science Report (NIST/NASA, 15 Mar 2010), §5, p. 17, Table 1 "Results of SAME flight tests". Diameters in nm.
# The report states (p. 15) that the rows are "baseline runs (no aging) and 720 second aging runs".
FINAL_TABLE1 = [
    # material, aged, Dg, D0.5 (arithmetic mean), D1.5 (diameter of average mass), sigma_g
    ('Kapton', False, 80, 105, 179, 2.08),
    ('Kapton', True, 155, 186, 267, 1.82),
    ('Lamp wick (cellulose)', False, 186, 227, 341, 1.89),
    ('Lamp wick (cellulose)', True, 258, 308, 438, 1.81),
    ('Silicone rubber', False, 189, 257, 472, 2.18),
    ('Silicone rubber', True, 352, 422, 606, 1.83),
    ('Teflon', False, 170, 205, 297, 1.84),
    ('Teflon', True, 228, 273, 392, 1.82),
]
# Earlier published versions of the same quantities (appendices of the Final Science Report).
EARLIER = {
    'AIAA-2008-0806 (Apêndice E, p. E-6, Tabela 1)': {
        'quantity': 'D0.5 (count mean diameter), baseline runs, nm, from calibrated P-Trak and ion signals', 'values': {
            'Silicone rubber': 263, 'Teflon': 223, 'Lamp wick (cellulose)': 248, 'Kapton': 114}},
    '08ICES-2089 (Apêndice D, p. D-7, Tabela 1)': {
        'quantity': 'D0.5 média dos testes sem envelhecimento (nm) e razão DustTrak B/DustTrak A', 'values': {
            'Silicone rubber': [227, 1.92], 'Teflon': [158, 1.22], 'Lamp wick (cellulose)': [172, 1.79], 'Kapton': [128, 1.26]}},
    'AIAA-2009-956 (Apêndice C, p. C-6, Tabela 1)': {
        'quantity': 'Dg, D0.5, D1.5 em um (baseline runs); "Silicone results did not converge"', 'values': {
            'Kapton': [0.080, 0.105, 0.172], 'Lamp wick (cellulose)': [0.186, 0.227, 0.420],
            'Silicone rubber': [0.189, None, None], 'Teflon': [0.159, 0.205, 0.219]}},
}
DUSTTRAK_CUT_NM = 1000.0     # DustTrak A impactor cut (aerodynamic); used below as a geometric cut, see the note
ISS_MIN_NM = 300.0           # minimum ISS detector sensitivity quoted in §2 (0.3 um)


def table1() -> list[dict]:
    rows = []
    for material, aged, dg, d05, d15, sg in FINAL_TABLE1:
        fit = mm.lognormal_from_diameters(d05, d15)
        dist = mm.Lognormal(1.0, fit['Dg'], fit['sigma_g'])
        rows.append({
            'material': material, 'aged': aged,
            'published': {'kind': 'published', 'Dg_nm': dg, 'D0.5_nm': d05, 'D1.5_nm': d15, 'sigma_g': sg},
            'recomputed': {'kind': 'derived', 'Dg_nm': round(fit['Dg'], 1), 'sigma_g': round(fit['sigma_g'], 3),
                           'dDg_nm': round(fit['Dg'] - dg, 1), 'dSigma_g': round(fit['sigma_g'] - sg, 3)},
            'lognormal': {'kind': 'model', 'massMedian_nm': round(mm.hatch_choate(fit['Dg'], fit['sigma_g'], 3), 0),
                          'numberFractionAbove300nm': round(mm.number_fraction_above(dist, ISS_MIN_NM), 3),
                          'numberFractionAbove1um': round(mm.number_fraction_above(dist, DUSTTRAK_CUT_NM), 4),
                          'massFractionAbove1um': round(mm.mass_fraction_above(dist, DUSTTRAK_CUT_NM), 3),
                          'numberPerUnitVolumeRelative': round(1 / (d15 / 100.0) ** 3, 4)},
        })
    return rows


def aging_from_table1(rows: list[dict]) -> dict:
    out = {}
    for material in SOLIDS:
        base = next(r for r in rows if r['material'] == material and not r['aged'])['published']
        aged = next(r for r in rows if r['material'] == material and r['aged'])['published']
        ratio_d15 = aged['D1.5_nm'] / base['D1.5_nm']
        out[material] = {
            'kind': 'derived',
            'Dg_ratio': round(aged['Dg_nm'] / base['Dg_nm'], 3),
            'D0.5_ratio': round(aged['D0.5_nm'] / base['D0.5_nm'], 3),
            'D1.5_ratio': round(ratio_d15, 3),
            'sigma_g_change': round(aged['sigma_g'] - base['sigma_g'], 2),
            # If the third moment (particle volume) is conserved, M0 scales as D1.5^-3 (coagulation without losses).
            'numberRatioIfVolumeConserved': round(ratio_d15 ** -3, 3),
        }
    return out


def earlier_consistency() -> dict:
    out = {}
    for source, block in EARLIER.items():
        entries = {}
        for material, value in block['values'].items():
            entry = {'kind': 'published', 'value': value}
            if source.startswith('AIAA-2009') and value[0] and value[1] and value[2]:
                fit = mm.lognormal_from_diameters(value[1], value[2])
                entry['DgFromEq7_um'] = round(fit['Dg'], 3)
                entry['consistentWithEq7'] = abs(fit['Dg'] - value[0]) / value[0] < 0.05
            entries[material] = entry
        out[source] = {'quantity': block['quantity'], 'entries': entries}
    return out


def mean_sd(values: list[float]) -> dict:
    values = [v for v in values if v is not None]
    if not values:
        return {'n': 0}
    return {'n': len(values), 'mean': round(statistics.fmean(values), 3),
            'sd': round(statistics.stdev(values), 3) if len(values) > 1 else None,
            'min': round(min(values), 3), 'max': round(max(values), 3)}


def windows(test: dict) -> dict:
    hk = test.get('housekeeping') or {}
    return {window['role']: window for window in hk.get('windows', [])}


def flight_checks(tests: list[dict], rows: list[dict]) -> dict:
    processed = [t for t in tests if t['housekeeping']]
    ratio = {}
    lognormal_mass = {r['material']: r['lognormal']['massFractionAbove1um'] for r in rows if not r['aged']}
    published_ratio = EARLIER['08ICES-2089 (Apêndice D, p. D-7, Tabela 1)']['values']
    for material in SOLIDS:
        own = [t for t in processed if t['material'] == material]
        values = [windows(t)['primary']['dusttrakRatioBoverA'] for t in own if 'primary' in windows(t)]
        stats = mean_sd(values)
        frac = mean_sd([1 - 1 / v for v in values if v])
        nasa = [w['dusttrakRatioBoverA_means'] for t in tests if t['material'] == material for w in t['nasaAveragingWindows']
                if w['role'] == 'primary' and w['samples'] < 400]
        ratio[material] = {
            'kind': 'measured', 'tests': [t['test'] for t in own], 'primaryBoverA': stats,
            'massFractionAbove1umFromDustTraks': frac,
            'nasaAveragingSheetBoverA': nasa,
            'published08ICES_BoverA': {'kind': 'published', 'value': published_ratio[material][1]},
            'lognormalMassFractionAbove1um_Table1': {'kind': 'model', 'value': lognormal_mass[material]},
        }
    aging = {}
    for material in SOLIDS:
        long_tests = [t for t in processed if t['material'] == material and t['housekeeping']['secondaryAgingClass'] == 'long']
        aging[material] = {
            'kind': 'measured', 'tests': [t['test'] for t in long_tests],
            'secondaryAge_s': [windows(t)['secondary'].get('ageAtPlateauStart_s') for t in long_tests],
            'dusttrakBSecondaryOverPrimary': mean_sd([t['housekeeping']['dusttrakBSecondaryOverPrimary'] for t in long_tests]),
            'BoverA_primary': mean_sd([windows(t)['primary']['dusttrakRatioBoverA'] for t in long_tests]),
            'BoverA_secondary': mean_sd([windows(t)['secondary']['dusttrakRatioBoverA'] for t in long_tests]),
        }
    detectors = []
    for t in processed:
        if t['material'] not in SOLIDS + ('DBP (dibutyl phthalate on cotton wick)',):
            continue
        p = windows(t).get('primary')
        if not p:
            continue
        c = p['channels']
        detectors.append({
            'kind': 'measured', 'test': t['test'], 'material': t['material'],
            'dusttrakB_mg_m3': c['dusttrakB']['median'], 'dusttrakA_mg_m3': c['dusttrakA']['median'],
            'ionB_delta_V': c['ionB'].get('deltaFromBaseline'), 'ionA_delta_V': c['ionA'].get('deltaFromBaseline'),
            'issScatter_delta_V': c['issScatter'].get('deltaFromBaseline'),
            'issScatterClipped': bool(c['issScatter'].get('clippedAtRail')),
            'issObscuration_delta_V': c['issObscuration'].get('deltaFromBaseline'),
            'sts_delta_V': c['sts'].get('deltaFromBaseline'), 'stsPowered': c['sts'].get('powered'),
            'RtOverR0': t['housekeeping']['conditions']['RtOverR0'],
            'ageAtPlateauStart_s': p.get('ageAtPlateauStart_s'),
        })
    conditions = {}
    for material in SOLIDS + ('DBP (dibutyl phthalate on cotton wick)',):
        own = [t for t in processed if t['material'] == material]
        conditions[material] = {
            'kind': 'measured', 'tests': [t['test'] for t in own],
            'RtOverR0': mean_sd([t['housekeeping']['conditions']['RtOverR0'] for t in own]),
            'heating_s': mean_sd([t['housekeeping']['conditions']['heatingSamples_s'] for t in own]),
            'lfeFlowDuringHeating_sccm_median': mean_sd([(t['housekeeping']['conditions']['lfeFlowDuringHeating_sccm'] or {}).get('median') for t in own]),
        }
    return {'dusttrakRatio': ratio, 'aging': aging, 'detectors': detectors, 'conditions': conditions}


def build() -> dict:
    data = json.loads(TESTS.read_text(encoding='utf-8'))
    rows = table1()
    worst = max(max(abs(r['recomputed']['dDg_nm']) for r in rows), 0)
    return {
        'schemaVersion': 1, 'investigationId': 'PSI-102',
        'inputs': {'tests': TESTS.relative_to(ROOT).as_posix(),
                   'report': 'Final Science Report, NIST/NASA, 15 mar 2010 (PSI-102 Reports), Tabela 1 p. 17 e apêndices'},
        'table1': rows,
        'table1Reproduction': {
            'kind': 'derived', 'maxAbs_dDg_nm': worst,
            'maxAbs_dSigma_g': max(abs(r['recomputed']['dSigma_g']) for r in rows),
            'statement': ('Dg e sigma_g publicados são reproduzidos a partir de D0.5 e D1.5 publicados pelas Eqs. 7-8 '
                          '(diferenças dentro do arredondamento). Isso verifica a aritmética, não a medição: D0.5 e D1.5 '
                          'dependem de calibrações e diluições que não estão nos arquivos PSI-102.')},
        'agingTable1': aging_from_table1(rows),
        'earlierPublishedVersions': earlier_consistency(),
        'flight': flight_checks(data['tests'], rows),
        'notes': {
            'dusttrakCut': ('O impactador do DustTrak A corta por diâmetro aerodinâmico (~1 um); a comparação com a fração de '
                            'massa lognormal acima de 1 um usa o diâmetro geométrico e trata o sinal do DustTrak como '
                            'proporcional à massa: é uma verificação de coerência de ordem de grandeza, não uma calibração.'),
            'ptrak': data['ptrakNote'],
            'sts': 'Nos testes de envelhecimento longo o detector STS estava desligado (STSDetectorPower = 0).',
            'iss': 'O sinal de espalhamento do detector ISS satura em cerca de -6,25 V para silicone, lamp wick, DBP e um Kapton.',
        },
    }


def render(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, indent=1) + '\n'


COLORS = {'Kapton': '#2a78d6', 'Lamp wick (cellulose)': '#eb6834', 'Silicone rubber': '#1baf7a', 'Teflon': '#eda100',
          'DBP (dibutyl phthalate on cotton wick)': '#e87ba4'}
INK, MUTED, GRID, SURFACE = '#0b0b0b', '#52514e', '#e4e3df', '#fcfcfb'


def style(axis) -> None:
    axis.set_facecolor(SURFACE)
    for side in ('top', 'right'):
        axis.spines[side].set_visible(False)
    for side in ('left', 'bottom'):
        axis.spines[side].set_color(MUTED)
    axis.tick_params(colors=MUTED, labelsize=9)
    axis.grid(True, color=GRID, linewidth=0.8)
    axis.set_axisbelow(True)


def figures(analysis: dict) -> list[str]:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import numpy as np

    FIGURES.mkdir(parents=True, exist_ok=True)
    written = []
    rows = analysis['table1']

    # 1. Diameters by material (published Table 1), unaged vs 720 s aged.
    figure, axis = plt.subplots(figsize=(8, 4.2), facecolor=SURFACE)
    style(axis)
    for index, material in enumerate(SOLIDS):
        for aged, offset, marker in ((False, -0.15, 'o'), (True, 0.15, 's')):
            row = next(r for r in rows if r['material'] == material and r['aged'] == aged)['published']
            x = index + offset
            axis.plot([x, x], [row['D0.5_nm'], row['D1.5_nm']], color=COLORS[material], linewidth=2)
            axis.plot(x, row['Dg_nm'], marker=marker, markersize=9, color=COLORS[material], markeredgecolor=SURFACE,
                      markeredgewidth=2, linestyle='none')
            axis.annotate(f"σg {row['sigma_g']:.2f}", (x, row['D1.5_nm']), textcoords='offset points', xytext=(0, 6),
                          ha='center', fontsize=8, color=MUTED)
    axis.set_xticks(range(len(SOLIDS)), [SHORT[m] for m in SOLIDS], color=INK)
    axis.set_ylabel('diâmetro (nm)', color=INK)
    axis.set_ylim(0, 700)
    axis.plot([], [], 'o', color=MUTED, label='sem envelhecimento: Dg')
    axis.plot([], [], 's', color=MUTED, label='envelhecido 720 s: Dg')
    axis.plot([], [], color=MUTED, linewidth=2, label='traço: de D0,5 a D1,5')
    axis.legend(frameon=False, fontsize=8, loc='upper left', labelcolor=INK)
    axis.set_title('SAME, Tabela 1 publicada (p. 17): Dg, D0,5 e D1,5 por material', fontsize=10, color=INK, loc='left')
    figure.tight_layout()
    figure.savefig(FIGURES / 'same-table1-diameters.png', dpi=150)
    plt.close(figure)
    written.append('same-table1-diameters.png')

    # 2. Lognormal number and mass distributions before/after aging (model from published parameters).
    figure, axes = plt.subplots(2, 4, figsize=(11, 5.2), facecolor=SURFACE, sharex=True)
    diameters = np.logspace(1, 4, 400)
    for column, material in enumerate(SOLIDS):
        for aged, line in ((False, '-'), (True, '--')):
            row = next(r for r in rows if r['material'] == material and r['aged'] == aged)['published']
            dist = mm.Lognormal(1.0, row['Dg_nm'], row['sigma_g'])
            number = [mm.density(dist, d, 0) * d for d in diameters]      # dN/dlnD, normalised to Nt = 1
            volume = [mm.density(dist, d, 3) * d for d in diameters]
            volume = np.array(volume) / mm.moment(dist, 3)
            for axis, values in ((axes[0][column], number), (axes[1][column], volume)):
                style(axis)
                axis.plot(diameters, values, line, color=COLORS[material], linewidth=2,
                          label='720 s' if aged else 'sem env.')
                axis.set_xscale('log')
        axes[0][column].set_title(SHORT[material], fontsize=10, color=INK)
        axes[1][column].axvline(1000, color=MUTED, linewidth=1, linestyle=':')
        axes[1][column].set_xlabel('D (nm)', color=INK, fontsize=9)
        axes[0][column].legend(frameon=False, fontsize=7, labelcolor=INK)
    axes[0][0].set_ylabel('número: dN/dlnD ÷ Nt', color=INK, fontsize=9)
    axes[1][0].set_ylabel('volume (massa): dM3/dlnD ÷ M3', color=INK, fontsize=9)
    figure.suptitle('Modelo lognormal com Dg e σg publicados (não é medição de distribuição); linha pontilhada = 1 µm',
                    fontsize=10, color=INK, x=0.01, ha='left')
    figure.tight_layout()
    figure.savefig(FIGURES / 'same-lognormal-aging.png', dpi=150)
    plt.close(figure)
    written.append('same-lognormal-aging.png')

    # 3. DustTrak B/A per flight test (measured) against the published average and the lognormal expectation.
    figure, axis = plt.subplots(figsize=(8, 4.2), facecolor=SURFACE)
    style(axis)
    detectors = analysis['flight']['detectors']
    ratio = analysis['flight']['dusttrakRatio']
    for index, material in enumerate(SOLIDS):
        own = [d for d in detectors if d['material'] == material]
        values = [d['dusttrakB_mg_m3'] / d['dusttrakA_mg_m3'] for d in own if d['dusttrakA_mg_m3']]
        xs = [index + (k - (len(values) - 1) / 2) * 0.08 for k in range(len(values))]
        axis.plot(xs, values, 'o', markersize=8, color=COLORS[material], markeredgecolor=SURFACE, markeredgewidth=2)
        published = ratio[material]['published08ICES_BoverA']['value']
        axis.plot([index - 0.3, index + 0.3], [published] * 2, color=INK, linewidth=2)
        expected = 1 / (1 - ratio[material]['lognormalMassFractionAbove1um_Table1']['value'])
        axis.plot([index - 0.3, index + 0.3], [expected] * 2, color=MUTED, linewidth=2, linestyle='--')
    axis.plot([], [], 'o', color=MUTED, label='teste de voo (janela primária, medido)')
    axis.plot([], [], color=INK, linewidth=2, label='média publicada (08ICES-2089, Tab. 1)')
    axis.plot([], [], color=MUTED, linewidth=2, linestyle='--', label='1/(1 − fração de massa > 1 µm), lognormal da Tab. 1')
    axis.set_xticks(range(len(SOLIDS)), [SHORT[m] for m in SOLIDS], color=INK)
    axis.set_ylabel('DustTrak B ÷ DustTrak A', color=INK)
    axis.set_ylim(1, 2.6)
    axis.legend(frameon=False, fontsize=8, loc='upper left', labelcolor=INK)
    axis.set_title('Razão entre os DustTraks (10 µm ÷ 1 µm): massa acima de ~1 µm', fontsize=10, color=INK, loc='left')
    figure.tight_layout()
    figure.savefig(FIGURES / 'same-dusttrak-ratio.png', dpi=150)
    plt.close(figure)
    written.append('same-dusttrak-ratio.png')

    # 4. Detector responses per test vs DustTrak B (instrument units), with clipping and power flags.
    figure, axes = plt.subplots(1, 3, figsize=(11, 3.8), facecolor=SURFACE)
    panels = (('ionB_delta_V', 'câmara de ionização B: Δ (V)', None),
              ('issScatter_delta_V', 'ISS espalhamento: Δ (V)', 'issScatterClipped'),
              ('sts_delta_V', 'STS (ionização): Δ (V)', None))
    for axis, (key, title, clip) in zip(axes, panels):
        style(axis)
        for d in detectors:
            if d[key] is None:
                continue
            hollow = clip and d[clip]
            axis.plot(d['dusttrakB_mg_m3'], d[key], 'o', markersize=8, color=COLORS[d['material']],
                      markerfacecolor=SURFACE if hollow else COLORS[d['material']], markeredgewidth=2)
        axis.set_xscale('log')
        axis.set_xlabel('DustTrak B (mg/m³, escala de fábrica)', color=INK, fontsize=9)
        axis.set_title(title, fontsize=10, color=INK, loc='left')
    for material in COLORS:
        axes[0].plot([], [], 'o', color=COLORS[material], label=SHORT.get(material, 'DBP'))
    axes[0].legend(frameon=False, fontsize=7, labelcolor=INK)
    axes[1].plot([], [], 'o', color=MUTED, markerfacecolor=SURFACE, markeredgewidth=2, label='saturado (−6,25 V)')
    axes[1].legend(frameon=False, fontsize=7, labelcolor=INK)
    axes[2].annotate('testes com STS desligado omitidos', (0.02, 0.02), xycoords='axes fraction', fontsize=7, color=MUTED)
    figure.suptitle('Resposta dos detectores na janela primária (medido, unidades do instrumento, sem calibração)',
                    fontsize=10, color=INK, x=0.01, ha='left')
    figure.tight_layout()
    figure.savefig(FIGURES / 'same-detectors.png', dpi=150)
    plt.close(figure)
    written.append('same-detectors.png')

    # 5. Number vs mass: relative particle number per unit particle volume, from published D1.5 (M0/M3 = D1.5^-3).
    figure, axis = plt.subplots(figsize=(8, 3.8), facecolor=SURFACE)
    style(axis)
    for index, material in enumerate(SOLIDS):
        for aged, offset in ((False, -0.17), (True, 0.17)):
            row = next(r for r in rows if r['material'] == material and r['aged'] == aged)
            value = row['lognormal']['numberPerUnitVolumeRelative']
            axis.bar(index + offset, value, width=0.32, color=COLORS[material], alpha=1.0 if not aged else 0.55,
                     edgecolor=SURFACE, linewidth=2)
            axis.annotate(f'{value:.2f}', (index + offset, value), textcoords='offset points', xytext=(0, 3), ha='center',
                          fontsize=8, color=INK)
    axis.set_xticks(range(len(SOLIDS)), [SHORT[m] for m in SOLIDS], color=INK)
    axis.set_ylabel('M0/M3 relativo (D1,5 = 100 nm → 1)', color=INK, fontsize=9)
    axis.bar([], [], color=MUTED, label='sem envelhecimento')
    axis.bar([], [], color=MUTED, alpha=0.55, label='720 s')
    axis.legend(frameon=False, fontsize=8, labelcolor=INK)
    axis.set_title('Partículas por unidade de volume de partícula (derivado de D1,5 publicado)', fontsize=10, color=INK, loc='left')
    figure.tight_layout()
    figure.savefig(FIGURES / 'same-number-vs-mass.png', dpi=150)
    plt.close(figure)
    written.append('same-number-vs-mass.png')
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--no-figures', action='store_true')
    args = parser.parse_args()
    analysis = build()
    text = render(analysis)
    if args.check:
        same = OUTPUT.exists() and OUTPUT.read_text(encoding='utf-8') == text
        print('reproduzível' if same else 'DIVERGENTE')
        return 0 if same else 1
    OUTPUT.write_text(text, encoding='utf-8')
    if not args.no_figures:
        print('figuras:', figures(analysis))
    print(json.dumps({'table1Reproduction': analysis['table1Reproduction'], 'agingTable1': analysis['agingTable1']},
                     ensure_ascii=False, indent=1))
    for material, block in analysis['flight']['dusttrakRatio'].items():
        print(material, block['primaryBoverA'], 'pub', block['published08ICES_BoverA']['value'],
              'frac', block['massFractionAbove1umFromDustTraks'].get('mean'), 'lognormal', block['lognormalMassFractionAbove1um_Table1']['value'],
              'nasa sheets', block['nasaAveragingSheetBoverA'])
    for material, block in analysis['flight']['aging'].items():
        print('aging', material, block['tests'], block['dusttrakBSecondaryOverPrimary'], block['BoverA_primary'].get('mean'), block['BoverA_secondary'].get('mean'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
