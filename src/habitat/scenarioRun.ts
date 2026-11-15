// One habitat scenario → engine input, metrics and a fingerprint of the full arrival field.
// Shared by the live habitat and the A/B alternatives so both run exactly the same pipeline.

import { gravityOf, type GravityId } from "../model/domain";
import type { EngineInput, EnsembleResult } from "./engine";
import { buildGrid, CELL, CELL_AREA_M2, GRID, ignitionMask, MAX_PIECES, PIECE_KINDS, PIECE_LIMITS, piecesToZones, type Piece, type Zone } from "./habitatModel";
import {
  compareToTrial, rankTrials, scenarioKernel,
  type AnchorKernel, type CrossTrial, type RunLevel, type Trial, type TrialRegistry,
} from "./trials";

export const DURATION_S = 1200;
export const STEPS = DURATION_S / CELL.stepSeconds;
export const SEED_COUNT = 20;
export const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 1951 + i);
const GRAVITIES: GravityId[] = ["orbit", "moon", "mars"];

export interface ScenarioInputs {
  oxygen: number; pressure: number; flow: number; gravity: GravityId;
  pieces: Piece[];
  ignition: { col: number; row: number };
  anchorChoice: string;
}

/** Structural validation; returns problems (empty = valid). Used before any state change. */
export function validateInputs(v: unknown): string[] {
  const p: string[] = [];
  const o = v as Partial<ScenarioInputs> | null;
  const num = (x: unknown, lo: number, hi: number) => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;
  if (!o || typeof o !== "object") return ["missing inputs"];
  if (!num(o.oxygen, 15, 40)) p.push("O₂ outside 15–40%");
  if (!num(o.pressure, 35, 110)) p.push("pressure outside 35–110 kPa");
  if (!num(o.flow, 0, 40)) p.push("flow outside 0–40 cm/s");
  if (!GRAVITIES.includes(o.gravity as GravityId)) p.push("unknown gravity");
  const inRange = (x: unknown, [lo, hi]: readonly [number, number]) => num(x, lo, hi);
  if (!Array.isArray(o.pieces) || o.pieces.length < 1 || o.pieces.length > MAX_PIECES ||
    !o.pieces.every((q) => q && typeof q.id === "string" && q.kind in PIECE_KINDS && Number.isInteger(q.col) && Number.isInteger(q.row) &&
      inRange(q.lengthMm, PIECE_LIMITS.lengthMm) && inRange(q.widthMm, PIECE_LIMITS.widthMm))) p.push("invalid fabric items");
  if (!o.ignition || !Number.isInteger(o.ignition.col) || !Number.isInteger(o.ignition.row) ||
    o.ignition.col < 0 || o.ignition.col >= GRID.cols || o.ignition.row < 0 || o.ignition.row >= GRID.rows) p.push("ignition outside the wall");
  if (typeof o.anchorChoice !== "string") p.push("missing reference trial");
  return p;
}

export interface PreparedRun {
  conditions: { oxygen: number; pressure: number; flow: number; gravityG: number };
  zones: Zone[];
  grid: ReturnType<typeof buildGrid>;
  anchor: Trial | undefined;
  diffs: ReturnType<typeof compareToTrial>;
  kernel: ReturnType<typeof scenarioKernel> | null;
  level: RunLevel;
  engineInput: EngineInput | null;
}

export function prepareRun(inputs: ScenarioInputs, registry: TrialRegistry, anchorKernels: Record<string, AnchorKernel>, second: CrossTrial | null): PreparedRun {
  const conditions = { oxygen: inputs.oxygen, pressure: inputs.pressure, flow: inputs.flow, gravityG: gravityOf(inputs.gravity).g };
  const zones = piecesToZones(inputs.pieces);
  const grid = buildGrid(zones, conditions);
  const scenario = { material: "SIBAL", ...conditions };
  const ranked = rankTrials(registry, scenario);
  const anchor = ranked.find((r) => r.trial.id === inputs.anchorChoice)?.trial ?? ranked[0]?.trial;
  const diffs = anchor ? compareToTrial(anchor, scenario) : [];
  const kernel = anchor && anchorKernels[anchor.id] ? scenarioKernel(anchor, anchorKernels, second, scenario, diffs) : null;
  return {
    conditions, zones, grid, anchor, diffs, kernel, level: kernel?.level ?? "extrapolation",
    engineInput: kernel ? { cols: GRID.cols, rows: GRID.rows, behavior: grid.behavior,
      ignition: ignitionMask(inputs.ignition.col, inputs.ignition.row), kernel: kernel.p, steps: STEPS } : null,
  };
}

export function quantiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], median: sorted[sorted.length >> 1], max: sorted[sorted.length - 1] };
}

/** Front speed with the trials' statistic: median over the strips of the ignition line. */
function bandSpeed(arrival: Int16Array, steps: number, row0: number): number | null {
  const rows: Int16Array[] = [];
  for (let y = Math.max(0, row0 - 10); y < Math.min(GRID.rows, row0 + 10); y++) {
    const front = new Int16Array(steps + 1);
    for (let x = 0; x < GRID.cols; x++) {
      const a = arrival[y * GRID.cols + x];
      if (a >= 0 && x + 1 > front[a]) front[a] = x + 1;
    }
    for (let t = 1; t <= steps; t++) if (front[t - 1] > front[t]) front[t] = front[t - 1];
    rows.push(front);
  }
  const ts: number[] = [], xs: number[] = [];
  const start = [...rows.map((r) => r[0])].sort((a, b) => a - b)[rows.length >> 1];
  for (let t = 0; t <= steps; t += 5) {
    const median = rows.map((r) => r[t]).sort((a, b) => a - b)[rows.length >> 1];
    if (median >= GRID.cols - 5) break;
    if (median > start + 3) { ts.push(t * CELL.stepSeconds); xs.push(median * CELL.alongMm); }
  }
  if (ts.length < 4) return null;
  const mt = ts.reduce((a, b) => a + b) / ts.length, mx = xs.reduce((a, b) => a + b) / xs.length;
  let n = 0, d = 0;
  ts.forEach((t, i) => { n += (t - mt) * (xs[i] - mx); d += (t - mt) ** 2; });
  return n / d;
}

export function computeMetrics(ensemble: EnsembleResult, zoneIndex: Uint8Array, behavior: Uint8Array, zoneCount: number, ignitionRow: number) {
  const steps = ensemble.steps;
  const area: Float32Array[] = [];
  const zoneEvents: number[][] = Array.from({ length: zoneCount }, () => []);
  const speeds: number[] = [];
  let unknownContactRuns = 0;
  ensemble.arrivals.forEach((arrival, s) => {
    const histogram = new Float32Array(steps + 1);
    const first = new Array(zoneCount).fill(-1);
    let unknownContact = false;
    for (let i = 0; i < arrival.length; i++) {
      const a = arrival[i];
      const z = zoneIndex[i];
      if (a >= 0) {
        histogram[a] += CELL_AREA_M2;
        if (first[z] < 0 || a < first[z]) first[z] = a;
      } else if (behavior[i] >= 2) {
        const c = ensemble.contacts[s][i];
        if (c >= 0 && (first[z] < 0 || c < first[z])) first[z] = c;
        if (c >= 0 && behavior[i] === 3) unknownContact = true;
      }
    }
    for (let t = 1; t <= steps; t++) histogram[t] += histogram[t - 1];
    area.push(histogram);
    first.forEach((value, z) => zoneEvents[z].push(value));
    const sp = bandSpeed(arrival, steps, ignitionRow);
    if (sp !== null) speeds.push(sp);
    if (unknownContact) unknownContactRuns++;
  });
  speeds.sort((a, b) => a - b);
  return { area, zoneEvents, speedMmS: speeds.length ? speeds[speeds.length >> 1] : 0, unknownContactFraction: unknownContactRuns / ensemble.arrivals.length };
}

/** SHA-256 over every realisation's arrival and contact field: equality means the whole field
 *  reproduced, not just two aggregate metrics. */
export async function fieldFingerprint(ensemble: EnsembleResult): Promise<string> {
  const parts = [...ensemble.arrivals, ...ensemble.contacts];
  const total = parts.reduce((n, a) => n + a.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const a of parts) { bytes.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), offset); offset += a.byteLength; }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
