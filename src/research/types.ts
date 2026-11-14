import type { ExperimentTest, Investigation, VehicleId } from "../types";

export type ResearchIntent = "prevention" | "detection" | "suppression" | "post-fire" | "terrestrial";
export interface ResearchContext {
  vehicle: VehicleId;
  surfaceId: string;
  surfaceName: string;
  structureKind: string;
  material: string;
  oxygenPct: number;
  pressureKpa: number;
  flowCmS: number;
  gravityG: number;
}
export interface ResearchRequest {
  question: string;
  intent: ResearchIntent;
  context: ResearchContext;
  limit?: number;
}
export interface EvidenceSource {
  id: string;
  title: string;
  url: string;
  location: string;
  text: string;
  investigationIds: string[];
  topics: ResearchIntent[];
  kind: "document" | "metadata";
}
export interface RankedInvestigation {
  investigation: Omit<Investigation, "tests">;
  score: number;
  relevance: "related" | "analog" | "context";
  reasons: string[];
  mismatches: string[];
  unknowns: string[];
  records: ExperimentTest[];
  sources: EvidenceSource[];
}
export interface ResearchBundle {
  schemaVersion: 1;
  requestId: string;
  contextKey: string;
  corpusVersion: string;
  question: string;
  intent: ResearchIntent;
  context: ResearchContext;
  retrievalMode: "lexical-structured" | "hybrid";
  synthesisMode: "extractive" | "claude";
  summary: string;
  findings: { text: string; sourceIds: string[] }[];
  investigations: RankedInvestigation[];
  sources: EvidenceSource[];
  gaps: string[];
  warnings: string[];
  visualization: {
    mode: "illustrative";
    label: string;
    replayAvailable: false;
    predictionAvailable: false;
    reasons: string[];
  };
}
export interface ResearchStatus {
  status: "ready" | "unavailable";
  corpusVersion: string;
  investigationCount: number;
  recordCount: number;
  documentCount: number;
  passageCount: number;
  generationConfigured: boolean;
  embeddingsConfigured: boolean;
  generationModel?: string | null;
  embeddingModel?: string | null;
  vectorStore?: string | null;
  retrievalMode: "lexical-structured" | "hybrid";
}
