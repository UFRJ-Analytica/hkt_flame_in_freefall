import { useCallback, useEffect, useRef, useState } from "react";
import type { ResearchBundle, ResearchContext, ResearchIntent, ResearchStatus } from "./types";
import { contextKey } from "./provenance";

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Research service: HTTP ${response.status}${detail && !detail.startsWith("<") ? ` · ${detail.slice(0, 200)}` : ""}`);
  }
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("API not found on this server.");
  return response.json() as Promise<T>;
}
export function useResearch(context: ResearchContext) {
  const [question, setQuestion] = useState("PMMA low flow");
  const [intent, setIntent] = useState<ResearchIntent>("prevention");
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [bundle, setBundle] = useState<ResearchBundle | null>(null);
  const [acceptedKey, setAcceptedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starterPending, setStarterPending] = useState(false);
  const key = JSON.stringify([contextKey(context), question.trim(), intent]);
  const activeKey = useRef(key);
  activeKey.current = key;
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const statusController = useRef<AbortController | null>(null);
  const refreshStatus = useCallback(async () => {
    statusController.current?.abort();
    const abort = new AbortController();
    statusController.current = abort;
    setStatusLoading(true);
    try {
      const next = await readResponse<ResearchStatus>(await fetch("/api/research/status", { signal: abort.signal }));
      if (!abort.signal.aborted) {
        setStatus(next);
        setError(next.status === "ready" ? null : "Research corpus unavailable.");
      }
    } catch (err) {
      if (!abort.signal.aborted) { setStatus(null); setError(err instanceof Error ? err.message : "API unavailable."); }
    } finally { if (!abort.signal.aborted) setStatusLoading(false); }
  }, []);
  useEffect(() => { void refreshStatus(); return () => { statusController.current?.abort(); controller.current?.abort(); }; }, [refreshStatus]);
  useEffect(() => {
    controller.current?.abort();
    sequence.current += 1;
    setAcceptedKey(null);
    setBusy(false);
  }, [key]);
  function startStarter(starter: { question: string; intent: ResearchIntent }) {
    setQuestion(starter.question);
    setIntent(starter.intent);
    setStarterPending(true);
  }
  useEffect(() => {
    if (starterPending) {
      setStarterPending(false);
      void submit();
    }
  }, [key, starterPending]);
  async function submit(synthesize = false) {
    const submittedQuestion = question;
    const submittedIntent = intent;
    if (!submittedQuestion.trim() || (synthesize && !status?.generationConfigured)) return;
    const submittedKey = JSON.stringify([contextKey(context), submittedQuestion.trim(), submittedIntent]);
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const generation = ++sequence.current;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/research/${synthesize ? "synthesize" : "search"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ question: submittedQuestion.trim(), intent: submittedIntent, context, limit: 5 }),
      });
      const next = await readResponse<ResearchBundle>(response);
      if (abort.signal.aborted || generation !== sequence.current || activeKey.current !== submittedKey) return;
      if (next.schemaVersion !== 1 || contextKey(next.context) !== contextKey(context) || next.question.trim() !== submittedQuestion.trim() || next.intent !== submittedIntent) throw new Error("Response from a different context rejected. Run a new search.");
      setBundle(next);
      setAcceptedKey(submittedKey);
    } catch (err) {
      if (!abort.signal.aborted && generation === sequence.current) setError(err instanceof Error ? err.message : "Failed to retrieve evidence.");
    } finally { if (!abort.signal.aborted && generation === sequence.current) setBusy(false); }
  }
  return { question, setQuestion, intent, setIntent, status, statusLoading, refreshStatus, bundle,
    stale: bundle !== null && (acceptedKey !== key || (status !== null && bundle.corpusVersion !== status.corpusVersion)),
    busy, error, submit, startStarter };
}
export type ResearchState = ReturnType<typeof useResearch>;
