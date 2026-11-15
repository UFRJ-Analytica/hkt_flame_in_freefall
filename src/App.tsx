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
import "./habitat/habitat.css";
type LabMode = "habitat" | "cabin" | SaffireMission;
const LAB_TABS: { id: "habitat" | "saffire" | "cabin"; label: string; hint: string }[] = [
  { id: "habitat", label: "Habitat lunar · simulação 3D", hint: "propagação calibrada nas superfícies" },
  { id: "saffire", label: "Ensaios SAFFIRE I a VI", hint: "calibração e validação por ensaio" },
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
  const [loadedSaffire, setSaffire] = useState<SaffireModel | SaffireII5Model | PublishedModel | null>(null);
  const [loadedLocal, setLocalized] = useState<SaffireIILocalized | null>(null);
  const [sample, setSample] = useState<SaffireIICase>(SAFFIRE_II_CASES[4]);
  const [opposed, setOpposed] = useState<OpposedModel>({ status: "unavailable" });
  const [saffireStatus, setSaffireStatus] = useState("Carregando dados do ensaio…");
  const mission = labMode === "cabin" || labMode === "habitat" ? null : SAFFIRE_MISSIONS[labMode];
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
    setOpposed({ status: "unavailable", reason: "Carregando análise de S2…" });
    setSaffireStatus("Carregando dados do ensaio…");
    const base = `${import.meta.env.BASE_URL}data/saffire/${mission.accession.toLowerCase()}`;
    const s2 = iiCase || publishedCase ? null : fetch(`${base}-s2-neighbors.json`, { signal: request.signal })
      .then(response => {
        if (!response.ok) throw new Error("Resultado de S2 indisponível.");
        return response.json();
      })
      .then(value => readOpposedModel(value, `${mission.accession}:t0:r3`))
      .catch((error: unknown): OpposedModel => ({
        status: "unavailable", reason: error instanceof Error ? error.message : "Resultado de S2 indisponível.",
      }));
    const file = publishedCase ? `${base}.json`
      : iiCase ? `${base}-ii${iiCase.sample}${isLocalized ? "-board" : ""}.json` : `${base}-s1-neighbors.json`;
    fetch(file, { signal: request.signal })
      .then((response) => {
        if (!response.ok || !response.headers.get("content-type")?.includes("json")) {
          throw new Error("O resultado do processamento SAFFIRE ainda não está disponível.");
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
        if (!request.signal.aborted) setSaffireStatus(error instanceof Error ? error.message : "Dados indisponíveis.");
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
    if (unavailable) return;
    setIgnitionSurface(isSaffire ? null : selectedSurface);
    setRunId((r) => r + 1);
    setTime(0);
    setPlaying(true);
    if (!isSaffire) setOverlay("thermal");
  }
  const modeSwitch = (
    <div className="lab-mode-tabs" role="group" aria-label="Modo do laboratório">
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
      opposed: iiCase || published ? { status: "unavailable", reason: "Sem estimativa contra o fluxo para este ensaio." } : opposed,
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
    anchor.download = mission ? `habitatfire-${mission.accession.toLowerCase()}${iiCase ? `-ii${iiCase.sample}` : ""}.json` : "habitatfire-cenario.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice(
      localized ? "Observações de borda exportadas com os tempos e a fonte."
      : published ? "Modelo de velocidade publicada exportado com evidências e limites."
      : isSaffire ? "Modelo SAFFIRE exportado com a fonte e a checagem temporal."
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
                  ? `Explore as medições e o modelo de propagação do ${mission.label}.`
                  : "Explore uma cabine em microgravidade e conecte suas perguntas à ciência da NASA."}
              </p>
            </div>
            {labMode !== "habitat" && <button
              className="button secondary export-button"
              onClick={exportScenario}
              disabled={unavailable}
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
              {isSaffire && <section className="control-section">
                <label className="preset-select">
                  <select aria-label="Ensaio SAFFIRE" value={labMode}
                    onChange={(event) => changeLabMode(event.target.value as SaffireMission)}>
                    <option value="saffire">SAFFIRE I · Ignição central</option>
                    <option value="saffire-ii">SAFFIRE II</option>
                    <option value="saffire-iii">SAFFIRE III · Ignição central</option>
                    {Object.entries(SAFFIRE_PUBLISHED_CASES).map(([mode, item]) => (
                      <option key={mode} value={mode}>{SAFFIRE_MISSIONS[mode as SaffireMission].label} · {item.material}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} />
                </label>
                {iiCase && <label className="preset-select">
                  <select aria-label="Amostra do SAFFIRE II" value={iiCase.sample} onChange={event => {
                    const selected = SAFFIRE_II_CASES.find(item => item.sample === Number(event.target.value));
                    if (selected) {
                      setSample(selected);
                      changeLabMode("saffire-ii");
                    }
                  }}>
                    {SAFFIRE_II_CASES.map(item => <option key={item.sample} value={item.sample}>2-{item.sample} · {item.material}</option>)}
                  </select>
                  <ChevronDown size={14} />
                </label>}
              </section>}
              {isSaffire ? (
                <section className="control-section">
                  <h3>Amostra {publishedCase?.material ?? iiCase?.material ?? "SIBAL"}</h3>
                  {publishedCase ? <>
                    <p>Placa visual de 50 × 40,6 cm</p>
                    {published?.measuredGeometry.widthApproximate &&
                      <p>Largura publicada de cerca de {number(published.measuredGeometry.widthMm / 10, 0)} cm</p>}
                  </> : <p>{iiCase ? `29 × 5 cm${iiCase.thickness ? ` · ${iiCase.thickness} de espessura` : ""}` : `94 × 40,6 cm${labMode === "saffire" ? " · 0,37 mm de espessura" : ""}`}</p>}
                  {iiCase && <p>Placa visual de 29 × 40,6 cm · largura extrapolada</p>}
                  <p>Fluxo de referência de {published?.conditions.flowCmS ?? iiCase?.flow ?? mission.flow} cm/s · O₂ {published ? `${number(published.conditions.oxygenPct, 1)}%` : iiCase?.oxygen ?? mission.oxygen}
                    {published && ` · ${number(published.conditions.pressureKpa, 1)} kPa`}</p>
                  <p>{publishedCase ? "Ignição na borda a montante · avanço a favor do fluxo" : iiCase ? `Ensaio ${iiCase.direction} do fluxo` : "Ignição central ilustrativa"}</p>
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
                      {mission ? `${mission.label} / ${publishedCase ? "IGNIÇÃO NA BORDA" : iiCase ? `2-${iiCase.sample}` : "IGNIÇÃO CENTRAL"}` : vehicle === "orion"
                        ? "ORION / CREW CABIN"
                        : "ORBITAL / LAB MODULE"}
                    </span>
                  </div>
                  <span className="scene-scale">
                    {isSaffire ? "3D · MICROGRAVIDADE · ENSAIO" : `3D · ${gravity === "orbit" ? "MICROGRAVIDADE" : `${gravityEnv.label.toUpperCase()} ${gravityEnv.short}`} · ILUSTRATIVO`}
                  </span>
                </div>
                <div className="scene-canvas">
                  <SceneBoundary key={experimentId}>
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
                          model={iiCase ? { grid: SAFFIRE_II_BOARD } : saffire}
                          grid={saffireSteps[saffireStepIndex].grid}
                          resetCameraKey={resetCameraKey}
                        />
                      ) : localizedGrid ? (
                        <SaffireScene model={{ grid: SAFFIRE_II_BOARD }} grid={localizedGrid}
                          resetCameraKey={resetCameraKey} />
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
                    {isLocalized ? <><span className="heat-legend" /> Luminosidade na borda · observação</> : isSaffire ? <><span className="heat-legend" /> {publishedCase ? "Frente longitudinal simulada" : "Frente de pirólise simulada"}</> : overlay === "thermal" ? (
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
                    <span className="eyebrow">{mission?.label ?? "EXPLORAR UM CENÁRIO"}</span>
                    <h2>
                      {isLocalized ? `Comportamento de borda · ${iiCase.material}` : isSaffire ? `Propagação sobre ${publishedCase?.material ?? "SIBAL"}` : ignitionSurface
                        ? `Ignição em ${SURFACES.find((s) => s.id === ignitionSurface)?.name.toLowerCase()}`
                        : "Como o ambiente influencia a chama?"}
                    </h2>
                  </div>
                  <span className="illustrative-pill">
                    <Info size={12} />
                    Ilustrativo
                  </span>
                </div>
                <div className="timeline">
                  <button
                    className="play-button"
                    disabled={unavailable}
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
                      aria-label={isSaffire ? "Tempo da reprodução em segundos" : "Progresso da animação ilustrativa"}
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
                {isSaffire && !iiCase && !publishedCase ? (
                  <div className="fidelity-mode-controls" aria-label="Fidelidade da visualização">
                    <button aria-pressed="true" title="Frentes medidas nas câmeras dos dois ensaios do voo">Observação reconstruída</button>
                    <button aria-pressed="true" title="Avanço condicionado à ignição, nas condições do ensaio">Previsão condicional · domínio do ensaio</button>
                    <button disabled title="A ignição central combina os ajustes de S1 e S2 em uma cena ilustrativa">Ignição central ilustrativa</button>
                  </div>
                ) : !isSaffire && (
                  <div className="fidelity-mode-controls" aria-label="Fidelidade da visualização">
                    <button aria-pressed="true" onClick={() => setNotice("Modo ilustrativo: o progresso não representa tempo físico de incêndio.")}>Ilustrativo</button>
                    <button disabled title="Replay medido disponível nos modos SAFFIRE">Replay medido: modos SAFFIRE</button>
                    <button disabled title="Veja a aplicabilidade do modelo calibrado abaixo">Previsão: ver aplicabilidade</button>
                  </div>
                )}
                <div className="playback-footer">
                  <p>
                    <Info size={12} />
                    {isLocalized ? "A grade marca a atividade observada na borda. Probabilidade de avanço indisponível."
                      : publishedCase ? "Avanço longitudinal calibrado por velocidade publicada."
                      : iiCase ? "Simulação longitudinal com a taxa medida em 5 cm aplicada à largura visual de 40,6 cm."
                      : isSaffire
                      ? saffireBlocked
                        ? `${saffireBlocked} tentativas de transição sem estimativa foram suspensas nesta reprodução.`
                        : "Simulação por vizinhança, com checagem temporal no mesmo ensaio."
                      : "Animação de hipótese. Sem previsão validada de propagação."}
                  </p>
                  <button className="button primary" onClick={run} disabled={unavailable}>
                    <Flame size={15} />
                    {isLocalized ? (runId ? "Reiniciar cenário" : "Visualizar ensaio")
                      : isSaffire ? (runId ? "Reiniciar simulação" : "Simular avanço") : (runId ? "Reiniciar cenário" : "Visualizar ignição")}
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

function SaffirePublishedEvidence({ sample, model }: { sample: PublishedCase; model: PublishedModel | null }) {
  const check = model?.validation;
  return (
    <aside className="evidence-panel" aria-label={`Evidência ${sample.sample}`}>
      <div className="panel-title"><BookOpen size={15} /><h2>Ensaio de referência</h2></div>
      <section className="evidence-card featured">
        <div className="evidence-card-title">
          <h3>{sample.sample} · {sample.material}</h3>
          {model && <a href={model.calibration.source.url} target="_blank" rel="noreferrer" aria-label={model.calibration.source.label}>
            <ArrowUpRight size={17} />
          </a>}
        </div>
        {model && <>
          <div className="evidence-numbers">
            <div><strong>{number(model.probability * 100, 0)}%</strong><span>Chance derivada por 2 s</span></div>
            <div><strong>{number(model.calibration.speedMmS, 2)} mm/s</strong><span>Velocidade publicada</span></div>
          </div>
          <p>Calibrado por velocidade publicada. Cada faixa sorteia o avanço de uma célula de 10 mm por passo de 2 s.</p>
          <p>Avanço lateral e contra o fluxo sem estimativa. A variação entre faixas vem dos sorteios do modelo.</p>
        </>}
        {check?.kind === "same-trial-curve" && <>
          <h4>Checagem por curva no mesmo ensaio</h4>
          <p>{check.variable}, de {check.digitization.intervalSeconds.join(" a ")} s na Figura 8.
            Inclinação de {number(check.observedSpeedMmS, 2)} mm/s no gráfico e {number(check.simulatedSpeedMmS, 2)} mm/s
            na média de {check.seedCount} sementes. Erro médio de posição de {number(check.positionMaeMm, 1)} mm.</p>
          {sample.sample === "V-2" && <p>A checagem termina antes de o tecido enrolar. A cena segue até o horizonte estimado de travessia.</p>}
        </>}
        {check?.kind === "numerical-speed-only" && <>
          <h4>Trajetória experimental indisponível</h4>
          <p>{check.reason} A checagem numérica obteve {number(check.simulatedSpeedMmS, 2)} mm/s na média de {check.seedCount} sementes.</p>
        </>}
      </section>
      {model?.relatedEvidence.map(item => (
        <section className="evidence-card" key={item.id}>
          <div className="evidence-card-title">
            <h3>{item.id} · {item.material}</h3>
            <a href={item.source.url} target="_blank" rel="noreferrer" aria-label={item.source.label}><ArrowUpRight size={17} /></a>
          </div>
          <p>{item.outcome}</p>
          <p>Simulação indisponível.</p>
        </section>
      ))}
    </aside>
  );
}

function SaffireIIEvidence({ sample, model, localized }: {
  sample: SaffireIICase; model: SaffireII5Model | null; localized: SaffireIILocalized | null;
}) {
  return (
    <aside className="evidence-panel" aria-label="Evidência SAFFIRE II">
      <div className="panel-title"><BookOpen size={15} /><h2>Ensaio de referência</h2></div>
      <section className="evidence-card featured">
        <div className="evidence-card-title">
          <h3>II-{sample.sample} · {sample.material}</h3>
          <a href="https://psi.nasa.gov/physci/repo/data/investigations/PSI-99" target="_blank" rel="noreferrer" aria-label="Abrir investigação na NASA">
            <ArrowUpRight size={17} />
          </a>
        </div>
        {model && <>
          <div className="evidence-numbers">
            <div><strong>{number(model.probability * 100, 1)}%</strong><span>Chance de avanço em 2 s</span></div>
            <div><strong>{model.train.transitions}/{model.train.exposures}</strong><span>Avanços por exposições</span></div>
          </div>
          <p>Taxa medida em {model.sampling.acceptedFrames} quadros da câmera {model.camera}. A cena aplica essa taxa às 21 faixas da placa visual, com sorteios próprios.</p>
          <p>Nas {model.validation.comparableRows} de 3 faixas acompanhadas durante todo o trecho reservado, a frente avançou a {number(model.validation.observedSpeedMmS, 2)} mm/s nas imagens e {number(model.validation.simulatedSpeedMmS, 2)} mm/s na média de {model.validation.seedCount} simulações.</p>
        </>}
        {sample.model ? <p>Avanço contra o fluxo e efeito lateral · sem estimativa aplicada.</p> : <>
          <p>{sample.outcome}</p>
          {localized && <p>{localized.observations.length} quadros da câmera {localized.camera} analisados para marcar a luminosidade na borda. Essa medida inclui o ignitor e não identifica uma frente de pirólise em avanço.</p>}
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
    <aside className="evidence-panel" aria-label="Evidência SAFFIRE">
      <div className="panel-title"><BookOpen size={15} /><h2>Ensaio de referência</h2></div>
      <section className="evidence-card featured">
        <div className="evidence-card-title">
          <h3>A favor da ventilação · S1</h3>
          <a href={`https://psi.nasa.gov/physci/repo/data/investigations/${accession}`} target="_blank" rel="noreferrer" aria-label="Abrir investigação na NASA">
            <ArrowUpRight size={17} />
          </a>
        </div>
        <p>Frente de pirólise observada nas duas câmeras do ensaio.</p>
        {model && <>
          <div className="evidence-numbers">
            <div>
              <strong>{number(forwardCheck?.positionMaeMm ?? model.comparison.neighborhood.positionMaeMm.mean)} mm</strong>
              <span>Erro médio de posição</span>
            </div>
            <div>
              <strong>{number(model.comparison.baseline.positionMaeMm.mean)} mm</strong>
              <span>Erro médio do modelo anterior</span>
            </div>
          </div>
          <p>Probabilidade de avanço em 2 s na borda de cada faixa. Os vizinhos laterais modificam essa chance quando há dados suficientes. Para combinações sem estimativa, aplica-se a média longitudinal do ensaio.</p>
          <div className="saffire-probabilities">
            {Object.entries(model.combinations).filter(([key]) => key.startsWith("1")).map(([key, value]) => (
              <p key={key}>
                <strong>{[key[0] === "1" && "Montante", key[1] === "1" && "Acima", key[2] === "1" && "Abaixo"].filter(Boolean).join(" + ")}</strong>
                {" · "}{value.probability === null ? "Sem estimativa" : `${number(value.probability * 100, 1)}%`}
                {" · "}{number(value.transitions, 0)}/{number(value.exposures, 0)}
                {value.exposures > 0 && value.exposures < 100 ? " · poucos dados" : ""}
                {value.probability !== null && value.transitions < 5 ? " · poucos avanços" : ""}
              </p>
            ))}
          </div>
          <div className="domain-note">
            <Info size={14} />
            <span>
              Em {forwardCheck?.seedCount ?? model.comparison.seedCount} simulações do trecho reservado, a velocidade média foi
              {" "}{number(forwardCheck?.simulatedSpeedMmS ?? model.comparison.neighborhood.simulatedSpeedMmS.mean, 2)} mm/s
              e nas imagens {number(forwardCheck?.observedSpeedMmS ?? model.comparison.observedSpeedMmS, 2)} mm/s. As taxas representam associações observadas.
            </span>
          </div>
        </>}
      </section>
      <section className="evidence-card">
        <h3>Contra a ventilação · S2</h3>
        <p className="s2-review-note">Revisão S2: quantização da grade e ausência de pixels do ignitor impedem aprovar estas taxas fisicamente; use como registro exploratório. <a href="https://github.com/UFRJ-Analytica/hkt_flame_in_freefall/blob/develop/docs/research/S2_REVIEW.md" target="_blank" rel="noreferrer">S2_REVIEW.md</a></p>
        <p>{opposed.status === "ready" ? `Calibração pela câmera ${opposed.camera ?? "S2"}.`
          : opposed.reason ?? "Avanço contra a ventilação indisponível."}</p>
        {opposed.status === "ready" && opposed.longitudinal && <>
          <p>
            Média longitudinal · {number((opposed.longitudinal.probability ?? 0) * 100, 1)}% por passo de 2 s
            {" · "}{opposed.longitudinal.transitions}/{opposed.longitudinal.exposures}
          </p>
          <p>Em S2, os casos com vizinhos laterais ficaram abaixo do mínimo de exposições. Nesses casos se aplica a média longitudinal.</p>
          {opposedCheck && <p>
            Velocidade no trecho reservado · {number(opposedCheck.observedSpeedMmS, 2)} mm/s observados
            {" · "}{number(opposedCheck.simulatedSpeedMmS, 2)} mm/s simulados
            {" · "}{number(opposedCheck.positionMaeMm, 1)} mm de erro médio
          </p>}
        </>}
        {opposed.status === "ready" && Object.entries(opposed.combinations ?? {}).filter(([key]) => key.startsWith("1")).map(([key, value]) => (
          <p key={key}>
            {[key[0] === "1" && "Jusante", key[1] === "1" && "Acima", key[2] === "1" && "Abaixo"].filter(Boolean).join(" + ")}
            {" · "}{value.probability === null ? "Sem estimativa" : `${number(value.probability * 100, 1)}%`}
            {" · "}{value.transitions}/{value.exposures}
          </p>
        ))}
      </section>
    </aside>
  );
}
