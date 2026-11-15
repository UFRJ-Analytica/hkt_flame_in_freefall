import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, TriangleAlert, X } from "lucide-react";
import { useModalFocus } from "../../hooks/useModalFocus";
import { SOFIE_GEL_DATA_PATH, SOFIE_GEL_TITLE } from "./sofieGel";
import "./sofie-gel.css";

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
  published: "publicado",
  derived: "derivado",
  video_observation: "observação do vídeo",
  exploratory: "exploratório",
  hypothesis: "hipótese",
  unavailable: "indisponível",
};
const MODE_LABEL: Record<Mode, string> = { quenching: "quenching", blowoff: "blowoff", intermediate: "intermediário" };
const LOCATION_LABEL: Record<string, string> = { "inside duct": "dentro do duto", "duct exit": "saída do duto" };
const fmt = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value)
    ? "—"
    : value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const DYNAMICS_LABEL: Record<string, [string, string]> = {
  pulsationCycles: ["ciclos de pulsação", ""],
  pulsationPeriod_s: ["período da pulsação", "s"],
  extinction_s: ["extinção em", "s"],
  baseTravel_cm: ["deslocamento médio da base", "cm"],
  upstreamPulsationPeriod_s: ["período da pulsação a montante", "s"],
  azimuthalSpinning_s: ["giro azimutal", "s"],
  pulsation_s: ["pulsação autossustentada", "s"],
  pulsationFrequency_Hz: ["frequência da pulsação", "Hz"],
  peakTipSpeed_cm_s: ["velocidade de pico da ponta", "cm/s"],
  standoff_mm: ["standoff na estagnação", "mm"],
  quenching_s: ["quenching em", "s"],
  sideStabilized_s: ["chama estabilizada lateralmente", "s"],
  spinning_s: ["giro", "s"],
  spinFrequency_Hz: ["frequência de giro", "Hz"],
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
        if (isGelEvidence(value)) setData(value);
        else setError("O arquivo gel-evidence.json não tem o formato esperado.");
      })
      .catch((reason: unknown) => alive && setError(`Não foi possível carregar a evidência SoFIE-GEL (${String(reason)}).`));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal sg-modal" role="dialog" aria-modal="true" aria-labelledby="sg-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">NASA SoFIE-GEL · EVIDÊNCIA PUBLICADA · SEM DATASET PSI</span>
            <h2 id="sg-title">{SOFIE_GEL_TITLE}</h2>
          </div>
          <button className="icon-button" aria-label="Fechar evidência SoFIE-GEL" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {error && <div className="data-notice">{error}</div>}
        {!data && !error && <p className="sg-loading">Carregando a evidência SoFIE-GEL…</p>}
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
        <TriangleAlert size={15} /> E. Limitações permanentes
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
    <dl className="sg-kind-legend" aria-label="Tipos de valor">
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
    <Section id="id" letter="A" title="Identificação científica" kinds={["published", "unavailable"]}>
      <dl className="sg-facts">
        <div>
          <dt>Investigação</dt>
          <dd>{inv.name}</dd>
        </div>
        <div>
          <dt>Agência e equipe</dt>
          <dd>
            {inv.agency}. PI: {inv.principalInvestigator}
          </dd>
        </div>
        <div>
          <dt>Plataforma</dt>
          <dd>{inv.platform}</dd>
        </div>
        <div>
          <dt>Combustível e geometria</dt>
          <dd>
            {String(data.sample.material.value)}, {String(data.sample.geometry.value)} de {fmt(Number(data.sample.diameter.value), 0)} cm
            <small>{data.sample.diameter.note}</small>
          </dd>
        </div>
        <div>
          <dt>Faixas da campanha</dt>
          <dd>
            fluxo {range(facility.flowRange)} · O₂ {range(facility.o2Range)} · pressão {range(facility.pressureRange)}
            <small>resumo publicado de 2025</small>
          </dd>
        </div>
        <div>
          <dt>Dataset NASA PSI</dt>
          <dd>
            <KindTag kind="unavailable" /> {inv.psi.reason}
          </dd>
        </div>
      </dl>
      <p className="sg-objective">
        <strong>Objetivo.</strong> {inv.objective}
      </p>
      <p className="sg-note">{data.context.role} Não está conectado a: {data.context.notConnectedTo.join(", ")}.</p>
      <a className="text-link" href={inv.officialPage} target="_blank" rel="noreferrer">
        Página NASA SoFIE-GEL <ArrowUpRight size={13} />
      </a>
    </Section>
  );
}

/* ------------------------------------------------------------------ B. five cases */
function Cases({ data }: { data: GelEvidence }) {
  const rows = data.cases.rows;
  return (
    <Section id="cases" letter="B" title="Cinco casos de extinção publicados" kinds={["published", "derived", "unavailable"]}>
      <p className="sg-note sg-emph">
        Fonte: {data.cases.source}. Esfera de PMMA de 4 cm; extinção por depleção gradual de O₂ a fluxo constante. Valores como
        impressos.
      </p>
      <div className="table-scroll sg-table-scroll">
        <table className="sg-table">
          <thead>
            <tr>
              <th>Caso · amostra</th>
              <th>Modo de extinção</th>
              <th>Local</th>
              <th>Fluxo (cm/s)</th>
              <th>O₂ na extinção (%)</th>
              <th>Pressão (atm)</th>
              <th>Re</th>
              <th>Taxa de deformação (1/s)</th>
              <th>Perda condutiva (W/cm²)</th>
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
                    <span className="sg-missing">não registrada</span>
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
        <KindTag kind="derived" /> Coerência da tabela: 3U/(2R) difere da taxa publicada em no máximo {fmt(data.cases.consistency.strainRate.value, 4)} 1/s
        (limite de arredondamento 0,00875); os cinco Re correspondem a uma única viscosidade de {fmt(data.cases.consistency.viscosity.value?.[0], 3)}–
        {fmt(data.cases.consistency.viscosity.value?.[1], 4)} cm²/s (ar a temperatura ambiente).
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
        Conclusões publicadas <KindTag kind="published" />
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
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="O2 na extinção versus taxa de deformação no ponto de estagnação, cinco casos publicados">
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
          7,5 1/s: junção dos ramos (publicado, 2025)
        </text>
        <text className="sg-axis-label" x={(M.left + W - M.right) / 2} y={H - 8} textAnchor="middle">
          taxa de deformação a = 3U/(2R) (1/s, escala log)
        </text>
        <text className="sg-axis-label" x={12} y={M.top - 8}>
          O₂ na extinção (%)
        </text>
        {rows.map((row) => {
          const cx = x(row.strainRate.value!);
          const cy = y(row.o2AtExtinction.value!);
          return (
            <g key={row.sample}>
              <title>{`${row.sample}: ${MODE_LABEL[row.extinctionMode.value as Mode]}, U = ${fmt(row.flow.value)} cm/s, a = ${fmt(row.strainRate.value)} 1/s, O₂ = ${fmt(row.o2AtExtinction.value)} %, p = ${fmt(row.pressure.value)} atm (publicado)`}</title>
              <ModeMark mode={row.extinctionMode.value as Mode} x={cx} y={cy} />
              <text className="sg-mark-label" x={cx + 9} y={cy - 7}>
                {row.sample}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="sg-chart-key">
        ● quenching · ■ blowoff · ◆ intermediário. Cinco pontos publicados, sem ajuste nem extrapolação; a forma em "U" da fronteira
        completa está no artigo de 2025 (não transcrita).
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
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} por caso`}>
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
                    não registrada
                  </text>
                </>
              ) : (
                <>
                  <title>{`${row.sample}: ${fmt(entry.value, digits)} ${unit} (publicado)`}</title>
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
        {log ? " · escala log" : ""}
      </p>
    </div>
  );
}

function Comparison({ data }: { data: GelEvidence }) {
  const rows = data.cases.rows;
  return (
    <Section id="compare" letter="C" title="Comparação experimental dos cinco casos" kinds={["published"]}>
      <ExtinctionChart rows={rows} />
      <div className="sg-three">
        <CaseBars rows={rows} field="flow" title="Velocidade do ar" unit="cm/s" digits={2} log />
        <CaseBars rows={rows} field="o2AtExtinction" title="O₂ na extinção" unit="%" digits={2} />
        <CaseBars rows={rows} field="conductiveHeatLoss" title="Perda condutiva ao sólido" unit="W/cm²" digits={2} />
      </div>
      <p className="sg-note">
        Associação observada, não causalidade: nos cinco casos, quenching ocorre nos fluxos mais baixos e blowoff nos mais altos, como
        descrevem os autores. Pressão praticamente constante (1,03–1,07 atm) e pré-aquecimento diferente entre casos impedem isolar o
        efeito de uma única variável; nenhuma regra de extinção é derivada aqui.
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
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Frequência dominante por janela do vídeo 1410C, análise exploratória">
        <rect className="sg-band" x={M.left} y={y(hi)} width={W - M.left - M.right} height={y(lo) - y(hi)} />
        <text className="sg-region-label" x={W - M.right - 4} y={y(hi) + 12} textAnchor="end">
          faixa publicada 2–3,5 Hz (comparável só sob H1)
        </text>
        <line className="sg-ref" x1={M.left} x2={W - M.right} y1={y(v.method.nyquist_videoHz)} y2={y(v.method.nyquist_videoHz)} />
        <text className="sg-region-label" x={M.left + 4} y={y(v.method.nyquist_videoHz) - 5}>
          Nyquist 5 Hz (10 quadros únicos/s)
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
            <title>Transição de edição (observação do vídeo)</title>
          </rect>
        )}
        <text className="sg-axis-label" x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle">
          centro da janela (s de vídeo)
        </text>
        <text className="sg-axis-label" x={8} y={M.top - 6}>
          pico (Hz de vídeo)
        </text>
        {windows.map((w) => {
          const cx = x((w.video_s[0] + w.video_s[1]) / 2);
          const cy = y(w.peak_Hz!);
          return (
            <g key={w.video_s[0]}>
              <title>{`Janela ${fmt(w.video_s[0], 1)}–${fmt(w.video_s[1], 1)} s: pico ${fmt(w.peak_Hz, 2)} Hz de vídeo, potência ${fmt(w.peakPower, 2)} (limiar 99 % ${fmt(w.threshold99, 2)}) — ${w.significant ? "significativo" : "não significativo"} · exploratório`}</title>
              <circle className={w.significant ? "sg-spin" : "sg-spin sg-spin-ns"} cx={cx} cy={cy} r={5.5} />
            </g>
          );
        })}
      </svg>
      <p className="sg-chart-key">
        ● janela significativa (permutação, 99 %) · ○ não significativa · faixa cinza: transição de edição. Picos abaixo de 1 Hz são deriva
        lenta da chama envolvente.
      </p>
    </div>
  );
}

function Video1410C({ data }: { data: GelEvidence }) {
  const v = data.video1410C;
  const summary = v.summary.value;
  return (
    <Section id="video" letter="D" title="Caso 1410C: vídeo público e rotação aparente da chama" kinds={["video_observation", "exploratory", "hypothesis", "published", "unavailable"]}>
      <div className="sg-exploratory-label" role="note">
        <TriangleAlert size={15} />
        <strong>{v.label}</strong>
        <span>Não é usado como parâmetro de modelo.</span>
      </div>
      <dl className="sg-facts">
        <div>
          <dt>
            Vídeo <KindTag kind="video_observation" />
          </dt>
          <dd>
            “{v.video.title}” · NASA, {v.video.publicRelease}
            <small>{v.video.editing}</small>
          </dd>
        </div>
        <div>
          <dt>Associação ao teste</dt>
          <dd>
            1410C
            <small>{v.video.association}</small>
          </dd>
        </div>
        <div>
          <dt>Arquivo</dt>
          <dd>
            {v.video.codec.toUpperCase()} {v.video.resolution.join(" × ")} · {fmt(v.video.fps, 0)} fps · {fmt(v.video.duration_s, 0)} s
            <small>{v.video.overlay}</small>
          </dd>
        </div>
        <div>
          <dt>Duplicação de quadros</dt>
          <dd>
            cada quadro-fonte repetido {v.cadence.value}× → {fmt(v.cadence.uniqueFramesPerVideoSecond, 0)} quadros únicos por segundo de vídeo
          </dd>
        </div>
        <div>
          <dt>Edição</dt>
          <dd>
            transição em {fmt(v.editTransition_video_s.value?.[0], 1)}–{fmt(v.editTransition_video_s.value?.[1], 1)} s; segmentos{" "}
            {v.segments.map((s) => `${fmt(s.value?.[0], 1)}–${fmt(s.value?.[1], 1)} s`).join(" e ")}
          </dd>
        </div>
        <div>
          <dt>
            Escala espacial <KindTag kind="unavailable" />
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
              <th>Hipótese de base de tempo</th>
              <th>Premissa</th>
              <th>Faixa física das janelas giratórias</th>
              <th>Janelas na faixa publicada</th>
            </tr>
          </thead>
          <tbody>
            {(["H1_realTime", "H2_slowMotion"] as const).map((key) => {
              const h = v.timeBase[key];
              return (
                <tr key={key}>
                  <td>
                    {key === "H1_realTime" ? "H1 · tempo real" : "H2 · câmera lenta 3×"} <KindTag kind="hypothesis" />
                  </td>
                  <td className="sg-small">{h.assumes}</td>
                  <td className="mono">
                    {fmt(h.value?.[0])}–{fmt(h.value?.[1])} Hz
                  </td>
                  <td className="mono">
                    {h.windowsInsidePublishedRange} de {summary?.spinningWindows}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="sg-list sg-caveats">
        <li>
          <KindTag kind="published" /> Faixa publicada para 1410C: {fmt(v.publishedReference.value?.[0], 1)}–{fmt(v.publishedReference.value?.[1], 1)} Hz
          (chamas giratórias por cerca de 35 s). Mostrada ao lado, não misturada aos resultados do vídeo.
        </li>
        <li>
          <KindTag kind="exploratory" /> {summary?.spinningWindows} de {summary?.analysedWindows} janelas com periodicidade significativa entre{" "}
          {fmt(summary?.peakRange_videoHz[0])} e {fmt(summary?.peakRange_videoHz[1])} Hz de vídeo ({v.method.window_s} s por janela, passo de{" "}
          {v.method.step_s} s, {v.method.permutations} permutações, semente {v.method.seed}).
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
        Fontes
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
