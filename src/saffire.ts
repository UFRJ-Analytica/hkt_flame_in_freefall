export const SAFFIRE_ID = "PSI-98:t0:r2";
export const SAFFIRE_SOURCE = "https://psi.nasa.gov/physci/repo/data/investigations/PSI-98";

export interface SaffireModel {
  schemaVersion: 2;
  experimentId: typeof SAFFIRE_ID;
  status: "ready";
  grid: { lengthMm: number; widthMm: number; dxMm: number; dyMm: number; columns: number; rows: number };
  stepSeconds: number;
  durationSeconds: number;
  probability: number;
  initialFront: (number | null)[];
  train: { exposures: number; transitions: number };
  validation: { positionMaeMm: number; observedSpeedMmS: number; simulatedSpeedMmS: number };
  combinations: Record<string, { exposures: number; transitions: number; probability: number | null; reason: string | null }>;
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

export function readSaffireModel(value: unknown): SaffireModel {
  if (!value || typeof value !== "object") throw new Error("Artefato SAFFIRE inválido.");
  const model = value as Partial<SaffireModel>;
  if (model.schemaVersion !== 2 || model.experimentId !== SAFFIRE_ID) {
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

export type Cell = 0 | 1 | null;
export type Grid = Cell[][];
export type SimulationStep = { grid: Grid; blocked: number };

/** Median over visible rows of the furthest reached cell edge, in mm (same statistic as observedTrajectory). */
export function frontMedianMm(model: SaffireModel, grid: Grid): number | null {
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
  const runs = seeds.map((seed) => simulateSaffire(model, seed).map((step) => frontMedianMm(model, step.grid) ?? 0));
  return runs[0].map((_, i) => {
    const values = runs.map((run) => run[i]).sort((a, b) => a - b);
    return { timeS: i * model.stepSeconds, min: values[0], max: values[values.length - 1], median: values[values.length >> 1] };
  });
}

export function simulateSaffire(model: SaffireModel, initialSeed = 1951): SimulationStep[] {
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
