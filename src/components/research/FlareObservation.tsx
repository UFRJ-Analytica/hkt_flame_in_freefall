import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, TriangleAlert, X } from "lucide-react";
import { useModalFocus } from "../../hooks/useModalFocus";
import { englishDisplayData } from "../../i18n/english";
import { FLARE_DATA_PATH, FLARE_TITLE } from "./flareEvidence";
import "./flare.css";

/* ------------------------------------------------------------------ data contract (flare-evidence.json) */
type Kind = "measured" | "predicted" | "calibration" | "measured-as-cited" | "published_summary";
interface FlareValue {
  id: string;
  source: string;
  table: string;
  campaign: string;
  material: string | null;
  gravity: string | null;
  balanceGas: string | null;
  gasLabel: string | null;
  quantity: string;
  kind: Kind;
  unit: string;
  raw: string | number;
  value: number | null;
  parse: string;
  rangeLow?: number;
  rangeHigh?: number;
  note: string | null;
}
interface LimitGroup {
  source: string;
  reference: string;
  material: string;
  thickness_mm: number | null;
  balanceGas: string;
  gasLabel: string;
  values: FlareValue[];
}
interface DeltaCheck {
  source: string;
  reference: string;
  material: string;
  gasLabel: string;
  kind: "measured" | "predicted";
  convention: string;
  computed_pp: number;
  printed_pp: number;
  reproduced: boolean;
}
interface RatioPoint {
  reference: string;
  gasLabel: string;
  material: string;
  geometry: string;
  balanceGas: string;
  LOC1g_pct: number;
  MLOC_pct: number;
  Vcr_raw: string;
  MLOC_over_LOC: number;
}
interface FlareEvidence {
  schemaVersion: 1;
  title: string;
  group: string;
  statement: string;
  scope: string;
  program: { name: string; principalInvestigator: string; partners: string; officialPages: string[]; psi: { value: null; reason: string } };
  kinds: Record<Kind, string>;
  overview: {
    objective: string;
    locVsMloc: string;
    opposedFlow: string;
    sustain: string;
    platforms: { id: string; group: string; gravity: string; quantitative: string }[];
  };
  limits: LimitGroup[];
  deltaO2: DeltaCheck[];
  deltaO2AllReproduced: boolean;
  vcr: FlareValue[];
  ratios: RatioPoint[];
  ratioNote: string;
  modelErrors: { rows: { reference?: string; source: string; material: string; balanceGas: string; MLOC_measured: number; MLOC_predicted: number; error_pp: number }[]; note: string };
  divergences: {
    mloc: { tsuboi2016_table: number; takahashi2018_table: number; takahashi2018_text_citing_ref17: number; difference_pp: number; reading: string };
    vcr: { tsuboi2016_table_measured: number; takahashi2018_text_citing_ref17: number; reading: string };
    signConvention: string;
  };
  iss: { note: string; records: FlareValue[]; publications: { id: string; doi: string; title: string; venue: string; license: string; fullTextRetrieved: boolean }[] };
  complementarity: { module: string; role: string }[];
  complementarityNote: string;
  limitations: { id: string; text: string }[];
  references: { id: string; short: string; citation: string; doi: string }[];
}

function isFlareEvidence(value: unknown): value is FlareEvidence {
  const data = value as FlareEvidence;
  return (
    !!data &&
    data.schemaVersion === 1 &&
    data.program?.psi?.value === null &&
    Array.isArray(data.limits) &&
    data.limits.length === 5 &&
    Array.isArray(data.deltaO2) &&
    Array.isArray(data.vcr) &&
    Array.isArray(data.limitations) &&
    data.limitations.length >= 6
  );
}

/* ------------------------------------------------------------------ helpers */
const KIND_LABEL: Record<Kind, string> = {
  measured: "measured",
  predicted: "predicted",
  calibration: "calibration",
  "measured-as-cited": "measured · cited",
  published_summary: "published summary",
};
const GRAVITY_LABEL: Record<string, string> = {
  "1g": "1g",
  "microgravity-parabolic": "µg · parabolic flight",
  "microgravity-ISS": "µg · ISS",
};
/** "microgravity" without platform: a prediction for µg, or a cited measurement whose platform the source does not state. */
const gravityLabel = (v: FlareValue) =>
  v.gravity === "microgravity"
    ? v.kind === "predicted"
      ? "µg (prediction)"
      : "µg (platform not stated in the source)"
    : (GRAVITY_LABEL[v.gravity ?? ""] ?? v.gravity ?? "—");
const fmt = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmt(Math.abs(value), 1)}`;
const isCalibration = (v: FlareValue) => v.kind === "calibration" || (v.note ?? "").includes("calibration");
const valueKindLabel = (v: FlareValue) => (v.kind === "predicted" && isCalibration(v) ? "predicted · calibration point" : KIND_LABEL[v.kind]);
/** Shows the printed cell for text/range values; numeric cells as en-US numbers. */
const printed = (v: FlareValue) =>
  v.value == null ? String(v.raw) : `${fmt(v.value, 1)}${v.unit.startsWith("%") ? " %" : v.unit === "cm/s" ? " cm/s" : ""}`;

function KindTag({ kind, label }: { kind: Kind; label?: string }) {
  return <span className={`fl-kind fl-kind-${kind}`}>{label ?? KIND_LABEL[kind]}</span>;
}

function Section({ id, letter, title, children }: { id: string; letter: string; title: string; children: ReactNode }) {
  return (
    <section className="fl-section" aria-labelledby={`fl-${id}`}>
      <h3 id={`fl-${id}`}>
        <span className="fl-letter">{letter}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ module */
export default function FlareObservation({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<FlareEvidence | null>(null);
  const [error, setError] = useState<string | null>(null);
  useModalFocus(true, onClose);
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}${FLARE_DATA_PATH}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((value: unknown) => {
        if (!alive) return;
        if (isFlareEvidence(value)) setData(englishDisplayData(value));
        else setError("flare-evidence.json does not have the expected format.");
      })
      .catch((reason: unknown) => alive && setError(`Could not load the FLARE evidence (${String(reason)}).`));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal fl-modal" role="dialog" aria-modal="true" aria-labelledby="fl-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">JAXA FLARE · PUBLISHED EVIDENCE · OUTSIDE PSI</span>
            <h2 id="fl-title">{FLARE_TITLE}</h2>
          </div>
          <button className="icon-button" aria-label="Close FLARE evidence" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {error && <div className="data-notice">{error}</div>}
        {!data && !error && <p className="fl-loading">Loading FLARE evidence…</p>}
        {data && <Body data={data} />}
      </section>
    </div>
  );
}

function Body({ data }: { data: FlareEvidence }) {
  return (
    <div className="fl-body">
      <Limitations data={data} />
      <Overview data={data} />
      <Limits data={data} />
      <Differences data={data} />
      <Context data={data} />
    </div>
  );
}

/* ------------------------------------------------------------------ D. permanent limitations (shown first) */
function Limitations({ data }: { data: FlareEvidence }) {
  return (
    <div className="fl-notices" role="note">
      <h3>
        <TriangleAlert size={15} /> D. Limitations and interpretation
      </h3>
      <p className="fl-statement">{data.statement}</p>
      <ol>
        {data.limitations.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------ A. overview */
function Overview({ data }: { data: FlareEvidence }) {
  const o = data.overview;
  return (
    <Section id="overview" letter="A" title="Overview">
      <dl className="fl-facts">
        <div>
          <dt>Objective</dt>
          <dd>{o.objective}</dd>
        </div>
        <div>
          <dt>LOC × MLOC</dt>
          <dd>{o.locVsMloc}</dd>
        </div>
        <div>
          <dt>Opposed flow</dt>
          <dd>{o.opposedFlow}</dd>
        </div>
        <div>
          <dt>Flame sustainment</dt>
          <dd>{o.sustain}</dd>
        </div>
      </dl>
      <div className="fl-scope" role="note">
        <strong>Scope of this version.</strong> {data.scope} The ISS experiments appear only as published abstracts.
      </div>
      <div className="table-scroll fl-table-scroll">
        <table className="fl-table fl-compact">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Gravity</th>
              <th>Quantitative data in this base</th>
            </tr>
          </thead>
          <tbody>
            {o.platforms.map((p) => (
              <tr key={p.id}>
                <td>{p.group}</td>
                <td>{p.gravity}</td>
                <td className="fl-small">{p.quantitative}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fl-note">
        PI: {data.program.principalInvestigator}. {data.program.partners}. <strong>NASA PSI dataset:</strong> unavailable — {data.program.psi.reason}
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ B. LOC/MLOC comparison */
/** Shape = quantity (LOC circle, MLOC square, cited MLOC diamond); fill = kind (measured filled, others hollow; predicted dashed). */
function Mark({ v, x, y }: { v: FlareValue; x: number; y: number }) {
  const cited = v.kind === "measured-as-cited";
  const hollow = v.kind !== "measured";
  const cls = `fl-mark fl-q-${v.quantity.toLowerCase()}${hollow ? " fl-hollow" : ""}${v.kind === "predicted" ? " fl-dashed" : ""}`;
  if (cited) return <path className={cls} d={`M${x} ${y - 7} L${x + 7} ${y} L${x} ${y + 7} L${x - 7} ${y} Z`} />;
  if (v.quantity === "LOC") return <circle className={cls} cx={x} cy={y} r={6} />;
  return <rect className={cls} x={x - 6} y={y - 6} width={12} height={12} rx={1.5} />;
}

function LimitsChart({ groups }: { groups: LimitGroup[] }) {
  const W = 680;
  // One line per value kind inside each group: measured, cited (own line, so a divergence never hides under a mark), predicted.
  const LINE = 18;
  const lines = (g: LimitGroup) => (g.values.some((v) => v.kind === "measured-as-cited") ? 3 : 2);
  const groupH = (g: LimitGroup) => 10 + lines(g) * LINE;
  const tops = groups.reduce<number[]>((acc, _group, i) => [...acc, i === 0 ? 0 : acc[i - 1] + groupH(groups[i - 1])], []);
  const M = { left: 200, right: 24, top: 18, bottom: 40 };
  const H = M.top + groups.reduce((sum, g) => sum + groupH(g), 0) + M.bottom;
  const lo = 8;
  const hi = 33;
  const x = (o: number) => M.left + ((o - lo) / (hi - lo)) * (W - M.left - M.right);
  return (
    <div className="fl-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="LOC and MLOC by material, gas and publication; measured and predicted kept apart">
        {[10, 15, 20, 25, 30].map((t) => (
          <g key={t}>
            <line className="fl-grid" x1={x(t)} x2={x(t)} y1={M.top - 6} y2={H - M.bottom} />
            <text className="fl-tick" x={x(t)} y={H - M.bottom + 14} textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        <text className="fl-axis-label" x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle">
          O₂ (% by volume)
        </text>
        {groups.map((g, index) => {
          const y0 = M.top + tops[index];
          const measured = g.values.filter((v) => v.kind === "measured");
          const cited = g.values.filter((v) => v.kind === "measured-as-cited");
          const predicted = g.values.filter((v) => v.kind === "predicted");
          const lineY = (n: number) => y0 + 12 + n * LINE;
          return (
            <g key={`${g.source}-${g.material}-${g.balanceGas}`}>
              {index > 0 && groups[index - 1].source !== g.source && <line className="fl-sep" x1={8} x2={W - 8} y1={y0 - 2} y2={y0 - 2} />}
              <text className="fl-row-label" x={M.left - 10} y={y0 + 16} textAnchor="end">
                {g.material} · {g.gasLabel}
              </text>
              <text className="fl-row-sub" x={M.left - 10} y={y0 + 30} textAnchor="end">
                {g.reference}
              </text>
              {[
                ...measured.map((v) => ({ v, y: lineY(0) })),
                ...cited.map((v) => ({ v, y: lineY(1) })),
                ...predicted.map((v) => ({ v, y: lineY(cited.length ? 2 : 1) })),
              ].map(({ v, y }) => (
                <g key={v.id}>
                  <title>{`${g.material} · ${g.gasLabel} · ${g.reference}: ${v.quantity} ${valueKindLabel(v)} = ${String(v.raw)} (${gravityLabel(v)})${v.note ? ` — ${v.note}` : ""}`}</title>
                  <Mark v={v} x={x(v.value!)} y={y} />
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="fl-legend">
        <li>
          <svg width="16" height="16" aria-hidden="true">
            <circle className="fl-mark fl-q-loc" cx="8" cy="8" r="5.5" />
          </svg>
          Measured LOC (1g)
        </li>
        <li>
          <svg width="16" height="16" aria-hidden="true">
            <rect className="fl-mark fl-q-mloc" x="2.5" y="2.5" width="11" height="11" rx="1.5" />
          </svg>
          Measured MLOC (µg, parabolic flight)
        </li>
        <li>
          <svg width="18" height="18" aria-hidden="true">
            <path className="fl-mark fl-q-mloc fl-hollow" d="M9 2 L16 9 L9 16 L2 9 Z" />
          </svg>
          Measured MLOC cited in the text (other source)
        </li>
        <li>
          <svg width="16" height="16" aria-hidden="true">
            <circle className="fl-mark fl-q-loc fl-hollow fl-dashed" cx="8" cy="8" r="5.5" />
          </svg>
          Predicted LOC (authors' model)
        </li>
        <li>
          <svg width="16" height="16" aria-hidden="true">
            <rect className="fl-mark fl-q-mloc fl-hollow fl-dashed" x="2.5" y="2.5" width="11" height="11" rx="1.5" />
          </svg>
          Predicted MLOC (authors' model)
        </li>
      </ul>
    </div>
  );
}

const CAMPAIGN_LABEL: Record<string, string> = { "ground-1g-japan": "1g ground (Japan)", "parabolic-flight": "Parabolic flight · µg" };

/** Selection over existing published values only: it hides or shows values, never fills a gap. */
function useLimitFilter(groups: LimitGroup[]) {
  const [material, setMaterial] = useState("all");
  const [gas, setGas] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const options = {
    material: Array.from(new Set(groups.map((g) => g.material))),
    gas: Array.from(new Set(groups.map((g) => g.gasLabel))),
    campaign: Array.from(new Set(groups.flatMap((g) => g.values.map((v) => v.campaign)))),
  };
  const filtered = groups
    .filter((g) => (material === "all" || g.material === material) && (gas === "all" || g.gasLabel === gas))
    .map((g) => ({ ...g, values: g.values.filter((v) => campaign === "all" || v.campaign === campaign) }))
    .filter((g) => g.values.length > 0);
  const chips = (label: string, values: string[], current: string, set: (v: string) => void, name: (v: string) => string = (v) => v) => (
    <div className="fl-filter" role="group" aria-label={label}>
      <span>{label}</span>
      {["all", ...values].map((v) => (
        <button key={v} className={`chip ${current === v ? "active" : ""}`} aria-pressed={current === v} onClick={() => set(v)}>
          {v === "all" ? "All" : name(v)}
        </button>
      ))}
    </div>
  );
  const controls = (
    <div className="fl-filters">
      {chips("Material", options.material, material, setMaterial)}
      {chips("Gas", options.gas, gas, setGas)}
      {chips("Campaign", options.campaign, campaign, setCampaign, (v) => CAMPAIGN_LABEL[v] ?? v)}
    </div>
  );
  return { filtered, controls };
}

function Limits({ data }: { data: FlareEvidence }) {
  const { filtered, controls } = useLimitFilter(data.limits);
  return (
    <Section id="limits" letter="B" title="Quantitative comparison of LOC and MLOC (2016 and 2018)">
      <p className="fl-note fl-emph">
        Values from the published Table 2 of each paper, as printed. Measured (filled, top line), cited from another source (diamond,
        own line) and predicted (hollow dashed, bottom line) are never mixed. Each publication has its own rows; nothing is combined
        between them.
      </p>
      {controls}
      {filtered.length ? (
        <LimitsChart groups={filtered} />
      ) : (
        <p className="fl-note fl-emph" role="status">
          No published value matches this selection. Nothing is drawn for combinations the tables do not contain.
        </p>
      )}
      <div className="table-scroll fl-table-scroll">
        <table className="fl-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Ambient gas</th>
              <th>Reference</th>
              <th>Quantity</th>
              <th>Value (printed)</th>
              <th>Kind</th>
              <th>Campaign · gravity</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {filtered.flatMap((g) =>
              g.values.map((v, i) => (
                <tr key={v.id} className={i === 0 ? "fl-row-start" : ""}>
                  <td>{i === 0 ? `${g.material}${g.thickness_mm ? ` ${fmt(g.thickness_mm, 3)} mm` : ""}` : ""}</td>
                  <td>{i === 0 ? g.gasLabel : ""}</td>
                  <td>{i === 0 ? g.reference : ""}</td>
                  <td className="mono">{v.quantity}</td>
                  <td className="mono">{printed(v)}</td>
                  <td>
                    <KindTag kind={isCalibration(v) && v.kind === "predicted" ? "calibration" : v.kind} label={valueKindLabel(v)} />
                  </td>
                  <td className="fl-small">{gravityLabel(v)}</td>
                  <td className="fl-small">
                    {v.table}
                    {v.note && <small>{v.note}</small>}
                  </td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <div className="fl-divergence" role="note">
        <h4>Divergences between publications (kept, neither averaged nor chosen)</h4>
        <ul>
          <li>
            PMMA MLOC in microgravity: <strong>{fmt(data.divergences.mloc.tsuboi2016_table)} %</strong> (Table 2 of 2016; also the 2018
            text) versus <strong>{fmt(data.divergences.mloc.takahashi2018_table)} %</strong> (Table 2 of 2018).
          </li>
          <li>
            PMMA Vcr at the MLOC: <strong>{fmt(data.divergences.vcr.tsuboi2016_table_measured, 0)} cm/s</strong> (Table 2 of 2016) versus{" "}
            <strong>{fmt(data.divergences.vcr.takahashi2018_text_citing_ref17, 0)} cm/s</strong> (2018 text, citing Ref. 17).
          </li>
        </ul>
      </div>
      <div className="table-scroll fl-table-scroll">
        <table className="fl-table fl-compact">
          <thead>
            <tr>
              <th>Authors' model error (predicted − measured MLOC)</th>
              <th>Material · gas</th>
              <th>Measured</th>
              <th>Predicted</th>
              <th>Difference (p.p.)</th>
            </tr>
          </thead>
          <tbody>
            {data.modelErrors.rows.map((r) => (
              <tr key={`${r.source}-${r.material}-${r.balanceGas}`}>
                <td className="fl-small">{data.references.find((ref) => ref.id === r.source)?.short}</td>
                <td>
                  {r.material} · {r.balanceGas === "N2 (air-like)" ? "air (N₂)" : r.balanceGas.replace("N2", "N₂").replace("CO2", "CO₂")}
                </td>
                <td className="mono">{fmt(r.MLOC_measured)} %</td>
                <td className="mono">{fmt(r.MLOC_predicted)} %</td>
                <td className="mono">{signed(r.error_pp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fl-note">{data.modelErrors.note} These errors describe the published model; they are not a validation performed here.</p>
    </Section>
  );
}

/* ------------------------------------------------------------------ C. ΔO2, Vcr and MLOC/LOC */
function RatioBars({ points }: { points: RatioPoint[] }) {
  const W = 560;
  const rowH = 30;
  const M = { left: 210, right: 60, top: 6, bottom: 26 };
  const H = M.top + rowH * points.length + M.bottom;
  const x = (r: number) => M.left + r * (W - M.left - M.right);
  return (
    <div className="fl-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Descriptive MLOC/LOC ratio for the five pairs">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line className={t === 1 ? "fl-ref" : "fl-grid"} x1={x(t)} x2={x(t)} y1={M.top} y2={H - M.bottom} />
            <text className="fl-tick" x={x(t)} y={H - M.bottom + 14} textAnchor="middle">
              {fmt(t, 2)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const y = M.top + i * rowH;
          return (
            <g key={`${p.reference}-${p.material}-${p.balanceGas}`}>
              <title>{`${p.material} · ${p.gasLabel} (${p.reference}): MLOC ${fmt(p.MLOC_pct)} % / LOC ${fmt(p.LOC1g_pct)} % = ${fmt(p.MLOC_over_LOC, 3)} (descriptive)`}</title>
              <text className="fl-row-label" x={M.left - 8} y={y + rowH / 2 + 4} textAnchor="end">
                {p.material} · {p.gasLabel} · {p.reference.replace("Takahashi & Maruta", "T&M").replace("Tsuboi et al.", "Tsuboi")}
              </text>
              <rect className="fl-bar" x={M.left} y={y + 8} width={x(p.MLOC_over_LOC) - M.left} height={rowH - 16} rx={3} />
              <text className="fl-bar-label" x={x(p.MLOC_over_LOC) + 6} y={y + rowH / 2 + 4}>
                {fmt(p.MLOC_over_LOC, 3)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Differences({ data }: { data: FlareEvidence }) {
  const bySource = (source: string) => data.deltaO2.filter((d) => d.source === source);
  const sources = Array.from(new Set(data.deltaO2.map((d) => d.source)));
  return (
    <Section id="delta" letter="C" title="O₂ differences and critical velocity">
      <p className="fl-note fl-emph">{data.divergences.signConvention}.</p>
      <div className="fl-two">
        {sources.map((source) => {
          const rows = bySource(source);
          return (
            <div key={source} className="fl-panel">
              <h4>
                {rows[0].reference} · convention <span className="mono">ΔO₂ = {rows[0].convention}</span>
              </h4>
              <div className="table-scroll fl-table-scroll">
                <table className="fl-table fl-compact">
                  <thead>
                    <tr>
                      <th>Material · gas</th>
                      <th>Kind</th>
                      <th>Printed</th>
                      <th>Reproduced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={`${d.material}-${d.gasLabel}-${d.kind}`}>
                        <td>
                          {d.material} · {d.gasLabel}
                        </td>
                        <td>
                          <KindTag kind={d.kind} />
                        </td>
                        <td className="mono">{signed(d.printed_pp)} p.p.</td>
                        <td className="mono">
                          {signed(d.computed_pp)} {d.reproduced ? "✓" : "≠"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
      <p className="fl-note">
        Reproduced = computed here from the LOC and MLOC printed in the same table ({data.deltaO2AllReproduced ? "all match" : "some differ"}). Signs
        follow each publication's convention and were not unified.
      </p>
      <div className="fl-panel">
        <h4>Critical opposed-flow velocity (Vcr), as printed</h4>
        <div className="table-scroll fl-table-scroll">
          <table className="fl-table fl-compact">
            <thead>
              <tr>
                <th>Gas</th>
                <th>Kind</th>
                <th>Vcr (printed)</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {data.vcr.map((v) => (
                <tr key={v.id}>
                  <td>{v.gasLabel}</td>
                  <td>
                    <KindTag kind={v.kind} />
                  </td>
                  <td className="mono">
                    {String(v.raw)}
                    {v.parse === "range-as-printed" && <small>textual range: not converted to a number</small>}
                  </td>
                  <td className="fl-small">
                    {data.references.find((ref) => ref.id === v.source)?.short} · {v.table}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="fl-panel">
        <h4>MLOC/LOC ratio (descriptive) for the five measured pairs</h4>
        <RatioBars points={data.ratios} />
        <p className="fl-note">{data.ratioNote}</p>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ ISS context, complementarity, references */
function Context({ data }: { data: FlareEvidence }) {
  return (
    <Section id="context" letter="·" title="ISS/Kibo, relation to the other modules and references">
      <div className="fl-panel">
        <h4>
          ISS/Kibo <KindTag kind="published_summary" />
        </h4>
        <p className="fl-note fl-emph">{data.iss.note}</p>
        <ul className="fl-list">
          {data.iss.records.map((r) => (
            <li key={r.id}>
              {r.material} · {r.quantity}: {String(r.raw)}
              {r.note ? ` (${r.note})` : ""}
            </li>
          ))}
        </ul>
        <ul className="fl-list fl-pubs">
          {data.iss.publications.map((p) => (
            <li key={p.id}>
              <a className="text-link" href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer">
                {p.title} <ArrowUpRight size={11} />
              </a>{" "}
              <small>
                {p.venue} · {p.license} · full text {p.fullTextRetrieved ? "obtained" : "not obtained"}
              </small>
            </li>
          ))}
        </ul>
      </div>
      <div className="fl-panel">
        <h4>Complementarity in HabitatFire</h4>
        <ul className="fl-list">
          {data.complementarity.map((c) => (
            <li key={c.module}>
              <strong>{c.module}</strong>: {c.role}
            </li>
          ))}
        </ul>
        <p className="fl-note">
          {data.complementarityNote} FLARE does not predict the outcome of a user scenario.
        </p>
      </div>
      <ul className="fl-list fl-refs">
        {data.references.map((r) => (
          <li key={r.id}>
            <a className="text-link" href={`https://doi.org/${r.doi}`} target="_blank" rel="noreferrer">
              {r.citation} <ArrowUpRight size={11} />
            </a>
          </li>
        ))}
        {data.program.officialPages.map((url) => (
          <li key={url}>
            <a className="text-link" href={url} target="_blank" rel="noreferrer">
              {url.includes("jaxa") ? "JAXA FLARE page" : url.includes("science.nasa") ? "NASA Science — FLARE" : "NASA Glenn — FLARE"} <ArrowUpRight size={11} />
            </a>
          </li>
        ))}
      </ul>
    </Section>
  );
}
