"""Build the deterministic frontend trial contract from published artefacts.

No frames, providers or inferred physical defaults. Unknowns remain null.
Run: python scripts/build_trial_registry.py [--root REPOSITORY]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://github.com/UFRJ-Analytica/hkt_flame_in_freefall/blob/d47b2baee4d98a68a84fff1bce6d9f1fbc5937eb/'
ICES = 'https://ntrs.nasa.gov/api/citations/20240002981/downloads/Saffire-ICES-2024-ICES-365-accepted%20final.pdf'
PORTAL = 'https://psi.nasa.gov/physci/repo/data/investigations/'
KINDS = {'char-front', 'flame-base', 'published-rate'}
MODEL_KINDS = {'image-neighborhood', 'image-longitudinal', 'published-speed-longitudinal', 'localized-observation', None}
VALIDATIONS = {'temporal-holdout-same-trial', 'published-curve-consistency', 'cross-trial', 'none'}
SPECS = [
    ('SAFFIRE-I-S1', 'SAFFIRE I', 'S1', 'PSI-98', 'psi-98-s1-neighbors.json'),
    ('SAFFIRE-I-S2', 'SAFFIRE I', 'S2', 'PSI-98', 'psi-98-s2-neighbors.json'),
    ('SAFFIRE-II-5', 'SAFFIRE II', '2-5', 'PSI-99', 'psi-99-ii5.json'),
    ('SAFFIRE-II-6', 'SAFFIRE II', '2-6', 'PSI-99', 'psi-99-ii6.json'),
    ('SAFFIRE-III-S1', 'SAFFIRE III', 'S1', 'PSI-100', 'psi-100-s1-neighbors.json'),
    ('SAFFIRE-III-S2', 'SAFFIRE III', 'S2', 'PSI-100', 'psi-100-s2-neighbors.json'),
    ('SAFFIRE-IV-1', 'SAFFIRE IV', 'IV-1', None, 'saffire-iv-1.json'),
    ('SAFFIRE-V-2', 'SAFFIRE V', 'V-2', None, 'saffire-v-2.json'),
    ('SAFFIRE-VI-2', 'SAFFIRE VI', 'VI-2', None, 'saffire-vi-2.json'),
]


def read(root: Path, path: str) -> dict:
    return json.loads((root / path).read_text(encoding='utf-8'))


def source(field: str, label: str, url: str) -> dict:
    return {'field': field, 'label': label, 'url': url}


def observable(kind: str, speed: float, window: str, label: str, url: str | None,
               artifact: str, uncertainty: dict | None = None) -> dict:
    return {'kind': kind, 'speedMmS': speed, 'window': window, 'uncertainty': uncertainty,
            'source': {'label': label, 'url': url}, 'artifact': artifact}


def build_registry(root: Path = ROOT) -> dict:
    root = Path(root)
    targets = read(root, 'public/data/modeling-targets.json')
    curated = {(r['investigation'], r['sample']): r for r in targets['records']}
    cross_path = 'public/data/saffire/crosstrial-i-iii.json'
    cross = read(root, cross_path)
    trials = []
    for trial_id, campaign, sample, investigation, filename in SPECS:
        path = 'public/data/saffire/' + filename
        data = read(root, path)
        record = curated.get((investigation, sample), {})
        published = investigation is None
        raw_conditions = data.get('conditions', {})
        geometry = data.get('measuredGeometry', data.get('geometry', data.get('grid', {})))
        conditions = {}
        evidence = []
        notes = list(record.get('notes', []))
        conflicts = []
        # Prefer explicit conditions of the actual model, with a source for each.
        oxygen = raw_conditions.get('oxygenPct', raw_conditions.get('oxygenPctApprox', record.get('oxygenPct')))
        if record.get('oxygenApproximate') and isinstance(oxygen, list) and len(oxygen) == 2 and oxygen[0] == oxygen[1]:
            oxygen = oxygen[0]  # Approximate point, not a zero-width measured interval.
        conditions['oxygenPct'] = oxygen if not isinstance(oxygen, list) else None
        conditions['oxygenRangePct'] = oxygen if isinstance(oxygen, list) else None
        conditions['pressureKpa'] = raw_conditions.get('pressureKpa', record.get('pressureKpa'))
        conditions['flowCmS'] = raw_conditions.get('flowCmS', record.get('flowCmS'))
        conditions['flowDirection'] = raw_conditions.get('flowDirection', raw_conditions.get('direction', data.get('direction', record.get('flowDirection'))))
        conditions['gravity'] = record.get('gravity') if not published else 'microgravity'
        for field, value in conditions.items():
            if value is None:
                notes.append(f'{field}: não disponível; nenhum valor presumido.')
                continue
            if published:
                ref = raw_conditions.get('source', {})
                label = ref.get('label', 'Condições no artefato publicado')
                url = ref.get('url', BASE + path)
                if trial_id == 'SAFFIRE-VI-2':
                    label, url = 'ICES-2024-365, Tabela 1, p3 (conferida visualmente)', ICES
                if field == 'gravity':
                    label, url = 'ICES-2024-365, p1: ensaios na Cygnus em órbita', ICES
            else:
                raw_field = 'oxygenPct' if field == 'oxygenRangePct' else field
                if field == 'oxygenPct' and 'oxygenPctApprox' in raw_conditions:
                    raw_field = 'oxygenPctApprox'
                label, url = f'{path}, conditions/{raw_field}', BASE + path
                if raw_field not in raw_conditions:
                    label, url = f'modeling-targets.json, {investigation}:{sample}/{raw_field}', BASE + 'public/data/modeling-targets.json'
                if investigation == 'PSI-100' and field in {'oxygenPct', 'flowCmS'}:
                    label, url = (f'Condição adotada em {path}, conditions/{raw_field}, atribuída ao artigo da equipe; conflito PSI preservado',
                                  'https://doi.org/10.1016/j.combustflame.2018.10.012')
                if field == 'gravity':
                    label, url = 'modeling-targets.json, gravity e platform do ensaio', BASE + 'public/data/modeling-targets.json'
                if field == 'flowDirection' and 'flowDirection' not in raw_conditions and 'direction' not in data:
                    label, url = f'Tabela {investigation}, amostra {sample}, Flow Direction', PORTAL + investigation
            evidence.append(source(field, label, url))
        if raw_conditions.get('oxygenPctApprox') is not None or record.get('oxygenApproximate'):
            notes.append('Oxigênio aproximado na fonte; não é valor exato nem tolerância validada.')
        thickness = geometry.get('thicknessMm', raw_conditions.get('thicknessMm', record.get('thicknessMm')))
        if thickness is None:
            notes.append('thicknessMm: espessura não confirmada; não transferida de outro ensaio.')
        observations = []
        if not published:
            validation = data.get('contiguousValidation', data.get('validation', {}))
            speed = validation.get('observedSpeedMmS')
            if speed is not None:
                sampling = data.get('sampling', {})
                camera = data.get('camera', 'S1C1/S1C2')
                window = f'Trecho reservado do mesmo ensaio; {camera}'
                if sampling:
                    window += f"; janela {sampling.get('windowS')}; reserva desde {sampling.get('holdoutStartsS')} s"
                observations.append(observable('char-front', speed, window,
                    'Frente de contraste/carbonizada reconstruída, não base luminosa da chama',
                    data.get('sourceUrl', PORTAL + investigation), path))
            model_kind = 'image-longitudinal' if campaign == 'SAFFIRE II' or trial_id == 'SAFFIRE-I-S2' else 'image-neighborhood'
            validation_kind = 'temporal-holdout-same-trial'
            notes.append('Validação temporal no mesmo ensaio; não valida transferência para habitat ou gravidade lunar.')
        else:
            calibration = data['calibration']
            ref = calibration['source']
            # IV/V identify flame base explicitly; VI reports a rate without a
            # independently verified equivalence to the char-front detector.
            kind = 'flame-base' if 'base da chama' in calibration['variable'].lower() else 'published-rate'
            observations.append(observable(kind, calibration['speedMmS'],
                calibration.get('fitWindow', 'Taxa publicada; não estimada novamente dos frames'),
                ref['label'], ref['url'], path))
            validation = data.get('validation', {})
            if validation.get('kind') == 'same-trial-curve':
                digitization = validation['digitization']
                observations.append(observable('flame-base', validation['observedSpeedMmS'],
                    f"Curva digitalizada, {digitization['intervalSeconds']} s; mesmo ensaio",
                    digitization['source']['label'], digitization['source']['url'], path))
                validation_kind = 'published-curve-consistency'
            else:
                validation_kind = 'none'
                notes.append('Checagem numérica da velocidade imposta não é validação experimental; trajetória observada indisponível.')
            model_kind = 'published-speed-longitudinal'
            notes.append('Taxa publicada parametriza o propagador; sorteios não são incerteza experimental nem probabilidade física medida.')
            for alternative in data.get('otherReportedConditions', []):
                vals = {k: v for k, v in alternative.items() if k not in {'source', 'context'}}
                conflicts.append(f"Outra condição reportada, sem média: {json.dumps(vals, ensure_ascii=False, sort_keys=True)}; {alternative['source']['label']} ({alternative['source']['url']}).")
        if investigation == 'PSI-100':
            conflicts.append('Tabela PSI-100 registra 30 cm/s; artigo da equipe adota 25 cm/s e 21,2% O₂ (doi:10.1016/j.combustflame.2018.10.012).')
            conflicts.append('Espessura literal .33 cm não confirmada: thicknessMm permanece null.')
        if trial_id == 'SAFFIRE-II-6':
            conflicts.append('Artefato II-6 registra 25 cm/s; curadoria PSI-99 registra 20 cm/s. Preservado o valor do modelo, sem resolver a divergência.')
        if trial_id == 'SAFFIRE-I-S2':
            notes.append('Geometria nominal da folha, não extensão disponível de combustível: S2 reutiliza o remanescente após S1; consultar S2_REVIEW.md e NTRS 20170008805, Tabela I.')
        if trial_id == 'SAFFIRE-III-S1':
            obs = cross['observed']
            observations.append(observable('char-front', obs['speedMmS'],
                'Câmera 1, janela completa selecionada do cross-trial; não é a janela reservada das duas câmeras',
                'OLS da frente de contraste, crosstrial-i-iii.json', cross.get('sourceUrl'), cross_path,
                {'kind': 'ols-se-iid', 'value': obs['standardErrorMmS'],
                 'note': 'Erro padrão OLS sob independência; não inclui autocorrelação, registro ou incerteza total.'}))
            notes.append('Estimativas das duas câmeras e da câmera 1 têm janelas distintas; não formam intervalo de confiança.')
        trials.append({'id': trial_id, 'campaign': campaign, 'sample': sample,
            'investigation': investigation, 'material': data.get('material', record.get('material')),
            'thicknessMm': thickness,
            'geometry': {'lengthMm': geometry.get('lengthMm', record.get('lengthMm')),
                         'widthMm': geometry.get('widthMm', record.get('widthMm'))},
            'conditions': conditions, 'conditionSources': evidence, 'observables': observations,
            'model': {'artifact': path, 'kind': model_kind, 'validation': validation_kind,
                      'artifactSha256': hashlib.sha256((root / path).read_bytes()).hexdigest()},
            'conflicts': conflicts, 'notes': notes})
    result = {'schemaVersion': 1, 'generatedBy': 'scripts/build_trial_registry.py', 'trials': trials}
    validate_registry(result, root)
    return result


def finite_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def require_keys(value, keys: set[str], label: str) -> None:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError(f'Invalid {label} schema')


def checked_artifact(root: Path, value: str) -> Path:
    if not isinstance(value, str) or not value:
        raise ValueError('Invalid artifact path')
    target = (Path(root) / value).resolve()
    target.relative_to(Path(root).resolve())
    if not target.is_file():
        raise ValueError('Missing artifact file')
    return target


def validate_registry(data: dict, root: Path = ROOT) -> None:
    if set(data) != {'schemaVersion', 'generatedBy', 'trials'} or data['schemaVersion'] != 1 or data['generatedBy'] != 'scripts/build_trial_registry.py':
        raise ValueError('Invalid trial registry header')
    ids = [t['id'] for t in data['trials']]
    if len(ids) != len(set(ids)) or set(ids) != {s[0] for s in SPECS}:
        raise ValueError('Missing, duplicate or unexpected trial IDs')
    for trial in data['trials']:
        if set(trial) != {'id', 'campaign', 'sample', 'investigation', 'material', 'thicknessMm', 'geometry', 'conditions', 'conditionSources', 'observables', 'model', 'conflicts', 'notes'}:
            raise ValueError('Unexpected trial schema fields')
        spec = next(s for s in SPECS if s[0] == trial['id'])
        if (trial['campaign'], trial['sample'], trial['investigation']) != spec[1:4]:
            raise ValueError('Trial identity mismatch')
        if not isinstance(trial['material'], str) or not trial['material'].strip():
            raise ValueError('Invalid material')
        require_keys(trial['geometry'], {'lengthMm', 'widthMm'}, 'geometry')
        for value in [trial['thicknessMm'], *trial['geometry'].values()]:
            if value is not None and (not finite_number(value) or value <= 0):
                raise ValueError('Invalid dimension or thickness')
        if any(not isinstance(trial[k], list) or not all(isinstance(v, str) for v in trial[k]) for k in ('notes', 'conflicts')):
            raise ValueError('Invalid notes/conflicts')
        conditions = trial['conditions']
        if set(conditions) != {'oxygenPct', 'oxygenRangePct', 'pressureKpa', 'flowCmS', 'flowDirection', 'gravity'}:
            raise ValueError('Invalid condition schema')
        if not isinstance(trial['conditionSources'], list):
            raise ValueError('Invalid condition sources')
        for ref in trial['conditionSources']:
            require_keys(ref, {'field', 'label', 'url'}, 'condition source')
            if not all(isinstance(ref[k], str) and ref[k].strip() for k in ref) or not ref['url'].startswith('https://'):
                raise ValueError('Invalid condition reference')
        sourced = {s['field'] for s in trial['conditionSources'] if s.get('label') and isinstance(s.get('url'), str) and s['url'].startswith('https://')}
        if any(value is not None and field not in sourced for field, value in conditions.items()):
            raise ValueError('Missing source for non-null condition')
        if conditions['flowDirection'] not in {'concurrent', 'opposed'} or conditions['gravity'] != 'microgravity':
            raise ValueError('Unsupported direction or gravity')
        for field in ('oxygenPct', 'pressureKpa', 'flowCmS'):
            value = conditions[field]
            if value is not None and (not finite_number(value) or value < 0 or field == 'oxygenPct' and value > 100):
                raise ValueError('Invalid numeric condition')
        interval = conditions['oxygenRangePct']
        if interval is not None and (not isinstance(interval, list) or len(interval) != 2 or not all(finite_number(v) for v in interval) or not 0 <= interval[0] <= interval[1] <= 100):
            raise ValueError('Invalid oxygen interval')
        if not isinstance(trial['observables'], list):
            raise ValueError('Invalid observables')
        for obs in trial['observables']:
            if set(obs) != {'kind', 'speedMmS', 'window', 'uncertainty', 'source', 'artifact'} or obs['kind'] not in KINDS or not finite_number(obs['speedMmS']) or obs['speedMmS'] < 0:
                raise ValueError('Invalid observable kind or speed')
            if not obs['window'] or not obs['source'].get('label'):
                raise ValueError('Missing observable source/window')
            require_keys(obs['source'], {'label', 'url'}, 'observable source')
            if not isinstance(obs['source']['label'], str) or not isinstance(obs['window'], str):
                raise ValueError('Invalid observable reference')
            url = obs['source']['url']
            if url is not None and (not isinstance(url, str) or not url.startswith('https://')):
                raise ValueError('Invalid observable URL')
            if obs['artifact'] is not None:
                checked_artifact(root, obs['artifact'])
            elif url is None:
                raise ValueError('Observable has no usable reference')
            u = obs['uncertainty']
            if u is not None and (set(u) != {'kind', 'value', 'note'} or u['kind'] not in {'ols-se-iid', 'seed-spread', 'none'} or not finite_number(u['value']) or u['value'] < 0 or not u['note']):
                raise ValueError('Invalid uncertainty')
        model = trial['model']
        if set(model) != {'artifact', 'kind', 'validation', 'artifactSha256'} or model['kind'] not in MODEL_KINDS or model['validation'] not in VALIDATIONS:
            raise ValueError('Invalid model schema')
        if model['artifact'] is not None:
            if model['artifact'] != 'public/data/saffire/' + spec[4]:
                raise ValueError('Model belongs to another trial')
            target = checked_artifact(root, model['artifact'])
            if model['artifactSha256'] != hashlib.sha256(target.read_bytes()).hexdigest():
                raise ValueError('Model artifact hash mismatch')
        elif model['artifactSha256'] is not None:
            raise ValueError('Hash without artifact')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    args = parser.parse_args()
    payload = build_registry(args.root)
    out = args.root / 'public/data/saffire/trial-registry.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    name = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='\n', dir=out.parent, delete=False) as handle:
            name = handle.name
            json.dump(payload, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write('\n')
        os.replace(name, out)
    finally:
        if name and Path(name).exists():
            Path(name).unlink()
    print(f'{out}: {len(payload["trials"])} trials, validated hashes and condition sources')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
