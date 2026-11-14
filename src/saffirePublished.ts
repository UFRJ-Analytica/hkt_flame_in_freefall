import type { LongitudinalModel } from "./saffire";

export interface PublishedCase {
  material: string;
  sample: string;
}

export const SAFFIRE_PUBLISHED_CASES = {
  "saffire-iv": { sample: "IV-1", material: "SIBAL" },
  "saffire-v": { sample: "V-2", material: "Algodão jersey" },
  "saffire-vi": { sample: "VI-2", material: "SIBAL" },
} satisfies Record<string, PublishedCase>;

export function publishedCaseForMode(mode: string): PublishedCase | undefined {
  return SAFFIRE_PUBLISHED_CASES[mode as keyof typeof SAFFIRE_PUBLISHED_CASES];
}

interface Reference {
  label: string;
  url: string;
}

interface DirectionalEvidence {
  id: string;
  material: string;
  outcome: string;
  source: Reference;
}

interface CurveCheck {
  kind: "same-trial-curve";
  variable: string;
  digitization: { intervalSeconds: [number, number]; points: [number, number][] };
  seedCount: number;
  positionMaeMm: number;
  observedSpeedMmS: number;
  simulatedSpeedMmS: number;
}

interface SpeedCheck {
  kind: "numerical-speed-only";
  reason: string;
  seedCount: number;
  simulatedSpeedMmS: number;
}

export interface PublishedModel extends LongitudinalModel {
  schemaVersion: 3;
  experimentId: string;
  status: "ready";
  sample: string;
  material: string;
  measuredGeometry: { lengthMm: number; widthMm: number; widthApproximate: boolean };
  conditions: { flowCmS: number; oxygenPct: number; pressureKpa: number; direction: "concurrent"; source: Reference };
  calibration: { kind: "published-speed"; speedMmS: number; variable: string; source: Reference };
  directionProbabilities: { concurrent: number; opposed: null; lateral: null };
  validation: CurveCheck | SpeedCheck;
  relatedEvidence: DirectionalEvidence[];
}

export function readPublishedModel(value: unknown, experimentId: string): PublishedModel {
  const model = value as Partial<PublishedModel> | null;
  const grid = model?.grid;
  const speed = model?.calibration?.speedMmS;
  const validation = model?.validation;
  if (model?.schemaVersion !== 3 || model.experimentId !== experimentId || model.status !== "ready" ||
      model.stepSeconds !== 2 || grid?.lengthMm !== 500 || grid.widthMm !== 406 ||
      grid.dxMm !== 10 || grid.dyMm !== 20 || grid.columns !== 50 || grid.rows !== 21 ||
      model.calibration?.kind !== "published-speed" || !speed || !Number.isFinite(speed) ||
      !model.probability || model.probability <= 0 || model.probability > 1 ||
      Math.abs(model.probability - speed * model.stepSeconds / grid.dxMm) > 1e-12 ||
      model.durationSeconds !== model.stepSeconds * Math.ceil((grid.columns - 1) / model.probability) ||
      model.conditions?.direction !== "concurrent" || !model.measuredGeometry ||
      model.directionProbabilities?.concurrent !== model.probability ||
      model.directionProbabilities.opposed !== null || model.directionProbabilities.lateral !== null ||
      !Array.isArray(model.relatedEvidence) ||
      !validation || validation.seedCount !== 20 || !Number.isFinite(validation.simulatedSpeedMmS) ||
      (validation.kind === "same-trial-curve" &&
        (!Number.isFinite(validation.positionMaeMm) || !Number.isFinite(validation.observedSpeedMmS) ||
          !Array.isArray(validation.digitization?.points) || validation.digitization.points.length < 3)) ||
      (validation.kind !== "same-trial-curve" && validation.kind !== "numerical-speed-only")) {
    throw new Error("Os parâmetros publicados deste ensaio SAFFIRE estão incompletos ou inconsistentes.");
  }
  return model as PublishedModel;
}
