export const SAFFIRE_ID = "PSI-98:t0:r2";
export const SAFFIRE_S2_ID = "PSI-98:t0:r3";
export const SAFFIRE_II5_ID = "PSI-99:t0:r6";
export const SAFFIRE_SOURCE = "https://psi.nasa.gov/physci/repo/data/investigations/PSI-98";
export const SAFFIRE_MISSIONS = {
  saffire: { label: "SAFFIRE I", accession: "PSI-98", flow: 20, oxygen: "21,5 a 21,7%" },
  "saffire-ii": { label: "SAFFIRE II", accession: "PSI-99", flow: 20, oxygen: "≈22,1%" },
  "saffire-iii": { label: "SAFFIRE III", accession: "PSI-100", flow: 25, oxygen: "21,2%" },
  "saffire-iv": { label: "SAFFIRE IV · IV-1", accession: "SAFFIRE-IV-1", flow: 20, oxygen: "23,1%" },
  "saffire-v": { label: "SAFFIRE V · V-2", accession: "SAFFIRE-V-2", flow: 20, oxygen: "26,9%" },
  "saffire-vi": { label: "SAFFIRE VI · VI-2", accession: "SAFFIRE-VI-2", flow: 20, oxygen: "31,0%" },
} as const;
export type SaffireMission = keyof typeof SAFFIRE_MISSIONS;

const siliconeOutcome = "Após a ignição, a propagação em microgravidade não se sustentou.";
export const SAFFIRE_II_CASES = [
  { sample: 1, material: "Silicone (PDMS)", thickness: "0,27 mm", flow: 20, oxygen: "≈21,5%", direction: "a favor", model: false, outcome: siliconeOutcome },
  { sample: 2, material: "Silicone (PDMS)", thickness: "0,61 mm", flow: 20, oxygen: "≈22,1%", direction: "a favor", model: false, outcome: siliconeOutcome },
  { sample: 3, material: "Silicone (PDMS)", thickness: "1,03 mm", flow: 20, oxygen: "≈22,1%", direction: "a favor", model: false, outcome: siliconeOutcome },
  { sample: 4, material: "Silicone (PDMS)", thickness: "0,37 mm", flow: 20, oxygen: "≈22,1%", direction: "contra", model: false, outcome: siliconeOutcome },
  { sample: 5, material: "SIBAL", thickness: "0,37 mm", flow: 20, oxygen: "≈22,1%", direction: "a favor", model: true },
  { sample: 6, material: "SIBAL", thickness: "0,37 mm", flow: 25, oxygen: "≈22,1%", direction: "a favor", model: true },
  { sample: 7, material: "PMMA + Nomex", thickness: "0,85 + 0,37 mm", flow: 20, oxygen: "≈22,1%", direction: "a favor", model: false, outcome: "A queima consumiu o trecho de 5 cm de PMMA. O Nomex não acendeu." },
  { sample: 8, material: "PMMA estruturado", thickness: null, flow: 20, oxygen: "22,0 a 22,1%", direction: "a favor", model: false, outcome: "A chama permaneceu ancorada perto da borda. O ensaio registrou dano localizado e regressão do material." },
  { sample: 9, material: "PMMA plano", thickness: "10 mm", flow: 20, oxygen: "21,9 a 22,0%", direction: "a favor", model: false, outcome: "A chama permaneceu ancorada perto da borda. O ensaio registrou dano localizado e regressão do material." },
] as const;
export type SaffireIICase = typeof SAFFIRE_II_CASES[number];
export const saffireIIId = (sample: number) => `PSI-99:t0:r${sample + 1}`;

export const SAFFIRE_II_BOARD = {
  lengthMm: 290, widthMm: 406, dxMm: 10, dyMm: 20, columns: 29, rows: 21,
} as const;

export interface SaffireIILocalized {
  schemaVersion: 1;
  experimentId: string;
  kind: "localized-observation";
  camera: string;
  durationSeconds: number;
  ignitionEdge: "left" | "right";
  probability: null;
  observations: { timeSeconds: number; orangePixels: number; edgeGlow: boolean }[];
  endState?: { timeSeconds: number; reachedMm: number; source: string };
}

export function readSaffireIILocalized(value: unknown, sample: number): SaffireIILocalized {
  const data = value as Partial<SaffireIILocalized> | null;
  const end = data?.endState;
  if (data?.schemaVersion !== 1 || data.kind !== "localized-observation" ||
      data.experimentId !== saffireIIId(sample) || typeof data.camera !== "string" ||
      data.ignitionEdge !== (sample === 4 ? "right" : "left") || data.probability !== null ||
      !Array.isArray(data.observations) || data.observations.length < 2 ||
      data.durationSeconds !== data.observations.at(-1)?.timeSeconds ||
      !data.observations.every((item, i, all) => item && Number.isFinite(item.timeSeconds) &&
        item.timeSeconds >= 0 && (i === 0 || item.timeSeconds > all[i - 1].timeSeconds) &&
        Number.isInteger(item.orangePixels) && item.orangePixels >= 0 && typeof item.edgeGlow === "boolean") ||
      (sample === 7 ? !end || end.reachedMm !== 50 || end.timeSeconds !== data.durationSeconds : !!end)) {
    throw new Error("Observações de borda do SAFFIRE II inválidas.");
  }
  return data as SaffireIILocalized;
}

export interface SaffireIIReplay {
  schemaVersion: 1;
  experimentId: string;
  kind: "observed-frames";
  camera: string;
  durationSeconds: number;
  frames: { timeSeconds: number; path: string }[];
}

export function readSaffireIIReplay(value: unknown, sample: number): SaffireIIReplay {
  const replay = value as Partial<SaffireIIReplay> | null;
  if (replay?.schemaVersion !== 1 || replay.kind !== "observed-frames" ||
      replay.experimentId !== saffireIIId(sample) || typeof replay.camera !== "string" ||
      !Array.isArray(replay.frames) || replay.frames.length < 2 ||
      replay.durationSeconds !== replay.frames.at(-1)?.timeSeconds ||
      !replay.frames.every((frame, i, frames) => frame && Number.isFinite(frame.timeSeconds) &&
        frame.timeSeconds >= 0 && (i === 0 || frame.timeSeconds > frames[i - 1].timeSeconds) &&
        frame.path === `ii-replays/${sample}/${String(i).padStart(2, "0")}.jpg`)) {
    throw new Error("Sequência de quadros SAFFIRE II inválida.");
  }
  return replay as SaffireIIReplay;
}
type Combination = { exposures: number; transitions: number; probability: number | null };
type FrontValidation = { seedCount: number; positionMaeMm: number; observedSpeedMmS: number; simulatedSpeedMmS: number };
export type OpposedModel = {
  status: "ready" | "unavailable";
  reason?: string;
  camera?: string;
  combinations?: Record<string, Combination>;
  longitudinal?: Combination;
  comparison?: SaffireModel["comparison"];
  contiguousValidation?: FrontValidation;
};

export function readOpposedModel(value: unknown, experimentId: string = SAFFIRE_S2_ID): OpposedModel {
  const model = value as (OpposedModel & { experimentId: string; schemaVersion: number; stepSeconds: number }) | null;
  if (model?.experimentId !== experimentId || model.schemaVersion !== 1 || model.stepSeconds !== 2) {
    throw new Error("Artefato S2 incompatível.");
  }
  if (model.status === "unavailable" && typeof model.reason === "string") return model;
  const longitudinal = model.longitudinal;
  if (longitudinal && (!Number.isInteger(longitudinal.exposures) || longitudinal.exposures < 30 ||
      !Number.isInteger(longitudinal.transitions) || longitudinal.transitions <= 0 ||
      longitudinal.transitions > longitudinal.exposures ||
      longitudinal.probability !== longitudinal.transitions / longitudinal.exposures)) {
    throw new Error("Probabilidade longitudinal S2 inválida.");
  }
  if (model.status !== "ready" || !model.combinations ||
      !Object.entries(model.combinations).every(([key, entry]) =>
        /^[01]{3}$/.test(key) && Number.isInteger(entry.exposures) && entry.exposures >= 0 &&
        Number.isInteger(entry.transitions) && entry.transitions >= 0 && entry.transitions <= entry.exposures &&
        (entry.probability === null || (entry.exposures >= 30 && entry.probability === entry.transitions / entry.exposures)))) {
    throw new Error("Probabilidades S2 inválidas.");
  }
  return model;
}

export interface SaffireModel {
  schemaVersion: 2;
  experimentId: string;
  status: "ready";
  grid: { lengthMm: number; widthMm: number; dxMm: number; dyMm: number; columns: number; rows: number };
  stepSeconds: number;
  durationSeconds: number;
  probability: number;
  initialFront: (number | null)[];
  train: { exposures: number; transitions: number };
  validation: { positionMaeMm: number; observedSpeedMmS: number; simulatedSpeedMmS: number };
  combinations: Record<string, { exposures: number; transitions: number; probability: number | null; reason: string | null }>;
  contiguousValidation?: FrontValidation;
  neighborhoodTraining: { minimumExposures: number; censoredCellSteps: number };
  neighborhoodHoldout?: { combinations: Record<string, { exposures: number; transitions: number }> };
  observedTrajectory?: { timeS: number; frontMedianMm: number | null; visibleRows: number }[];
  diagnostics?: { splitTimeS?: number; coverage?: number; annotation?: { annotatedPoints: number; matchedPoints: number; maeMm: number }; medianOverlapErrorMm?: number };
  comparison: {
    observedSpeedMmS: number;
    seedCount: number;
    blockedCellStepsMean: number;
    neighborhood: Record<string, { mean: number; min: number; max: number }>;
    baseline: Record<string, { mean: number; min: number; max: number }>;
  };
}

export interface SaffireII5Model {
  schemaVersion: 1;
  experimentId: string;
  camera: string;
  status: "ready";
  grid: SaffireModel["grid"];
  stepSeconds: 2;
  durationSeconds: number;
  probability: number;
  train: SaffireModel["train"];
  validation: FrontValidation & { comparableRows: number };
  sampling: { acceptedFrames: number; decodedCandidates: number; imagesInArchive: number };
}

export function readSaffireII5Model(value: unknown, sample: 5 | 6 = 5): SaffireII5Model {
  const model = value as Partial<SaffireII5Model> | null;
  const grid = model?.grid;
  const train = model?.train;
  const validation = model?.validation;
  if (model?.schemaVersion !== 1 || model.experimentId !== saffireIIId(sample) || model.status !== "ready" ||
      model.camera !== `S${sample}C1` ||
      model.stepSeconds !== 2 || !Number.isInteger(model.durationSeconds) ||
      !model.durationSeconds || model.durationSeconds < 2 || model.durationSeconds > 1200 ||
      model.durationSeconds % model.stepSeconds !== 0 ||
      grid?.lengthMm !== 290 || grid.widthMm !== 50 || grid.columns !== 29 || grid.rows !== 3 ||
      grid.dxMm !== 10 || grid.dyMm !== 20 ||
      !train || !Number.isInteger(train.exposures) || train.exposures < 30 ||
      !Number.isInteger(train.transitions) || train.transitions <= 0 || train.transitions > train.exposures ||
      model.probability !== train.transitions / train.exposures ||
      !validation || ![validation.positionMaeMm, validation.observedSpeedMmS, validation.simulatedSpeedMmS,
        validation.seedCount, validation.comparableRows].every(Number.isFinite) || !model.sampling) {
    throw new Error("O artefato SAFFIRE II · 2-5 contém parâmetros inválidos.");
  }
  return model as SaffireII5Model;
}

export function readSaffireModel(value: unknown, experimentId: string = SAFFIRE_ID): SaffireModel {
  if (!value || typeof value !== "object") throw new Error("Artefato SAFFIRE inválido.");
  const model = value as Partial<SaffireModel>;
  if (model.schemaVersion !== 2 || model.experimentId !== experimentId) {
    throw new Error("Versão ou ensaio incompatível com o laboratório.");
  }
  if (model.status !== "ready") {
    const reason = (value as { reason?: unknown }).reason;
    throw new Error(typeof reason === "string" ? reason : "A extração da frente está inconclusiva.");
  }
  const { grid, probability, initialFront, stepSeconds, durationSeconds, train, validation } = model;
  if (!grid || !initialFront || probability === undefined || stepSeconds !== 2 ||
      !Number.isFinite(probability) || probability < 0 || probability > 1 ||
      !Number.isFinite(durationSeconds) || !durationSeconds || durationSeconds < stepSeconds || durationSeconds > 1200 ||
      grid.lengthMm !== 940 || grid.widthMm !== 406 || grid.dxMm !== 10 || grid.dyMm !== 20 ||
      grid.columns !== 94 || grid.rows !== 21 ||
      !Array.isArray(initialFront) || initialFront.length !== grid.rows ||
      !initialFront.some((front) => front !== null && front > 0) ||
      initialFront.some((front) => front !== null && (!Number.isInteger(front) || front < 0 || front > grid.columns)) ||
      !train || !Number.isInteger(train.exposures) || train.exposures <= 0 ||
      !Number.isInteger(train.transitions) || train.transitions < 0 || train.transitions > train.exposures ||
      probability !== train.transitions / train.exposures ||
      !validation || ![validation.positionMaeMm, validation.observedSpeedMmS, validation.simulatedSpeedMmS].every(Number.isFinite)) {
    throw new Error("O artefato SAFFIRE contém parâmetros inválidos.");
  }
  if (!model.combinations || !model.neighborhoodTraining || !model.comparison) {
    throw new Error("O artefato não contém os dados de vizinhança.");
  }
  for (let i = 0; i < 8; i++) {
    const entry = model.combinations[i.toString(2).padStart(3, "0")];
    if (!entry || !Number.isInteger(entry.exposures) || entry.exposures < 0 ||
        !Number.isInteger(entry.transitions) || entry.transitions < 0 || entry.transitions > entry.exposures ||
        (entry.probability !== null && (!entry.exposures || entry.probability !== entry.transitions / entry.exposures))) {
      throw new Error("Contagens de vizinhança inválidas.");
    }
  }
  return model as SaffireModel;
}

export type Cell = 0 | 1 | 2 | null;
export type Grid = Cell[][];
export type SimulationStep = { grid: Grid; blocked: number };

/** Median over visible rows of the furthest reached cell edge, in mm (same statistic as observedTrajectory). */
export function frontMedianMm(model: Pick<SaffireModel, "grid">, grid: Grid): number | null {
  const fronts: number[] = [];
  for (const row of grid) {
    if (row.every((cell) => cell === null)) continue;
    let last = -1;
    row.forEach((cell, x) => { if (cell === 1) last = x; });
    fronts.push((last + 1) * model.grid.dxMm);
  }
  if (!fronts.length) return null;
  fronts.sort((a, b) => a - b);
  const mid = fronts.length >> 1;
  return fronts.length % 2 ? fronts[mid] : (fronts[mid - 1] + fronts[mid]) / 2;
}

/** Monte Carlo band of the median front: the spread of the model's own stochasticity at fixed
 *  parameters, not experimental or parameter uncertainty. */
export function frontEnsemble(model: SaffireModel, seeds: number[]) {
  const runs = seeds.map((seed) => simulateFromObservedFront(model, seed).map((step) => frontMedianMm(model, step.grid) ?? 0));
  return runs[0].map((_, i) => {
    const values = runs.map((run) => run[i]).sort((a, b) => a - b);
    return { timeS: i * model.stepSeconds, min: values[0], max: values[values.length - 1], median: values[values.length >> 1] };
  });
}

/** Neighbourhood rule started from the observed front at the beginning of the analysed window,
 *  so the run can be compared with observedTrajectory (concurrent direction only). */
export function simulateFromObservedFront(model: SaffireModel, initialSeed = 1951): SimulationStep[] {
  let seed = initialSeed;
  const grid: Grid = model.initialFront.map(front =>
    Array.from({ length: model.grid.columns }, (_, x) => front === null ? null : x < front ? 1 : 0));
  const steps: SimulationStep[] = [{ grid, blocked: 0 }];
  const stepCount = Math.floor(model.durationSeconds / model.stepSeconds);
  for (let n = 0; n < stepCount; n++) {
    const previous = steps[n].grid;
    const next = previous.map(row => [...row]);
    let blocked = 0;
    for (let y = 0; y < previous.length; y++) {
      for (let x = 0; x < model.grid.columns; x++) {
        if (previous[y][x] !== 0) continue;
        const upstream = x === 0 ? 0 : previous[y][x - 1];
        const above = y === 0 ? 0 : previous[y - 1][x];
        const below = y === previous.length - 1 ? 0 : previous[y + 1][x];
        if (upstream === null || above === null || below === null) continue;
        const key = `${upstream}${above}${below}`;
        if (key === "000") continue;
        const p = model.combinations[key].probability;
        if (p === null) { blocked++; continue; }
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        if (seed / 0x100000000 < p) next[y][x] = 1;
      }
    }
    steps.push({ grid: next, blocked });
  }
  return steps;
}

export function saffireIILocalizedGrid(model: SaffireIILocalized, seconds: number): Grid {
  const observation = model.observations.filter(item => item.timeSeconds <= seconds).at(-1);
  const end = model.endState;
  const reached = end && seconds >= end.timeSeconds ? end.reachedMm / SAFFIRE_II_BOARD.dxMm : 0;
  const edge = model.ignitionEdge === "left" ? 0 : SAFFIRE_II_BOARD.columns - 1;
  return Array.from({ length: SAFFIRE_II_BOARD.rows }, () =>
    Array.from({ length: SAFFIRE_II_BOARD.columns }, (_, x) => {
      if (x < reached) return 1;
      return x === edge && observation?.edgeGlow ? 2 : 0;
    }));
}

export function simulateSaffireII5(model: SaffireII5Model, rows = model.grid.rows): SimulationStep[] {
  return simulateLongitudinal({ ...model, grid: { ...model.grid, rows } });
}

export type LongitudinalModel = Pick<SaffireModel, "grid" | "stepSeconds" | "durationSeconds" | "probability">;
export const LONGITUDINAL_SEED = 1951;

export function simulateLongitudinal(
  model: LongitudinalModel, seed = LONGITUDINAL_SEED, initialReachedColumns = 1,
): SimulationStep[] {
  const { columns } = model.grid;
  let fronts = Array<number>(model.grid.rows).fill(initialReachedColumns);
  const snapshot = (): SimulationStep => ({
    grid: fronts.map(front => Array.from({ length: columns }, (_, x) => x < front ? 1 : 0)),
    blocked: 0,
  });
  const steps = [snapshot()];
  for (let t = model.stepSeconds; t <= model.durationSeconds; t += model.stepSeconds) {
    fronts = fronts.map(front => {
      if (front === columns) return front;
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      return front + Number(seed / 0x100000000 < model.probability);
    });
    steps.push(snapshot());
  }
  return steps;
}

export function simulateSaffire(model: SaffireModel, opposed: OpposedModel,
                                wind: 1 | -1 = 1): SimulationStep[] {
  let seed = 1951;
  const mid = Math.floor(model.grid.columns / 2);
  const grid: Grid = Array.from({ length: model.grid.rows }, () =>
    Array.from({ length: model.grid.columns }, (_, x) => x === mid - 1 || x === mid ? 1 : 0));
  const steps: SimulationStep[] = [{ grid, blocked: 0 }];
  const stepCount = Math.floor(model.durationSeconds / model.stepSeconds);
  for (let n = 0; n < stepCount; n++) {
    const previous = steps[n].grid;
    const next = previous.map(row => [...row]);
    let blocked = 0;
    for (let y = 0; y < previous.length; y++) {
      for (let i = 0; i < model.grid.columns; i++) {
        const x = wind === 1 ? i : model.grid.columns - 1 - i;
        if (previous[y][x] !== 0) continue;
        const upstream = previous[y][x - wind];
        const downstream = previous[y][x + wind];
        const above = y === 0 ? 0 : previous[y - 1][x];
        const below = y === previous.length - 1 ? 0 : previous[y + 1][x];
        const forwardHalf = (x >= mid) === (wind === 1);
        // The grid reconstructed from the experiments contains one continuous
        // front per row. A lateral neighbor changes the advance probability
        // at that front, but may not seed a detached patch ahead of it.
        const inward = forwardHalf ? upstream : downstream;
        if (inward !== 1) continue;
        const table = forwardHalf ? model.combinations : opposed.status === "ready" ? opposed.combinations : undefined;
        const key = above === null || below === null ? null : `1${above}${below}`;
        const joint = key ? table?.[key]?.probability : null;
        const longitudinal = forwardHalf ? model.probability
          : opposed.status === "ready" ? opposed.longitudinal?.probability : null;
        const p = joint ?? longitudinal;
        if (p == null) { blocked++; continue; }
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        if (seed / 0x100000000 < p) next[y][x] = 1;
      }
    }
    steps.push({ grid: next, blocked });
  }
  return steps;
}
