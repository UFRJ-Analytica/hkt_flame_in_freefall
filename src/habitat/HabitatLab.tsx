import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowRight, BookOpen, CheckCircle2, CircleSlash, Flame, HelpCircle, Info, LoaderCircle,
  MousePointer2, Pause, Play, RotateCcw, Settings2, Wind,
} from "lucide-react";
import { SceneBoundary } from "../components/SceneBoundary";
import { readSaffireModel, type SaffireModel } from "../saffire";
import { GRAVITY_ENVIRONMENTS, gravityOf, PARTIAL_GRAVITY_SOURCES, type GravityId } from "../model/domain";
import type { EnsembleResult, EngineInput } from "./engine";
import {
  buildGrid, buildKernel, CELL, CELL_AREA_M2, DEFAULT_ZONES, GRID, ignitionMask, MATERIAL_IDS, MATERIAL_INFO,
  materialRule, type MaterialId, type SecondTrial, type Tier, type Zone,
} from "./habitatModel";
import type { ViewMode } from "./HabitatScene";
import "./habitat.css";

const HabitatScene = lazy(() => import("./HabitatScene"));
const DURATION_S = 1200;
const STEPS = DURATION_S / CELL.stepSeconds;
const SEED_COUNT = 20;
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => 1951 + i);
const SPEEDS = [15, 30, 60];

const PRESETS: { id: string; label: string; note: string; oxygen: number; pressure: number; flow: number; gravity: GravityId }[] = [
  { id: "lunar", label: "Habitat lunar · atmosfera de exploração", note: "56,5 kPa (8,2 psia) e 34% O₂, a atmosfera estudada pela NASA para encurtar o prebreathe de EVA. Ventilação hipotética.", oxygen: 34, pressure: 56.5, flow: 10, gravity: "moon" },
  { id: "saffire", label: "Condições do ensaio SAFFIRE I", note: "21,6% O₂, ~1 atm, 20 cm/s, microgravidade: o único ponto calibrado.", oxygen: 21.6, pressure: 101.3, flow: 20, gravity: "orbit" },
  { id: "station", label: "Estação orbital · ar nominal", note: "21% O₂, 101,3 kPa, ventilação típica de cabine (hipotética).", oxygen: 21, pressure: 101.3, flow: 10, gravity: "orbit" },
];

const TIER_STYLE: Record<Tier, { label: string; className: string }> = {
  calibrated: { label: "Calibrado", className: "ok" },
  exploratory: { label: "Exploratório", className: "warn" },
  "measured-no-spread": { label: "Sem propagação medida", className: "measured" },
  unknown: { label: "Sem evidência", className: "unknown" },
  inert: { label: "Inerte (premissa)", className: "inert" },
};

const num = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const fmtTime = (s: number) => s < 60 ? `${num(s, 0)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`;

function useSaffire() {
  const [model, setModel] = useState<SaffireModel | null>(null);
  const [second, setSecond] = useState<SecondTrial | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const request = new AbortController();
    const base = import.meta.env.BASE_URL;
    fetch(`${base}data/saffire/psi-98-s1-neighbors.json`, { signal: request.signal })
      .then((r) => { if (!r.ok) throw new Error("Modelo SAFFIRE indisponível."); return r.json(); })
      .then((v) => setModel(readSaffireModel(v)))
      .catch((e: unknown) => { if (!request.signal.aborted) setError(e instanceof Error ? e.message : "Erro ao carregar o modelo."); });
    // Second trial is optional: without it the flow scaling falls back to the linear hypothesis.
    fetch(`${base}data/saffire/psi-100-s1.json`, { signal: request.signal })
      .then((r) => r.ok ? r.json() : null)
      .then((v) => { if (v?.neighborhood && v?.comparisonWithSaffireI) setSecond(v as SecondTrial); })
      .catch(() => undefined);
    return () => request.abort();
  }, []);
  return { model, second, error };
}

export function HabitatLab({ modeSwitch, onOpenCalibration }: { modeSwitch: ReactNode; onOpenCalibration: () => void }) {
  const { model, second, error } = useSaffire();
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
  const conditions = useMemo(() => ({ oxygen, pressure, flow, gravityG: gravityOf(gravity).g }), [oxygen, pressure, flow, gravity]);
  const grid = useMemo(() => buildGrid(zones, conditions), [zones, conditions]);
  const sibalRule = materialRule("SIBAL", conditions);
  const kernel = useMemo(() => model ? buildKernel(model, second, conditions, sibalRule.tier) : null, [model, second, conditions, sibalRule.tier]);

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
  }, [kernel, grid, ignition]);

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
    if (materialRule(zone.material, conditions).behavior === 0) {
      setNotice(`${zone.name}: material inerte nesta simulação. Escolha uma superfície combustível.`);
      return;
    }
    setIgnition({ col, row });
    setStep(0);
    setPlaying(true);
    setNotice(`Foco imposto em ${zone.name.toLowerCase()}. A ignição não é prevista; o modelo propaga a partir dela.`);
  }

  const time = step * CELL.stepSeconds;
  const tiers = zones.map((zone) => ({ zone, rule: materialRule(zone.material, conditions) }));
  const gravityEnv = gravityOf(gravity);

  return (
    <main className="workbench habitat-workbench">
      <aside className="scenario-panel" aria-label="Configurar habitat">
        <div className="panel-title">
          <Settings2 size={15} />
          <h2>Seu habitat</h2>
          <span className="tiny-tag">{gravityEnv.short}</span>
        </div>
        <section className="control-section">{modeSwitch}</section>
        <section className="control-section">
          <div className="step-label"><span>01</span><h3>Atmosfera e gravidade</h3><Wind size={14} /></div>
          <label className="preset-select">
            <select aria-label="Preset de ambiente" value={preset} onChange={(e) => applyPreset(e.target.value)}>
              <option value="custom" disabled>Condições personalizadas</option>
              {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {PRESETS.find((p) => p.id === preset) && <p className="preset-note">{PRESETS.find((p) => p.id === preset)!.note}</p>}
          <div className="gravity-select" role="group" aria-label="Gravidade">
            {GRAVITY_ENVIRONMENTS.map((env) => (
              <button key={env.id} type="button" aria-pressed={gravity === env.id}
                onClick={() => { setGravity(env.id); setPreset("custom"); restart(); }}>
                {env.label}<small>{env.short}</small>
              </button>
            ))}
          </div>
          <Range label="Oxigênio" unit="%" value={oxygen} min={15} max={40} step={0.1} onChange={(v) => { setOxygen(v); setPreset("custom"); restart(); }} />
          <Range label="Pressão" unit="kPa" value={pressure} min={35} max={110} step={0.1} onChange={(v) => { setPressure(v); setPreset("custom"); restart(); }} />
          <Range label="Ventilação ao longo do módulo" unit="cm/s" value={flow} min={0} max={40} step={0.5} onChange={(v) => { setFlow(v); setPreset("custom"); restart(); }} />
          <div className="partial-pressure"><span>Pressão parcial de O₂</span><strong>{num((pressure * oxygen) / 100)} <small>kPa</small></strong></div>
        </section>
        <section className="control-section">
          <div className="step-label"><span>02</span><h3>Materiais por zona</h3></div>
          <div className="zone-list">
            {zones.map((zone, i) => {
              const rule = tiers[i].rule;
              return (
                <label key={zone.id} className="zone-row">
                  <span className="zone-swatch" style={{ background: `rgb(${MATERIAL_INFO[zone.material].color.join(",")})` }} />
                  <span className="zone-name">{zone.name}<small>{zone.hint}</small></span>
                  <select aria-label={`Material de ${zone.name}`} value={zone.material} onChange={(e) => changeZone(i, e.target.value as MaterialId)}>
                    {MATERIAL_IDS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <i className={`tier-dot ${TIER_STYLE[rule.tier].className}`} title={`${TIER_STYLE[rule.tier].label}: ${rule.evidence}`} />
                </label>
              );
            })}
          </div>
          <p className="microcopy">Disposição e materiais são hipóteses de projeto editáveis, não um habitat real.</p>
        </section>
        <section className="control-section">
          <div className="step-label"><span>03</span><h3>Foco de ignição</h3><MousePointer2 size={14} /></div>
          <p className="preset-note">Clique em qualquer parede na cena. O foco é uma linha de 40 cm, como o fio de ignição do SAFFIRE I.</p>
        </section>
      </aside>

      <div className="visualization-column">
        <div className="scene-container habitat-scene">
          <div className="scene-topbar">
            <div className="scene-title"><i className="dot amber" /><span>HABITAT DE SUPERFÍCIE · MÓDULO 6,4 × Ø4 M</span></div>
            <span className="scene-scale">3D · {gravityEnv.label.toUpperCase()} {gravityEnv.short} · {TIER_STYLE[sibalRule.tier].label.toUpperCase()}</span>
          </div>
          <div className="scene-canvas">
            <SceneBoundary>
              <Suspense fallback={<div className="scene-loading"><LoaderCircle size={24} className="spin" /><span>Montando o módulo…</span></div>}>
                {model ? (
                  <HabitatScene material={grid.material} behavior={grid.behavior} ensemble={ensemble} step={step} run={run}
                    view={view} ignition={ignition} flow={flow} onIgnite={ignite} resetCameraKey={resetCameraKey} />
                ) : <div className="scene-fallback" role="status"><p>{error ?? "Carregando o modelo calibrado…"}</p></div>}
              </Suspense>
            </SceneBoundary>
          </div>
          <div className="scene-left-tools">
            <button className="tool-button" title="Restaurar câmera" aria-label="Restaurar câmera" onClick={() => setResetCameraKey((k) => k + 1)}><RotateCcw size={16} /></button>
          </div>
          <div className="scene-overlay-controls view-toggle" role="group" aria-label="Modo de visualização">
            <button className={view === "run" ? "active" : ""} onClick={() => setView("run")}>Uma realização</button>
            <button className={view === "probability" ? "active" : ""} onClick={() => setView("probability")}>Probabilidade ({SEED_COUNT})</button>
          </div>
          {notice && <div className="habitat-notice" role="status">{notice}</div>}
          {computing && <div className="habitat-computing"><LoaderCircle size={12} className="spin" /> calculando {SEED_COUNT} realizações</div>}
          <div className="scene-bottom">
            <div className="scene-legend habitat-legend">
              {view === "run" ? <>
                <span><i className="lg front" />frente</span>
                <span><i className="lg char" />alcançado</span>
              </> : <>
                <span className="prob-ramp"><i /> P(alcançado até t) 0 → 1</span>
              </>}
              <span><i className="lg unknown" />contato sem evidência</span>
              <span><i className="lg measured" />contato: não propagou em ensaio</span>
              <span><i className="lg flow" />ventilação</span>
            </div>
          </div>
        </div>

        <section className="playback-panel">
          <div className="playback-header">
            <div>
              <span className="eyebrow">PROPAGAÇÃO NA SUPERFÍCIE · TEMPO FÍSICO</span>
              <h2>{view === "run" ? `Realização ${run + 1} de ${SEED_COUNT}` : `Probabilidade sobre ${SEED_COUNT} realizações`}</h2>
            </div>
            <span className={`illustrative-pill tier-pill ${TIER_STYLE[sibalRule.tier].className}`}><Info size={12} />{TIER_STYLE[sibalRule.tier].label}</span>
          </div>
          <div className="timeline">
            <button className="play-button" aria-label={playing ? "Pausar" : "Reproduzir"} disabled={!ensemble}
              onClick={() => { if (step >= STEPS) setStep(0); setPlaying((p) => !p); }}>
              {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
            </button>
            <div className="timeline-track">
              <input type="range" aria-label="Tempo desde a ignição imposta" min={0} max={STEPS} step={1} value={step}
                onChange={(e) => { setPlaying(false); setStep(Number(e.target.value)); }}
                style={{ "--range-progress": `${(step / STEPS) * 100}%` } as React.CSSProperties} />
              <div className="timeline-ticks"><span>0</span><span>5 min</span><span>10 min</span><span>15 min</span><span>20 min</span></div>
            </div>
            <div className="time-readout"><strong>{fmtTime(time)}</strong><span>desde a ignição · {speed}×</span></div>
            <button className="speed-button" aria-label="Velocidade de reprodução" onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])}>{speed}×</button>
          </div>
          <div className="playback-footer">
            <p><Info size={12} />Passo de {CELL.stepSeconds} s e células de {CELL.alongMm} × {CELL.acrossMm} mm, a mesma grade da calibração.</p>
            <button className="button primary" disabled={!ensemble} onClick={() => { setRun((r) => (r + 1) % SEED_COUNT); setView("run"); setStep(0); setPlaying(true); }}>
              <Flame size={15} />Outra realização<ArrowRight size={15} />
            </button>
          </div>
        </section>
      </div>

      <aside className="evidence-panel model-panel habitat-panel" aria-label="Leitura científica">
        <div className="panel-title"><BookOpen size={15} /><h2>Leitura do cenário</h2>
          <span className={`model-badge ${TIER_STYLE[sibalRule.tier].className}`}>{TIER_STYLE[sibalRule.tier].label}</span></div>
        <div className="model-panel-body">
          <section className="habitat-kpis">
            <div>
              <span>Área alcançada em {fmtTime(time)}</span>
              <strong>{areaNow ? num(areaNow.median, 2) : "—"} <small>m²</small></strong>
              <em>{areaNow ? `${num(areaNow.min, 2)}–${num(areaNow.max, 2)} m² entre ${SEED_COUNT} realizações` : "calculando…"}</em>
            </div>
            <div>
              <span>Velocidade da frente</span>
              <strong>{metrics ? num(metrics.speedMmS, 2) : "—"} <small>mm/s</small></strong>
              <em>mediana entre faixas da linha de ignição, como nos ensaios</em>
            </div>
          </section>
          {metrics && <AreaChart curves={metrics.area} step={step} />}

          {second && <CrossTrial second={second} />}

          <section>
            <h3 className="model-h">Até onde o fogo chega</h3>
            <ul className="reach-list">
              {zones.map((zone, z) => {
                const events = metrics?.zoneEvents[z] ?? [];
                const happened = events.filter((e) => e >= 0 && e <= step).length;
                const all = events.filter((e) => e >= 0).map((e) => e * CELL.stepSeconds).sort((a, b) => a - b);
                const rule = tiers[z].rule;
                const kind = rule.behavior === 1 ? "chegada" : rule.behavior === 0 ? "" : "contato";
                return (
                  <li key={zone.id} className={TIER_STYLE[rule.tier].className}>
                    <span className="reach-zone">{zone.name}<small>{MATERIAL_INFO[zone.material].label}</small></span>
                    {rule.behavior === 0 ? <span className="reach-value muted">inerte</span> : (
                      <span className="reach-value">
                        <strong>{num((happened / SEED_COUNT) * 100, 0)}%</strong>
                        <small>{all.length ? `${kind} em ${fmtTime(all[all.length >> 1])} (mediana)` : `sem ${kind} em ${DURATION_S / 60} min`}</small>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="model-caption">Porcentagem de realizações em que o evento já ocorreu no instante atual. "Contato" significa que a frente chegou a um material que não propaga no modelo; a simulação para ali.</p>
          </section>

          <section>
            <h3 className="model-h">Evidência por material</h3>
            <ul className="evidence-list">
              {[...new Map(zones.map((z) => [z.material, z])).values()].map((zone) => {
                const rule = materialRule(zone.material, conditions);
                const Icon = rule.tier === "calibrated" ? CheckCircle2 : rule.tier === "unknown" ? HelpCircle : rule.tier === "inert" ? CircleSlash : AlertTriangle;
                return (
                  <li key={zone.material} className={TIER_STYLE[rule.tier].className}>
                    <Icon size={14} />
                    <div>
                      <strong>{zone.material} · {rule.title}</strong>
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
                <strong>{gravityEnv.label}: nenhum ensaio de propagação no PSI.</strong>
                <p>LUCI (centrífuga e voo parabólico) indica que alguns materiais queimam com menos O₂ em 1/6 g do que em 1 g; o SIBAL queima para baixo em gravidade lunar e se extingue em 1 g. O FM² vai medir isso na Lua. Esta simulação não aplica correção de gravidade.</p>
                <span className="gravity-links">
                  <a href={PARTIAL_GRAVITY_SOURCES.fm2} target="_blank" rel="noreferrer">FM² · NASA</a>
                  <a href={PARTIAL_GRAVITY_SOURCES.luci} target="_blank" rel="noreferrer">LUCI · NTRS</a>
                </span>
              </div>
            </div>
          )}

          <section>
            <h3 className="model-h">Premissas do modelo</h3>
            <ul className="assumptions">
              <li>Regra de transição e probabilidades do SAFFIRE I · S1 por vizinhança (montante, faixas laterais), na grade original de 10 × 20 mm e passo de 2 s.</li>
              <li>{kernel?.quench ? "Ventilação abaixo de 2 cm/s: regime de extinção radiativa para combustível fino (mapa de Olson); a propagação é suprimida, sem calibração." : sibalRule.tier === "calibrated" ? `Núcleo ${kernel?.reference ?? ""} aplicado sem escalonamento.` : `Núcleo ${kernel?.reference ?? ""}, intensidade × ${num(kernel?.flowFactor ?? 1, 2)} = (u/u_ref)^${num(kernel?.beta ?? 1, 2)}${second ? ", expoente medido entre os dois ensaios" : ", hipótese linear (segundo ensaio indisponível)"}; acima de 40 cm/s o fator é limitado (blowoff).`}</li>
              <li>O avanço ocorre a jusante da ventilação e lateralmente. Propagação contra o escoamento não é calibrada (amostra S2 ainda não processada).</li>
              <li>Zonas contíguas do mesmo material são tratadas como uma folha contínua; não há transferência por radiação entre superfícies separadas.</li>
              <li>Não modela fumaça, CO, calor liberado, detecção ou supressão. A faixa entre realizações é a variabilidade do próprio modelo, não incerteza experimental.</li>
            </ul>
          </section>

          <button className="button secondary calibration-link" onClick={onOpenCalibration}>
            Ver a calibração no ensaio SAFFIRE I · S1 <ArrowRight size={14} />
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

/** Out-of-trial check: the SAFFIRE-I kernel predicting SAFFIRE-III (30 cm/s) without refitting. */
function CrossTrial({ second }: { second: SecondTrial }) {
  const observed = second.observed.speedMmS;
  const rows = [
    { label: "SAFFIRE I, sem ajuste", value: second.prediction.unscaledSpeedMmS },
    { label: "SAFFIRE I, escala linear", value: second.prediction.linearFlowSpeedMmS },
    { label: "Observado no SAFFIRE-III", value: observed, observed: true },
  ];
  const max = Math.max(...rows.map((r) => r.value)) * 1.08;
  return (
    <section className="cross-trial">
      <h3 className="model-h">Teste em outro ensaio <span className="model-badge ok">independente</span></h3>
      <p className="model-caption">O modelo ajustado no SAFFIRE I (20 cm/s) previu a velocidade da frente no SAFFIRE-III (30 cm/s, mesmo tecido), sem usar dados deste ensaio.</p>
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
        Medido: {num(second.comparisonWithSaffireI.saffireIObservedSpeedMmS, 2)} mm/s a 20 cm/s e {num(observed, 2)} ± {num(second.observed.standardErrorMmS, 2)} mm/s a 30 cm/s,
        v ∝ u<sup>{num(second.comparisonWithSaffireI.beta, 2)}</sup>. A simulação usa esse expoente, não a hipótese linear. Dois ensaios não fixam a forma da curva; espessura (0,33 × 0,37 mm) e O₂ do SAFFIRE-III não são idênticos.
      </p>
    </section>
  );
}

function quantiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { min: sorted[0], median: sorted[sorted.length >> 1], max: sorted[sorted.length - 1] };
}

/** Front speed with the same statistic as the SAFFIRE trials: median over the strips of the
 *  40 cm ignition line of the furthest reached cell, OLS against time while inside the liner. */
function bandSpeed(arrival: Int16Array, steps: number, row0: number): number | null {
  const rows: Int16Array[] = [];
  for (let y = Math.max(0, row0 - 10); y < Math.min(GRID.rows, row0 + 10); y++) {
    const front = new Int16Array(steps + 1);
    for (let x = 0; x < GRID.cols; x++) {
      const a = arrival[y * GRID.cols + x];
      if (a >= 0 && x + 1 > front[a]) front[a] = x + 1;
    }
    for (let t = 1; t <= steps; t++) if (front[t - 1] > front[t]) front[t] = front[t - 1];
    rows.push(front);
  }
  const ts: number[] = [], xs: number[] = [];
  const start = [...rows.map((r) => r[0])].sort((a, b) => a - b)[rows.length >> 1];
  for (let t = 0; t <= steps; t += 5) {
    const median = rows.map((r) => r[t]).sort((a, b) => a - b)[rows.length >> 1];
    if (median >= GRID.cols - 5) break;
    if (median > start + 3) { ts.push(t * CELL.stepSeconds); xs.push(median * CELL.alongMm); }
  }
  if (ts.length < 4) return null;
  const mt = ts.reduce((a, b) => a + b) / ts.length, mx = xs.reduce((a, b) => a + b) / xs.length;
  let num = 0, den = 0;
  ts.forEach((t, i) => { num += (t - mt) * (xs[i] - mx); den += (t - mt) ** 2; });
  return num / den;
}

function computeMetrics(ensemble: EnsembleResult, zoneIndex: Uint8Array, behavior: Uint8Array, zoneCount: number, ignitionRow: number) {
  const steps = ensemble.steps;
  const area: Float32Array[] = [];
  const zoneEvents: number[][] = Array.from({ length: zoneCount }, () => []);
  const speeds: number[] = [];
  ensemble.arrivals.forEach((arrival, s) => {
    const histogram = new Float32Array(steps + 1);
    const first = new Array(zoneCount).fill(-1);
    for (let i = 0; i < arrival.length; i++) {
      const a = arrival[i];
      const z = zoneIndex[i];
      if (a >= 0) {
        histogram[a] += CELL_AREA_M2;
        if (first[z] < 0 || a < first[z]) first[z] = a;
      } else if (behavior[i] >= 2) {
        const c = ensemble.contacts[s][i];
        if (c >= 0 && (first[z] < 0 || c < first[z])) first[z] = c;
      }
    }
    for (let t = 1; t <= steps; t++) histogram[t] += histogram[t - 1];
    area.push(histogram);
    first.forEach((value, z) => zoneEvents[z].push(value));
    const speed = bandSpeed(arrival, steps, ignitionRow);
    if (speed !== null) speeds.push(speed);
  });
  speeds.sort((a, b) => a - b);
  return { area, zoneEvents, speedMmS: speeds.length ? speeds[speeds.length >> 1] : 0 };
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
    <svg className="front-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Área alcançada ao longo do tempo, mediana e faixa entre realizações">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - R} y1={y(yMax * f)} y2={y(yMax * f)} className="fc-grid" /><text x={L - 4} y={y(yMax * f) + 3} className="fc-tick" textAnchor="end">{num(yMax * f, 1)}</text></g>)}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => <text key={f} x={x(steps * f)} y={H - 5} className="fc-tick" textAnchor="middle">{num((steps * f * CELL.stepSeconds) / 60, 0)}′</text>)}
      <path d={band} className="fc-band" />
      <path d={line} className="fc-sim" />
      <line x1={x(step)} x2={x(step)} y1={T} y2={H - B} className="fc-now" />
      <text x={L + 4} y={T + 9} className="fc-label">área alcançada (m²)</text>
    </svg>
  );
}
