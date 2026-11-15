import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { Pause, Play, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useModalFocus } from "../../hooks/useModalFocus";
import { BASS_B1_REPLAY_PATH } from "./bassB1";
import "./bass-b1.css";

/* ------------------------------------------------------------------ data contract (b1-replay.json) */
type Band = "upper" | "lower";
type Quality = "ok" | "low" | "absent" | "rejected" | "unseeded";
interface Velocity {
  label: string;
  value_px_s: number;
  ci95_px_s: [number, number];
  ciMethod: string;
  intercept_px: number;
  r2: number;
  residualSd_px: number;
  n: number;
  coverage: number;
  slopeIfStartDelayed3s_px_s: number;
  localSlopeRange_px_s: [number, number];
}
interface ReplayEvent {
  id: string;
  label: string;
  kind: "visual" | "telemetry" | "inference" | "window";
  source: string;
  frameFirst: number;
  frameLast: number;
  t_s: number;
  tEnd_s: number;
  clock: string;
  note: string | null;
}
interface B1Replay {
  schemaVersion: 1;
  statement: string;
  experiment: {
    program: string;
    investigationId: string;
    recordId: string;
    test: string;
    platform: string;
    material: string;
    materialAsPublished: string;
    thickness_um: number;
    principalInvestigator: string;
    date: string;
    sample: string;
    conditions: { label: string; value: string | null; note: string | null }[];
    catalogueSource: string;
  };
  units: { time: "s"; position: "px"; velocity: "px/s" };
  axes: { time: string; position: string };
  tOrigin: { frame: number; clock: string };
  window: { frameFirst: number; frameLast: number; t_s: [number, number]; clockFirst: string; clockLast: string };
  method: {
    id: string;
    description: string;
    selectionRule: string;
    tracking: string;
    methodSpread_px_s: Record<Band, { fullWindow: [number, number]; secondHalf: [number, number] }>;
    candidates: number;
  };
  series: {
    frame: number[];
    t_s: number[];
    clock: string[];
    fronts: Record<Band, { label: string; x_px: (number | null)[]; quality: Quality[] }>;
    qualityCodes: Record<Quality, string>;
  };
  velocities: Record<Band, Velocity>;
  bandDifference_px_s: number;
  spatialScale: { status: string; mm_per_px: null; reason: string };
  physicalVelocity: { status: string; value_mm_s: null };
  nasaReference: { value_mm_s: number; source: string; comparisonStatus: string; note: string };
  events: ReplayEvent[];
  telemetry: {
    points: { frameFirst: number; t_s: number; fan: number | null; fanVoltage_v: number | null; air: number | null }[];
    fanNote: string;
    airNote: string;
    caveats: string[];
  };
  referenceAnnotations: {
    status: string;
    independent: boolean;
    annotators: string[];
    note: string;
    points: { frame: number; t_s: number; upper: number | null; lower: number | null }[];
  };
  limitations: { id: string; text: string }[];
  provenance: { generator: string; sourceVideo: { kind: string; sha256: string }; report: string };
}

function isReplay(value: unknown): value is B1Replay {
  const data = value as B1Replay;
  if (!data || data.schemaVersion !== 1 || !data.series || !data.velocities) return false;
  const n = data.series.frame?.length ?? 0;
  return (
    n > 1 &&
    data.series.t_s.length === n &&
    data.series.clock.length === n &&
    (["upper", "lower"] as Band[]).every(
      (band) =>
        data.series.fronts[band]?.x_px.length === n &&
        data.series.fronts[band].quality.length === n &&
        Number.isFinite(data.velocities[band]?.value_px_s),
    ) &&
    data.units?.velocity === "px/s" &&
    data.spatialScale?.mm_per_px === null &&
    data.physicalVelocity?.value_mm_s === null &&
    Array.isArray(data.limitations) &&
    Array.isArray(data.events)
  );
}

/* ------------------------------------------------------------------ helpers */
const BANDS: Band[] = ["upper", "lower"];
const BAND_CLASS: Record<Band, string> = { upper: "b1-upper", lower: "b1-lower" };
const BAND_SHORT: Record<Band, string> = { upper: "Superior", lower: "Inferior" };
const SPEEDS = [1, 2, 4];
const KIND_LABEL: Record<ReplayEvent["kind"], string> = {
  visual: "visual",
  telemetry: "telemetria",
  inference: "inferência",
  window: "janela",
};
const fmt = (value: number, digits = 2) =>
  value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (value: number, digits = 2) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${fmt(Math.abs(value), digits)}`;

/** Index of the last sample with t <= value (the series is strictly increasing). */
function indexAt(times: number[], value: number) {
  let lo = 0;
  let hi = times.length - 1;
  if (value <= times[0]) return 0;
  if (value >= times[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= value) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** SVG path of a measured series; a missing sample breaks the line (no interpolation across gaps). */
function seriesPath(t: number[], x: (number | null)[], sx: (v: number) => number, sy: (v: number) => number) {
  let path = "";
  let pen = false;
  for (let i = 0; i < t.length; i += 1) {
    const value = x[i];
    if (value == null) {
      pen = false;
      continue;
    }
    path += `${pen ? "L" : "M"}${sx(t[i]).toFixed(1)},${sy(value).toFixed(1)}`;
    pen = true;
  }
  return path;
}

/* ------------------------------------------------------------------ component */
export default function BassB1Observation({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<B1Replay | null>(null);
  const [error, setError] = useState<string | null>(null);
  useModalFocus(true, onClose);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}${BASS_B1_REPLAY_PATH}`, { signal: controller.signal, cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok) throw new Error("O arquivo da observação B1 não está disponível nesta instalação.");
        const value: unknown = await response.json();
        if (!isReplay(value)) throw new Error("O arquivo da observação B1 não corresponde ao contrato esperado.");
        setData(value);
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="b1-title"
        className="modal b1-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">NASA BASS-II · PSI-25 · OBSERVAÇÃO EXPERIMENTAL MEDIDA EM VÍDEO</span>
            <h2 id="b1-title">Teste B1 · frente de chama em filme de PMMA de 100 µm</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Fechar observação B1">
            <X size={20} />
          </button>
        </div>
        {error && <div className="data-notice" role="alert">{error}</div>}
        {!data && !error && <p className="muted">Carregando a observação B1…</p>}
        {data && <Observation data={data} />}
      </section>
    </div>
  );
}

function Observation({ data }: { data: B1Replay }) {
  const { series } = data;
  const last = series.frame.length - 1;
  const windowStart = series.frame.indexOf(data.window.frameFirst);
  const [index, setIndex] = useState(Math.max(0, windowStart));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showFits, setShowFits] = useState(true);
  const [showReference, setShowReference] = useState(true);
  const clockRef = useRef<{ wall: number; t: number } | null>(null);

  // Playback walks the measured samples in experiment time; it never creates intermediate positions.
  useEffect(() => {
    if (!playing) {
      clockRef.current = null;
      return;
    }
    let frame = 0;
    const step = (now: number) => {
      if (!clockRef.current) clockRef.current = { wall: now, t: series.t_s[index] };
      const target = clockRef.current.t + ((now - clockRef.current.wall) / 1000) * speed;
      const next = indexAt(series.t_s, target);
      setIndex(next);
      if (next >= last) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // index is read only when playback (re)starts; a speed change restarts the clock from the current sample.
  }, [playing, speed, series, last]);

  const togglePlay = () => {
    if (!playing && index >= last) setIndex(0);
    setPlaying((value) => !value);
  };
  const restart = () => {
    setPlaying(false);
    setIndex(0);
  };
  const seek = (value: number) => {
    setPlaying(false);
    setIndex(Math.min(last, Math.max(0, value)));
  };

  const t = series.t_s[index];
  return (
    <div className="b1-body">
      <Notices data={data} />
      <Identification data={data} />

      <section className="b1-panel" aria-labelledby="b1-chart-title">
        <div className="b1-panel-heading">
          <h3 id="b1-chart-title">Trajetórias medidas das duas lâminas luminosas</h3>
          <div className="b1-toggles">
            <label>
              <input type="checkbox" checked={showFits} onChange={(e) => setShowFits(e.target.checked)} /> Regressões lineares
            </label>
            <label>
              <input type="checkbox" checked={showReference} onChange={(e) => setShowReference(e.target.checked)} /> Referência preliminar
            </label>
          </div>
        </div>
        <TrajectoryChart data={data} index={index} onSeek={seek} showFits={showFits} showReference={showReference} />
        <div className="b1-controls">
          <div className="b1-buttons">
            <button className="button secondary small" onClick={togglePlay} aria-label={playing ? "Pausar" : "Reproduzir"}>
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? "Pausar" : "Reproduzir"}
            </button>
            <button className="button secondary small" onClick={restart} aria-label="Reiniciar">
              <RotateCcw size={14} /> Reiniciar
            </button>
            <div className="b1-speed" role="group" aria-label="Velocidade de reprodução">
              {SPEEDS.map((value) => (
                <button
                  key={value}
                  className={`chip ${speed === value ? "active" : ""}`}
                  aria-pressed={speed === value}
                  onClick={() => setSpeed(value)}
                >
                  {value}×
                </button>
              ))}
            </div>
          </div>
          <input
            className="b1-slider"
            type="range"
            min={0}
            max={last}
            step={1}
            value={index}
            style={{ "--range-progress": `${(index / last) * 100}%` } as CSSProperties}
            aria-label="Instante da série medida"
            aria-valuetext={`${fmt(t)} s, quadro ${series.frame[index]}`}
            onChange={(e) => seek(Number(e.target.value))}
          />
          <dl className="b1-readout" aria-live="off">
            <div>
              <dt>Tempo</dt>
              <dd className="mono">{signed(t)} s</dd>
            </div>
            <div>
              <dt>Relógio do vídeo</dt>
              <dd className="mono">{series.clock[index]}</dd>
            </div>
            <div>
              <dt>Quadro</dt>
              <dd className="mono">{series.frame[index]}</dd>
            </div>
            {BANDS.map((band) => {
              const value = series.fronts[band].x_px[index];
              const quality = series.fronts[band].quality[index];
              return (
                <div key={band}>
                  <dt>
                    <i className={`b1-swatch ${BAND_CLASS[band]}`} /> Frente {BAND_SHORT[band].toLowerCase()}
                  </dt>
                  <dd className="mono">
                    {value == null ? <span className="b1-missing">{series.qualityCodes[quality]}</span> : `${fmt(value, 0)} px`}
                    {value != null && quality === "low" && <small> · baixa confiança</small>}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
        <TelemetryStrips data={data} index={index} />
      </section>

      <div className="b1-grid">
        <Results data={data} />
        <Events data={data} index={index} onSeek={seek} />
      </div>

      <details className="b1-panel b1-method">
        <summary>Método, qualidade e proveniência</summary>
        <p>
          <strong>Definição de frente:</strong> {data.method.description}. {data.method.tracking}.
        </p>
        <p>
          <strong>Escolha do método:</strong> {data.method.selectionRule}. Entre as {data.method.candidates} definições comparadas, a
          velocidade na janela inteira varia de {fmt(data.method.methodSpread_px_s.upper.fullWindow[0])} a{" "}
          {fmt(data.method.methodSpread_px_s.upper.fullWindow[1])} px/s (superior) e de{" "}
          {fmt(data.method.methodSpread_px_s.lower.fullWindow[0])} a {fmt(data.method.methodSpread_px_s.lower.fullWindow[1])} px/s
          (inferior); na segunda metade da janela, de {fmt(data.method.methodSpread_px_s.upper.secondHalf[0])} a{" "}
          {fmt(data.method.methodSpread_px_s.upper.secondHalf[1])} e de {fmt(data.method.methodSpread_px_s.lower.secondHalf[0])} a{" "}
          {fmt(data.method.methodSpread_px_s.lower.secondHalf[1])} px/s.
        </p>
        <p>
          <strong>Eixos:</strong> {data.axes.time}. Posição: {data.axes.position}.
        </p>
        <p>
          <strong>Referência visual:</strong> {data.referenceAnnotations.note}.
        </p>
        <p>
          <strong>Fonte:</strong> vídeo {data.provenance.sourceVideo.kind.toUpperCase()} original (sha256{" "}
          <span className="mono">{data.provenance.sourceVideo.sha256.slice(0, 12)}…</span>); gerado por{" "}
          <span className="mono">{data.provenance.generator}</span>; relatório <span className="mono">{data.provenance.report}</span>.
        </p>
      </details>
    </div>
  );
}

function Notices({ data }: { data: B1Replay }) {
  return (
    <section className="b1-notices" aria-labelledby="b1-notices-title">
      <h3 id="b1-notices-title">
        <TriangleAlert size={15} /> Leia antes de interpretar
      </h3>
      <p className="b1-statement">{data.statement}</p>
      <ul>
        {data.limitations.map((item) => (
          <li key={item.id}>{item.text}</li>
        ))}
      </ul>
    </section>
  );
}

function Identification({ data }: { data: B1Replay }) {
  const e = data.experiment;
  return (
    <section className="b1-identity" aria-label="Identificação do experimento">
      <dl className="b1-facts">
        <div>
          <dt>Programa</dt>
          <dd>{e.program}</dd>
        </div>
        <div>
          <dt>Registro</dt>
          <dd className="mono">
            {e.investigationId} · {e.test} · {e.recordId}
          </dd>
        </div>
        <div>
          <dt>Material</dt>
          <dd>
            {e.material}, {e.thickness_um} µm <small>({e.materialAsPublished})</small>
          </dd>
        </div>
        <div>
          <dt>Plataforma</dt>
          <dd>{e.platform}</dd>
        </div>
        <div>
          <dt>Data · amostra</dt>
          <dd>
            {e.date} · nº {e.sample} · PI {e.principalInvestigator}
          </dd>
        </div>
        {e.conditions.map((condition) => (
          <div key={condition.label}>
            <dt>{condition.label}</dt>
            <dd>
              {condition.value ?? <span className="b1-missing">Não informado</span>}
              {condition.note && <small>{condition.note}</small>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="b1-source">Condições: {e.catalogueSource}.</p>
    </section>
  );
}

/* ------------------------------------------------------------------ charts */
const W = 760;
const H = 330;
const M = { left: 52, right: 14, top: 40, bottom: 40 };

function useScales(data: B1Replay) {
  return useMemo(() => {
    const t = data.series.t_s;
    const values = BANDS.flatMap((band) => data.series.fronts[band].x_px.filter((v): v is number => v != null));
    const t0 = Math.floor(t[0]);
    const t1 = Math.ceil(t[t.length - 1]);
    const y0 = Math.floor((Math.min(...values) - 10) / 50) * 50;
    const y1 = Math.ceil((Math.max(...values) + 10) / 50) * 50;
    const sx = (v: number) => M.left + ((v - t0) / (t1 - t0)) * (W - M.left - M.right);
    const sy = (v: number) => H - M.bottom - ((v - y0) / (y1 - y0)) * (H - M.top - M.bottom);
    const tFromPx = (px: number) => t0 + ((px - M.left) / (W - M.left - M.right)) * (t1 - t0);
    return { t0, t1, y0, y1, sx, sy, tFromPx };
  }, [data]);
}

function TrajectoryChart({
  data,
  index,
  onSeek,
  showFits,
  showReference,
}: {
  data: B1Replay;
  index: number;
  onSeek: (index: number) => void;
  showFits: boolean;
  showReference: boolean;
}) {
  const { t0, t1, y0, y1, sx, sy, tFromPx } = useScales(data);
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const dragging = useRef(false);
  const { series } = data;
  const paths = useMemo(
    () => Object.fromEntries(BANDS.map((band) => [band, seriesPath(series.t_s, series.fronts[band].x_px, sx, sy)])) as Record<Band, string>,
    [series, sx, sy],
  );
  const toIndex = (event: ReactPointerEvent<SVGRectElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const px = ((event.clientX - box.left) / box.width) * W;
    return indexAt(series.t_s, tFromPx(px));
  };
  const ticksX: number[] = [];
  for (let v = Math.ceil(t0 / 5) * 5; v <= t1; v += 5) ticksX.push(v);
  const ticksY: number[] = [];
  for (let v = y0; v <= y1; v += 50) ticksY.push(v);
  const ignition = data.events.find((e) => e.id === "ignitor_and_flame_overlap");
  const fanDrop = data.events.find((e) => e.id === "fan_drop_start");
  const fanFloor = data.events.find((e) => e.id === "fan_reaches_38");
  const pointEvents = data.events.filter((e) => e.kind !== "window");
  // Markers closer than 17 px go to a second row so that none hides another.
  const markerRows: number[] = [];
  pointEvents.forEach((event, n) => {
    const close = n > 0 && sx(event.t_s) - sx(pointEvents[n - 1].t_s) < 17 && markerRows[n - 1] === 0;
    markerRows.push(close ? 1 : 0);
  });
  const shown = hover ?? index;
  const tooltipX = sx(series.t_s[shown]);

  return (
    <div className="b1-chart">
      <div className="b1-scroll">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Posição em pixels das frentes superior e inferior em função do tempo, de ${fmt(t0, 0)} a ${fmt(t1, 0)} s`}
      >
        {/* Regions documented in P2/P3 */}
        <rect className="b1-window" x={sx(data.window.t_s[0])} y={M.top} width={sx(data.window.t_s[1]) - sx(data.window.t_s[0])} height={H - M.top - M.bottom} />
        {ignition && <rect className="b1-ignition" x={sx(ignition.t_s)} y={M.top} width={sx(ignition.tEnd_s) - sx(ignition.t_s)} height={H - M.top - M.bottom} />}
        {fanDrop && fanFloor && <rect className="b1-fanramp" x={sx(fanDrop.t_s)} y={M.top} width={sx(fanFloor.t_s) - sx(fanDrop.t_s)} height={H - M.top - M.bottom} />}
        <text className="b1-region-label" x={sx(data.window.t_s[0]) + 4} y={M.top + 12}>
          janela de análise (FAN constante)
        </text>
        {/* Grid and axes */}
        {ticksY.map((v) => (
          <g key={`y${v}`}>
            <line className="b1-grid-line" x1={M.left} x2={W - M.right} y1={sy(v)} y2={sy(v)} />
            <text className="b1-tick" x={M.left - 6} y={sy(v) + 3} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {ticksX.map((v) => (
          <text key={`x${v}`} className="b1-tick" x={sx(v)} y={H - M.bottom + 14} textAnchor="middle">
            {v}
          </text>
        ))}
        <line className="b1-axis" x1={M.left} x2={W - M.right} y1={H - M.bottom} y2={H - M.bottom} />
        <text className="b1-axis-label" x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle">
          tempo experimental (s) desde o quadro {data.tOrigin.frame} · {data.tOrigin.clock}
        </text>
        <text className="b1-axis-label" transform={`translate(13 ${(M.top + H - M.bottom) / 2}) rotate(-90)`} textAnchor="middle">
          posição da frente (px)
        </text>
        {/* Events: numbered markers, explained in the event list */}
        {pointEvents.map((event, n) => (
          <g key={event.id} className={`b1-event b1-event-${event.kind}`}>
            <line x1={sx(event.t_s)} x2={sx(event.t_s)} y1={M.top} y2={H - M.bottom} />
            <circle cx={sx(event.t_s)} cy={M.top - 9 - markerRows[n] * 16} r={7} />
            <text x={sx(event.t_s)} y={M.top - 6 - markerRows[n] * 16} textAnchor="middle">
              {n + 1}
            </text>
          </g>
        ))}
        {/* Fits over the analysis window only */}
        {showFits &&
          BANDS.map((band) => {
            const v = data.velocities[band];
            const [a, b] = data.window.t_s;
            return (
              <line
                key={`fit-${band}`}
                className={`b1-fit ${BAND_CLASS[band]}`}
                x1={sx(a)}
                x2={sx(b)}
                y1={sy(v.intercept_px + v.value_px_s * a)}
                y2={sy(v.intercept_px + v.value_px_s * b)}
              />
            );
          })}
        {/* Measured series */}
        {BANDS.map((band) => (
          <path key={band} className={`b1-series ${BAND_CLASS[band]}`} d={paths[band]} />
        ))}
        {showReference &&
          data.referenceAnnotations.points.flatMap((point) =>
            BANDS.filter((band) => point[band] != null).map((band) => (
              <circle key={`ref-${point.frame}-${band}`} className={`b1-reference ${BAND_CLASS[band]}`} cx={sx(point.t_s)} cy={sy(point[band] as number)} r={3.2} />
            )),
          )}
        {/* Current instant */}
        <line className="b1-cursor" x1={sx(series.t_s[index])} x2={sx(series.t_s[index])} y1={M.top} y2={H - M.bottom} />
        {BANDS.map((band) => {
          const value = series.fronts[band].x_px[index];
          return value == null ? null : (
            <circle key={`now-${band}`} className={`b1-now ${BAND_CLASS[band]}`} cx={sx(series.t_s[index])} cy={sy(value)} r={5} />
          );
        })}
        {hover != null && <line className="b1-hover" x1={tooltipX} x2={tooltipX} y1={M.top} y2={H - M.bottom} />}
        <rect
          className="b1-hit"
          x={M.left}
          y={M.top}
          width={W - M.left - M.right}
          height={H - M.top - M.bottom}
          onPointerMove={(event) => {
            const next = toIndex(event);
            setHover(next);
            if (dragging.current && next != null) onSeek(next);
          }}
          onPointerDown={(event) => {
            dragging.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
            const next = toIndex(event);
            if (next != null) onSeek(next);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerLeave={() => {
            setHover(null);
            dragging.current = false;
          }}
        />
      </svg>
      </div>
      {hover != null && (
        <div className="b1-tooltip" style={{ left: `${(tooltipX / W) * 100}%` }}>
          <strong className="mono">
            {signed(series.t_s[hover])} s · {series.clock[hover]} · quadro {series.frame[hover]}
          </strong>
          {BANDS.map((band) => {
            const value = series.fronts[band].x_px[hover];
            return (
              <span key={band}>
                <i className={`b1-swatch ${BAND_CLASS[band]}`} /> {BAND_SHORT[band]}:{" "}
                {value == null ? series.qualityCodes[series.fronts[band].quality[hover]] : `${fmt(value, 0)} px`}
              </span>
            );
          })}
          <small>clique ou arraste para posicionar</small>
        </div>
      )}
      <div className="b1-legend">
        {BANDS.map((band) => (
          <span key={band}>
            <i className={`b1-swatch ${BAND_CLASS[band]}`} /> Frente {data.series.fronts[band].label} (medida)
          </span>
        ))}
        <span>
          <i className="b1-swatch b1-dashed" /> Regressão na janela de análise
        </span>
        <span>
          <i className="b1-swatch b1-ring" /> Referência visual preliminar (32 quadros)
        </span>
        <span>
          <i className="b1-swatch b1-ign" /> Ignição · <i className="b1-swatch b1-ramp" /> Rampa de FAN
        </span>
      </div>
    </div>
  );
}

function TelemetryStrips({ data, index }: { data: B1Replay; index: number }) {
  const { t0, t1, sx } = useScales(data);
  const points = data.telemetry.points;
  const now = data.series.t_s[index];
  let currentIndex = 0;
  points.forEach((p, n) => {
    if (p.t_s <= now) currentIndex = n;
  });
  const current = points[currentIndex];
  const strip = (key: "fan" | "air", label: string, unit: string) => {
    const values = points.map((p) => p[key]).filter((v): v is number => v != null);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const h = 54;
    const sy = (v: number) => h - 8 - ((v - lo) / Math.max(1, hi - lo)) * (h - 18);
    let path = "";
    points.forEach((p, n) => {
      const value = p[key];
      if (value == null) return;
      const xEnd = n + 1 < points.length ? sx(points[n + 1].t_s) : sx(t1);
      path += `${path ? "L" : "M"}${sx(p.t_s).toFixed(1)},${sy(value).toFixed(1)}H${xEnd.toFixed(1)}`;
    });
    return (
      <div className="b1-strip">
        <span className="b1-strip-label">
          {label} <strong className="mono">{current?.[key] ?? "—"}</strong> <small>{unit}</small>
        </span>
        <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={`${label} entre ${fmt(t0, 0)} e ${fmt(t1, 0)} s, de ${lo} a ${hi}`}>
          <path className="b1-strip-line" d={path} />
          <text className="b1-tick" x={M.left - 6} y={sy(hi) + 3} textAnchor="end">
            {hi}
          </text>
          <text className="b1-tick" x={M.left - 6} y={sy(lo) + 3} textAnchor="end">
            {lo}
          </text>
          <line className="b1-cursor" x1={sx(now)} x2={sx(now)} y1={2} y2={h - 2} />
        </svg>
      </div>
    );
  };
  return (
    <div className="b1-telemetry" aria-label="Telemetria complementar">
      <div className="b1-scroll">
        {strip("fan", "FAN (display)", "×0,1 V · não é velocidade")}
        {strip("air", "AIR (display)", "cm/s · transdutor lento")}
      </div>
      <p className="b1-note">
        {data.telemetry.fanNote} {data.telemetry.airNote}
      </p>
    </div>
  );
}

function Results({ data }: { data: B1Replay }) {
  const u = data.velocities.upper;
  const l = data.velocities.lower;
  return (
    <section className="b1-panel" aria-labelledby="b1-results-title">
      <h3 id="b1-results-title">Resultados quantitativos</h3>
      <div className="b1-table-scroll">
      <table className="b1-table">
        <thead>
          <tr>
            <th scope="col">Indicador</th>
            <th scope="col">Resultado</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">Velocidade superior</th>
            <td className="mono">{fmt(u.value_px_s)} px/s</td>
          </tr>
          <tr>
            <th scope="row">IC 95% superior</th>
            <td className="mono">
              {fmt(u.ci95_px_s[0])}–{fmt(u.ci95_px_s[1])} px/s
            </td>
          </tr>
          <tr>
            <th scope="row">Velocidade inferior</th>
            <td className="mono">{fmt(l.value_px_s)} px/s</td>
          </tr>
          <tr>
            <th scope="row">IC 95% inferior</th>
            <td className="mono">
              {fmt(l.ci95_px_s[0])}–{fmt(l.ci95_px_s[1])} px/s
            </td>
          </tr>
          <tr>
            <th scope="row">Escala espacial</th>
            <td>Não determinada <small className="mono">({data.spatialScale.status})</small></td>
          </tr>
          <tr>
            <th scope="row">Velocidade física</th>
            <td>Não disponível <small className="mono">({data.physicalVelocity.status})</small></td>
          </tr>
          <tr>
            <th scope="row">Referência NASA publicada</th>
            <td>
              {fmt(data.nasaReference.value_mm_s, 1)} mm/s · <strong>não comparada</strong>{" "}
              <small className="mono">({data.nasaReference.comparisonStatus})</small>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
      <div className="b1-table-scroll">
      <table className="b1-table b1-quality">
        <caption>Qualidade do ajuste na janela de análise ({data.velocities.upper.ciMethod})</caption>
        <thead>
          <tr>
            <th scope="col">Lâmina</th>
            <th scope="col">R²</th>
            <th scope="col">Resíduo (DP)</th>
            <th scope="col">Cobertura</th>
            <th scope="col">Início +3 s</th>
          </tr>
        </thead>
        <tbody>
          {BANDS.map((band) => {
            const v = data.velocities[band];
            return (
              <tr key={band}>
                <th scope="row">
                  <i className={`b1-swatch ${BAND_CLASS[band]}`} /> {BAND_SHORT[band]}
                </th>
                <td className="mono">{fmt(v.r2, 4)}</td>
                <td className="mono">{fmt(v.residualSd_px, 1)} px</td>
                <td className="mono">{fmt(v.coverage * 100, 1)}%</td>
                <td className="mono">{fmt(v.slopeIfStartDelayed3s_px_s)} px/s</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <p className="b1-note">
        Fonte de {data.window.clockFirst} a {data.window.clockLast} (quadros {data.window.frameFirst}–{data.window.frameLast}). A
        incerteza dominante é a definição da frente, não a estatística (ver “Método”).
      </p>
    </section>
  );
}

function Events({ data, index, onSeek }: { data: B1Replay; index: number; onSeek: (index: number) => void }) {
  const now = data.series.t_s[index];
  const pointEvents = data.events.filter((e) => e.kind !== "window");
  const analysisWindow = data.events.find((e) => e.kind === "window");
  return (
    <section className="b1-panel" aria-labelledby="b1-events-title">
      <h3 id="b1-events-title">Eventos experimentais</h3>
      <ol className="b1-events">
        {pointEvents.map((event, n) => (
          <li key={event.id} className={now >= event.t_s ? "past" : ""}>
            <button onClick={() => onSeek(data.series.frame.indexOf(event.frameFirst))} title={event.note ?? undefined}>
              <span className={`b1-event-number b1-event-${event.kind}`}>{n + 1}</span>
              <span className="b1-event-text">
                <strong>{event.label}</strong>
                <small>
                  {signed(event.t_s)} s · {event.clock} · quadro {event.frameFirst}
                  {event.frameLast !== event.frameFirst ? `–${event.frameLast}` : ""} · {KIND_LABEL[event.kind]}
                </small>
              </span>
            </button>
          </li>
        ))}
      </ol>
      {analysisWindow && (
        <p className="b1-note">
          {analysisWindow.label}: quadros {analysisWindow.frameFirst}–{analysisWindow.frameLast} ({signed(analysisWindow.t_s)} a {signed(analysisWindow.tEnd_s)} s). Fonte dos
          eventos: fase P2 (telemetria e leitura visual); o marcador “frente estável” é uma inferência da fase P3.
        </p>
      )}
    </section>
  );
}
