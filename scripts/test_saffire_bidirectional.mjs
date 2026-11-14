import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readOpposedModel, readSaffireModel, simulateSaffire } from '../src/saffire.ts';

const load = name => JSON.parse(readFileSync(new URL(
  `../public/data/saffire/psi-98-${name}-neighbors.json`, import.meta.url)));
const s1 = readSaffireModel(load('s1'));
const s2 = readOpposedModel(load('s2'));
const certain = { exposures: 30, transitions: 30, probability: 1, reason: null };

test('SAFFIRE I now advances both ways and replays deterministically', () => {
  const steps = simulateSaffire(s1, s2);
  assert.equal(s2.status, 'ready');
  assert.deepEqual(steps, simulateSaffire(s1, s2));
  assert.deepEqual(steps[0].grid[0].slice(44, 50), [0, 0, 1, 1, 0, 0]);
  assert.ok(steps.at(-1).grid.some(row => row.slice(48).includes(1)));
  assert.ok(steps.at(-1).grid.some(row => row.slice(0, 46).includes(1)));
});

test('an unavailable opposed fit remains blocked', () => {
  const steps = simulateSaffire(s1, { ...s2, status: 'unavailable' });
  assert.ok(steps.at(-1).grid.every(row => row.slice(0, 46).every(cell => cell === 0)));
  assert.equal(steps[1].blocked, s1.grid.rows);
});

test('every row stays contiguous at every step in both missions', () => {
  const third = run => JSON.parse(readFileSync(new URL(
    `../public/data/saffire/psi-100-${run}-neighbors.json`, import.meta.url)));
  for (const [forward, reverse] of [[s1, s2], [
    readSaffireModel(third('s1'), 'PSI-100:t0:r2'),
    readOpposedModel(third('s2'), 'PSI-100:t0:r3'),
  ]]) {
    for (const { grid } of simulateSaffire(forward, reverse)) {
      for (const row of grid) {
        const left = row.indexOf(1);
        const right = row.lastIndexOf(1);
        assert.ok(row.slice(left, right + 1).every(cell => cell === 1));
      }
    }
  }
});

test('supported lateral combinations change the rate on either front', () => {
  const base = { ...certain, probability: 0.5, transitions: 15 };
  const never = { ...certain, probability: 0, transitions: 0 };
  const combinations = { '100': base, '101': never, '110': never, '111': never };
  const boosted = { ...combinations, '101': certain, '110': certain, '111': certain };
  const forward = { ...s1, durationSeconds: 10, combinations };
  const reverse = { status: 'ready', combinations, longitudinal: base };
  const slow = simulateSaffire(forward, reverse);
  assert.notDeepEqual(slow, simulateSaffire({ ...forward, combinations: boosted }, reverse));
  assert.notDeepEqual(slow, simulateSaffire(forward, { ...reverse, combinations: boosted }));
});

test('calibrated sides can advance together without cascading in the same step', () => {
  const forward = { ...s1, combinations: { ...s1.combinations, '100': certain } };
  const reverse = { status: 'ready', combinations: { '100': certain } };
  assert.deepEqual(simulateSaffire(forward, reverse)[1].grid[0].slice(44, 50), [0, 1, 1, 1, 1, 0]);
});

test('reversing airflow mirrors the trajectory and suspended transitions', () => {
  const original = simulateSaffire(s1, s2);
  const reversed = simulateSaffire(s1, s2, -1);
  assert.deepEqual(reversed, original.map(({ grid, blocked }) => ({
    grid: grid.map(row => row.toReversed()), blocked,
  })));
});
