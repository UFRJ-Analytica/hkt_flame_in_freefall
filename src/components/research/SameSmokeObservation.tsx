import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, TriangleAlert, X } from "lucide-react";
import { useModalFocus } from "../../hooks/useModalFocus";
import { SAME_DATA_PATH } from "./sameSmoke";
import "./same-smoke.css";

/* ------------------------------------------------------------------ data contract (smoke-analysis.json) */
type Kind = "published" | "measured" | "derived" | "model_assumption" | "unavailable";
interface Val<T = number> {
  kind: Kind;
  value: T | null;
  unit?: string;
  source?: string;
  note?: string;
  reason?: string;
  [extra: string]: unknown;
}
interface Stat {
  n: number;
  mean: number;
  sd: number | null;
  min: number;
  max: number;
}
type MaterialId = "lampwick" | "kapton" | "silicone" | "teflon" | "dbp";
interface Material {
  id: MaterialId;
  name: string;
  description: string;
  inTable1: boolean;
  flightTests: Val;
  initialHeatings: Val;
  processedTests: number[];
  heaterRtOverR0: Val<Stat>;
  heatingDuration: Val<Stat>;
  lfeFlowDuringHeating: Val<Stat>;
}
interface Table1Row {
  material: MaterialId;
  aged: boolean;
  agingLabel: string;
  Dg: Val;
  D05: Val;
  D15: Val;
  sigmaG: Val;
  DgRecomputed: Val;
  sigmaGRecomputed: Val;
  massMedian: Val;
  massFractionAbove1um: Val;
  numberFractionAbove300nm: Val;
  numberPerUnitVolumeRelative: Val;
  perTestDistribution: Val<null>;
}
interface AgingMaterial {
  material: MaterialId;
  publishedPoints: string[];
  ratios: null | { Dg: Val; D05: Val; D15: Val; sigmaGChange: Val; numberRatioIfVolumeConserved: Val };
  longAgingTests: {
    test: number;
    agePrimary_s: Val;
    ageSecondary_s: Val;
    dusttrakBSecondaryOverPrimary: Val;
    BoverAPrimary: Val;
    BoverASecondary: Val;
  }[];
  measuredNumberChange: Val<null>;
}
interface RatioMaterial {
  material: MaterialId;
  perTest: { test: number; value: Val }[];
  mean?: Val<Stat>;
  published?: Val;
  relativeDifference?: Val;
  nasaAveragingSheets?: Val<number[]>;
  massFractionAbove1umFromDustTraks?: Val<Stat>;
  lognormalExpectation?: Val;
  note?: string;
}
interface Instrument {
  id: string;
  name: string;
  principle: string;
  moment: string;
  unit: string;
  range: string;
  calibration: Val<null>;
  limitations: string[];
}
interface DetectorResponse {
  test: number;
  material: MaterialId;
  dusttrakB: Val;
  dusttrakA: Val;
  ionBDelta: Val;
  issScatterDelta: Val & { clipped?: boolean };
  issObscurationDelta: Val;
  stsDelta: Val & { powered?: boolean };
  ageAtPlateauStart_s: Val;
}
interface SmokeAnalysis {
  schemaVersion: 1;
  statement: string;
  kinds: Record<Kind, string>;
  investigation: {
    id: string;
    acronym: string;
    title: string;
    doi: string;
    portal: string;
    platform: string;
    flight: string;
    principalInvestigator: string;
    objective: string;
    agingRange: Val<[number, number]>;
    flightTests: Val;
  };
  notices: { id: string; text: string }[];
  materials: Material[];
  coverage: {
    total: number;
    groups: { status: string; label: string; count: number; tests: number[] }[];
    perTest: { test: number; material: MaterialId; heating: string; gmtDay: number; status: string }[];
    note: string;
  };
  table1: {
    source: string;
    aggregation: string;
    rowsMeaning: string;
    rows: Table1Row[];
    reproduction: { maxAbs_dDg_nm: number; maxAbs_dSigma_g: number; statement: string };
  };
  earlierPublishedVersions: {
    source: string;
    quantity: string;
    entries: { material: MaterialId; value: Val<number | (number | null)[]>; consistentWithEq7?: Val<boolean> }[];
  }[];
  aging: { publishedAgingTimes_s: number[]; note: string; shortSecondaryWindowsNote: string; materials: AgingMaterial[] };
  dusttrakRatio: { window: string; materials: RatioMaterial[]; caveat: string };
  detectors: {
    window: string;
    instruments: Instrument[];
    responses: DetectorResponse[];
    note: string;
  };
  momentMethod: {
    source: string;
    definitions: { symbol: string; meaning: string }[];
    hypothesis: Val<string>;
    verification: Val<{ Dg_um: number; sigmaG: number; D05_um: number; D15_um: number }>;
    calculated: string[];
    measured: string[];
    notReconstructible: string[];
    missing: string[];
    notice: string;
  };
  unavailable: { quantity: string; reason: string }[];
  sources: { label: string; url?: string; path?: string }[];
}

function isSmokeAnalysis(value: unknown): value is SmokeAnalysis {
  const data = value as SmokeAnalysis;
  return (
    !!data &&
    data.schemaVersion === 1 &&
    data.investigation?.id === "PSI-102" &&
    Array.isArray(data.materials) &&
    data.materials.length === 5 &&
    Array.isArray(data.table1?.rows) &&
    data.table1.rows.length === 8 &&
    data.table1.rows.every((row) => row.perTestDistribution?.kind === "unavailable" && row.perTestDistribution.value === null) &&
    Array.isArray(data.notices) &&
    data.notices.length >= 7 &&
    typeof data.momentMethod?.notice === "string" &&
    Array.isArray(data.detectors?.responses)
  );
}

/* ------------------------------------------------------------------ helpers */
const ORDER: MaterialId[] = ["kapton", "lampwick", "silicone", "teflon", "dbp"];
const SOLIDS: MaterialId[] = ["kapton", "lampwick", "silicone", "teflon"];
const SHORT: Record<MaterialId, string> = {
  kapton: "Kapton",
  lampwick: "Lamp wick",
  silicone: "Silicone",
  teflon: "Teflon",
  dbp: "DBP",
};
const KIND_LABEL: Record<Kind, string> = {
  published: "publicado",
  measured: "medido",
  derived: "derivado",
  model_assumption: "hipótese de modelo",
  unavailable: "indisponível",
};
const fmt = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct = (value: number | null | undefined, digits = 0) => (value == null ? "—" : `${fmt(value * 100, digits)} %`);
const signed = (value: number | null | undefined, digits = 2) =>
  value == null ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmt(Math.abs(value), digits)}`;
const matClass = (id: MaterialId) => `ss-m-${id}`;

function KindTag({ kind }: { kind: Kind }) {
  return <span className={`ss-kind ss-kind-${kind}`}>{KIND_LABEL[kind]}</span>;
}

function Section({ id, letter, title, kinds, children }: { id: string; letter: string; title: string; kinds?: Kind[]; children: ReactNode }) {
  return (
    <section className="ss-section" aria-labelledby={`ss-${id}`}>
      <div className="ss-section-heading">
        <h3 id={`ss-${id}`}>
          <span className="ss-letter">{letter}</span>
          {title}
        </h3>
        {kinds && (
          <span className="ss-kinds">
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

/* ------------------------------------------------------------------ module */
export default function SameSmokeObservation({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<SmokeAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  useModalFocus(true, onClose);
  useEffect(() => {
    let alive = true;
    fetch(`${import.meta.env.BASE_URL}${SAME_DATA_PATH}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((value: unknown) => {
        if (!alive) return;
        if (isSmokeAnalysis(value)) setData(value);
        else setError("O arquivo smoke-analysis.json não tem o formato esperado.");
      })
      .catch((reason: unknown) => alive && setError(`Não foi possível carregar a análise SAME (${String(reason)}).`));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal ss-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ss-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">NASA SAME · PSI-102 · SMOKE &amp; DETECTION</span>
            <h2 id="ss-title">Fumaça e detecção em microgravidade</h2>
          </div>
          <button className="icon-button" aria-label="Fechar análise SAME" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {/* Permanent notice: stays at the top of the scrolling dialog. */}
        <div className="ss-sticky" role="note">
          <TriangleAlert size={14} />
          <span>
            {data?.momentMethod.notice ??
              "Os momentos M0, M1 e M3 por teste não estão disponíveis devido à ausência das calibrações e razões de diluição necessárias."}
          </span>
        </div>
        {error && <div className="data-notice">{error}</div>}
        {!data && !error && <p className="ss-loading">Carregando a evidência SAME…</p>}
        {data && <Body data={data} />}
      </section>
    </div>
  );
}

function Body({ data }: { data: SmokeAnalysis }) {
  return (
    <div className="ss-body">
      <Notices data={data} />
      <KindLegend data={data} />
      <Identification data={data} />
      <Materials data={data} />
      <Distribution data={data} />
      <Aging data={data} />
      <Detection data={data} />
      <MomentMethod data={data} />
      <Unavailable data={data} />
    </div>
  );
}

function Notices({ data }: { data: SmokeAnalysis }) {
  return (
    <div className="ss-notices">
      <h3>
        <TriangleAlert size={15} /> Avisos científicos
      </h3>
      <p className="ss-statement">{data.statement}</p>
      <ol>
        {data.notices.map((notice) => (
          <li key={notice.id}>{notice.text}</li>
        ))}
      </ol>
    </div>
  );
}

function KindLegend({ data }: { data: SmokeAnalysis }) {
  return (
    <dl className="ss-kind-legend" aria-label="Tipos de valor">
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
function Identification({ data }: { data: SmokeAnalysis }) {
  const inv = data.investigation;
  return (
    <Section id="id" letter="A" title="Identificação" kinds={["published"]}>
      <dl className="ss-facts">
        <div>
          <dt>Investigação</dt>
          <dd>
            NASA {inv.acronym} · {inv.title}
          </dd>
        </div>
        <div>
          <dt>PSI</dt>
          <dd>
            {inv.id} · DOI {inv.doi}
          </dd>
        </div>
        <div>
          <dt>Plataforma</dt>
          <dd>{inv.platform}</dd>
        </div>
        <div>
          <dt>Voo</dt>
          <dd>{inv.flight}</dd>
        </div>
        <div>
          <dt>Equipe</dt>
          <dd>{inv.principalInvestigator}</dd>
        </div>
        <div>
          <dt>Pontos de teste</dt>
          <dd>
            {inv.flightTests.value} (Apêndice A) · envelhecimento de {inv.agingRange.value?.[0]} a {inv.agingRange.value?.[1]} s
          </dd>
        </div>
      </dl>
      <p className="ss-objective">
        <strong>Objetivo.</strong> {inv.objective}
      </p>
      <a className="text-link" href={inv.portal} target="_blank" rel="noreferrer">
        Investigação na NASA PSI <ArrowUpRight size={13} />
      </a>
    </Section>
  );
}

/* ------------------------------------------------------------------ B. materials + coverage */
function statRange(stat: Stat | null, digits = 2) {
  if (!stat) return "—";
  return stat.n > 1 && stat.max !== stat.min
    ? `${fmt(stat.mean, digits)} (${fmt(stat.min, digits)}–${fmt(stat.max, digits)})`
    : fmt(stat.mean, digits);
}

function Materials({ data }: { data: SmokeAnalysis }) {
  const materials = ORDER.map((id) => data.materials.find((m) => m.id === id)!).filter(Boolean);
  return (
    <Section id="materials" letter="B" title="Materiais e condições de aquecimento" kinds={["published", "measured"]}>
      <div className="table-scroll ss-table-scroll">
        <table className="ss-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>
                Testes de voo <KindTag kind="published" />
              </th>
              <th>Testes processados</th>
              <th>
                Rt/R0 do fio <KindTag kind="measured" />
              </th>
              <th>
                Aquecimento (s) <KindTag kind="measured" />
              </th>
              <th>
                Vazão LFE (sccm) <KindTag kind="measured" />
              </th>
              <th>Tabela 1</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => (
              <tr key={m.id}>
                <td>
                  <span className={`ss-swatch ${matClass(m.id)}`} aria-hidden="true" />
                  <strong>{m.name}</strong>
                  <small>{m.description}</small>
                </td>
                <td className="mono">
                  {m.flightTests.value} ({m.initialHeatings.value} amostras)
                </td>
                <td className="mono">{m.processedTests.length ? m.processedTests.join(", ") : "—"}</td>
                <td className="mono">{statRange(m.heaterRtOverR0.value, 3)}</td>
                <td className="mono">{statRange(m.heatingDuration.value, 0)}</td>
                <td className="mono">{statRange(m.lfeFlowDuringHeating.value, 1)}</td>
                <td>{m.inTable1 ? "sim" : "não (referência)"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ss-note">
        Rt/R0 é a razão de resistência do fio aquecedor (grandeza de controle); a temperatura e a velocidade do ar em cm/s não
        estão disponíveis. Cada material foi aquecido no seu próprio set-point: diferenças entre materiais misturam química e
        condição de aquecimento. O DBP foi reaquecido várias vezes (22 dos 47 pontos).
      </p>
      <Coverage data={data} />
    </Section>
  );
}

const STATUS_CLASS: Record<string, string> = {
  "processed-state-windows": "ss-st-processed",
  "nasa-averaging-window-only": "ss-st-nasa",
  "downloaded-not-segmented": "ss-st-notseg",
  "not-downloaded": "ss-st-missing",
};

function Coverage({ data }: { data: SmokeAnalysis }) {
  const label = Object.fromEntries(data.coverage.groups.map((g) => [g.status, g.label]));
  return (
    <div className="ss-coverage">
      <h4>
        Cobertura dos {data.coverage.total} testes do Apêndice A <KindTag kind="measured" />
      </h4>
      <ol className="ss-cells" aria-label="Situação de cada teste">
        {data.coverage.perTest.map((t) => (
          <li
            key={t.test}
            className={STATUS_CLASS[t.status]}
            title={`Teste ${t.test} · ${SHORT[t.material]} (${t.heating}) · GMT ${t.gmtDay} · ${label[t.status]}`}
          >
            <span>{t.test}</span>
            <i className={`ss-cell-mat ${matClass(t.material)}`} aria-hidden="true" />
          </li>
        ))}
      </ol>
      <ul className="ss-cell-legend">
        {data.coverage.groups.map((g) => (
          <li key={g.status}>
            <span className={`ss-cell-key ${STATUS_CLASS[g.status]}`} aria-hidden="true" />
            <strong>{g.count}</strong> {g.label}
          </li>
        ))}
      </ul>
      <p className="ss-note">
        A faixa colorida sob cada número indica o material. {data.coverage.note}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ C. distribution (Table 1) */
const LOG_MIN = 50;
const LOG_MAX = 1300;

function DiameterChart({ rows }: { rows: Table1Row[] }) {
  const W = 640;
  const rowH = 46;
  const M = { left: 92, right: 18, top: 16, bottom: 34 };
  const H = M.top + rowH * SOLIDS.length + M.bottom;
  const x = (d: number) => M.left + ((Math.log(d) - Math.log(LOG_MIN)) / (Math.log(LOG_MAX) - Math.log(LOG_MIN))) * (W - M.left - M.right);
  const ticks = [50, 100, 200, 500, 1000];
  return (
    <div className="ss-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dg, D0,5 e D1,5 publicados por material, sem envelhecimento e com 720 s">
        {ticks.map((t) => (
          <g key={t}>
            <line className="ss-grid" x1={x(t)} x2={x(t)} y1={M.top - 6} y2={H - M.bottom} />
            <text className="ss-tick" x={x(t)} y={H - M.bottom + 14} textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        <text className="ss-axis-label" x={(M.left + W - M.right) / 2} y={H - 4} textAnchor="middle">
          diâmetro (nm, escala log) — Tabela 1, agregado por material
        </text>
        {SOLIDS.map((id, index) => {
          const y0 = M.top + index * rowH;
          return (
            <g key={id} className={matClass(id)}>
              <text className="ss-row-label" x={M.left - 10} y={y0 + rowH / 2 + 4} textAnchor="end">
                {SHORT[id]}
              </text>
              {[false, true].map((aged) => {
                const row = rows.find((r) => r.material === id && r.aged === aged)!;
                const y = y0 + (aged ? rowH * 0.68 : rowH * 0.32);
                const tip = `${SHORT[id]} · ${row.agingLabel}: Dg ${row.Dg.value} nm, D0,5 ${row.D05.value} nm, D1,5 ${row.D15.value} nm, σg ${fmt(row.sigmaG.value)} (publicado)`;
                return (
                  <g key={String(aged)}>
                    <title>{tip}</title>
                    <line className="ss-range" x1={x(row.D05.value!)} x2={x(row.D15.value!)} y1={y} y2={y} />
                    <line className="ss-tickmark" x1={x(row.D05.value!)} x2={x(row.D05.value!)} y1={y - 5} y2={y + 5} />
                    <line className="ss-tickmark" x1={x(row.D15.value!)} x2={x(row.D15.value!)} y1={y - 5} y2={y + 5} />
                    {aged ? (
                      <rect className="ss-mark" x={x(row.Dg.value!) - 5} y={y - 5} width={10} height={10} rx={1.5} />
                    ) : (
                      <circle className="ss-mark" cx={x(row.Dg.value!)} cy={y} r={5.5} />
                    )}
                    <text className="ss-mark-label" x={x(row.D15.value!) + 8} y={y + 3.5}>
                      {aged ? "720 s" : "sem env."} · σg {fmt(row.sigmaG.value)}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <p className="ss-chart-key">
        ● Dg sem envelhecimento · ■ Dg após 720 s · traço de D0,5 (média aritmética) a D1,5 (diâmetro de massa média)
      </p>
    </div>
  );
}

function Distribution({ data }: { data: SmokeAnalysis }) {
  const rows = data.table1.rows;
  return (
    <Section id="dist" letter="C" title="Distribuição de partículas (Tabela 1, agregada por material)" kinds={["published", "derived", "model_assumption"]}>
      <p className="ss-note ss-emph">
        Valores por material ({data.table1.rowsMeaning}), publicados no {data.table1.source}. Não são resultados individuais dos 47
        testes e não existe distribuição reconstruída por teste.
      </p>
      <DiameterChart rows={rows} />
      <div className="table-scroll ss-table-scroll">
        <table className="ss-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>Estado</th>
              <th>
                Dg (nm) <KindTag kind="published" />
              </th>
              <th>
                Dg recalc. <KindTag kind="derived" />
              </th>
              <th>
                σg <KindTag kind="published" />
              </th>
              <th>
                σg recalc. <KindTag kind="derived" />
              </th>
              <th>
                D0,5 / D1,5 (nm) <KindTag kind="published" />
              </th>
              <th>
                Mediana de massa <KindTag kind="model_assumption" />
              </th>
              <th>
                Massa &gt; 1 µm <KindTag kind="model_assumption" />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.material}-${row.aged}`}>
                <td>
                  <span className={`ss-swatch ${matClass(row.material)}`} aria-hidden="true" />
                  {SHORT[row.material]}
                </td>
                <td>{row.agingLabel}</td>
                <td className="mono">{row.Dg.value}</td>
                <td className="mono">{fmt(row.DgRecomputed.value, 1)}</td>
                <td className="mono">{fmt(row.sigmaG.value)}</td>
                <td className="mono">{fmt(row.sigmaGRecomputed.value, 3)}</td>
                <td className="mono">
                  {row.D05.value} / {row.D15.value}
                </td>
                <td className="mono">{fmt(row.massMedian.value, 0)} nm</td>
                <td className="mono">{pct(row.massFractionAbove1um.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ss-note">
        Reprodução: |ΔDg| ≤ {fmt(data.table1.reproduction.maxAbs_dDg_nm, 1)} nm e |Δσg| ≤ {fmt(data.table1.reproduction.maxAbs_dSigma_g, 3)}.{" "}
        {data.table1.reproduction.statement} A mediana de massa e a fração de massa acima de 1 µm supõem a lognormal unimodal.
      </p>
      <Earlier data={data} />
    </Section>
  );
}

function Earlier({ data }: { data: SmokeAnalysis }) {
  const show = (v: number | (number | null)[] | null) =>
    v == null ? "—" : Array.isArray(v) ? v.map((x) => (x == null ? "N/A" : fmt(x, x < 2 ? 3 : 0))).join(" / ") : fmt(v, 0);
  return (
    <div className="ss-subpanel">
      <h4>
        Versões publicadas anteriores (mesmos voos, reduções diferentes) <KindTag kind="published" />
      </h4>
      <div className="table-scroll ss-table-scroll">
        <table className="ss-table">
          <thead>
            <tr>
              <th>Publicação</th>
              <th>Grandeza</th>
              {SOLIDS.map((id) => (
                <th key={id}>{SHORT[id]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.earlierPublishedVersions.map((version) => (
              <tr key={version.source}>
                <td>{version.source}</td>
                <td className="ss-small">{version.quantity}</td>
                {SOLIDS.map((id) => {
                  const entry = version.entries.find((e) => e.material === id);
                  const check = entry?.consistentWithEq7;
                  return (
                    <td key={id} className="mono">
                      {entry ? show(entry.value.value) : "—"}
                      {check && <small className={check.value ? "ss-ok" : "ss-bad"}>{check.value ? "coerente com Eq. 7" : "incoerente com Eq. 7"}</small>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="ss-note">
        O D0,5 de um mesmo material variou até 30 % entre versões — a melhor estimativa disponível da incerteza sistemática.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ D. aging */
function AgingBars({ data }: { data: SmokeAnalysis }) {
  const rows = data.table1.rows;
  const W = 640;
  const H = 210;
  const M = { left: 44, right: 12, top: 18, bottom: 38 };
  const max = 400;
  const group = (W - M.left - M.right) / SOLIDS.length;
  const bw = 26;
  const y = (v: number) => M.top + (1 - v / max) * (H - M.top - M.bottom);
  return (
    <div className="ss-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dg publicado sem envelhecimento e após 720 s, por material">
        {[0, 100, 200, 300, 400].map((t) => (
          <g key={t}>
            <line className="ss-grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text className="ss-tick" x={M.left - 6} y={y(t) + 3} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <text className="ss-axis-label" x={12} y={M.top - 6}>
          Dg (nm)
        </text>
        {SOLIDS.map((id, index) => {
          const cx = M.left + group * (index + 0.5);
          return (
            <g key={id} className={matClass(id)}>
              {[false, true].map((aged) => {
                const row = rows.find((r) => r.material === id && r.aged === aged)!;
                const left = cx + (aged ? 3 : -bw - 3);
                return (
                  <g key={String(aged)}>
                    <title>{`${SHORT[id]} · ${row.agingLabel}: Dg ${row.Dg.value} nm (publicado)`}</title>
                    <rect className={aged ? "ss-bar ss-bar-aged" : "ss-bar"} x={left} y={y(row.Dg.value!)} width={bw} height={y(0) - y(row.Dg.value!)} rx={3} />
                    <text className="ss-bar-label" x={left + bw / 2} y={y(row.Dg.value!) - 4} textAnchor="middle">
                      {row.Dg.value}
                    </text>
                    <text className="ss-tick" x={left + bw / 2} y={y(0) + 12} textAnchor="middle">
                      {aged ? "720 s" : "0 s"}
                    </text>
                  </g>
                );
              })}
              <text className="ss-row-label" x={cx} y={H - 8} textAnchor="middle">
                {SHORT[id]}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="ss-chart-key">Barra cheia: sem envelhecimento · barra vazada: 720 s. Dois pontos publicados por material — sem curva de evolução.</p>
    </div>
  );
}

function MassConservation({ data }: { data: SmokeAnalysis }) {
  const points = data.aging.materials.flatMap((m) => m.longAgingTests.map((t) => ({ ...t, material: m.material })));
  const W = 640;
  const H = 150;
  const M = { left: 44, right: 16, top: 14, bottom: 34 };
  const lo = 0.6;
  const hi = 1.4;
  const x = (i: number) => M.left + ((i + 0.5) / points.length) * (W - M.left - M.right);
  const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * (H - M.top - M.bottom);
  return (
    <div className="ss-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="DustTrak B na janela secundária dividido pela primária, testes de envelhecimento longo">
        {[0.6, 0.8, 1, 1.2, 1.4].map((t) => (
          <g key={t}>
            <line className={t === 1 ? "ss-ref" : "ss-grid"} x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text className="ss-tick" x={M.left - 6} y={y(t) + 3} textAnchor="end">
              {fmt(t, 1)}
            </text>
          </g>
        ))}
        <text className="ss-region-label" x={W - M.right} y={y(1) - 5} textAnchor="end">
          1,0 = sinal de massa conservado
        </text>
        {points.map((p, i) => (
          <g key={p.test} className={matClass(p.material)}>
            <title>{`Teste ${p.test} · ${SHORT[p.material]}: DustTrak B secundário/primário ${fmt(p.dusttrakBSecondaryOverPrimary.value, 3)}; idade ${fmt(p.agePrimary_s.value, 0)} → ${fmt(p.ageSecondary_s.value, 0)} s (medido)`}</title>
            <circle className="ss-mark" cx={x(i)} cy={y(p.dusttrakBSecondaryOverPrimary.value!)} r={6} />
            <text className="ss-mark-label" x={x(i)} y={y(p.dusttrakBSecondaryOverPrimary.value!) - 10} textAnchor="middle">
              {fmt(p.dusttrakBSecondaryOverPrimary.value)}
            </text>
            <text className="ss-tick" x={x(i)} y={H - M.bottom + 14} textAnchor="middle">
              T{p.test}
            </text>
            <text className="ss-tick ss-faint" x={x(i)} y={H - M.bottom + 26} textAnchor="middle">
              {fmt(p.ageSecondary_s.value, 0)} s
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Aging({ data }: { data: SmokeAnalysis }) {
  return (
    <Section id="aging" letter="D" title="Envelhecimento da fumaça" kinds={["published", "derived", "measured", "model_assumption", "unavailable"]}>
      <p className="ss-note ss-emph">{data.aging.note}</p>
      <div className="ss-two">
        <div className="ss-panel">
          <h4>
            Tamanho: Dg publicado <KindTag kind="published" />
          </h4>
          <AgingBars data={data} />
        </div>
        <div className="ss-panel">
          <h4>
            Sinal de massa no envelhecimento longo <KindTag kind="measured" />
          </h4>
          <MassConservation data={data} />
          <p className="ss-note">
            DustTrak B (janela secundária ÷ primária) nos testes com 570–1 653 s entre as janelas; abaixo de cada teste, a idade da
            fumaça na janela secundária. {data.aging.shortSecondaryWindowsNote}
          </p>
        </div>
      </div>
      <div className="table-scroll ss-table-scroll">
        <table className="ss-table">
          <thead>
            <tr>
              <th>Material</th>
              <th>
                Dg 720 s ÷ 0 s <KindTag kind="derived" />
              </th>
              <th>
                D0,5 <KindTag kind="derived" />
              </th>
              <th>
                D1,5 <KindTag kind="derived" />
              </th>
              <th>
                Δσg <KindTag kind="derived" />
              </th>
              <th>
                Número se M3 conservado <KindTag kind="model_assumption" />
              </th>
              <th>
                B/A primária → secundária <KindTag kind="measured" />
              </th>
              <th>
                Variação medida do número <KindTag kind="unavailable" />
              </th>
            </tr>
          </thead>
          <tbody>
            {SOLIDS.map((id) => {
              const m = data.aging.materials.find((a) => a.material === id)!;
              return (
                <tr key={id}>
                  <td>
                    <span className={`ss-swatch ${matClass(id)}`} aria-hidden="true" />
                    {SHORT[id]}
                  </td>
                  <td className="mono">×{fmt(m.ratios?.Dg.value)}</td>
                  <td className="mono">×{fmt(m.ratios?.D05.value)}</td>
                  <td className="mono">×{fmt(m.ratios?.D15.value)}</td>
                  <td className="mono">{signed(m.ratios?.sigmaGChange.value)}</td>
                  <td className="mono">×{fmt(m.ratios?.numberRatioIfVolumeConserved.value)}</td>
                  <td className="mono">
                    {m.longAgingTests.map((t) => (
                      <span key={t.test} className="ss-block">
                        T{t.test}: {fmt(t.BoverAPrimary.value, 3)} → {fmt(t.BoverASecondary.value, 3)}
                      </span>
                    ))}
                  </td>
                  <td className="ss-small">{m.measuredNumberChange.reason}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="ss-note">
        Leitura: todos os diâmetros publicados crescem e σg diminui após 720 s, enquanto o sinal de massa medido se conserva (0,84–1,20):
        coerente com coagulação com poucas perdas nas paredes. A queda do número de partículas é uma consequência da hipótese (M3
        conservado), não uma medição.
      </p>
    </Section>
  );
}

/* ------------------------------------------------------------------ E. detection */
function RatioChart({ data }: { data: SmokeAnalysis }) {
  const W = 640;
  const H = 240;
  const M = { left: 44, right: 14, top: 26, bottom: 30 };
  const lo = 1;
  const hi = 2.6;
  const group = (W - M.left - M.right) / SOLIDS.length;
  const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * (H - M.top - M.bottom);
  return (
    <div className="ss-scroll">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Razão DustTrak B/A por teste, média publicada e expectativa lognormal">
        {[1, 1.4, 1.8, 2.2, 2.6].map((t) => (
          <g key={t}>
            <line className="ss-grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
            <text className="ss-tick" x={M.left - 6} y={y(t) + 3} textAnchor="end">
              {fmt(t, 1)}
            </text>
          </g>
        ))}
        <text className="ss-axis-label" x={12} y={12}>
          B/A
        </text>
        {SOLIDS.map((id, index) => {
          const m = data.dusttrakRatio.materials.find((r) => r.material === id)!;
          const cx = M.left + group * (index + 0.5);
          const half = group * 0.36;
          return (
            <g key={id} className={matClass(id)}>
              {m.lognormalExpectation?.value != null && (
                <g>
                  <title>{`${SHORT[id]}: 1/(1 − fração de massa > 1 µm) da lognormal da Tabela 1 = ${fmt(m.lognormalExpectation.value, 2)} (hipótese de modelo)`}</title>
                  <line className="ss-model-line" x1={cx - half} x2={cx + half} y1={y(Math.min(m.lognormalExpectation.value, hi))} y2={y(Math.min(m.lognormalExpectation.value, hi))} />
                </g>
              )}
              {m.published?.value != null && (
                <g>
                  <title>{`${SHORT[id]}: média publicada (08ICES-2089) = ${fmt(m.published.value)}`}</title>
                  <line className="ss-pub-line" x1={cx - half} x2={cx + half} y1={y(m.published.value)} y2={y(m.published.value)} />
                </g>
              )}
              {m.perTest.map((p, k) => {
                const px = cx + (k - (m.perTest.length - 1) / 2) * 13;
                return (
                  <g key={p.test}>
                    <title>{`Teste ${p.test} · ${SHORT[id]}: B/A = ${fmt(p.value.value, 3)} (medido, janela primária)`}</title>
                    <circle className="ss-mark" cx={px} cy={y(p.value.value!)} r={5.5} />
                  </g>
                );
              })}
              <text className="ss-row-label" x={cx} y={H - 8} textAnchor="middle">
                {SHORT[id]}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="ss-chart-key">
        ● teste de voo (medido) · ━ média publicada em 2008 · ┅ expectativa da lognormal da Tabela 1 (hipótese)
      </p>
    </div>
  );
}

function DetectorStrips({ data }: { data: SmokeAnalysis }) {
  const responses = data.detectors.responses;
  const panels: { key: "ionBDelta" | "issScatterDelta" | "stsDelta"; title: string; lo: number; hi: number }[] = [
    { key: "ionBDelta", title: "Câmara de ionização B · Δ (V)", lo: 0, hi: 2.6 },
    { key: "issScatterDelta", title: "Detector ISS (espalhamento) · Δ (V)", lo: -6.5, hi: 0 },
    { key: "stsDelta", title: "Detector STS (ionização) · Δ (V)", lo: -1, hi: 0 },
  ];
  const W = 300;
  const H = 190;
  const M = { left: 38, right: 8, top: 10, bottom: 24 };
  const group = (W - M.left - M.right) / ORDER.length;
  return (
    <div className="ss-three">
      {panels.map((panel) => {
        const y = (v: number) => M.top + (1 - (v - panel.lo) / (panel.hi - panel.lo)) * (H - M.top - M.bottom);
        const ticks = panel.key === "ionBDelta" ? [0, 1, 2] : panel.key === "issScatterDelta" ? [-6, -4, -2, 0] : [-1, -0.5, 0];
        return (
          <div key={panel.key} className="ss-panel">
            <h4>{panel.title}</h4>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${panel.title} por teste, agrupado por material`}>
              {ticks.map((t) => (
                <g key={t}>
                  <line className="ss-grid" x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} />
                  <text className="ss-tick" x={M.left - 5} y={y(t) + 3} textAnchor="end">
                    {fmt(t, t % 1 ? 1 : 0)}
                  </text>
                </g>
              ))}
              {panel.key === "issScatterDelta" && (
                <text className="ss-region-label" x={W - M.right} y={y(-4.9)} textAnchor="end">
                  saturação ≈ −6,25 V
                </text>
              )}
              {ORDER.map((id, index) => {
                const own = responses.filter((r) => r.material === id);
                const cx = M.left + group * (index + 0.5);
                const off = own.filter((r) => r[panel.key].kind === "unavailable").length;
                return (
                  <g key={id} className={matClass(id)}>
                    {own.map((r, k) => {
                      const v = r[panel.key];
                      if (v.value == null) return null;
                      const clipped = panel.key === "issScatterDelta" && r.issScatterDelta.clipped;
                      return (
                        <g key={r.test}>
                          <title>{`Teste ${r.test} · ${SHORT[id]}: Δ ${signed(v.value, 2)} V${clipped ? " (saturado)" : ""} · DustTrak B ${fmt(r.dusttrakB.value, 1)} mg/m³ (medido)`}</title>
                          <circle
                            className={clipped ? "ss-mark ss-hollow" : "ss-mark"}
                            cx={cx + (k - (own.length - 1) / 2) * 7}
                            cy={y(v.value)}
                            r={4.5}
                          />
                        </g>
                      );
                    })}
                    <text className="ss-tick" x={cx} y={H - 10} textAnchor="middle">
                      {SHORT[id].slice(0, 4)}
                    </text>
                    {panel.key === "stsDelta" && off > 0 && (
                      <text className="ss-tick ss-faint" x={cx} y={H - 1} textAnchor="middle">
                        {off} off
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        );
      })}
    </div>
  );
}

function Detection({ data }: { data: SmokeAnalysis }) {
  return (
    <Section id="detect" letter="E" title="Instrumentos e detectores de fumaça" kinds={["measured", "published", "derived", "model_assumption", "unavailable"]}>
      <div className="table-scroll ss-table-scroll">
        <table className="ss-table">
          <thead>
            <tr>
              <th>Instrumento</th>
              <th>Princípio</th>
              <th>Momento associado</th>
              <th>Unidade no arquivo</th>
              <th>Faixa</th>
              <th>
                Calibração <KindTag kind="unavailable" />
              </th>
              <th>Limitações</th>
            </tr>
          </thead>
          <tbody>
            {data.detectors.instruments.map((i) => (
              <tr key={i.id}>
                <td>
                  <strong>{i.name}</strong>
                </td>
                <td className="ss-small">{i.principle}</td>
                <td className="mono">{i.moment}</td>
                <td className="mono">{i.unit}</td>
                <td className="ss-small">{i.range}</td>
                <td className="ss-small">{i.calibration.reason}</td>
                <td className="ss-small">
                  <ul className="ss-list">
                    {i.limitations.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="ss-panel">
        <h4>
          Razão DustTrak B (10 µm) ÷ A (1 µm): massa acima de ~1 µm <KindTag kind="measured" />
        </h4>
        <RatioChart data={data} />
        <div className="table-scroll ss-table-scroll">
          <table className="ss-table ss-compact">
            <thead>
              <tr>
                <th>Material</th>
                <th>Testes</th>
                <th>
                  Média ± dp <KindTag kind="derived" />
                </th>
                <th>
                  Publicado <KindTag kind="published" />
                </th>
                <th>Diferença</th>
                <th>
                  Abas NASA <KindTag kind="measured" />
                </th>
                <th>
                  Lognormal <KindTag kind="model_assumption" />
                </th>
              </tr>
            </thead>
            <tbody>
              {ORDER.map((id) => {
                const m = data.dusttrakRatio.materials.find((r) => r.material === id)!;
                return (
                  <tr key={id}>
                    <td>
                      <span className={`ss-swatch ${matClass(id)}`} aria-hidden="true" />
                      {SHORT[id]}
                    </td>
                    <td className="mono">{m.perTest.map((p) => p.test).join(", ")}</td>
                    <td className="mono">
                      {m.mean?.value ? `${fmt(m.mean.value.mean, 3)} ± ${fmt(m.mean.value.sd, 3)}` : m.perTest.map((p) => fmt(p.value.value, 0)).join(" / ")}
                    </td>
                    <td className="mono">{fmt(m.published?.value)}</td>
                    <td className="mono">{m.relativeDifference ? pct(m.relativeDifference.value, 1) : "—"}</td>
                    <td className="mono">{m.nasaAveragingSheets?.value?.length ? m.nasaAveragingSheets.value.map((v) => fmt(v, 3)).join(", ") : "—"}</td>
                    <td className="mono">{fmt(m.lognormalExpectation?.value)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="ss-note">
          {data.dusttrakRatio.caveat} Janela: {data.dusttrakRatio.window}. DBP: DustTrak A quase zero (fumaça quase toda acima do corte de 1
          µm, ou líquido retido no impactador); fora da Tabela 1.
        </p>
      </div>
      <div className="ss-panel">
        <h4>
          Resposta dos detectores na janela primária <KindTag kind="measured" />
        </h4>
        <DetectorStrips data={data} />
        <p className="ss-note">
          Δ = mediana do platô − baseline, em volts de voo, sem calibração. No arquivo, a fumaça produz deflexão negativa nos detectores
          ISS e STS. Círculos vazados: ISS saturado. "off": testes com o STS desligado (indisponível, nunca zero). Leitura: a ionização
          responde a todos os materiais; o espalhamento ISS responde pouco à fumaça fina do Teflon e satura com silicone, lamp wick e DBP.{" "}
          {data.detectors.note}
        </p>
      </div>
      <details className="ss-details">
        <summary>Tabela por teste ({data.detectors.responses.length} testes processados)</summary>
        <div className="table-scroll ss-table-scroll">
          <table className="ss-table ss-compact">
            <thead>
              <tr>
                <th>Teste</th>
                <th>Material</th>
                <th>DustTrak A / B (mg/m³)</th>
                <th>Ion B Δ (V)</th>
                <th>ISS espalh. Δ (V)</th>
                <th>ISS obsc. Δ (V)</th>
                <th>STS Δ (V)</th>
                <th>Idade no platô (s)</th>
              </tr>
            </thead>
            <tbody>
              {data.detectors.responses.map((r) => (
                <tr key={r.test}>
                  <td className="mono">{r.test}</td>
                  <td>
                    <span className={`ss-swatch ${matClass(r.material)}`} aria-hidden="true" />
                    {SHORT[r.material]}
                  </td>
                  <td className="mono">
                    {fmt(r.dusttrakA.value, 2)} / {fmt(r.dusttrakB.value, 1)}
                  </td>
                  <td className="mono">{signed(r.ionBDelta.value)}</td>
                  <td className="mono">
                    {signed(r.issScatterDelta.value)}
                    {r.issScatterDelta.clipped ? " (sat.)" : ""}
                  </td>
                  <td className="mono">{signed(r.issObscurationDelta.value)}</td>
                  <td className="mono">{r.stsDelta.kind === "unavailable" ? "desligado" : signed(r.stsDelta.value)}</td>
                  <td className="mono">{fmt(r.ageAtPlateauStart_s.value, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Section>
  );
}

/* ------------------------------------------------------------------ F. moment method */
function MomentMethod({ data }: { data: SmokeAnalysis }) {
  const mm = data.momentMethod;
  const v = mm.verification.value;
  return (
    <Section id="moments" letter="F" title="Método dos momentos" kinds={["model_assumption", "derived", "unavailable"]}>
      <div className="ss-moment-notice" role="note">
        <TriangleAlert size={15} />
        <strong>{mm.notice}</strong>
      </div>
      <dl className="ss-equations">
        {mm.definitions.map((d) => (
          <div key={d.symbol}>
            <dt className="mono">{d.symbol}</dt>
            <dd>{d.meaning}</dd>
          </div>
        ))}
      </dl>
      <p className="ss-note">
        <KindTag kind="model_assumption" /> Hipótese: {mm.hypothesis.value}. {mm.hypothesis.note} Com distribuições bimodais, a lognormal
        ajustada reproduz os três momentos mas distribui errado a massa acima e abaixo de qualquer corte.
      </p>
      {v && (
        <p className="ss-note">
          <KindTag kind="derived" /> Verificação: Dg = {fmt(v.Dg_um, 1)} µm e σg = {fmt(v.sigmaG, 1)} dão D0,5 = {fmt(v.D05_um, 3)} µm e
          D1,5 = {fmt(v.D15_um, 3)} µm, como na Fig. 3 do relatório. Fonte: {mm.source}.
        </p>
      )}
      <div className="ss-three ss-columns">
        <div className="ss-panel">
          <h4>
            Calculado matematicamente <KindTag kind="derived" />
          </h4>
          <ul className="ss-list">
            {mm.calculated.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="ss-panel">
          <h4>
            Medido diretamente <KindTag kind="measured" />
          </h4>
          <ul className="ss-list">
            {mm.measured.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="ss-panel">
          <h4>
            Não reconstruível nos dados de voo <KindTag kind="unavailable" />
          </h4>
          <ul className="ss-list">
            {mm.notReconstructible.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="ss-note">Falta:</p>
          <ul className="ss-list">
            {mm.missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

function Unavailable({ data }: { data: SmokeAnalysis }) {
  return (
    <section className="ss-section" aria-labelledby="ss-unavailable">
      <div className="ss-section-heading">
        <h3 id="ss-unavailable">Grandezas indisponíveis</h3>
        <KindTag kind="unavailable" />
      </div>
      <ul className="ss-unavailable">
        {data.unavailable.map((u) => (
          <li key={u.quantity}>
            <strong>{u.quantity}</strong>
            <span>{u.reason}</span>
          </li>
        ))}
      </ul>
      <h4 className="ss-sources-title">Fontes</h4>
      <ul className="ss-sources">
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
