// Habitable crew environments named in the challenge brief, and how each one is sent to the
// research service. The service knows two cabin geometries (Orion capsule, ISS-like module), so
// each environment declares which geometry analog it uses and its own conditions.

import type { ResearchContext, ResearchIntent } from "../research/types";

export type EnvironmentId = "lunar-habitat" | "pressurized-rover" | "orbital-station" | "crew-spacecraft";

export interface CrewEnvironment {
  id: EnvironmentId;
  label: string;
  short: string;
  gravity: string;
  atmosphere: string;
  why: string;
  context: ResearchContext;
  geometryAnalog: string;
  defaultQuestion: string;
}

const surface = (vehicle: "orion" | "iss", material: string) => ({
  vehicle, surfaceId: "wall_panels", surfaceName: "Wall panels", structureKind: "Liner", material,
});

export const ENVIRONMENTS: CrewEnvironment[] = [
  {
    id: "lunar-habitat", label: "Lunar surface habitat", short: "Lunar habitat",
    gravity: "1/6 g", atmosphere: "56.5 kPa · 34% O₂ (exploration atmosphere)",
    why: "Partial gravity and oxygen-enriched cabin air, the scenario the challenge video highlights for Artemis.",
    context: { ...surface("iss", "SIBAL"), oxygenPct: 34, pressureKpa: 56.5, flowCmS: 10, gravityG: 0.166 },
    geometryAnalog: "ISS-like module geometry",
    defaultQuestion: "Flame spread on cabin fabrics in a lunar habitat with oxygen-enriched atmosphere and partial gravity",
  },
  {
    id: "pressurized-rover", label: "Pressurized rover", short: "Rover",
    gravity: "1/6 g", atmosphere: "56.5 kPa · 34% O₂ (exploration atmosphere)",
    why: "Small confined volume with enriched oxygen and limited egress.",
    context: { ...surface("orion", "Nomex"), oxygenPct: 34, pressureKpa: 56.5, flowCmS: 5, gravityG: 0.166 },
    geometryAnalog: "Orion capsule geometry",
    defaultQuestion: "Fire risk of seat fabrics in a small pressurized lunar rover with low ventilation",
  },
  {
    id: "orbital-station", label: "Orbital station module", short: "Station",
    gravity: "microgravity", atmosphere: "101.3 kPa · 21% O₂",
    why: "The environment where most NASA combustion data was measured (ISS, Cygnus).",
    context: { ...surface("iss", "SIBAL"), oxygenPct: 21, pressureKpa: 101.3, flowCmS: 10, gravityG: 0 },
    geometryAnalog: "ISS-like module geometry",
    defaultQuestion: "Flame spread and detection of fabric fires in a microgravity station module",
  },
  {
    id: "crew-spacecraft", label: "Crew spacecraft", short: "Spacecraft",
    gravity: "microgravity", atmosphere: "101.3 kPa · 21% O₂",
    why: "Transit vehicles such as Orion: dense equipment, cable runs and crew seats.",
    context: { ...surface("orion", "Kapton"), oxygenPct: 21, pressureKpa: 101.3, flowCmS: 10, gravityG: 0 },
    geometryAnalog: "Orion capsule geometry",
    defaultQuestion: "Detection of overheated wire insulation smoke in a crew capsule",
  },
];

export const FUNCTIONS: { id: ResearchIntent; label: string; hint: string }[] = [
  { id: "prevention", label: "Prevention", hint: "material flammability and spread" },
  { id: "detection", label: "Detection", hint: "smoke and early warning" },
  { id: "suppression", label: "Suppression", hint: "extinction and suppressants" },
  { id: "post-fire", label: "Post-fire", hint: "atmosphere and recovery" },
];
