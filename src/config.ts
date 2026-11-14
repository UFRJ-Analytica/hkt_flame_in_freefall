import type { Atmosphere, Surface } from "./types";

export const SURFACES: Surface[] = [
  {
    id: "console_main",
    name: "Console de comando",
    kind: "Equipamento",
    material: "PMMA",
  },
  {
    id: "crew_seats",
    name: "Assentos da tripulação",
    kind: "Têxtil",
    material: "Nomex",
  },
  {
    id: "wall_panels",
    name: "Painéis internos",
    kind: "Revestimento",
    material: "SIBAL",
  },
  {
    id: "cable_run",
    name: "Cabeamento",
    kind: "Isolamento",
    material: "Kapton",
  },
  {
    id: "floor",
    name: "Estrutura e piso",
    kind: "Estrutura",
    material: "Alumínio",
  },
];
export const MATERIALS = ["PMMA", "Nomex", "SIBAL", "Kapton", "Alumínio"];
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
    label: "Cabine nominal",
    note: "Referência atmosférica terrestre. Não representa uma certificação da Orion.",
    atmosphere: { oxygen: 21, pressure: 101.3, flow: 10 },
  },
  {
    id: "enriched",
    label: "O₂ enriquecido",
    note: "Cenário exploratório de pressão reduzida. Não é um preset operacional de veículo.",
    atmosphere: { oxygen: 30, pressure: 70.3, flow: 10 },
  },
  {
    id: "low-flow",
    label: "Ventilação baixa",
    note: "Variação ilustrativa para explorar a relevância da ventilação em microgravidade.",
    atmosphere: { oxygen: 21, pressure: 101.3, flow: 2 },
  },
];
export const CATEGORY_LABELS: Record<string, string> = {
  solid: "Sólidos",
  droplet: "Gotículas",
  gas: "Gases",
  detection: "Detecção",
  "large-scale": "Grande escala",
  other: "Outros",
};
export const number = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
