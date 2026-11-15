// Frontend seams of the specialist bench (src/specialist/workspace.ts) against the generated
// public/data/saffire/specialist-workspace.json. Skips with a visible reason if it is not published.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { englishText } from '../src/i18n/english.ts';
import {
  buildDossier, checkDossier, dossierCsv, dossierMarkdown, pairDelta, readWorkspace, validateWorkspace,
} from '../src/specialist/workspace.ts';

const path = new URL('../public/data/saffire/specialist-workspace.json', import.meta.url);
const available = existsSync(path);
const ws = available ? readWorkspace(JSON.parse(readFileSync(path, 'utf8'))) : null;
const skip = available ? false : 'specialist-workspace.json ainda não publicado';
const clone = (v) => JSON.parse(JSON.stringify(v));

test('published workspace validates: nine trials, S2 kept in review', { skip }, () => {
  assert.equal(ws.trials.length, 9);
  const s2 = ws.trials.filter((t) => t.sample === 'S2');
  assert.equal(s2.length, 2);
  assert.ok(s2.every((t) => t.analysis.reviewStatus === 'review-required' && !t.analysis.capabilities.habitatAnchor));
});

test('validation rejects malformed or overclaiming workspaces', { skip }, () => {
  assert.deepEqual(validateWorkspace(ws), []);
  const bad = clone(ws);
  bad.trials.find((t) => t.sample === 'S2').analysis.reviewStatus = 'usable-with-limitations';
  assert.match(validateWorkspace(bad).join(), /S2/);
  const causal = clone(ws);
  causal.comparisons[0].interpretation = 'causal';
  assert.match(validateWorkspace(causal).join(), /causal/);
  const curve = clone(ws);
  const withCurve = curve.trials.find((t) => t.analysis.trajectory.status === 'available');
  withCurve.analysis.trajectory.points.reverse();
  assert.match(validateWorkspace(curve).join(), /increasing/);
  assert.throws(() => readWorkspace({ schemaVersion: 2 }));
});

test('baseline curves stay labelled as baseline, not as the neighbourhood model', { skip }, () => {
  for (const t of ws.trials.filter((x) => x.model.kind === 'image-neighborhood' && x.analysis.trajectory.status === 'available')) {
    assert.equal(t.analysis.trajectory.relationToRegisteredModel, 'baseline-not-registered-model');
  }
});

test('pair deltas are orientation-aware and null across observable kinds', { skip }, () => {
  const ab = pairDelta(ws, 'SAFFIRE-I-S1', 'SAFFIRE-III-S1');
  const ba = pairDelta(ws, 'SAFFIRE-III-S1', 'SAFFIRE-I-S1');
  assert.ok(Math.abs(ab.speedDeltaMmS + ba.speedDeltaMmS) < 1e-12);
  const i = ws.trials.find((t) => t.id === 'SAFFIRE-I-S1').observables[0].speedMmS;
  const iii = ws.trials.find((t) => t.id === 'SAFFIRE-III-S1').observables[0].speedMmS;
  assert.ok(Math.abs(ab.speedDeltaPct - ((iii - i) / i) * 100) < 1e-9);
  assert.ok(Math.abs(ba.speedDeltaPct - ((i - iii) / iii) * 100) < 1e-9);
  assert.equal(pairDelta(ws, 'SAFFIRE-I-S1', 'SAFFIRE-IV-1').speedDeltaMmS, null); // char-front vs flame-base
});

test('dossier round-trip: identical, tampered and malformed', { skip }, () => {
  const sel = ['SAFFIRE-I-S1', 'SAFFIRE-III-S1', 'SAFFIRE-VI-2'];
  const d = buildDossier(ws, sel, 'abc1234');
  assert.deepEqual(d.selection, sel);
  assert.equal(d.comparisons.length, 3);
  assert.ok(d.artifacts.every((a) => /^[0-9a-f]{64}$/.test(a.sha256)));
  const same = checkDossier(clone(d), ws, 'abc1234');
  assert.equal(same.ok, true);
  assert.deepEqual(same.mismatches, []);
  const tampered = clone(d);
  tampered.artifacts[0].sha256 = '0'.repeat(64);
  tampered.trials[0].analysis.speedComparison.simulatedMmS += 1;
  const t = checkDossier(tampered, ws, 'other');
  assert.equal(t.ok, true);
  assert.equal(t.mismatches.length, 3); // code, artifact hash, metrics
  for (const bad of [null, {}, { ...clone(d), selection: [] }, { ...clone(d), selection: ['X', 'X'] }, { ...clone(d), selection: ['SAFFIRE-NOPE'] }, { ...clone(d), kind: 'other' }]) {
    assert.equal(checkDossier(bad, ws, 'abc1234').ok, false);
  }
  assert.throws(() => buildDossier(ws, [], 'x'));
});

test('CSV and Markdown carry hashes, review state and non-causal wording', { skip }, () => {
  const d = buildDossier(ws, ['SAFFIRE-I-S1', 'SAFFIRE-I-S2', 'SAFFIRE-IV-1'], 'abc1234');
  const csv = dossierCsv(d).trim().split('\n');
  assert.equal(csv.length, 4);
  assert.match(csv[2], /review-required/);
  assert.ok(d.trials.every((t) => dossierCsv(d).includes(t.model.artifactSha256)));
  const before = JSON.stringify(d);
  const md = dossierMarkdown(d, englishText);
  assert.match(md, /not causal/);
  assert.match(md, /incompatible observables/);
  assert.match(md, /Cross-trial comparisons are descriptive/);
  assert.doesNotMatch(md, /Comparações|Trajetória|Curva do baseline/);
  assert.equal(JSON.stringify(d), before);
});
