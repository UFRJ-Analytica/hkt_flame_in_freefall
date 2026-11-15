// Lunar surface habitat: liner geometry, material zones and the evidence rules that decide how each
// material may behave in the simulation. Every rule names the measurement (or the absence of one) behind it.


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
  SIBAL: { label: "Cotton/fiberglass fabric (SIBAL)", color: [205, 191, 155] },
  Nomex: { label: "Nomex", color: [196, 178, 112] },
  PMMA: { label: "PMMA (acrylic)", color: [146, 186, 198] },
  Silicone: { label: "Silicone", color: [170, 160, 170] },
  Kapton: { label: "Kapton (polyimide film)", color: [200, 128, 52] },
  "Alumínio": { label: "Aluminum", color: [128, 137, 148] },
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

/** The wall itself: structure and panels, treated as non-combustible. Fabric items are placed on it. */
export const WALL_ZONE: Zone = { id: "wall", name: "Wall panels", hint: "module structure", cols: [0, GRID.cols], rows: [0, GRID.rows], material: "Alumínio" };

/** Reference sample of the propagation rule: SAFFIRE I · S1 fabric (cotton/fiberglass SIBAL). */
export const REFERENCE_FABRIC = { material: "SIBAL" as MaterialId, thicknessMm: 0.37, sampleLengthMm: 940, sampleWidthMm: 406 };

export type PieceKind = "curtain" | "bag" | "liner" | "partition";
export const PIECE_KINDS: Record<PieceKind, { label: string; lengthMm: number; widthMm: number }> = {
  curtain: { label: "Crew-quarter curtain", lengthMm: 1200, widthMm: 1800 },
  bag: { label: "Stowage bag", lengthMm: 500, widthMm: 400 },
  liner: { label: "Wall liner panel", lengthMm: 2000, widthMm: 1000 },
  partition: { label: "Fabric partition", lengthMm: 900, widthMm: 1400 },
};

/** A fabric item on the liner: lower-left corner in cells (col along the module, row along the arc). */
export interface Piece { id: string; kind: PieceKind; col: number; row: number; lengthMm: number; widthMm: number }
export const MAX_PIECES = 4;
export const PIECE_LIMITS = { lengthMm: [100, (GRID.cols * CELL.alongMm)] as const, widthMm: [100, GRID.rows * CELL.acrossMm] as const };

/** Size in cells; the physical cell size never changes, so a larger item is more fabric, not a stretched drawing. */
export function pieceCells(p: Piece) {
  const cols = Math.max(1, Math.round(p.lengthMm / CELL.alongMm));
  const rows = Math.max(1, Math.round(p.widthMm / CELL.acrossMm));
  const col = Math.min(Math.max(0, p.col), GRID.cols - cols);
  const row = Math.min(Math.max(0, p.row), GRID.rows - rows);
  return { col, row, cols, rows };
}

export function pieceName(p: Piece, index: number) { return `${index + 1} · ${PIECE_KINDS[p.kind].label}`; }

export function piecesToZones(pieces: Piece[]): Zone[] {
  return [WALL_ZONE, ...pieces.map((p, i) => {
    const c = pieceCells(p);
    return { id: p.id, name: pieceName(p, i), hint: `${(p.lengthMm / 1000).toFixed(2)} × ${(p.widthMm / 1000).toFixed(2)} m`,
      cols: [c.col, c.col + c.cols] as [number, number], rows: [c.row, c.row + c.rows] as [number, number], material: REFERENCE_FABRIC.material };
  })];
}

const r = (fraction: number) => Math.round(fraction * GRID.rows);
/** Default layout: a curtain touching a wall liner panel downstream, and a stowage bag 20 cm away from both. */
export const DEFAULT_PIECES: Piece[] = [
  { id: "p1", kind: "curtain", col: 40, row: r(0.12), lengthMm: 1200, widthMm: 1800 },
  { id: "p2", kind: "liner", col: 160, row: r(0.30), lengthMm: 2000, widthMm: 1000 },
  { id: "p3", kind: "bag", col: 180, row: r(0.12), lengthMm: 600, widthMm: 400 },
];
export const DEFAULT_IGNITION = { col: 70, row: r(0.30) };

/** The cell at the centre of an item, used to keep the ignition inside it. */
export function pieceCentre(p: Piece) {
  const c = pieceCells(p);
  return { col: c.col + (c.cols >> 1), row: c.row + (c.rows >> 1) };
}

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

const SAFFIRE_II_O2 = [21.5, 22.1];
const nearAtmosphere = (p: number) => p >= 95 && p <= 105;

export function materialRule(material: MaterialId, c: Conditions): MaterialRule {
  const microgravity = c.gravityG < 0.01;
  // SAFFIRE-II outcomes hold only near that test: ~22% O2, ~1 atm, 20 cm/s concurrent, microgravity.
  const saffireAtmosphere = c.oxygen >= SAFFIRE_II_O2[0] - 0.5 && c.oxygen <= SAFFIRE_II_O2[1] + 0.5 &&
    nearAtmosphere(c.pressure) && microgravity && Math.abs(c.flow - 20) <= 2;
  switch (material) {
    case "SIBAL": {
      const testAtmosphere = c.oxygen >= 21 && c.oxygen <= 22.2 && nearAtmosphere(c.pressure) && microgravity;
      if (testAtmosphere && Math.abs(c.flow - 20) <= 1) return {
        behavior: 1, tier: "calibrated", title: "Calibrated",
        evidence: "Spread probabilities fitted to SAFFIRE I · S1 images (SIBAL, 20 cm/s, 21.5–21.7% O₂, µg).",
      };
      if (testAtmosphere && Math.abs(c.flow - 25) <= 1.5) return {
        behavior: 1, tier: "calibrated", title: "Calibrated",
        evidence: "Spread probabilities fitted to SAFFIRE III · S1 images (SIBAL, 25 cm/s, 21.2% O₂, µg; conditions from the team's paper).",
      };
      const bias = [
        c.oxygen > 22.2 && "O₂ above the trial level accelerates spread: the simulation tends to underestimate.",
        c.oxygen < 21 && "O₂ below the trial level slows spread and may cause extinction: the simulation tends to overestimate.",
        !nearAtmosphere(c.pressure) && "Pressure differences from the trial are not modeled.",
        !microgravity && "In partial gravity, buoyancy induces additional flow; LUCI indicates greater flammability at 1/6 g for some materials.",
      ].filter(Boolean).join(" ");
      return {
        behavior: 1, tier: "exploratory", title: "Exploratory",
        evidence: "Kernel from the nearest trial (SAFFIRE I at 20 cm/s or SAFFIRE III at 25 cm/s), with intensity scaled by (u/u_ref)^β, β measured between the two trials. O₂, pressure, and gravity effects are not modeled.",
        bias: bias || undefined,
      };
    }
    case "Nomex":
      return saffireAtmosphere
        ? { behavior: 2, tier: "measured-no-spread", title: "Did not ignite in the trial · contact not modeled", evidence: "SAFFIRE II 2-7: the PMMA flame consumed the PMMA portion and did not ignite 0.37 mm Nomex (~22% O₂, 20 cm/s, µg). This is the outcome for a 5 cm sample with specific ignition, not a demonstrated barrier: the simulation simply stops at contact." }
        : { behavior: 3, tier: "unknown", title: "Unknown", evidence: "Nomex was tested only at ~22% O₂, 1 atm, µg. There is no evidence under these conditions: the simulation stops here and marks contact." };
    case "Silicone":
      return saffireAtmosphere
        ? { behavior: 2, tier: "measured-no-spread", title: "Did not sustain a flame in the trial · contact not modeled", evidence: "SAFFIRE II 2-1 to 2-4: burned length ~0 in µg, 0.27–1.03 mm, ~22% O₂. Not a demonstrated barrier for another exposure." }
        : { behavior: 3, tier: "unknown", title: "Unknown", evidence: "Tested only at ~22% O₂, 1 atm, µg." };
    case "PMMA":
      return saffireAtmosphere
        ? { behavior: 2, tier: "measured-no-spread", title: "Anchored flame in the trial · contact not modeled", evidence: "SAFFIRE II 2-8/2-9: flame anchored at the base, regression 0.01–0.04 mm/s, no spread along the sample. Not a demonstrated barrier." }
        : { behavior: 3, tier: "unknown", title: "Unknown", evidence: "Tested only at ~22% O₂, 1 atm, µg." };
    case "Kapton":
      return { behavior: 3, tier: "unknown", title: "Unknown", evidence: "No Kapton spread trial in this project's PSI data (only smoke measurements in SAME)." };
    case "Alumínio":
      return { behavior: 0, tier: "inert", title: "Noncombustible (assumption)", evidence: "Metal structure treated as noncombustible; not a test result." };
  }
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
