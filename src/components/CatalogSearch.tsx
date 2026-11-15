import { useState, type ReactNode } from "react";
import { ArrowRight, LoaderCircle, Search, Sparkles } from "lucide-react";
import "./catalog-search.css";

interface Hit {
  id: string; kind: string; title: string; url: string; location: string; text: string;
  investigationIds: string[]; relevance: number;
}

const EXAMPLES = ["cotton-fiberglass fabric burning in orbit", "fuel droplets burning without a visible flame", "smoke from overheated wire insulation"];
const STOP = new Set(["the", "and", "with", "from", "that", "this", "into", "without", "burning", "about", "which", "what"]);

const tokens = (q: string) => [...new Set(q.toLowerCase().split(/[^a-z0-9₂]+/).filter((w) => w.length > 3 && !STOP.has(w)))];

/** The part of the passage around the first query word, so the user sees where it matched. */
function snippet(text: string, words: string[]) {
  const lower = text.toLowerCase();
  const at = words.map((w) => lower.indexOf(w.slice(0, Math.max(4, w.length - 2)))).filter((i) => i >= 0).sort((a, b) => a - b)[0];
  const start = at === undefined ? 0 : Math.max(0, at - 90);
  const body = text.slice(start, start + 300);
  return `${start > 0 ? "…" : ""}${body}${start + 300 < text.length ? "…" : ""}`;
}

function highlight(text: string, words: string[]): ReactNode[] {
  if (!words.length) return [text];
  const stems = words.map((w) => w.slice(0, Math.max(4, w.length - 2)).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${stems.join("|")})[a-z]*`, "gi");
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push(<mark key={m.index}>{m[0]}</mark>);
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

/** Semantic search over the investigations: finds them by what they did, not only by their title. */
export function CatalogSearch({ onOpen }: { onOpen: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [mode, setMode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState("");

  async function run(q = query) {
    if (!q.trim()) return;
    setQuery(q); setBusy(true); setError(null);
    try {
      const r = await fetch("/api/research/retrieve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q, limit: 5, scope: "investigations" }) });
      if (!r.ok || !r.headers.get("content-type")?.includes("json")) throw new Error(`HTTP ${r.status}`);
      const body = await r.json();
      setHits(body.passages); setMode(body.retrieval); setAsked(q);
    } catch (e) { setError(e instanceof Error ? `Search unavailable (${e.message}).` : "Search unavailable."); } finally { setBusy(false); }
  }
  const words = tokens(asked);
  return (
    <section className="catalog-search" aria-label="Semantic search across investigations">
      <form onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <Sparkles size={16} className="cs-mark" />
        <input aria-label="Search investigations by meaning" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Describe a material, condition or behaviour — e.g. cotton-fiberglass fabric burning in orbit" />
        <button className="button primary" disabled={busy || !query.trim()}>{busy ? <LoaderCircle size={14} className="spin" /> : <Search size={14} />} Search by meaning</button>
      </form>
      <p className="cs-note">
        <b>Semantic search</b> over all 24 investigations: every description, material list and condition is embedded as a vector
        (Voyage) and matched by meaning together with keywords in MongoDB Atlas, so it finds experiments whose <i>titles never mention</i> what you typed.
        {mode && <span className="cs-mode"> · {mode} retrieval</span>}
      </p>
      {!hits && (
        <div className="cs-examples">Try: {EXAMPLES.map((q) => <button key={q} type="button" onClick={() => void run(q)}>{q}</button>)}</div>
      )}
      {error && <p className="cs-error">{error}</p>}
      {hits && (
        <ol className="cs-results">
          {hits.map((h) => {
            const id = h.investigationIds[0];
            const inTitle = words.some((w) => h.title.toLowerCase().includes(w.slice(0, Math.max(4, w.length - 2))));
            return (
              <li key={h.id}>
                <button type="button" onClick={() => id && onOpen(id)}>
                  <span className="cs-head">
                    <strong>{h.title}</strong>
                    <small>{id}</small>
                    {!inTitle && <em className="cs-badge">found by meaning · not in title</em>}
                  </span>
                  <span className="cs-text">{highlight(snippet(h.text, words), words)}</span>
                  <span className="cs-open">Open records <ArrowRight size={12} /></span>
                </button>
              </li>
            );
          })}
          {hits.length === 0 && <li className="cs-empty">No investigation matched.</li>}
        </ol>
      )}
    </section>
  );
}
