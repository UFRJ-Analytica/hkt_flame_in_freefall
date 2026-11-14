// Stochastic surface propagation on the habitat liner. Same rule as the SAFFIRE I S1 neighbourhood
// model: an intact propagating cell advances with probability p[key], key = upstream/above/below reached.
// Only the frontier is visited, so a run over ~10^5 cells costs little more than the cells that burn.

export interface EngineInput {
  cols: number;
  rows: number;
  behavior: Uint8Array; // 0 inert · 1 propagates · 2 measured no spread · 3 unknown
  ignition: Uint8Array;
  kernel: (number | null)[]; // index = upstream<<2 | above<<1 | below
  steps: number;
}

export interface RunResult {
  /** Step at which each cell was reached; -1 if never. */
  arrival: Int16Array;
  /** First step at which a non-propagating cell (behaviour 2 or 3) had a reached neighbour; -1 if never. */
  contact: Int16Array;
  blocked: number;
}

export function runOnce(input: EngineInput, seed: number): RunResult {
  const { cols, rows, behavior, ignition, kernel, steps } = input;
  const n = cols * rows;
  const arrival = new Int16Array(n).fill(-1);
  const contact = new Int16Array(n).fill(-1);
  const state = new Uint8Array(n);
  const queued = new Uint8Array(n);
  let candidates: number[] = [];
  let blocked = 0;
  let rng = seed >>> 0;

  const expose = (i: number, step: number) => {
    if (state[i]) return;
    const b = behavior[i];
    if (b === 1) {
      if (!queued[i]) { queued[i] = 1; candidates.push(i); }
    } else if ((b === 2 || b === 3) && contact[i] < 0) {
      contact[i] = step;
    }
  };
  const reach = (i: number, step: number) => {
    state[i] = 1;
    arrival[i] = step;
    const x = i % cols, y = (i - x) / cols;
    if (x + 1 < cols) expose(i + 1, step);
    if (y > 0) expose(i - cols, step);
    if (y + 1 < rows) expose(i + cols, step);
  };

  for (let i = 0; i < n; i++) if (ignition[i] && behavior[i] !== 0) { state[i] = 1; arrival[i] = 0; }
  for (let i = 0; i < n; i++) if (arrival[i] === 0) reach(i, 0);

  const flips: number[] = [];
  for (let step = 1; step <= steps; step++) {
    flips.length = 0;
    const next: number[] = [];
    for (const i of candidates) {
      if (state[i]) continue;
      const x = i % cols, y = (i - x) / cols;
      const up = x > 0 ? state[i - 1] : 0;
      const above = y > 0 ? state[i - cols] : 0;
      const below = y + 1 < rows ? state[i + cols] : 0;
      const key = (up << 2) | (above << 1) | below;
      next.push(i);
      if (key === 0) continue;
      const p = kernel[key];
      if (p === null) { blocked++; continue; }
      rng = (Math.imul(1664525, rng) + 1013904223) >>> 0;
      if (rng / 0x100000000 < p) flips.push(i);
    }
    candidates = next;
    for (const i of flips) reach(i, step);
    if (!candidates.length) break;
  }
  return { arrival, contact, blocked };
}

export interface EnsembleResult {
  arrivals: Int16Array[];
  contacts: Int16Array[];
  blocked: number[];
  steps: number;
}

export function runEnsemble(input: EngineInput, seeds: number[]): EnsembleResult {
  const runs = seeds.map((seed) => runOnce(input, seed));
  return {
    arrivals: runs.map((r) => r.arrival),
    contacts: runs.map((r) => r.contact),
    blocked: runs.map((r) => r.blocked),
    steps: input.steps,
  };
}
