import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Beaker,
  BookOpen,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Database,
  Expand,
  Flame,
  Focus,
  Info,
  Layers3,
  LoaderCircle,
  MousePointer2,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Thermometer,
  Wind,
  X,
} from "lucide-react";
import {
  ExperimentExplorer,
  SourcesView,
} from "./components/ExperimentExplorer";
import { SceneBoundary } from "./components/SceneBoundary";
import { useNasaData } from "./hooks/useNasaData";
import { useModalFocus } from "./hooks/useModalFocus";
import { ResearchPanel } from "./components/ResearchPanel";
import { ConditionConfirmation } from "./components/research/ConditionConfirmation";
import { useResearch } from "./research/useResearch";
import { applyConditions, CONDITION_FIELDS, initialOrigins, invalidConditions, originLabel } from "./research/provenance";
import type { ConditionOrigins } from "./research/provenance";
import type { ResearchContext } from "./research/types";
import { readOpposedModel, readSaffireII5Model, readSaffireIILocalized, readSaffireModel, saffireIIId, saffireIILocalizedGrid, SAFFIRE_II_BOARD, SAFFIRE_II_CASES, SAFFIRE_MISSIONS, simulateLongitudinal, simulateSaffire, simulateSaffireII5, type OpposedModel, type SaffireIICase, type SaffireII5Model, type SaffireIILocalized, type SaffireMission, type SaffireModel } from "./saffire";
import { publishedCaseForMode, readPublishedModel, SAFFIRE_PUBLISHED_CASES, type PublishedCase, type PublishedModel } from "./saffirePublished";
import { ModelApplicability } from "./model/ModelApplicability";
import { GRAVITY_ENVIRONMENTS, gravityOf, SURFACE_PRESETS, type GravityId } from "./model/domain";
import { HabitatLab } from "./habitat/HabitatLab";
import { SpecialistWorkspace } from "./specialist/SpecialistWorkspace";
import "./habitat/habitat.css";
import { englishText } from "./i18n/english";
type LabMode = "habitat" | "workspace" | "cabin" | SaffireMission;
const LAB_TABS: { id: "habitat" | "workspace" | "saffire" | "cabin"; label: string; hint: string }[] = [
  { id: "habitat", label: "Lunar habitat · 3D simulation", hint: "exploratory scenarios and A/B alternatives" },
  { id: "workspace", label: "Specialist workspace", hint: "gallery, comparison and dossier for 9 trials" },
  { id: "saffire", label: "SAFFIRE I–VI trials", hint: "calibration and validation by trial" },
  { id: "cabin", label: "Cabin and evidence", hint: "search, catalog and applicability" },
];
import {
  INITIAL_MATERIALS,
  MATERIALS,
  MATERIAL_LABELS,
  PRESETS,
  SURFACES,
  number,
} from "./config";
import type {
  Atmosphere,
  ExperimentTest,
  Overlay,
  VehicleId,
} from "./types";
const CabinScene = lazy(() => import("./components/CabinScene"));
const SaffireScene = lazy(() => import("./components/SaffireScene"));
type Page = "lab" | "experiments" | "sources";
const OVERLAYS = [
  { id: "materials", label: "Materials", icon: Layers3 },
  { id: "thermal", label: "Thermal", icon: Thermometer },
  { id: "airflow", label: "Ventilation", icon: Wind },
] as const;

export default function App() {
  const { data, error, loading, reload } = useNasaData();
  const [page, setPage] = useState<Page>("lab");
  const [labMode, setLabMode] = useState<LabMode>("habitat");
  const [loadedSaffire, setSaffire] = useState<SaffireModel | SaffireII5Model | PublishedModel | null>(null);
  const [loadedLocal, setLocalized] = useState<SaffireIILocalized | null>(null);
  const [sample, setSample] = useState<SaffireIICase>(SAFFIRE_II_CASES[4]);
  const [opposed, setOpposed] = useState<OpposedModel>({ status: "unavailable" });
  const [saffireStatus, setSaffireStatus] = useState("Loading trial data…");
  const mission = labMode === "cabin" || labMode === "habitat" || labMode === "workspace" ? null : SAFFIRE_MISSIONS[labMode];
  const [habitatAnchor, setHabitatAnchor] = useState<{ id: string; nonce: number } | null>(null);
  const isSaffire = mission !== null;
  const iiCase = labMode === "saffire-ii" ? sample : null;
  const publishedCase = publishedCaseForMode(labMode);
  const isLocalized = iiCase?.model === false;
  const experimentId = iiCase ? saffireIIId(iiCase.sample) : publishedCase ? mission?.accession : `${mission?.accession}:t0:r2`;
  const saffire = loadedSaffire?.experimentId === experimentId ? loadedSaffire : null;
  const published = saffire?.schemaVersion === 3 ? saffire : null;
  const localized = loadedLocal?.experimentId === experimentId ? loadedLocal : null;
  const unavailable = isSaffire && !saffire && !localized;
  const duration = isSaffire ? (saffire?.durationSeconds ?? localized?.durationSeconds ?? 0) : 90;
  const saffireSteps = useMemo(() => {
    if (!saffire) return [];
    if (saffire.schemaVersion === 1) return simulateSaffireII5(saffire, SAFFIRE_II_BOARD.rows);
    if (saffire.schemaVersion === 3) return simulateLongitudinal(saffire);
    return simulateSaffire(saffire, opposed);
  }, [saffire, opposed]);
  const [gravity, setGravity] = useState<GravityId>("orbit");
  const gravityEnv = gravityOf(gravity);
  useEffect(() => {
    if (!mission) return;
    const request = new AbortController();
    setSaffire(null);
    setLocalized(null);
    setOpposed({ status: "unavailable", reason: "Loading S2 analysis…" });
    setSaffireStatus("Loading trial data…");
    const base = `${import.meta.env.BASE_URL}data/saffire/${mission.accession.toLowerCase()}`;
    const s2 = iiCase || publishedCase ? null : fetch(`${base}-s2-neighbors.json`, { signal: request.signal })
      .then(response => {
        if (!response.ok) throw new Error("S2 result unavailable.");
        return response.json();
      })
      .then(value => readOpposedModel(value, `${mission.accession}:t0:r3`))
      .catch((error: unknown): OpposedModel => ({
        status: "unavailable", reason: error instanceof Error ? error.message : "S2 result unavailable.",
      }));
    const file = publishedCase ? `${base}.json`
      : iiCase ? `${base}-ii${iiCase.sample}${isLocalized ? "-board" : ""}.json` : `${base}-s1-neighbors.json`;
    fetch(file, { signal: request.signal })
      .then((response) => {
        if (!response.ok || !response.headers.get("content-type")?.includes("json")) {
          throw new Error("The SAFFIRE processing result is not yet available.");
        }
        return response.json();
      })
      .then(async (value) => {
        const s2Model = await s2;
        if (!request.signal.aborted) {
          if (publishedCase) setSaffire(readPublishedModel(value, mission.accession));
          else if (iiCase?.model === false) setLocalized(readSaffireIILocalized(value, iiCase.sample));
          else setSaffire(iiCase ? readSaffireII5Model(value, iiCase.sample) : readSaffireModel(value, experimentId));
          if (s2Model) setOpposed(s2Model);
        }
      })
      .catch((error: unknown) => {
        if (!request.signal.aborted) setSaffireStatus(error instanceof Error ? error.message : "Data unavailable.");
      });
    return () => request.abort();
  }, [mission, iiCase, isLocalized, experimentId, publishedCase]);
  const [vehicle, setVehicle] = useState<VehicleId>("orion");
  const [atmosphere, setAtmosphere] = useState<Atmosphere>({
    ...PRESETS[0].atmosphere,
  });
  const [preset, setPreset] = useState("cabin");
  const [origins, setOrigins] = useState<ConditionOrigins>(initialOrigins);
  const [pendingTest, setPendingTest] = useState<ExperimentTest | null>(null);
  const [sourceExperiment, setSourceExperiment] = useState<{
    id: string;
    investigationId: string;
    label: string;
    fieldsApplied: string[];
    sourceFile?: string;
    sourceRow?: number;
  } | null>(null);
  const [selectedSurface, setSelectedSurface] = useState("console_main");
  const [assignments, setAssignments] = useState({ ...INITIAL_MATERIALS });
  const surface = SURFACES.find((s) => s.id === selectedSurface)!;
  const researchContext: ResearchContext = {
    vehicle, surfaceId: selectedSurface, surfaceName: surface.name,
    structureKind: surface.kind, material: assignments[selectedSurface],
    oxygenPct: atmosphere.oxygen, pressureKpa: atmosphere.pressure,
    flowCmS: atmosphere.flow, gravityG: gravityEnv.g,
  };
  const research = useResearch(researchContext);
  const [cutaway, setCutaway] = useState(true);
  const [overlay, setOverlay] = useState<Overlay>("materials");
  const [time, setTime] = useState(0);
  const saffireStepIndex = saffire ? Math.min(saffireSteps.length - 1, Math.floor(time / saffire.stepSeconds)) : 0;
  const localizedGrid = useMemo(() => localized ? saffireIILocalizedGrid(localized, time) : null, [localized, time]);
  const saffireBlocked = saffireSteps.slice(0, saffireStepIndex + 1).reduce((sum, step) => sum + step.blocked, 0);
  const [playing, setPlaying] = useState(false);
  const [runId, setRunId] = useState(0);
  const [ignitionSurface, setIgnitionSurface] = useState<string | null>(null);
  const [resetCameraKey, setResetCameraKey] = useState(0);
  const [speed, setSpeed] = useState(2);
  const [notice, setNotice] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [limits, setLimits] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);
  const closeDialog = useCallback(() => {
    setHelp(false);
    setLimits(false);
  }, []);
  useModalFocus(help || limits, closeDialog);
  const allTests = useMemo(
    () => data?.investigations.reduce((sum, i) => sum + i.tests.length, 0) ?? 0,
    [data],
  );
  const timeRef = useRef(time);
  timeRef.current = time;
  useEffect(() => {
    if (!playing) return;
    const startTime = timeRef.current;
    const startedAt = performance.now();
    const timer = window.setInterval(
      () =>
        setTime(
          Math.min(
            duration,
            startTime + ((performance.now() - startedAt) / 1000) * speed,
          ),
        ),
      100,
    );
    return () => window.clearInterval(timer);
  }, [playing, speed, runId, duration]);
  useEffect(() => {
    if (time >= duration) setPlaying(false);
  }, [time, duration]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [closeDialog]);
  function changeConditions(next: Atmosphere, presetLabel?: string) {
    setOrigins((current) => {
      const updated = { ...current };
      for (const { key } of CONDITION_FIELDS) {
        if (next[key] !== atmosphere[key] || presetLabel) {
          updated[key] = presetLabel
            ? { kind: "preset", label: `Preset · ${presetLabel}` }
            : { kind: "user", label: "Manual user adjustment" };
        }
      }
      return updated;
    });
    setAtmosphere(next);
    setPlaying(false);
    setRunId(0);
    setIgnitionSurface(null);
    setTime(0);
  }
  function run() {
    if (unavailable) return;
    setIgnitionSurface(isSaffire ? null : selectedSurface);
    setRunId((r) => r + 1);
    setTime(0);
    setPlaying(true);
    if (!isSaffire) setOverlay("thermal");
  }
  const modeSwitch = (
    <div className="lab-mode-tabs" role="group" aria-label="Laboratory mode">
      {LAB_TABS.map((tab) => (
        <button key={tab.id} type="button"
          aria-pressed={tab.id === "saffire" ? isSaffire : labMode === tab.id}
          onClick={() => changeLabMode(tab.id === "saffire" ? (isSaffire ? labMode : "saffire") : tab.id)}>
          {tab.label}<small>{tab.hint}</small>
        </button>
      ))}
    </div>
  );
  function changeLabMode(mode: LabMode) {
    setLabMode(mode);
    setPlaying(false);
    setTime(0);
    setRunId(0);
    setIgnitionSurface(null);
  }
  function applyTest(test: ExperimentTest) {
    const invalid = invalidConditions(test);
    if (invalid.length) {
      setNotice(
        `Application rejected: ${invalid.map(englishText).join("; ")}. Original values preserved without adjustment to the controls.`,
      );
      return;
    }
    if (CONDITION_FIELDS.every((f) => test[f.record] == null)) {
      setNotice("This record has no normalized O₂, pressure or flow values to apply.");
      return;
    }
    setPendingTest(test);
  }
  function confirmTest() {
    const test = pendingTest;
    if (!test) return;
    const next = applyConditions(test, atmosphere, origins);
    setAtmosphere(next.atmosphere);
    setOrigins(next.origins);
    setPlaying(false);
    setRunId(0);
    setIgnitionSurface(null);
    setTime(0);
    const fieldsApplied = [
      test.oxygenPct !== null ? "O₂" : null,
      test.pressureKpa !== null ? "pressure" : null,
      test.flowCmS !== null ? "flow" : null,
    ].filter((field): field is string => field !== null);
    setSourceExperiment({
      id: test.id,
      investigationId: test.investigationId,
      label: test.label,
      fieldsApplied,
      sourceFile: test.sourceFile,
      sourceRow: test.sourceRow,
    });
    setLabMode("cabin");
    setPreset("experiment");
    setPendingTest(null);
    setPage("lab");
    setNotice(
      `${test.investigationId} · ${englishText(test.label)}: applied ${fieldsApplied.join(", ")}. Missing fields were left unchanged; this does not validate the cabin.`,
    );
  }
  function exportScenario() {
    if (unavailable) return;
    const payload = localized ? {
      product: "HabitatFire",
      version: 1,
      visualization: { mode: "saffire-localized-observation", timeSeconds: time, grid: SAFFIRE_II_BOARD },
      localized,
    } : isSaffire && saffire ? {
      product: "HabitatFire",
      version: 1,
      visualization: { mode: iiCase || published ? "saffire-edge-ignition" : "saffire-central-ignition", timeSeconds: time,
        ...(iiCase || published ? { grid: published?.grid ?? SAFFIRE_II_BOARD } : {}) },
      model: saffire,
      opposed: iiCase || published ? { status: "unavailable", reason: "No opposed-flow estimate for this trial." } : opposed,
    } : {
      product: "HabitatFire",
      version: 2,
      vehicle,
      atmosphere: {
        oxygenPct: atmosphere.oxygen,
        pressureKpa: atmosphere.pressure,
        flowCmS: atmosphere.flow,
        gravityG: gravityEnv.g,
        gravityEnvironment: gravity,
      },
      materialAssignments: assignments,
      ignitionSurface,
      selectedSurface,
      visualization: { mode: "illustrative-not-calibrated", animationSeconds: time, physicalTimeAvailable: false },
      nasaSnapshot: data?.retrievedAt ?? null,
      lastAppliedExperiment: sourceExperiment,
      conditionProvenance: origins,
      research: research.bundle ? {
        stale: research.stale,
        relationToCurrentContext: research.stale ? "historical-only-not-current-evidence" : "current",
        bundle: research.bundle,
      } : null,
      limitations:
        "Approximate geometry. No validated prediction of spread, detection or suppression. Materials are scenario assumptions.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = mission ? `habitatfire-${mission.accession.toLowerCase()}${iiCase ? `-ii${iiCase.sample}` : ""}.json` : "habitatfire-cenario.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(
      localized ? "Edge observations exported with timestamps and source."
      : published ? "Published-speed model exported with evidence and limitations."
      : isSaffire ? "SAFFIRE model exported with its source and temporal check."
        : "Scenario exported with conditions, assumptions and NASA snapshot reference.",
    );
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#laboratorio"
          onClick={() => setPage("lab")}
          aria-label="HabitatFire home"
        >
          <span className="brand-symbol">
            <Flame size={23} strokeWidth={1.6} />
          </span>
          <span>
            Habitat<span className="brand-light">Fire</span>
            <small>MICROGRAVITY RESEARCH LAB</small>
          </span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            onClick={() => setPage("lab")}
            className={page === "lab" ? "active" : ""}
          >
            <Box size={15} />
            Laboratory
          </button>
          <button
            onClick={() => setPage("experiments")}
            className={page === "experiments" ? "active" : ""}
          >
            <Beaker size={15} />
            Experiments
            {allTests > 0 && <span className="nav-count">{allTests}</span>}
          </button>
          <button
            onClick={() => setPage("sources")}
            className={page === "sources" ? "active" : ""}
          >
            <BookOpen size={15} />
            Sources
          </button>
        </nav>
        <div className="header-right">
          <span className="connection-status">
            <i className={`dot ${data ? "green" : "amber"}`} />
            {loading
              ? "Loading NASA data"
              : data
                ? "NASA PSI · local snapshot"
                : "Data unavailable"}
          </span>
          <button
            className="icon-button"
            aria-label="How to use the laboratory"
            onClick={() => setHelp(true)}
          >
            <CircleHelp size={18} />
          </button>
          <span className="avatar" title="UFRJ Analytica">
            UA
          </span>
        </div>
      </header>
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notice"
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <Info size={16} />
          <span>
            {englishText(error)} Run npm run data:sync to retrieve the public snapshot,
            or try loading it again.
          </span>
          <button onClick={reload}>Try again</button>
        </div>
      )}
      {page === "lab" ? (
        <>
          <div className="lab-heading">
            <div>
              <div className="breadcrumb">
                WORKSPACE <ChevronRight size={11} /> HABITATFIRE{" "}
                <span className="workspace-tag">EXPLORATORY</span>
              </div>
              <h1>Fire changes. So does your perspective.</h1>
              <p>
                {labMode === "workspace"
                  ? "Compare NASA SAFFIRE trials: conditions, sources, model, speeds and curves, with dossier export."
                  : labMode === "habitat"
                  ? "Simulate fire spread across lunar habitat surfaces with a model calibrated using NASA images."
                  : isSaffire
                  ? `Explore measurements and the spread model for ${mission.label}.`
                  : "Explore a microgravity cabin and connect your questions to NASA science."}
              </p>
            </div>
            {labMode !== "habitat" && labMode !== "workspace" && <button
              className="button secondary export-button"
              onClick={exportScenario}
              disabled={unavailable}
            >
              <ArrowDownToLine size={15} />
              Export scenario
            </button>}
          </div>
          {labMode === "workspace" ? (
            <SpecialistWorkspace modeSwitch={modeSwitch}
              onUseInHabitat={(id) => { setHabitatAnchor({ id, nonce: Date.now() }); changeLabMode("habitat"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
          ) : labMode === "habitat" ? (
            <HabitatLab modeSwitch={modeSwitch} requestedAnchor={habitatAnchor} onOpenCalibration={() => { changeLabMode("saffire"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
          ) : <main className="workbench">
            <aside className="scenario-panel" aria-label="Configure scenario">
              <div className="panel-title">
                <Settings2 size={15} />
                <h2>Your scenario</h2>
                <span className="tiny-tag">{isSaffire ? "µg" : gravityEnv.short}</span>
              </div>
              <section className="control-section">{modeSwitch}</section>
              {isSaffire && <section className="control-section">
                <label className="preset-select">
                  <select aria-label="SAFFIRE trial" value={labMode}
                    onChange={(event) => changeLabMode(event.target.value as SaffireMission)}>
                    <option value="saffire">SAFFIRE I · Central ignition</option>
                    <option value="saffire-ii">SAFFIRE II</option>
                    <option value="saffire-iii">SAFFIRE III · Central ignition</option>
                    {Object.entries(SAFFIRE_PUBLISHED_CASES).map(([mode, item]) => (
                      <option key={mode} value={mode}>{englishText(SAFFIRE_MISSIONS[mode as SaffireMission].label)} · {englishText(item.material)}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                {iiCase && <label className="preset-select">
                  <select aria-label="SAFFIRE II sample" value={iiCase.sample} onChange={event => {
                    const selected = SAFFIRE_II_CASES.find(item => item.sample === Number(event.target.value));
                    if (selected) {
                      setSample(selected);
                      changeLabMode("saffire-ii");
                    }
                  }}>
                    {SAFFIRE_II_CASES.map(item => <option key={item.sample} value={item.sample}>2-{item.sample} · {englishText(item.material)}</option>)}
                  </select>
                  <ChevronDown size={14} />
                </label>}
              </section>}
              {isSaffire ? (
                <section className="control-section">
                  <h3>Sample {englishText(publishedCase?.material ?? iiCase?.material ?? "SIBAL")}</h3>
                  {publishedCase ? <>
                    <p>50 × 40.6 cm visual board</p>
                    {published?.measuredGeometry.widthApproximate &&
                      <p>Published width of approximately {number(published.measuredGeometry.widthMm / 10, 0)} cm</p>}
                  </> : <p>{iiCase ? `29 × 5 cm${iiCase.thickness ? ` · ${englishText(iiCase.thickness)} thick` : ""}` : `94 × 40.6 cm${labMode === "saffire" ? " · 0.37 mm thick" : ""}`}</p>}
                  {iiCase && <p>29 × 40.6 cm visual board · extrapolated width</p>}
                  <p>Reference flow of {number(published?.conditions.flowCmS ?? iiCase?.flow ?? mission.flow)} cm/s · O₂ {published ? `${number(published.conditions.oxygenPct, 1)}%` : englishText(iiCase?.oxygen ?? mission.oxygen)}
                    {published && ` · ${number(published.conditions.pressureKpa, 1)} kPa`}</p>
                  <p>{publishedCase ? "Upstream edge ignition · concurrent-flow spread" : iiCase ? `${englishText(iiCase.direction)} flow trial` : "Illustrative central ignition"}</p>
                </section>
              ) : <>
              <section className="control-section">
                <div className="step-label">
                  <span>01</span>
                  <h3>Environment</h3>
                </div>
                <div className="vehicle-options">
                  {(
                    [
                      {
                        id: "orion",
                        title: "Orion capsule",
                        subtitle: "Crew · 4 seats",
                        icon: Box,
                      },
                      {
                        id: "iss",
                        title: "Orbital module",
                        subtitle: "Inspired by the ISS",
                        icon: Layers3,
                      },
                    ] as const
                  ).map((v) => (
                    <button
                      key={v.id}
                      className={`vehicle-card ${vehicle === v.id ? "selected" : ""}`}
                      onClick={() => {
                        setVehicle(v.id);
                        setResetCameraKey((k) => k + 1);
                        setPlaying(false);
                        setRunId(0);
                        setTime(0);
                        setIgnitionSurface(null);
                      }}
                    >
                      <v.icon size={22} strokeWidth={1.35} />
                      <span>
                        <strong>{v.title}</strong>
                        <small>{v.subtitle}</small>
                      </span>
                      <span className="radio-circle">
                        {vehicle === v.id && <span />}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="microcopy">
                  Approximate geometry, not official CAD.
                </p>
              </section>
              <section className="control-section">
                <div className="step-label">
                  <span>02</span>
                  <h3>Atmosphere & ventilation</h3>
                  <Wind size={14} />
                </div>

                <label className="preset-select">
                  <select
                    aria-label="Atmosphere preset"
                    value={preset}
                    onChange={(e) => {
                      const surfacePreset = SURFACE_PRESETS.find((p) => p.id === e.target.value);
                      const p = surfacePreset ?? PRESETS.find((p) => p.id === e.target.value);
                      if (p) {
                        setPreset(p.id);
                        changeConditions({ ...p.atmosphere }, englishText(p.label));
                        if (surfacePreset) setGravity(surfacePreset.gravity);
                      }
                    }}
                  >
                    <option value="custom" disabled>
                      Custom conditions
                    </option>
                    <option value="experiment" disabled>
                      Experiment conditions
                    </option>
                    <optgroup label="Orbit">
                      {PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {englishText(p.label)}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Surface">
                      {SURFACE_PRESETS.map((p) => <option key={p.id} value={p.id}>{englishText(p.label)}</option>)}
                    </optgroup>
                  </select>
                  <ChevronDown size={14} />
                </label>
                {SURFACE_PRESETS.find((p) => p.id === preset) && (
                  <p className="preset-note">{englishText(SURFACE_PRESETS.find((p) => p.id === preset)!.note)}</p>
                )}
                <div className="gravity-select" role="group" aria-label="Environmental gravity">
                  {GRAVITY_ENVIRONMENTS.map((env) => (
                    <button key={env.id} type="button" aria-pressed={gravity === env.id}
                      onClick={() => { setGravity(env.id); setPlaying(false); setRunId(0); setTime(0); setIgnitionSurface(null); }}>
                      {englishText(env.label)}<small>{englishText(env.short)}</small>
                    </button>
                  ))}
                </div>
                <details className="condition-origins">
                  <summary>Source of each condition</summary>
                  {CONDITION_FIELDS.map((field) => <p key={field.key}><strong>{englishText(field.label)} · {number(atmosphere[field.key])} {field.unit}</strong><br />{englishText(originLabel(origins[field.key]))}</p>)}
                </details>
                <RangeControl
                  label="Oxygen"
                  value={atmosphere.oxygen}
                  unit="%"
                  min={15}
                  max={40}
                  step={0.1}
                  onChange={(value) => {
                    setPreset("custom");
                    changeConditions({ ...atmosphere, oxygen: value });
                  }}
                />
                <RangeControl
                  label="Pressure"
                  value={atmosphere.pressure}
                  unit="kPa"
                  min={35}
                  max={110}
                  step={0.1}
                  onChange={(value) => {
                    setPreset("custom");
                    changeConditions({ ...atmosphere, pressure: value });
                  }}
                />
                <RangeControl
                  label="Ventilation"
                  value={atmosphere.flow}
                  unit="cm/s"
                  min={0}
                  max={40}
                  step={0.5}
                  onChange={(value) => {
                    setPreset("custom");
                    changeConditions({ ...atmosphere, flow: value });
                  }}
                />
                <div className="partial-pressure">
                  <span>O₂ partial pressure</span>
                  <strong>
                    {number((atmosphere.pressure * atmosphere.oxygen) / 100)}{" "}
                    <small>kPa</small>
                  </strong>
                </div>
              </section>
              <section className="control-section material-section">
                <div className="step-label">
                  <span>03</span>
                  <h3>Surface & material</h3>
                  <MousePointer2 size={13} />
                </div>
                <p className="section-description">
                  Select in the cabin or from the list.
                </p>
                <div className="surface-list">
                  {SURFACES.map((s) => (
                    <button
                      key={s.id}
                      className={
                        selectedSurface === s.id
                          ? "surface-row selected"
                          : "surface-row"
                      }
                      onClick={() => setSelectedSurface(s.id)}
                    >
                      <span
                        className={`material-dot material-${assignments[s.id].toLowerCase().replace("í", "i")}`}
                      />
                      <span>{s.name}</span>
                      <small>{MATERIAL_LABELS[assignments[s.id]] ?? assignments[s.id]}</small>
                    </button>
                  ))}
                </div>
                <label className="material-select-label">
                  Selected surface material
                  <select
                    aria-label="Surface material"
                    value={assignments[selectedSurface]}
                    onChange={(e) => {
                      setAssignments((a) => ({
                        ...a,
                        [selectedSurface]: e.target.value,
                      }));
                      setPlaying(false);
                      setRunId(0);
                      setIgnitionSurface(null);
                      setTime(0);
                    }}
                  >
                    {MATERIALS.map((m) => (
                      <option key={m} value={m}>{MATERIAL_LABELS[m] ?? m}</option>
                    ))}
                  </select>
                </label>
                <p className="microcopy">
                  Hypothetical assignments, not the vehicle's actual materials.
                </p>
              </section>
              </>}
              <div className="scenario-footer">
                <span>
                  <ShieldCheck size={14} />
                  Explicit assumptions. Open sources.
                </span>
                <button onClick={() => setLimits(true)}>
                  View limitations <ArrowUpRight size={12} />
                </button>
              </div>
            </aside>
            <div className="visualization-column">
              <div className="scene-container" ref={canvasRef}>
                <div className="scene-topbar">
                  <div className="scene-title">
                    <i className="dot amber" />
                    <span>
                      {mission ? `${mission.label} / ${publishedCase ? "EDGE IGNITION" : iiCase ? `2-${iiCase.sample}` : "CENTRAL IGNITION"}` : vehicle === "orion"
                        ? "ORION / CREW CABIN"
                        : "ORBITAL / LAB MODULE"}
                    </span>
                  </div>
                  <span className="scene-scale">
                    {isSaffire ? "3D · MICROGRAVITY · TRIAL" : `3D · ${gravity === "orbit" ? "MICROGRAVITY" : `${englishText(gravityEnv.label).toUpperCase()} ${englishText(gravityEnv.short)}`} · ILLUSTRATIVE`}
                  </span>
                </div>
                <div className="scene-canvas">
                  <SceneBoundary key={experimentId}>
                    <Suspense
                      fallback={
                        <div className="scene-loading">
                          <LoaderCircle size={24} className="spin" />
                          <span>Loading scene…</span>
                        </div>
                      }
                    >
                      {isSaffire ? saffire ? (
                        <SaffireScene
                          model={iiCase ? { grid: SAFFIRE_II_BOARD } : saffire}
                          grid={saffireSteps[saffireStepIndex].grid}
                          resetCameraKey={resetCameraKey}
                        />
                      ) : localizedGrid ? (
                        <SaffireScene model={{ grid: SAFFIRE_II_BOARD }} grid={localizedGrid}
                          resetCameraKey={resetCameraKey} />
                      ) : (
                        <div className="scene-fallback" role="status"><p>{englishText(saffireStatus)}</p></div>
                      ) : <CabinScene
                        vehicle={vehicle}
                        cutaway={cutaway}
                        overlay={overlay}
                        selectedSurface={selectedSurface}
                        onSelectSurface={setSelectedSurface}
                        time={time}
                        playing={playing}
                        runId={runId}
                        ignitionSurface={ignitionSurface}
                        atmosphere={atmosphere}
                        materialAssignments={assignments}
                        resetCameraKey={resetCameraKey}
                      />}
                    </Suspense>
                  </SceneBoundary>
                </div>
                <div className="scene-left-tools">
                  {!isSaffire && <button
                    className={`tool-button ${cutaway ? "active" : ""}`}
                    title="Toggle cutaway view"
                    aria-label="Toggle cutaway view"
                    aria-pressed={cutaway}
                    onClick={() => setCutaway((v) => !v)}
                  >
                    <Layers3 size={17} />
                  </button>}
                  <button
                    className="tool-button"
                    title="Reset camera"
                    aria-label="Reset camera"
                    onClick={() => setResetCameraKey((k) => k + 1)}
                  >
                    <Focus size={17} />
                  </button>
                  <button
                    className="tool-button"
                    title="Fullscreen"
                    aria-label="Fullscreen"
                    onClick={() => {
                      if (document.fullscreenElement)
                        void document.exitFullscreen();
                      else
                        void canvasRef.current
                          ?.requestFullscreen()
                          .catch(() =>
                            setNotice(
                              "Fullscreen is not available in this browser.",
                            ),
                          );
                    }}
                  >
                    <Expand size={16} />
                  </button>
                </div>
                {!isSaffire && <div className="scene-overlay-controls">
                  {OVERLAYS.map((layer) => (
                    <button
                      key={layer.id}
                      className={overlay === layer.id ? "active" : ""}
                      onClick={() => setOverlay(layer.id)}
                    >
                      <layer.icon size={14} />
                      {layer.label}
                    </button>
                  ))}
                </div>}
                <div className="scene-bottom">
                  <div className="scene-legend">
                    {isLocalized ? <><span className="heat-legend" /> Edge luminosity · observation</> : isSaffire ? <><span className="heat-legend" /> {publishedCase ? "Simulated longitudinal front" : "Simulated pyrolysis front"}</> : overlay === "thermal" ? (
                      <>
                        <span className="heat-legend" />
                        Visual intensity · illustrative
                      </>
                    ) : overlay === "airflow" ? (
                      <>
                        <span className="flow-legend" />
                        Flow direction · illustrative
                      </>
                    ) : (
                      <>
                        <span className="selection-legend" />
                        Selected surface
                      </>
                    )}
                  </div>
                  <div className="axis-label">
                    <span className="axis-z">Z</span>
                    <span className="axis-y">Y</span>
                    <span className="axis-x">X</span>
                  </div>
                </div>
                <div className="scene-instructions">
                  <MousePointer2 size={12} />
                  Drag to orbit<span>·</span>Scroll to zoom
                  {!isSaffire && <><span>·</span>Click to select</>}
                </div>
              </div>
              <section className="playback-panel">
                <div className="playback-header">
                  <div>
                    <span className="eyebrow">{mission?.label ?? "EXPLORE A SCENARIO"}</span>
                    <h2>
                      {isLocalized ? `Edge behavior · ${englishText(iiCase.material)}` : isSaffire ? `Spread across ${englishText(publishedCase?.material ?? "SIBAL")}` : ignitionSurface
                        ? `Ignition on ${SURFACES.find((s) => s.id === ignitionSurface)?.name.toLowerCase()}`
                        : "How does the environment influence the flame?"}
                    </h2>
                  </div>
                  <span className="illustrative-pill">
                    <Info size={12} />
                    Illustrative
                  </span>
                </div>
                <div className="timeline">
                  <button
                    className="play-button"
                    disabled={unavailable}
                    aria-label={
                      playing ? "Pause animation" : "Play animation"
                    }
                    onClick={() => {
                      if (!runId) run();
                      else {
                        if (time >= duration) setTime(0);
                        setPlaying((p) => !p);
                      }
                    }}
                  >
                    {playing ? (
                      <Pause size={17} fill="currentColor" />
                    ) : (
                      <Play size={17} fill="currentColor" />
                    )}
                  </button>
                  <div className="timeline-track">
                    <input
                      aria-label={isSaffire ? "Playback time in seconds" : "Illustrative animation progress"}
                      type="range"
                      min={0}
                      max={duration}
                      step={isSaffire ? saffire?.stepSeconds ?? 2 : 0.1}
                      value={time}
                      disabled={!runId}
                      onChange={(e) => {
                        setPlaying(false);
                        setTime(Number(e.target.value));
                      }}
                      style={
                        {
                          "--range-progress": `${duration ? (time / duration) * 100 : 0}%`,
                        } as React.CSSProperties
                      }
                    />
                    <div className="timeline-ticks">
                      <span>{isSaffire ? "0 s" : "0%"}</span>
                      <span>{isSaffire ? `${number(duration / 3, 0)} s` : "33%"}</span>
                      <span>{isSaffire ? `${number(2 * duration / 3, 0)} s` : "67%"}</span>
                      <span>{isSaffire ? `${number(duration, 0)} s` : "100%"}</span>
                    </div>
                  </div>
                  <div className="time-readout">
                    <strong>{isSaffire ? `${number(saffireStepIndex * (saffire?.stepSeconds ?? 2), 0)} s` : `${number((time / 90) * 100, 0)}%`}</strong>
                    <span>{isSaffire ? `step ${saffireStepIndex} · from the start of the window` : "animation"}</span>
                  </div>
                  <button
                    className="speed-button"
                    aria-label="Change animation speed"
                    onClick={() =>
                      setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))
                    }
                  >
                    {speed}×
                  </button>
                </div>
                {isSaffire && !iiCase && !publishedCase ? (
                  <div className="fidelity-mode-controls" aria-label="Visualization fidelity">
                    <button aria-pressed="true" title="Fronts measured by the cameras in both flight trials">Reconstructed observation</button>
                    <button aria-pressed="true" title="Spread conditional on ignition under the trial conditions">Conditional prediction · trial domain</button>
                    <button disabled title="Central ignition combines S1 and S2 fits in an illustrative scene">Illustrative central ignition</button>
                  </div>
                ) : !isSaffire && (
                  <div className="fidelity-mode-controls" aria-label="Visualization fidelity">
                    <button aria-pressed="true" onClick={() => setNotice("Illustrative mode: progress does not represent physical fire time.")}>Illustrative</button>
                    <button disabled title="Measured replay available in SAFFIRE modes">Measured replay: SAFFIRE modes</button>
                    <button disabled title="See calibrated model applicability below">Prediction: see applicability</button>
                  </div>
                )}
                <div className="playback-footer">
                  <p>
                    <Info size={12} />
                    {isLocalized ? "The grid marks observed edge activity. Spread probability unavailable."
                      : publishedCase ? "Longitudinal spread calibrated using published speed."
                      : iiCase ? "Longitudinal simulation with the rate measured across 5 cm applied to the 40.6 cm visual width."
                      : isSaffire
                      ? saffireBlocked
                        ? `${saffireBlocked} transition attempts without estimates were suspended in this playback.`
                        : "Neighborhood simulation with a temporal check within the same trial."
                      : "Scenario animation. No validated spread prediction."}
                  </p>
                  <button className="button primary" onClick={run} disabled={unavailable}>
                    <Flame size={15} />
                    {isLocalized ? (runId ? "Restart scenario" : "View trial")
                      : isSaffire ? (runId ? "Restart simulation" : "Simulate spread") : (runId ? "Restart scenario" : "View ignition")}
                    <ArrowRight size={15} />
                  </button>
                </div>
              </section>
              {!isSaffire && (
                <ModelApplicability
                  scenario={{
                    material: assignments[selectedSurface],
                    oxygen: atmosphere.oxygen,
                    pressure: atmosphere.pressure,
                    flow: atmosphere.flow,
                    gravityG: gravityEnv.g,
                  }}
                  surfaceName={surface.name}
                  onOpenModel={() => { changeLabMode("saffire"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                />
              )}
            </div>
            {publishedCase ? <SaffirePublishedEvidence sample={publishedCase} model={published} />
              : iiCase ? <SaffireIIEvidence sample={iiCase} localized={localized} model={saffire?.schemaVersion === 1 ? saffire : null} />
              : mission ? <SaffireEvidence model={saffire?.schemaVersion === 2 ? saffire : null} opposed={opposed}
              accession={mission.accession} /> : <ResearchPanel
              research={research}
              context={researchContext}
              onApply={applyTest}
              onExplore={() => setPage("experiments")}
              onSources={() => setPage("sources")}
            />}
          </main>}
          <footer className="app-footer">
            <span>
              HABITATFIRE <span className="footer-divider">/</span> UFRJ
              ANALYTICA
            </span>
            <span>
              NASA Space Apps · Flame in Freefall
              <span className="footer-divider">/</span>Not intended for
              certification
            </span>
            <a
              href="https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/"
              target="_blank"
              rel="noreferrer"
            >
              The challenge <ArrowUpRight size={12} />
            </a>
          </footer>
        </>
      ) : loading ? (
        <div className="page-loading">
          <LoaderCircle className="spin" />
          Loading NASA catalog…
        </div>
      ) : data ? (
        page === "experiments" ? (
          <ExperimentExplorer data={data} onApply={applyTest} applicationPending={pendingTest !== null} />
        ) : (
          <SourcesView data={data} />
        )
      ) : (
        <div className="empty-state">
          <Database size={32} />
          <h2>The catalog has not loaded yet.</h2>
          <p>
            Sync NASA data and try again. The cabin remains
            available in the laboratory.
          </p>
          <button className="button secondary" onClick={reload}>
            <RefreshCw size={15} />
            Reload
          </button>
        </div>
      )}
      {pendingTest && <ConditionConfirmation test={pendingTest} atmosphere={atmosphere} origins={origins} onClose={() => setPendingTest(null)} onConfirm={confirmTest} />}
      {(help || limits) && (
        <div className="modal-backdrop" onClick={closeDialog}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {limits ? "SCIENTIFIC TRANSPARENCY" : "YOUR FIRST SCENARIO"}
                </span>
                <h2 id="help-title">
                  {limits
                    ? "What can this version tell you?"
                    : "From question to experiment."}
                </h2>
              </div>
              <button
                autoFocus
                className="icon-button"
                aria-label="Close"
                onClick={closeDialog}
              >
                <X size={20} />
              </button>
            </div>
            {limits ? (
              <>
                <p>
                  The library presents real measurements imported from NASA PSI,
                  with original fields and sources. The cabin and its material
                  assignments are approximations for exploring scenarios.
                </p>
                <div className="help-step">
                  <Database />
                  <div>
                    <strong>Measurement ≠ prediction.</strong>
                    <p>
                      This version has no trained and validated spread model.
                      Animation time does not estimate the duration of a
                      real fire.
                    </p>
                  </div>
                </div>
                <div className="help-step">
                  <Wind />
                  <div>
                    <strong>No calculated smoke transport.</strong>
                    <p>
                      Flow, flame and visual response are illustrations. We do
                      not calculate alarm time, detection or extinguisher
                      effectiveness.
                    </p>
                  </div>
                </div>
                <p className="data-notice">
                  Do not use for operational decisions, certified material
                  selection or crew safety.
                </p>
                <button
                  className="button primary full"
                  onClick={() => {
                    closeDialog();
                    setPage("sources");
                  }}
                >
                  View sources and limitations <ArrowRight size={15} />
                </button>
              </>
            ) : (
              <>
                <div className="help-step">
                  <Box />
                  <div>
                    <strong>1. Enter the cabin</strong>
                    <p>
                      Choose the environment. Drag to orbit and click a
                      component to select its surface.
                    </p>
                  </div>
                </div>
                <div className="help-step">
                  <Settings2 />
                  <div>
                    <strong>2. Form a hypothesis</strong>
                    <p>
                      Adjust atmosphere, ventilation and materials. View an
                      illustrative ignition without mistaking it for a prediction.
                    </p>
                  </div>
                </div>
                <div className="help-step">
                  <Beaker />
                  <div>
                    <strong>3. Return to the evidence</strong>
                    <p>
                      Explore NASA records, open the original fields and
                      apply available conditions to your scenario.
                    </p>
                  </div>
                </div>
                <button className="button primary full" onClick={closeDialog}>
                  Explore the laboratory <ArrowRight size={15} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function RangeControl({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="range-control">
      <span className="range-heading">
        <span>{label}</span>
        <span className="range-value">
          {number(value)}
          <small>{unit}</small>
        </span>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={
          {
            "--range-progress": `${((value - min) / (max - min)) * 100}%`,
          } as React.CSSProperties
        }
      />
      <span className="range-bounds">
        <span>
          {min} {unit}
        </span>
        <span>
          {max} {unit}
        </span>
      </span>
    </label>
  );
}

function SaffirePublishedEvidence({ sample, model }: { sample: PublishedCase; model: PublishedModel | null }) {
  const check = model?.validation;
  return (
    <aside className="evidence-panel" aria-label={`Evidence ${sample.sample}`}>
      <div className="panel-title"><BookOpen size={15} /><h2>Reference trial</h2></div>
      <section className="evidence-card featured">
        <div className="evidence-card-title">
          <h3>{sample.sample} · {englishText(sample.material)}</h3>
          {model && <a href={model.calibration.source.url} target="_blank" rel="noreferrer" aria-label={englishText(model.calibration.source.label)}>
            <ArrowUpRight size={17} />
          </a>}
        </div>
        {model && <>
          <div className="evidence-numbers">
            <div><strong>{number(model.probability * 100, 0)}%</strong><span>Derived probability per 2 s</span></div>
            <div><strong>{number(model.calibration.speedMmS, 2)} mm/s</strong><span>Published speed</span></div>
          </div>
          <p>Calibrated using published speed. Each strip randomly samples a one-cell advance of 10 mm per 2 s step.</p>
          <p>No estimate for lateral or opposed-flow spread. Variation between strips comes from the model's random draws.</p>
        </>}
        {check?.kind === "same-trial-curve" && <>
          <h4>Curve check within the same trial</h4>
          <p>{englishText(check.variable)}, from {check.digitization.intervalSeconds.map(value => number(value)).join(" to ")} s in Figure 8.
            Slope of {number(check.observedSpeedMmS, 2)} mm/s in the plot and {number(check.simulatedSpeedMmS, 2)} mm/s
            averaged across {check.seedCount} seeds. Mean position error of {number(check.positionMaeMm, 1)} mm.</p>
          {sample.sample === "V-2" && <p>The check ends before the fabric rolls up. The scene continues to the estimated crossing horizon.</p>}
        </>}
        {check?.kind === "numerical-speed-only" && <>
          <h4>Experimental trajectory unavailable</h4>
          <p>{englishText(check.reason)} The numerical check obtained {number(check.simulatedSpeedMmS, 2)} mm/s averaged across {check.seedCount} seeds.</p>
        </>}
      </section>
      {model?.relatedEvidence.map(item => (
        <section className="evidence-card" key={item.id}>
          <div className="evidence-card-title">
            <h3>{item.id} · {englishText(item.material)}</h3>
            <a href={item.source.url} target="_blank" rel="noreferrer" aria-label={englishText(item.source.label)}><ArrowUpRight size={17} /></a>
          </div>
          <p>{englishText(item.outcome)}</p>
          <p>Simulation unavailable.</p>
        </section>
      ))}
    </aside>
  );
}

function SaffireIIEvidence({ sample, model, localized }: {
  sample: SaffireIICase; model: SaffireII5Model | null; localized: SaffireIILocalized | null;
}) {
  return (
    <aside className="evidence-panel" aria-label="SAFFIRE II evidence">
      <div className="panel-title"><BookOpen size={15} /><h2>Reference trial</h2></div>
      <section className="evidence-card featured">
        <div className="evidence-card-title">
          <h3>II-{sample.sample} · {englishText(sample.material)}</h3>
          <a href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-99" target="_blank" rel="noreferrer" aria-label="Open NASA investigation">
            <ArrowUpRight size={17} />
          </a>
        </div>
        {model && <>
          <div className="evidence-numbers">
            <div><strong>{number(model.probability * 100, 1)}%</strong><span>Spread probability in 2 s</span></div>
            <div><strong>{model.train.transitions}/{model.train.exposures}</strong><span>Advances per exposure</span></div>
          </div>
          <p>Rate measured in {model.sampling.acceptedFrames} frames from camera {model.camera}. The scene applies this rate to the 21 strips of the visual board with independent random draws.</p>
          <p>In {model.validation.comparableRows} of the 3 strips tracked throughout the held-out segment, the front advanced at {number(model.validation.observedSpeedMmS, 2)} mm/s in the images and {number(model.validation.simulatedSpeedMmS, 2)} mm/s averaged across {model.validation.seedCount} simulations.</p>
        </>}
        {sample.model ? <p>Opposed-flow spread and lateral effect · no estimate applied.</p> : <>
          <p>{englishText(sample.outcome)}</p>
          {localized && <p>{localized.observations.length} frames from camera {localized.camera} analyzed to mark edge luminosity. This measurement includes the igniter and does not identify an advancing pyrolysis front.</p>}
        </>}
      </section>
    </aside>
  );
}

function SaffireEvidence({ model, opposed, accession }: {
  model: SaffireModel | null; opposed: OpposedModel; accession: string;
}) {
  const forwardCheck = model?.contiguousValidation;
  const opposedCheck = opposed.contiguousValidation;
  return (
    <aside className="evidence-panel" aria-label="SAFFIRE evidence">
      <div className="panel-title"><BookOpen size={15} /><h2>Reference trial</h2></div>
      <section className="evidence-card featured">
        <div className="evidence-card-title">
          <h3>Concurrent with ventilation · S1</h3>
          <a href={`https://psi.nasa.gov/physci/repo/data/investigations/${accession}`} target="_blank" rel="noreferrer" aria-label="Open NASA investigation">
            <ArrowUpRight size={17} />
          </a>
        </div>
        <p>Pyrolysis front observed by both trial cameras.</p>
        {model && <>
          <div className="evidence-numbers">
            <div>
              <strong>{number(forwardCheck?.positionMaeMm ?? model.comparison.neighborhood.positionMaeMm.mean)} mm</strong>
              <span>Mean position error</span>
            </div>
            <div>
              <strong>{number(model.comparison.baseline.positionMaeMm.mean)} mm</strong>
              <span>Previous model mean error</span>
            </div>
          </div>
          <p>Probability of spread in 2 s at the edge of each strip. Lateral neighbors modify this probability when sufficient data are available. Combinations without estimates use the trial's longitudinal average.</p>
          <div className="saffire-probabilities">
            {Object.entries(model.combinations).filter(([key]) => key.startsWith("1")).map(([key, value]) => (
              <p key={key}>
                <strong>{[key[0] === "1" && "Upstream", key[1] === "1" && "Above", key[2] === "1" && "Below"].filter(Boolean).join(" + ")}</strong>
                {" · "}{value.probability === null ? "No estimate" : `${number(value.probability * 100, 1)}%`}
                {" · "}{number(value.transitions, 0)}/{number(value.exposures, 0)}
                {value.exposures > 0 && value.exposures < 100 ? " · limited data" : ""}
                {value.probability !== null && value.transitions < 5 ? " · few advances" : ""}
              </p>
            ))}
          </div>
          <div className="domain-note">
            <Info size={14} />
            <span>
              Across {forwardCheck?.seedCount ?? model.comparison.seedCount} simulations of the held-out segment, the mean speed was
              {" "}{number(forwardCheck?.simulatedSpeedMmS ?? model.comparison.neighborhood.simulatedSpeedMmS.mean, 2)} mm/s
              versus {number(forwardCheck?.observedSpeedMmS ?? model.comparison.observedSpeedMmS, 2)} mm/s in the images. These rates represent observed associations.
            </span>
          </div>
        </>}
      </section>
      <section className="evidence-card">
        <h3>Opposed to ventilation · S2</h3>
        <p className="s2-review-note">S2 review: grid quantization and missing igniter pixels prevent physical approval of these rates; use as an exploratory record. <a href="https://github.com/UFRJ-Analytica/hkt_flame_in_freefall/blob/develop/docs/research/S2_REVIEW.md" target="_blank" rel="noreferrer">S2_REVIEW.md</a></p>
        <p>{opposed.status === "ready" ? `Calibration using camera ${opposed.camera ?? "S2"}.`
          : englishText(opposed.reason ?? "Opposed-ventilation spread unavailable.")}</p>
        {opposed.status === "ready" && opposed.longitudinal && <>
          <p>
            Longitudinal average · {number((opposed.longitudinal.probability ?? 0) * 100, 1)}% per 2 s step
            {" · "}{opposed.longitudinal.transitions}/{opposed.longitudinal.exposures}
          </p>
          <p>In S2, cases with lateral neighbors fell below the minimum exposure count. These cases use the longitudinal average.</p>
          {opposedCheck && <p>
            Speed in the held-out segment · {number(opposedCheck.observedSpeedMmS, 2)} mm/s observed
            {" · "}{number(opposedCheck.simulatedSpeedMmS, 2)} mm/s simulated
            {" · "}{number(opposedCheck.positionMaeMm, 1)} mm mean error
          </p>}
        </>}
        {opposed.status === "ready" && Object.entries(opposed.combinations ?? {}).filter(([key]) => key.startsWith("1")).map(([key, value]) => (
          <p key={key}>
            {[key[0] === "1" && "Downstream", key[1] === "1" && "Above", key[2] === "1" && "Below"].filter(Boolean).join(" + ")}
            {" · "}{value.probability === null ? "No estimate" : `${number(value.probability * 100, 1)}%`}
            {" · "}{value.transitions}/{value.exposures}
          </p>
        ))}
      </section>
    </aside>
  );
}
