// Dashboard objective 2: the model-ready table must keep observables and units apart.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildModelRows, rowsToCsv } from "../src/dashboard/modelingData.ts";

const j = (p) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), "utf8"));
const rows = buildModelRows({
  targets: j("modeling-targets.json"), registry: j("saffire/trial-registry.json"),
  sofie: j("sofie/gel-evidence.json"), same: j("same/smoke-analysis.json"), bass: j("bass2/b1-replay.json"),
});

test("every quantity family is present", () => {
  for (const q of ["spread-rate", "flammability-outcome", "extinction-limit", "smoke-particle-size"])
    assert.ok(rows.some((r) => r.quantity === q), q);
});
test("spread rates are mm/s except the unscaled BASS-II video", () => {
  const rates = rows.filter((r) => r.quantity === "spread-rate");
  assert.ok(rates.every((r) => r.unit === "mm/s" || (r.dataset === "BASS-II B1" && r.unit.startsWith("px/s"))));
});
test("char front, flame base and published rates stay labelled separately", () => {
  const obs = new Set(rows.filter((r) => r.quantity === "spread-rate").map((r) => r.observable));
  assert.ok([...obs].some((o) => o.startsWith("char front")));
  assert.ok([...obs].some((o) => o.includes("published")));
});
test("opposed-flow spread rates carry the review flag", () => {
  for (const r of rows.filter((r) => r.quantity === "spread-rate" && r.flowCmS.includes("opposed") && r.dataset !== "BASS-II B1")) assert.match(r.note, /S2_REVIEW/);
});
test("CSV has one line per row plus header", () => {
  assert.equal(rowsToCsv(rows).trimEnd().split("\n").length, rows.length + 1);
});
