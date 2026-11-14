// Lunar surface habitat: liner geometry, material zones and the evidence rules that decide how each
// material may behave in the simulation. Every rule names the measurement (or the absence of one) behind it.

import type { SaffireModel } from "../saffire";

/** Liner cell size equals the SAFFIRE I S1 calibration grid: 10 mm along the flow, 20 mm across. */
export const CELL = { alongMm: 10, acrossMm: 20, stepSeconds: 2 };
export const MODULE = { radius: 2.0, linerRadius: 1.93, length: 6.4, linerX0: -2.0, linerX1: 2.0 };
/** Liner arc, angle measured from the top of the module toward the back wall (camera looks from +z). */
export const LINER = { phi0: -2.25, phi1: 0.35 };
export const GRID = {
  cols: Math.round(((MODULE.linerX1 - MODULE.linerX0) * 1000) / CELL.alongMm),
  rows: Math.round((MODULE.linerRadius * (LINER.phi1 - LINER.phi0) * 1000) / CELL.acrossMm),
};
export const CELL_AREA_M2 = (CELL.alongMm / 1000) * (CELL.acrossMm / 1000);

export const MATERIAL_IDS = ["SIBAL", "Nomex", "PMMA", "Silicone", "Kapton", "Alumínio"] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];
export const MATERIAL_INFO: Record<MaterialId, { label: string; color: [number, number, number] }> = {
  SIBAL: { label: "Tecido algodão/fibra de vidro (SIBAL)", color: [205, 191, 155] },
  Nomex: { label: "Nomex", color: [196, 178, 112] },
  PMMA: { label: "PMMA (acrílico)", color: [146, 186, 198] },
  Silicone: { label: "Silicone", color: [170, 160, 170] },
  Kapton: { label: "Kapton (filme de poliimida)", color: [200, 128, 52] },
  "Alumínio": { label: "Alumínio", color: [128, 137, 148] },
};

export interface Zone {
  id: string;
  name: string;
  hint: string;
  /** Inclusive-exclusive ranges in liner cells. */
  cols: [number, number];
  rows: [number, number];
  material: MaterialId;
}

const r = (fraction: number) => Math.round(fraction * GRID.rows);
export const DEFAULT_ZONES: Zone[] = [
  { id: "stowage", name: "Bolsas de estiva", hint: "parede traseira inferior", cols: [0, GRID.cols], rows: [0, r(0.36)], material: "SIBAL" },
  { id: "racks", name: "Painéis de equipamentos", hint: "parede traseira, lado de entrada", cols: [0, 250], rows: [r(0.36), r(0.66)], material: "Alumínio" },
  { id: "quarters", name: "Cortinas dos alojamentos", hint: "parede traseira, lado do fundo", cols: [250, GRID.cols], rows: [r(0.36), r(0.66)], material: "Nomex" },
  { id: "cables", name: "Feixe de cabos", hint: "transição para o teto", cols: [0, GRID.cols], rows: [r(0.66), r(0.71)], material: "Kapton" },
  { id: "ceiling", name: "Revestimento do teto", hint: "teto", cols: [0, GRID.cols], rows: [r(0.71), GRID.rows], material: "SIBAL" },
];

export interface Conditions {
  oxygen: number;
  pressure: number;
  flow: number;
  gravityG: number;
}

/** 0 inert · 1 propagates with the calibrated kernel · 2 measured not to sustain · 3 unknown. */
export type Behavior = 0 | 1 | 2 | 3;
export type Tier = "calibrated" | "exploratory" | "measured-no-spread" | "unknown" | "inert";
export interface MaterialRule {
  behavior: Behavior;
  tier: Tier;
  title: string;
  evidence: string;
  bias?: string;
}

const SAFFIRE_II_O2_MAX = 22.1;
const nearAtmosphere = (p: number) => p >= 95 && p <= 105;

export function materialRule(material: MaterialId, c: Conditions): MaterialRule {
  const microgravity = c.gravityG < 0.01;
  const saffireAtmosphere = c.oxygen <= SAFFIRE_II_O2_MAX + 0.5 && nearAtmosphere(c.pressure) && microgravity;
  switch (material) {
    case "SIBAL": {
      const testAtmosphere = c.oxygen >= 21 && c.oxygen <= 22.2 && nearAtmosphere(c.pressure) && microgravity;
      if (testAtmosphere && Math.abs(c.flow - 20) <= 1) return {
        behavior: 1, tier: "calibrated", title: "Calibrado",
        evidence: "Probabilidades de avanço ajustadas nas imagens do SAFFIRE I · S1 (SIBAL, 20 cm/s, 21,5–21,7% O₂, µg).",
      };
      if (testAtmosphere && Math.abs(c.flow - 25) <= 1.5) return {
        behavior: 1, tier: "calibrated", title: "Calibrado",
        evidence: "Probabilidades de avanço ajustadas nas imagens do SAFFIRE-III · S1 (SIBAL, 25 cm/s, 21,2% O₂, µg; condições do artigo da equipe).",
      };
      const bias = [
        c.oxygen > 22.2 && "O₂ acima do ensaio acelera a propagação: a simulação tende a subestimar.",
        c.oxygen < 21 && "O₂ abaixo do ensaio desacelera e pode extinguir: a simulação tende a superestimar.",
        !nearAtmosphere(c.pressure) && "Pressão diferente do ensaio não é modelada.",
        !microgravity && "Em gravidade parcial o empuxo induz escoamento adicional; LUCI indica maior inflamabilidade em 1/6 g para alguns materiais.",
      ].filter(Boolean).join(" ");
      return {
        behavior: 1, tier: "exploratory", title: "Exploratório",
        evidence: "Núcleo do ensaio mais próximo (SAFFIRE I a 20 cm/s ou SAFFIRE-III a 25 cm/s), com a intensidade escalada por (u/u_ref)^β, β medido entre os dois ensaios. Efeitos de O₂, pressão e gravidade não modelados.",
        bias: bias || undefined,
      };
    }
    case "Nomex":
      return saffireAtmosphere
        ? { behavior: 2, tier: "measured-no-spread", title: "Não ignitou no ensaio", evidence: "SAFFIRE-II 2-7: a chama do PMMA consumiu a porção de PMMA e não ignitou o Nomex 0,37 mm (~22% O₂, 20 cm/s, µg)." }
        : { behavior: 3, tier: "unknown", title: "Desconhecido", evidence: "Só há ensaio de Nomex em ~22% O₂, 1 atm, µg. Nestas condições não há evidência: a simulação para aqui e marca o contato." };
    case "Silicone":
      return saffireAtmosphere
        ? { behavior: 2, tier: "measured-no-spread", title: "Não sustentou chama", evidence: "SAFFIRE-II 2-1 a 2-4: comprimento queimado ~0 em µg, 0,27–1,03 mm, ~22% O₂." }
        : { behavior: 3, tier: "unknown", title: "Desconhecido", evidence: "Ensaio só em ~22% O₂, 1 atm, µg." };
    case "PMMA":
      return saffireAtmosphere
        ? { behavior: 2, tier: "measured-no-spread", title: "Chama ancorada", evidence: "SAFFIRE-II 2-8/2-9: chama ancorada na base, regressão 0,01–0,04 mm/s, sem propagação ao longo da amostra." }
        : { behavior: 3, tier: "unknown", title: "Desconhecido", evidence: "Ensaio só em ~22% O₂, 1 atm, µg." };
    case "Kapton":
      return { behavior: 3, tier: "unknown", title: "Desconhecido", evidence: "Nenhum ensaio de propagação de Kapton nos dados PSI deste projeto (há só medições de fumaça no SAME)." };
    case "Alumínio":
      return { behavior: 0, tier: "inert", title: "Não combustível (premissa)", evidence: "Estrutura metálica tratada como não combustível; não é resultado de ensaio." };
  }
}

/** SAFFIRE-III S1 (25 cm/s), measured with the same pipeline; see scripts/crosstrial_saffire.py. */
export interface SecondTrial {
  neighborhood: { combinations: Record<string, { exposures: number; transitions: number; probability: number | null }> };
  observed: { speedMmS: number; standardErrorMmS: number };
  comparisonWithSaffireI: { saffireIObservedSpeedMmS: number; beta: number };
  prediction: { unscaledSpeedMmS: number; linearFlowSpeedMmS: number; observedSpeedMmS: number };
  /** Simulation-calibrated kernels: one hazard factor per trial so the simulated speed matches the measured one. */
  speedMatch?: Record<"saffireI" | "saffireIII", {
    factor: number; targetSpeedMmS: number; simulatedBeforeMmS: number; simulatedAfterMmS: number;
    combinations: Record<string, { probability: number | null }>;
  }>;
}

export interface Kernel {
  p: (number | null)[];
  flowFactor: number;
  quench: boolean;
  reference: "SAFFIRE I · S1 (20 cm/s)" | "SAFFIRE-III · S1 (25 cm/s)";
  beta: number;
}

/** Advance probabilities per 2 s step for the propagating material, keyed by upstream/above/below.
 *  Base kernel = the trial at the nearest measured flow; outside it the hazard is scaled by
 *  (u/u_ref)^beta, beta measured between the two trials (falls back to 1 without the second trial). */
export function buildKernel(model: SaffireModel, second: SecondTrial | null, c: Conditions, tier: Tier): Kernel {
  const quench = c.flow < 2;
  const useSecond = second !== null && c.flow > 22.5;
  const uRef = useSecond ? 25 : 20;
  const beta = second?.comparisonWithSaffireI.beta ?? 1;
  const flowFactor = tier === "calibrated" ? 1 : Math.pow(Math.min(40, Math.max(2, c.flow)) / uRef, beta);
  const p: (number | null)[] = [];
  for (let key = 0; key < 8; key++) {
    const k = key.toString(2).padStart(3, "0");
    // Prefer the simulation-calibrated kernels; keys without an estimate at 25 cm/s fall back to 20 cm/s.
    const matched = second?.speedMatch;
    const kernel20 = matched?.saffireI.combinations ?? model.combinations;
    const kernel30 = matched?.saffireIII.combinations ?? second?.neighborhood.combinations;
    const primary = useSecond ? kernel30?.[k]?.probability ?? null : null;
    const base = primary ?? kernel20[k]?.probability ?? null;
    if (base === null) { p.push(null); continue; }
    if (quench) { p.push(0); continue; }
    // Constant-hazard equivalence: lambda = -ln(1-p)/dt scaled by the flow factor.
    p.push(1 - Math.pow(1 - base, flowFactor));
  }
  return { p, flowFactor, quench, reference: useSecond ? "SAFFIRE-III · S1 (25 cm/s)" : "SAFFIRE I · S1 (20 cm/s)", beta };
}

export function buildGrid(zones: Zone[], c: Conditions) {
  const material = new Uint8Array(GRID.cols * GRID.rows);
  const behavior = new Uint8Array(GRID.cols * GRID.rows);
  const zoneIndex = new Uint8Array(GRID.cols * GRID.rows);
  zones.forEach((zone, z) => {
    const m = MATERIAL_IDS.indexOf(zone.material);
    const b = materialRule(zone.material, c).behavior;
    for (let y = zone.rows[0]; y < zone.rows[1]; y++) {
      for (let x = zone.cols[0]; x < zone.cols[1]; x++) {
        const i = y * GRID.cols + x;
        material[i] = m;
        behavior[i] = b;
        zoneIndex[i] = z;
      }
    }
  });
  return { material, behavior, zoneIndex };
}

/** Imposed ignition: a 40 cm line across the flow, the width of the SAFFIRE I igniter wire.
 *  The model propagates an existing front; it does not predict ignition. */
export function ignitionMask(col: number, row: number) {
  const mask = new Uint8Array(GRID.cols * GRID.rows);
  for (let y = row - 10; y < row + 10; y++) {
    for (let x = col - 1; x <= col + 1; x++) {
      if (x >= 0 && y >= 0 && x < GRID.cols && y < GRID.rows) mask[y * GRID.cols + x] = 1;
    }
  }
  return mask;
}
