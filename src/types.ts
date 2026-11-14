export type VehicleId = "orion" | "iss";
export type Overlay = "materials" | "thermal" | "airflow";
export interface Atmosphere {
  oxygen: number;
  pressure: number;
  flow: number;
}
export interface Surface {
  id: string;
  name: string;
  kind: string;
  material: string;
}
export interface SceneProps {
  vehicle: VehicleId;
  cutaway: boolean;
  overlay: Overlay;
  selectedSurface: string;
  onSelectSurface: (id: string) => void;
  time: number;
  playing: boolean;
  runId: number;
  ignitionSurface: string | null;
  atmosphere: Atmosphere;
  materialAssignments: Record<string, string>;
  resetCameraKey: number;
}
export interface ExperimentTest {
  id: string;
  investigationId: string;
  label: string;
  material: string | null;
  oxygenPct: number | null;
  pressureKpa: number | null;
  flowCmS: number | null;
  outcome: string | null;
  raw: Record<string, string | number | null>;
  sourceFile?: string;
  sourceRow?: number;
  normalizationNotes?: string[];
}
export interface Investigation {
  id: string;
  name: string;
  title: string;
  platform: string;
  category: "solid" | "droplet" | "gas" | "detection" | "large-scale" | "other";
  description: string;
  sourceUrl: string;
  doi: string | null;
  status: "downloaded" | "metadata-only" | "unavailable";
  testCount: number;
  columns: string[];
  tests: ExperimentTest[];
  dataUrl: string | null;
  limitations: string[];
  recordGrain?: string;
}
export interface NasaData {
  schemaVersion: number;
  retrievedAt: string;
  source: string;
  investigations: Investigation[];
  errors: { id: string; message: string }[];
}
