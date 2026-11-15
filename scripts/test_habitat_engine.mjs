// Invariants of the habitat surface engine (src/habitat/engine.ts), the basis of scenario reproduction.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runEnsemble, runOnce } from '../src/habitat/engine.ts';

const cols = 60, rows = 30, n = cols * rows;
const kernel = [null, 0.006, 0.007, null, 0.2, 0.5, 0.54, 0.95];

function setup({ wall = null } = {}) {
  const behavior = new Uint8Array(n).fill(1);
  if (wall) for (let y = 0; y < rows; y++) behavior[y * cols + wall.col] = wall.behavior;
  const ignition = new Uint8Array(n);
  for (let y = 10; y < 20; y++) for (let x = 5; x < 8; x++) ignition[y * cols + x] = 1;
  return { cols, rows, behavior, ignition, kernel, steps: 150 };
}

test('same seed reproduces the arrival field byte for byte', () => {
  const a = runOnce(setup(), 1951), b = runOnce(setup(), 1951);
  assert.deepEqual(a.arrival, b.arrival);
  assert.deepEqual(a.contact, b.contact);
  assert.equal(a.blocked, b.blocked);
});

test('different seeds give different realisations', () => {
  const [a, b] = runEnsemble(setup(), [1951, 1952]).arrivals;
  assert.notDeepEqual(a, b);
});

test('the front never advances against the ventilation', () => {
  const { arrival } = runOnce(setup(), 1951);
  for (let y = 0; y < rows; y++) for (let x = 0; x < 5; x++) assert.equal(arrival[y * cols + x], -1);
});

test('imposed ignition only lights propagating cells', () => {
  const input = setup();
  input.behavior.fill(3, 10 * cols, 11 * cols); // row 10 unknown material, inside the ignition patch
  const { arrival } = runOnce(input, 1951);
  for (let x = 5; x < 8; x++) assert.equal(arrival[10 * cols + x], -1);
});

test('a non-propagating column stops the front and records the contact', () => {
  for (const behavior of [2, 3]) {
    const { arrival, contact } = runOnce(setup({ wall: { col: 30, behavior } }), 1951);
    for (let y = 0; y < rows; y++) {
      assert.equal(arrival[y * cols + 30], -1);
      for (let x = 31; x < cols; x++) assert.equal(arrival[y * cols + x], -1);
    }
    assert.ok([...contact].some((c) => c > 0), 'contact step recorded');
  }
});

test('a zero kernel (quench) does not spread beyond the imposed focus', () => {
  const input = { ...setup(), kernel: kernel.map((p) => (p === null ? null : 0)) };
  const { arrival } = runOnce(input, 1951);
  assert.equal([...arrival].filter((a) => a > 0).length, 0);
});
