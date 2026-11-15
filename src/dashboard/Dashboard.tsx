import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Database, Flame, FlaskConical, LoaderCircle,
  Search, ShieldCheck, Sparkles,
} from "lucide-react";
import type { ResearchBundle, ResearchIntent, ResearchStatus } from "../research/types";
import type { NasaData } from "../types";
import { fetchStatus, research, ruleBasedRanking } from "./api";
import { CONTROL_FINDINGS, LUNAR_GAPS, type Module } from "./controls";
import { ENVIRONMENTS, FUNCTIONS, type EnvironmentId } from "./environments";
import { buildModelRows, QUANTITY_LABEL, rowsToCsv, type ModelRow, type Quantity } from "./modelingData";
import "./dashboard.css";

const SameSmokeObservation = lazy(() => import("../components/research/SameSmokeObservation"));
const SofieGelObservation = lazy(() => import("../components/research/SofieGelObservation"));
const BassB1Observation = lazy(() => import("../components/research/BassB1Observation"));

const n = (v: number | null | undefined, d = 2) => v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: d });

export interface DashboardProps {
  data: NasaData | null;
  onOpenCatalog: (investigationId?: string) => void;
  onOpenSimulation: () => void;
  onOpenBench: () => void;
  onOpenSources: () => void;
}

export function Dashboard({ data, onOpenCatalog, onOpenSimulation, onOpenBench, onOpenSources }: DashboardProps) {
  const [envId, setEnvId] = useState<EnvironmentId>("lunar-habitat");
  const env = ENVIRONMENTS.find((e) => e.id === envId)!;
  const [module, setModule] = useState<Module | null>(null);
  const stats = useCatalogStats(data);
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="dash">
      <section className="dash-hero">
        <div className="dash-hero-text">
          <span className="dash-eyebrow">NASA SPACE APPS 2026 · FLAME IN FREEFALL</span>
          <h1>Fire safety intelligence for crew habitats</h1>
          <p>An AI-powered dashboard that summarizes, ranks and interprets NASA combustion investigations to deliver fire safety insights for spacecraft, stations, lunar habitats and pressurized rovers.</p>
        </div>
        <nav className="dash-objectives" aria-label="Challenge objectives">
          {[
            { id: "identify", n: "1", t: "Identify the most relevant investigations", d: "for the fire safety needs of a crew environment" },
            { id: "extract", n: "2", t: "Extract data for predictive modeling", d: "of flammability and fire scenarios" },
            { id: "controls", n: "3", t: "Highlight research for next-generation controls", d: "prevention, detection, suppression, post-fire" },
          ].map((o) => (
            <button key={o.id} onClick={() => jump(o.id)}>
              <b>{o.n}</b><span><strong>{o.t}</strong><small>{o.d}</small></span><ArrowRight size={14} />
            </button>
          ))}
        </nav>
        <dl className="dash-kpis">
          <div><dt>Investigations</dt><dd>{stats.investigations}</dd><small>NASA PSI combustion</small></div>
          <div><dt>Records</dt><dd>{n(stats.records, 0)}</dd><small>tabular rows, original units</small></div>
          <div><dt>Videos</dt><dd>{n(stats.videos, 0)}</dd><small>linked raw NASA videos</small></div>
          <div><dt>Document passages</dt><dd>{n(stats.passages, 0)}</dd><small>cited by the AI answers</small></div>
          <div><dt>Trials analysed</dt><dd>{stats.trials || "—"}</dd><small>SAFFIRE I–VI, frame by frame</small></div>
        </dl>
      </section>

      <section className="dash-env" aria-label="Crew environment">
        <h2>Which habitable environment are you designing for?</h2>
        <div className="env-grid">
          {ENVIRONMENTS.map((e) => (
            <button key={e.id} aria-pressed={e.id === envId} onClick={() => setEnvId(e.id)}>
              <strong>{e.label}</strong>
              <span>{e.gravity} · {e.atmosphere}</span>
              <small>{e.why}</small>
            </button>
          ))}
        </div>
      </section>

      <IdentifySection env={env} data={data} onOpenCatalog={onOpenCatalog} />
      <ExtractSection onOpenSimulation={onOpenSimulation} onOpenBench={onOpenBench} />
      <ControlsSection onOpenCatalog={onOpenCatalog} onModule={setModule} lunarFocus={env.gravity === "1/6 g"} />

      <section className="dash-footer-cta">
        <div>
          <h3><Flame size={16} /> Fire scenario simulation</h3>
          <p>The extracted SAFFIRE data drive a calibrated stochastic surface-spread model inside a 3D lunar habitat, with design alternatives and validity labels.</p>
        </div>
        <button className="button primary" onClick={onOpenSimulation}>Open the simulation lab <ArrowRight size={14} /></button>
        <button className="button secondary" onClick={onOpenSources}><BookOpen size={14} /> Data sources</button>
      </section>

      {module && (
        <Suspense fallback={<div className="modal-backdrop"><p className="evidence-loading">Loading evidence module…</p></div>}>
          {module === "same" && <SameSmokeObservation onClose={() => setModule(null)} />}
          {module === "sofie" && <SofieGelObservation onClose={() => setModule(null)} />}
          {module === "bass2" && <BassB1Observation onClose={() => setModule(null)} />}
        </Suspense>
      )}
    </div>
  );
}

function useCatalogStats(data: NasaData | null) {
  const [extra, setExtra] = useState({ videos: 0, passages: 0, trials: 0 });
  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    const get = (p: string) => fetch(`${base}${p}`).then((r) => r.ok ? r.json() : null).catch(() => null);
    void Promise.all([get("data/nasa-media.json"), get("data/research-corpus.json"), get("data/saffire/trial-registry.json")]).then(([media, corpus, registry]) => {
      const videos = media ? Object.values(media.investigations ?? {}).reduce((s: number, v: any) => s + (v?.videos?.length ?? v?.videoCount ?? 0), 0) : 0;
      const passages = corpus ? (corpus.documents ?? []).reduce((s: number, d: any) => s + (d.passages?.length ?? 0), 0) : 0;
      setExtra({ videos, passages, trials: registry?.trials?.length ?? 0 });
    });
  }, []);
  return {
    investigations: data?.investigations.length ?? 0,
    records: data?.investigations.reduce((s, i) => s + (Number(i.testCount) || 0), 0) ?? 0,
    ...extra,
  };
}

// ---------------- 1 · Identify ----------------

function IdentifySection({ env, data, onOpenCatalog }: { env: (typeof ENVIRONMENTS)[number]; data: NasaData | null; onOpenCatalog: (id?: string) => void }) {
  const [intent, setIntent] = useState<ResearchIntent>("prevention");
  const [question, setQuestion] = useState(env.defaultQuestion);
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [bundle, setBundle] = useState<ResearchBundle | null>(null);
  const [summary, setSummary] = useState<ResearchBundle | null>(null);
  const [busy, setBusy] = useState<"search" | "synthesize" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => { setQuestion(env.defaultQuestion); }, [env.id]);
  useEffect(() => { const a = new AbortController(); fetchStatus(a.signal).then(setStatus).catch(() => setStatus(null)); return () => a.abort(); }, []);

  async function run(kind: "search" | "synthesize") {
    abort.current?.abort();
    const a = new AbortController();
    abort.current = a;
    setBusy(kind); setError(null);
    try {
      const result = await research(kind, question, intent, env.context, kind === "search" ? 10 : 6, a.signal);
      if (a.signal.aborted) return;
      if (kind === "search") { setBundle(result); setSummary(null); } else setSummary(result);
    } catch (e) {
      if (!a.signal.aborted) setError(e instanceof Error ? e.message : "Research service unavailable.");
    } finally { if (!a.signal.aborted) setBusy(null); }
  }
  // Rank automatically for the chosen environment and function.
  useEffect(() => { const t = setTimeout(() => void run("search"), 250); return () => clearTimeout(t); }, [env.id, intent]);

  const fallback = useMemo(() => error && data ? ruleBasedRanking(data.investigations, intent).slice(0, 8) : [], [error, data, intent]);
  const answer = summary ?? bundle;
  return (
    <section className="dash-section" id="identify">
      <header className="dash-section-head">
        <span className="obj-num">1</span>
        <div>
          <h2>Identify the investigations most relevant to your crew environment</h2>
          <p>Hybrid retrieval ranks the 24 NASA PSI investigations and their records for <strong>{env.label.toLowerCase()}</strong>; Claude summarizes the top evidence with verified citations.</p>
        </div>
      </header>
      <div className="ask">
        <div className="ask-row">
          <Search size={16} />
          <input aria-label="Ask the evidence" value={question} onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void run("search"); }} />
          <button className="button secondary" disabled={!question.trim() || busy !== null} onClick={() => void run("search")}>
            {busy === "search" ? <LoaderCircle size={14} className="spin" /> : <Search size={14} />} Rank evidence
          </button>
          <button className="button primary" disabled={!question.trim() || busy !== null || !status?.generationConfigured} onClick={() => void run("synthesize")}
            title={status?.generationConfigured ? "Claude summary with verified citations" : "AI synthesis not configured on this server"}>
            {busy === "synthesize" ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />} Summarize with AI
          </button>
        </div>
        <div className="fn-tabs" role="tablist" aria-label="Fire safety function">
          {FUNCTIONS.map((f) => (
            <button key={f.id} role="tab" aria-selected={intent === f.id} onClick={() => setIntent(f.id)}>{f.label}<small>{f.hint}</small></button>
          ))}
        </div>
        <p className="ask-meta">
          {status ? <>Retrieval: {status.retrievalMode === "hybrid" ? "hybrid (lexical + vector)" : "lexical + structured"}{status.generationModel ? ` · synthesis: ${status.generationModel}` : ""}{status.embeddingModel ? ` · embeddings: ${status.embeddingModel}` : ""}</> : "Research service status unknown"}
          {" · "}context sent as {env.geometryAnalog}, {env.context.oxygenPct}% O₂, {env.context.pressureKpa} kPa, {env.context.gravityG} g
        </p>
      </div>

      {error && (
        <div className="dash-warn" role="alert"><AlertTriangle size={14} /> AI ranking unavailable ({error}). Showing a transparent rule-based ordering by investigation category instead.</div>
      )}

      {answer && (
        <div className="answer">
          <div className="answer-head">
            <span className={`mode ${answer.synthesisMode}`}>{answer.synthesisMode === "claude" ? "AI summary · Claude" : "Extractive summary"}</span>
            <span className="mode">{answer.retrievalMode}</span>
          </div>
          <p className="answer-summary">{answer.summary}</p>
          {answer.findings.length > 0 && (() => {
            const list = (
              <ul className="answer-findings">
                {answer.findings.map((f, i) => (
                  <li key={i}>{f.text}{f.sourceIds.map((id) => {
                    const k = answer.sources.findIndex((s) => s.id === id);
                    return k >= 0 ? <a key={id} href={`#src-${id}`} className="cite">[{k + 1}]</a> : null;
                  })}</li>
                ))}
              </ul>
            );
            return answer.synthesisMode === "claude" ? list : (
              <details className="passages">
                <summary>Show {answer.findings.length} retrieved passages (verbatim, not summarized)</summary>
                {list}
              </details>
            );
          })()}
          {answer.gaps.length > 0 && <p className="answer-gaps"><AlertTriangle size={12} /> {answer.gaps.join(" ")}</p>}
        </div>
      )}

      <ol className="rank-list">
        {(bundle?.investigations ?? []).map((r, i) => (
          <li key={r.investigation.id} className={r.relevance}>
            <span className="rank-n">{i + 1}</span>
            <div className="rank-main">
              <div className="rank-title">
                <strong>{r.investigation.name}</strong><small>{r.investigation.id} · {r.investigation.title}</small>
                <span className={`rel ${r.relevance}`}>{r.relevance === "related" ? "directly related" : r.relevance === "analog" ? "analog" : "context"}</span>
              </div>
              <span className="score-bar" aria-label={`retrieval score ${n(r.score, 2)}`}><i style={{ width: `${Math.min(100, r.score * 100)}%` }} /></span>
              {r.reasons.length > 0 && <p className="why"><b>Why:</b> {r.reasons.slice(0, 3).join(" · ")}</p>}
              {(r.mismatches.length > 0 || r.unknowns.length > 0) && <p className="caveat"><b>Differs:</b> {[...r.mismatches, ...r.unknowns].slice(0, 3).join(" · ")}</p>}
            </div>
            <button className="text-link" onClick={() => onOpenCatalog(r.investigation.id)}>{r.records.length} records <ArrowUpRight size={12} /></button>
          </li>
        ))}
        {!bundle && fallback.map((r, i) => (
          <li key={r.investigation.id} className="context">
            <span className="rank-n">{i + 1}</span>
            <div className="rank-main">
              <div className="rank-title"><strong>{r.investigation.name}</strong><small>{r.investigation.id} · {r.investigation.title}</small><span className="rel context">rule-based</span></div>
              <p className="why">{r.reason}</p>
            </div>
            <button className="text-link" onClick={() => onOpenCatalog(r.investigation.id)}>open <ArrowUpRight size={12} /></button>
          </li>
        ))}
        {busy === "search" && !bundle && <li className="rank-loading"><LoaderCircle size={14} className="spin" /> Ranking investigations…</li>}
      </ol>
      {answer && answer.sources.length > 0 && (
        <details className="sources-list">
          <summary>{answer.sources.length} cited sources</summary>
          <ol>{answer.sources.map((s) => <li key={s.id} id={`src-${s.id}`}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> <small>{s.location}</small></li>)}</ol>
        </details>
      )}
      <p className="dash-note">Retrieval scores rank relevance; they are not fire-risk probabilities. Lunar and rover contexts are outside most measured conditions and are flagged as such.</p>
    </section>
  );
}

// ---------------- 2 · Extract ----------------

function ExtractSection({ onOpenSimulation, onOpenBench }: { onOpenSimulation: () => void; onOpenBench: () => void }) {
  const [rows, setRows] = useState<ModelRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [quantity, setQuantity] = useState<Quantity | "all">("spread-rate");
  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    const get = (p: string) => fetch(`${base}data/${p}`).then((r) => r.ok ? r.json() : undefined).catch(() => undefined);
    void Promise.all([get("modeling-targets.json"), get("saffire/trial-registry.json"), get("sofie/gel-evidence.json"), get("same/smoke-analysis.json"), get("bass2/b1-replay.json")])
      .then(([targets, registry, sofie, same, bass]) => {
        if (!targets && !registry) { setFailed(true); return; }
        setRows(buildModelRows({ targets, registry, sofie, same, bass }));
      });
  }, []);
  const shown = (rows ?? []).filter((r) => quantity === "all" || r.quantity === quantity);
  const download = (name: string, text: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };
  const counts = (q: Quantity) => (rows ?? []).filter((r) => r.quantity === q).length;
  return (
    <section className="dash-section" id="extract">
      <header className="dash-section-head">
        <span className="obj-num">2</span>
        <div>
          <h2>Extract data that supports predictive modeling</h2>
          <p>Model-ready quantities from SAFFIRE I–VI, BASS-II, SoFIE-GEL and SAME, each with its observable, conditions and source. Different observables are never merged.</p>
        </div>
        <div className="extract-actions">
          <button className="button secondary" disabled={!rows} onClick={() => download("habitatfire-modeling-data.csv", rowsToCsv(shown), "text/csv")}><ArrowDownToLine size={13} /> CSV</button>
          <button className="button secondary" disabled={!rows} onClick={() => download("habitatfire-modeling-data.json", JSON.stringify(shown, null, 2), "application/json")}><ArrowDownToLine size={13} /> JSON</button>
        </div>
      </header>
      {failed && <div className="dash-warn"><AlertTriangle size={14} /> Modeling data files could not be loaded.</div>}
      <div className="q-tabs" role="tablist" aria-label="Quantity">
        {(Object.keys(QUANTITY_LABEL) as Quantity[]).map((q) => (
          <button key={q} role="tab" aria-selected={quantity === q} onClick={() => setQuantity(q)}>{QUANTITY_LABEL[q]} <small>{counts(q)}</small></button>
        ))}
        <button role="tab" aria-selected={quantity === "all"} onClick={() => setQuantity("all")}>All <small>{rows?.length ?? 0}</small></button>
      </div>
      <div className="extract-grid">
        {quantity === "spread-rate" && rows && <SpreadChart rows={rows} />}
        <div className="model-table-wrap">
          <table className="model-table">
            <thead><tr><th>Dataset</th><th>Value</th><th>Observable</th><th>Material</th><th>O₂ %</th><th>kPa</th><th>Flow cm/s</th><th>Source</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <th>{r.dataset}<small>{r.investigation}</small></th>
                  <td className="v">{typeof r.value === "number" ? n(r.value) : r.value} <small>{r.unit}</small></td>
                  <td>{r.observable}{r.note && <small>{r.note}</small>}</td>
                  <td>{r.material}</td><td>{r.oxygenPct}</td><td>{String(r.pressureKpa)}</td><td>{r.flowCmS}</td>
                  <td>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.source}</a> : r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="extract-cta">
        <p><ShieldCheck size={14} /> These rows calibrate and validate the fire-spread simulation: SAFFIRE I and III set its neighbourhood kernels, VI-2 anchors the exploration atmosphere.</p>
        <button className="button primary" onClick={onOpenSimulation}><Flame size={14} /> See the model built on this data</button>
        <button className="button secondary" onClick={onOpenBench}><FlaskConical size={14} /> Compare trials in the specialist bench</button>
      </div>
    </section>
  );
}

function SpreadChart({ rows }: { rows: ModelRow[] }) {
  const pts = rows.filter((r) => r.quantity === "spread-rate" && r.unit === "mm/s" && typeof r.value === "number")
    .map((r) => {
      const o2 = r.oxygenPct.split("–").map(Number).filter(Number.isFinite);
      return { r, x: o2.length ? o2.reduce((a, b) => a + b) / o2.length : NaN, y: r.value as number };
    }).filter((p) => Number.isFinite(p.x));
  const W = 420, H = 230, L = 40, R = 12, T = 14, B = 34;
  const x0 = 20, x1 = 33, y1 = Math.ceil(Math.max(...pts.map((p) => p.y), 4.5));
  const x = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const y = (v: number) => T + (1 - v / y1) * (H - T - B);
  const color = (o: string) => o.startsWith("char") ? "#f4a467" : o.startsWith("flame") ? "#5de6e3" : "#b39bff";
  return (
    <figure className="spread-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Flame spread rate versus oxygen concentration for SAFFIRE trials">
        {[0, 1, 2, 3, 4, 5].filter((v) => v <= y1).map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="g" /><text x={L - 6} y={y(v) + 3} className="t" textAnchor="end">{v}</text></g>)}
        {[20, 22, 24, 26, 28, 30, 32].map((v) => <text key={v} x={x(v)} y={H - 16} className="t" textAnchor="middle">{v}%</text>)}
        <text x={W / 2} y={H - 3} className="t" textAnchor="middle">O₂ (mol %)</text>
        <text x={10} y={T + 4} className="t" textAnchor="start">mm/s</text>
        <rect x={x(31)} y={T} width={x(35) - x(31)} height={H - T - B} className="lunar-band" />
        <text x={x(31) + 3} y={T + 10} className="t lunar">exploration atmosphere</text>
        {pts.map((p) => (
          <g key={p.r.id}>
            <circle cx={x(p.x)} cy={y(p.y)} r={4.5} fill={color(p.r.observable)} opacity={0.9}><title>{`${p.r.dataset}: ${p.y} mm/s at ${p.r.oxygenPct}% O₂, ${p.r.pressureKpa} kPa, ${p.r.flowCmS} cm/s (${p.r.observable})`}</title></circle>
          </g>
        ))}
      </svg>
      <figcaption>
        <span><i style={{ background: "#f4a467" }} />char front (image tracking)</span>
        <span><i style={{ background: "#5de6e3" }} />flame base (published)</span>
        <span><i style={{ background: "#b39bff" }} />published / table rate</span>
        <em>Descriptive: pressure, flow, sample size and observable differ between points; this is not a fitted O₂ effect.</em>
      </figcaption>
    </figure>
  );
}

// ---------------- 3 · Controls & equipment ----------------

function ControlsSection({ onOpenCatalog, onModule, lunarFocus }: { onOpenCatalog: (id?: string) => void; onModule: (m: Module) => void; lunarFocus: boolean }) {
  const [fn, setFn] = useState<ResearchIntent | "all">("all");
  const cards = CONTROL_FINDINGS.filter((c) => fn === "all" || c.fn === fn);
  const MODULE_LABEL: Record<Module, string> = { same: "Open SAME smoke analysis", sofie: "Open SoFIE-GEL evidence", bass2: "Open BASS-II B1 video analysis" };
  return (
    <section className="dash-section" id="controls">
      <header className="dash-section-head">
        <span className="obj-num">3</span>
        <div>
          <h2>Research that informs next-generation fire safety controls and equipment</h2>
          <p>Findings grouped by what a fire safety system has to do. Each card separates the measured or published result from the design implication.</p>
        </div>
      </header>
      <div className="fn-tabs" role="tablist" aria-label="Function filter">
        <button role="tab" aria-selected={fn === "all"} onClick={() => setFn("all")}>All<small>{CONTROL_FINDINGS.length} findings</small></button>
        {FUNCTIONS.map((f) => (
          <button key={f.id} role="tab" aria-selected={fn === f.id} onClick={() => setFn(f.id)}>{f.label}<small>{CONTROL_FINDINGS.filter((c) => c.fn === f.id).length} findings</small></button>
        ))}
      </div>
      <div className="control-grid">
        {cards.map((c) => (
          <article key={c.id} className={`control-card ${c.fn} ${c.lunar && lunarFocus ? "lunar" : ""}`}>
            <header><span className={`fn-tag ${c.fn}`}>{FUNCTIONS.find((f) => f.id === c.fn)?.label}</span><span className="lvl">{c.level}</span>{c.lunar && <span className="lunar-tag">lunar</span>}</header>
            <h3>{c.title}</h3>
            <p className="finding">{c.finding}</p>
            <p className="implication"><b>Design implication</b>{c.implication}</p>
            <footer>
              {c.investigations.map((id) => <button key={id} className="chip" onClick={() => onOpenCatalog(id)}><Database size={11} />{id}</button>)}
              {c.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="src">{s.label} <ArrowUpRight size={10} /></a>)}
              {c.module && <button className="button secondary module-btn" onClick={() => onModule(c.module!)}>{MODULE_LABEL[c.module]} <ArrowRight size={12} /></button>}
            </footer>
          </article>
        ))}
      </div>
      <div className="gaps">
        <h3><AlertTriangle size={14} /> Evidence gaps for lunar habitats and rovers</h3>
        <ul>{LUNAR_GAPS.map((g) => <li key={g}>{g}</li>)}</ul>
      </div>
    </section>
  );
}
