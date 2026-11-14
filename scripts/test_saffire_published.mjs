import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { simulateLongitudinal } from "../src/saffire.ts";
import { readPublishedModel } from "../src/saffirePublished.ts";

const cases = [
  ["IV-1", 0.72, 138, "same-trial-curve"],
  ["V-2", 0.68, 146, "same-trial-curve"],
  ["VI-2", 0.81, 122, "numerical-speed-only"],
];

function load(sample) {
  const id = `SAFFIRE-${sample}`;
  const artifact = JSON.parse(readFileSync(new URL(`../public/data/saffire/${id.toLowerCase()}.json`, import.meta.url), "utf8"));
  return readPublishedModel(artifact, id);
}

for (const [sample, probability, durationSeconds, check] of cases) {
  test(`${sample} replays a continuous one-way front using its published speed`, () => {
    const model = load(sample);
    assert.ok(Math.abs(model.probability - probability) < 1e-12);
    assert.equal(model.durationSeconds, durationSeconds);
    assert.equal(model.validation.kind, check);
    assert.equal(model.validation.seedCount, 20);
    assert.deepEqual(model.directionProbabilities, { concurrent: model.probability, opposed: null, lateral: null });
    const steps = simulateLongitudinal(model);
    assert.deepEqual(steps, simulateLongitudinal(model));
    assert.equal(steps.length, durationSeconds / model.stepSeconds + 1);
    assert.deepEqual(steps[0].grid, Array.from({ length: 21 }, () => [1, ...Array(49).fill(0)]));
    let fronts = Array(21).fill(1);
    for (const { grid } of steps) {
      fronts = grid.map((row, y) => {
        assert.equal(row.length, 50);
        const reached = row.reduce((n, cell) => n + cell, 0);
        assert.ok(reached >= fronts[y] && reached <= fronts[y] + 1);
        assert.ok(row.every((cell, x) => cell === Number(x < reached)));
        return reached;
      });
    }
    assert.ok(fronts.every(front => front > 1));
  });

  test(`${sample} reproduces its mean speed before reaching the edge`, () => {
    const model = load(sample);
    const grid = { ...model.grid, lengthMm: 1000, columns: 100 };
    const durationSeconds = 100;
    const speeds = Array.from({ length: 20 }, (_, i) => {
      const { grid: cells } = simulateLongitudinal({ ...model, grid, durationSeconds }, 1951 + i).at(-1);
      const count = cells.flat().reduce((sum, cell) => sum + cell, 0);
      return (count / grid.rows - 1) * grid.dxMm / durationSeconds;
    });
    const mean = speeds.reduce((sum, v) => sum + v, 0) / speeds.length;
    assert.ok(Math.abs(mean - model.calibration.speedMmS) < 0.06);
    if (check === "numerical-speed-only") assert.ok(Math.abs(mean - model.validation.simulatedSpeedMmS) < 1e-12);
  });
}

test("a finished row stays at the edge and never draws an additional advance", () => {
  const model = load("IV-1");
  const steps = simulateLongitudinal(model, 1951, 49);
  const fullAt = steps.findIndex(({ grid }) => grid.every(row => row.every(cell => cell === 1)));
  assert.ok(fullAt > 0 && fullAt < steps.length - 1);
  assert.ok(steps.slice(fullAt).every(step => step.grid.every(row => row.every(cell => cell === 1))));
});

test("rejects probabilities inconsistent with the source or faces with unsupported parameters", () => {
  const model = load("V-2");
  assert.throws(() => readPublishedModel({ ...model, probability: 0.55 }, model.experimentId));
  assert.throws(() => readPublishedModel({ ...model, directionProbabilities: { concurrent: model.probability, opposed: 0 } }, model.experimentId));
  assert.ok(model.validation.digitization.intervalSeconds[1] < 100);
  assert.ok(model.validation.digitization.points.every(([, mm]) => mm < 300));
});
