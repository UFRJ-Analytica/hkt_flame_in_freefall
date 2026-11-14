import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readOpposedModel, readSaffireModel, simulateSaffire } from '../src/saffire.ts';

const artifact = run => JSON.parse(readFileSync(new URL(
  `../public/data/saffire/psi-100-${run}-neighbors.json`, import.meta.url)));

test('the validated SAFFIRE III scene advances both ways with mission-specific inputs', () => {
  const s1 = readSaffireModel(artifact('s1'), 'PSI-100:t0:r2');
  const s2 = readOpposedModel(artifact('s2'), 'PSI-100:t0:r3');
  assert.throws(() => readSaffireModel(artifact('s1')));
  assert.throws(() => readOpposedModel(artifact('s2')));
  assert.equal(s2.status, 'ready');
  assert.equal(s2.longitudinal.probability, s2.longitudinal.transitions / s2.longitudinal.exposures);
  const simulation = simulateSaffire(s1, s2);
  assert.deepEqual(simulation, simulateSaffire(s1, s2));
  const last = simulation.at(-1).grid;
  assert.ok(last.some(row => row.slice(0, 46).includes(1)));
  assert.ok(last.some(row => row.slice(48).includes(1)));
});
