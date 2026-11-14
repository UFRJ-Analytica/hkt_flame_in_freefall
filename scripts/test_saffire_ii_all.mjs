import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  SAFFIRE_II_CASES, readSaffireII5Model, readSaffireIIReplay, simulateSaffireII5,
} from "../src/saffire.ts";

const base = new URL("../public/data/saffire/", import.meta.url);
const artifact = path => JSON.parse(readFileSync(new URL(path, base), "utf8"));

test("all nine SAFFIRE II options load their own model or recorded frames", () => {
  assert.deepEqual(SAFFIRE_II_CASES.map(item => item.sample), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  for (const item of SAFFIRE_II_CASES) {
    if (item.model) {
      const model = readSaffireII5Model(artifact(`psi-99-ii${item.sample}.json`), item.sample);
      const steps = simulateSaffireII5(model);
      assert.ok(steps.at(-1).grid.every(row => row.filter(cell => cell === 1).length > 1));
    } else {
      const replay = readSaffireIIReplay(artifact(`psi-99-ii${item.sample}-replay.json`), item.sample);
      assert.equal(replay.camera[1], String(item.sample));
      for (const frame of replay.frames) {
        const bytes = readFileSync(new URL(frame.path, base));
        assert.equal(bytes.readUInt16BE(0), 0xffd8);
      }
    }
  }
});

test("II-6 uses its own calibration instead of reusing II-5", () => {
  const value = artifact("psi-99-ii6.json");
  assert.equal(readSaffireII5Model(value, 6).probability, 41 / 78);
  assert.throws(() => readSaffireII5Model(value, 5));
});
