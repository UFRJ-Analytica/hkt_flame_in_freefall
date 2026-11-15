import type { Atmosphere, ExperimentTest } from "../types";
import type { ResearchBundle, ResearchContext } from "./types";
import { englishText } from "../i18n/english";

export const CONDITION_FIELDS = [
  { key: "oxygen", record: "oxygenPct", label: "O₂", unit: "%", min: 15, max: 40 },
  { key: "pressure", record: "pressureKpa", label: "Pressure", unit: "kPa", min: 35, max: 110 },
  { key: "flow", record: "flowCmS", label: "Flow", unit: "cm/s", min: 0, max: 40 },
] as const;
export interface FieldOrigin {
  kind: "initial-preset" | "preset" | "user" | "experiment";
  label: string;
  recordId?: string;
  investigationId?: string;
  sourceFile?: string;
  sourceRow?: number;
}
export type ConditionOrigins = Record<keyof Atmosphere, FieldOrigin>;
export function initialOrigins(): ConditionOrigins {
  return Object.fromEntries(CONDITION_FIELDS.map(({ key }) => [key, { kind: "initial-preset", label: "Initial preset · nominal cabin" }])) as ConditionOrigins;
}
export function originLabel(origin: FieldOrigin): string {
  return origin.kind === "experiment"
    ? `${origin.investigationId} · ${origin.recordId} · ${origin.sourceFile ?? "file not specified"} · row ${origin.sourceRow ?? "not specified"}`
    : englishText(origin.label);
}
export function invalidConditions(test: ExperimentTest): string[] {
  return CONDITION_FIELDS.flatMap((f) => {
    const value = test[f.record];
    return value != null && (!Number.isFinite(value) || value < f.min || value > f.max)
      ? [`${f.label}: ${value} ${f.unit} (control: ${f.min}–${f.max})`] : [];
  });
}
export function applyConditions(test: ExperimentTest, current: Atmosphere, origins: ConditionOrigins) {
  if (invalidConditions(test).length) throw new Error("Conditions are outside the limits; original values preserved.");
  const atmosphere = { ...current };
  const nextOrigins = { ...origins };
  for (const field of CONDITION_FIELDS) {
    const value = test[field.record];
    if (value == null) continue;
    atmosphere[field.key] = value;
    nextOrigins[field.key] = { kind: "experiment", label: test.label, recordId: test.id, investigationId: test.investigationId, sourceFile: test.sourceFile, sourceRow: test.sourceRow };
  }
  return { atmosphere, origins: nextOrigins };
}
/** Canonical, versioned scene identity: independent of object insertion order. */
export function contextKey(c: ResearchContext): string {
  return JSON.stringify([1, c.vehicle, c.surfaceId, c.surfaceName, c.structureKind, c.material, c.oxygenPct, c.pressureKpa, c.flowCmS, c.gravityG]);
}
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/u.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function bundleCsv(bundle: ResearchBundle): string {
  const header = ["requestId", "corpusVersion", "question", "intent", "context", "investigationId", "recordId", "label", "material", "oxygenPct", "pressureKpa", "flowCmS", "sourceFile", "sourceRow", "sourceUrl", "evidenceSources"];
  const rows = bundle.investigations.flatMap((item) => (item.records.length ? item.records : [null]).map((record) => [bundle.requestId, bundle.corpusVersion, bundle.question, bundle.intent, JSON.stringify(bundle.context), item.investigation.id, record?.id, record?.label, record?.material, record?.oxygenPct, record?.pressureKpa, record?.flowCmS, record?.sourceFile, record?.sourceRow, item.investigation.sourceUrl, JSON.stringify(item.sources)]));
  return '\uFEFF' + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export function downloadFile(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
