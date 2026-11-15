// Configurable fabric items on the habitat wall (src/habitat/habitatModel.ts + engine.ts).
import assert from 'node:assert/strict';
import test from 'node:test';
import { runEnsemble, runOnce } from '../src/habitat/engine.ts';
import { buildGrid, GRID, ignitionMask, pieceCells, piecesToZones } from '../src/habitat/habitatModel.ts';

const conditions = { oxygen: 21.6, pressure: 101.3, flow: 20, gravityG: 0 };
// Strong kernel so the tests are about geometry, not about luck.
const kernel = [null, 0.5, 0.5, 0.6, 0.9, 0.95, 0.95, 0.99];
const piece = (id, col, row, lengthMm, widthMm) => ({ id, kind: 'liner', col, row, lengthMm, widthMm });
const fuelCells = (pieces) => buildGrid(piecesToZones(pieces), conditions).behavior.reduce((n, b) => n + (b === 1 ? 1 : 0), 0);
const run = (pieces, ignition, seed = 1951, steps = 400) => {
  const grid = buildGrid(piecesToZones(pieces), conditions);
  return { grid, result: runOnce({ cols: GRID.cols, rows: GRID.rows, behavior: grid.behavior, ignition: ignitionMask(ignition.col, ignition.row), kernel, steps }, seed) };
};
const reachedIn = (grid, result, zone) => {
  let n = 0;
  for (let i = 0; i < result.arrival.length; i++) if (grid.zoneIndex[i] === zone && result.arrival[i] >= 0) n++;
  return n;
};

test('item size changes the number of fuel cells at the fixed 10 x 20 mm cell scale', () => {
  assert.equal(fuelCells([piece('a', 10, 10, 1000, 400)]), 100 * 20);
  assert.equal(fuelCells([piece('a', 10, 10, 2000, 400)]), 200 * 20);
  assert.equal(fuelCells([piece('a', 10, 10, 1000, 800)]), 100 * 40);
});

test('items are clamped inside the wall', () => {
  const c = pieceCells(piece('a', GRID.cols + 50, -5, 1000, 400));
  assert.equal(c.col + c.cols, GRID.cols);
  assert.equal(c.row, 0);
});

test('the wall itself never burns and fire does not jump a gap between items', () => {
  const a = piece('a', 20, 40, 1000, 600);
  const b = piece('b', 140, 40, 1000, 600); // 20 cells (200 mm) downstream of a
  const { grid, result } = run([a, b], { col: 30, row: 55 });
  assert.ok(reachedIn(grid, result, 1) > 500, 'the ignited item burns');
  assert.equal(reachedIn(grid, result, 0), 0, 'wall panels stay intact');
  assert.equal(reachedIn(grid, result, 2), 0, 'separate item is not reached');
});

test('fire crosses into an item that touches the burning one', () => {
  const a = piece('a', 20, 40, 1000, 600);
  const b = piece('b', 120, 40, 1000, 600); // shares the edge at col 120
  const { grid, result } = run([a, b], { col: 30, row: 55 });
  assert.ok(reachedIn(grid, result, 2) > 0);
});

test('ignition outside fabric lights nothing; same inputs and seed reproduce the field', () => {
  const a = piece('a', 20, 40, 1000, 600);
  const off = run([a], { col: 300, row: 200 });
  assert.equal(off.result.arrival.filter((x) => x >= 0).length, 0);
  const grid = buildGrid(piecesToZones([a]), conditions);
  const input = { cols: GRID.cols, rows: GRID.rows, behavior: grid.behavior, ignition: ignitionMask(30, 55), kernel, steps: 200 };
  const [r1, r2] = [runEnsemble(input, [7, 8]), runEnsemble(input, [7, 8])];
  assert.deepEqual(r1.arrivals, r2.arrivals);
});
