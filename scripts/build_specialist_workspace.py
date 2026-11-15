"""Build an evidence-only specialist dataset from saved, auditable trial artifacts.

No fitting, providers, synthetic experimental curves or lunar physical corrections.
"""
from __future__ import annotations

import argparse
import copy
import csv
import hashlib
import io
import itertools
import json
import math
import os
import tempfile
from pathlib import Path

from build_trial_registry import validate_registry

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = 'public/data/saffire/trial-registry.json'
OUTPUT = 'public/data/saffire/specialist-workspace.json'
LIMITATIONS = [
    'Comparações entre ensaios são descritivas, não efeitos causais isolados.',
    'Validação temporal no mesmo ensaio não é validação externa independente.',
    'Taxa publicada usada no ajuste não é observação independente do modelo ajustado.',
    'Nenhuma correção física validada para O₂, pressão, gravidade lunar, fumaça ou supressão.',
    'Sorteios do modelo não representam incerteza experimental.',
    'Curvas do baseline longitudinal não são curvas do modelo por vizinhança.',
]


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n').encode('utf-8')


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def safe_artifact(root: Path, name: str) -> Path:
    path = (root / name).resolve()
    allowed = (root / 'public/data').resolve()
    if not path.is_relative_to(allowed) or path.suffix != '.json':
        raise ValueError(f'Not a public JSON artifact: {name}')
    return path


def number(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f'Expected a finite number, received {value!r}')
    return value


def speed_comparison(data: dict) -> dict | None:
    field = 'contiguousValidation' if data.get('contiguousValidation') else 'validation'
    v = data.get(field, {})
    if v.get('observedSpeedMmS') is None or v.get('simulatedSpeedMmS') is None:
        return None
    observed, simulated = number(v['observedSpeedMmS']), number(v['simulatedSpeedMmS'])
    mae = v.get('positionMaeMm')
    return {'observedMmS': observed, 'simulatedMmS': simulated,
            'signedErrorPct': (simulated - observed) / observed * 100 if observed else None,
            'absoluteErrorMmS': abs(simulated - observed),
            'positionMaeReportedMm': number(mae) if mae is not None else None,
            'sourceField': field}


def curve_metrics(points: list[dict]) -> dict:
    def slope(pairs):
        if len(pairs) < 2:
            return None
        mt = sum(t for t, _ in pairs) / len(pairs)
        mx = sum(x for _, x in pairs) / len(pairs)
        denominator = sum((t - mt) ** 2 for t, _ in pairs)
        return sum((t - mt) * (x - mx) for t, x in pairs) / denominator if denominator else None

    paired = [p for p in points if p['simulatedMm'] is not None]
    residuals = [p['simulatedMm'] - p['observedMm'] for p in paired]
    return {'pointCount': len(points), 'pairedPointCount': len(paired),
            'timeSpanS': points[-1]['timeS'] - points[0]['timeS'],
            'positionMaeMm': sum(abs(r) for r in residuals) / len(residuals) if residuals else None,
            'positionRmseMm': math.sqrt(sum(r * r for r in residuals) / len(residuals)) if residuals else None,
            'positionBiasMm': sum(residuals) / len(residuals) if residuals else None,
            'observedOlsSpeedMmS': slope([(p['timeS'], p['observedMm']) for p in points]),
            'simulatedOlsSpeedMmS': slope([(p['timeS'], p['simulatedMm']) for p in paired]),
            'note': 'Diagnósticos da curva armazenada; não equivalem ao MAE espacial entre faixas nem a incerteza experimental.'}


def trajectory(data: dict, trial: dict) -> dict:
    v = data.get('validation', {})
    path = trial['model']['artifact']
    result = {'status': 'unavailable', 'observableKind': trial['observables'][0]['kind'],
              'modelKind': None, 'relationToRegisteredModel': None, 'timeOrigin': None,
              'sourceFields': [], 'points': [], 'metrics': None,
              'note': 'Trajetória experimental pareada não disponível; nenhuma curva foi sintetizada.'}
    rows = v.get('trajectory')
    if rows:
        result.update(modelKind='image-longitudinal', timeOrigin='relative-validation-window-start',
                      sourceFields=[path + '#/validation/trajectory'])
        points = [{'timeS': p['timeS'], 'observedMm': p['observedMm'],
                   'simulatedMm': p.get('simulatedMm')} for p in rows]
        baseline = trial['model']['kind'] == 'image-neighborhood'
        result['relationToRegisteredModel'] = 'baseline-not-registered-model' if baseline else 'same-model'
        result['note'] = ('Curva do baseline longitudinal armazenado; NÃO representa o modelo por vizinhança.'
                          if baseline else 'Curva armazenada do modelo longitudinal na janela de validação.')
    elif v.get('kind') == 'same-trial-curve':
        rows = v['digitization']['points']
        simulated = v['simulatedMeanPositionsMm']
        if len(rows) != len(simulated):
            raise ValueError('Digitized and simulated trajectory lengths differ')
        points = [{'timeS': t, 'observedMm': x, 'simulatedMm': y}
                  for (t, x), y in zip(rows, simulated)]
        result.update(modelKind='published-speed-longitudinal', relationToRegisteredModel='same-model',
                      timeOrigin='published-figure-clock',
                      sourceFields=[path + '#/validation/digitization/points',
                                    path + '#/validation/simulatedMeanPositionsMm'],
                      note='Curva digitalizada do mesmo ensaio usado na calibração; não é holdout externo.')
    else:
        return result
    previous = -math.inf
    for point in points:
        t = number(point['timeS'])
        number(point['observedMm'])
        if point['simulatedMm'] is not None:
            number(point['simulatedMm'])
        point['residualMm'] = point['simulatedMm'] - point['observedMm'] if point['simulatedMm'] is not None else None
        if t <= previous:
            raise ValueError('Trajectory times must increase strictly')
        previous = t
    result.update(status='available', points=points, metrics=curve_metrics(points))
    return result


def condition_values(trial: dict) -> dict:
    c, g = trial['conditions'], trial['geometry']
    oxygen = None if c['oxygenPct'] is None and c['oxygenRangePct'] is None else {
        'pointPct': c['oxygenPct'], 'rangePct': c['oxygenRangePct']}
    return {'material': trial['material'], 'thicknessMm': trial['thicknessMm'],
            'lengthMm': g['lengthMm'], 'widthMm': g['widthMm'], 'oxygen': oxygen,
            'pressureKpa': c['pressureKpa'], 'flowCmS': c['flowCmS'],
            'flowDirection': c['flowDirection'], 'gravity': c['gravity']}


def compare_pair(left: dict, right: dict) -> dict:
    a, b = left['observables'][0], right['observables'][0]
    compatible = a['kind'] == b['kind']
    x, y = number(a['speedMmS']), number(b['speedMmS'])
    av, bv = condition_values(left), condition_values(right)
    diffs = [{'field': k, 'left': av[k], 'right': bv[k],
              'status': 'unknown' if av[k] is None or bv[k] is None else 'same' if av[k] == bv[k] else 'different'}
             for k in av]
    warnings = ['Mesma espécie de observável não garante mesma janela, câmera ou método.',
                'Diferença de velocidade não isola o efeito de uma condição.']
    if not compatible:
        warnings.append('Observáveis incompatíveis: deltas de velocidade não calculados.')
    if left['sample'] == 'S2' or right['sample'] == 'S2':
        warnings.append('Inclui S2: revisão científica pendente; não usar como âncora do habitat.')
    return {'trialIds': [left['id'], right['id']], 'observableCompatible': compatible,
            'speedDeltaMmS': y - x if compatible else None,
            'speedDeltaPct': (y - x) / x * 100 if compatible and x else None,
            'conditionDiffs': diffs, 'interpretation': 'descriptive-not-causal', 'warnings': warnings}


def build_workspace(root: Path = ROOT) -> dict:
    root = Path(root).resolve()
    registry_bytes = (root / REGISTRY).read_bytes()
    registry = json.loads(registry_bytes)
    validate_registry(registry, root)
    trials = copy.deepcopy(registry['trials'])
    names = {REGISTRY}
    for trial in trials:
        artifact = trial['model']['artifact']
        names.add(artifact)
        names.update(o['artifact'] for o in trial['observables'] if o['artifact'])
        raw = safe_artifact(root, artifact).read_bytes()
        if digest(raw) != trial['model']['artifactSha256']:
            raise ValueError('Trial model fingerprint mismatch: ' + trial['id'])
        data = json.loads(raw)
        curve = trajectory(data, trial)
        review = trial['sample'] == 'S2'
        warnings = list(trial['conflicts'])
        if review:
            warnings.append('S2 em revisão: quantização/janela/ignitor não resolvidos; consultar S2_REVIEW.md.')
        if curve['relationToRegisteredModel'] == 'baseline-not-registered-model':
            warnings.append(curve['note'])
        missing = [k for k, v in condition_values(trial).items() if v is None]
        if curve['status'] == 'unavailable':
            missing.append('pairedExperimentalTrajectory')
        missing.append('independentExternalValidation')
        trial['analysis'] = {
            'reviewStatus': 'review-required' if review else 'usable-with-limitations',
            'capabilities': {'observedTrajectory': curve['status'] == 'available',
                             'pairedTrajectory': curve['status'] == 'available' and all(p['simulatedMm'] is not None for p in curve['points']),
                             'habitatAnchor': not review and trial['conditions']['flowDirection'] == 'concurrent'
                             and (trial['material'] == 'SIBAL' or trial['material'].startswith('Algodão'))},
            'validationSummary': {'kind': trial['model']['validation'], 'independentExternalValidation': False,
                                  'note': 'Classificação do artefato existente; não é uma nova validação nem transferência lunar.'},
            'speedComparison': speed_comparison(data), 'trajectory': curve,
            'missingData': missing, 'warnings': warnings}
    code = (root / 'scripts/build_specialist_workspace.py').read_bytes().replace(b'\r\n', b'\n')
    return {'schemaVersion': 1, 'generatedBy': 'scripts/build_specialist_workspace.py',
            'analysisCode': {'path': 'scripts/build_specialist_workspace.py', 'sha256': digest(code), 'hashConvention': 'UTF-8 source bytes; CRLF normalized to LF'},
            'registry': {'path': REGISTRY, 'sha256': digest(registry_bytes)},
            'artifacts': [{'path': p, 'sha256': digest(safe_artifact(root, p).read_bytes())} for p in sorted(names)],
            'trials': trials, 'comparisons': [compare_pair(a, b) for a, b in itertools.combinations(trials, 2)],
            'limitations': LIMITATIONS[:]}


def select_trials(workspace: dict, trial_ids: list[str]) -> dict:
    if not trial_ids or len(set(trial_ids)) != len(trial_ids):
        raise ValueError('Select nonempty, unique trial IDs')
    by_id = {t['id']: t for t in workspace['trials']}
    if any(i not in by_id for i in trial_ids):
        raise ValueError('Unknown trial ID')
    result = copy.deepcopy(workspace)
    result['trials'] = [copy.deepcopy(by_id[i]) for i in trial_ids]
    result['comparisons'] = [compare_pair(a, b) for a, b in itertools.combinations(result['trials'], 2)]
    return result


def atomic_write(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as tmp:
        temporary = Path(tmp.name)
        tmp.write(content)
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def export_dossier(workspace: dict, trial_ids: list[str], directory: Path) -> dict:
    dossier = select_trials(workspace, trial_ids)
    dossier['dossierId'] = digest(encoded(dossier))
    directory = Path(directory)
    stream = io.StringIO(newline='')
    columns = ['trialId', 'material', 'observableKind', 'sourceSpeedMmS', 'observedMmS', 'simulatedMmS',
               'signedErrorPct', 'positionMaeReportedMm', 'reviewStatus', 'modelArtifact', 'modelSha256']
    writer = csv.DictWriter(stream, fieldnames=columns, lineterminator='\n')
    writer.writeheader()
    for trial in dossier['trials']:
        a, o = trial['analysis'], trial['observables'][0]
        m = a['speedComparison'] or {}
        writer.writerow({'trialId': trial['id'], 'material': trial['material'], 'observableKind': o['kind'],
                         'sourceSpeedMmS': o['speedMmS'],
                         **{k: m.get(k) for k in ['observedMmS', 'simulatedMmS', 'signedErrorPct', 'positionMaeReportedMm']},
                         'reviewStatus': a['reviewStatus'], 'modelArtifact': trial['model']['artifact'],
                         'modelSha256': trial['model']['artifactSha256']})
    lines = ['# HabitatFire — dossiê de comparação', '', 'Identificador: ' + dossier['dossierId'], '',
             '## Limites', *['- ' + note for note in LIMITATIONS], '']
    for t in dossier['trials']:
        lines.extend(['## ' + t['id'], '', 'Material: ' + t['material'],
                      'Condições: ' + json.dumps(t['conditions'], ensure_ascii=False),
                      'Modelo: ' + t['model']['artifact'], 'SHA256: ' + t['model']['artifactSha256'],
                      'Revisão: ' + t['analysis']['reviewStatus'],
                      'Métricas: ' + json.dumps(t['analysis']['speedComparison'], ensure_ascii=False),
                      'Curva: ' + t['analysis']['trajectory']['note'], '', '### Fontes',
                      *['- ' + s['field'] + ': ' + s['label'] + ' — ' + str(s['url']) for s in t['conditionSources']],
                      *['- Observável: ' + o['source']['label'] + ' — ' + str(o['source']['url']) for o in t['observables']],
                      '', '### Ressalvas', *['- ' + n for n in t['notes'] + t['analysis']['warnings']], ''])
    lines.extend(['## Comparações descritivas', '', json.dumps(dossier['comparisons'], ensure_ascii=False, indent=2)])
    atomic_write(directory / 'dossier.json', encoded(dossier))
    atomic_write(directory / 'metrics.csv', stream.getvalue().encode('utf-8'))
    curves = io.StringIO(newline='')
    curve_writer = csv.DictWriter(curves, fieldnames=[
        'trialId', 'observableKind', 'curveModelKind', 'relationToRegisteredModel', 'timeOrigin',
        'timeS', 'observedMm', 'simulatedMm', 'residualMm'], lineterminator='\n')
    curve_writer.writeheader()
    for t in dossier['trials']:
        curve = t['analysis']['trajectory']
        for point in curve['points']:
            curve_writer.writerow({'trialId': t['id'], 'observableKind': curve['observableKind'],
                                   'curveModelKind': curve['modelKind'],
                                   'relationToRegisteredModel': curve['relationToRegisteredModel'],
                                   'timeOrigin': curve['timeOrigin'], **point})
    pairs = io.StringIO(newline='')
    pair_writer = csv.DictWriter(pairs, fieldnames=[
        'leftTrialId', 'rightTrialId', 'observableCompatible', 'speedDeltaMmS', 'speedDeltaPct',
        'interpretation', 'conditionDiffs', 'warnings'], lineterminator='\n')
    pair_writer.writeheader()
    for pair in dossier['comparisons']:
        pair_writer.writerow({'leftTrialId': pair['trialIds'][0], 'rightTrialId': pair['trialIds'][1],
                               **{k: pair[k] for k in ['observableCompatible', 'speedDeltaMmS', 'speedDeltaPct', 'interpretation']},
                               'conditionDiffs': json.dumps(pair['conditionDiffs'], ensure_ascii=False),
                               'warnings': json.dumps(pair['warnings'], ensure_ascii=False)})
    atomic_write(directory / 'trajectories.csv', curves.getvalue().encode('utf-8'))
    atomic_write(directory / 'comparisons.csv', pairs.getvalue().encode('utf-8'))
    atomic_write(directory / 'dossier.md', ('\n'.join(lines) + '\n').encode('utf-8'))
    return dossier


def validate_dossier_structure(value: dict) -> None:
    """Validate all v1 fields before comparing scientific content or identities."""
    n = 'number'
    nullable = lambda schema: ('nullable', schema)
    enum = lambda *values: ('enum', values)
    source = {'label': str, 'url': nullable(str)}
    fingerprint = {'path': str, 'sha256': 'sha256'}
    metrics = {'pointCount': int, 'pairedPointCount': int, 'timeSpanS': n,
               'positionMaeMm': nullable(n), 'positionRmseMm': nullable(n), 'positionBiasMm': nullable(n),
               'observedOlsSpeedMmS': nullable(n), 'simulatedOlsSpeedMmS': nullable(n), 'note': str}
    observable_kind = enum('char-front', 'flame-base', 'published-rate')
    model_kind = enum('image-neighborhood', 'image-longitudinal', 'published-speed-longitudinal', 'localized-observation', None)
    validation = enum('temporal-holdout-same-trial', 'published-curve-consistency', 'cross-trial', 'none')
    trial = {
        'id': str, 'campaign': str, 'sample': str, 'investigation': nullable(str), 'material': str,
        'thicknessMm': nullable(n), 'geometry': {'lengthMm': nullable(n), 'widthMm': nullable(n)},
        'conditions': {'oxygenPct': nullable(n), 'oxygenRangePct': nullable([n]),
                       'pressureKpa': nullable(n), 'flowCmS': nullable(n),
                       'flowDirection': enum('concurrent', 'opposed'), 'gravity': enum('microgravity')},
        'conditionSources': [{'field': str, **source}],
        'observables': [{'kind': observable_kind, 'speedMmS': n, 'window': str,
                         'uncertainty': nullable({'kind': enum('ols-se-iid', 'seed-spread', 'none'), 'value': n, 'note': str}),
                         'source': source, 'artifact': nullable(str)}],
        'model': {'artifact': str, 'kind': model_kind, 'validation': validation, 'artifactSha256': 'sha256'},
        'conflicts': [str], 'notes': [str],
        'analysis': {
            'reviewStatus': enum('review-required', 'usable-with-limitations'),
            'capabilities': {'observedTrajectory': bool, 'pairedTrajectory': bool, 'habitatAnchor': bool},
            'validationSummary': {'kind': validation, 'independentExternalValidation': bool, 'note': str},
            'speedComparison': nullable({'observedMmS': n, 'simulatedMmS': n, 'signedErrorPct': nullable(n),
                                         'absoluteErrorMmS': n, 'positionMaeReportedMm': nullable(n), 'sourceField': str}),
            'trajectory': {'status': enum('available', 'unavailable'), 'observableKind': observable_kind,
                           'modelKind': model_kind, 'relationToRegisteredModel': enum('same-model', 'baseline-not-registered-model', None),
                           'timeOrigin': nullable(str), 'sourceFields': [str],
                           'points': [{'timeS': n, 'observedMm': n, 'simulatedMm': nullable(n), 'residualMm': nullable(n)}],
                           'metrics': nullable(metrics), 'note': str},
            'missingData': [str], 'warnings': [str]}}
    pair = {'trialIds': [str], 'observableCompatible': bool, 'speedDeltaMmS': nullable(n),
            'speedDeltaPct': nullable(n), 'conditionDiffs': [{'field': str, 'left': 'json', 'right': 'json',
                                                            'status': enum('same', 'different', 'unknown')}],
            'interpretation': enum('descriptive-not-causal'), 'warnings': [str]}
    schema = {'schemaVersion': int, 'generatedBy': str,
              'analysisCode': {**fingerprint, 'hashConvention': str}, 'registry': fingerprint,
              'artifacts': [fingerprint], 'trials': [trial], 'comparisons': [pair],
              'limitations': [str], 'dossierId': 'sha256'}

    def check(item, shape, path):
        try:
            if isinstance(shape, tuple):
                if shape[0] == 'nullable':
                    if item is not None:
                        check(item, shape[1], path)
                elif item not in shape[1] or isinstance(item, (dict, list, bool)):
                    raise ValueError('invalid enum')
            elif isinstance(shape, dict):
                if not isinstance(item, dict):
                    raise ValueError('expected object')
                for key, subschema in shape.items():
                    if key not in item:
                        raise ValueError('missing ' + key)
                    check(item[key], subschema, path + '/' + key)
            elif isinstance(shape, list):
                if not isinstance(item, list):
                    raise ValueError('expected list')
                for index, member in enumerate(item):
                    check(member, shape[0], path + '/' + str(index))
            elif shape == 'number':
                number(item)
            elif shape == 'sha256':
                if not isinstance(item, str) or len(item) != 64 or any(c not in '0123456789abcdef' for c in item):
                    raise ValueError('expected SHA256')
            elif shape == 'json':
                json.dumps(item, allow_nan=False)
            elif type(item) is not shape:
                raise ValueError('incorrect field type')
        except (TypeError, ValueError) as exc:
            raise ValueError(f'Invalid dossier field {path}: {exc}') from exc

    check(value, schema, '')
    for t in value['trials']:
        c, g = t['conditions'], t['geometry']
        for amount in [t['thicknessMm'], g['lengthMm'], g['widthMm'], c['pressureKpa']]:
            if amount is not None and amount <= 0:
                raise ValueError('Dossier dimensions/pressure must be positive or null')
        oxygen = c['oxygenRangePct']
        if oxygen is not None and (len(oxygen) != 2 or oxygen[0] > oxygen[1]):
            raise ValueError('Invalid oxygen range')
        for percentage in ([c['oxygenPct']] if oxygen is None else [c['oxygenPct'], *oxygen]):
            if percentage is not None and not 0 <= percentage <= 100:
                raise ValueError('Invalid oxygen percentage')
        if not t['observables']:
            raise ValueError('Dossier trial requires an observable')
    if not value['artifacts']:
        raise ValueError('Dossier requires an artifact manifest')
    if any(len(pair['trialIds']) != 2 for pair in value['comparisons']):
        raise ValueError('Each comparison requires two trial IDs')


def dossier_mismatches(expected, received, path='') -> list[dict]:
    if isinstance(expected, dict) and isinstance(received, dict):
        output = []
        for key in sorted(set(expected) | set(received)):
            pointer = path + '/' + key.replace('~', '~0').replace('/', '~1')
            if key in expected and key in received:
                output.extend(dossier_mismatches(expected[key], received[key], pointer))
            else:
                output.append({'path': pointer, 'expected': expected.get(key), 'received': received.get(key),
                               'kind': 'dataset-metadata',
                               'reason': 'unexpected-field' if key in received else 'missing-field'})
        return output
    if isinstance(expected, list) and isinstance(received, list):
        return [difference for i in range(max(len(expected), len(received)))
                for difference in dossier_mismatches(expected[i] if i < len(expected) else None,
                                                     received[i] if i < len(received) else None, path + '/' + str(i))]
    if encoded(expected) == encoded(received):
        return []
    kind = ('input-identity' if path.startswith(('/registry/', '/artifacts/', '/analysisCode/'))
            else 'derived-results' if '/analysis/' in path or path.startswith('/comparisons/') else 'dataset-metadata')
    return [{'path': path, 'expected': expected, 'received': received, 'kind': kind}]


def verify_dossier(value: dict, root: Path = ROOT) -> dict:
    if not isinstance(value, dict) or type(value.get('schemaVersion')) is not int or value['schemaVersion'] != 1:
        raise ValueError('Invalid specialist dossier')
    validate_dossier_structure(value)
    if not isinstance(value.get('trials'), list) or not all(
            isinstance(t, dict) and isinstance(t.get('id'), str) for t in value['trials']):
        raise ValueError('Invalid dossier trial selection')
    content = copy.deepcopy(value)
    fingerprint = content.pop('dossierId', None)
    if not isinstance(fingerprint, str) or digest(encoded(content)) != fingerprint:
        raise ValueError('Dossier payload fingerprint mismatch')
    current = select_trials(build_workspace(root), [t['id'] for t in value['trials']])
    mismatches = dossier_mismatches(current, content)
    return {'status': 'identical' if not mismatches else 'different-inputs-or-results',
            'dossierId': fingerprint, 'mismatches': mismatches,
            'scope': 'Comparação integral do dossiê de evidências, curvas e métricas persistidas; não reexecuta o motor do habitat.'}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--trial', action='append', default=[])
    parser.add_argument('--dossier-dir', type=Path)
    parser.add_argument('--verify-dossier', type=Path)
    args = parser.parse_args()
    if args.verify_dossier:
        if args.trial or args.dossier_dir:
            parser.error('--verify-dossier cannot be combined with export selection')
        report = verify_dossier(json.loads(args.verify_dossier.read_text(encoding='utf-8')), args.root)
        print(json.dumps(report, ensure_ascii=False))
        raise SystemExit(0 if report['status'] == 'identical' else 2)
    workspace = build_workspace(args.root)
    if args.trial and args.dossier_dir is None:
        parser.error('--trial requires --dossier-dir')
    if args.dossier_dir:
        export_dossier(workspace, args.trial or [t['id'] for t in workspace['trials']], args.dossier_dir)
    else:
        atomic_write(args.root / OUTPUT, encoded(workspace))
    print(json.dumps({'trials': len(workspace['trials']), 'comparisons': len(workspace['comparisons']),
                      'output': str(args.dossier_dir or args.root / OUTPUT)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
