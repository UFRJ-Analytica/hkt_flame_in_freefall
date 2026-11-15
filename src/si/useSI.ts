// Streaming client for SI (/api/si/ask). The server sends server-sent events: tool steps as they
// run, answer text deltas, page actions (row selection, open investigation), the investigation
// ranking produced by the rank tool, and a final audit of citations and numbers.

import { useCallback, useRef, useState } from "react";
import type { ResearchBundle } from "../research/types";

export type SIStage = "identify" | "extract" | "controls" | "catalog";

export interface SISource {
  id: string;
  kind?: string;
  title: string;
  url: string;
  location: string;
  text?: string;
  investigationIds?: string[];
  role?: string;
}
export interface SIAudit {
  cited: string[];
  invalidCitations: string[];
  unverifiedNumbers: string[];
  sources: SISource[];
  records: string[];
  retrieval: string | null;
  model: string;
}
export interface SIStep { tool: string; label: string }
export interface SITurn {
  id: number;
  role: "user" | "assistant";
  text: string;
  steps: SIStep[];
  notices: string[];
  audit?: SIAudit;
  error?: string;
  streaming?: boolean;
}
export type SIAction =
  | { action: "select"; quantities: string[]; materials: string[]; datasets: string[]; text: string; oxygenMin?: number | null; oxygenMax?: number | null; explanation: string }
  | { action: "open"; id: string };

export interface SIRequestContext {
  stage: SIStage;
  environment?: string;
  facets?: { quantities: string[]; materials: string[]; datasets: string[] };
  investigation?: string;
}

interface Handlers {
  onRanking?: (bundle: ResearchBundle, focus: string, environment: string) => void;
  onAction?: (action: SIAction) => void;
}

let counter = 0;

export function useSI(handlers: Handlers = {}) {
  const [turns, setTurns] = useState<SITurn[]>([]);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const patch = (id: number, update: (turn: SITurn) => SITurn) =>
    setTurns((all) => all.map((turn) => (turn.id === id ? update(turn) : turn)));

  const ask = useCallback(async (question: string, context: SIRequestContext) => {
    const text = question.trim();
    if (!text) return;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const history = turns
      .filter((turn) => turn.text.trim() && !turn.error)
      .slice(-6)
      .map((turn) => ({ role: turn.role, text: turn.text.slice(0, 6000) }));
    const userTurn: SITurn = { id: ++counter, role: "user", text, steps: [], notices: [] };
    const reply: SITurn = { id: ++counter, role: "assistant", text: "", steps: [], notices: [], streaming: true };
    setTurns((all) => [...all, userTurn, reply]);
    setBusy(true);
    try {
      const response = await fetch("/api/si/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history, ...context }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? `SI returned HTTP ${response.status}.`);
      }
      if (!response.headers.get("content-type")?.includes("text/event-stream")) throw new Error("SI is not reachable from this server.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut: number;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const line = buffer.slice(0, cut).trim();
          buffer = buffer.slice(cut + 2);
          if (!line.startsWith("data:")) continue;
          let event: any;
          try { event = JSON.parse(line.slice(5)); } catch { continue; }
          if (event.type === "text") patch(reply.id, (t) => ({ ...t, text: t.text + event.delta }));
          else if (event.type === "step") patch(reply.id, (t) => ({ ...t, steps: [...t.steps, { tool: event.tool, label: event.label }] }));
          else if (event.type === "notice") patch(reply.id, (t) => ({ ...t, notices: [...t.notices, event.text] }));
          else if (event.type === "ranking") handlersRef.current.onRanking?.(event.bundle, event.focus, event.environment);
          else if (event.type === "action") handlersRef.current.onAction?.(event as SIAction);
          else if (event.type === "error") patch(reply.id, (t) => ({ ...t, error: event.message }));
          else if (event.type === "done") patch(reply.id, (t) => ({ ...t, audit: event as SIAudit }));
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        patch(reply.id, (t) => ({ ...t, notices: [...t.notices, "Stopped."] }));
      } else {
        patch(reply.id, (t) => ({ ...t, error: error instanceof Error ? error.message : "SI is unavailable." }));
      }
    } finally {
      patch(reply.id, (t) => ({ ...t, streaming: false }));
      if (abort.current === controller) abort.current = null;
      setBusy(false);
    }
  }, [turns]);

  const stop = useCallback(() => abort.current?.abort(), []);
  const reset = useCallback(() => { abort.current?.abort(); setTurns([]); }, []);
  return { turns, busy, ask, stop, reset };
}
