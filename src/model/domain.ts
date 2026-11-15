// Applicability of calibrated evidence to a user scenario. Pure functions, no UI.
// The rule: a number is shown as a prediction only inside the measured domain; outside it
// the product says why and points to the closest measured evidence instead.

export type GravityId = "orbit" | "moon" | "mars";
export const GRAVITY_ENVIRONMENTS: { id: GravityId; label: string; g: number; short: string }[] = [
  { id: "orbit", label: "Orbit", g: 0, short: "0 g" },
  { id: "moon", label: "Moon", g: 0.166, short: "0.17 g" },
  { id: "mars", label: "Mars", g: 0.38, short: "0.38 g" },
];
export const gravityOf = (id: GravityId) => GRAVITY_ENVIRONMENTS.find((env) => env.id === id)!;

export const SURFACE_PRESETS = [
  {
    id: "lunar-exploration",
    label: "Lunar habitat · exploration atmosphere",
    note: "8.2 psia (56.5 kPa) and 34% O₂: exploration atmosphere studied by NASA to shorten EVA prebreathe. Hypothetical ventilation.",
    atmosphere: { oxygen: 34, pressure: 56.5, flow: 10 },
    gravity: "moon" as GravityId,
  },
];

export const PARTIAL_GRAVITY_SOURCES = {
  fm2: "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/flammability-of-materials-on-the-moon-fm2/",
  luci: "https://ntrs.nasa.gov/citations/20250010653",
};

export interface Scenario {
  material: string;
  oxygen: number;
  pressure: number;
  flow: number;
  gravityG: number;
}

export type Status = "ok" | "warn" | "out";
export interface Criterion {
  id: "material" | "oxygen" | "pressure" | "flow" | "gravity";
  label: string;
  scenario: string;
  domain: string;
  status: Status;
  note: string;
}
export interface Assessment {
  status: Status;
  criteria: Criterion[];
}

const fmt = (n: number, digits = 1) => n.toLocaleString("en-US", { maximumFractionDigits: digits });

/** Domain of the SAFFIRE I · S1 neighbourhood model (PSI-98:t0:r2). */
export function assessSaffireS1(s: Scenario): Assessment {
  const criteria: Criterion[] = [];
  criteria.push({
    id: "material", label: "Material", scenario: s.material, domain: "SIBAL 0.37 mm",
    status: s.material === "SIBAL" ? "ok" : "out",
    note: s.material === "SIBAL"
      ? "Same fabric as the trial; the scenario's surface thickness is not verified."
      : "Probabilities were fitted only to SIBAL. No transfer to another material is available.",
  });
  const [o2Low, o2High] = [21.5, 21.7];
  const o2Gap = s.oxygen < o2Low ? o2Low - s.oxygen : s.oxygen > o2High ? s.oxygen - o2High : 0;
  criteria.push({
    id: "oxygen", label: "Oxygen", scenario: `${fmt(s.oxygen)}%`, domain: "21.5–21.7%",
    status: o2Gap === 0 ? "ok" : "out",
    note: o2Gap === 0 ? "Within the measured range."
      : "A single trial does not identify the O₂ effect; spread rate increases with O₂ and cannot be rescaled from this evidence.",
  });
  criteria.push({
    id: "pressure", label: "Pressure", scenario: `${fmt(s.pressure)} kPa`, domain: "not tabulated",
    status: "warn",
    note: "Pressure is not listed in the trial table: it remains unknown, and no range around 1 atm is automatically accepted.",
  });
  const flowGap = Math.min(Math.abs(s.flow - 20), Math.abs(s.flow - 25)) < 1e-6 ? 0 : Infinity;
  const between = s.flow > 20 && s.flow < 25;
  criteria.push({
    id: "flow", label: "Flow", scenario: `${fmt(s.flow)} cm/s`, domain: "20 and 25 cm/s, concurrent",
    status: flowGap === 0 ? "ok" : between ? "warn" : "out",
    note: flowGap === 0
      ? "Speed from one of the trials (SAFFIRE I or III); flow direction relative to the scenario surface is not modeled."
      : "Speed measured in two trials (20 and 25 cm/s). Outside this interval, the dependence is extrapolated using the measured exponent.",
  });
  const gravity = s.gravityG < 0.01;
  criteria.push({
    id: "gravity", label: "Gravity", scenario: s.gravityG < 0.01 ? "microgravity" : `${fmt(s.gravityG, 2)} g`,
    domain: "microgravity (Cygnus)",
    status: gravity ? "ok" : "out",
    note: gravity
      ? "Same regime as the trial."
      : "In partial gravity, buoyancy again induces flow. LUCI and FM² indicate that some materials burn with less O₂ at 1/6 g than at 1 g: neither µg nor 1 g is a conservative bound.",
  });
  const status: Status = criteria.some((c) => c.status === "out") ? "out"
    : criteria.some((c) => c.status === "warn") ? "warn" : "ok";
  return { status, criteria };
}

export interface TargetRecord {
  id: string;
  investigation: string;
  campaign: string;
  sample: string;
  material: string;
  materialDetail: string;
  thicknessMm: number | null;
  lengthMm: number;
  widthMm: number;
  flowCmS: number;
  flowDirection: "concurrent" | "opposed";
  oxygenPct: [number, number] | null;
  oxygenApproximate?: boolean;
  ignition: { powerW: number; durationS: number } | null;
  burnTimeS: number | null;
  outcome: "sustained" | "no-sustained" | "anchored" | "not-ignited" | null;
  spreadRateMmS: number | null;
  spreadRateSource?: { kind: string; label: string; url?: string } | null;
  burnLengthMm: number | null;
  burnLengthApproximate?: boolean;
  onegComparison: { burnLength?: string; spreadRate?: string } | null;
  cameras: string[];
  framesStatus: "processed" | "available" | "not-in-psi";
  source: { file: string; row: number; sha256: string; url: string };
  raw: Record<string, string>;
  notes: string[];
}
export interface DerivedTarget {
  id: string;
  recordId: string;
  quantity: string;
  value: number;
  unit: string;
  method: string;
  limits: string;
}
export interface ModelingTargets {
  schemaVersion: 1;
  outcomeLabels: Record<string, string>;
  records: TargetRecord[];
  derived: DerivedTarget[];
  limits: string[];
}

export function readModelingTargets(value: unknown): ModelingTargets {
  const data = value as Partial<ModelingTargets> | null;
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.records) || !Array.isArray(data.derived)) {
    throw new Error("Invalid modeling-target table.");
  }
  return data as ModelingTargets;
}

export interface Comparable {
  record: TargetRecord;
  score: number;
  mismatches: string[];
  materialMatch: "exact" | "partial" | "none";
}

/** Rank measured records by closeness to the scenario. Distance, not similarity of text. */
export function rankComparables(records: TargetRecord[], s: Scenario): Comparable[] {
  return records.map((record) => {
    const parts = record.material.split(" + ");
    const materialMatch: Comparable["materialMatch"] = record.material === s.material ? "exact" : parts.includes(s.material) ? "partial" : "none";
    const mismatches: string[] = [];
    let score = materialMatch === "exact" ? 0 : materialMatch === "partial" ? 1.5 : 4;
    if (materialMatch !== "exact") mismatches.push(materialMatch === "partial" ? "composite material" : "different material");
    if (record.oxygenPct) {
      const [low, high] = record.oxygenPct;
      const gap = s.oxygen < low ? low - s.oxygen : s.oxygen > high ? s.oxygen - high : 0;
      score += gap / 2;
      if (gap > 0.5) mismatches.push(`ΔO₂ ${fmt(gap)} p.p.`);
    } else {
      score += 1;
      mismatches.push("O₂ not tabulated");
    }
    const flowGap = Math.abs(record.flowCmS - s.flow);
    score += flowGap / 10;
    if (flowGap > 2) mismatches.push(`Δ flow ${fmt(flowGap)} cm/s`);
    if (s.pressure < 95 || s.pressure > 105) mismatches.push("pressure not tabulated");
    if (s.gravityG >= 0.01) {
      score += 2;
      mismatches.push("trial in µg");
    }
    if (record.outcome === null) score += 0.5;
    return { record, score, mismatches, materialMatch };
  }).sort((a, b) => a.score - b.score);
}

/** Wilson score interval for k events in n exposures, assuming independent exposures. Descriptive
 *  only: cells and frames are correlated and observation/model error is not included. */
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (n <= 0) return [0, 1];
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
