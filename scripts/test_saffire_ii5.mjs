import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { readSaffireII5Model, simulateSaffireII5 } from "../src/saffire.ts";

const artifact = JSON.parse(readFileSync(new URL(
  "../public/data/saffire/psi-99-ii5.json", import.meta.url,
), "utf8"));

test("II-5 uses the measured rate on a narrow plate and advances only from the upstream edge", () => {
  const model = readSaffireII5Model(artifact);
  assert.equal(model.probability, 44 / 96);
  const steps = simulateSaffireII5(model);
  assert.deepEqual(steps, simulateSaffireII5(model));
  assert.equal(steps.length, model.durationSeconds / model.stepSeconds + 1);

  let fronts = [1, 1, 1];
  for (const { grid, blocked } of steps) {
    assert.equal(blocked, 0);
    assert.equal(grid.length, 3);
    fronts = grid.map((row, y) => {
      assert.equal(row.length, 29);
      const reached = row.indexOf(0) < 0 ? row.length : row.indexOf(0);
      assert.ok(reached >= fronts[y] && reached <= fronts[y] + 1);
      assert.ok(row.slice(0, reached).every(cell => cell === 1));
      assert.ok(row.slice(reached).every(cell => cell === 0));
      return reached;
    });
  }
  assert.ok(fronts.every(front => front > 1));
  assert.deepEqual(steps[0].grid, Array.from({ length: 3 }, () => [1, ...Array(28).fill(0)]));
});

test("II-5 rejects an unrelated experiment or a rate inconsistent with the counts", () => {
  assert.throws(() => readSaffireII5Model({ ...artifact, experimentId: "PSI-99:t0:r5" }));
  assert.throws(() => readSaffireII5Model({ ...artifact, probability: 0.42 }));
});
