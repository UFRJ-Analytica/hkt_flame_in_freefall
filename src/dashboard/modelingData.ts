// Objective 2 — "extract data that supports predictive modeling of flammability and fire
// scenarios". One table of model-ready quantities assembled from the published artefacts, each
// row keeping its observable, conditions and provenance. Nothing is computed that the artefacts
// do not already contain; quantities of different kinds are never merged.

export type Quantity = "spread-rate" | "flammability-outcome" | "extinction-limit" | "smoke-particle-size";
export const QUANTITY_LABEL: Record<Quantity, string> = {
  "spread-rate": "Flame spread rate",
  "flammability-outcome": "Flammability outcome",
  "extinction-limit": "Extinction limit",
  "smoke-particle-size": "Smoke particle size",
};

export interface ModelRow {
  id: string;
  dataset: string;
  investigation: string;
  quantity: Quantity;
  value: number | string;
  unit: string;
  observable: string;
  material: string;
  oxygenPct: string;
  pressureKpa: string;
  flowCmS: string;
  gravity: string;
  note: string;
  source: string;
  url: string | null;
}

const OUTCOME_EN: Record<string, string> = {
  sustained: "sustained spread", "no-sustained": "no sustained spread", anchored: "flame anchored at base", "not-ignited": "not ignited",
};
const fmt = (n: number | null | undefined, d = 2) => n === null || n === undefined ? "—" : String(Math.round(n * 10 ** d) / 10 ** d);
const range = (r: [number, number] | null | undefined, p: number | null | undefined) =>
  r ? (r[0] === r[1] ? fmt(r[0], 1) : `${fmt(r[0], 1)}–${fmt(r[1], 1)}`) : p !== null && p !== undefined ? fmt(p, 1) : "not tabulated";

type J = Record<string, any>;

export function buildModelRows(src: { targets?: J; registry?: J; sofie?: J; same?: J; bass?: J }): ModelRow[] {
  const rows: ModelRow[] = [];
  // SAFFIRE I–III curated targets: outcomes and table spread rates
  for (const r of src.targets?.records ?? []) {
    const base = {
      dataset: r.campaign.replace("-", " "), investigation: r.investigation, material: r.material,
      oxygenPct: range(r.oxygenPct, null), pressureKpa: "not tabulated", flowCmS: `${r.flowCmS} ${r.flowDirection}`, gravity: "microgravity",
      source: `${r.source.file}, row ${r.source.row}`, url: r.source.url,
    };
    if (r.outcome) rows.push({ ...base, id: `${r.id}:outcome`, quantity: "flammability-outcome", value: OUTCOME_EN[r.outcome] ?? r.outcome, unit: "", observable: "test outcome (table)", note: r.thicknessMm ? `${r.thicknessMm} mm sample` : "" });
    if (r.spreadRateMmS !== null && r.spreadRateMmS !== undefined) rows.push({ ...base, id: `${r.id}:rate`, quantity: "spread-rate", value: r.spreadRateMmS, unit: "mm/s", observable: r.spreadRateSource?.kind === "publication" ? "published rate" : "table rate", note: r.spreadRateSource?.label ?? "" });
  }
  // Trial registry: one row per observable (char front, flame base and published rates kept apart)
  for (const t of src.registry?.trials ?? []) {
    t.observables.forEach((o: J, i: number) => rows.push({
      id: `${t.id}:obs${i}`, dataset: `${t.campaign} ${t.sample}`, investigation: t.investigation ?? "published (outside PSI)",
      quantity: "spread-rate", value: o.speedMmS, unit: "mm/s",
      observable: o.kind === "char-front" ? "char front (image tracking)" : o.kind === "flame-base" ? "flame base (published curve)" : "published rate",
      material: t.material, oxygenPct: range(t.conditions.oxygenRangePct, t.conditions.oxygenPct),
      pressureKpa: t.conditions.pressureKpa ?? "not tabulated", flowCmS: `${t.conditions.flowCmS} ${t.conditions.flowDirection}`,
      gravity: "microgravity", note: `${o.window}${t.conditions.flowDirection === "opposed" ? " · opposed-flow rates under review (S2_REVIEW)" : ""}`,
      source: o.source?.label ?? t.id, url: o.source?.url ?? null,
    }));
  }
  // SoFIE-GEL extinction cases (published, outside PSI)
  for (const c of src.sofie?.cases?.rows ?? []) rows.push({
    id: `SOFIE-${c.sample}`, dataset: `SoFIE-GEL ${c.sample}`, investigation: "published (outside PSI)", quantity: "extinction-limit",
    value: c.o2AtExtinction.value, unit: "% O₂ at extinction", observable: `${c.extinctionMode.value} extinction`,
    material: "PMMA sphere, 4 cm", oxygenPct: `→ ${c.o2AtExtinction.value}`, pressureKpa: fmt(c.pressure.value * 101.325, 1),
    flowCmS: `${c.flow.value}`, gravity: "microgravity", note: `strain rate ${c.strainRate.value} 1/s`,
    source: "NASA NTRS 20240007628, Table 1", url: "https://ntrs.nasa.gov/citations/20240007628",
  });
  // SAME smoke particle size (Table 1, aggregated by material)
  for (const r of src.same?.table1?.rows ?? []) rows.push({
    id: `SAME-${r.material}-${r.aged ? "aged" : "fresh"}`, dataset: "SAME", investigation: "PSI-102", quantity: "smoke-particle-size",
    value: r.Dg.value, unit: "nm (count median diameter)", observable: r.aged ? "after 720 s aging" : "no aging",
    material: r.material, oxygenPct: "cabin air", pressureKpa: "cabin", flowCmS: "—", gravity: "microgravity",
    note: `σg ${r.sigmaG.value} · smoke from overheated material, not flame`, source: "SAME Final Science Report, Table 1, p. 17",
    url: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-102",
  });
  // BASS-II B1: measured in pixels; kept out of mm/s comparisons
  if (src.bass?.velocities?.upper) rows.push({
    id: "BASS2-B1-upper", dataset: "BASS-II B1", investigation: "PSI-25", quantity: "spread-rate",
    value: src.bass.velocities.upper.value_px_s, unit: "px/s (no spatial scale)", observable: "luminous flame sheet (video)",
    material: "PMMA film 100 µm", oxygenPct: "22.2", pressureKpa: "not tabulated", flowCmS: "opposed (display only)", gravity: "microgravity",
    note: "pixel units: not comparable to mm/s until a spatial scale is established", source: "public/data/bass2/b1-replay.json", url: "https://psi.nasa.gov/physci/repo/data/investigations/PSI-25",
  });
  return rows;
}

export function rowsToCsv(rows: ModelRow[]): string {
  const cols: (keyof ModelRow)[] = ["dataset", "investigation", "quantity", "value", "unit", "observable", "material", "oxygenPct", "pressureKpa", "flowCmS", "gravity", "note", "source", "url"];
  const q = (v: unknown) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => q(r[c])).join(","))].join("\n") + "\n";
}
