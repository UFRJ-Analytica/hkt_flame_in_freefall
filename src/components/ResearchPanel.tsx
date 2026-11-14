import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, BookOpen, Search, X, LoaderCircle, RefreshCw, SlidersHorizontal } from "lucide-react";
import { number } from "../config";
import { useModalFocus } from "../hooks/useModalFocus";
import type { ExperimentTest } from "../types";
import type { EvidenceSource, ResearchContext, ResearchIntent } from "../research/types";
import type { ResearchState } from "../research/useResearch";
import { bundleCsv, CONDITION_FIELDS, downloadFile } from "../research/provenance";
import "../research/research.css";

const INTENTS: { id: ResearchIntent; label: string }[] = [
  { id: "prevention", label: "Prevenção" }, { id: "detection", label: "Detecção" },
  { id: "suppression", label: "Supressão" }, { id: "post-fire", label: "Pós-incêndio" }, { id: "terrestrial", label: "Terrestre" },
];
const STARTERS: { question: string; intent: ResearchIntent }[] = [
  { question: "PMMA baixo fluxo", intent: "prevention" },
  { question: "detecção fumaça Kapton", intent: "detection" },
  { question: "supressão em microgravidade", intent: "suppression" },
  { question: "aplicações terrestres", intent: "terrestrial" },
  { question: "gravidade lunar", intent: "prevention" },
];
function sourceHref(url: string) { return /^https?:\/\//i.test(url) ? url : undefined; }
function Source({ source }: { source: EvidenceSource }) {
  return <details className="research-source" id={`source-${source.id}`}>
    <summary><span className="research-source-id">[{source.id}]</span> {source.title}</summary>
    <p className="research-location">{source.location} · {source.kind === "metadata" ? "Metadados" : "Documento"}</p>
    <blockquote>{source.text}</blockquote>
    <a href={sourceHref(source.url)} target="_blank" rel="noreferrer">Abrir fonte original <ArrowUpRight size={13} /></a>
  </details>;
}
function Conditions({ records, context }: { records: ExperimentTest[]; context: ResearchContext }) {
  return <div className="research-table-scroll"><table className="research-condition-table">
    <caption>Condições numéricas · ausência não significa zero</caption>
    <thead><tr><th scope="col">Condição</th><th scope="col">Cenário</th>{records.map((r) => <th scope="col" key={r.id}>{r.investigationId}<br />{r.label || r.id}</th>)}</tr></thead>
    <tbody>{CONDITION_FIELDS.map((f) => <tr key={f.key}><th scope="row">{f.label} ({f.unit})</th><td>{number(context[f.record])}</td>{records.map((r) => <td key={r.id}>{r[f.record] == null ? <span className="research-unknown">Desconhecido</span> : <>{number(r[f.record])}<small>Δ {number(r[f.record]! - context[f.record])}</small></>}</td>)}</tr>)}
      <tr><th scope="row">Gravidade (g)</th><td>{number(context.gravityG)}</td>{records.map((r) => <td key={r.id} className="research-unknown">Não normalizada; consultar original</td>)}</tr>
      <tr><th scope="row">Material</th><td>{context.material}</td>{records.map((r) => <td key={r.id}>{r.material ?? "Desconhecido"}</td>)}</tr>
      <tr><th scope="row">Origem</th><td>Hipótese editável</td>{records.map((r) => <td key={r.id}>{r.sourceFile ?? "Arquivo desconhecido"}<small>Linha {r.sourceRow ?? "desconhecida"} · {r.id}</small></td>)}</tr>
    </tbody></table></div>;
}
function Comparison({ records, context, onClose }: { records: ExperimentTest[]; context: ResearchContext; onClose: () => void }) {
  useModalFocus(true, onClose);
  return <div className="modal-backdrop research-comparison-backdrop" onClick={onClose}><section role="dialog" aria-modal="true" aria-labelledby="comparison-title" className="modal research-comparison" onClick={(e) => e.stopPropagation()}>
    <div className="modal-heading"><div><span className="eyebrow">REGISTROS ≠ ENSAIOS INDEPENDENTES</span><h2 id="comparison-title">Comparar condições originais</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar comparação"><X size={20} /></button></div>
    <p>Diferenças são aritméticas, não indicadores de compatibilidade física. Geometria, composição e método precisam ser conferidos na fonte.</p>
    <Conditions records={records} context={context} />
    {records.map((r) => <details className="research-raw" key={r.id}><summary>{r.investigationId} · {r.label || r.id} · campos originais</summary><dl>{Object.entries(r.raw).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value == null || value === "" ? "Não informado" : String(value)}</dd></div>)}</dl></details>)}
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
  return <aside className="evidence-panel research-panel" aria-label="Pesquisa contextual de evidências">
    <div className="panel-title"><BookOpen size={15} /><h2>Investigue o cenário</h2><span className={`research-status-dot ${status?.status === "ready" ? "ready" : ""}`} /></div>
    <div className="research-panel-body" ref={bodyRef}>
      <div className="research-intro"><span className="eyebrow">DA PERGUNTA À FONTE</span><h2>O que você quer<br />entender aqui?</h2><p>Ciência rastreável para explorar hipóteses. Sem transformar busca em previsão.</p></div>
      <div className="research-context"><span>{context.vehicle === "orion" ? "Orion" : "Módulo orbital"} / {context.surfaceName}</span><strong>{context.material} <span>· {context.structureKind}</span></strong><small>{number(context.oxygenPct)}% O₂ · {number(context.pressureKpa)} kPa · {number(context.flowCmS)} cm/s · {context.gravityG} g</small></div>
      <form className="research-form" onSubmit={(e) => { e.preventDefault(); void research.submit(); }}>
        <label htmlFor="research-question">Sua pergunta</label><textarea id="research-question" rows={3} maxLength={2000} value={research.question} onChange={(e) => research.setQuestion(e.target.value)} placeholder="Material, mecanismo ou equipamento…" />
        <label htmlFor="research-intent">Objetivo da investigação</label><select id="research-intent" value={research.intent} onChange={(e) => research.setIntent(e.target.value as ResearchIntent)}>{INTENTS.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}</select>
        <button className="button primary full" type="submit" disabled={busy || !research.question.trim()}>{busy ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}{busy ? "Consultando fontes…" : "Buscar evidências"}</button>
      </form>
      <div className="research-starters" aria-label="Perguntas iniciais">{STARTERS.map((s) => <button key={s.question} onClick={() => research.startStarter(s)}>{s.question}</button>)}</div>
      <div className="research-service"><span>{statusLoading ? "Verificando serviço…" : status?.status === "ready" ? `${status.retrievalMode}${status.vectorStore ? ` · vetores ${status.embeddingModel} @ ${status.vectorStore}` : ""} · ${status.generationConfigured ? `síntese ${status.generationModel} disponível` : "IA não configurada · síntese extrativa"}` : "Serviço de pesquisa indisponível"}</span><button aria-label="Verificar serviço novamente" title="Verificar serviço" onClick={() => void research.refreshStatus()}><RefreshCw size={13} /></button></div>
      {error && <div className="research-message error" role="alert"><strong>Não foi possível concluir a consulta.</strong><p>{error}</p><p>Para iniciar o frontend e a API local: <code>npm run dev:full</code>. Não exibimos resultados inventados.</p><button className="text-link" onClick={() => { void research.refreshStatus(); void research.submit(); }}>Tentar novamente <RefreshCw size={13} /></button></div>}
      {stale && <div className="research-message stale" role="status"><strong>Contexto ou pergunta alterados.</strong><p>O pacote anterior não descreve esta seleção. Achados, comparação e exportação ficam ocultos até uma nova busca.</p></div>}
      {current && <>
        <div className="research-result-heading"><span className="eyebrow">PACOTE DE EVIDÊNCIAS</span><strong>{current.sources.length} fontes recuperadas</strong><small>{current.retrievalMode} / {current.synthesisMode} · corpus {current.corpusVersion}</small></div>
        <section className="research-summary"><h3>Leitura das evidências</h3><p>{current.summary}</p><details><summary>{current.synthesisMode === "extractive" ? "Trechos originais recuperados" : "Achados da síntese"} ({current.findings.length})</summary>{current.findings.map((finding, index) => <div className="research-finding" key={index}><p>{finding.text}</p><div className="research-citations">{finding.sourceIds.map((id) => { const source = current.sources.find((s) => s.id === id); return source ? <a key={id} href={sourceHref(source.url)} title={`${source.title} · ${source.location}`} target="_blank" rel="noreferrer">[{id}] <ArrowUpRight size={11} /></a> : <span key={id}>[{id} · fonte não retornada]</span>; })}</div></div>)}</details></section>
        {status?.generationConfigured && <button className="button secondary full" disabled={busy} onClick={() => void research.submit(true)}>Solicitar síntese por IA (opcional)</button>}
        <div className="research-ranked-heading"><h3>Investigações relacionadas</h3><small>Relevância de busca ≠ risco físico</small></div>
        {!current.investigations.length && <p className="research-message">Nenhuma investigação recuperada para esta consulta. Revise a pergunta ou consulte o catálogo.</p>}
        {current.investigations.map((item, index) => <article className="research-investigation" key={item.investigation.id}>
          <header><span className="research-rank">{String(index + 1).padStart(2, "0")}</span><div><small>{item.investigation.id} · {({ related: "Pesquisa relacionada", analog: "Análogo com diferenças", context: "Fundamento / contexto" })[item.relevance]}</small><h3>{item.investigation.name}</h3></div><a className="icon-button" href={sourceHref(item.investigation.sourceUrl)} target="_blank" rel="noreferrer" aria-label={`Abrir ${item.investigation.name} na fonte`}><ArrowUpRight size={16} /></a></header>
          <p>{item.investigation.title}</p><p className="research-location">{item.investigation.platform} · {item.investigation.recordGrain ?? "Grão da tabela não informado"}</p>
          <h4>Por que aparece aqui</h4><ul>{item.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul>
          {!!item.mismatches.length && <div className="research-differences"><h4>Diferenças importantes</h4><ul>{item.mismatches.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
          {!!item.unknowns.length && <details><summary>Condições desconhecidas ({item.unknowns.length})</summary><ul>{item.unknowns.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
          {item.sources.map((source) => <Source key={source.id} source={source} />)}
          {item.records.length ? <details className="research-records"><summary>{item.records.length} registros para inspecionar</summary>{item.records.map((record) => <div className="research-record" key={record.id}>
            <h4>{record.label || record.id}</h4><span className="research-location">{record.id}</span><Conditions records={[record]} context={context} />
            <details className="research-raw"><summary>Inspecionar todos os campos originais</summary><p>{record.sourceFile ?? "Arquivo não informado"} · linha {record.sourceRow ?? "não informada"}</p>{record.normalizationNotes?.map((note, i) => <p key={i}>{note}</p>)}<dl>{Object.entries(record.raw).map(([field, value]) => <div key={field}><dt>{field}</dt><dd>{value == null || value === "" ? "Não informado" : String(value)}</dd></div>)}</dl></details>
            <div className="research-record-actions"><label><input type="checkbox" checked={chosen.some((r) => r.id === record.id)} disabled={chosen.length >= 3 && !chosen.some((r) => r.id === record.id)} onChange={(e) => setChosen((rows) => e.target.checked ? [...rows, record] : rows.filter((r) => r.id !== record.id))} />Comparar</label><button className="button secondary small" disabled={CONDITION_FIELDS.every((f) => record[f.record] == null)} onClick={() => onApply(record)}>Revisar aplicação</button></div>
          </div>)}</details> : <p className="research-location">Sem registros tabulares recuperados. Não há condições numéricas para aplicar.</p>}
        </article>)}
        {chosen.length > 0 && <div className="research-compare-bar"><span>{chosen.length}/3 registros selecionados</span><button className="button secondary small" disabled={chosen.length < 2} onClick={() => setCompare(true)}><SlidersHorizontal size={13} />Comparar</button><button className="icon-button" onClick={() => setChosen([])} aria-label="Limpar seleção"><X size={14} /></button></div>}
        {(current.gaps.length > 0 || current.warnings.length > 0) && <section className="research-message"><h3>Lacunas & ressalvas</h3><ul>{[...current.gaps, ...current.warnings].map((text, i) => <li key={i}>{text}</li>)}</ul></section>}
        <details className="research-all-sources"><summary>Todas as fontes ({current.sources.length})</summary>{current.sources.map((source) => <Source key={source.id} source={source} />)}</details>
        <div className="research-downloads"><button className="button secondary" onClick={() => downloadFile("habitatfire-dossie.json", JSON.stringify(current, null, 2))}><ArrowDownToLine size={14} />Dossiê JSON</button><button className="button secondary" onClick={() => downloadFile("habitatfire-registros.csv", bundleCsv(current), "text/csv;charset=utf-8")}><ArrowDownToLine size={14} />CSV + fontes</button></div>
      </>}
      <section className="research-fidelity"><span className="eyebrow">FIDELIDADE VISÍVEL</span><strong>Cenário ilustrativo</strong><p>Hipóteses visuais, não previsão validada.</p><div><button disabled title="Não há séries temporais medidas recuperadas">Replay medido · indisponível</button><button disabled title="Não há modelo físico calibrado e validado">Previsão calibrada · indisponível</button></div><p>{current?.visualization.reasons.join(" ") ?? "Sem séries temporais medidas ou modelo calibrado. O progresso da animação não representa tempo de incêndio, detecção ou supressão."}</p></section>
      <div className="research-bottom-links"><button className="text-link" onClick={onExplore}>Catálogo de registros <ArrowUpRight size={13} /></button><button className="text-link" onClick={onSources}>Fontes & limites <ArrowUpRight size={13} /></button></div>
    </div>
    {compare && !stale && <Comparison records={chosen} context={context} onClose={() => setCompare(false)} />}
  </aside>;
}
