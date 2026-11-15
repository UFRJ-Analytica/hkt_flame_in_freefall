// Applicability of calibrated evidence to a user scenario. Pure functions, no UI.
// The rule: a number is shown as a prediction only inside the measured domain; outside it
// the product says why and points to the closest measured evidence instead.

export type GravityId = "orbit" | "moon" | "mars";
export const GRAVITY_ENVIRONMENTS: { id: GravityId; label: string; g: number; short: string }[] = [
  { id: "orbit", label: "Órbita", g: 0, short: "0 g" },
  { id: "moon", label: "Lua", g: 0.166, short: "0,17 g" },
  { id: "mars", label: "Marte", g: 0.38, short: "0,38 g" },
];
export const gravityOf = (id: GravityId) => GRAVITY_ENVIRONMENTS.find((env) => env.id === id)!;

export const SURFACE_PRESETS = [
  {
    id: "lunar-exploration",
    label: "Habitat lunar · atmosfera de exploração",
    note: "8,2 psia (56,5 kPa) e 34% O₂: atmosfera de exploração estudada pela NASA para encurtar o prebreathe de EVA. Ventilação hipotética.",
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

const fmt = (n: number, digits = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: digits });

/** Domain of the SAFFIRE I · S1 neighbourhood model (PSI-98:t0:r2). */
export function assessSaffireS1(s: Scenario): Assessment {
  const criteria: Criterion[] = [];
  criteria.push({
    id: "material", label: "Material", scenario: s.material, domain: "SIBAL 0,37 mm",
    status: s.material === "SIBAL" ? "ok" : "out",
    note: s.material === "SIBAL"
      ? "Mesmo tecido do ensaio; a espessura da superfície do cenário não é verificada."
      : "As probabilidades foram ajustadas só em SIBAL. Não há transferência para outro material.",
  });
  const [o2Low, o2High] = [21.5, 21.7];
  const o2Gap = s.oxygen < o2Low ? o2Low - s.oxygen : s.oxygen > o2High ? s.oxygen - o2High : 0;
  criteria.push({
    id: "oxygen", label: "Oxigênio", scenario: `${fmt(s.oxygen)}%`, domain: "21,5–21,7%",
    status: o2Gap === 0 ? "ok" : "out",
    note: o2Gap === 0 ? "Dentro da faixa medida."
      : "Um único ensaio não identifica o efeito do O₂; a taxa de propagação cresce com O₂ e não pode ser reescalada daqui.",
  });
  criteria.push({
    id: "pressure", label: "Pressão", scenario: `${fmt(s.pressure)} kPa`, domain: "não tabulada",
    status: "warn",
    note: "A pressão não consta da tabela do ensaio: permanece desconhecida, e nenhuma faixa em torno de 1 atm é aprovada automaticamente.",
  });
  const flowGap = Math.min(Math.abs(s.flow - 20), Math.abs(s.flow - 25)) < 1e-6 ? 0 : Infinity;
  const between = s.flow > 20 && s.flow < 25;
  criteria.push({
    id: "flow", label: "Escoamento", scenario: `${fmt(s.flow)} cm/s`, domain: "20 e 25 cm/s, concorrente",
    status: flowGap === 0 ? "ok" : between ? "warn" : "out",
    note: flowGap === 0
      ? "Velocidade de um dos ensaios (SAFFIRE I ou III); a direção do escoamento em relação à superfície do cenário não é modelada."
      : "Velocidade medida em dois ensaios (20 e 25 cm/s). Fora desse intervalo a dependência é extrapolada com o expoente medido.",
  });
  const gravity = s.gravityG < 0.01;
  criteria.push({
    id: "gravity", label: "Gravidade", scenario: s.gravityG < 0.01 ? "microgravidade" : `${fmt(s.gravityG, 2)} g`,
    domain: "microgravidade (Cygnus)",
    status: gravity ? "ok" : "out",
    note: gravity
      ? "Mesmo regime do ensaio."
      : "Em gravidade parcial o empuxo volta a induzir escoamento. LUCI e FM² indicam que alguns materiais queimam com menos O₂ em 1/6 g do que em 1 g: nem µg nem 1 g são limites conservadores.",
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
    throw new Error("Tabela de alvos de modelagem inválida.");
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
    if (materialMatch !== "exact") mismatches.push(materialMatch === "partial" ? "material composto" : "outro material");
    if (record.oxygenPct) {
      const [low, high] = record.oxygenPct;
      const gap = s.oxygen < low ? low - s.oxygen : s.oxygen > high ? s.oxygen - high : 0;
      score += gap / 2;
      if (gap > 0.5) mismatches.push(`ΔO₂ ${fmt(gap)} p.p.`);
    } else {
      score += 1;
      mismatches.push("O₂ não tabulado");
    }
    const flowGap = Math.abs(record.flowCmS - s.flow);
    score += flowGap / 10;
    if (flowGap > 2) mismatches.push(`Δ escoamento ${fmt(flowGap)} cm/s`);
    if (s.pressure < 95 || s.pressure > 105) mismatches.push("pressão não tabulada");
    if (s.gravityG >= 0.01) {
      score += 2;
      mismatches.push("ensaio em µg");
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
