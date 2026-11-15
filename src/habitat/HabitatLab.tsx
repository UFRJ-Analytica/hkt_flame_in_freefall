import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpFromLine, BookOpen, CheckCircle2, CircleSlash, Flame, HelpCircle, Info, LoaderCircle,
  MousePointer2, Pause, Play, RotateCcw, Settings2, Wind,
} from "lucide-react";
import { SceneBoundary } from "../components/SceneBoundary";
import { readSaffireModel, type SaffireModel } from "../saffire";
import { GRAVITY_ENVIRONMENTS, gravityOf, PARTIAL_GRAVITY_SOURCES, type GravityId } from "../model/domain";
import type { EnsembleResult, EngineInput } from "./engine";
import {
  buildGrid, CELL, DEFAULT_ZONES, GRID, ignitionMask, MATERIAL_IDS, MATERIAL_INFO,
  materialRule, type MaterialId, type Tier, type Zone,
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

const PRESETS: { id: string; label: string; note: string; oxygen: number; pressure: number; flow: number; gravity: GravityId }[] = [
  { id: "lunar", label: "Lunar habitat · exploration atmosphere", note: "56.5 kPa (8.2 psia) and 34% O₂, the atmosphere studied by NASA to shorten EVA prebreathe. Hypothetical ventilation.", oxygen: 34, pressure: 56.5, flow: 10, gravity: "moon" },
  { id: "saffire", label: "SAFFIRE I test conditions", note: "21.6% O₂, ~1 atm, 20 cm/s, microgravity: the only calibrated point.", oxygen: 21.6, pressure: 101.3, flow: 20, gravity: "orbit" },
  { id: "station", label: "Orbital station · nominal air", note: "21% O₂, 101.3 kPa, typical cabin ventilation (hypothetical).", oxygen: 21, pressure: 101.3, flow: 10, gravity: "orbit" },
];

const TIER_STYLE: Record<Tier, { label: string; className: string }> = {
  calibrated: { label: "Calibrated", className: "ok" },
  exploratory: { label: "Exploratory", className: "warn" },
  "measured-no-spread": { label: "Measured no spread", className: "measured" },
  unknown: { label: "No evidence", className: "unknown" },
  inert: { label: "Inert (assumption)", className: "inert" },
};

const num = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });
const fmtTime = (s: number) => s < 60 ? `${num(s, 0)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`;

const LEVEL_STYLE: Record<RunLevel, string> = { "trial-conditions": "neutral", interpolated: "neutral", extrapolation: "warn" };

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
  const [zones, setZones] = useState<Zone[]>(DEFAULT_ZONES);
  const [ignition, setIgnition] = useState({ col: 150, row: Math.round(GRID.rows * 0.27) });
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
    setNotice(`Reference trial selected in the workbench: ${requestedAnchor.id}. Use “Run at trial conditions” to reproduce its conditions.`);
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
    oxygen, pressure, flow, gravity, zones: zones.map((z) => ({ id: z.id, material: z.material })), ignition, anchorChoice,
  }), [oxygen, pressure, flow, gravity, zones, ignition, anchorChoice]);
  function loadInputs(i: ScenarioInputs, name: string | null) {
    setOxygen(i.oxygen); setPressure(i.pressure); setFlow(i.flow); setGravity(i.gravity); setPreset("custom");
    setZones(DEFAULT_ZONES.map((z) => ({ ...z, material: i.zones.find((x) => x.id === z.id)?.material ?? z.material })));
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
  function changeZone(index: number, material: MaterialId) {
    setZones((current) => current.map((zone, i) => i === index ? { ...zone, material } : zone));
    restart();
  }
  function ignite(col: number, row: number) {
    const zone = zones[grid.zoneIndex[row * GRID.cols + col]];
    if (materialRule(zone.material, conditions).behavior !== 1) {
      setNotice(`${zone.name}: ${MATERIAL_INFO[zone.material].label} does not propagate in the model under these conditions. Ignition can only be imposed on a propagating material.`);
      return;
    }
    setIgnition({ col, row });
    setStep(0);
    setPlaying(true);
    setNotice(`Ignition imposed on ${zone.name.toLowerCase()}. Ignition is not predicted; the model propagates from it.`);
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
    if (data.exportSchemaVersion !== 1 || data.mode !== "lunar-habitat-surface-spread") {
      setNotice("File is not a lunar habitat export (exportSchemaVersion 1)."); return;
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
      zones: zones.map((z) => ({ id: z.id, material: z.material, cols: z.cols, rows: z.rows })), ignition, anchorTrialId: anchor?.id ?? null, seeds: SEEDS };
    const payload = {
      exportSchemaVersion: 1,
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
        connectivity: "upstream + lateral strips; no radiation between separate surfaces", thicknessMm: null },
      zones: zones.map((z) => ({ ...z, rule: materialRule(z.material, conditions) })),
      ignition: { ...ignition, widthMm: 400, note: "Imposed ignition; ignition is not predicted. Only cells of propagating material are lit." },
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
        "Contact with a material that does not propagate in the model is not a demonstrated barrier.",
      ],
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = "habitatfire-lunar-habitat.json"; a.click();
    URL.revokeObjectURL(url);
  }

  const time = step * CELL.stepSeconds;
  const tiers = zones.map((zone) => ({ zone, rule: materialRule(zone.material, conditions) }));
  const gravityEnv = gravityOf(gravity);

  return (
    <main className="workbench habitat-workbench">
      <aside className="scenario-panel" aria-label="Configure habitat">
        <div className="panel-title">
          <Settings2 size={15} />
          <h2>Your habitat</h2>
          <span className="tiny-tag">{gravityEnv.short}</span>
        </div>
        <section className="control-section">{modeSwitch}</section>
        <section className="control-section">
          <div className="step-label"><span>01</span><h3>Atmosphere and gravity</h3><Wind size={14} /></div>
          <label className="preset-select">
            <select aria-label="Environment preset" value={preset} onChange={(e) => applyPreset(e.target.value)}>
              <option value="custom" disabled>Custom conditions</option>
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {PRESETS.find((p) => p.id === preset) && <p className="preset-note">{PRESETS.find((p) => p.id === preset)!.note}</p>}
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
          <div className="control-physics" role="note">
            <p><b>O₂, pressure, and gravity</b> select the reference trial and classify extrapolation; the engine has no validated physical correction for them.</p>
            <p><b>Ventilation</b> has a modeled response: interpolation between SAFFIRE I and III and a measured exponent outside that range.</p>
            <p><b>Materials</b> follow evidence-based rules; material without data stops the front but is not a proven barrier.</p>
            <p><b>Flame and smoke</b> in the scene are illustrative; appearance changes with gravity without changing the calculation.</p>
          </div>
        </section>
        <section className="control-section">
          <div className="step-label"><span>02</span><h3>Materials by zone</h3></div>
          <div className="zone-list">
            {zones.map((zone, i) => {
              const rule = tiers[i].rule;
              return (
                <label key={zone.id} className="zone-row">
                  <span className="zone-swatch" style={{ background: `rgb(${MATERIAL_INFO[zone.material].color.join(",")})` }} />
                  <span className="zone-name">{zone.name}<small>{zone.hint}</small></span>
                  <select aria-label={`Material for ${zone.name}`} value={zone.material} onChange={(e) => changeZone(i, e.target.value as MaterialId)}>
                    {MATERIAL_IDS.map((m) => <option key={m} value={m}>{MATERIAL_INFO[m].label}</option>)}
                  </select>
                  <i className={`tier-dot ${TIER_STYLE[rule.tier].className}`} title={`${TIER_STYLE[rule.tier].label}: ${rule.evidence}`} />
                </label>
              );
            })}
          </div>
          <p className="microcopy">Layout and materials are editable design assumptions, not a real habitat.</p>
        </section>
        <section className="control-section">
          <div className="step-label"><span>03</span><h3>Ignition location</h3><MousePointer2 size={14} /></div>
          <p className="preset-note">Click any wall in the scene. Ignition is a 40 cm line, like the SAFFIRE I igniter wire.</p>
        </section>
      </aside>

      <div className="visualization-column">
        <div className="scene-container habitat-scene">
          <div className="scene-topbar">
            <div className="scene-title"><i className="dot amber" /><span>SURFACE HABITAT · 6.4 × Ø4 M MODULE</span></div>
            <span className="scene-scale">3D · {gravityEnv.label.toUpperCase()} {gravityEnv.short} · {LEVEL_LABEL[level].toUpperCase()}{anchor ? ` · ${anchor.campaign} ${anchor.sample}` : ""}</span>
          </div>
          <div className="scene-canvas">
            <SceneBoundary>
              <Suspense fallback={<div className="scene-loading"><LoaderCircle size={24} className="spin" /><span>Assembling the module…</span></div>}>
                {model ? (
                  <HabitatScene material={grid.material} behavior={grid.behavior} ensemble={ensemble} step={step} run={run}
                    view={view} ignition={ignition} flow={flow} gravityG={conditions.gravityG} onIgnite={ignite} resetCameraKey={resetCameraKey} />
                ) : <div className="scene-fallback" role="status"><p>{error ?? "Loading the calibrated model…"}</p></div>}
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
          {computing && <div className="habitat-computing"><LoaderCircle size={12} className="spin" /> calculating {SEED_COUNT} realizations</div>}
          <div className="scene-bottom">
            <div className="scene-legend habitat-legend">
              {view === "run" ? <>
                <span><i className="lg front" />front</span>
                <span><i className="lg char" />reached</span>
              </> : <>
                <span className="prob-ramp"><i /> P(reached by t) 0 → 1</span>
              </>}
              <span><i className="lg unknown" />contact without evidence</span>
              <span><i className="lg measured" />contact: no spread in trial</span>
              <span><i className="lg flow" />ventilation</span>
            </div>
          </div>
        </div>

        <section className="playback-panel">
          <div className="playback-header">
            <div>
              <span className="eyebrow">SURFACE SPREAD · PHYSICAL TIME{scenarioName ? ` · ${scenarioName.toUpperCase()}` : ""}</span>
              <h2>{view === "run" ? `Realization ${run + 1} of ${SEED_COUNT}` : `Probability over ${SEED_COUNT} realizations`}</h2>
            </div>
            <span className={`illustrative-pill tier-pill ${LEVEL_STYLE[level]}`}><Info size={12} />{LEVEL_LABEL[level]}</span>
          </div>
          <div className="timeline">
            <button className="play-button" aria-label={playing ? "Pause" : "Play"} disabled={!ensemble}
              onClick={() => { if (step >= STEPS) setStep(0); setPlaying((p) => !p); }}>
              {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
            </button>
            <div className="timeline-track">
              <input type="range" aria-label="Time since imposed ignition" min={0} max={STEPS} step={1} value={step}
                onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }}
                style={{ "--range-progress": `${(step / STEPS) * 100}%` } as React.CSSProperties} />
              <div className="timeline-ticks"><span>0</span><span>5 min</span><span>10 min</span><span>15 min</span><span>20 min</span></div>
            </div>
            <div className="time-readout"><strong>{fmtTime(time)}</strong><span>since ignition · {speed}×</span></div>
            <button className="speed-button" aria-label="Playback speed" onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}>{speed}×</button>
          </div>
          <div className="playback-footer">
            <p><Info size={12} />{CELL.stepSeconds} s steps and {CELL.alongMm} × {CELL.acrossMm} mm cells, the same grid used in calibration.</p>
            <button className="button secondary" onClick={exportScenario} disabled={!ensemble} title="Conditions, zones, ignition, reference trial, kernel, and results">
              <ArrowDownToLine size={14} />Export
            </button>
            <button className="button secondary" onClick={() => importRef.current?.click()} title="Reimport an export and check whether the result is reproduced">
              <ArrowUpFromLine size={14} />Import
            </button>
            <input ref={importRef} type="file" accept="application/json,.json" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void importScenario(f); e.target.value = ""; }} />
            <button className="button primary" disabled={!ensemble} onClick={() => { setRun((r) => (r + 1) % SEED_COUNT); setView("run"); setStep(0); setPlaying(true); }}>
              <Flame size={15} />Another realization<ArrowRight size={15} />
            </button>
          </div>
        </section>
        {model && <Alternatives current={currentInputs} onLoad={(i, name) => { loadInputs(i, name); setNotice(`${name} opened for editing. Use “Update” in the list to save changes.`); }}
          registry={registry} anchorKernels={anchorKernels} second={second} ready={!!kernel} />}
      </div>

      <aside className="evidence-panel model-panel habitat-panel" aria-label="Scientific interpretation">
        <div className="panel-title"><BookOpen size={15} /><h2>Scenario interpretation</h2>
          <span className={`model-badge ${LEVEL_STYLE[level]}`}>{LEVEL_LABEL[level]}</span></div>
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
              <p>Scenario {replay.scenarioId}. {replay.status === "identical" ? "Same code, identical artifact bytes, and the same seeds: the arrival and contact fields for all realizations are identical (sha256)."
                : replay.status === "different" ? "Same dependencies, but the recalculated arrival field differs from the exported field."
                : replay.status === "not-exact" ? "State restored, but dependencies differ; the result is not compared as an exact replay."
                : replay.status === "rejected" ? "Invalid or incomplete inputs: nothing was changed in the current scenario."
                : "Waiting for the realizations to finish calculating."}</p>
              {replay.issues.length > 0 && <ul>{replay.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
              <button className="text-link subtle" onClick={() => setReplay(null)}>Close</button>
            </section>
          )}
          {anchor && <ModelInUse anchor={anchor} level={level} diffs={diffs} kernel={anchorKernels[anchor.id]}
            flowRule={kernel?.flowRule ?? ""} scenarioSpeed={metrics?.speedMmS ?? null} onRunTrial={runAtTrialConditions} />}
          <TrialList ranked={ranked} selected={anchor?.id ?? null} auto={anchorChoice === "auto"}
            onSelect={(id: string) => { setAnchorChoice(id); restart(); }} registrySource={registry.generatedBy} />
          <section className="habitat-kpis">
            <div>
              <span>Area reached at {fmtTime(time)}</span>
              <strong>{areaNow ? num(areaNow.median, 2) : "—"} <small>m²</small></strong>
              <em>{areaNow ? `${num(areaNow.min, 2)}–${num(areaNow.max, 2)} m² across ${SEED_COUNT} realizations` : "calculating…"}</em>
            </div>
            <div>
              <span>Front speed · {LEVEL_LABEL[level].toLowerCase()}</span>
              <strong>{metrics ? num(metrics.speedMmS, 2) : "—"} <small>mm/s</small></strong>
              <em>median across ignition-line strips, as in the trials</em>
            </div>
          </section>
          {metrics && <AreaChart curves={metrics.area} step={step} />}

          {second && <CrossTrial second={second} />}

          <section>
            <h3 className="model-h">How far the fire reaches</h3>
            <ul className="reach-list">
              {zones.map((zone, z) => {
                const events = metrics?.zoneEvents[z] ?? [];
                const happened = events.filter((e) => e >= 0 && e <= step).length;
                const all = events.filter((e) => e >= 0).map((e) => e * CELL.stepSeconds).sort((a, b) => a - b);
                const rule = tiers[z].rule;
                const kind = rule.behavior === 1 ? "chegada" : rule.behavior === 0 ? "" : "contato";
                const kindLabel = kind === "chegada" ? "arrival" : kind === "contato" ? "contact" : "";
                return (
                  <li key={zone.id} className={TIER_STYLE[rule.tier].className}>
                    <span className="reach-zone">{zone.name}<small>{MATERIAL_INFO[zone.material].label}</small></span>
                    {rule.behavior === 0 ? <span className="reach-value muted">inert</span> : (
                      <span className="reach-value">
                        <strong>{num((happened / SEED_COUNT) * 100, 0)}%</strong>
                        <small>{all.length ? `${kindLabel} at ${fmtTime(all[all.length >> 1])} (median)` : `no ${kindLabel} within ${DURATION_S / 60} min`}</small>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="model-caption">Percentage of realizations in which the event has already occurred at the current time. "Contact" means the front reached a material that does not propagate in the model; the simulation stops there.</p>
          </section>

          <section>
            <h3 className="model-h">Evidence by material</h3>
            <ul className="evidence-list">
              {[...new Map(zones.map((z) => [z.material, z])).values()].map((zone) => {
                const base = materialRule(zone.material, conditions);
                const rule = zone.material === "SIBAL" && anchor && anchorKernels[anchor.id]
                  ? { ...base, tier: (level === "extrapolation" ? "exploratory" : "calibrated") as Tier, title: LEVEL_LABEL[level],
                      evidence: `${anchorKernels[anchor.id].description} Reference trial: ${anchor.campaign} ${anchor.sample}.` }
                  : base;
                const Icon = rule.tier === "calibrated" ? CheckCircle2 : rule.tier === "unknown" ? HelpCircle : rule.tier === "inert" ? CircleSlash : AlertTriangle;
                return (
                  <li key={zone.material} className={TIER_STYLE[rule.tier].className}>
                    <Icon size={14} />
                    <div>
                      <strong>{MATERIAL_INFO[zone.material].label} · {rule.title}</strong>
                      <p>{rule.evidence}</p>
                      {rule.bias && <p className="bias">{rule.bias}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {gravity !== "orbit" && (
            <div className="gravity-callout" role="note">
              <AlertTriangle size={15} />
              <div>
                <strong>{gravityEnv.label}: no spread trial in PSI.</strong>
                <p>In partial gravity, buoyancy again induces flow. Centrifuge tests (ICES-2025-392) show a material-dependent effect: some become more flammable than at 1 g (SIBAL burns downward at 1/6 g and extinguishes at 1 g); materials with higher pyrolysis temperatures may become less flammable. There is no universal lunar multiplier; this simulation applies no gravity correction. FM² will measure on the Moon.</p>
                <span className="gravity-links">
                  <a href={PARTIAL_GRAVITY_SOURCES.fm2} target="_blank" rel="noreferrer">FM² · NASA</a>
                  <a href={PARTIAL_GRAVITY_SOURCES.luci} target="_blank" rel="noreferrer">LUCI · NTRS</a>
                  <a href="https://ntrs.nasa.gov/api/citations/20250002114/downloads/ICES_2025-392-correctedcaptions.pdf" target="_blank" rel="noreferrer">ICES-2025-392</a>
                </span>
              </div>
            </div>
          )}

          <section>
            <h3 className="model-h">Model assumptions</h3>
            <ul className="assumptions">
              <li>{anchor && anchorKernels[anchor.id] ? anchorKernels[anchor.id].description : "SAFFIRE I neighborhood rule."} Original 10 × 20 mm grid and 2 s time step.</li>
              <li>{kernel?.flowRule}</li>
              <li>Scenario O₂, pressure, and gravity do not correct the kernel: any difference from the reference trial makes the result an extrapolation.</li>
              <li>Spread occurs downstream of ventilation and laterally. Opposed-flow spread is not included in the habitat (S2 samples under review).</li>
              <li>Adjacent zones of the same material are treated as a continuous sheet; there is no radiative transfer between separate surfaces.</li>
              <li>Does not model smoke, CO, heat release, detection, or suppression. The range across realizations is the model's own variability, not experimental uncertainty.</li>
            </ul>
          </section>

          <button className="button secondary calibration-link" onClick={onOpenCalibration}>
            View calibration on the SAFFIRE I · S1 trial <ArrowRight size={14} />
          </button>
        </div>
      </aside>
    </main>
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
