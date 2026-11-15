import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowUp, BadgeCheck, LoaderCircle, RotateCcw, Search, ShieldAlert, Square } from "lucide-react";
import { useSI, type SIAction, type SIRequestContext, type SISource, type SITurn } from "./useSI";
import type { ResearchBundle } from "../research/types";
import "./si.css";

interface Props {
  context: SIRequestContext;
  title?: string;
  intro: string;
  suggestions: string[];
  placeholder?: string;
  onRanking?: (bundle: ResearchBundle, focus: string, environment: string) => void;
  onAction?: (action: SIAction) => void;
  onOpenInvestigation?: (id: string) => void;
  /** A question to send as soon as it changes (e.g. a "generate brief" button elsewhere). */
  pending?: { question: string; nonce: number } | null;
  compact?: boolean;
}

export function SIPanel({ context, title = "SI · research assistant", intro, suggestions, placeholder, onRanking, onAction, onOpenInvestigation, pending, compact }: Props) {
  const { turns, busy, ask, stop, reset } = useSI({ onRanking, onAction });
  const [draft, setDraft] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const send = (question: string) => { if (!busy && question.trim()) { void ask(question, context); setDraft(""); } };

  useEffect(() => { if (pending?.question) send(pending.question); }, [pending?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" }); }, [turns]);

  return (
    <section className={`si-panel${compact ? " compact" : ""}`} aria-label={title}>
      <header className="si-head">
        <span className="si-mark" aria-hidden="true">SI</span>
        <div>
          <strong>{title}</strong>
          <small>Claude with semantic search over NASA documents and PSI data as tools · answers cite what it retrieved</small>
        </div>
        {turns.length > 0 && <button type="button" className="icon-button" onClick={reset} aria-label="New conversation" title="New conversation"><RotateCcw size={14} /></button>}
      </header>

      <div className="si-log" ref={log} aria-live="polite">
        {turns.length === 0 ? (
          <div className="si-empty">
            <p>{intro}</p>
            <div className="si-suggestions">
              {suggestions.map((s) => <button key={s} type="button" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        ) : turns.map((turn) => turn.role === "user"
          ? <div key={turn.id} className="si-user">{turn.text}</div>
          : <AssistantTurn key={turn.id} turn={turn} onOpenInvestigation={onOpenInvestigation} />)}
      </div>

      <form className="si-input" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
        <textarea value={draft} rows={compact ? 1 : 2} placeholder={placeholder ?? "Ask SI about NASA fire-safety evidence…"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }} />
        {busy
          ? <button type="button" className="si-send stop" onClick={stop} aria-label="Stop"><Square size={13} /></button>
          : <button type="submit" className="si-send" disabled={!draft.trim()} aria-label="Ask SI"><ArrowUp size={16} /></button>}
      </form>
    </section>
  );
}

function AssistantTurn({ turn, onOpenInvestigation }: { turn: SITurn; onOpenInvestigation?: (id: string) => void }) {
  const order = citationOrder(turn.text);
  const sources = new Map((turn.audit?.sources ?? []).map((s) => [s.id, s]));
  const invalid = new Set(turn.audit?.invalidCitations ?? []);
  const verified = turn.audit && turn.audit.invalidCitations.length === 0 && turn.audit.unverifiedNumbers.length === 0;
  return (
    <div className="si-answer">
      {turn.steps.length > 0 && (
        <ol className="si-steps">
          {turn.steps.map((step, i) => (
            <li key={i}>{turn.streaming && i === turn.steps.length - 1 && !turn.text ? <LoaderCircle size={11} className="spin" /> : <Search size={11} />}{step.label}</li>
          ))}
        </ol>
      )}
      {turn.streaming && !turn.text && turn.steps.length === 0 && <p className="si-thinking"><LoaderCircle size={13} className="spin" /> Reading the question…</p>}
      {turn.text && <div className="si-md">{renderMarkdown(turn.text, order, sources, invalid, onOpenInvestigation)}</div>}
      {turn.notices.map((n, i) => <p key={i} className="si-notice">{n}</p>)}
      {turn.error && <p className="si-error"><AlertTriangle size={13} /> {turn.error}</p>}
      {turn.audit && (
        <footer className="si-audit">
          <span className={verified ? "ok" : "warn"}>
            {verified ? <BadgeCheck size={12} /> : <ShieldAlert size={12} />}
            {turn.audit.cited.length} citation{turn.audit.cited.length === 1 ? "" : "s"} checked against retrieved evidence
            {turn.audit.invalidCitations.length > 0 && ` · ${turn.audit.invalidCitations.length} not retrieved (struck through)`}
            {turn.audit.unverifiedNumbers.length > 0 && ` · numbers not found in evidence: ${turn.audit.unverifiedNumbers.join(", ")}`}
          </span>
          <span className="si-model">{turn.audit.retrieval ? `${turn.audit.retrieval} retrieval` : "PSI tables and metadata"} · {turn.audit.model}</span>
          {order.length > 0 && (
            <ol className="si-sources">
              {order.map((id, i) => {
                const s = sources.get(id);
                const record = turn.audit?.records.includes(id);
                return (
                  <li key={id} id={`si-${turn.id}-${i + 1}`} className={invalid.has(id) ? "invalid" : ""}>
                    <b>{i + 1}</b>
                    {s ? <><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> <small>{s.location}{s.role && ["mishap", "spinoff"].includes(s.role) ? " · historical" : ""}</small></>
                      : record ? <button type="button" className="text-link" onClick={() => onOpenInvestigation?.(id.split(":")[0])}>PSI record {id}</button>
                        : <span>{id}</span>}
                  </li>
                );
              })}
            </ol>
          )}
        </footer>
      )}
    </div>
  );
}

const CITE = /\[\[([^[\]]{1,80})\]\]/g;
function citationOrder(text: string) {
  return [...new Set([...text.matchAll(CITE)].map((m) => m[1]))];
}

function inline(text: string, order: string[], sources: Map<string, SISource>, invalid: Set<string>, open?: (id: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[\[([^[\]]{1,80})\]\]|`([^`]+)`/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={m.index}>{m[1]}</strong>);
    else if (m[3]) out.push(<code key={m.index}>{m[3]}</code>);
    else {
      const id = m[2];
      const n = order.indexOf(id) + 1;
      const s = sources.get(id);
      const psi = /^PSI-\d+/.exec(id)?.[0];
      out.push(
        <button key={m.index} type="button" className={`si-cite${invalid.has(id) ? " invalid" : ""}`}
          title={s ? `${s.title} — ${s.location}` : id}
          onClick={() => (s?.url && s.kind !== "metadata" ? window.open(s.url, "_blank", "noopener") : psi && open ? open(psi) : undefined)}>
          {n || "?"}
        </button>,
      );
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Minimal markdown: paragraphs, bullet and numbered lists, pipe tables, bold, code. */
function renderMarkdown(text: string, order: string[], sources: Map<string, SISource>, invalid: Set<string>, open?: (id: string) => void) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  const fmt = (s: string) => inline(s, order, sources, invalid, open);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (/^\s*\|/.test(line)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        const cells = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      blocks.push(
        <div className="si-table" key={`t${i}`}><table>
          {head && <thead><tr>{head.map((c, k) => <th key={k}>{fmt(c)}</th>)}</tr></thead>}
          <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{fmt(c)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    if (/^\s*([-*•]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+\.)\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*([-*•]|\d+\.)\s+/, "")); i++; }
      const List = ordered ? "ol" : "ul";
      blocks.push(<List key={`l${i}`}>{items.map((it, k) => <li key={k}>{fmt(it)}</li>)}</List>);
      continue;
    }
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) { blocks.push(<h4 key={`h${i}`}>{fmt(heading[1])}</h4>); i++; continue; }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(\||[-*•]\s|\d+\.\s|#{1,4}\s)/.test(lines[i])) { para.push(lines[i]); i++; }
    blocks.push(<p key={`p${i}`}>{para.map((p, k) => <Fragment key={k}>{k > 0 && " "}{fmt(p)}</Fragment>)}</p>);
  }
  return blocks;
}
