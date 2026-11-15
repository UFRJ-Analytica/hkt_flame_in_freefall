// Thin client for the research service used by the dashboard (search = hybrid retrieval and
// ranking; synthesize = Claude summary with verified citations). Independent from useResearch so
// several sections can query in parallel.

import type { ResearchBundle, ResearchContext, ResearchIntent, ResearchStatus } from "../research/types";
import type { Investigation } from "../types";

async function read<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Research service HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Research service not reachable from this server.");
  return response.json() as Promise<T>;
}

export const fetchStatus = (signal?: AbortSignal) => fetch("/api/research/status", { signal }).then((r) => read<ResearchStatus>(r));

export function research(kind: "search" | "synthesize", question: string, intent: ResearchIntent, context: ResearchContext, limit: number, signal?: AbortSignal) {
  return fetch(`/api/research/${kind}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ question: question.trim(), intent, context, limit }),
  }).then((r) => read<ResearchBundle>(r));
}

/** Transparent fallback when the research service is unreachable: category ↔ fire-safety
 *  function rules plus data availability. Labelled as rule-based in the UI; never called "AI". */
const FUNCTION_CATEGORIES: Record<ResearchIntent, Investigation["category"][]> = {
  prevention: ["large-scale", "solid", "droplet"],
  detection: ["detection", "solid"],
  suppression: ["droplet", "solid", "gas"],
  "post-fire": ["solid", "detection"],
  terrestrial: ["solid", "gas", "large-scale"],
};
export function ruleBasedRanking(investigations: Investigation[], intent: ResearchIntent) {
  const preferred = FUNCTION_CATEGORIES[intent];
  return investigations
    .map((inv) => {
      const rank = preferred.indexOf(inv.category);
      const score = (rank < 0 ? 0 : (preferred.length - rank) / preferred.length) * 0.8 + (inv.status === "downloaded" ? 0.2 : 0);
      return { investigation: inv, score, reason: rank < 0 ? "category outside this function" : `${inv.category} investigations inform ${intent}` };
    })
    .sort((a, b) => b.score - a.score);
}
