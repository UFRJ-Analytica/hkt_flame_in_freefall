import { useEffect, useRef, useState } from "react";
import { Copy, GitCompareArrows, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { gravityOf } from "../model/domain";
import type { EnsembleResult } from "./engine";
import { DEFAULT_ZONES, CELL, GRID, MATERIAL_INFO } from "./habitatModel";
import {
  computeMetrics, fieldFingerprint, prepareRun, quantiles, SEEDS, STEPS, validateInputs, type ScenarioInputs,
} from "./scenarioRun";
import { LEVEL_LABEL, type AnchorKernel, type CrossTrial, type RunLevel, type TrialRegistry } from "./trials";

export interface Alternative { id: string; name: string; inputs: ScenarioInputs }
interface AltResult {
  level: RunLevel; anchorId: string | null; areaEnd: { min: number; median: number; max: number };
  speedMmS: number; unknownContactFraction: number; fingerprint: string; litCells: number;
  zones: { id: string; name: string; probability: number; medianTimeS: number | null; kind: "chegada" | "contato" | "inerte" }[];
}

const EVENT_LABEL = { chegada: "arrival", contato: "contact", inerte: "inert" } as const;

const STORAGE = "habitatfire.alternatives.v1";
const num = (n: number | null | undefined, d = 2) => n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d });
const fmt = (s: number | null) => s === null ? "—" : s < 60 ? `${num(s, 0)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`;

function loadStored(): Alternative[] {
  try {
    const raw = localStorage.getItem(STORAGE);
    const list = raw ? JSON.parse(raw) as Alternative[] : [];
    return Array.isArray(list) ? list.filter((a) => a && typeof a.name === "string" && validateInputs(a.inputs).length === 0) : [];
  } catch { return []; }
}

export function Alternatives({ current, onLoad, registry, anchorKernels, second, ready }: {
  current: ScenarioInputs; onLoad: (inputs: ScenarioInputs, name: string) => void;
  registry: TrialRegistry; anchorKernels: Record<string, AnchorKernel>; second: CrossTrial | null; ready: boolean;
}) {
  const [items, setItems] = useState<Alternative[]>(loadStored);
  const [selected, setSelected] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, AltResult>>({});
  const [running, setRunning] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(items)); } catch { /* storage unavailable: list stays in memory */ } }, [items]);
  useEffect(() => () => workerRef.current?.terminate(), []);

  const nextName = () => `Alternative ${String.fromCharCode(65 + (items.length % 26))}`;
  const save = () => {
    const alt = { id: crypto.randomUUID(), name: nextName(), inputs: structuredClone(current) };
    setItems((l) => [...l, alt]);
    setSelected((s) => [...s, alt.id]);
  };
  const duplicate = (a: Alternative) => setItems((l) => [...l, { id: crypto.randomUUID(), name: `${a.name} (copy)`, inputs: structuredClone(a.inputs) }]);
  const update = (a: Alternative) => setItems((l) => l.map((x) => x.id === a.id ? { ...x, inputs: structuredClone(current) } : x));
  const remove = (id: string) => { setItems((l) => l.filter((x) => x.id !== id)); setSelected((s) => s.filter((x) => x !== id)); };
  const rename = (id: string, name: string) => setItems((l) => l.map((x) => x.id === id ? { ...x, name } : x));

  async function runOne(a: Alternative): Promise<AltResult | null> {
    const prepared = prepareRun(a.inputs, registry, anchorKernels, second);
    if (!prepared.engineInput) return null;
    if (!workerRef.current) workerRef.current = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    const worker = workerRef.current;
    const ensemble = await new Promise<EnsembleResult>((resolve) => {
      const id = Math.random();
      const handler = (e: MessageEvent<{ id: number; result: EnsembleResult }>) => {
        if (e.data.id !== id) return;
        worker.removeEventListener("message", handler);
        resolve(e.data.result);
      };
      worker.addEventListener("message", handler);
      worker.postMessage({ id, input: prepared.engineInput, seeds: SEEDS });
    });
    const m = computeMetrics(ensemble, prepared.grid.zoneIndex, prepared.grid.behavior, DEFAULT_ZONES.length, a.inputs.ignition.row);
    return {
      level: prepared.level, anchorId: prepared.anchor?.id ?? null,
      areaEnd: quantiles(m.area.map((c) => c[STEPS])), speedMmS: m.speedMmS, unknownContactFraction: m.unknownContactFraction,
      fingerprint: (await fieldFingerprint(ensemble)).slice(0, 12),
      litCells: ensemble.arrivals[0].reduce((n, a) => n + (a === 0 ? 1 : 0), 0),
      zones: DEFAULT_ZONES.map((z, i) => {
        const b = prepared.grid.behavior[(z.rows[0] + 1) * GRID.cols + z.cols[0] + 1];
        const events = m.zoneEvents[i].filter((e) => e >= 0).map((e) => e * CELL.stepSeconds).sort((x, y) => x - y);
        return { id: z.id, name: z.name, probability: events.length / SEEDS.length, medianTimeS: events.length ? events[events.length >> 1] : null,
          kind: b === 0 ? "inerte" : b === 1 ? "chegada" : "contato" };
      }),
    };
  }

  async function compare() {
    const chosen = items.filter((a) => selected.includes(a.id));
    const next: Record<string, AltResult> = {};
    for (const a of chosen) {
      setRunning(a.name);
      const r = await runOne(a);
      if (r) next[a.id] = r;
    }
    setResults(next);
    setRunning(null);
  }

  const chosen = items.filter((a) => selected.includes(a.id) && results[a.id]);
  const base = chosen[0] ? results[chosen[0].id] : null;
  return (
    <section className="alternatives" aria-label="A/B alternatives">
      <header>
        <div>
          <span className="eyebrow">DESIGN ALTERNATIVES</span>
          <h2>A/B scenarios</h2>
        </div>
        <button className="button secondary" onClick={save} disabled={!ready}><Plus size={13} /> Save current scenario</button>
      </header>
      {items.length === 0 ? (
        <p className="model-caption">Save the current scenario as an alternative, duplicate it, change materials, ignition, or atmosphere, and compare. All run with the same {SEEDS.length} seeds and the same {STEPS * CELL.stepSeconds / 60} min horizon.</p>
      ) : (
        <ul className="alt-list">
          {items.map((a) => (
            <li key={a.id} className={selected.includes(a.id) ? "on" : ""}>
              <label className="alt-check"><input type="checkbox" checked={selected.includes(a.id)} aria-label={`Compare ${a.name}`}
                onChange={() => setSelected((s) => s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id])} /></label>
              <div className="alt-body">
                {editing === a.id
                  ? <input className="alt-name-input" autoFocus defaultValue={a.name} aria-label="Alternative name"
                      onBlur={(e) => { rename(a.id, e.target.value.trim() || a.name); setEditing(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                  : <strong>{a.name}</strong>}
                <span>{num(a.inputs.oxygen, 1)}% O₂ · {num(a.inputs.pressure, 1)} kPa · {num(a.inputs.flow, 1)} cm/s · {gravityOf(a.inputs.gravity).label} · ignition ({a.inputs.ignition.col}, {a.inputs.ignition.row})</span>
                <span className="alt-mats">{a.inputs.zones.map((z) => MATERIAL_INFO[z.material].label).join(" · ")}</span>
              </div>
              <div className="alt-actions">
                <button title="Load for editing" onClick={() => onLoad(a.inputs, a.name)}>Open</button>
                <button title="Replace with current scenario" onClick={() => update(a)}>Update</button>
                <button title="Rename" aria-label="Rename" onClick={() => setEditing(a.id)}><Pencil size={12} /></button>
                <button title="Duplicate" aria-label="Duplicate" onClick={() => duplicate(a)}><Copy size={12} /></button>
                <button title="Delete" aria-label="Delete" onClick={() => remove(a.id)}><Trash2 size={12} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <div className="alt-run">
          <button className="button primary" disabled={!ready || selected.length < 2 || running !== null} onClick={compare}>
            {running ? <><LoaderCircle size={13} className="spin" /> Running {running}…</> : <><GitCompareArrows size={13} /> Compare {selected.length} alternatives</>}
          </button>
          <span className="model-caption">Same seeds ({SEEDS[0]}–{SEEDS[SEEDS.length - 1]}) and horizon; differences come from the inputs, not experimental uncertainty.</span>
        </div>
      )}
      {chosen.length >= 2 && base && (
        <div className="alt-table-wrap">
          <table className="alt-table">
            <thead><tr><th>Metric</th>{chosen.map((a) => <th key={a.id}>{a.name}</th>)}</tr></thead>
            <tbody>
              <tr><th>Level</th>{chosen.map((a) => <td key={a.id} className={results[a.id].level}>{LEVEL_LABEL[results[a.id].level]}</td>)}</tr>
              <tr><th>Reference trial</th>{chosen.map((a) => <td key={a.id}>{results[a.id].anchorId ?? "—"}</td>)}</tr>
              <tr><th>Cells lit at ignition</th>{chosen.map((a) => <td key={a.id} className={results[a.id].litCells ? "" : "extrapolation"}>{results[a.id].litCells || "0 · ignition on non-propagating material"}</td>)}</tr>
              <tr><th>Final area (m²)</th>{chosen.map((a) => {
                const r = results[a.id], d = r.areaEnd.median - base.areaEnd.median;
                return <td key={a.id}>{num(r.areaEnd.median)} <small>({num(r.areaEnd.min)}–{num(r.areaEnd.max)})</small>{a.id !== chosen[0].id && <em>{d >= 0 ? "+" : ""}{num(d)}</em>}</td>;
              })}</tr>
              <tr><th>Front speed (mm/s)</th>{chosen.map((a) => <td key={a.id}>{num(results[a.id].speedMmS)}</td>)}</tr>
              <tr><th>Realizations with contact without evidence</th>{chosen.map((a) => <td key={a.id}>{num(results[a.id].unknownContactFraction * 100, 0)}%</td>)}</tr>
              {DEFAULT_ZONES.map((z, i) => (
                <tr key={z.id}><th>{z.name}</th>{chosen.map((a) => {
                  const zr = results[a.id].zones[i];
                  return <td key={a.id}>{zr.kind === "inerte" ? "inert" : `${num(zr.probability * 100, 0)}% ${EVENT_LABEL[zr.kind]}${zr.medianTimeS !== null ? ` · ${fmt(zr.medianTimeS)}` : ""}`}</td>;
                })}</tr>
              ))}
              <tr><th>Field fingerprint</th>{chosen.map((a) => <td key={a.id} className="mono">{results[a.id].fingerprint}</td>)}</tr>
            </tbody>
          </table>
          <p className="model-caption">"Contact" is the front touching a material that does not propagate in the model: not a proven barrier. Ranges in parentheses are dispersion across seeds, not experimental uncertainty. Each alternative retains its own reference trial and level.</p>
        </div>
      )}
    </section>
  );
}
