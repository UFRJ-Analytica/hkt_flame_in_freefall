import type { Trial } from "./trials";

export interface OriginPiece { lengthMm: number; widthMm: number }

export function findOriginTrial(registry: unknown, id: string): Trial | null {
  if (!registry || typeof registry !== "object" || !("trials" in registry) || !Array.isArray(registry.trials)) return null;
  const trial = registry.trials.find((item: unknown) => item && typeof item === "object" && "id" in item && item.id === id);
  if (!trial || typeof trial.material !== "string" || !trial.conditions || !trial.geometry || !Array.isArray(trial.conditionSources)) return null;
  return trial as Trial;
}

export function originalFramePath(id: string): string | null {
  const sample = /^SAFFIRE-II-([1-9])$/.exec(id)?.[1];
  return sample && ["1", "2", "3", "4", "7", "8", "9"].includes(sample) ? `data/saffire/ii-replays/${sample}/00.jpg` : null;
}

export function pieceSummary(piece: OriginPiece): string {
  if (![piece.lengthMm, piece.widthMm].every((n) => Number.isFinite(n) && n > 0)) return "Your configured piece";
  const f = (mm: number) => (mm / 1000).toLocaleString("en-US", { maximumFractionDigits: 3 });
  return `Your ${f(piece.lengthMm)} × ${f(piece.widthMm)} m piece`;
}

export function safeEvidenceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
