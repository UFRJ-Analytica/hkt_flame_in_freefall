import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, CheckCircle2, CircleDashed, Database, FileText,
  FlaskConical, History, LoaderCircle, Rocket, Search, Sparkles, X,
} from "lucide-react";
import type { ResearchBundle, ResearchIntent, ResearchStatus } from "../research/types";
import type { NasaData } from "../types";
import { englishDisplayData } from "../i18n/english";
import { SIPanel } from "../si/SIPanel";
import type { SIAction } from "../si/useSI";
import { fetchStatus, research, ruleBasedRanking } from "./api";
import { CONTROL_FINDINGS, LESSONS, LUNAR_GAPS, SYSTEMS, type Module, type SystemId } from "./controls";
import { CHALLENGE_RESOURCES, EXTRA_SOURCES } from "./coverage";
import { ENVIRONMENTS, FUNCTIONS, type EnvironmentId } from "./environments";
import { buildModelRows, psiRecordRows, QUANTITY_HINT, QUANTITY_LABEL, rowsToCsv, type ModelRow, type Quantity } from "./modelingData";
import "./dashboard.css";
import "./dashboard-v2.css";

const SameSmokeObservation = lazy(() => import("../components/research/SameSmokeObservation"));
const SofieGelObservation = lazy(() => import("../components/research/SofieGelObservation"));
const BassB1Observation = lazy(() => import("../components/research/BassB1Observation"));

const n = (v: number | null | undefined, d = 2) => v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: d });
type Env = (typeof ENVIRONMENTS)[number];
interface CorpusDoc { id: string; title: string; url: string; role?: string; passages: unknown[] }

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
  const indexed = CHALLENGE_RESOURCES.filter((r) => r.status !== "metadata-only").length;

  return (
    <div className="dash">
      <section className="dash-hero">
        <div className="dash-hero-text">
          <span className="dash-eyebrow">NASA SPACE APPS 2026 · FLAME IN FREEFALL</span>
          <h1>Fire safety intelligence for crew habitats</h1>
          <p>Ask SI, our research assistant, to find, rank and interpret NASA combustion evidence for spacecraft, stations, lunar habitats and rovers. Every answer cites the NASA document passage or PSI record it came from.</p>
          <button className="dash-coverage-link" onClick={() => jump("coverage")}>
            <CheckCircle2 size={13} /> {indexed} of {CHALLENGE_RESOURCES.length} challenge resources in the knowledge base · see coverage
          </button>
        </div>
        <nav className="dash-objectives" aria-label="Challenge objectives">
          {[
            { id: "identify", n: "1", t: "Identify the most relevant investigations", d: "ask SI or search the evidence semantically" },
            { id: "extract", n: "2", t: "Extract data for predictive modeling", d: "filter, select and download model-ready rows" },
            { id: "controls", n: "3", t: "Highlight research for next-generation controls", d: "evidence brief per fire-safety system" },
          ].map((o) => (
            <button key={o.id} onClick={() => jump(o.id)}>
              <b>{o.n}</b><span><strong>{o.t}</strong><small>{o.d}</small></span><ArrowRight size={14} />
            </button>
          ))}
        </nav>
        <dl className="dash-kpis">
          <div><dt>PSI investigations</dt><dd>{stats.investigations}</dd><small>all of PSI Combustion Science</small></div>
          <div><dt>Test records</dt><dd>{n(stats.records, 0)}</dd><small>tabular rows, original units</small></div>
          <div><dt>NASA documents</dt><dd>{stats.documents || "—"}</dd><small>{n(stats.passages, 0)} passages, semantically indexed</small></div>
          <div><dt>Raw videos</dt><dd>{n(stats.videos, 0)}</dd><small>linked from PSI</small></div>
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
      <ExtractSection env={env} data={data} onOpenCatalog={onOpenCatalog} onOpenSimulation={onOpenSimulation} onOpenBench={onOpenBench} />
      <ControlsSection env={env} onOpenCatalog={onOpenCatalog} onModule={setModule} />
      <CoverageSection docs={stats.docs} onOpenSources={onOpenSources} />

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
  const [extra, setExtra] = useState<{ videos: number; passages: number; trials: number; documents: number; docs: CorpusDoc[] }>({ videos: 0, passages: 0, trials: 0, documents: 0, docs: [] });
  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    const get = (p: string) => fetch(`${base}${p}`).then((r) => r.ok ? r.json() : null).catch(() => null);
    void Promise.all([get("data/nasa-media.json"), get("data/research-corpus.json"), get("data/saffire/trial-registry.json")]).then(([media, corpus, registry]) => {
      const videos = media ? Object.values(media.investigations ?? {}).reduce((s: number, v: any) => s + (v?.videos?.length ?? v?.videoCount ?? 0), 0) : 0;
      const docs: CorpusDoc[] = corpus?.documents ?? [];
      setExtra({ videos, passages: docs.reduce((s, d) => s + (d.passages?.length ?? 0), 0), trials: registry?.trials?.length ?? 0, documents: docs.length, docs });
    });
  }, []);
  return {
    investigations: data?.investigations.length ?? 0,
    records: data?.investigations.reduce((s, i) => s + (Number(i.testCount) || 0), 0) ?? 0,
    ...extra,
  };
}

function SectionHead({ n: num, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <header className="dash-section-head">
      <span className="obj-num">{num}</span>
      <div><h2>{title}</h2><p>{children}</p></div>
    </header>
  );
}

// ---------------- 1 · Identify ----------------

interface Passage { id: string; kind: string; title: string; url: string; location: string; text: string; investigationIds: string[]; role: string; relevance: number }

function IdentifySection({ env, data, onOpenCatalog }: { env: Env; data: NasaData | null; onOpenCatalog: (id?: string) => void }) {
  const [focus, setFocus] = useState<ResearchIntent>("prevention");
  const [bundle, setBundle] = useState<ResearchBundle | null>(null);
  const [rankedBy, setRankedBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"ranking" | "semantic">("ranking");
  const [status, setStatus] = useState<(ResearchStatus & { siConfigured?: boolean }) | null>(null);
  const abort = useRef<AbortController | null>(null);
  const skipQuick = useRef(false);

  useEffect(() => { const a = new AbortController(); fetchStatus(a.signal).then(setStatus).catch(() => setStatus(null)); return () => a.abort(); }, []);
  useEffect(() => {
    if (skipQuick.current) { skipQuick.current = false; return; }
    abort.current?.abort();
    const a = new AbortController();
    abort.current = a;
    setBusy(true); setError(null);
    research("search", env.defaultQuestion, focus, env.context, 10, a.signal)
      .then((b) => { if (!a.signal.aborted) { setBundle(b); setRankedBy(`Quick ranking for ${env.short.toLowerCase()} · ${FUNCTIONS.find((f) => f.id === focus)?.label.toLowerCase()}`); } })
      .catch((e) => { if (!a.signal.aborted) setError(e instanceof Error ? e.message : "Research service unavailable."); })
      .finally(() => { if (!a.signal.aborted) setBusy(false); });
    return () => a.abort();
  }, [env.id, focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const fallback = useMemo(() => error && data ? ruleBasedRanking(data.investigations, focus).slice(0, 8) : [], [error, data, focus]);
  const suggestions = [
    env.defaultQuestion.endsWith("?") ? env.defaultQuestion : `Which NASA investigations matter most for: ${env.defaultQuestion.toLowerCase()}?`,
    `How should smoke detection differ in a ${env.short.toLowerCase()}, and which experiments support that?`,
    `What evidence is missing before NASA data can be applied to a ${env.label.toLowerCase()}?`,
  ];

  return (
    <section className="dash-section" id="identify">
      <SectionHead n="1" title="Identify the investigations most relevant to your crew environment">
        Ask SI in plain language. It searches the NASA documents and PSI data, ranks the investigations for the <strong>{env.label.toLowerCase()}</strong>, and explains why each one matters and how it differs from your environment.
      </SectionHead>
      <div className="identify-grid">
        <SIPanel
          context={{ stage: "identify", environment: env.id }}
          intro={status && status.siConfigured === false ? "SI is not configured on this server; the ranking and semantic search on the right still work." : "Ask anything about fire safety evidence for your environment. SI uses semantic search and the investigation ranking as tools, and the list on the right updates when it re-ranks."}
          suggestions={suggestions}
          placeholder={`Ask SI about the ${env.short.toLowerCase()}…`}
          onRanking={(b, f) => {
            abort.current?.abort(); setBusy(false); setError(null);
            if (f !== focus && FUNCTIONS.some((x) => x.id === f)) { skipQuick.current = true; setFocus(f as ResearchIntent); }
            setBundle(b); setTab("ranking"); setRankedBy(`Ranked by SI · ${f} · “${b.question.slice(0, 70)}${b.question.length > 70 ? "…" : ""}”`); }}
          onOpenInvestigation={onOpenCatalog}
        />
        <div className="evidence-pane">
          <div className="pane-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "ranking"} onClick={() => setTab("ranking")}>Ranked investigations</button>
            <button role="tab" aria-selected={tab === "semantic"} onClick={() => setTab("semantic")}>Semantic search</button>
          </div>
          {tab === "ranking" ? (
            <>
              <div className="pane-bar">
                <label>Fire-safety focus
                  <select value={focus} onChange={(e) => setFocus(e.target.value as ResearchIntent)}>
                    {FUNCTIONS.map((f) => <option key={f.id} value={f.id}>{f.label} — {f.hint}</option>)}
                  </select>
                </label>
                <span className="pane-meta">{busy ? <><LoaderCircle size={11} className="spin" /> ranking…</> : rankedBy}</span>
              </div>
              {error && <div className="dash-warn" role="alert"><AlertTriangle size={14} /> Ranking service unavailable ({error}). Showing a transparent rule-based ordering by investigation category.</div>}
              <RankList bundle={bundle} fallback={bundle ? [] : fallback} onOpenCatalog={onOpenCatalog} />
              {bundle && bundle.gaps.length > 0 && <p className="answer-gaps"><AlertTriangle size={12} /> {bundle.gaps.join(" ")}</p>}
              <p className="dash-note">Scores rank relevance to the question, not fire risk. Retrieval: {status?.retrievalMode === "hybrid" ? "hybrid (BM25 + Voyage embeddings in MongoDB Atlas)" : status ? "lexical + structured" : "unknown"}.</p>
            </>
          ) : <SemanticSearch env={env} onOpenCatalog={onOpenCatalog} />}
        </div>
      </div>
    </section>
  );
}

function RankList({ bundle, fallback, onOpenCatalog }: { bundle: ResearchBundle | null; fallback: ReturnType<typeof ruleBasedRanking>; onOpenCatalog: (id?: string) => void }) {
  return (
    <ol className="rank-list">
      {(bundle?.investigations ?? []).map((r, i) => (
        <li key={r.investigation.id} className={r.relevance}>
          <span className="rank-n">{i + 1}</span>
          <div className="rank-main">
            <div className="rank-title">
              <strong>{r.investigation.name}</strong><small>{r.investigation.id} · {r.investigation.title}</small>
              <span className={`rel ${r.relevance}`}>{r.relevance === "related" ? "directly related" : r.relevance === "analog" ? "analog" : "context"}</span>
            </div>
            {r.reasons.length > 0 && <p className="why"><b>Why:</b> {r.reasons.slice(0, 2).join(" · ")}</p>}
            {r.mismatches.length > 0 && <p className="caveat"><b>Differs:</b> {r.mismatches.slice(0, 2).join(" · ")}</p>}
          </div>
          <button className="text-link" onClick={() => onOpenCatalog(r.investigation.id)}>{r.records.length} records <ArrowUpRight size={12} /></button>
        </li>
      ))}
      {fallback.map((r, i) => (
        <li key={r.investigation.id} className="context">
          <span className="rank-n">{i + 1}</span>
          <div className="rank-main">
            <div className="rank-title"><strong>{r.investigation.name}</strong><small>{r.investigation.id} · {r.investigation.title}</small><span className="rel context">rule-based</span></div>
            <p className="why">{r.reason}</p>
          </div>
          <button className="text-link" onClick={() => onOpenCatalog(r.investigation.id)}>open <ArrowUpRight size={12} /></button>
        </li>
      ))}
    </ol>
  );
}

function SemanticSearch({ env, onOpenCatalog }: { env: Env; onOpenCatalog: (id?: string) => void }) {
  const [query, setQuery] = useState(env.defaultQuestion);
  const [scope, setScope] = useState<"any" | "documents" | "investigations">("any");
  const [hits, setHits] = useState<Passage[] | null>(null);
  const [mode, setMode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    if (!query.trim()) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/research/retrieve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, limit: 10, scope }) });
      if (!r.ok || !r.headers.get("content-type")?.includes("json")) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      setHits(body.passages); setMode(body.retrieval);
    } catch (e) { setError(e instanceof Error ? e.message : "Search unavailable."); } finally { setBusy(false); }
  }
  const top = hits?.[0]?.relevance ?? 1;
  return (
    <div className="semantic">
      <form className="ask-row" onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <Search size={15} />
        <input aria-label="Semantic search query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Describe what you are looking for…" />
        <select aria-label="Search scope" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
          <option value="any">All sources</option><option value="documents">NASA documents</option><option value="investigations">PSI investigations</option>
        </select>
        <button className="button secondary" disabled={busy || !query.trim()}>{busy ? <LoaderCircle size={13} className="spin" /> : <Search size={13} />} Search</button>
      </form>
      <p className="dash-note">Pure retrieval, no AI writing: passages ranked by meaning (embeddings) and keywords, shown verbatim with their location.{mode && ` Mode: ${mode}.`}</p>
      {error && <div className="dash-warn"><AlertTriangle size={14} /> {error}</div>}
      <ol className="passage-list">
        {(hits ?? []).map((h) => (
          <li key={h.id}>
            <div className="passage-head">
              <span className={`kind ${h.kind === "metadata" ? "psi" : h.role}`}>{h.kind === "metadata" ? "PSI investigation" : h.role === "mishap" ? "historical mishap" : h.role === "spinoff" ? "spinoff" : "NASA document"}</span>
              <a href={h.url} target="_blank" rel="noreferrer">{h.title}</a>
              <span className="score-bar" title="relative relevance"><i style={{ width: `${Math.round((h.relevance / top) * 100)}%` }} /></span>
            </div>
            <p>{h.text}</p>
            <footer><small>{h.location}</small>{h.investigationIds.map((id) => <button key={id} className="chip" onClick={() => onOpenCatalog(id)}><Database size={10} />{id}</button>)}</footer>
          </li>
        ))}
        {hits && hits.length === 0 && <li className="empty">No passage matched.</li>}
      </ol>
    </div>
  );
}

// ---------------- 2 · Extract ----------------

const ALL_Q = Object.keys(QUANTITY_LABEL) as Quantity[];
const PAGE = 50;

function ExtractSection({ env, data, onOpenCatalog, onOpenSimulation, onOpenBench }: { env: Env; data: NasaData | null; onOpenCatalog: (id?: string) => void; onOpenSimulation: () => void; onOpenBench: () => void }) {
  const [modelRows, setModelRows] = useState<ModelRow[] | null>(null);
  const [displayRows, setDisplayRows] = useState<Map<string, ModelRow>>(new Map());
  const [failed, setFailed] = useState(false);
  const [quantities, setQuantities] = useState<Set<Quantity>>(new Set(["spread-rate"]));
  const [datasets, setDatasets] = useState<Set<string>>(new Set());
  const [materials, setMaterials] = useState<Set<string>>(new Set());
  const [text, setText] = useState("");
  const [o2, setO2] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [siNote, setSiNote] = useState<string | null>(null);
  const [showSI, setShowSI] = useState(false);

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    const get = (p: string) => fetch(`${base}data/${p}`).then((r) => r.ok ? r.json() : undefined).catch(() => undefined);
    void Promise.all([get("modeling-targets.json"), get("saffire/trial-registry.json"), get("sofie/gel-evidence.json"), get("same/smoke-analysis.json"), get("bass2/b1-replay.json")])
      .then(([targets, registry, sofie, same, bass]) => {
        if (!targets && !registry) { setFailed(true); return; }
        // Raw rows feed the downloads (original wording, provenance intact); the display copy is translated.
        setModelRows(buildModelRows({ targets, registry, sofie, same, bass }));
        setDisplayRows(new Map(buildModelRows(englishDisplayData({ targets, registry, sofie, same, bass })).map((r) => [r.id, r])));
      });
  }, []);
  const rows = useMemo(() => [...(modelRows ?? []), ...(data ? psiRecordRows(data.investigations as any) : [])], [modelRows, data]);
  const inScope = rows.filter((r) => quantities.size === 0 || quantities.has(r.quantity));
  const filtered = inScope.filter((r) =>
    (datasets.size === 0 || datasets.has(r.dataset)) && (materials.size === 0 || materials.has(r.material)) &&
    (!text.trim() || Object.values(r).join(" ").toLowerCase().includes(text.trim().toLowerCase())) &&
    inO2(r, o2));
  useEffect(() => setPage(0), [quantities, datasets, materials, text, o2]);
  const facet = (list: ModelRow[], key: "dataset" | "material") => [...list.reduce((m, r) => m.set(r[key], (m.get(r[key]) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const datasetFacet = facet(inScope, "dataset");
  const materialFacet = facet(inScope.filter((r) => datasets.size === 0 || datasets.has(r.dataset)), "material");
  const chosen = checked.size ? filtered.filter((r) => checked.has(r.id)) : filtered;
  const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const allChecked = filtered.length > 0 && filtered.every((r) => checked.has(r.id));
  const toggle = (id: string) => setChecked((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const download = (name: string, body: string, type: string) => {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
  };
  const toggleQ = (q: Quantity) => setQuantities((s) => { const next = new Set(s); next.has(q) ? next.delete(q) : next.add(q); return next; });
  const facets = useMemo(() => ({
    quantities: ALL_Q.map((q) => QUANTITY_LABEL[q]),
    datasets: [...new Set(rows.map((r) => r.dataset))].slice(0, 300),
    materials: facet(rows, "material").map(([m]) => m).slice(0, 300),
  }), [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  function applySI(action: SIAction) {
    if (action.action !== "select") return;
    const q = ALL_Q.filter((k) => action.quantities.includes(QUANTITY_LABEL[k]));
    setQuantities(new Set(q)); setDatasets(new Set(action.datasets)); setMaterials(new Set(action.materials)); setText(action.text ?? "");
    setO2({ min: action.oxygenMin != null ? String(action.oxygenMin) : "", max: action.oxygenMax != null ? String(action.oxygenMax) : "" });
    setChecked(new Set()); setSiNote(action.explanation || "SI updated the selection.");
  }
  const clearAll = () => { setQuantities(new Set()); setDatasets(new Set()); setMaterials(new Set()); setText(""); setO2({ min: "", max: "" }); setChecked(new Set()); setSiNote(null); };

  return (
    <section className="dash-section" id="extract">
      <SectionHead n="2" title="Extract data that supports predictive modeling">
        One table of model-ready quantities: SAFFIRE I–VI spread rates and outcomes, SoFIE-GEL extinction limits, SAME smoke sizes, BASS-II video, and all {n(data?.investigations.reduce((s, i) => s + i.tests.length, 0) ?? 0, 0)} PSI test records. Filter, tick the rows you need, and download them with units, conditions and sources. Different observables are never merged.
      </SectionHead>

      <div className="q-tabs" role="group" aria-label="Quantity family">
        {ALL_Q.map((q) => (
          <button key={q} aria-pressed={quantities.has(q)} onClick={() => toggleQ(q)} title={QUANTITY_HINT[q]}>
            {QUANTITY_LABEL[q]} <small>{rows.filter((r) => r.quantity === q).length}</small>
          </button>
        ))}
        <button className="ask-si-btn" onClick={() => setShowSI((v) => !v)} aria-expanded={showSI}><Sparkles size={13} /> {showSI ? "Hide SI" : "Ask SI to select data"}</button>
      </div>
      <p className="q-hint">{quantities.size === 1 ? QUANTITY_HINT[[...quantities][0]] : quantities.size === 0 ? "All quantity families" : `${quantities.size} quantity families`}</p>

      <div className={`extract-layout${showSI ? " with-si" : ""}`}>
        <div className="extract-main">
          <div className="filter-bar">
            <select aria-label="Add dataset filter" value="" onChange={(e) => e.target.value && setDatasets((s) => new Set(s).add(e.target.value))}>
              <option value="">+ Dataset ({datasetFacet.length})</option>
              {datasetFacet.map(([d, c]) => <option key={d} value={d}>{d} · {c}</option>)}
            </select>
            <select aria-label="Add material filter" value="" onChange={(e) => e.target.value && setMaterials((s) => new Set(s).add(e.target.value))}>
              <option value="">+ Material ({materialFacet.length})</option>
              {materialFacet.map(([m, c]) => <option key={m} value={m}>{m} · {c}</option>)}
            </select>
            <span className="o2-range" title="Rows without a numeric O₂ are hidden while a bound is set">O₂
              <input aria-label="Minimum O2 percent" inputMode="decimal" placeholder="min" value={o2.min} onChange={(e) => setO2({ ...o2, min: e.target.value })} />–
              <input aria-label="Maximum O2 percent" inputMode="decimal" placeholder="max" value={o2.max} onChange={(e) => setO2({ ...o2, max: e.target.value })} />%
            </span>
            <input aria-label="Text filter" placeholder="Filter text (e.g. opposed, Kapton, PSI-25)" value={text} onChange={(e) => setText(e.target.value)} />
            {[...datasets].map((d) => <button key={`d${d}`} className="pill" onClick={() => setDatasets((s) => { const x = new Set(s); x.delete(d); return x; })}>{d} <X size={10} /></button>)}
            {[...materials].map((m) => <button key={`m${m}`} className="pill" onClick={() => setMaterials((s) => { const x = new Set(s); x.delete(m); return x; })}>{m} <X size={10} /></button>)}
            {(datasets.size > 0 || materials.size > 0 || text || o2.min || o2.max || quantities.size !== 1) && <button className="text-link" onClick={clearAll}>clear filters</button>}
          </div>
          {siNote && <div className="si-note"><Sparkles size={12} /> <span><b>SI selection:</b> {siNote}</span><button className="icon-button" onClick={() => setSiNote(null)} aria-label="Dismiss"><X size={12} /></button></div>}
          {failed && <div className="dash-warn"><AlertTriangle size={14} /> Modeling data files could not be loaded.</div>}

          <div className="selection-bar">
            <span><b>{n(filtered.length, 0)}</b> rows match · <b>{checked.size}</b> ticked</span>
            <button className="button secondary" disabled={!chosen.length} onClick={() => download("habitatfire-modeling-data.csv", rowsToCsv(chosen), "text/csv")}><ArrowDownToLine size={13} /> CSV ({n(chosen.length, 0)} {checked.size ? "ticked" : "rows"})</button>
            <button className="button secondary" disabled={!chosen.length} onClick={() => download("habitatfire-modeling-data.json", JSON.stringify(chosen, null, 2), "application/json")}><ArrowDownToLine size={13} /> JSON</button>
          </div>

          <SpreadChart rows={filtered} checked={checked} onToggle={toggle} />

          <div className="model-table-wrap">
            <table className="model-table">
              <thead><tr>
                <th className="ck"><input type="checkbox" aria-label="Tick all matching rows" checked={allChecked} onChange={() => setChecked(allChecked ? new Set() : new Set(filtered.map((r) => r.id)))} /></th>
                <th>Dataset</th><th>Value</th><th>Observable</th><th>Material</th><th>O₂ %</th><th>kPa</th><th>Flow cm/s</th><th>Source</th>
              </tr></thead>
              <tbody>
                {shown.map((raw) => displayRows.get(raw.id) ?? raw).map((r) => (
                  <tr key={r.id} className={checked.has(r.id) ? "on" : ""}>
                    <td className="ck"><input type="checkbox" aria-label={`Tick ${r.dataset} ${r.value}`} checked={checked.has(r.id)} onChange={() => toggle(r.id)} /></td>
                    <th>{r.dataset}<small>{/^PSI-\d+$/.test(r.investigation) ? <button className="text-link" onClick={() => onOpenCatalog(r.investigation)}>{r.investigation}</button> : r.investigation}</small></th>
                    <td className="v">{typeof r.value === "number" ? n(r.value) : r.value} <small>{r.unit}</small></td>
                    <td>{r.observable}{r.note && <small>{r.note}</small>}</td>
                    <td>{r.material}</td><td>{String(r.oxygenPct)}</td><td>{String(r.pressureKpa)}</td><td>{String(r.flowCmS)}</td>
                    <td>{r.url ? <a href={r.url} target="_blank" rel="noreferrer">{r.source}</a> : r.source}</td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={9} className="empty">No rows match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          {filtered.length > PAGE && (
            <div className="pager">
              <button className="text-link" disabled={page === 0} onClick={() => setPage(page - 1)}>← previous</button>
              <span>rows {page * PAGE + 1}–{Math.min(filtered.length, (page + 1) * PAGE)} of {n(filtered.length, 0)}</span>
              <button className="text-link" disabled={(page + 1) * PAGE >= filtered.length} onClick={() => setPage(page + 1)}>next →</button>
            </div>
          )}
          <p className="dash-note">
            How these rows are used elsewhere: the <button className="text-link" onClick={onOpenSimulation}>Simulation lab</button> calibrates its fire-spread model on the SAFFIRE rates above, and the <button className="text-link" onClick={onOpenBench}>specialist bench</button> compares the nine SAFFIRE trials frame by frame.
          </p>
        </div>
        {showSI && (
          <SIPanel compact
            context={{ stage: "extract", environment: env.id, facets }}
            title="SI · data assistant"
            intro="Describe the data you need for your model. SI filters the table for you and explains how each quantity was measured and what it can and cannot support."
            suggestions={["Select every SIBAL spread rate and explain the observables", "Which data constrain extinction at low oxygen?", "Show PSI test records with oxygen above 30%"]}
            placeholder="e.g. spread rates for Nomex at high O₂"
            onAction={applySI}
            onOpenInvestigation={onOpenCatalog}
          />
        )}
      </div>
    </section>
  );
}

/** O₂ of a row as a number: plain value, or the midpoint of a tabulated range; NaN when not numeric. */
function oxygenValue(r: ModelRow) {
  if (typeof r.oxygenPct === "number") return r.oxygenPct;
  const parts = String(r.oxygenPct).replace("→", "").split("–").map((v) => Number(v.trim())).filter((v) => Number.isFinite(v) && String(r.oxygenPct).trim() !== "");
  return parts.length ? parts.reduce((a, b) => a + b) / parts.length : NaN;
}
function inO2(r: ModelRow, o2: { min: string; max: string }) {
  const min = o2.min.trim() === "" ? null : Number(o2.min), max = o2.max.trim() === "" ? null : Number(o2.max);
  if ((min === null || !Number.isFinite(min)) && (max === null || !Number.isFinite(max))) return true;
  const v = oxygenValue(r);
  if (!Number.isFinite(v)) return false;
  return (min === null || !Number.isFinite(min) || v >= min) && (max === null || !Number.isFinite(max) || v <= max);
}

function SpreadChart({ rows, checked, onToggle }: { rows: ModelRow[]; checked: Set<string>; onToggle: (id: string) => void }) {
  const pts = rows.filter((r) => r.quantity === "spread-rate" && r.unit === "mm/s" && typeof r.value === "number")
    .map((r) => {
      const o2 = String(r.oxygenPct).split("–").map(Number).filter(Number.isFinite);
      return { r, x: o2.length ? o2.reduce((a, b) => a + b) / o2.length : NaN, y: r.value as number };
    }).filter((p) => Number.isFinite(p.x));
  if (pts.length < 2) return null;
  const W = 560, H = 230, L = 40, R = 12, T = 14, B = 34;
  const x0 = 20, x1 = 35, y1 = Math.ceil(Math.max(...pts.map((p) => p.y), 4.5));
  const x = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const y = (v: number) => T + (1 - v / y1) * (H - T - B);
  const color = (o: string) => o.startsWith("char") ? "#f4a467" : o.startsWith("flame") ? "#5de6e3" : "#b39bff";
  return (
    <figure className="spread-chart">
      <figcaption className="chart-title">
        <strong>Where the measured spread rates sit in oxygen</strong>
        <span>Each dot is one measured flame-spread rate from the rows above (mm/s, microgravity). The shaded band is the 31–35% O₂ range around the 34% exploration atmosphere: only one published point falls there. Click a dot to tick its row.</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Flame spread rate versus oxygen concentration for the filtered rows">
        {[0, 1, 2, 3, 4, 5].filter((v) => v <= y1).map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="g" /><text x={L - 6} y={y(v) + 3} className="t" textAnchor="end">{v}</text></g>)}
        {[20, 22, 24, 26, 28, 30, 32, 34].map((v) => <text key={v} x={x(v)} y={H - 16} className="t" textAnchor="middle">{v}%</text>)}
        <text x={W / 2} y={H - 3} className="t" textAnchor="middle">O₂ (mol %)</text>
        <text x={10} y={T + 4} className="t" textAnchor="start">mm/s</text>
        <rect x={x(31)} y={T} width={x(35) - x(31)} height={H - T - B} className="lunar-band" />
        <text x={x(31) + 3} y={T + 10} className="t lunar">exploration atmosphere</text>
        {pts.map((p) => (
          <circle key={p.r.id} cx={x(p.x)} cy={y(p.y)} r={checked.has(p.r.id) ? 6.5 : 4.5} fill={color(p.r.observable)} opacity={0.9}
            stroke={checked.has(p.r.id) ? "#fff" : "none"} strokeWidth={1.5} style={{ cursor: "pointer" }} onClick={() => onToggle(p.r.id)}>
            <title>{`${p.r.dataset} · ${p.r.material}: ${p.y} mm/s at ${p.r.oxygenPct}% O₂, ${p.r.pressureKpa} kPa, ${p.r.flowCmS} cm/s (${p.r.observable})`}</title>
          </circle>
        ))}
      </svg>
      <figcaption>
        <span><i style={{ background: "#f4a467" }} />char front (image tracking)</span>
        <span><i style={{ background: "#5de6e3" }} />flame base (published curve)</span>
        <span><i style={{ background: "#b39bff" }} />published / table rate</span>
        <em>Descriptive only: pressure, flow, sample and observable differ between dots, so the cloud is not an oxygen trend to fit.</em>
      </figcaption>
    </figure>
  );
}

// ---------------- 3 · Controls & equipment ----------------

const MODULE_LABEL: Record<Module, string> = { same: "Open SAME smoke analysis", sofie: "Open SoFIE-GEL evidence", bass2: "Open BASS-II B1 video analysis" };

function ControlsSection({ env, onOpenCatalog, onModule }: { env: Env; onOpenCatalog: (id?: string) => void; onModule: (m: Module) => void }) {
  const [systemId, setSystemId] = useState<SystemId>("materials");
  const [pending, setPending] = useState<{ question: string; nonce: number } | null>(null);
  const system = SYSTEMS.find((s) => s.id === systemId)!;
  const cards = system.findings.map((id) => CONTROL_FINDINGS.find((c) => c.id === id)!).filter(Boolean);
  const lessons = system.lessons.map((id) => LESSONS.find((l) => l.id === id)!).filter(Boolean);
  const count = (s: (typeof SYSTEMS)[number]) => {
    const f = s.findings.map((id) => CONTROL_FINDINGS.find((c) => c.id === id)!);
    const l = s.lessons.map((id) => LESSONS.find((x) => x.id === id)!);
    return {
      measured: f.filter((c) => c.level === "published" || c.level === "measured").length,
      scope: f.filter((c) => c.level === "investigation scope" || c.level === "derived").length,
      mishaps: l.filter((x) => x.kind === "mishap").length,
      spinoffs: l.filter((x) => x.kind === "spinoff").length,
      gaps: s.gaps.length,
    };
  };
  const brief = () => setPending({ nonce: Date.now(), question: `Draft a design-evidence brief for the ${system.label.toLowerCase()} of a ${env.label.toLowerCase()} (${env.gravity}, ${env.atmosphere}). Design question: ${system.question}. Cover what NASA measured, what it implies for the design, relevant historical lessons or spinoffs, and the evidence still missing.` });

  return (
    <section className="dash-section" id="controls">
      <SectionHead n="3" title="Research that informs next-generation fire safety controls and equipment">
        Pick the system you are designing. The map shows how much evidence of each kind backs it; below, the findings separate what was measured from the design implication, and SI can turn them into a cited design-evidence brief for the <strong>{env.label.toLowerCase()}</strong>.
      </SectionHead>
      <div className="matrix-wrap">
        <table className="evidence-matrix">
          <thead><tr><th>System you are designing</th><th title="published papers or measured flight data">Measured / published</th><th title="investigation objectives">Investigation scope</th><th>Mishap lessons</th><th>Spinoffs</th><th>Open gaps</th></tr></thead>
          <tbody>
            {SYSTEMS.map((s) => {
              const c = count(s);
              return (
                <tr key={s.id} className={s.id === systemId ? "on" : ""} onClick={() => setSystemId(s.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setSystemId(s.id); }}>
                  <th><strong>{s.label}</strong><small>{s.question}</small></th>
                  {[c.measured, c.scope, c.mishaps, c.spinoffs].map((v, i) => <td key={i}><span className={`dots d${Math.min(v, 4)}`} aria-label={`${v}`}>{v || "–"}</span></td>)}
                  <td><span className={`gapcount${c.gaps ? " warn" : ""}`}>{c.gaps}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="controls-layout">
        <div className="controls-evidence">
          <h3 className="sub">Evidence for {system.label.toLowerCase()}</h3>
          <div className="control-grid">
            {cards.map((c) => (
              <article key={c.id} className={`control-card ${c.fn} ${c.lunar && env.gravity === "1/6 g" ? "lunar" : ""}`}>
                <header><span className={`fn-tag ${c.fn}`}>{FUNCTIONS.find((f) => f.id === c.fn)?.label}</span><span className="lvl">{c.level}</span>{c.lunar && <span className="lunar-tag">lunar</span>}</header>
                <h3>{c.title}</h3>
                <p className="finding"><b>Measured / stated</b>{c.finding}</p>
                <p className="implication"><b>Design implication</b>{c.implication}</p>
                <footer>
                  {c.investigations.map((id) => <button key={id} className="chip" onClick={() => onOpenCatalog(id)}><Database size={11} />{id}</button>)}
                  {c.sources.map((s) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="src">{s.label} <ArrowUpRight size={10} /></a>)}
                  {c.module && <button className="button secondary module-btn" onClick={() => onModule(c.module!)}>{MODULE_LABEL[c.module]} <ArrowRight size={12} /></button>}
                </footer>
              </article>
            ))}
            {lessons.map((l) => (
              <article key={l.id} className={`control-card lesson ${l.kind}`}>
                <header><span className={`fn-tag ${l.kind}`}>{l.kind === "mishap" ? <><History size={10} /> historical mishap</> : <><Rocket size={10} /> NASA spinoff</>}</span><span className="lvl">{l.year}</span></header>
                <h3>{l.title}</h3>
                <p className="finding"><b>What happened</b>{l.what}</p>
                <p className="implication"><b>Lesson for design</b>{l.lesson}</p>
                <footer><a href={l.source.url} target="_blank" rel="noreferrer" className="src">{l.source.label} <ArrowUpRight size={10} /></a></footer>
              </article>
            ))}
          </div>
          <div className="gaps">
            <h3><AlertTriangle size={14} /> Evidence still missing</h3>
            <ul>{system.gaps.map((g) => <li key={g}>{LUNAR_GAPS[g]}</li>)}</ul>
          </div>
        </div>
        <div className="controls-si">
          <button className="button primary brief-btn" onClick={brief}><FileText size={14} /> Draft a design-evidence brief with SI</button>
          <SIPanel compact
            context={{ stage: "controls", environment: env.id }}
            title="SI · design brief"
            intro={`SI writes a short, cited brief for the ${system.label.toLowerCase()}: what was measured, what it implies, historical lessons and missing evidence. You can then ask follow-up questions.`}
            suggestions={[`Which detector principles does NASA evidence support for a ${env.short.toLowerCase()}?`, "What did the Mir fire change in ISS oxygen systems?", "Which suppression levers work for solid-fuel flames in low flow?"]}
            pending={pending}
            onOpenInvestigation={onOpenCatalog}
          />
        </div>
      </div>
    </section>
  );
}

// ---------------- Coverage ----------------

function CoverageSection({ docs, onOpenSources }: { docs: CorpusDoc[]; onOpenSources: () => void }) {
  const passages = (ids: string[]) => ids.reduce((s, id) => s + (docs.find((d) => d.id === id)?.passages.length ?? 0), 0);
  return (
    <section className="dash-section coverage" id="coverage">
      <header className="dash-section-head">
        <span className="obj-num alt"><BookOpen size={15} /></span>
        <div>
          <h2>What is in the knowledge base</h2>
          <p>The ten resources named in the challenge and how each one reaches SI and the dashboard. {EXTRA_SOURCES}</p>
        </div>
      </header>
      <ul className="coverage-list">
        {CHALLENGE_RESOURCES.map((r) => {
          const p = passages(r.corpusIds);
          return (
            <li key={r.id} className={r.status}>
              {r.status === "metadata-only" ? <CircleDashed size={15} /> : <CheckCircle2 size={15} />}
              <div>
                <a href={r.url} target="_blank" rel="noreferrer">{r.label}</a>
                <small>{r.use}</small>
              </div>
              <span className="cov-tag">{r.status === "data" ? "data + metadata" : r.status === "indexed" ? `${p} passages indexed` : "listed only"}</span>
            </li>
          );
        })}
      </ul>
      <div className="extract-cta">
        <button className="button secondary" onClick={onOpenSources}><FlaskConical size={14} /> Full source provenance and hashes</button>
      </div>
    </section>
  );
}
