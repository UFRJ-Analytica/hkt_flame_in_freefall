import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, TriangleAlert, X } from "lucide-react";
import { useModalFocus } from "../../hooks/useModalFocus";
import { SOFIE_GEL_DATA_PATH, SOFIE_GEL_TITLE } from "./sofieGel";
import "./sofie-gel.css";
import { englishDisplayData } from "../../i18n/english";

/* ------------------------------------------------------------------ data contract (gel-evidence.json) */
type Kind = "published" | "derived" | "video_observation" | "exploratory" | "hypothesis" | "unavailable";
interface Val<T = number> {
  kind: Kind;
  value: T | null;
  unit?: string;
  note?: string;
  reason?: string;
  source?: string;
  equation?: string;
  [extra: string]: unknown;
}
type Mode = "quenching" | "blowoff" | "intermediate";
interface CaseRow {
  case: number;
  sample: string;
  extinctionMode: Val<Mode>;
  location: Val<string>;
  flow: Val;
  o2AtExtinction: Val;
  pressure: Val;
  reynolds: Val;
  strainRate: Val;
  conductiveHeatLoss: Val;
  strainRateCheck: Val;
  impliedViscosity: Val;
  publishedDynamics: Record<string, Val<number | number[]>>;
}
interface SpinWindow {
  video_s: [number, number];
  status: string;
  peak_Hz?: number;
  peakPower?: number;
  threshold99?: number;
  significant?: boolean;
}
interface GelEvidence {
  schemaVersion: 1;
  title: string;
  statement: string;
  kinds: Record<Kind, string>;
  investigation: {
    name: string;
    agency: string;
    principalInvestigator: string;
    platform: string;
    objective: string;
    officialPage: string;
    psi: Val<null>;
    firstTest: Val<string>;
  };
  sample: Record<string, Val<string | number>>;
  facility: Record<string, Val<string | number | number[]>>;
  cases: {
    source: string;
    rows: CaseRow[];
    consistency: { strainRate: Val; viscosity: Val<number[]>; radius_cm: number };
  };
  publishedFindings: Val<string>[];
  video1410C: {
    label: string;
    test: string;
    video: { title: string; origin: string; publicRelease: string; codec: string; resolution: number[]; fps: number; duration_s: number; association: string; editing: string; overlay: string };
    cadence: Val & { uniqueFramesPerVideoSecond: number };
    editTransition_video_s: Val<number[]>;
    segments: Val<number[]>[];
    method: { signal: string; window_s: number; step_s: number; permutations: number; seed: number; spinFloor_Hz: number; nyquist_videoHz: number };
    windows: Val<SpinWindow[]>;
    summary: Val<{ spinningWindows: number; analysedWindows: number; peakRange_videoHz: number[]; spinningSpan_video_s: number[] }>;
    timeBase: {
      H1_realTime: Val<number[]> & { assumes: string; windowsInsidePublishedRange: number };
      H2_slowMotion: Val<number[]> & { assumes: string; windowsInsidePublishedRange: number };
      note: string;
    };
    aliasing: Val<string>;
    publishedReference: Val<number[]>;
    spatialScale: Val<null>;
    useAsModelParameter: false;
  };
  context: { role: string; notConnectedTo: string[] };
  limitations: { id: string; text: string }[];
  sources: { label: string; url?: string; path?: string }[];
}

function isGelEvidence(value: unknown): value is GelEvidence {
  const data = value as GelEvidence;
  return (
    !!data &&
    data.schemaVersion === 1 &&
    data.investigation?.psi?.value === null &&
    Array.isArray(data.cases?.rows) &&
    data.cases.rows.length === 5 &&
    data.video1410C?.useAsModelParameter === false &&
    data.video1410C.windows?.kind === "exploratory" &&
    Array.isArray(data.limitations) &&
    data.limitations.length >= 7
  );
}

/* ------------------------------------------------------------------ helpers */
const KIND_LABEL: Record<Kind, string> = {
  published: "published",
  derived: "derived",
  video_observation: "video observation",
  exploratory: "exploratory",
  hypothesis: "hypothesis",
  unavailable: "unavailable",
};
const MODE_LABEL: Record<Mode, string> = { quenching: "quenching", blowoff: "blowoff", intermediate: "intermediate" };
const LOCATION_LABEL: Record<string, string> = { "inside duct": "inside duct", "duct exit": "duct exit" };
const fmt = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const DYNAMICS_LABEL: Record<string, [string, string]> = {
  pulsationCycles: ["pulsation cycles", ""],
  pulsationPeriod_s: ["pulsation period", "s"],
  extinction_s: ["extinction at", "s"],
  baseTravel_cm: ["mean base displacement", "cm"],
  upstreamPulsationPeriod_s: ["upstream pulsation period", "s"],
  azimuthalSpinning_s: ["azimuthal spinning", "s"],
  pulsation_s: ["self-sustained pulsation", "s"],
  pulsationFrequency_Hz: ["pulsation frequency", "Hz"],
  peakTipSpeed_cm_s: ["peak tip speed", "cm/s"],
  standoff_mm: ["stagnation-point standoff", "mm"],
  quenching_s: ["quenching at", "s"],
  sideStabilized_s: ["side-stabilized flame", "s"],
  spinning_s: ["spinning", "s"],
  spinFrequency_Hz: ["spin frequency", "Hz"],
};

function KindTag({ kind }: { kind: Kind }) {
  return <span className={`sg-kind sg-kind-${kind}`}>{KIND_LABEL[kind]}</span>;
}

function Section({ id, letter, title, kinds, children }: { id: string; letter?: string; title: string; kinds?: Kind[]; children: ReactNode }) {
  return (
    <section className="sg-section" aria-labelledby={`sg-${id}`}>
      <div className="sg-section-heading">
        <h3 id={`sg-${id}`}>
          {letter && <span className="sg-letter">{letter}</span>}
          {title}
        </h3>
        {kinds && (
          <span className="sg-kinds">
            {kinds.map((kind) => (
              <KindTag key={kind} kind={kind} />
            ))}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function ModeMark({ mode, x, y, size = 6 }: { mode: Mode; x: number; y: number; size?: number }) {
  if (mode === "blowoff") return <rect className={`sg-mark sg-mode-${mode}`} x={x - size} y={y - size} width={size * 2} height={size * 2} rx={1.5} />;
  if (mode === "intermediate")
    return <path className={`sg-mark sg-mode-${mode}`} d={`M${x} ${y - size - 1} L${x + size + 1} ${y} L${x} ${y + size + 1} L${x - size - 1} ${y} Z`} />;
  return <circle className={`sg-mark sg-mode-${mode}`} cx={x} cy={y} r={size} />;
}

/* ------------------------------------------------------------------ module */
export default function SofieGelObservation({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<GelEvidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  useModalFocus(true, onClose);
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}${SOFIE_GEL_DATA_PATH}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((value: unknown) => {
        if (!alive) return;
        if (isGelEvidence(value)) setData(englishDisplayData(value));
        else setError("The gel-evidence.json file does not have the expected format.");
      })
      .catch((reason: unknown) => alive && setError(`Could not load SoFIE-GEL evidence (${String(reason)}).`));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal sg-modal" role="dialog" aria-modal="true" aria-labelledby="sg-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">NASA SoFIE-GEL · PUBLISHED EVIDENCE · NO PSI DATASET</span>
            <h2 id="sg-title">{SOFIE_GEL_TITLE}</h2>
          </div>
          <button className="icon-button" aria-label="Close SoFIE-GEL evidence" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {error && <div className="data-notice">{error}</div>}
        {!data && !error && <p className="sg-loading">Loading SoFIE-GEL evidence…</p>}
        {data && <Body data={data} />}
      </section>
    </div>
  );
}

function Body({ data }: { data: GelEvidence }) {
  return (
    <div className="sg-body">
      <Limitations data={data} />
      <KindLegend data={data} />
      <Identification data={data} />
      <Cases data={data} />
      <Comparison data={data} />
      <Video1410C data={data} />
      <Sources data={data} />
    </div>
  );
}

/* ------------------------------------------------------------------ E. permanent limitations (shown first) */
function Limitations({ data }: { data: GelEvidence }) {
  return (
    <div className="sg-notices" role="note">
      <h3>
        <TriangleAlert size={15} /> E. Permanent limitations
      </h3>
      <p className="sg-statement">{data.statement}</p>
      <ol>
        {data.limitations.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ol>
    </div>
  );
}

function KindLegend({ data }: { data: GelEvidence }) {
  return (
    <dl className="sg-kind-legend" aria-label="Value types">
      {(Object.keys(data.kinds) as Kind[]).map((kind) => (
        <div key={kind}>
          <dt>
            <KindTag kind={kind} />
          </dt>
          <dd>{data.kinds[kind]}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------------------------------------ A. identification */
function Identification({ data }: { data: GelEvidence }) {
  const inv = data.investigation;
  const facility = data.facility;
  const range = (v: Val<string | number | number[]>) => (Array.isArray(v.value) ? `${fmt(v.value[0], v.value[0] < 1 ? 2 : 0)}–${fmt(v.value[1], v.value[1] < 2 ? 2 : 0)} ${v.unit ?? ""}` : String(v.value));
  return (
    <Section id="id" letter="A" title="Scientific identification" kinds={["published", "unavailable"]}>
      <dl className="sg-facts">
        <div>
          <dt>Investigation</dt>
          <dd>{inv.name}</dd>
        </div>
        <div>
          <dt>Agency and team</dt>
          <dd>
            {inv.agency}. PI: {inv.principalInvestigator}
          </dd>
        </div>
        <div>
          <dt>Platform</dt>
          <dd>{inv.platform}</dd>
        </div>
        <div>
          <dt>Fuel and geometry</dt>
          <dd>
            {String(data.sample.material.value)}, {fmt(Number(data.sample.diameter.value), 0)} cm {String(data.sample.geometry.value)}
            <small>{data.sample.diameter.note}</small>
          </dd>
        </div>
        <div>
          <dt>Campaign ranges</dt>
          <dd>
            flow {range(facility.flowRange)} · O₂ {range(facility.o2Range)} · pressure {range(facility.pressureRange)}
            <small>published 2025 summary</small>
          </dd>
        </div>
        <div>
          <dt>NASA PSI dataset</dt>
          <dd>
            <KindTag kind="unavailable" /> {inv.psi.reason}
          </dd>
        </div>
      </dl>
      <p className="sg-objective">
        <strong>Objective.</strong> {inv.objective}
      </p>
      <p className="sg-note">{data.context.role} Not connected to: {data.context.notConnectedTo.join(", ")}.</p>
      <a className="text-link" href={inv.officialPage} target="_blank" rel="noreferrer">
        NASA SoFIE-GEL page <ArrowUpRight size={13} />
      </a>
    </Section>
  );
}

/* ------------------------------------------------------------------ B. five cases */
function Cases({ data }: { data: GelEvidence }) {
  const rows = data.cases.rows;
  return (
    <Section id="cases" letter="B" title="Five published extinction cases" kinds={["published", "derived", "unavailable"]}>
      <p className="sg-note sg-emph">
        Source: {data.cases.source}. 4 cm PMMA sphere; extinction by gradual O₂ depletion at constant flow. Values as
        printed.
      </p>
      <div className="table-scroll sg-table-scroll">
        <table className="sg-table">
          <thead>
            <tr>
              <th>Case · sample</th>
              <th>Extinction mode</th>
              <th>Location</th>
              <th>Flow (cm/s)</th>
              <th>O₂ at extinction (%)</th>
              <th>Pressure (atm)</th>
              <th>Re</th>
              <th>Strain rate (1/s)</th>
              <th>Conductive heat loss (W/cm²)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sample}>
                <td>
                  <strong>
                    {row.case} · {row.sample}
                  </strong>
                </td>
                <td>
                  <span className={`sg-mode-dot sg-mode-${row.extinctionMode.value}`} aria-hidden="true" />
                  {MODE_LABEL[row.extinctionMode.value as Mode]}
                </td>
                <td>{LOCATION_LABEL[row.location.value as string] ?? row.location.value}</td>
                <td className="mono">{fmt(row.flow.value)}</td>
                <td className="mono">{fmt(row.o2AtExtinction.value)}</td>
                <td className="mono">{fmt(row.pressure.value)}</td>
                <td className="mono">{fmt(row.reynolds.value, 1)}</td>
                <td className="mono">{fmt(row.strainRate.value)}</td>
                <td className="mono">
                  {row.conductiveHeatLoss.kind === "unavailable" ? (
                    <span className="sg-missing">not recorded</span>
                  ) : (
                    fmt(row.conductiveHeatLoss.value)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sg-note">
        <KindTag kind="derived" /> Table consistency: 3U/(2R) differs from the published rate by at most {fmt(data.cases.consistency.strainRate.value, 4)} 1/s
        (rounding bound 0.00875); all five Re values correspond to a single viscosity of {fmt(data.cases.consistency.viscosity.value?.[0], 3)}–
        {fmt(data.cases.consistency.viscosity.value?.[1], 4)} cm²/s (room-temperature air).
      </p>
      <div className="sg-dynamics">
        {rows
          .filter((row) => Object.keys(row.publishedDynamics).length)
          .map((row) => (
            <div key={row.sample} className="sg-panel">
              <h4>
                {row.sample} <KindTag kind="published" />
              </h4>
              <ul className="sg-list">
                {Object.entries(row.publishedDynamics).map(([key, entry]) => {
                  const [label, unit] = DYNAMICS_LABEL[key] ?? [key, ""];
                  const value = Array.isArray(entry.value)
                    ? entry.value.map((v) => fmt(v, v % 1 ? 1 : 0)).join(key.includes("Frequency") && entry.value.length > 2 ? " → " : "–")
                    : fmt(entry.value as number, (entry.value as number) % 1 ? 2 : 0);
                  return (
                    <li key={key}>
                      {label}: <span className="mono">{value}</span> {unit}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </div>
      <h4 className="sg-subtitle">
        Published findings <KindTag kind="published" />
      </h4>
      <ul className="sg-list sg-findings">
        {data.publishedFindings.map((finding) => (
          <li key={finding.value}>
            {finding.value} <small>{finding.source}</small>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------------ C. comparison charts */
function ExtinctionChart({ rows }: { rows: CaseRow[] }) {
  const W = 620;
  const H = 290;
  const M = { left: 52, right: 20, top: 32, bottom: 44 };
  const xMin = 0.2;
  const xMax = 60;
  const yMin = 12;
  const yMax = 22;
  const x = (a: number) => M.left + ((Math.log10(a) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin))) * (W - M.left - M.right);
  const y = (o: number) => M.top + (1 - (o - yMin) / (yMax - yMin)) * (H - M.top - M.bottom);
  return (
    <div className="sg-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="O2 at extinction versus stagnation-point strain rate, five published cases">
        {[0.3, 1, 3, 10, 30].map((t) => (
          <g key={t}>
            <line className="sg-grid" x1={x(t)} x2={x(t)} y1={M.top} y2={H - M.bottom} />
            <text className="sg-tick" x={x(t)} y={H - M.bottom + 14} textAnchor="middle">
              {fmt(t, t < 1 ? 1 : 0)}
            </text>
          </g>
        ))}
        {[12, 14, 16, 18, 20, 22].map((t) => (
          <g key={t}>
            <line className="sg-grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text className="sg-tick" x={M.left - 6} y={y(t) + 3} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <line className="sg-ref" x1={x(7.5)} x2={x(7.5)} y1={M.top} y2={H - M.bottom} />
        <text className="sg-region-label" x={x(7.5) + 5} y={M.top + 10}>
          7.5 1/s: branch junction (published, 2025)
        </text>
        <text className="sg-axis-label" x={(M.left + W - M.right) / 2} y={H - 8} textAnchor="middle">
          strain rate a = 3U/(2R) (1/s, log scale)
        </text>
        <text className="sg-axis-label" x={12} y={M.top - 8}>
          O₂ at extinction (%)
        </text>
        {rows.map((row) => {
          const cx = x(row.strainRate.value!);
          const cy = y(row.o2AtExtinction.value!);
          return (
            <g key={row.sample}>
              <title>{`${row.sample}: ${MODE_LABEL[row.extinctionMode.value as Mode]}, U = ${fmt(row.flow.value)} cm/s, a = ${fmt(row.strainRate.value)} 1/s, O₂ = ${fmt(row.o2AtExtinction.value)} %, p = ${fmt(row.pressure.value)} atm (published)`}</title>
              <ModeMark mode={row.extinctionMode.value as Mode} x={cx} y={cy} />
              <text className="sg-mark-label" x={cx + 9} y={cy - 7}>
                {row.sample}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="sg-chart-key">
        ● quenching · ■ blowoff · ◆ intermediate. Five published points, with no fit or extrapolation; the full boundary's "U" shape
        appears in the 2025 paper (not transcribed here).
      </p>
    </div>
  );
}

function CaseBars({ rows, field, title, unit, digits, log }: { rows: CaseRow[]; field: "flow" | "conductiveHeatLoss" | "o2AtExtinction"; title: string; unit: string; digits: number; log?: boolean }) {
  const W = 300;
  const rowH = 30;
  const M = { left: 62, right: 56, top: 6, bottom: 6 };
  const H = M.top + rowH * rows.length + M.bottom;
  const values = rows.map((r) => r[field].value).filter((v): v is number => v != null);
  const max = Math.max(...values);
  const minLog = Math.log10(0.1);
  const scale = (v: number) =>
    log ? ((Math.log10(Math.max(v, 0.1)) - minLog) / (Math.log10(max) - minLog)) * (W - M.left - M.right) : (v / max) * (W - M.left - M.right);
  return (
    <div className="sg-panel">
      <h4>
        {title} <KindTag kind="published" />
      </h4>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} by case`}>
        {rows.map((row, i) => {
          const y = M.top + i * rowH;
          const entry = row[field];
          return (
            <g key={row.sample}>
              <text className="sg-row-label" x={M.left - 8} y={y + rowH / 2 + 4} textAnchor="end">
                {row.sample}
              </text>
              {entry.value == null ? (
                <>
                  <rect className="sg-bar-missing" x={M.left} y={y + 7} width={W - M.left - M.right} height={rowH - 14} rx={3} />
                  <text className="sg-missing-label" x={M.left + 8} y={y + rowH / 2 + 4}>
                    not recorded
                  </text>
                </>
              ) : (
                <>
                  <title>{`${row.sample}: ${fmt(entry.value, digits)} ${unit} (published)`}</title>
                  <rect className={`sg-bar sg-mode-${row.extinctionMode.value}`} x={M.left} y={y + 7} width={Math.max(scale(entry.value), 2)} height={rowH - 14} rx={3} />
                  <text className="sg-bar-label" x={M.left + Math.max(scale(entry.value), 2) + 6} y={y + rowH / 2 + 4}>
                    {fmt(entry.value, digits)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <p className="sg-chart-key">
        {unit}
        {log ? " · log scale" : ""}
      </p>
    </div>
  );
}

function Comparison({ data }: { data: GelEvidence }) {
  const rows = data.cases.rows;
  return (
    <Section id="compare" letter="C" title="Experimental comparison of the five cases" kinds={["published"]}>
      <ExtinctionChart rows={rows} />
      <div className="sg-three">
        <CaseBars rows={rows} field="flow" title="Air velocity" unit="cm/s" digits={2} log />
        <CaseBars rows={rows} field="o2AtExtinction" title="O₂ at extinction" unit="%" digits={2} />
        <CaseBars rows={rows} field="conductiveHeatLoss" title="Conductive heat loss to the solid" unit="W/cm²" digits={2} />
      </div>
      <p className="sg-note">
        Observed association, not causation: in these five cases, quenching occurs at lower flows and blowoff at higher flows, as
        described by the authors. Nearly constant pressure (1.03–1.07 atm) and different preheating between cases prevent isolating
        a single variable's effect; no extinction rule is derived here.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ D. 1410C exploratory video analysis */
function SpinChart({ data }: { data: GelEvidence }) {
  const v = data.video1410C;
  const windows = (v.windows.value ?? []).filter((w) => w.status === "analysed" && w.peak_Hz != null);
  const W = 620;
  const H = 250;
  const M = { left: 48, right: 20, top: 18, bottom: 38 };
  const tMax = 46;
  const fMax = 5.5;
  const x = (t: number) => M.left + (t / tMax) * (W - M.left - M.right);
  const y = (f: number) => M.top + (1 - f / fMax) * (H - M.top - M.bottom);
  const [lo, hi] = v.publishedReference.value ?? [2, 3.5];
  return (
    <div className="sg-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dominant frequency by window in video 1410C, exploratory analysis">
        <rect className="sg-band" x={M.left} y={y(hi)} width={W - M.left - M.right} height={y(lo) - y(hi)} />
        <text className="sg-region-label" x={W - M.right - 4} y={y(hi) + 12} textAnchor="end">
          published range 2–3.5 Hz (comparable only under H1)
        </text>
        <line className="sg-ref" x1={M.left} x2={W - M.right} y1={y(v.method.nyquist_videoHz)} y2={y(v.method.nyquist_videoHz)} />
        <text className="sg-region-label" x={M.left + 4} y={y(v.method.nyquist_videoHz) - 5}>
          Nyquist 5 Hz (10 unique frames/s)
        </text>
        {[0, 1, 2, 3, 4, 5].map((t) => (
          <g key={t}>
            <line className="sg-grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text className="sg-tick" x={M.left - 6} y={y(t) + 3} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {[0, 10, 20, 30, 40].map((t) => (
          <text key={t} className="sg-tick" x={x(t)} y={H - M.bottom + 14} textAnchor="middle">
            {t}
          </text>
        ))}
        {v.editTransition_video_s.value && (
          <rect className="sg-cut" x={x(v.editTransition_video_s.value[0])} y={M.top} width={Math.max(x(v.editTransition_video_s.value[1]) - x(v.editTransition_video_s.value[0]), 3)} height={H - M.top - M.bottom}>
            <title>Edit transition (video observation)</title>
          </rect>
        )}
        <text className="sg-axis-label" x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle">
          window center (video s)
        </text>
        <text className="sg-axis-label" x={8} y={M.top - 6}>
          peak (video Hz)
        </text>
        {windows.map((w) => {
          const cx = x((w.video_s[0] + w.video_s[1]) / 2);
          const cy = y(w.peak_Hz!);
          return (
            <g key={w.video_s[0]}>
              <title>{`Window ${fmt(w.video_s[0], 1)}–${fmt(w.video_s[1], 1)} s: peak ${fmt(w.peak_Hz, 2)} video Hz, power ${fmt(w.peakPower, 2)} (99 % threshold ${fmt(w.threshold99, 2)}) — ${w.significant ? "significant" : "not significant"} · exploratory`}</title>
              <circle className={w.significant ? "sg-spin" : "sg-spin sg-spin-ns"} cx={cx} cy={cy} r={5.5} />
            </g>
          );
        })}
      </svg>
      <p className="sg-chart-key">
        ● significant window (permutation, 99 %) · ○ not significant · gray band: edit transition. Peaks below 1 Hz reflect slow drift
        of the enveloping flame.
      </p>
    </div>
  );
}

function Video1410C({ data }: { data: GelEvidence }) {
  const v = data.video1410C;
  const summary = v.summary.value;
  return (
    <Section id="video" letter="D" title="Case 1410C: public video and apparent flame rotation" kinds={["video_observation", "exploratory", "hypothesis", "published", "unavailable"]}>
      <div className="sg-exploratory-label" role="note">
        <TriangleAlert size={15} />
        <strong>{v.label}</strong>
        <span>Not used as a model parameter.</span>
      </div>
      <dl className="sg-facts">
        <div>
          <dt>
            Video <KindTag kind="video_observation" />
          </dt>
          <dd>
            “{v.video.title}” · NASA, {v.video.publicRelease}
            <small>{v.video.editing}</small>
          </dd>
        </div>
        <div>
          <dt>Test association</dt>
          <dd>
            1410C
            <small>{v.video.association}</small>
          </dd>
        </div>
        <div>
          <dt>File</dt>
          <dd>
            {v.video.codec.toUpperCase()} {v.video.resolution.join(" × ")} · {fmt(v.video.fps, 0)} fps · {fmt(v.video.duration_s, 0)} s
            <small>{v.video.overlay}</small>
          </dd>
        </div>
        <div>
          <dt>Frame duplication</dt>
          <dd>
            each source frame repeated {v.cadence.value}× → {fmt(v.cadence.uniqueFramesPerVideoSecond, 0)} unique frames per video second
          </dd>
        </div>
        <div>
          <dt>Editing</dt>
          <dd>
            transition at {fmt(v.editTransition_video_s.value?.[0], 1)}–{fmt(v.editTransition_video_s.value?.[1], 1)} s; segments{" "}
            {v.segments.map((s) => `${fmt(s.value?.[0], 1)}–${fmt(s.value?.[1], 1)} s`).join(" and ")}
          </dd>
        </div>
        <div>
          <dt>
            Spatial scale <KindTag kind="unavailable" />
          </dt>
          <dd>
            <small>{v.spatialScale.reason}</small>
          </dd>
        </div>
      </dl>
      <SpinChart data={data} />
      <div className="table-scroll sg-table-scroll">
        <table className="sg-table sg-compact">
          <thead>
            <tr>
              <th>Time-base hypothesis</th>
              <th>Assumption</th>
              <th>Physical frequency range of spinning windows</th>
              <th>Windows in the published range</th>
            </tr>
          </thead>
          <tbody>
            {(["H1_realTime", "H2_slowMotion"] as const).map((key) => {
              const h = v.timeBase[key];
              return (
                <tr key={key}>
                  <td>
                    {key === "H1_realTime" ? "H1 · real time" : "H2 · 3× slow motion"} <KindTag kind="hypothesis" />
                  </td>
                  <td className="sg-small">{h.assumes}</td>
                  <td className="mono">
                    {fmt(h.value?.[0])}–{fmt(h.value?.[1])} Hz
                  </td>
                  <td className="mono">
                    {h.windowsInsidePublishedRange} of {summary?.spinningWindows}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="sg-list sg-caveats">
        <li>
          <KindTag kind="published" /> Published range for 1410C: {fmt(v.publishedReference.value?.[0], 1)}–{fmt(v.publishedReference.value?.[1], 1)} Hz
          (spinning flames for about 35 s). Shown alongside, not mixed with video results.
        </li>
        <li>
          <KindTag kind="exploratory" /> {summary?.spinningWindows} of {summary?.analysedWindows} windows with significant periodicity between{" "}
          {fmt(summary?.peakRange_videoHz[0])} and {fmt(summary?.peakRange_videoHz[1])} video Hz ({v.method.window_s} s per window, step{" "}
          {v.method.step_s} s, {v.method.permutations} permutations, seed {v.method.seed}).
        </li>
        <li>
          <KindTag kind="hypothesis" /> {v.timeBase.note}
        </li>
        <li>
          <KindTag kind="hypothesis" /> Aliasing: {v.aliasing.value}; {v.aliasing.note}.
        </li>
      </ul>
    </Section>
  );
}

function Sources({ data }: { data: GelEvidence }) {
  return (
    <section className="sg-section" aria-labelledby="sg-sources">
      <h3 id="sg-sources" className="sg-sources-title">
        Sources
      </h3>
      <ul className="sg-sources">
        {data.sources.map((s) => (
          <li key={s.label}>
            {s.url ? (
              <a className="text-link" href={s.url} target="_blank" rel="noreferrer">
                {s.label} <ArrowUpRight size={12} />
              </a>
            ) : (
              <span>
                {s.label} · <code>{s.path}</code>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
