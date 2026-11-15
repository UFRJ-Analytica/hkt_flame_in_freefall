/**
 * Offline, real-engine comparison; run: node --test scripts/test_origin_equivalence.mjs
 * MEASURED VERDICT: NOT pathwise/same-seed equivalent at base 837f62c.
 * Real S1 artifact, identical 94x21 grid, kernel, entire observed initial state,
 * and 176 steps: all 22 tested seeds differ (0, 1, 1951..1970). Seed 1951 has
 * 1301 different cell-arrival times; first difference (x=15,y=1), zero-based:
 * replay reaches at step 2, habitat at step 1. Cumulative blocked: 3 versus 0.
 * Replay scans row-major; habitat retains a FIFO exposure frontier, assigning
 * the SAME LCG sequence to different cells. Unmasked deterministic controls
 * agree. Null observation rows additionally censor adjacent replay rows, unlike
 * habitat inert rows (tested independently with p=1, without stochastic noise).
 * Ignition must reproduce the entire observed reached prefix, not a focus.
 * These are local transition-rule controls and pathwise counterexamples, NOT a
 * proof of ensemble/distributional equivalence or experimental validation.
 * Both real exports run unchanged; only this new test file is required.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readSaffireModel, simulateFromObservedFront } from '../src/saffire.ts';
import { runOnce } from '../src/habitat/engine.ts';

const observed = readSaffireModel(JSON.parse(readFileSync(new URL(
  '../public/data/saffire/psi-98-s1-neighbors.json', import.meta.url), 'utf8')));
const cols = 94, rows = 21, cells = cols * rows;
const seeds = [0, 1, ...Array.from({ length: 20 }, (_, i) => 1951 + i)];

// Synthetic fixtures isolate causes; measured-artifact tests below use the real
// table and front unchanged. No retraining, fetching, or model fallback occurs.
function fixture(front, probability, steps = 12) {
  return {
    ...observed,
    initialFront: [...front],
    durationSeconds: steps * observed.stepSeconds,
    combinations: Object.fromEntries(Array.from({ length: 8 }, (_, key) => [
      key.toString(2).padStart(3, '0'),
      { ...observed.combinations[key.toString(2).padStart(3, '0')],
        probability: key === 0 ? null : probability },
    ])),
  };
}

function adapt(model) {
  assert.equal(model.grid.columns, cols);
  assert.equal(model.grid.rows, rows);
  const behavior = new Uint8Array(cells);
  const ignition = new Uint8Array(cells);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const front = model.initialFront[y], i = y * cols + x;
    behavior[i] = front === null ? 0 : 1;
    ignition[i] = Number(front !== null && x < front);
  }
  return { cols, rows, behavior, ignition,
    kernel: Array.from({ length: 8 }, (_, k) =>
      model.combinations[k.toString(2).padStart(3, '0')].probability),
    steps: Math.floor(model.durationSeconds / model.stepSeconds) };
}

function replayArrival(steps) {
  const arrival = new Int16Array(cells).fill(-1);
  steps.forEach(({ grid }, step) => {
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (grid[y][x] === 1 && arrival[i] < 0) arrival[i] = step;
    }
  });
  return arrival;
}

function compare(model, seed) {
  const replay = simulateFromObservedFront(model, seed);
  const habitat = runOnce(adapt(model), seed);
  const arrival = replayArrival(replay);
  const differences = [];
  for (let i = 0; i < cells; i++) if (arrival[i] !== habitat.arrival[i]) {
    const a = arrival[i], b = habitat.arrival[i];
    differences.push({ x: i % cols, y: Math.floor(i / cols), replay: a, habitat: b,
      step: Math.min(a < 0 ? Infinity : a, b < 0 ? Infinity : b) });
  }
  differences.sort((a, b) => a.step - b.step || a.y - b.y || a.x - b.x);
  return { replay, habitat, arrival, differences,
    replayBlocked: replay.reduce((sum, step) => sum + step.blocked, 0) };
}

// Independent ONE-step oracle only: enumerate initial exposed cells, attach
// explicit LCG draws in each visitation order, then compare to both real APIs.
// This is not a replacement multi-step simulation whose equality we assume.
function firstStep(model, seed, frontier) {
  const input = adapt(model);
  const initial = Array.from(input.ignition);
  const eligible = i => !initial[i] && input.behavior[i] === 1;
  const keyAt = i => {
    const x = i % cols, y = Math.floor(i / cols);
    return ((x > 0 ? initial[i - 1] : 0) << 2)
      | ((y > 0 ? initial[i - cols] : 0) << 1)
      | (y + 1 < rows ? initial[i + cols] : 0);
  };
  const order = [];
  if (frontier) {
    const seen = new Set();
    for (let i = 0; i < cells; i++) if (initial[i]) {
      const x = i % cols, y = Math.floor(i / cols);
      const neighbors = [x + 1 < cols ? i + 1 : -1,
        y > 0 ? i - cols : -1, y + 1 < rows ? i + cols : -1];
      for (const neighbor of neighbors) if (neighbor >= 0 && eligible(neighbor) && !seen.has(neighbor)) {
        seen.add(neighbor);
        order.push(neighbor);
      }
    }
  } else {
    for (let i = 0; i < cells; i++) if (eligible(i) && keyAt(i)) order.push(i);
  }
  const result = [...initial], trace = [];
  let rng = seed >>> 0, blocked = 0;
  for (const i of order) {
    const key = keyAt(i), p = input.kernel[key];
    if (!key) continue;
    if (p === null) { blocked++; continue; }
    rng = (Math.imul(1664525, rng) + 1013904223) >>> 0;
    trace.push({ i, key, draw: rng / 0x100000000 });
    if (rng / 0x100000000 < p) result[i] = 1;
  }
  return { result, trace, blocked };
}

function actualStep(result, step) {
  return Array.from(result.arrival, reached => Number(reached >= 0 && reached <= step));
}

test('adapter preserves every 94x21 initial cell, kernel bit order, and step count', () => {
  for (const model of [observed, fixture(Array.from({ length: rows }, (_, y) => y === 10 ? null : y), 1)]) {
    const input = adapt(model);
    const replay = simulateFromObservedFront({ ...model, durationSeconds: 0 }, 1951);
    const habitat = runOnce({ ...input, steps: 0 }, 1951);
    assert.equal(replay.length, 1);
    assert.equal(input.steps, Math.floor(model.durationSeconds / 2));
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const i = y * cols + x, cell = replay[0].grid[y][x];
      assert.equal(input.behavior[i], cell === null ? 0 : 1);
      assert.equal(input.ignition[i], Number(cell === 1));
      assert.equal(habitat.arrival[i], cell === 1 ? 0 : -1);
    }
    for (let k = 0; k < 8; k++) assert.equal(input.kernel[k],
      model.combinations[k.toString(2).padStart(3, '0')].probability);
  }
});

test('unmasked deterministic controls agree on complete arrival fields and blocked totals', () => {
  const fronts = [Array(rows).fill(0), Array(rows).fill(1),
    [1, 3, ...Array(rows - 2).fill(0)], Array(rows).fill(cols)];
  for (const front of fronts) for (const p of [0, 1, null]) for (const seed of [0, 1951, 0xffffffff]) {
    const result = compare(fixture(front, p), seed);
    assert.deepEqual(result.differences, [], `control p=${p}, seed=${seed}`);
    assert.equal(result.replayBlocked, result.habitat.blocked);
    assert.ok(result.habitat.contact.every(step => step === -1));
  }
});

test('first-step RNG is identical but assigned to different cells by FIFO versus row-major', t => {
  const model = fixture([1, 3, ...Array(rows - 2).fill(0)], 0.5, 1);
  const rowMajor = firstStep(model, 1951, false);
  const fifo = firstStep(model, 1951, true);
  assert.deepEqual(rowMajor.trace.map(item => item.i), [1, 2, 97, 188, 189, 190]);
  assert.deepEqual(fifo.trace.map(item => item.i), [1, 188, 189, 97, 2, 190]);
  assert.deepEqual(rowMajor.trace.map(item => item.draw), fifo.trace.map(item => item.draw));
  assert.notDeepEqual(rowMajor.result, fifo.result);
  const replay = simulateFromObservedFront(model, 1951);
  const habitat = runOnce(adapt(model), 1951);
  assert.deepEqual(replay[1].grid.flat(), rowMajor.result);
  assert.deepEqual(actualStep(habitat, 1), fifo.result);
  assert.equal(replay[1].blocked, rowMajor.blocked);
  assert.equal(habitat.blocked, fifo.blocked);
  t.diagnostic(JSON.stringify({ rowMajor: rowMajor.trace, fifo: fifo.trace }));
});

test('zero/one probabilities consume draws, unsupported keys block without drawing', () => {
  const model = fixture([3, 0, 3, 0, 0, 3, ...Array(rows - 6).fill(0)], 0.5, 1);
  model.combinations['001'].probability = 0;
  model.combinations['010'].probability = null;
  model.combinations['100'].probability = 1;
  const input = adapt(model);
  for (const seed of [0, 1, 1951, 0xffffffff]) {
    const rowMajor = firstStep(model, seed, false);
    const fifo = firstStep(model, seed, true);
    for (const expected of [rowMajor, fifo]) {
      assert.ok(expected.blocked > 0);
      assert.ok(expected.trace.some(({ key }) => input.kernel[key] === 0));
      assert.ok(expected.trace.some(({ key }) => input.kernel[key] === 1));
      assert.ok(expected.trace.every(({ key }) => input.kernel[key] !== null));
    }
    const replay = simulateFromObservedFront(model, seed);
    const habitat = runOnce(input, seed);
    assert.deepEqual(replay[1].grid.flat(), rowMajor.result);
    assert.deepEqual(actualStep(habitat, 1), fifo.result);
    assert.equal(replay[1].blocked, rowMajor.blocked);
    assert.equal(habitat.blocked, fifo.blocked);
  }
});

test('real artifact: all 22 matched-input seeds disprove pathwise equivalence', t => {
  assert.equal(adapt(observed).steps, 176);
  assert.ok(observed.initialFront.every(front => front !== null), 'isolate ordering, not masks');
  const measurements = seeds.map(seed => {
    const result = compare(observed, seed);
    // Explain the first step against an independent one-step draw assignment,
    // not merely assert that two opaque output arrays happen to differ.
    const rowMajor = firstStep(observed, seed, false);
    const fifo = firstStep(observed, seed, true);
    assert.deepEqual(result.replay[1].grid.flat(), rowMajor.result);
    assert.deepEqual(actualStep(result.habitat, 1), fifo.result);
    return { seed, differentCells: result.differences.length, first: result.differences[0],
      replayBlocked: result.replayBlocked, habitatBlocked: result.habitat.blocked };
  });
  assert.equal(measurements.length, 22);
  for (const measured of measurements) assert.ok(measured.differentCells > 0,
    `expected measured non-equivalence, seed=${measured.seed}`);
  assert.deepEqual(measurements.find(item => item.seed === 1951), {
    seed: 1951, differentCells: 1301,
    first: { x: 15, y: 1, replay: 2, habitat: 1, step: 1 },
    replayBlocked: 3, habitatBlocked: 0,
  });
  const repeat = compare(observed, 1951);
  assert.deepEqual(repeat.replay, simulateFromObservedFront(observed, 1951));
  assert.deepEqual(repeat.habitat, runOnce(adapt(observed), 1951));
  t.diagnostic(JSON.stringify(measurements));
});

test('null observed rows censor adjacent replay rows; habitat inert rows do not', () => {
  const front = Array(rows).fill(1);
  front[10] = null;
  const model = fixture(front, 1, 5);
  for (const seed of [0, 1951, 1970]) {
    const result = compare(model, seed);
    assert.equal(result.replayBlocked, 0, 'censoring is not counted as unsupported-kernel blocking');
    assert.equal(result.habitat.blocked, 0);
    assert.ok(result.replay.every(step => step.grid[10].every(cell => cell === null)));
    for (let x = 0; x < cols; x++) assert.equal(result.habitat.arrival[10 * cols + x], -1);
    for (const y of [9, 11]) {
      assert.ok(result.replay.every(step => step.grid[y][1] === 0));
      assert.equal(result.habitat.arrival[y * cols + 1], 1);
    }
    for (let step = 0; step <= 5; step++) for (let y = 0; y < rows; y++) {
      if ([9, 10, 11].includes(y)) continue;
      assert.deepEqual(result.replay[step].grid[y], actualStep(result.habitat, step).slice(y * cols, (y + 1) * cols));
    }
    assert.deepEqual([...new Set(result.differences.map(cell => cell.y))], [9, 11]);
    assert.equal(result.differences.length, 10);
  }
});

test('a habitat focus is not the observed initial state, even before any RNG is used', () => {
  const input = adapt(observed);
  const replayInitial = simulateFromObservedFront({ ...observed, durationSeconds: 0 }, 1951)[0].grid.flat();
  const matched = runOnce({ ...input, steps: 0 }, 1951);
  assert.deepEqual(actualStep(matched, 0), replayInitial);
  const ignition = new Uint8Array(cells);
  ignition[10 * cols + 46] = 1;
  const focus = runOnce({ ...input, ignition, steps: 0 }, 1951);
  assert.equal(actualStep(focus, 0).reduce((a, b) => a + b, 0), 1);
  assert.notDeepEqual(actualStep(focus, 0), replayInitial);
  // This is an explicit counterexample, not a claim about a UI's default focus.
});
