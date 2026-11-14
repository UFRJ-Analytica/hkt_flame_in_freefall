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
import { frontEnsemble, frontMedianMm, readSaffireModel, simulateSaffire, type SaffireModel } from "./saffire";
import { SaffireEvidence } from "./model/SaffireEvidence";
import { ModelApplicability } from "./model/ModelApplicability";
import { GRAVITY_ENVIRONMENTS, gravityOf, SURFACE_PRESETS, type GravityId } from "./model/domain";
import { HabitatLab } from "./habitat/HabitatLab";
import "./habitat/habitat.css";
const ENSEMBLE_SEEDS = Array.from({ length: 20 }, (_, i) => 1951 + i);
type LabMode = "habitat" | "cabin" | "saffire";
const LAB_MODES: { id: LabMode; label: string; hint: string }[] = [
  { id: "habitat", label: "Habitat lunar · simulação 3D", hint: "propagação calibrada nas superfícies" },
  { id: "saffire", label: "Ensaio SAFFIRE I · S1", hint: "calibração e validação do modelo" },
  { id: "cabin", label: "Cabine e evidências", hint: "busca, catálogo e aplicabilidade" },
];
import {
  INITIAL_MATERIALS,
  MATERIALS,
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
  { id: "materials", label: "Materiais", icon: Layers3 },
  { id: "thermal", label: "Térmico", icon: Thermometer },
  { id: "airflow", label: "Ventilação", icon: Wind },
] as const;

export default function App() {
  const { data, error, loading, reload } = useNasaData();
  const [page, setPage] = useState<Page>("lab");
  const [labMode, setLabMode] = useState<LabMode>("habitat");
  const [saffire, setSaffire] = useState<SaffireModel | null>(null);
  const [saffireStatus, setSaffireStatus] = useState("Carregando dados do ensaio…");
  const isSaffire = labMode === "saffire";
  const duration = isSaffire ? (saffire?.durationSeconds ?? 0) : 90;
  const [saffireSeed, setSaffireSeed] = useState(1951);
  const saffireSteps = useMemo(() => saffire ? simulateSaffire(saffire, saffireSeed) : [], [saffire, saffireSeed]);
  const saffireEnsemble = useMemo(() => saffire ? frontEnsemble(saffire, ENSEMBLE_SEEDS) : [], [saffire]);
  const [gravity, setGravity] = useState<GravityId>("orbit");
  const gravityEnv = gravityOf(gravity);
  useEffect(() => {
    if (!isSaffire) return;
    const request = new AbortController();
    setSaffire(null);
    setSaffireStatus("Carregando dados do ensaio…");
    fetch(`${import.meta.env.BASE_URL}data/saffire/psi-98-s1-neighbors.json`, { signal: request.signal })
      .then((response) => {
        if (!response.ok || !response.headers.get("content-type")?.includes("json")) {
          throw new Error("O resultado do processamento SAFFIRE ainda não está disponível.");
        }
        return response.json();
      })
      .then((value) => {
        if (!request.signal.aborted) setSaffire(readSaffireModel(value));
      })
      .catch((error: unknown) => {
        if (!request.signal.aborted) setSaffireStatus(error instanceof Error ? error.message : "Dados indisponíveis.");
      });
    return () => request.abort();
  }, [isSaffire]);
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
            : { kind: "user", label: "Ajuste manual do usuário" };
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
    if (isSaffire && !saffire) return;
    if (isSaffire && runId) setSaffireSeed((seed) => seed + 1);
    setIgnitionSurface(isSaffire ? null : selectedSurface);
    setRunId((r) => r + 1);
    setTime(0);
    setPlaying(true);
    if (!isSaffire) setOverlay("thermal");
  }
  const modeSwitch = (
    <div className="lab-mode-tabs" role="group" aria-label="Modo do laboratório">
      {LAB_MODES.map((mode) => (
        <button key={mode.id} type="button" aria-pressed={labMode === mode.id} onClick={() => changeLabMode(mode.id)}>
          {mode.label}<small>{mode.hint}</small>
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
        `Aplicação recusada: ${invalid.join("; ")}. Valores originais preservados, sem ajuste aos controles.`,
      );
      return;
    }
    if (CONDITION_FIELDS.every((f) => test[f.record] == null)) {
      setNotice("Este registro não possui O₂, pressão ou fluxo normalizados para aplicar.");
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
      test.pressureKpa !== null ? "pressão" : null,
      test.flowCmS !== null ? "fluxo" : null,
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
      `${test.investigationId} · ${test.label}: ${fieldsApplied.join(", ")} aplicado(s). Campos ausentes foram mantidos; não é validação da cabine.`,
    );
  }
  function exportScenario() {
    if (isSaffire && !saffire) return;
    const payload = isSaffire && saffire ? {
      product: "HabitatFire",
      version: 2,
      target: "Avanço da frente condicionado à ignição forçada; não é probabilidade de ignição.",
      visualization: {
        mode: "saffire-surface-transition",
        timeSecondsSinceWindowStart: time,
        step: saffireStepIndex,
        seed: saffireSeed,
        simulatedFrontMedianMm: saffireSteps[saffireStepIndex] ? frontMedianMm(saffire, saffireSteps[saffireStepIndex].grid) : null,
      },
      model: saffire,
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
        "Geometria aproximada. Sem previsão validada de propagação, detecção ou supressão. Materiais são hipóteses do cenário.",
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = isSaffire ? "habitatfire-saffire-i-s1.json" : "habitatfire-cenario.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(
      isSaffire ? "Modelo SAFFIRE exportado com a fonte e a checagem temporal."
        : "Cenário exportado com condições, hipóteses e referência do snapshot NASA.",
    );
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#laboratorio"
          onClick={() => setPage("lab")}
          aria-label="HabitatFire início"
        >
          <span className="brand-symbol">
            <Flame size={23} strokeWidth={1.6} />
          </span>
          <span>
            Habitat<span className="brand-light">Fire</span>
            <small>MICROGRAVITY RESEARCH LAB</small>
          </span>
        </a>
        <nav className="main-nav" aria-label="Navegação principal">
          <button
            onClick={() => setPage("lab")}
            className={page === "lab" ? "active" : ""}
          >
            <Box size={15} />
            Laboratório
          </button>
          <button
            onClick={() => setPage("experiments")}
            className={page === "experiments" ? "active" : ""}
          >
            <Beaker size={15} />
            Experimentos
            {allTests > 0 && <span className="nav-count">{allTests}</span>}
          </button>
          <button
            onClick={() => setPage("sources")}
            className={page === "sources" ? "active" : ""}
          >
            <BookOpen size={15} />
            Fontes
          </button>
        </nav>
        <div className="header-right">
          <span className="connection-status">
            <i className={`dot ${data ? "green" : "amber"}`} />
            {loading
              ? "Carregando NASA"
              : data
                ? "NASA PSI · snapshot local"
                : "Dados indisponíveis"}
          </span>
          <button
            className="icon-button"
            aria-label="Como usar o laboratório"
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
            aria-label="Dispensar aviso"
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
            {error} Execute npm run data:sync para recuperar o snapshot público,
            ou tente carregar novamente.
          </span>
          <button onClick={reload}>Tentar novamente</button>
        </div>
      )}
      {page === "lab" ? (
        <>
          <div className="lab-heading">
            <div>
              <div className="breadcrumb">
                WORKSPACE <ChevronRight size={11} /> HABITATFIRE{" "}
                <span className="workspace-tag">EXPLORATÓRIO</span>
              </div>
              <h1>O fogo muda. A sua perspectiva também.</h1>
              <p>
                {labMode === "habitat"
                  ? "Simule a propagação de um incêndio nas superfícies de um habitat lunar, com o modelo calibrado em imagens da NASA."
                  : isSaffire
                  ? "Explore a propagação medida em uma amostra do SAFFIRE I."
                  : "Explore uma cabine em microgravidade e conecte suas perguntas à ciência da NASA."}
              </p>
            </div>
            {labMode !== "habitat" && <button
              className="button secondary export-button"
              onClick={exportScenario}
              disabled={isSaffire && !saffire}
            >
              <ArrowDownToLine size={15} />
              Exportar cenário
            </button>}
          </div>
          {labMode === "habitat" ? (
            <HabitatLab modeSwitch={modeSwitch} onOpenCalibration={() => { changeLabMode("saffire"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
          ) : <main className="workbench">
            <aside className="scenario-panel" aria-label="Configurar cenário">
              <div className="panel-title">
                <Settings2 size={15} />
                <h2>Seu cenário</h2>
                <span className="tiny-tag">{isSaffire ? "µg" : gravityEnv.short}</span>
              </div>
              <section className="control-section">{modeSwitch}</section>
              {isSaffire ? (
                <section className="control-section">
                  <h3>Amostra SIBAL</h3>
                  <p>94 × 40,6 cm · 0,37 mm de espessura</p>
                  <p>Fluxo nominal de 20 cm/s · O₂ de 21,5 a 21,7%</p>
                  <p>Ignição na borda a montante</p>
                  <p className="preset-note">Realização {saffireSeed - 1950} · semente {saffireSeed}. As condições são as do ensaio e não são editáveis: o modelo só é válido nelas.</p>
                </section>
              ) : <>
              <section className="control-section">
                <div className="step-label">
                  <span>01</span>
                  <h3>Ambiente</h3>
                </div>
                <div className="vehicle-options">
                  {(
                    [
                      {
                        id: "orion",
                        title: "Cápsula Orion",
                        subtitle: "Tripulação · 4 lugares",
                        icon: Box,
                      },
                      {
                        id: "iss",
                        title: "Módulo orbital",
                        subtitle: "Inspirado na ISS",
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
                  Geometria aproximada, não é CAD oficial.
                </p>
              </section>
              <section className="control-section">
                <div className="step-label">
                  <span>02</span>
                  <h3>Atmosfera & ventilação</h3>
                  <Wind size={14} />
                </div>

                <label className="preset-select">
                  <select
                    aria-label="Preset de atmosfera"
                    value={preset}
                    onChange={(e) => {
                      const surfacePreset = SURFACE_PRESETS.find((p) => p.id === e.target.value);
                      const p = surfacePreset ?? PRESETS.find((p) => p.id === e.target.value);
                      if (p) {
                        setPreset(p.id);
                        changeConditions({ ...p.atmosphere }, p.label);
                        if (surfacePreset) setGravity(surfacePreset.gravity);
                      }
                    }}
                  >
                    <option value="custom" disabled>
                      Condições personalizadas
                    </option>
                    <option value="experiment" disabled>
                      Condições de experimento
                    </option>
                    <optgroup label="Órbita">
                      {PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Superfície">
                      {SURFACE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </optgroup>
                  </select>
                  <ChevronDown size={14} />
                </label>
                {SURFACE_PRESETS.find((p) => p.id === preset) && (
                  <p className="preset-note">{SURFACE_PRESETS.find((p) => p.id === preset)!.note}</p>
                )}
                <div className="gravity-select" role="group" aria-label="Gravidade do ambiente">
                  {GRAVITY_ENVIRONMENTS.map((env) => (
                    <button key={env.id} type="button" aria-pressed={gravity === env.id}
                      onClick={() => { setGravity(env.id); setPlaying(false); setRunId(0); setTime(0); setIgnitionSurface(null); }}>
                      {env.label}<small>{env.short}</small>
                    </button>
                  ))}
                </div>
                <details className="condition-origins">
                  <summary>Origem de cada condição</summary>
                  {CONDITION_FIELDS.map((field) => <p key={field.key}><strong>{field.label} · {number(atmosphere[field.key])} {field.unit}</strong><br />{originLabel(origins[field.key])}</p>)}
                </details>
                <RangeControl
                  label="Oxigênio"
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
                  label="Pressão"
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
                  label="Ventilação"
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
                  <span>Pressão parcial de O₂</span>
                  <strong>
                    {number((atmosphere.pressure * atmosphere.oxygen) / 100)}{" "}
                    <small>kPa</small>
                  </strong>
                </div>
              </section>
              <section className="control-section material-section">
                <div className="step-label">
                  <span>03</span>
                  <h3>Superfície & material</h3>
                  <MousePointer2 size={13} />
                </div>
                <p className="section-description">
                  Selecione na cabine ou na lista.
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
                      <small>{assignments[s.id]}</small>
                    </button>
                  ))}
                </div>
                <label className="material-select-label">
                  Material da superfície selecionada
                  <select
                    aria-label="Material da superfície"
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
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <p className="microcopy">
                  Atribuições hipotéticas, não materiais reais do veículo.
                </p>
              </section>
              </>}
              <div className="scenario-footer">
                <span>
                  <ShieldCheck size={14} />
                  Hipóteses explícitas. Fontes abertas.
                </span>
                <button onClick={() => setLimits(true)}>
                  Ver limites <ArrowUpRight size={12} />
                </button>
              </div>
            </aside>
            <div className="visualization-column">
              <div className="scene-container" ref={canvasRef}>
                <div className="scene-topbar">
                  <div className="scene-title">
                    <i className="dot amber" />
                    <span>
                      {isSaffire ? "SAFFIRE I / AMOSTRA S1" : vehicle === "orion"
                        ? "ORION / CREW CABIN"
                        : "ORBITAL / LAB MODULE"}
                    </span>
                  </div>
                  <span className="scene-scale">
                    {isSaffire ? "3D · MICROGRAVIDADE · ENSAIO" : `3D · ${gravity === "orbit" ? "MICROGRAVIDADE" : `${gravityEnv.label.toUpperCase()} ${gravityEnv.short}`} · ILUSTRATIVO`}
                  </span>
                </div>
                <div className="scene-canvas">
                  <SceneBoundary key={labMode}>
                    <Suspense
                      fallback={
                        <div className="scene-loading">
                          <LoaderCircle size={24} className="spin" />
                          <span>Carregando cena…</span>
                        </div>
                      }
                    >
                      {isSaffire ? saffire ? (
                        <SaffireScene
                          model={saffire}
                          grid={saffireSteps[saffireStepIndex].grid}
                          observedFrontMm={saffire.observedTrajectory?.[Math.min(saffire.observedTrajectory.length - 1, saffireStepIndex)]?.frontMedianMm ?? null}
                          resetCameraKey={resetCameraKey}
                        />
                      ) : (
                        <div className="scene-fallback" role="status"><p>{saffireStatus}</p></div>
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
                    title="Alternar vista em corte"
                    aria-label="Alternar vista em corte"
                    aria-pressed={cutaway}
                    onClick={() => setCutaway((v) => !v)}
                  >
                    <Layers3 size={17} />
                  </button>}
                  <button
                    className="tool-button"
                    title="Restaurar câmera"
                    aria-label="Restaurar câmera"
                    onClick={() => setResetCameraKey((k) => k + 1)}
                  >
                    <Focus size={17} />
                  </button>
                  <button
                    className="tool-button"
                    title="Tela cheia"
                    aria-label="Tela cheia"
                    onClick={() => {
                      if (document.fullscreenElement)
                        void document.exitFullscreen();
                      else
                        void canvasRef.current
                          ?.requestFullscreen()
                          .catch(() =>
                            setNotice(
                              "Tela cheia não está disponível neste navegador.",
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
                    {isSaffire ? <><span className="heat-legend" /> Frente simulada <span className="observed-legend" /> Frente observada nas câmeras</> : overlay === "thermal" ? (
                      <>
                        <span className="heat-legend" />
                        Intensidade visual · ilustrativa
                      </>
                    ) : overlay === "airflow" ? (
                      <>
                        <span className="flow-legend" />
                        Direção de fluxo · ilustrativa
                      </>
                    ) : (
                      <>
                        <span className="selection-legend" />
                        Superfície selecionada
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
                  Arraste para orbitar<span>·</span>Role para aproximar
                  {!isSaffire && <><span>·</span>Clique para selecionar</>}
                </div>
              </div>
              <section className="playback-panel">
                <div className="playback-header">
                  <div>
                    <span className="eyebrow">{isSaffire ? "ENSAIO SAFFIRE I · S1" : "EXPLORAR UM CENÁRIO"}</span>
                    <h2>
                      {isSaffire ? "Propagação sobre o SIBAL" : ignitionSurface
                        ? `Ignição em ${SURFACES.find((s) => s.id === ignitionSurface)?.name.toLowerCase()}`
                        : "Como o ambiente influencia a chama?"}
                    </h2>
                  </div>
                  <span className="illustrative-pill">
                    <Info size={12} />
                    {isSaffire ? "Modelo de um ensaio" : "Ilustrativo"}
                  </span>
                </div>
                <div className="timeline">
                  <button
                    className="play-button"
                    disabled={isSaffire && !saffire}
                    aria-label={
                      playing ? "Pausar animação" : "Reproduzir animação"
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
                      aria-label={isSaffire ? "Tempo desde o início da janela analisada do ensaio" : "Progresso da animação ilustrativa, não tempo físico"}
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
                    <span>{isSaffire ? `passo ${saffireStepIndex} · desde o início da janela` : "animação"}</span>
                  </div>
                  <button
                    className="speed-button"
                    aria-label="Alterar velocidade da animação"
                    onClick={() =>
                      setSpeed((s) => (s === 1 ? 2 : s === 2 ? 4 : 1))
                    }
                  >
                    {speed}×
                  </button>
                </div>
                {isSaffire ? (
                  <div className="fidelity-mode-controls" aria-label="Fidelidade da visualização">
                    <button aria-pressed="true" title="Frente medida nas câmeras do ensaio, linha ciano">Observação reconstruída</button>
                    <button aria-pressed="true" title="Avanço condicionado à ignição, no domínio do ensaio">Previsão condicional · domínio do ensaio</button>
                    <button disabled title="Nenhum segundo ensaio processado para teste independente">Transferência não validada</button>
                  </div>
                ) : (
                  <div className="fidelity-mode-controls" aria-label="Fidelidade da visualização">
                    <button aria-pressed="true" onClick={() => setNotice("Modo ilustrativo: o progresso não representa tempo físico de incêndio.")}>Ilustrativo</button>
                    <button disabled title="Replay medido disponível no modo SAFFIRE I · S1">Replay medido: modo SAFFIRE</button>
                    <button disabled title="Veja a aplicabilidade do modelo calibrado abaixo">Previsão: ver aplicabilidade</button>
                  </div>
                )}
                <div className="playback-footer">
                  <p>
                    <Info size={12} />
                    {isSaffire
                      ? saffireBlocked
                        ? `${saffireBlocked} tentativas de transição sem estimativa foram suspensas nesta reprodução.`
                        : "Simulação por vizinhança, com checagem temporal no mesmo ensaio."
                      : "Animação de hipótese. Sem previsão validada de propagação."}
                  </p>
                  <button className="button primary" onClick={run} disabled={isSaffire && !saffire}>
                    <Flame size={15} />
                    {isSaffire ? (runId ? "Nova realização" : "Simular avanço") : (runId ? "Reiniciar cenário" : "Visualizar ignição")}
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
            {isSaffire ? <SaffireEvidence model={saffire} ensemble={saffireEnsemble} time={saffireStepIndex * (saffire?.stepSeconds ?? 2)} seedCount={ENSEMBLE_SEEDS.length} /> : <ResearchPanel
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
              <span className="footer-divider">/</span>Não destinado à
              certificação
            </span>
            <a
              href="https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/"
              target="_blank"
              rel="noreferrer"
            >
              O desafio <ArrowUpRight size={12} />
            </a>
          </footer>
        </>
      ) : loading ? (
        <div className="page-loading">
          <LoaderCircle className="spin" />
          Carregando catálogo NASA…
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
          <h2>O catálogo ainda não foi carregado.</h2>
          <p>
            Sincronize os dados NASA e tente novamente. A cabine continua
            disponível no laboratório.
          </p>
          <button className="button secondary" onClick={reload}>
            <RefreshCw size={15} />
            Recarregar
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
                  {limits ? "TRANSPARÊNCIA CIENTÍFICA" : "SEU PRIMEIRO CENÁRIO"}
                </span>
                <h2 id="help-title">
                  {limits
                    ? "O que esta versão pode dizer?"
                    : "Da pergunta ao experimento."}
                </h2>
              </div>
              <button
                autoFocus
                className="icon-button"
                aria-label="Fechar"
                onClick={closeDialog}
              >
                <X size={20} />
              </button>
            </div>
            {limits ? (
              <>
                <p>
                  A biblioteca apresenta medições reais importadas do NASA PSI,
                  com campos originais e fontes. A cabine e suas atribuições de
                  materiais são aproximações para explorar cenários.
                </p>
                <div className="help-step">
                  <Database />
                  <div>
                    <strong>Medição ≠ previsão.</strong>
                    <p>
                      Não há um modelo treinado e validado de propagação nesta
                      versão. O tempo da animação não estima o tempo de um
                      incêndio real.
                    </p>
                  </div>
                </div>
                <div className="help-step">
                  <Wind />
                  <div>
                    <strong>Sem transporte de fumaça calculado.</strong>
                    <p>
                      Fluxo, chama e resposta visual são ilustrações. Não
                      calculamos tempo de alarme, detecção ou eficácia de
                      extintores.
                    </p>
                  </div>
                </div>
                <p className="data-notice">
                  Não usar para decisões operacionais, seleção certificada de
                  materiais ou segurança de tripulação.
                </p>
                <button
                  className="button primary full"
                  onClick={() => {
                    closeDialog();
                    setPage("sources");
                  }}
                >
                  Consultar fontes e limitações <ArrowRight size={15} />
                </button>
              </>
            ) : (
              <>
                <div className="help-step">
                  <Box />
                  <div>
                    <strong>1. Entre na cabine</strong>
                    <p>
                      Escolha o ambiente. Arraste para orbitar e clique em um
                      componente para selecionar sua superfície.
                    </p>
                  </div>
                </div>
                <div className="help-step">
                  <Settings2 />
                  <div>
                    <strong>2. Formule uma hipótese</strong>
                    <p>
                      Ajuste atmosfera, ventilação e materiais. Visualize uma
                      ignição ilustrativa sem confundi-la com uma previsão.
                    </p>
                  </div>
                </div>
                <div className="help-step">
                  <Beaker />
                  <div>
                    <strong>3. Volte à evidência</strong>
                    <p>
                      Explore os registros NASA, abra os campos originais e
                      aplique condições disponíveis ao seu cenário.
                    </p>
                  </div>
                </div>
                <button className="button primary full" onClick={closeDialog}>
                  Explorar o laboratório <ArrowRight size={15} />
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
