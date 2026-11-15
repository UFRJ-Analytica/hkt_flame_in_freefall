import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, BookOpen, Search, X, LoaderCircle, RefreshCw, SlidersHorizontal } from "lucide-react";
import { number } from "../config";
import { englishText } from "../i18n/english";
import { useModalFocus } from "../hooks/useModalFocus";
import type { ExperimentTest } from "../types";
import type { EvidenceSource, ResearchContext, ResearchIntent } from "../research/types";
import type { ResearchState } from "../research/useResearch";
import { bundleCsv, CONDITION_FIELDS, downloadFile } from "../research/provenance";
import "../research/research.css";
import { RecordVideos } from "./research/RecordVideos";

const INTENTS: { id: ResearchIntent; label: string }[] = [
  { id: "prevention", label: "Prevention" }, { id: "detection", label: "Detection" },
  { id: "suppression", label: "Suppression" }, { id: "post-fire", label: "Post-fire" }, { id: "terrestrial", label: "Terrestrial" },
];
const STARTERS: { question: string; intent: ResearchIntent }[] = [
  { question: "PMMA low flow", intent: "prevention" },
  { question: "Kapton smoke detection", intent: "detection" },
  { question: "suppression in microgravity", intent: "suppression" },
  { question: "terrestrial applications", intent: "terrestrial" },
  { question: "lunar gravity", intent: "prevention" },
];
function sourceHref(url: string) { return /^https?:\/\//i.test(url) ? url : undefined; }
function Source({ source }: { source: EvidenceSource }) {
  return <details className="research-source" id={`source-${source.id}`}>
    <summary><span className="research-source-id">[{source.id}]</span> {englishText(source.title)}</summary>
    <p className="research-location">{englishText(source.location)} · {source.kind === "metadata" ? "Metadata" : "Document"}</p>
    <blockquote>{source.text}</blockquote>
    <a href={sourceHref(source.url)} target="_blank" rel="noreferrer">Open original source <ArrowUpRight size={13} /></a>
  </details>;
}
function Conditions({ records, context }: { records: ExperimentTest[]; context: ResearchContext }) {
  return <div className="research-table-scroll"><table className="research-condition-table">
    <caption>Numerical conditions · absence does not mean zero</caption>
    <thead><tr><th scope="col">Condition</th><th scope="col">Scenario</th>{records.map((r) => <th scope="col" key={r.id}>{r.investigationId}<br />{englishText(r.label || r.id)}</th>)}</tr></thead>
    <tbody>{CONDITION_FIELDS.map((f) => <tr key={f.key}><th scope="row">{englishText(f.label)} ({f.unit})</th><td>{number(context[f.record])}</td>{records.map((r) => <td key={r.id}>{r[f.record] == null ? <span className="research-unknown">Unknown</span> : <>{number(r[f.record])}<small>Δ {number(r[f.record]! - context[f.record])}</small></>}</td>)}</tr>)}
      <tr><th scope="row">Gravity (g)</th><td>{number(context.gravityG)}</td>{records.map((r) => <td key={r.id} className="research-unknown">Not normalized; consult original</td>)}</tr>
      <tr><th scope="row">Material</th><td>{englishText(context.material)}</td>{records.map((r) => <td key={r.id}>{englishText(r.material ?? "Unknown")}</td>)}</tr>
      <tr><th scope="row">Origin</th><td>Editable assumption</td>{records.map((r) => <td key={r.id}>{r.sourceFile ?? "Unknown file"}<small>Row {r.sourceRow ?? "unknown"} · {r.id}</small></td>)}</tr>
    </tbody></table></div>;
}
function Comparison({ records, context, onClose }: { records: ExperimentTest[]; context: ResearchContext; onClose: () => void }) {
  useModalFocus(true, onClose);
  return <div className="modal-backdrop research-comparison-backdrop" onClick={onClose}><section role="dialog" aria-modal="true" aria-labelledby="comparison-title" className="modal research-comparison" onClick={(e) => e.stopPropagation()}>
    <div className="modal-heading"><div><span className="eyebrow">RECORDS ≠ INDEPENDENT TESTS</span><h2 id="comparison-title">Compare original conditions</h2></div><button className="icon-button" onClick={onClose} aria-label="Close comparison"><X size={20} /></button></div>
    <p>Differences are arithmetic, not indicators of physical compatibility. Geometry, composition, and method must be checked at the source.</p>
    <Conditions records={records} context={context} />
    {records.map((r) => <details className="research-raw" key={r.id}><summary>{r.investigationId} · {englishText(r.label || r.id)} · original fields</summary><dl>{Object.entries(r.raw).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value == null || value === "" ? "Not reported" : String(value)}</dd></div>)}</dl></details>)}
  </section></div>;
}
export function ResearchPanel({ research, context, onApply, onExplore, onSources }: {
  research: ResearchState; context: ResearchContext; onApply: (record: ExperimentTest) => void; onExplore: () => void; onSources: () => void;
}) {
  const { bundle, stale, status, statusLoading, error, busy } = research;
  const [chosen, setChosen] = useState<ExperimentTest[]>([]);
  const [compare, setCompare] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setChosen([]); setCompare(false); }, [bundle?.requestId, stale]);
  const current = bundle && !stale ? bundle : null;
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    if (stale) { body.scrollTop = 0; return; }
    const heading = body.querySelector<HTMLElement>(".research-result-heading");
    if (current && heading) {
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
      const top = body.scrollTop + heading.getBoundingClientRect().top - body.getBoundingClientRect().top - 12;
      if (body.scrollHeight > body.clientHeight + 1) body.scrollTo({ top, behavior });
      else heading.scrollIntoView({ block: "start", behavior });
    }
  }, [current?.requestId, stale]);
  return <aside className="evidence-panel research-panel" aria-label="Contextual evidence research">
    <div className="panel-title"><BookOpen size={15} /><h2>Investigate the scenario</h2><span className={`research-status-dot ${status?.status === "ready" ? "ready" : ""}`} /></div>
    <div className="research-panel-body" ref={bodyRef}>
      <div className="research-intro"><span className="eyebrow">FROM QUESTION TO SOURCE</span><h2>What do you want<br />to understand here?</h2><p>Traceable science to explore hypotheses. Without turning search into prediction.</p></div>
      <div className="research-context"><span>{context.vehicle === "orion" ? "Orion" : "Orbital module"} / {englishText(context.surfaceName)}</span><strong>{englishText(context.material)} <span>· {englishText(context.structureKind)}</span></strong><small>{number(context.oxygenPct)}% O₂ · {number(context.pressureKpa)} kPa · {number(context.flowCmS)} cm/s · {context.gravityG} g</small></div>
      <form className="research-form" onSubmit={(e) => { e.preventDefault(); void research.submit(); }}>
        <label htmlFor="research-question">Your question</label><textarea id="research-question" rows={3} maxLength={2000} value={research.question} onChange={(e) => research.setQuestion(e.target.value)} placeholder="Material, mechanism, or equipment…" />
        <label htmlFor="research-intent">Research objective</label><select id="research-intent" value={research.intent} onChange={(e) => research.setIntent(e.target.value as ResearchIntent)}>{INTENTS.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</select>
        <button className="button primary full" type="submit" disabled={busy || !research.question.trim()}>{busy ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}{busy ? "Consulting sources…" : "Search evidence"}</button>
      </form>
      <div className="research-starters" aria-label="Starter questions">{STARTERS.map((s) => <button key={s.question} onClick={() => research.startStarter(s)}>{s.question}</button>)}</div>
      <div className="research-service"><span>{statusLoading ? "Checking service…" : status?.status === "ready" ? `${status.retrievalMode}${status.vectorStore ? ` · vectors ${status.embeddingModel} @ ${status.vectorStore}` : ""} · ${status.generationConfigured ? `synthesis ${status.generationModel} available` : "AI not configured · extractive synthesis"}` : "Research service unavailable"}</span><button aria-label="Check service again" title="Check service" onClick={() => void research.refreshStatus()}><RefreshCw size={13} /></button></div>
      {error && <div className="research-message error" role="alert"><strong>Could not complete the query.</strong><p>{englishText(error)}</p><p>To start the frontend and local API: <code>npm run dev:full</code>. We do not display invented results.</p><button className="text-link" onClick={() => { void research.refreshStatus(); void research.submit(); }}>Try again <RefreshCw size={13} /></button></div>}
      {stale && <div className="research-message stale" role="status"><strong>Context or question changed.</strong><p>The previous bundle does not describe this selection. Findings, comparison, and export remain hidden until a new search.</p></div>}
      {current && <>
        <div className="research-result-heading"><span className="eyebrow">EVIDENCE BUNDLE</span><strong>{current.sources.length} sources retrieved</strong><small>{current.retrievalMode} / {current.synthesisMode} · corpus {current.corpusVersion}</small></div>
        <section className="research-summary"><h3>Reading the evidence</h3><p>{englishText(current.summary)}</p><details><summary>{current.synthesisMode === "extractive" ? "Retrieved original excerpts" : "Synthesis findings"} ({current.findings.length})</summary>{current.findings.map((finding, index) => <div className="research-finding" key={index}><p>{current.synthesisMode === "extractive" ? finding.text : englishText(finding.text)}</p><div className="research-citations">{finding.sourceIds.map((id) => { const source = current.sources.find((s) => s.id === id); return source ? <a key={id} href={sourceHref(source.url)} title={`${englishText(source.title)} · ${englishText(source.location)}`} target="_blank" rel="noreferrer">[{id}] <ArrowUpRight size={11} /></a> : <span key={id}>[{id} · source not returned]</span>; })}</div></div>)}</details></section>
        {status?.generationConfigured && <button className="button secondary full" disabled={busy} onClick={() => void research.submit(true)}>Request AI synthesis (optional)</button>}
        <div className="research-ranked-heading"><h3>Related investigations</h3><small>Search relevance ≠ physical risk</small></div>
        {!current.investigations.length && <p className="research-message">No investigations retrieved for this query. Revise your question or browse the catalog.</p>}
        {current.investigations.map((item, index) => <article className="research-investigation" key={item.investigation.id}>
          <header><span className="research-rank">{String(index + 1).padStart(2, "0")}</span><div><small>{item.investigation.id} · {({ related: "Related research", analog: "Analog with differences", context: "Background / context" })[item.relevance]}</small><h3>{englishText(item.investigation.name)}</h3></div><a className="icon-button" href={sourceHref(item.investigation.sourceUrl)} target="_blank" rel="noreferrer" aria-label={`Open ${englishText(item.investigation.name)} at the source`}><ArrowUpRight size={16} /></a></header>
          <p>{englishText(item.investigation.title)}</p><p className="research-location">{englishText(item.investigation.platform)} · {englishText(item.investigation.recordGrain ?? "Table record unit not reported")}</p>
          <h4>Why it appears here</h4><ul>{item.reasons.map((reason, i) => <li key={i}>{englishText(reason)}</li>)}</ul>
          {!!item.mismatches.length && <div className="research-differences"><h4>Important differences</h4><ul>{item.mismatches.map((text, i) => <li key={i}>{englishText(text)}</li>)}</ul></div>}
          {!!item.unknowns.length && <details><summary>Unknown conditions ({item.unknowns.length})</summary><ul>{item.unknowns.map((text, i) => <li key={i}>{englishText(text)}</li>)}</ul></details>}
          {item.sources.map((source) => <Source key={source.id} source={source} />)}
          {item.records.length ? <details className="research-records"><summary>{item.records.length} records to inspect</summary>{item.records.map((record) => <div className="research-record" key={record.id}>
            <h4>{englishText(record.label || record.id)}</h4><span className="research-location">{record.id}</span><Conditions records={[record]} context={context} /><RecordVideos recordId={record.id} investigationId={record.investigationId} />
            <details className="research-raw"><summary>Inspect all original fields</summary><p>{record.sourceFile ?? "File not reported"} · row {record.sourceRow ?? "not reported"}</p>{record.normalizationNotes?.map((note, i) => <p key={i}>{englishText(note)}</p>)}<dl>{Object.entries(record.raw).map(([field, value]) => <div key={field}><dt>{field}</dt><dd>{value == null || value === "" ? "Not reported" : String(value)}</dd></div>)}</dl></details>
            <div className="research-record-actions"><label><input type="checkbox" checked={chosen.some((r) => r.id === record.id)} disabled={chosen.length >= 3 && !chosen.some((r) => r.id === record.id)} onChange={(e) => setChosen((rows) => e.target.checked ? [...rows, record] : rows.filter((r) => r.id !== record.id))} />Compare</label><button className="button secondary small" disabled={CONDITION_FIELDS.every((f) => record[f.record] == null)} onClick={() => onApply(record)}>Review application</button></div>
          </div>)}</details> : <p className="research-location">No tabular records retrieved. No numerical conditions are available to apply.</p>}
        </article>)}
        {chosen.length > 0 && <div className="research-compare-bar"><span>{chosen.length}/3 records selected</span><button className="button secondary small" disabled={chosen.length < 2} onClick={() => setCompare(true)}><SlidersHorizontal size={13} />Compare</button><button className="icon-button" onClick={() => setChosen([])} aria-label="Clear selection"><X size={14} /></button></div>}
        {(current.gaps.length > 0 || current.warnings.length > 0) && <section className="research-message"><h3>Gaps & caveats</h3><ul>{[...current.gaps, ...current.warnings].map((text, i) => <li key={i}>{englishText(text)}</li>)}</ul></section>}
        <details className="research-all-sources"><summary>All sources ({current.sources.length})</summary>{current.sources.map((source) => <Source key={source.id} source={source} />)}</details>
        <div className="research-downloads"><button className="button secondary" onClick={() => downloadFile("habitatfire-dossier.json", JSON.stringify(current, null, 2))}><ArrowDownToLine size={14} />JSON dossier</button><button className="button secondary" onClick={() => downloadFile("habitatfire-records.csv", bundleCsv(current), "text/csv;charset=utf-8")}><ArrowDownToLine size={14} />CSV + sources</button></div>
      </>}
      <section className="research-fidelity"><span className="eyebrow">VISIBLE FIDELITY</span><strong>Illustrative scenario</strong><p>Visual assumptions, not a validated prediction.</p><div><button disabled title="No measured time series retrieved">Measured replay · unavailable</button><button disabled title="No calibrated and validated physical model">Calibrated prediction · unavailable</button></div><p>{current?.visualization.reasons.map(englishText).join(" ") ?? "No measured time series or calibrated model. Animation progress does not represent fire, detection, or suppression time."}</p></section>
      <div className="research-bottom-links"><button className="text-link" onClick={onExplore}>Record catalog <ArrowUpRight size={13} /></button><button className="text-link" onClick={onSources}>Sources & limitations <ArrowUpRight size={13} /></button></div>
    </div>
    {compare && !stale && <Comparison records={chosen} context={context} onClose={() => setCompare(false)} />}
  </aside>;
}
