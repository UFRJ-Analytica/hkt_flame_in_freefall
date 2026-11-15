import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { findOriginTrial, originalFramePath, pieceSummary, safeEvidenceUrl } from '../src/habitat/originEvidence.ts';

const registry = JSON.parse(readFileSync(new URL('../public/data/saffire/trial-registry.json', import.meta.url), 'utf8'));

test('origin uses the selected registry trial without replacing unknown IDs', () => {
  const selected = findOriginTrial(registry, 'SAFFIRE-I-S1');
  assert.equal(selected.geometry.lengthMm, 940);
  assert.equal(selected.geometry.widthMm, 406);
  assert.equal(selected.thicknessMm, 0.37);
  assert.equal(findOriginTrial(registry, 'FUTURE-TRIAL'), null);
  assert.equal(findOriginTrial(null, 'SAFFIRE-I-S1'), null);
});

test('original images are used only when published for that exact sample', () => {
  assert.equal(originalFramePath('SAFFIRE-II-1'), 'data/saffire/ii-replays/1/00.jpg');
  assert.equal(originalFramePath('SAFFIRE-I-S1'), null);
  assert.equal(originalFramePath('SAFFIRE-II-5'), null);
  assert.equal(originalFramePath('FUTURE-TRIAL'), null);
});

test('piece description converts millimetres to metres without altering inputs', () => {
  const piece = { lengthMm: 1200, widthMm: 400 };
  assert.equal(pieceSummary(piece), 'Your 1.2 × 0.4 m piece');
  assert.deepEqual(piece, { lengthMm: 1200, widthMm: 400 });
  assert.equal(pieceSummary({ lengthMm: NaN, widthMm: -1 }), 'Your configured piece');
});

test('evidence links allow only HTTP(S) sources', () => {
  assert.equal(safeEvidenceUrl('https://psi.nasa.gov/physci/repo/data/investigations/PSI-98'), 'https://psi.nasa.gov/physci/repo/data/investigations/PSI-98');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '/relative', null]) assert.equal(safeEvidenceUrl(url), null);
});
