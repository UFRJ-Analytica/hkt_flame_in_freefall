// Objective 3 — "highlight research that informs the development of next-generation fire safety
// controls and equipment". Curated findings, each tied to the artefact or publication it comes
// from. Wording separates what was measured from the design implication drawn from it.

import type { ResearchIntent } from "../research/types";

export type EvidenceLevel = "published" | "measured" | "derived" | "investigation scope";
export type Module = "same" | "sofie" | "bass2";

export interface ControlFinding {
  id: string;
  fn: Exclude<ResearchIntent, "terrestrial">;
  title: string;
  finding: string;
  implication: string;
  level: EvidenceLevel;
  investigations: string[];
  sources: { label: string; url: string }[];
  module?: Module;
  lunar?: boolean;
}

const NTRS_SAFFIRE_I = { label: "NTRS 20170008805 (Saffire large-scale tests)", url: "https://ntrs.nasa.gov/citations/20170008805" };
const PSI = (id: string, label: string) => ({ label: `${label} · ${id}`, url: `https://psi.nasa.gov/physci/repo/data/investigations/${id}` });

export const CONTROL_FINDINGS: ControlFinding[] = [
  {
    id: "lowg-spread", fn: "prevention", level: "published",
    title: "Fabric fires keep spreading in microgravity",
    finding: "In SAFFIRE-II, cotton/fiberglass SIBAL sustained concurrent-flow spread at 2.1 and 2.6 mm/s (≈22% O₂, 20 cm/s, microgravity); SAFFIRE-I measured 1.8 mm/s on a 94 × 40.6 cm sheet.",
    implication: "Low-gravity, large-sample behaviour has to feed material selection; normal-gravity screening alone does not describe concurrent spread under cabin ventilation.",
    investigations: ["PSI-98", "PSI-99", "PSI-100"], sources: [PSI("PSI-99", "SAFFIRE-II table"), NTRS_SAFFIRE_I],
  },
  {
    id: "material-outcomes", fn: "prevention", level: "published",
    title: "Some materials did not sustain flame in the same test series",
    finding: "SAFFIRE-II: silicone samples (0.27–1.03 mm) burned ≈0 cm; the PMMA flame consumed its 5 cm section without igniting the Nomex that followed; thick PMMA kept an anchored flame with 0.01–0.04 mm/s regression.",
    implication: "Candidate liner and barrier materials, valid only for those test conditions (≈22% O₂, 1 atm, 20 cm/s); not demonstrated barriers in enriched or partial-gravity cabins.",
    investigations: ["PSI-99"], sources: [PSI("PSI-99", "SAFFIRE-II table, notes 2–4")],
  },
  {
    id: "enriched-atmosphere", fn: "prevention", level: "published", lunar: true,
    title: "Exploration atmospheres change the flammability picture",
    finding: "SAFFIRE VI-2 burned SIBAL at 31.0% O₂ and 54.1 kPa (close to the 34% / 56.5 kPa exploration atmosphere) with a published rate of 4.05 mm/s, versus 1.95 mm/s char-front speed in SAFFIRE I at ≈21.6% O₂. Different pressures and observables: a descriptive contrast, not an isolated oxygen effect.",
    implication: "Materials for lunar habitats and rovers should be re-qualified at the exploration atmosphere; NASA flammability configuration analyses already require testing at up to ≈35% O₂.",
    investigations: ["PSI-98"], sources: [
      { label: "ICES-2024-365, Saffire VI preliminary results", url: "https://ntrs.nasa.gov/citations/20240002981" },
      { label: "JSC 29353 flammability configuration analysis", url: "https://standards.nasa.gov/system/files/tmp/JSC%2029353D%20Flammability%20Configuration%20Analysis%20for%20Spacecraft%20Applications.pdf" },
    ],
  },
  {
    id: "partial-gravity", fn: "prevention", level: "published", lunar: true,
    title: "Partial gravity: the effect depends on the material",
    finding: "Centrifuge and parabolic-flight tests show some materials become more flammable at lunar gravity than at 1 g (SIBAL burns downward at 1/6 g and self-extinguishes at 1 g), while higher-pyrolysis-temperature materials may become less flammable. FM² will measure this on the Moon.",
    implication: "There is no universal safety margin between microgravity, lunar and Earth data; lunar hardware needs partial-gravity testing per material.",
    investigations: [], sources: [
      { label: "ICES-2025-392, solid fuel ignition for lunar applications", url: "https://ntrs.nasa.gov/citations/20250002114" },
      { label: "NASA FM² (Flammability of Materials on the Moon)", url: "https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/flammability-of-materials-on-the-moon-fm2/" },
    ],
  },
  {
    id: "smoke-size", fn: "detection", level: "published", module: "same",
    title: "Smoke particle size depends on the material and grows with age",
    finding: "SAME count-median diameters: Kapton 80 → 155 nm, silicone 189 → 352 nm, lamp wick 186 → 258 nm, Teflon 170 → 228 nm (fresh → after 720 s aging), from smoke of overheated material in microgravity.",
    implication: "Spacecraft smoke detectors must respond to sub-200 nm particles at the earliest stage; a single size band misses early Kapton (wire insulation) smoke.",
    investigations: ["PSI-102", "PSI-101"], sources: [PSI("PSI-102", "SAME Final Science Report, Table 1")],
  },
  {
    id: "detector-response", fn: "detection", level: "measured", module: "same",
    title: "Flight smoke detectors respond differently by material",
    finding: "In SAME flight data the ISS light-scattering detector signal clipped in all four lamp-wick tests, while ionization and Shuttle detector responses varied by material. Flight volts are uncalibrated and not comparable across instruments.",
    implication: "Supports multi-sensor detection with enough dynamic range, rather than one detector principle tuned to one smoke type.",
    investigations: ["PSI-102"], sources: [PSI("PSI-102", "SAME flight signals")],
  },
  {
    id: "suppressants", fn: "suppression", level: "investigation scope",
    title: "Suppressant effectiveness and liquid-fuel limits in microgravity",
    finding: "FLEX mapped flammability limits of fuel droplets and measured the effectiveness of gaseous suppressants (CO₂, He, SF₆); FLEX-2 extended it to bi-component fuels. The droplet records are in the catalog.",
    implication: "Data for choosing and dosing gaseous suppressants for closed cabins, where microgravity changes flame structure and cool-flame behaviour.",
    investigations: ["PSI-69", "PSI-68", "PSI-117", "PSI-142"], sources: [PSI("PSI-69", "FLEX"), PSI("PSI-68", "FLEX-2")],
  },
  {
    id: "extinction-modes", fn: "suppression", level: "published", module: "sofie",
    title: "Two ways a solid-fuel flame goes out",
    finding: "SoFIE-GEL (4 cm PMMA spheres): quenching at low flow and blowoff at high flow, branches meeting at a strain rate of 7.5 1/s. Four of five published extinctions occurred at 13.5–15% O₂; at 0.44 cm/s the flame quenched at 20.8% O₂.",
    implication: "Ventilation control and oxygen reduction are both suppression levers: in near-quiescent air a solid-fuel flame can quench with almost normal oxygen.",
    investigations: [], sources: [
      { label: "NASA NTRS 20240007628, Table 1", url: "https://ntrs.nasa.gov/citations/20240007628" },
      { label: "Combustion and Flame 277 (2025) 114244", url: "https://doi.org/10.1016/j.combustflame.2025.114244" },
    ],
  },
  {
    id: "bass-suppression", fn: "suppression", level: "investigation scope", module: "bass2",
    title: "Inert-gas extinguishing and extinction limits of solids",
    finding: "BASS assessed an inert gaseous extinguishing agent similar to the one used on ISS; BASS-II studied ignition, growth, spread and extinction limits of solids in low-velocity forced flow. The B1 video yields a measured flame-front trajectory (pixel units).",
    implication: "Benchmarks for the combustion models used to design spacecraft detection and suppression systems, as stated in the investigation objectives.",
    investigations: ["PSI-25", "PSI-26"], sources: [PSI("PSI-25", "BASS-II"), PSI("PSI-26", "BASS")],
  },
  {
    id: "post-fire-gases", fn: "post-fire", level: "measured",
    title: "Oxygen consumption and CO/CO₂ after each burn",
    finding: "The BASS-II table records calibrated initial and final O₂, CO₂ and CO for each of its 129 tests in the sealed glovebox.",
    implication: "Input for post-fire atmosphere models: oxygen depletion and toxic-gas build-up that cleanup and crew-protection equipment must handle.",
    investigations: ["PSI-25"], sources: [PSI("PSI-25", "BASS-II experimental table")],
  },
  {
    id: "smoke-transport", fn: "post-fire", level: "investigation scope",
    title: "How gravity shapes pyrolysis smoke growth",
    finding: "A ground modelling investigation used SAME data to study the influence of gravity on pyrolysis smoke growth.",
    implication: "Basis for smoke transport and filtration sizing beyond microgravity; partial-gravity smoke behaviour remains unmeasured.",
    investigations: ["PSI-115"], sources: [PSI("PSI-115", "Smoke modeling")],
  },
];

export const LUNAR_GAPS = [
  "No flame-spread measurements at lunar gravity in the PSI datasets; FM² results are not yet published.",
  "Only one measured point near the exploration atmosphere (SAFFIRE VI-2, microgravity); no oxygen–pressure series for model fitting.",
  "No tests of material interfaces or barriers at enriched oxygen: a non-igniting outcome at 22% O₂ is not a proven barrier.",
  "No smoke transport or detector-response data in partial gravity.",
  "Opposed-flow spread rates (S2 samples) are under scientific review.",
];

// ---- Historical lessons and spinoffs (challenge resources). Wording stays within the ingested
// NASA page text; technical root causes live in board reports that are linked, not ingested.

export interface Lesson {
  id: string;
  kind: "mishap" | "spinoff";
  year: string;
  title: string;
  what: string;
  lesson: string;
  sourceId: string;
  source: { label: string; url: string };
}

export const LESSONS: Lesson[] = [
  {
    id: "mir", kind: "mishap", year: "1997", title: "Mir: oxygen generator fire",
    what: "A solid-fuel oxygen generator canister in Kvant-1 ignited, shooting a three-foot flame with sparks and molten metal, filling modules with smoke and blocking the route to one Soyuz. The crew donned oxygen masks and used foam extinguishers; the flame finally extinguished itself, and life support cleared the smoke over several hours. Investigators named latex glove material introduced into the canister as the most likely culprit.",
    lesson: "Oxygen-generating equipment is itself an ignition source; egress routes, respiratory protection and atmosphere cleanup are part of the fire system. NASA notes the lessons passed into ISS design and operations, which now rely on electrolytic oxygen generation with dissimilar redundancy.",
    sourceId: "nasa-mir-fire", source: { label: "NASA History: 25 Years Ago, Fire Aboard Space Station Mir", url: "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/" },
  },
  {
    id: "apollo-1", kind: "mishap", year: "1967", title: "Apollo 1: command module fire on the pad",
    what: "During a preflight test for Apollo 204, a fire swept through the command module and killed Virgil Grissom, Edward White and Roger Chaffee. The investigation and extensive reworking of the command modules postponed crewed launches.",
    lesson: "Crewed ground tests sit inside the fire-safety envelope, and a cabin fire can force a redesign of the whole vehicle. The technical findings are in the Investigation Board final report linked from the NASA page (not ingested here).",
    sourceId: "nasa-apollo-1", source: { label: "NASA: Apollo 1", url: "https://www.nasa.gov/mission/apollo-1/" },
  },
  {
    id: "apollo-13", kind: "mishap", year: "1970", title: "Apollo 13: oxygen system failure in flight",
    what: "On the way to the Moon the spacecraft was severely damaged about 200,000 miles from Earth and the crew returned without landing, a mission NASA calls a \"successful failure\". The challenge brief describes the event as an oxygen tank explosion.",
    lesson: "Stored oxygen and its hardware are a hazard far from help. The Review Board and mission reports linked from the NASA page carry the technical cause (not ingested here).",
    sourceId: "nasa-apollo-13", source: { label: "NASA: Apollo 13", url: "https://www.nasa.gov/mission/apollo-13/" },
  },
  {
    id: "fire-detector", kind: "spinoff", year: "1978", title: "Shuttle fire detector",
    what: "The Brunswick Incipient Fire Detector, first used in Space Shuttle orbiters, samples air for combustion particles and can tell them apart from dust, so it gives fewer false alarms. NASA Spinoff reports it signals a fire condition before flame and smoke appear, and networks of sensors were proposed for mines.",
    lesson: "Particle discrimination against dust is a detector requirement in closed cabins, where dust stays airborne; early-stage (incipient) sensing was already a design goal.",
    sourceId: "nasa-spinoff-detector", source: { label: "NASA Spinoff: Fire Detector", url: "https://spinoff.nasa.gov/node/9407" },
  },
  {
    id: "air-tanks", kind: "spinoff", year: "1976", title: "Firefighter air tanks",
    what: "With NASA Johnson, Scott Aviation built lightweight firefighter air tanks: 20 pounds for a 30-minute supply, 13 pounds less than conventional tanks, at 4,500 psi, with an aluminum liner wrapped in resin-impregnated glass fiber.",
    lesson: "Respiratory protection weight and duration trade directly against mobility; relevant to crew breathing equipment after a fire.",
    sourceId: "nasa-spinoff-air-tanks", source: { label: "NASA Spinoff: Fireman's Air Tanks", url: "https://spinoff.nasa.gov/node/9582" },
  },
  {
    id: "fire-attire", kind: "spinoff", year: "1982", title: "Project FIRES protective clothing",
    what: "NASA and the U.S. Fire Administration, with Marshall managing, applied lightweight fire-resistant, heat-protective materials developed for spacesuits and spacecraft to firefighter gear; fourteen municipal fire departments took part in the field evaluation.",
    lesson: "Spacecraft thermal-protection materials already transferred to protective ensembles; candidate inputs for crew protective equipment.",
    sourceId: "nasa-spinoff-fire-attire", source: { label: "NASA Spinoff: New Technology for the Fire Attire", url: "https://spinoff.nasa.gov/node/9918" },
  },
];

export type SystemId = "materials" | "atmosphere" | "detection" | "suppression" | "recovery";
export interface ControlSystem {
  id: SystemId;
  label: string;
  question: string;
  findings: string[];
  lessons: string[];
  gaps: number[];
}
/** Engineering systems a designer works on, mapped to the evidence above (indices into LUNAR_GAPS). */
export const SYSTEMS: ControlSystem[] = [
  { id: "materials", label: "Cabin materials & layout", question: "Which liners, fabrics and wire insulation to use, and how to arrange them", findings: ["lowg-spread", "material-outcomes", "enriched-atmosphere", "partial-gravity"], lessons: ["apollo-1"], gaps: [0, 1, 2] },
  { id: "atmosphere", label: "Atmosphere & oxygen systems", question: "Cabin O₂ / pressure set-point, ventilation, oxygen generation and storage", findings: ["enriched-atmosphere", "extinction-modes", "lowg-spread"], lessons: ["mir", "apollo-13", "apollo-1"], gaps: [1] },
  { id: "detection", label: "Smoke & fire detection", question: "Which sensors, size ranges and alarm logic", findings: ["smoke-size", "detector-response"], lessons: ["fire-detector"], gaps: [3] },
  { id: "suppression", label: "Suppression & extinguishing", question: "Which agent, how much, and when ventilation shut-down helps", findings: ["suppressants", "extinction-modes", "bass-suppression"], lessons: ["mir"], gaps: [4] },
  { id: "recovery", label: "Post-fire recovery & crew protection", question: "Atmosphere cleanup, toxic gases, masks and protective gear", findings: ["post-fire-gases", "smoke-transport"], lessons: ["mir", "air-tanks", "fire-attire"], gaps: [3] },
];
