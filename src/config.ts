import type { Atmosphere, Surface } from "./types";

export const SURFACES: Surface[] = [
  {
    id: "console_main",
    name: "Command console",
    kind: "Equipment",
    material: "PMMA",
  },
  {
    id: "crew_seats",
    name: "Crew seats",
    kind: "Textile",
    material: "Nomex",
  },
  {
    id: "wall_panels",
    name: "Interior panels",
    kind: "Lining",
    material: "SIBAL",
  },
  {
    id: "cable_run",
    name: "Wiring",
    kind: "Insulation",
    material: "Kapton",
  },
  {
    id: "floor",
    name: "Structure and floor",
    kind: "Structure",
    material: "Alumínio",
  },
];
export const MATERIALS = ["PMMA", "Nomex", "SIBAL", "Kapton", "Alumínio"];
// Display labels are separate from stable material identifiers.
export const MATERIAL_LABELS: Record<string, string> = { "Alumínio": "Aluminum" };
export const INITIAL_MATERIALS = Object.fromEntries(
  SURFACES.map((s) => [s.id, s.material]),
);
export const PRESETS: {
  id: string;
  label: string;
  note: string;
  atmosphere: Atmosphere;
}[] = [
  {
    id: "cabin",
    label: "Nominal cabin",
    note: "Earth-atmosphere reference. Does not represent Orion certification.",
    atmosphere: { oxygen: 21, pressure: 101.3, flow: 10 },
  },
  {
    id: "enriched",
    label: "O₂-enriched",
    note: "Exploratory reduced-pressure scenario. Not an operational vehicle preset.",
    atmosphere: { oxygen: 30, pressure: 70.3, flow: 10 },
  },
  {
    id: "low-flow",
    label: "Low ventilation",
    note: "Illustrative variation for exploring the role of ventilation in microgravity.",
    atmosphere: { oxygen: 21, pressure: 101.3, flow: 2 },
  },
];
export const CATEGORY_LABELS: Record<string, string> = {
  solid: "Solids",
  droplet: "Droplets",
  gas: "Gases",
  detection: "Detection",
  "large-scale": "Large-scale",
  other: "Other",
};
export const number = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-US", { maximumFractionDigits: digits });
