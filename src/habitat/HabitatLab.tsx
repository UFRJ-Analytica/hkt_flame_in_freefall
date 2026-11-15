import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpFromLine, BookOpen, Flame, LoaderCircle,
  MousePointer2, Pause, Play, Plus, RotateCcw, Settings2, Trash2, Wind, X,
} from "lucide-react";
import { SceneBoundary } from "../components/SceneBoundary";
import { readSaffireModel, type SaffireModel } from "../saffire";
import { GRAVITY_ENVIRONMENTS, gravityOf, PARTIAL_GRAVITY_SOURCES, type GravityId } from "../model/domain";
import type { EnsembleResult, EngineInput } from "./engine";
import {
  buildGrid, CELL, DEFAULT_IGNITION, DEFAULT_PIECES, GRID, ignitionMask, MATERIAL_INFO, MAX_PIECES, PIECE_KINDS, PIECE_LIMITS,
  pieceCells, pieceCentre, piecesToZones, REFERENCE_FABRIC, type Piece, type PieceKind,
} from "./habitatModel";
import {
  buildAnchorKernels, compareToTrial, FALLBACK_REGISTRY, LEVEL_LABEL, rankTrials, readCrossTrial, readRegistry,
  scenarioKernel, type CrossTrial, type RunLevel, type Trial, type TrialRegistry,
} from "./trials";
import type { ViewMode } from "./HabitatScene";
import { ModelInUse, TrialList } from "./ModelPanels";
import { Alternatives } from "./Alternatives";
import { computeMetrics, DURATION_S, fieldFingerprint, quantiles, SEED_COUNT, SEEDS, STEPS, validateInputs, type ScenarioInputs } from "./scenarioRun";
import { englishText } from "../i18n/english";
import "./habitat.css";

const HabitatScene = lazy(() => import("./HabitatScene"));
const SPEEDS = [15, 30, 60];

type Site = "surface" | "orbit";
const SITES: { id: Site; label: string; title: string }[] = [
  { id: "surface", label: "Lunar surface habitat", title: "LUNAR SURFACE HABITAT" },
  { id: "orbit", label: "Spacecraft in lunar orbit", title: "LUNAR ORBIT SPACECRAFT" },
];
const PRESETS: { id: string; site: Site; label: string; note: string; oxygen: number; pressure: number; flow: number; gravity: GravityId }[] = [
  { id: "lunar", site: "surface", label: "Exploration atmosphere", note: "34% O₂ at 56.5 kPa (8.2 psia), the atmosphere NASA studies for lunar surface habitats · 1/6 g · 10 cm/s ventilation.", oxygen: 34, pressure: 56.5, flow: 10, gravity: "moon" },
  { id: "lunar-air", site: "surface", label: "Sea-level air", note: "21% O₂ at 101.3 kPa · 1/6 g · 10 cm/s ventilation.", oxygen: 21, pressure: 101.3, flow: 10, gravity: "moon" },
  { id: "vehicle", site: "orbit", label: "Exploration vehicle atmosphere", note: "26.5% O₂ at 70.3 kPa (10.2 psia), the atmosphere NASA defined for exploration vehicles · microgravity · 10 cm/s ventilation.", oxygen: 26.5, pressure: 70.3, flow: 10, gravity: "orbit" },
  { id: "station", site: "orbit", label: "Cabin air", note: "21% O₂ at 101.3 kPa, as on the ISS · microgravity · 10 cm/s ventilation.", oxygen: 21, pressure: 101.3, flow: 10, gravity: "orbit" },
  { id: "saffire", site: "orbit", label: "NASA SAFFIRE I test conditions", note: "21.6% O₂ at ~1 atm · microgravity · 20 cm/s: the conditions of the reference experiment.", oxygen: 21.6, pressure: 101.3, flow: 20, gravity: "orbit" },
];

const num = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });
const fmtTime = (s: number) => s < 60 ? `${num(s, 0)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`;


/** SHA-256 of the exact bytes served, so an export can be tied to the artefacts it used. */
async function sha256(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
type Loaded = { path: string; role: string; sha256: string };

function useSaffire() {
  const [model, setModel] = useState<SaffireModel | null>(null);
  const [second, setSecond] = useState<CrossTrial | null>(null);
  const [registry, setRegistry] = useState<TrialRegistry>(FALLBACK_REGISTRY);
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const request = new AbortController();
    const base = import.meta.env.BASE_URL;
    const load = (path: string, role: string) => fetch(`${base}${path}`, { signal: request.signal })
      .then(async (r) => {
        if (!r.ok || !r.headers.get("content-type")?.includes("json")) return null;
        const text = await r.text();
        const digest = await sha256(text);
        setLoaded((current) => [...current.filter((x) => x.path !== path), { path: `public/${path}`, role, sha256: digest }]);
        return JSON.parse(text) as unknown;
      });
    load("data/saffire/psi-98-s1-neighbors.json", "SAFFIRE I neighborhood kernel")
      .then((v) => { if (!v) throw new Error("SAFFIRE model unavailable."); setModel(readSaffireModel(v)); })
      .catch((e: unknown) => { if (!request.signal.aborted) setError(e instanceof Error ? englishText(e.message) : "Error loading the model."); });
    // Optional: without it, flow scaling falls back to the linear hypothesis and III is never labelled.
    load("data/saffire/crosstrial-i-iii.json", "SAFFIRE III kernel and flow exponent")
      .then((v) => setSecond(readCrossTrial(v))).catch(() => undefined);
    // Trial registry from scripts/build_trial_registry.py; the embedded fallback is used until it exists.
    load("data/saffire/trial-registry.json", "trial registry")
      .then((v) => { const parsed = readRegistry(v); if (parsed) setRegistry(parsed); }).catch(() => undefined);
    return () => request.abort();
  }, []);
  return { model, second, registry, loaded, error };
}

export function HabitatLab({ modeSwitch, onOpenCalibration, requestedAnchor = null }: {
  modeSwitch: ReactNode; onOpenCalibration: () => void; requestedAnchor?: { id: string; nonce: number } | null;
}) {
  const { model, second, registry, loaded, error } = useSaffire();
  const [anchorChoice, setAnchorChoice] = useState<string>("auto");
  const [preset, setPreset] = useState("lunar");
  const [oxygen, setOxygen] = useState(34);
  const [pressure, setPressure] = useState(56.5);
  const [flow, setFlow] = useState(10);
  const [gravity, setGravity] = useState<GravityId>("moon");
  const [pieces, setPieces] = useState<Piece[]>(DEFAULT_PIECES);
  const [selectedPiece, setSelectedPiece] = useState(0);
  const [ignition, setIgnition] = useState(DEFAULT_IGNITION);
  const [showModel, setShowModel] = useState(false);
  const zones = useMemo(() => piecesToZones(pieces), [pieces]);
  const [ensemble, setEnsemble] = useState<EnsembleResult | null>(null);
  const [computing, setComputing] = useState(false);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  const [run, setRun] = useState(0);
  const [view, setView] = useState<ViewMode>("run");
  const [resetCameraKey, setResetCameraKey] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [replay, setReplay] = useState<null | { expectedField: string | null;
    issues: string[]; status: "pending" | "identical" | "different" | "not-exact" | "rejected"; scenarioId: string }>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [rerunKey, setRerunKey] = useState(0);
  const [fieldHash, setFieldHash] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState<string | null>(null);
  useEffect(() => {
    if (!requestedAnchor) return;
    setAnchorChoice(requestedAnchor.id);
    setNotice(`Reference experiment set to ${requestedAnchor.id}.`);
  }, [requestedAnchor]);
  const conditions = useMemo(() => ({ oxygen, pressure, flow, gravityG: gravityOf(gravity).g }), [oxygen, pressure, flow, gravity]);
  const grid = useMemo(() => buildGrid(zones, conditions), [zones, conditions]);
  // The propagating material of the liner is SIBAL; the anchor is the trial the run is conditioned on.
  const scenario = useMemo(() => ({ material: "SIBAL", ...conditions }), [conditions]);
  const ranked = useMemo(() => rankTrials(registry, scenario), [registry, scenario]);
  const anchor: Trial | undefined = ranked.find((r) => r.trial.id === anchorChoice)?.trial ?? ranked[0]?.trial;
  const anchorKernels = useMemo(() => model ? buildAnchorKernels(model, second, registry) : {}, [model, second, registry]);
  const diffs = useMemo(() => anchor ? compareToTrial(anchor, scenario) : [], [anchor, scenario]);
  const kernel = useMemo(() => model && anchor && anchorKernels[anchor.id] ? scenarioKernel(anchor, anchorKernels, second, scenario, diffs) : null,
    [model, anchor, anchorKernels, second, scenario, diffs]);
  const level: RunLevel = kernel?.level ?? "extrapolation";
  // The fire always starts on fabric: if an edit leaves the ignition on bare wall, move it to the selected item.
  useEffect(() => {
    if (grid.behavior[ignition.row * GRID.cols + ignition.col] === 1 || !pieces.length) return;
    setIgnition(pieceCentre(pieces[Math.min(selectedPiece, pieces.length - 1)]));
  }, [grid, ignition, pieces, selectedPiece]);

  // Ensemble in a worker: recomputed whenever any input changes.
  const workerRef = useRef<Worker | null>(null);
  const jobRef = useRef(0);
  useEffect(() => {
    const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = (event: MessageEvent<{ id: number; result: EnsembleResult }>) => {
      if (event.data.id !== jobRef.current) return;
      setEnsemble(event.data.result);
      setComputing(false);
    };
    return () => worker.terminate();
  }, []);
  useEffect(() => {
    if (!kernel || !workerRef.current) return;
    const timer = window.setTimeout(() => {
      const input: EngineInput = {
        cols: GRID.cols, rows: GRID.rows, behavior: grid.behavior,
        ignition: ignitionMask(ignition.col, ignition.row), kernel: kernel.p, steps: STEPS,
      };
      jobRef.current += 1;
      setComputing(true);
      workerRef.current?.postMessage({ id: jobRef.current, input, seeds: SEEDS });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [kernel, grid, ignition, rerunKey]);

  // Playback in physical time.
  useEffect(() => {
    if (!playing) return;
    let frame = 0, last = performance.now(), acc = 0;
    const tick = (now: number) => {
      acc += ((now - last) / 1000) * speed / CELL.stepSeconds;
      last = now;
      if (acc >= 1) {
        const advance = Math.floor(acc);
        acc -= advance;
        setStep((s) => {
          const next = Math.min(STEPS, s + advance);
          if (next >= STEPS) setPlaying(false);
          return next;
        });
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed]);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const metrics = useMemo(() => ensemble ? computeMetrics(ensemble, grid.zoneIndex, grid.behavior, zones.length, ignition.row) : null, [ensemble, grid, zones.length, ignition.row]);
  const areaNow = metrics ? quantiles(metrics.area.map((curve) => curve[step])) : null;
  useEffect(() => {
    let cancelled = false;
    setFieldHash(null);
    if (ensemble) void fieldFingerprint(ensemble).then((h) => { if (!cancelled) setFieldHash(h); });
    return () => { cancelled = true; };
  }, [ensemble]);
  useEffect(() => {
    if (!replay || replay.status !== "pending" || !fieldHash || computing) return;
    // Identical only when the SHA-256 of every realisation's arrival and contact field matches.
    const same = replay.expectedField !== null && replay.expectedField === fieldHash;
    setReplay({ ...replay, status: replay.issues.length ? "not-exact" : same ? "identical" : "different" });
  }, [replay, fieldHash, computing]);

  const currentInputs: ScenarioInputs = useMemo(() => ({
    oxygen, pressure, flow, gravity, pieces, ignition, anchorChoice,
  }), [oxygen, pressure, flow, gravity, pieces, ignition, anchorChoice]);
  function loadInputs(i: ScenarioInputs, name: string | null) {
    setOxygen(i.oxygen); setPressure(i.pressure); setFlow(i.flow); setGravity(i.gravity); setPreset("custom");
    setPieces(i.pieces.map((q) => ({ ...q }))); setSelectedPiece(0);
    setIgnition({ ...i.ignition });
    setAnchorChoice(i.anchorChoice);
    setScenarioName(name);
    setRun(0); setView("run"); restart();
  }

  function applyPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    setPreset(id); setOxygen(p.oxygen); setPressure(p.pressure); setFlow(p.flow); setGravity(p.gravity);
    restart();
  }
  function restart() { setStep(0); setPlaying(false); }
  function updatePiece(index: number, patch: Partial<Piece>) {
    setPieces((current) => current.map((q, i) => i === index ? { ...q, ...patch } : q));
    setSelectedPiece(index);
    restart();
  }
  function addPiece(kind: PieceKind) {
    if (pieces.length >= MAX_PIECES) return;
    const k = PIECE_KINDS[kind];
    const piece: Piece = { id: `p${Date.now().toString(36)}`, kind, col: 250, row: Math.round(GRID.rows * 0.55), lengthMm: k.lengthMm, widthMm: k.widthMm };
    setPieces((current) => [...current, piece]);
    setSelectedPiece(pieces.length);
    restart();
  }
  function removePiece(index: number) {
    if (pieces.length <= 1) return;
    setPieces((current) => current.filter((_, i) => i !== index));
    setSelectedPiece(0);
    restart();
  }
  function ignite(col: number, row: number) {
    const i = row * GRID.cols + col;
    if (grid.behavior[i] !== 1) { setNotice("Click a fabric item to start the fire there."); return; }
    const z = grid.zoneIndex[i];
    setIgnition({ col, row });
    setSelectedPiece(Math.max(0, z - 1));
    setStep(0);
    setPlaying(true);
    setNotice(`Fire started on ${zones[z].name.replace(/^\d+ · /, "").toLowerCase()}.`);
  }

  function runAtTrialConditions() {
    if (!anchor) return;
    const c = anchor.conditions;
    setOxygen(c.oxygenPct ?? (c.oxygenRangePct ? (c.oxygenRangePct[0] + c.oxygenRangePct[1]) / 2 : 21.5));
    if (c.pressureKpa !== null) setPressure(c.pressureKpa);
    setFlow(c.flowCmS ?? 20);
    setGravity("orbit");
    setPreset("custom");
    setAnchorChoice(anchor.id);
    restart();
    setNotice(`Conditions from ${anchor.campaign} ${anchor.sample}.${c.pressureKpa === null ? " Pressure not tabulated in the trial: the pressure control is neither used by the model nor attributed to the trial." : ""}`);
  }
  async function importScenario(file: File) {
    let data: Record<string, unknown>;
    try { data = JSON.parse(await file.text()); } catch { setNotice("Invalid file: not JSON."); return; }
    if (data.exportSchemaVersion !== 2 || data.mode !== "lunar-habitat-surface-spread") {
      setNotice("File is not a HabitatFire habitat export (version 2)."); return;
    }
    const issues: string[] = [];
    if (data.codeVersion !== __APP_COMMIT__) issues.push(`code ${String(data.codeVersion)} ≠ ${__APP_COMMIT__}`);
    for (const art of (data.artifacts as Loaded[] | undefined) ?? []) {
      const now = loaded.find((x) => x.path === art.path);
      if (!now) issues.push(`${art.path} not loaded`);
      else if (now.sha256 !== art.sha256) issues.push(`${art.path}: different bytes (sha256)`);
    }
    const inputs = data.scenarioInputs as ScenarioInputs | undefined;
    const problems = validateInputs(inputs);
    const expectedField = (data.results as { arrivalFieldSha256?: unknown } | null)?.arrivalFieldSha256;
    if (problems.length || typeof expectedField !== "string" || !/^[0-9a-f]{64}$/.test(expectedField)) {
      setReplay({ expectedField: null, status: "rejected", scenarioId: String(data.scenarioId ?? "?"),
        issues: [...problems, ...(typeof expectedField === "string" ? [] : ["missing arrival-field fingerprint"])] });
      return;
    }
    if (inputs!.anchorChoice !== "auto" && !registry.trials.some((t) => t.id === inputs!.anchorChoice)) issues.push(`trial ${inputs!.anchorChoice} missing from registry`);
    loadInputs(inputs!, null);
    setEnsemble(null); setRerunKey((k) => k + 1);
    setReplay({ expectedField, issues, status: "pending", scenarioId: String(data.scenarioId) });
  }

  async function exportScenario() {
    if (!fieldHash) { setNotice("Wait for the calculation to finish before exporting."); return; }
    const inputs = { conditions: { oxygenPct: oxygen, pressureKpa: pressure, flowCmS: flow, gravity, gravityG: conditions.gravityG },
      pieces, zones: zones.map((z) => ({ id: z.id, name: z.name, material: z.material, cols: z.cols, rows: z.rows })), ignition, anchorTrialId: anchor?.id ?? null, seeds: SEEDS };
    const payload = {
      exportSchemaVersion: 2,
      scenarioId: (await sha256(JSON.stringify(inputs))).slice(0, 16),
      product: "HabitatFire", mode: "lunar-habitat-surface-spread", codeVersion: __APP_COMMIT__, exportedAt: new Date().toISOString(),
      scientificMode: { level, label: LEVEL_LABEL[level],
        meaning: "Result on the habitat wall: exploratory at best (geometry differs from the test specimen). Only the test-specimen simulation is conditioned on the trial." },
      gate: { anchorTrialId: anchor?.id ?? null, conditionDiffs: diffs,
        rule: "Matches only the nominal value or documented range; untabulated conditions remain unknown (ACCEPTANCE_CRITERIA §C)." },
      requestedConditions: inputs.conditions,
      scenarioInputs: currentInputs,
      trialConditions: anchor?.conditions ?? null, trialConditionSources: anchor?.conditionSources ?? [], trialConflicts: anchor?.conflicts ?? [],
      observed: anchor?.observables ?? [],
      geometry: { liner: { lengthM: 4.0, arcM: 5.02, cols: GRID.cols, rows: GRID.rows, cellMm: [CELL.alongMm, CELL.acrossMm] },
        connectivity: "upstream + lateral strips; fire crosses only between touching fabric cells", fabric: REFERENCE_FABRIC },
      ignition: { ...ignition, widthMm: 400, note: "Imposed 40 cm ignition line, clipped to the fabric item." },
      algorithm: { engine: "stochastic frontier automaton (src/habitat/engine.ts)", stepSeconds: CELL.stepSeconds, horizonSteps: STEPS,
        rng: "32-bit LCG (a=1664525, c=1013904223), one seed per realization", seeds: SEEDS },
      kernel: kernel && anchor ? { scenarioProbabilities2s: kernel.p, flowRule: kernel.flowRule, quench: kernel.quench,
        anchor: anchorKernels[anchor.id], fallbacks: anchorKernels[anchor.id]?.borrowed ?? [] } : null,
      crossTrial: second ? { beta: second.comparisonWithSaffireI.beta, prediction: second.prediction } : null,
      artifacts: loaded, registry: { generatedBy: registry.generatedBy, sha256: loaded.find((x) => x.path.endsWith("trial-registry.json"))?.sha256 ?? null },
      uncertainty: {
        observational: "not quantified in the app (registration, segmentation, cameras)",
        parameters: "not propagated (fixed intensity factor and exponent)",
        betweenTrials: "two concurrent-flow trials for flow dependence; one point per atmosphere",
        seedSpread: "variability of the model itself with fixed parameters, not experimental uncertainty",
      },
      results: metrics ? { frontSpeedMmS: metrics.speedMmS, areaAtEndM2: quantiles(metrics.area.map((c) => c[STEPS])),
        arrivalFieldSha256: fieldHash, fieldHashCovers: "arrival and contact for all realizations (Int16, seed order)" } : null,
      reproduction: "Importing this file restores scenarioInputs, checks the commit and artifact sha256 values, recalculates, and compares the sha256 of the entire arrival field.",
      limitations: [
        "Surface spread; neither CFD nor volumetric combustion.",
        "No O₂, pressure, or gravity correction beyond the reference trial.",
        "Fabric items share the reference sample's material and thickness; wall panels are non-combustible.",
      ],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "habitatfire-lunar-habitat.json"; a.click();
    URL.revokeObjectURL(url);
  }

  const time = step * CELL.stepSeconds;
  const gravityEnv = gravityOf(gravity);
  const activePreset = PRESETS.find((p) => p.id === preset);
  const site: Site = gravity === "orbit" ? "orbit" : "surface";
  const siteInfo = SITES.find((x) => x.id === site)!;
  const reference = anchor ? `${anchor.campaign} ${anchor.sample}` : "SAFFIRE";
  const fabricLabel = englishText(anchor?.material ?? REFERENCE_FABRIC.material);
  const fabricName = MATERIAL_INFO[fabricLabel as keyof typeof MATERIAL_INFO]?.label ?? fabricLabel;
  const fabricThickness = anchor ? anchor.thicknessMm : REFERENCE_FABRIC.thicknessMm;
  const sample = anchor?.geometry.lengthMm && anchor.geometry.widthMm ? `${anchor.geometry.lengthMm / 1000} × ${anchor.geometry.widthMm / 1000} m` : null;
  const anchorO2 = anchor ? anchor.conditions.oxygenPct ?? (anchor.conditions.oxygenRangePct ? (anchor.conditions.oxygenRangePct[0] + anchor.conditions.oxygenRangePct[1]) / 2 : null) : null;

  return (
    <main className="workbench habitat-workbench">
      <aside className="scenario-panel" aria-label="Configure habitat">
        <div className="panel-title">
          <Settings2 size={15} />
          <h2>Your module</h2>
          <span className="tiny-tag">{gravityEnv.short}</span>
        </div>
        <section className="control-section">{modeSwitch}</section>
        <section className="control-section">
          <div className="step-label"><span>01</span><h3>Environment</h3><Wind size={14} /></div>
          <div className="site-select" role="group" aria-label="Where">
            {SITES.map((x) => (
              <button key={x.id} type="button" aria-pressed={site === x.id}
                onClick={() => { if (site !== x.id) applyPreset(PRESETS.find((p) => p.site === x.id)!.id); }}>{x.label}</button>
            ))}
          </div>
          <label className="preset-select">
            <select aria-label="Atmosphere preset" value={preset} onChange={(e) => applyPreset(e.target.value)}>
              <option value="custom" disabled>Custom conditions</option>
              {PRESETS.filter((p) => p.site === site).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <p className="preset-note">{activePreset ? activePreset.note : `${num(oxygen)}% O₂ at ${num(pressure)} kPa · ${gravityEnv.label} · ${num(flow)} cm/s ventilation.`}</p>
          <details className="advanced-conditions">
            <summary>Adjust atmosphere and gravity</summary>
            <div className="gravity-select" role="group" aria-label="Gravity">
              {GRAVITY_ENVIRONMENTS.map((env) => (
                <button key={env.id} type="button" aria-pressed={gravity === env.id}
                  onClick={() => { setGravity(env.id); setPreset("custom"); restart(); }}>
                  {env.label}<small>{env.short}</small>
                </button>
              ))}
            </div>
            <Range label="Oxygen" unit="%" value={oxygen} min={15} max={40} step={0.1} onChange={(v) => { setOxygen(v); setPreset("custom"); restart(); }} />
            <Range label="Pressure" unit="kPa" value={pressure} min={35} max={110} step={0.1} onChange={(v) => { setPressure(v); setPreset("custom"); restart(); }} />
            <Range label="Ventilation along the module" unit="cm/s" value={flow} min={0} max={40} step={0.5} onChange={(v) => { setFlow(v); setPreset("custom"); restart(); }} />
            <div className="partial-pressure"><span>O₂ partial pressure</span><strong>{num((pressure * oxygen) / 100)} <small>kPa</small></strong></div>
          </details>
        </section>
        <section className="control-section">
          <div className="step-label"><span>02</span><h3>Fabric items</h3><span className="piece-count">{pieces.length}/{MAX_PIECES}</span></div>
          <div className="piece-list">
            {pieces.map((piece, i) => (
              <PieceEditor key={piece.id} piece={piece} index={i} open={i === selectedPiece} canRemove={pieces.length > 1}
                onSelect={() => setSelectedPiece(i)} onChange={(patch) => updatePiece(i, patch)} onRemove={() => removePiece(i)} />
            ))}
          </div>
          {pieces.length < MAX_PIECES && (
            <div className="piece-add">
              <Plus size={13} />
              {(Object.keys(PIECE_KINDS) as PieceKind[]).map((k) => <button key={k} type="button" onClick={() => addPiece(k)}>{PIECE_KINDS[k].label}</button>)}
            </div>
          )}
          <p className="microcopy">Fabric: {fabricName}{fabricThickness ? `, ${fabricThickness} mm` : ""}, the material NASA burned in {reference}. Wall panels do not burn; fire passes between items only where they touch.</p>
        </section>
        <section className="control-section">
          <div className="step-label"><span>03</span><h3>Start the fire</h3><MousePointer2 size={14} /></div>
          <p className="preset-note">Click any fabric item in the scene. The fire starts from a 40 cm line, like the igniter wire in the NASA experiment.</p>
        </section>
      </aside>

      <div className="visualization-column">
        <div className="scene-container habitat-scene">
          <div className="scene-topbar">
            <div className="scene-title"><i className="dot amber" /><span>{siteInfo.title} · 6.4 × Ø4 M MODULE</span></div>
            <button className="scene-scale model-chip" onClick={() => setShowModel(true)} title="Model & evidence">
              EXPLORATORY · NASA {reference.toUpperCase()} <BookOpen size={11} />
            </button>
          </div>
          <div className="scene-canvas">
            <SceneBoundary>
              <Suspense fallback={<div className="scene-loading"><LoaderCircle size={24} className="spin" /><span>Assembling the module…</span></div>}>
                {model ? (
                  <HabitatScene material={grid.material} behavior={grid.behavior} ensemble={ensemble} step={step} run={run}
                    view={view} ignition={ignition} flow={flow} gravityG={conditions.gravityG} onIgnite={ignite} resetCameraKey={resetCameraKey} site={site} />
                ) : <div className="scene-fallback" role="status"><p>{error ?? "Loading the model…"}</p></div>}
              </Suspense>
            </SceneBoundary>
          </div>
          <div className="scene-left-tools">
            <button className="tool-button" title="Reset camera" aria-label="Reset camera" onClick={() => setResetCameraKey((k) => k + 1)}><RotateCcw size={16} /></button>
          </div>
          <div className="scene-overlay-controls view-toggle" role="group" aria-label="View mode">
            <button className={view === "run" ? "active" : ""} onClick={() => setView("run")}>One realization</button>
            <button className={view === "probability" ? "active" : ""} onClick={() => setView("probability")}>Probability ({SEED_COUNT})</button>
          </div>
          {notice && <div className="habitat-notice" role="status">{notice}</div>}
          {computing && <div className="habitat-computing"><LoaderCircle size={12} className="spin" /> simulating {SEED_COUNT} realizations</div>}
          <div className="scene-bottom">
            <div className="scene-legend habitat-legend">
              {view === "run" ? <>
                <span><i className="lg front" />flame front</span>
                <span><i className="lg char" />burned</span>
              </> : <>
                <span className="prob-ramp"><i /> P(burned by t) 0 → 1</span>
              </>}
              <span><i className="lg fabric" />fabric item</span>
              <span><i className="lg wall" />wall panel</span>
              <span><i className="lg flow" />ventilation</span>
            </div>
          </div>
        </div>

        <section className="playback-panel">
          <div className="playback-header">
            <div>
              <span className="eyebrow">FIRE SPREAD · PHYSICAL TIME{scenarioName ? ` · ${scenarioName.toUpperCase()}` : ""}</span>
              <h2>{view === "run" ? `Realization ${run + 1} of ${SEED_COUNT}` : `Probability over ${SEED_COUNT} realizations`}</h2>
            </div>
            <button className="button secondary model-open" onClick={() => setShowModel(true)}><BookOpen size={13} />Model & evidence</button>
          </div>
          <div className="timeline">
            <button className="play-button" aria-label={playing ? "Pause" : "Play"} disabled={!ensemble}
              onClick={() => { if (step >= STEPS) setStep(0); setPlaying((p) => !p); }}>
              {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
            </button>
            <div className="timeline-track">
              <input type="range" aria-label="Time since ignition" min={0} max={STEPS} step={1} value={step}
                onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }}
                style={{ "--range-progress": `${(step / STEPS) * 100}%` } as React.CSSProperties} />
              <div className="timeline-ticks"><span>0</span><span>5 min</span><span>10 min</span><span>15 min</span><span>20 min</span></div>
            </div>
            <div className="time-readout"><strong>{fmtTime(time)}</strong><span>since ignition · {speed}×</span></div>
            <button className="speed-button" aria-label="Playback speed" onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}>{speed}×</button>
          </div>
          <div className="playback-footer">
            <p>{CELL.alongMm} × {CELL.acrossMm} mm cells and {CELL.stepSeconds} s steps, the grid of the NASA experiment.</p>
            <button className="button secondary" onClick={exportScenario} disabled={!ensemble} title="Conditions, items, ignition, reference experiment, kernel and results">
              <ArrowDownToLine size={14} />Export
            </button>
            <button className="button secondary" onClick={() => importRef.current?.click()} title="Reimport an export and check that the result reproduces">
              <ArrowUpFromLine size={14} />Import
            </button>
            <input ref={importRef} type="file" accept="application/json,.json" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importScenario(f); e.target.value = ""; }} />
            <button className="button primary" disabled={!ensemble} onClick={() => { setRun((r) => (r + 1) % SEED_COUNT); setView("run"); setStep(0); setPlaying(true); }}>
              <Flame size={15} />Another realization<ArrowRight size={15} />
            </button>
          </div>
        </section>
        {model && <Alternatives current={currentInputs} onLoad={(i, name) => { loadInputs(i, name); setNotice(`${name} opened for editing.`); }}
          registry={registry} anchorKernels={anchorKernels} second={second} ready={!!kernel} />}
      </div>

      <aside className="evidence-panel model-panel habitat-panel" aria-label="Results">
        <div className="panel-title"><Flame size={15} /><h2>Results</h2>
          <button className="text-link subtle model-link" onClick={() => setShowModel(true)}>Model & evidence</button></div>
        <div className="model-panel-body">
          {replay && (
            <section className={`replay-card ${replay.status}`} role="status">
              <strong>
                {replay.status === "pending" ? "Replaying the imported scenario…"
                  : replay.status === "identical" ? "Identical replay"
                  : replay.status === "different" ? "Result differs from export"
                  : replay.status === "rejected" ? "File rejected"
                  : "Non-exact replay"}
              </strong>
              <p>Scenario {replay.scenarioId}. {replay.status === "identical" ? "Same code, artifacts and seeds: every realization's arrival field is identical (sha256)."
                : replay.status === "different" ? "Same dependencies, but the recalculated arrival field differs from the export."
                : replay.status === "not-exact" ? "State restored; dependencies differ, so the result is not compared byte for byte."
                : replay.status === "rejected" ? "Invalid or incomplete inputs: the current scenario was not changed."
                : "Waiting for the realizations to finish."}</p>
              {replay.issues.length > 0 && <ul>{replay.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
              <button className="text-link subtle" onClick={() => setReplay(null)}>Close</button>
            </section>
          )}
          <section className="habitat-kpis">
            <div>
              <span>Area burned at {fmtTime(time)}</span>
              <strong>{areaNow ? num(areaNow.median, 2) : "—"} <small>m²</small></strong>
              <em>{areaNow ? `${num(areaNow.min, 2)}–${num(areaNow.max, 2)} m² across ${SEED_COUNT} realizations` : "simulating…"}</em>
            </div>
            <div>
              <span>Front speed</span>
              <strong>{metrics ? num(metrics.speedMmS, 2) : "—"} <small>mm/s</small></strong>
              <em>median along the ventilation</em>
            </div>
          </section>
          {metrics && <AreaChart curves={metrics.area} step={step} />}

          <section>
            <h3 className="model-h">Which items catch fire</h3>
            <ul className="reach-list">
              {zones.slice(1).map((zone, k) => {
                const events = metrics?.zoneEvents[k + 1] ?? [];
                const happened = events.filter((e) => e >= 0 && e <= step).length;
                const all = events.filter((e) => e >= 0).map((e) => e * CELL.stepSeconds).sort((a, b) => a - b);
                return (
                  <li key={zone.id} className={`ok${k === selectedPiece ? " on" : ""}`} onClick={() => setSelectedPiece(k)}>
                    <span className="reach-zone">{zone.name}<small>{zone.hint}</small></span>
                    <span className="reach-value">
                      <strong>{num((happened / SEED_COUNT) * 100, 0)}%</strong>
                      <small>{all.length ? `catches fire at ${fmtTime(all[all.length >> 1])} (median)` : `not reached in ${DURATION_S / 60} min`}</small>
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="model-caption">Share of the {SEED_COUNT} realizations in which the item is burning at the current time.</p>
          </section>

          <button className="button secondary calibration-link" onClick={() => setShowModel(true)}>
            Where this comes from: NASA {reference} <ArrowRight size={14} />
          </button>
        </div>
      </aside>

      {showModel && (
        <div className="modal-backdrop" role="presentation" onClick={() => setShowModel(false)}>
          <div className="modal model-evidence" role="dialog" aria-modal="true" aria-label="Model and evidence" onClick={(e) => e.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <span className="eyebrow">MODEL & EVIDENCE</span>
                <h2>From the NASA experiment to your module</h2>
              </div>
              <button className="icon-button" aria-label="Close" onClick={() => setShowModel(false)}><X size={16} /></button>
            </div>
            <ol className="origin-steps">
              <li><b>Observed</b><span>NASA {reference}: a {sample ? `${sample} ` : ""}sample of {fabricName}{fabricThickness ? ` (${fabricThickness} mm)` : ""} burned in orbit{anchorO2 ? ` at ${num(anchorO2)}% O₂` : ""}{anchor?.conditions.pressureKpa ? ` and ${num(anchor.conditions.pressureKpa)} kPa` : ""}{anchor?.conditions.flowCmS ? `, ${num(anchor.conditions.flowCmS)} cm/s flow` : ""}.</span></li>
              <li><b>Model on the sample</b><span>A stochastic neighbourhood rule from the SAFFIRE flight images, tuned to this trial's measured spread rate, reproduces the front on the original sample.</span>
                <button className="text-link" onClick={() => { setShowModel(false); onOpenCalibration(); }}>Open the NASA trial replays <ArrowRight size={12} /></button></li>
              <li><b>Applied to your layout</b><span>The same rule runs on your {pieces.length} fabric item{pieces.length === 1 ? "" : "s"} ({pieces.map((q) => `${(q.lengthMm / 1000).toFixed(1)} × ${(q.widthMm / 1000).toFixed(1)} m`).join(", ")}) on the module wall.</span></li>
            </ol>
            {anchor && <ModelInUse anchor={anchor} level={level} diffs={diffs} kernel={anchorKernels[anchor.id]}
              flowRule={kernel?.flowRule ?? ""} scenarioSpeed={metrics?.speedMmS ?? null} onRunTrial={() => { runAtTrialConditions(); setShowModel(false); }} />}
            <TrialList ranked={ranked} selected={anchor?.id ?? null} auto={anchorChoice === "auto"}
              onSelect={(id: string) => { setAnchorChoice(id); restart(); }} registrySource={registry.generatedBy} />
            {second && <CrossTrial second={second} />}
            {gravity !== "orbit" && (
              <div className="gravity-callout" role="note">
                <AlertTriangle size={15} />
                <div>
                  <strong>{gravityEnv.label}: partial gravity</strong>
                  <p>Buoyancy adds flow in partial gravity, and centrifuge tests show the effect depends on the material (SIBAL burns downward at 1/6 g and extinguishes at 1 g). The rule is applied without a gravity correction; FM² will measure flammability on the Moon.</p>
                  <span className="gravity-links">
                    <a href={PARTIAL_GRAVITY_SOURCES.fm2} target="_blank" rel="noreferrer">FM² · NASA</a>
                    <a href={PARTIAL_GRAVITY_SOURCES.luci} target="_blank" rel="noreferrer">LUCI · NTRS</a>
                    <a href="https://ntrs.nasa.gov/api/citations/20250002114/downloads/ICES_2025-392-correctedcaptions.pdf" target="_blank" rel="noreferrer">ICES-2025-392</a>
                  </span>
                </div>
              </div>
            )}
            <details className="assumptions-details">
              <summary>Assumptions</summary>
              <ul className="assumptions">
                <li>{anchor && anchorKernels[anchor.id] ? anchorKernels[anchor.id].description : "SAFFIRE I neighbourhood rule."} Original 10 × 20 mm grid and 2 s step.</li>
                <li>{kernel?.flowRule}</li>
                <li>O₂, pressure and gravity choose the reference experiment; they do not rescale the rule.</li>
                <li>Every item uses the reference fabric and thickness; wall panels are non-combustible and fire crosses only between touching items.</li>
                <li>Surface spread only: no smoke, heat release, detection or suppression. The spread across realizations is the model's own variability.</li>
              </ul>
            </details>
          </div>
        </div>
      )}
    </main>
  );
}

function PieceEditor({ piece, index, open, canRemove, onSelect, onChange, onRemove }: {
  piece: Piece; index: number; open: boolean; canRemove: boolean;
  onSelect: () => void; onChange: (patch: Partial<Piece>) => void; onRemove: () => void;
}) {
  const c = pieceCells(piece);
  const maxAlong = (GRID.cols - c.cols) * CELL.alongMm / 1000;
  const maxAround = (GRID.rows - c.rows) * CELL.acrossMm / 1000;
  return (
    <div className={`piece-row${open ? " open" : ""}`}>
      <button type="button" className="piece-head" onClick={onSelect} aria-expanded={open}>
        <span className="zone-swatch" style={{ background: `rgb(${MATERIAL_INFO[REFERENCE_FABRIC.material].color.join(",")})` }} />
        <span className="zone-name">{index + 1} · {PIECE_KINDS[piece.kind].label}<small>{(piece.lengthMm / 1000).toFixed(2)} × {(piece.widthMm / 1000).toFixed(2)} m · {((c.cols * c.rows * CELL.alongMm * CELL.acrossMm) / 1e6).toFixed(2)} m²</small></span>
        {canRemove && <span role="button" tabIndex={0} className="piece-remove" aria-label={`Remove item ${index + 1}`}
          onClick={(e) => { e.stopPropagation(); onRemove(); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onRemove(); } }}><Trash2 size={12} /></span>}
      </button>
      {open && (
        <div className="piece-body">
          <Range label="Length along the module" unit="m" value={piece.lengthMm / 1000} min={PIECE_LIMITS.lengthMm[0] / 1000} max={PIECE_LIMITS.lengthMm[1] / 1000} step={0.05}
            onChange={(v) => onChange({ lengthMm: Math.round(v * 1000) })} />
          <Range label="Height on the wall" unit="m" value={piece.widthMm / 1000} min={PIECE_LIMITS.widthMm[0] / 1000} max={Math.floor(PIECE_LIMITS.widthMm[1] / 100) / 10} step={0.05}
            onChange={(v) => onChange({ widthMm: Math.round(v * 1000) })} />
          <Range label="Position along the module" unit="m" value={(c.col * CELL.alongMm) / 1000} min={0} max={Math.max(0.01, maxAlong)} step={0.05}
            onChange={(v) => onChange({ col: Math.round((v * 1000) / CELL.alongMm) })} />
          <Range label="Position up the wall" unit="m" value={(c.row * CELL.acrossMm) / 1000} min={0} max={Math.max(0.01, maxAround)} step={0.05}
            onChange={(v) => onChange({ row: Math.round((v * 1000) / CELL.acrossMm) })} />
        </div>
      )}
    </div>
  );
}

function Range({ label, unit, value, min, max, step, onChange }: { label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="range-control">
      <span className="range-heading"><span>{label}</span><span className="range-value">{num(value)}<small>{unit}</small></span></span>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--range-progress": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties} />
      <span className="range-bounds"><span>{min} {unit}</span><span>{max} {unit}</span></span>
    </label>
  );
}

/** Out-of-trial check: the SAFFIRE-I kernel predicting SAFFIRE-III (25 cm/s) without refitting. */
function CrossTrial({ second }: { second: CrossTrial }) {
  const observed = second.observed.speedMmS;
  const rows = [
    { label: "SAFFIRE I, unscaled", value: second.prediction.unscaledSpeedMmS },
    { label: "SAFFIRE I, linear scaling", value: second.prediction.linearFlowSpeedMmS },
    { label: "Observed in SAFFIRE III", value: observed, observed: true },
  ];
  const max = Math.max(...rows.map((r) => r.value)) * 1.08;
  return (
    <section className="cross-trial">
      <h3 className="model-h">Cross-trial comparison <span className="model-badge">retrospective</span></h3>
      <p className="model-caption">The original SAFFIRE I kernel (20 cm/s), without III data, predicted front speed in SAFFIRE III (25 cm/s, same fabric). III was later included in habitat calibration, so this comparison is not an external test of the final model.</p>
      <div className="ct-bars">
        {rows.map((row) => (
          <div key={row.label} className={`ct-row ${row.observed ? "observed" : ""}`}>
            <span>{row.label}</span>
            <i><b style={{ width: `${(row.value / max) * 100}%` }} /></i>
            <strong>{num(row.value, 2)} <small>mm/s</small>{!row.observed && <em>{row.value > observed ? "+" : ""}{num(((row.value - observed) / observed) * 100, 0)}%</em>}</strong>
          </div>
        ))}
      </div>
      <p className="model-caption">
        Measured: {num(second.comparisonWithSaffireI.saffireIObservedSpeedMmS, 2)} mm/s at 20 cm/s and {num(observed, 2)} mm/s at 25 cm/s (iid OLS standard error {num(second.observed.standardErrorMmS, 3)}, ignores autocorrelation) (camera 1; 2.43 mm/s with both cameras),
        v ∝ u<sup>{num(second.comparisonWithSaffireI.beta, 2)}</sup>. The simulation uses this exponent, not the linear hypothesis. Two trials do not determine the curve shape; thickness (0.33 × 0.37 mm) and O₂ (21.2 × 21.6%) are not identical; the PSI table lists 30 cm/s, the team's paper 25 cm/s.
      </p>
    </section>
  );
}

function AreaChart({ curves, step }: { curves: Float32Array[]; step: number }) {
  const W = 300, H = 120, L = 30, R = 6, T = 8, B = 18;
  const steps = curves[0].length - 1;
  const stride = Math.max(1, Math.floor(steps / 120));
  const points: { t: number; min: number; med: number; max: number }[] = [];
  let yMax = 0.05;
  for (let t = 0; t <= steps; t += stride) {
    const q = quantiles(curves.map((c) => c[t]));
    points.push({ t, min: q.min, med: q.median, max: q.max });
    yMax = Math.max(yMax, q.max);
  }
  const x = (t: number) => L + (t / steps) * (W - L - R);
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const band = `M${points.map((p) => `${x(p.t)},${y(p.max)}`).join("L")}L${[...points].reverse().map((p) => `${x(p.t)},${y(p.min)}`).join("L")}Z`;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.t)},${y(p.med)}`).join("");
  return (
    <svg className="front-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Area reached over time, median and range across realizations">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(yMax * f)} y2={y(yMax * f)} className="fc-grid" /><text x={L - 4} y={y(yMax * f) + 3} className="fc-tick" textAnchor="end">{num(yMax * f, 1)}</text></g>)}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => <text key={f} x={x(steps * f)} y={H - 5} className="fc-tick" textAnchor="middle">{num((steps * f * CELL.stepSeconds) / 60, 0)}′</text>)}
      <path d={band} className="fc-band" />
      <path d={line} className="fc-sim" />
      <line x1={x(step)} x2={x(step)} y1={T} y2={H - B} className="fc-now" />
      <text x={L + 4} y={T + 9} className="fc-label">area reached (m²)</text>
    </svg>
  );
}
