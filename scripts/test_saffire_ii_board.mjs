import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  readSaffireII5Model, readSaffireIILocalized, saffireIILocalizedGrid, SAFFIRE_II_BOARD, simulateSaffireII5,
} from "../src/saffire.ts";

const load = name => JSON.parse(readFileSync(
  new URL(`../public/data/saffire/${name}.json`, import.meta.url), "utf8",
));

test("all SAFFIRE II cases use a 406 mm visual width without changing calibration", () => {
  assert.equal(SAFFIRE_II_BOARD.widthMm, 406);
  for (const sample of [5, 6]) {
    const model = readSaffireII5Model(load(`psi-99-ii${sample}`), sample);
    assert.equal(model.grid.widthMm, 50);
    const steps = simulateSaffireII5(model, SAFFIRE_II_BOARD.rows);
    assert.equal(steps[0].grid.length, 21);
    assert.equal(steps[0].grid[20].length, 29);
    assert.ok(steps.at(-1).grid.every(row => row[1] === 1));
  }
  for (const sample of [1, 2, 3, 4, 7, 8, 9]) {
    const model = readSaffireIILocalized(load(`psi-99-ii${sample}-board`), sample);
    const time = model.observations.find(item => item.edgeGlow).timeSeconds;
    assert.equal(model.probability, null);
    const grid = saffireIILocalizedGrid(model, time);
    assert.equal(grid.length, 21);
    assert.equal(grid[0][sample === 4 ? 28 : 0], 2);
    assert.equal(grid[0].filter(cell => cell !== 0).length, 1);
    const final = saffireIILocalizedGrid(model, model.durationSeconds);
    assert.equal(final[0].filter(cell => cell === 1).length, sample === 7 ? 5 : 0);
    assert.ok(final.every(row => !row.includes(2)));
  }
});
