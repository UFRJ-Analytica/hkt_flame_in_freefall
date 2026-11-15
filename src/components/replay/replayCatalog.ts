// What each experiment can be replayed with, and why some stay static. Import-free (Node tests read it).
// Nature strings are the ReplayNature values of replayCore.ts.

export type ReplayId = "bass2-b1" | "saffire-ii-images" | "saffire-i-model" | "sofie-1410c" | "same-sequence" | "flare-static";

export interface ReplayEntry {
  id: ReplayId;
  title: string;
  tag: string;
  natures: string[];
  quantity: string;
  unit: string;
  timeReference: string;
  /** Public artefacts the replay reads (relative to public/). */
  data: string[];
  animated: boolean;
  /** Why the module is animated, or why it stays static. */
  basis: string;
  limits: string;
}

export const REPLAY_CATALOG: readonly ReplayEntry[] = [
  {
    id: "bass2-b1",
    title: "BASS-II B1 — Experimental Replay",
    tag: "BASS-II · PSI-25 · test B1",
    natures: ["video-derived"],
    quantity: "Position of the two tracked optical fronts (image column x)",
    unit: "px (image column); speeds in px/s",
    timeReference: "Experiment time, 0 s = frame 332 (10:09:47 video clock)",
    data: ["data/bass2/b1-replay.json", "data/bass2/b1-sample-plane.json"],
    animated: true,
    basis: "One tracked position per decoded video frame (874 frames), with quality codes, FAN/AIR overlay readings and events.",
    limits: "Pixel units only: no spatial calibration, so no mm/s. Not a flame contour, not CFD.",
  },
  {
    id: "saffire-ii-images",
    title: "SAFFIRE II — Experimental Image Replay",
    tag: "SAFFIRE II · PSI-99 · samples 1–4, 7–9",
    natures: ["experimental-images"],
    quantity: "Original camera frames",
    unit: "— (images, no scale applied)",
    timeReference: "Seconds since the first archived frame of each camera (archive timestamps)",
    data: ["data/saffire/psi-99-ii{1,2,3,4,7,8,9}-replay.json", "data/saffire/ii-replays/*/*.jpg"],
    animated: true,
    basis: "10–15 original JPEG frames per sample, already published in the project, in archive order.",
    limits: "A curated selection of frames, not continuous video; each frame stays on screen until the next recorded one.",
  },
  {
    id: "saffire-i-model",
    title: "SAFFIRE I · S1 — Stochastic Model Replay",
    tag: "SAFFIRE I · PSI-98 · sample S1 (model)",
    natures: ["computational-model", "video-derived"],
    quantity: "Model cell states and median front; measured median front for comparison",
    unit: "mm along the sample (grid 10 × 20 mm)",
    timeReference: "Seconds from the start of the analysed window (model step 2 s)",
    data: ["data/saffire/psi-98-s1-neighbors.json"],
    animated: true,
    basis: "The existing neighbourhood model (src/saffire.ts) started from the observed front, fixed seed; its output is reproducible.",
    limits: "Computational simulation fitted to one trial. Not an observed flame and not an independent validation.",
  },
  {
    id: "sofie-1410c",
    title: "SoFIE-GEL — Video / Exploratory Analysis",
    tag: "SoFIE-GEL · test 1410C · outside PSI",
    natures: ["experimental-video", "video-derived"],
    quantity: "Peak frequency of the exploratory spin windows",
    unit: "Hz in video time",
    timeReference: "Seconds of the public NASA video (46 s)",
    data: ["data/sofie/gel-evidence.json"],
    animated: true,
    basis: "14 analysed 8 s windows in video time; the public NASA video can be streamed on request.",
    limits: "Exploratory, not validated. ~10 unique frames/s; real time vs slow motion unresolved; no spatial scale. The five extinction cases stay static.",
  },
  {
    id: "same-sequence",
    title: "SAME — Smoke Generation and Detection Evidence",
    tag: "SAME · PSI-102 · 15 processed tests",
    natures: ["measurement-sequence"],
    quantity: "Heating period, solenoid sampling windows and plateau medians per instrument",
    unit: "Instrument units: pt/cc, mg/m³, V (uncalibrated flight volts)",
    timeReference: "Seconds from the start of each housekeeping record (1 Hz)",
    data: ["data/same/same-sequence.json"],
    animated: true,
    basis: "Recorded window boundaries and plateau medians from the housekeeping files; a discrete sequence, not a continuous signal.",
    limits: "Window summaries, not instantaneous values. No smoke cloud, no particle transport, no spatial concentration.",
  },
  {
    id: "flare-static",
    title: "FLARE — Flammability Limits at Reduced Gravity",
    tag: "FLARE · JAXA · outside PSI",
    natures: ["published-static"],
    quantity: "LOC, MLOC, ΔO₂ and Vcr as printed",
    unit: "% O₂ by volume; cm/s",
    timeReference: "None: published tables",
    data: ["data/flare/flare-evidence.json"],
    animated: false,
    basis: "Published limit tables of 1g and parabolic-flight campaigns; no time series (no ISS series in this base).",
    limits: "Kept static by design: a flame animation would invent behaviour the tables do not contain.",
  },
];

/** Public NASA video of SoFIE-GEL test 1410C (data/sofie/docs-manifest.json; sha256 in gel-evidence.json). */
export const SOFIE_PUBLIC_VIDEO = {
  url: "https://images-assets.nasa.gov/video/SoFIE-GEL/SoFIE-GEL~large.mp4",
  page: "https://images.nasa.gov/details/SoFIE-GEL",
  bytes: 27042449,
  sha256: "8086ea9eacbd00c5bce1f4a28307d9b79bd2f8dc5c947e1b4ebf74b06df09d38",
} as const;

/** Seed of the reproducible SAFFIRE model replay (same default as simulateFromObservedFront in src/saffire.ts). */
export const SAFFIRE_MODEL_SEED = 1951;
/** Seeds of the model's own Monte Carlo spread (20 realizations, as in the habitat ensemble). */
export const SAFFIRE_ENSEMBLE_SEEDS: readonly number[] = Array.from({ length: 20 }, (_, i) => SAFFIRE_MODEL_SEED + i);
/** SAFFIRE II samples with published original frames (scripts/build_saffire_ii_replays.py). */
export const SAFFIRE_II_FRAME_SAMPLES: readonly number[] = [1, 2, 3, 4, 7, 8, 9];
