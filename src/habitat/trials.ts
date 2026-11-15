// Trial registry (contract shared with scripts/build_trial_registry.py), trial matching and the
// per-trial kernel used by the habitat. Rule: a run is "conditioned on a trial" only when every
// condition the trial documents is within tolerance; otherwise it is an extrapolation from it.

import type { SaffireModel } from "../saffire";
import { runOnce } from "./engine";

export type ObservableKind = "char-front" | "flame-base" | "published-rate";
export interface Observable {
  kind: ObservableKind;
  speedMmS: number;
  window: string;
  uncertainty: null | { kind: "ols-se-iid" | "seed-spread" | "none"; value: number; note: string };
  source: { label: string; url: string | null };
  artifact: string | null;
}
export interface Trial {
  id: string;
  campaign: string;
  sample: string;
  investigation: string | null;
  material: string;
  thicknessMm: number | null;
  geometry: { lengthMm: number | null; widthMm: number | null };
  conditions: {
    oxygenPct: number | null;
    oxygenRangePct: [number, number] | null;
    pressureKpa: number | null;
    flowCmS: number | null;
    flowDirection: "concurrent" | "opposed";
    gravity: "microgravity";
  };
  conditionSources: { field: string; label: string; url: string | null }[];
  observables: Observable[];
  model: { artifact: string | null; kind: string | null; validation: string; artifactSha256: string | null };
  conflicts: string[];
  notes: string[];
}
export interface TrialRegistry { schemaVersion: 1; generatedBy: string; trials: Trial[] }

export const OBSERVABLE_LABEL: Record<ObservableKind, string> = {
  "char-front": "Frente carbonizada (imagens)",
  "flame-base": "Base da chama (publicada)",
  "published-rate": "Taxa publicada",
};

const NTRS_I = "https://ntrs.nasa.gov/api/citations/20170008805/downloads/20170008805.pdf";
const CF_2018 = "https://doi.org/10.1016/j.combustflame.2018.10.012";
const CF_2022 = "https://doi.org/10.1016/j.combustflame.2022.112559";
const ICES_VI = "https://ntrs.nasa.gov/api/citations/20240002981/downloads/Saffire-ICES-2024-ICES-365-accepted%20final.pdf";
const HEAT_SMOKE = "https://www.researchgate.net/publication/410245330_Heat_and_Smoke_Emission_from_Tests_on_the_SAFFIRE_IV-VI_Experiments";

const trial = (t: Omit<Trial, "conflicts" | "notes"> & Partial<Pick<Trial, "conflicts" | "notes">>): Trial =>
  ({ conflicts: [], notes: [], ...t });

/** Used until public/data/saffire/trial-registry.json is published; values copied from the repo's
 *  artefacts and docs/research/SAFFIRE_*.md, each with its source. */
export const FALLBACK_REGISTRY: TrialRegistry = {
  schemaVersion: 1,
  generatedBy: "fallback embutido no frontend (registro ainda não publicado)",
  trials: [
    trial({
      id: "SAFFIRE-I-S1", campaign: "SAFFIRE I", sample: "S1", investigation: "PSI-98", material: "SIBAL", thicknessMm: 0.37,
      geometry: { lengthMm: 940, widthMm: 406 },
      conditions: { oxygenPct: 21.6, oxygenRangePct: [21.5, 21.7], pressureKpa: null, flowCmS: 20, flowDirection: "concurrent", gravity: "microgravity" },
      conditionSources: [
        { field: "oxygenPct", label: "Tabela PSI-98", url: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-98" },
        { field: "flowCmS", label: "Tabela PSI-98", url: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-98" },
      ],
      observables: [
        { kind: "char-front", speedMmS: 1.95, window: "trecho reservado (30%), câmeras C1+C2", uncertainty: null, source: { label: "psi-98-s1-neighbors.json", url: null }, artifact: "public/data/saffire/psi-98-s1-neighbors.json" },
        { kind: "published-rate", speedMmS: 1.8, window: "média do ensaio", uncertainty: null, source: { label: "NTRS 20170008805", url: NTRS_I }, artifact: null },
      ],
      model: { artifact: "public/data/saffire/psi-98-s1-neighbors.json", kind: "image-neighborhood", validation: "temporal-holdout-same-trial", artifactSha256: null },
      notes: ["Pressão de cabine não tabulada."],
    }),
    trial({
      id: "SAFFIRE-III-S1", campaign: "SAFFIRE III", sample: "S1", investigation: "PSI-100", material: "SIBAL", thicknessMm: null,
      geometry: { lengthMm: 940, widthMm: 406 },
      conditions: { oxygenPct: 21.2, oxygenRangePct: null, pressureKpa: null, flowCmS: 25, flowDirection: "concurrent", gravity: "microgravity" },
      conditionSources: [
        { field: "oxygenPct", label: "Combustion and Flame 199 (2018)", url: CF_2018 },
        { field: "flowCmS", label: "Combustion and Flame 199 (2018)", url: CF_2018 },
      ],
      observables: [
        { kind: "char-front", speedMmS: 2.43, window: "trecho reservado (30%), câmeras C1+C2", uncertainty: null, source: { label: "psi-100-s1-neighbors.json", url: null }, artifact: "public/data/saffire/psi-100-s1-neighbors.json" },
        { kind: "char-front", speedMmS: 2.2, window: "janela inteira, só câmera 1", uncertainty: null, source: { label: "crosstrial-i-iii.json", url: null }, artifact: "public/data/saffire/crosstrial-i-iii.json" },
      ],
      model: { artifact: "public/data/saffire/crosstrial-i-iii.json", kind: "image-neighborhood", validation: "cross-trial", artifactSha256: null },
      conflicts: ["Tabela PSI-100 registra 30 cm/s; artigo da equipe, 25 cm/s."],
    }),
    trial({
      id: "SAFFIRE-IV-1", campaign: "SAFFIRE IV", sample: "IV-1", investigation: null, material: "SIBAL", thicknessMm: null,
      geometry: { lengthMm: 500, widthMm: 406 },
      conditions: { oxygenPct: 23.1, oxygenRangePct: null, pressureKpa: 99, flowCmS: 20, flowDirection: "concurrent", gravity: "microgravity" },
      conditionSources: [{ field: "oxygenPct", label: "Combustion and Flame (2022), Tabela 1", url: CF_2022 }, { field: "pressureKpa", label: "Combustion and Flame (2022), Tabela 1", url: CF_2022 }, { field: "flowCmS", label: "Combustion and Flame (2022), Tabela 1", url: CF_2022 }],
      observables: [{ kind: "flame-base", speedMmS: 3.6, window: "base da chama, 32–110 s", uncertainty: null, source: { label: "Combustion and Flame (2022)", url: CF_2022 }, artifact: "public/data/saffire/saffire-iv-1.json" }],
      model: { artifact: "public/data/saffire/saffire-iv-1.json", kind: "published-speed-longitudinal", validation: "published-curve-consistency", artifactSha256: null },
    }),
    trial({
      id: "SAFFIRE-V-2", campaign: "SAFFIRE V", sample: "V-2", investigation: null, material: "Algodão", thicknessMm: null,
      geometry: { lengthMm: 500, widthMm: 406 },
      conditions: { oxygenPct: 26.9, oxygenRangePct: null, pressureKpa: 76, flowCmS: 20, flowDirection: "concurrent", gravity: "microgravity" },
      conditionSources: [{ field: "oxygenPct", label: "Combustion and Flame (2022), Tabela 1", url: CF_2022 }, { field: "pressureKpa", label: "Combustion and Flame (2022), Tabela 1", url: CF_2022 }, { field: "flowCmS", label: "Combustion and Flame (2022), Tabela 1", url: CF_2022 }],
      observables: [{ kind: "flame-base", speedMmS: 3.4, window: "base da chama, 32–92 s", uncertainty: null, source: { label: "Combustion and Flame (2022)", url: CF_2022 }, artifact: "public/data/saffire/saffire-v-2.json" }],
      model: { artifact: "public/data/saffire/saffire-v-2.json", kind: "published-speed-longitudinal", validation: "published-curve-consistency", artifactSha256: null },
      notes: ["Algodão jersey encolhe e enrola após ~100 s."],
    }),
    trial({
      id: "SAFFIRE-VI-2", campaign: "SAFFIRE VI", sample: "VI-2", investigation: null, material: "SIBAL", thicknessMm: null,
      geometry: { lengthMm: 500, widthMm: 400 },
      conditions: { oxygenPct: 31.0, oxygenRangePct: null, pressureKpa: 54.1, flowCmS: 20, flowDirection: "concurrent", gravity: "microgravity" },
      conditionSources: [{ field: "oxygenPct", label: "ICES-2024-365, Tabela 1, p3", url: ICES_VI }, { field: "pressureKpa", label: "ICES-2024-365, Tabela 1, p3", url: ICES_VI }, { field: "flowCmS", label: "ICES-2024-365, Tabela 1, p3", url: ICES_VI }],
      observables: [{ kind: "published-rate", speedMmS: 4.05, window: "taxa do estudo de calor e fumaça", uncertainty: null, source: { label: "Heat and Smoke Emission… SAFFIRE IV–VI", url: HEAT_SMOKE }, artifact: "public/data/saffire/saffire-vi-2.json" }],
      model: { artifact: "public/data/saffire/saffire-vi-2.json", kind: "published-speed-longitudinal", validation: "none", artifactSha256: null },
      notes: ["Sem trajetória experimental disponível para checagem."],
    }),
  ],
};

export function readRegistry(value: unknown): TrialRegistry | null {
  const data = value as Partial<TrialRegistry> | null;
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.trials)) return null;
  const ok = data.trials.every((t) => t && typeof t.id === "string" && t.conditions && Array.isArray(t.observables) &&
    t.observables.every((o) => ["char-front", "flame-base", "published-rate"].includes(o.kind) && Number.isFinite(o.speedMmS)));
  return ok ? data as TrialRegistry : null;
}

/** Trials the habitat can anchor on: concurrent spread with a usable speed. */
export const anchorable = (t: Trial) => t.conditions.flowDirection === "concurrent" && t.observables.length > 0 &&
  t.conditions.flowCmS !== null && (t.material === "SIBAL" || t.material.startsWith("Algodão"));

export interface Scenario { material: string; oxygen: number; pressure: number; flow: number; gravityG: number }
export type DiffStatus = "match" | "untabulated" | "differs";
export interface Diff { field: string; label: string; scenario: string; trial: string; status: DiffStatus }

const f = (n: number, d = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: d });

/** Provisional tolerances (to be replaced by docs/research/ACCEPTANCE_CRITERIA.md). */
export const TOLERANCE = { oxygenPp: 0.5, pressureKpa: 5, flowCmS: 1 };

export function compareToTrial(t: Trial, s: Scenario): Diff[] {
  const c = t.conditions;
  const diffs: Diff[] = [];
  diffs.push({ field: "material", label: "Material", scenario: s.material, trial: t.material, status: s.material === t.material ? "match" : "differs" });
  const [lo, hi] = c.oxygenRangePct ?? (c.oxygenPct !== null ? [c.oxygenPct, c.oxygenPct] : [NaN, NaN]);
  diffs.push({
    field: "oxygen", label: "O₂", scenario: `${f(s.oxygen)}%`, trial: Number.isFinite(lo) ? (lo === hi ? `${f(lo)}%` : `${f(lo)}–${f(hi)}%`) : "não tabulado",
    status: !Number.isFinite(lo) ? "untabulated" : s.oxygen >= lo - TOLERANCE.oxygenPp && s.oxygen <= hi + TOLERANCE.oxygenPp ? "match" : "differs",
  });
  diffs.push({
    field: "pressure", label: "Pressão", scenario: `${f(s.pressure)} kPa`, trial: c.pressureKpa === null ? "não tabulada" : `${f(c.pressureKpa)} kPa`,
    status: c.pressureKpa === null ? "untabulated" : Math.abs(s.pressure - c.pressureKpa) <= TOLERANCE.pressureKpa ? "match" : "differs",
  });
  diffs.push({
    field: "flow", label: "Escoamento", scenario: `${f(s.flow)} cm/s`, trial: c.flowCmS === null ? "não tabulado" : `${f(c.flowCmS)} cm/s`,
    status: c.flowCmS === null ? "untabulated" : Math.abs(s.flow - c.flowCmS) <= TOLERANCE.flowCmS ? "match" : "differs",
  });
  diffs.push({
    field: "gravity", label: "Gravidade", scenario: s.gravityG < 0.01 ? "microgravidade" : `${f(s.gravityG, 2)} g`, trial: "microgravidade",
    status: s.gravityG < 0.01 ? "match" : "differs",
  });
  return diffs;
}

/** Distance used only to rank trials; never converted into a probability. */
export function trialDistance(t: Trial, s: Scenario): number {
  const c = t.conditions;
  const o2 = c.oxygenPct ?? (c.oxygenRangePct ? (c.oxygenRangePct[0] + c.oxygenRangePct[1]) / 2 : 21.5);
  const p = c.pressureKpa ?? 101.3;
  return (t.material === s.material ? 0 : 10) + Math.abs(s.oxygen - o2) / 2 + Math.abs(s.pressure - p) / 15 +
    Math.abs(s.flow - (c.flowCmS ?? 20)) / 10;
}

export function rankTrials(registry: TrialRegistry, s: Scenario) {
  return registry.trials.filter(anchorable)
    .map((t) => ({ trial: t, diffs: compareToTrial(t, s), distance: trialDistance(t, s) }))
    .sort((a, b) => a.distance - b.distance);
}

export type Level = "conditioned" | "extrapolation";
export const levelOf = (diffs: Diff[]): Level => diffs.some((d) => d.status === "differs") ? "extrapolation" : "conditioned";

/** Speed the kernel is fitted to: the trial's own char-front rate when it exists, otherwise its
 *  published flame-base/published rate. Never an average of different observables. */
export function targetObservable(t: Trial): Observable {
  return t.observables.find((o) => o.kind === "char-front") ?? t.observables.find((o) => o.kind === "flame-base") ?? t.observables[0];
}

// ---------- kernel calibration on a SAFFIRE-sized strip ----------

type Combos = Record<string, { probability: number | null }>;
const STRIP = { cols: 94, rows: 21, igniteCols: 15, steps: 110 };

export function kernelFrom(combos: Combos): (number | null)[] {
  return Array.from({ length: 8 }, (_, k) => combos[k.toString(2).padStart(3, "0")]?.probability ?? null);
}
export const scaleKernel = (p: (number | null)[], factor: number) => p.map((v) => v === null ? null : 1 - Math.pow(1 - v, factor));

/** Median-over-strips front speed (mm/s) of the engine on a SAFFIRE-sized sheet, 10 seeds. */
export function stripSpeed(kernel: (number | null)[]): number {
  const n = STRIP.cols * STRIP.rows;
  const behavior = new Uint8Array(n).fill(1);
  const ignition = new Uint8Array(n);
  for (let y = 0; y < STRIP.rows; y++) for (let x = 0; x < STRIP.igniteCols; x++) ignition[y * STRIP.cols + x] = 1;
  const speeds: number[] = [];
  for (let seed = 1951; seed < 1961; seed++) {
    const { arrival } = runOnce({ cols: STRIP.cols, rows: STRIP.rows, behavior, ignition, kernel, steps: STRIP.steps }, seed);
    const ts: number[] = [], xs: number[] = [];
    for (let t = 5; t <= STRIP.steps; t += 5) {
      const fronts: number[] = [];
      for (let y = 0; y < STRIP.rows; y++) {
        let last = 0;
        for (let x = 0; x < STRIP.cols; x++) { const a = arrival[y * STRIP.cols + x]; if (a >= 0 && a <= t) last = x + 1; }
        fronts.push(last);
      }
      fronts.sort((a, b) => a - b);
      const med = fronts[fronts.length >> 1];
      if (med >= STRIP.cols - 3) break;
      ts.push(t * 2); xs.push(med * 10);
    }
    if (ts.length < 3) continue;
    const mt = ts.reduce((a, b) => a + b) / ts.length, mx = xs.reduce((a, b) => a + b) / xs.length;
    let num = 0, den = 0;
    ts.forEach((t, i) => { num += (t - mt) * (xs[i] - mx); den += (t - mt) ** 2; });
    speeds.push(num / den);
  }
  speeds.sort((a, b) => a - b);
  return speeds[speeds.length >> 1] ?? 0;
}

/** Hazard factor so the strip reproduces the target speed (simulation-based calibration). */
export function matchFactor(shape: (number | null)[], target: number) {
  let lo = 0.2, hi = 6;
  for (let i = 0; i < 14; i++) {
    const mid = Math.sqrt(lo * hi);
    if (stripSpeed(scaleKernel(shape, mid)) < target) lo = mid; else hi = mid;
  }
  const factor = Math.sqrt(lo * hi);
  return { factor, simulatedMmS: stripSpeed(scaleKernel(shape, factor)) };
}

export interface CrossTrial {
  comparisonWithSaffireI: { beta: number; saffireIObservedSpeedMmS: number; saffireIIIObservedSpeedMmS: number; flowRatio: number };
  observed: { speedMmS: number; standardErrorMmS: number };
  prediction: { unscaledSpeedMmS: number; linearFlowSpeedMmS: number; observedSpeedMmS: number };
  speedMatch: Record<"saffireI" | "saffireIII", { factor: number; targetSpeedMmS: number; simulatedAfterMmS: number; combinations: Combos }>;
}

export function readCrossTrial(value: unknown): CrossTrial | null {
  const d = value as Partial<CrossTrial> | null;
  const c = d?.comparisonWithSaffireI, m = d?.speedMatch;
  const finite = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  if (!c || !m?.saffireI || !m.saffireIII || !finite(c.beta) || !finite(c.flowRatio) || Math.abs(c.flowRatio - 1.25) > 1e-9 ||
    !finite(m.saffireI.factor) || !finite(m.saffireIII.factor)) return null;
  return d as CrossTrial;
}

export interface AnchorKernel {
  trialId: string;
  base: (number | null)[];
  description: string;
  target: Observable;
  simulatedAtTrialMmS: number;
  factor: number;
  borrowed: string[];
}

/** Kernel reproducing each anchorable trial in its own conditions. Shape (neighbourhood ratios)
 *  comes from SAFFIRE I; SAFFIRE III uses its own image counts where they exist. */
export function buildAnchorKernels(model: SaffireModel, cross: CrossTrial | null, registry: TrialRegistry): Record<string, AnchorKernel> {
  const shape = kernelFrom(cross?.speedMatch.saffireI.combinations ?? model.combinations);
  const out: Record<string, AnchorKernel> = {};
  for (const t of registry.trials.filter(anchorable)) {
    const target = targetObservable(t);
    if (t.id === "SAFFIRE-I-S1") {
      out[t.id] = { trialId: t.id, base: shape, factor: cross?.speedMatch.saffireI.factor ?? 1, target, borrowed: [],
        simulatedAtTrialMmS: stripSpeed(shape), description: "Vizinhança ajustada nas imagens do SAFFIRE I, fator de intensidade calibrado por simulação." };
      continue;
    }
    if (t.id === "SAFFIRE-III-S1" && cross) {
      const own = cross.speedMatch.saffireIII.combinations;
      const base = kernelFrom(own).map((v, k) => v ?? shape[k]);
      const borrowed = kernelFrom(own).flatMap((v, k) => v === null && shape[k] !== null ? [k.toString(2).padStart(3, "0")] : []);
      const camera1 = t.observables.find((o) => o.artifact?.includes("crosstrial")) ?? target;
      out[t.id] = { trialId: t.id, base, factor: cross.speedMatch.saffireIII.factor, target: camera1, borrowed,
        simulatedAtTrialMmS: stripSpeed(base), description: "Vizinhança ajustada nas imagens do SAFFIRE III (câmera 1), fator calibrado por simulação." };
      continue;
    }
    const { factor, simulatedMmS } = matchFactor(shape, target.speedMmS);
    out[t.id] = { trialId: t.id, base: scaleKernel(shape, factor), factor, target, borrowed: ["forma de vizinhança do SAFFIRE I"],
      simulatedAtTrialMmS: simulatedMmS,
      description: `Forma de vizinhança do SAFFIRE I, intensidade calibrada por simulação para a taxa ${target.kind === "flame-base" ? "da base da chama" : "publicada"} deste ensaio.` };
  }
  return out;
}

export type RunLevel = "conditioned" | "interpolated" | "extrapolation";
export const LEVEL_LABEL: Record<RunLevel, string> = {
  conditioned: "Condicionado ao ensaio",
  interpolated: "Interpolado entre ensaios",
  extrapolation: "Extrapolação",
};

export interface ScenarioKernel {
  p: (number | null)[];
  level: RunLevel;
  flowRule: string;
  quench: boolean;
}

/** Kernel for the scenario. Between SAFFIRE I (20 cm/s) and III (25 cm/s) the hazard is
 *  interpolated continuously in log space; elsewhere the anchor kernel is scaled by
 *  (u/u_anchor)^beta, beta measured between the two trials. O2, pressure and gravity are not
 *  corrected: a difference in any of them makes the run an extrapolation. */
export function scenarioKernel(anchor: Trial, kernels: Record<string, AnchorKernel>, cross: CrossTrial | null, s: Scenario, diffs: Diff[]): ScenarioKernel {
  const base = kernels[anchor.id]?.base ?? [];
  const nonFlowDiffers = diffs.some((d) => d.field !== "flow" && d.status === "differs");
  const flowDiffers = diffs.some((d) => d.field === "flow" && d.status === "differs");
  if (s.flow < 2) {
    return { p: base.map((v) => v === null ? null : 0), level: "extrapolation", quench: true,
      flowRule: "Abaixo de 2 cm/s: propagação suprimida (ramo de extinção radiativa para combustível fino, mapa de Olson). Hipótese de fechamento, não medida nestes ensaios." };
  }
  const i = kernels["SAFFIRE-I-S1"], iii = kernels["SAFFIRE-III-S1"];
  const sibalPair = anchor.material === "SIBAL" && (anchor.id === "SAFFIRE-I-S1" || anchor.id === "SAFFIRE-III-S1") && i && iii;
  if (sibalPair && s.flow >= 20 && s.flow <= 25) {
    const w = (s.flow - 20) / 5;
    const p = i.base.map((a, k) => {
      const b = iii.base[k];
      if (a === null || b === null) return a ?? b;
      const la = -Math.log(1 - Math.min(a, 0.999999)), lb = -Math.log(1 - Math.min(b, 0.999999));
      if (la === 0 || lb === 0) return 1 - Math.exp(-((1 - w) * la + w * lb));
      return 1 - Math.exp(-Math.exp((1 - w) * Math.log(la) + w * Math.log(lb)));
    });
    const atEnd = Math.abs(s.flow - 20) <= TOLERANCE.flowCmS || Math.abs(s.flow - 25) <= TOLERANCE.flowCmS;
    return { p, quench: false, level: nonFlowDiffers ? "extrapolation" : atEnd ? "conditioned" : "interpolated",
      flowRule: `Hazard interpolado em escala log entre SAFFIRE I (20 cm/s) e III (25 cm/s), peso ${f(w, 2)} para III.` };
  }
  const beta = cross?.comparisonWithSaffireI.beta ?? 1;
  const u0 = anchor.conditions.flowCmS ?? 20;
  const factor = Math.pow(Math.min(40, s.flow) / u0, beta);
  return {
    p: scaleKernel(base, factor), quench: false,
    level: nonFlowDiffers || flowDiffers ? "extrapolation" : "conditioned",
    flowRule: flowDiffers
      ? `Hazard × ${f(factor, 2)} = (u/${f(u0)})^${f(beta, 2)}; expoente ${cross ? "medido entre SAFFIRE I e III" : "linear (ensaio III indisponível)"}. Fator limitado em 40 cm/s; blowoff não modelado.`
      : "Escoamento do próprio ensaio: sem escalonamento.",
  };
}
