import { useMemo, useState } from "react";
import { englishDisplayData } from "../../i18n/english";
import { ExperimentalReplay, LegendItem } from "../replay/ExperimentalReplay";
import { ReplayControls } from "../replay/ReplayControls";
import { useReplayClock } from "../replay/useReplayClock";
import { useReplayData } from "../replay/useReplayData";
import { isStrictlyIncreasing, lastIndexAtOrBefore } from "../replay/replayCore";
import { BASS_B1_REPLAY_PATH } from "./bassB1";

/* ------------------------------------------------------------------ data contracts */
type Band = "upper" | "lower";
type Quality = "ok" | "low" | "absent" | "rejected" | "unseeded";
const BANDS: Band[] = ["upper", "lower"];

interface B1Series {
  experiment: { test: string; material: string; thickness_um: number; width_mm_nominal: number; platform: string };
  units: { time: string; position: string; velocity: string };
  tOrigin: { frame: number; clock: string };
  window: { frameFirst: number; frameLast: number; t_s: [number, number] };
  series: {
    frame: number[];
    t_s: number[];
    clock: string[];
    fronts: Record<Band, { x_px: (number | null)[]; quality: Quality[] }>;
    qualityCodes: Record<Quality, string>;
  };
  velocities: Record<Band, { value_px_s: number; ci95_px_s: [number, number]; intercept_px: number; r2: number; n: number }>;
  method: { methodSpread_px_s: Record<Band, { fullWindow: [number, number]; secondHalf: [number, number] }> };
  spatialScale: { status: string; mm_per_px: null };
  physicalVelocity: { status: string; value_mm_s: null };
  events: { id: string; label: string; kind: string; t_s: number; tEnd_s: number; note: string | null }[];
  telemetry: { points: { t_s: number; fan: number | null; fanVoltage_v: number | null; air: number | null }[]; fanNote: string; airNote: string };
  referenceAnnotations: { status: string; independent: boolean; points: { frame: number; upper: number | null; lower: number | null }[] };
  limitations: { id: string; text: string }[];
}
interface SamplePlane {
  frame: { width_px: number; height_px: number };
  regions: {
    flame: { x: [number, number]; y: [number, number]; label: string };
    bands: Record<Band, { y: [number, number]; label: string }>;
    gap: { y: [number, number]; label: string };
    ignitor: { x: [number, number]; y: [number, number]; label: string };
  };
  spatialScale: { status: string; mm_per_px: null };
  drawingNote: string;
}

function readSeries(value: unknown): B1Series {
  const d = value as B1Series;
  const n = d?.series?.frame?.length ?? 0;
  const ok =
    n > 1 &&
    d.series.t_s.length === n &&
    isStrictlyIncreasing(d.series.t_s) &&
    BANDS.every((b) => d.series.fronts[b]?.x_px.length === n && d.series.fronts[b].quality.length === n) &&
    d.units?.position === "px" &&
    d.units.velocity === "px/s" &&
    d.spatialScale?.mm_per_px === null &&
    d.physicalVelocity?.value_mm_s === null &&
    isStrictlyIncreasing(d.telemetry?.points?.map((p) => p.t_s) ?? []);
  if (!ok) throw new Error("The B1 replay file does not match the expected contract.");
  return englishDisplayData(d);
}
function readPlane(value: unknown): SamplePlane {
  const d = value as SamplePlane;
  if (!d?.regions?.bands?.upper || !d.regions.bands.lower || d.spatialScale?.mm_per_px !== null) {
    throw new Error("The B1 sample-plane file does not match the expected contract.");
  }
  return d;
}

const fmt = (v: number, digits = 2) => v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (v: number) => `${v < 0 ? "−" : "+"}${fmt(Math.abs(v))}`;
const SPEEDS = [0.25, 0.5, 1, 2, 4];

/* ------------------------------------------------------------------ module */
export default function BassB1Replay({ onClose }: { onClose: () => void }) {
  const series = useReplayData(BASS_B1_REPLAY_PATH, readSeries, "The B1 replay file");
  const plane = useReplayData("data/bass2/b1-sample-plane.json", readPlane, "The B1 sample-plane file");
  const error = series.error ?? plane.error;
  return (
    <ExperimentalReplay
      id="bb"
      eyebrow="NASA BASS-II · PSI-25 · TEST B1 · 100 µm PMMA FILM, 20 MM WIDE"
      title="BASS-II B1 — Experimental Replay"
      natures={["video-derived"]}
      caption="Optical trajectories measured in the experimental video; position in pixels, without absolute spatial calibration."
      quantity="x position of the two tracked optical fronts (leading edge of the bright region, +x)"
      unit="px (column of the 720 × 480 side-video frame); velocities in px/s"
      timeReference="Experiment time in s; 0 s = frame 332 (10:09:47 video clock); one sample per decoded frame"
      notices={[
        "Tracked optical fronts: the leading edge of the bright region in each band. They are not drawn or labelled as a flame contour; their physical identity (flame edge or pyrolysis/char front) is not established by this analysis.",
        "Positions are in image pixels. No mm/px scale exists for this view, so nothing is converted to mm or mm/s.",
        "Each frame shows its own recorded position. Nothing is interpolated between frames; a missing or rejected detection stays missing.",
        "FAN is the fan panel reading (×0.1 V), not an instantaneous air speed. AIR is the transducer reading (cm/s) with ~1 min response. Their divergence is shown as read, not corrected.",
        "This is a replay of a video measurement: not CFD, not a calibrated physical simulation and not a prediction.",
        // The P4 limitations of the B1 file, minus the three restated just above (pixels, no scale, px/s).
        ...(series.data?.limitations.filter((l) => !["pixels", "no-scale", "px-per-s"].includes(l.id)).map((l) => l.text) ?? []),
      ]}
      onClose={onClose}
      status={{ loading: !series.data || !plane.data ? "Loading B1 measurements…" : undefined, error }}
    >
      {series.data && plane.data && <Replay data={series.data} plane={plane.data} />}
    </ExperimentalReplay>
  );
}

function Replay({ data, plane }: { data: B1Series; plane: SamplePlane }) {
  const { series } = data;
  const times = series.t_s;
  const start = times[0];
  const end = times[times.length - 1];
  const clock = useReplayClock({ start, end, stops: times, speeds: SPEEDS, initialSpeed: 1, initialTime: 0 });
  const [showFit, setShowFit] = useState(false);
  const index = Math.max(0, lastIndexAtOrBefore(times, clock.time));
  const telemetryTimes = useMemo(() => data.telemetry.points.map((p) => p.t_s), [data]);
  const telemetryIndex = lastIndexAtOrBefore(telemetryTimes, clock.time);
  const telemetry = telemetryIndex >= 0 ? data.telemetry.points[telemetryIndex] : null;
  const eventIndex = lastIndexAtOrBefore(
    data.events.map((e) => e.t_s),
    clock.time,
  );
  const lastEvent = eventIndex >= 0 ? data.events[eventIndex] : null;
  const nextEvent = data.events[eventIndex + 1] ?? null;
  const frame = series.frame[index];
  const reference = data.referenceAnnotations.points.find((p) => p.frame === frame) ?? null;

  return (
    <div className="rp-body">
      <section className="rp-stage" aria-label="Sample plane of the side video">
        <SamplePlaneView data={data} plane={plane} index={index} time={clock.time} showFit={showFit} reference={reference} />
        <ul className="rp-legend">
          <LegendItem swatch="rp-sw-upper">Upper band · tracked optical front (measured)</LegendItem>
          <LegendItem swatch="rp-sw-lower">Lower band · tracked optical front (measured)</LegendItem>
          <LegendItem swatch="rp-sw-low">Dashed front: accepted with low confidence</LegendItem>
          <LegendItem swatch="rp-sw-trail">Shaded: span between the first and the current recorded position</LegendItem>
          <LegendItem swatch="rp-sw-ignitor">Hatched: saturated ignitor glow region</LegendItem>
          {showFit && <LegendItem swatch="rp-sw-fit">Linear fit of the stable window; band = 95% CI of its slope (not a measurement)</LegendItem>}
          {reference && <LegendItem swatch="rp-sw-ref">Preliminary visual reference at this frame (not independent)</LegendItem>}
        </ul>
        <p className="rp-footnote">{plane.drawingNote}</p>
      </section>

      <ReplayControls
        clock={clock}
        timeLabel="Experiment time (s), 0 = frame 332"
        formatTime={(t) => `${signed(t)} s`}
        stepUnit="frame"
        speedNote="1× = experiment time in real time (the recorded window lasts about 29 s)."
        segments={[{ start: data.window.t_s[0], end: data.window.t_s[1], label: "Stable analysis window (frames 332–1048)", tone: "window" }]}
        markers={[
          ...data.events.map((e) => ({ t: e.t_s, label: e.label, tone: "event" })),
          ...data.telemetry.points.map((p) => ({ t: p.t_s, label: `FAN ${p.fan ?? "—"} · AIR ${p.air ?? "—"}`, tone: "telemetry" })),
        ]}
      />
      <label className="rp-toggle">
        <input type="checkbox" checked={showFit} onChange={(e) => setShowFit(e.target.checked)} /> Show the linear fit of the stable window (a fitted
        line, not a measurement)
      </label>

      <div className="rp-panels">
        <dl className="rp-readout">
          <div>
            <dt>Frame</dt>
            <dd className="mono">{frame}</dd>
          </div>
          <div>
            <dt>Video clock</dt>
            <dd className="mono">{series.clock[index]}</dd>
          </div>
          {BANDS.map((band) => {
            const x = series.fronts[band].x_px[index];
            const q = series.fronts[band].quality[index];
            return (
              <div key={band}>
                <dt>
                  <i className={`rp-swatch rp-sw-${band}`} aria-hidden="true" /> {band === "upper" ? "Upper" : "Lower"} front
                </dt>
                <dd className="mono">
                  {x == null ? <span className="rp-missing">{series.qualityCodes[q]}</span> : `${fmt(x, 0)} px`}
                  {x != null && q === "low" && <small> · low confidence</small>}
                </dd>
              </div>
            );
          })}
          <div>
            <dt>FAN (panel, ×0.1 V)</dt>
            <dd className="mono">{telemetry?.fan ?? "—"}</dd>
          </div>
          <div>
            <dt>AIR (transducer, cm/s)</dt>
            <dd className="mono">{telemetry?.air ?? "—"}</dd>
          </div>
        </dl>
        <div className="rp-panel">
          <h4>Measured velocities (linear fit, stable window)</h4>
          <div className="rp-table-scroll">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Band</th>
                  <th>Velocity</th>
                  <th>95% CI</th>
                  <th>Range, 16 definitions</th>
                </tr>
              </thead>
              <tbody>
                {BANDS.map((band) => {
                  const v = data.velocities[band];
                  const spread = data.method.methodSpread_px_s[band].fullWindow;
                  return (
                    <tr key={band}>
                      <td>{band === "upper" ? "Upper" : "Lower"}</td>
                      <td className="mono">{fmt(v.value_px_s)} px/s</td>
                      <td className="mono">
                        {fmt(v.ci95_px_s[0])}–{fmt(v.ci95_px_s[1])}
                      </td>
                      <td className="mono">
                        {fmt(spread[0])}–{fmt(spread[1])}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="rp-note">
            mm/s: <strong>not computed</strong> (spatial scale {data.spatialScale.status}). The dominant uncertainty is systematic: the choice of
            front definition moves the velocity more than the confidence interval does.
          </p>
        </div>
        <div className="rp-panel">
          <h4>Events and telemetry</h4>
          <p className="rp-note">
            <strong>Last event:</strong> {lastEvent ? `${lastEvent.label} (${signed(lastEvent.t_s)} s)` : "none yet"}
            <br />
            <strong>Next event:</strong> {nextEvent ? `${nextEvent.label} (${signed(nextEvent.t_s)} s)` : "none"}
          </p>
          <p className="rp-note">
            FAN/AIR show the last value read on the video overlay (only changes were transcribed).{" "}
            {telemetry ? `Last change at ${signed(telemetry.t_s)} s.` : "No reading before this time."}
          </p>
          <details className="rp-details">
            <summary tabIndex={0}>Telemetry interpretation</summary>
            <p className="rp-note">{data.telemetry.fanNote}</p>
            <p className="rp-note">{data.telemetry.airNote}</p>
          </details>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ renderer: image plane of the side video */
function SamplePlaneView({
  data,
  plane,
  index,
  time,
  showFit,
  reference,
}: {
  data: B1Series;
  plane: SamplePlane;
  index: number;
  time: number;
  showFit: boolean;
  reference: { upper: number | null; lower: number | null } | null;
}) {
  const r = plane.regions;
  const pad = 16;
  const x0 = r.flame.x[0] - pad;
  const x1 = r.flame.x[1] + pad;
  const y0 = r.flame.y[0] - 26;
  const y1 = r.flame.y[1] + 30;
  const inWindow = time >= data.window.t_s[0] && time <= data.window.t_s[1];
  const firstRecorded = useMemo(() => {
    const out = {} as Record<Band, number[]>;
    for (const band of BANDS) {
      // For each frame, the first recorded position at or before it (the trail starts there).
      let first: number | null = null;
      out[band] = data.series.fronts[band].x_px.map((x) => {
        if (first == null && x != null) first = x;
        return first ?? Number.NaN;
      });
    }
    return out;
  }, [data]);
  const ticks: number[] = [];
  for (let x = Math.ceil(x0 / 100) * 100; x <= x1; x += 100) ticks.push(x);

  return (
    <div className="rp-scroll">
      <svg
        className="rp-svg bb-plane"
        viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`}
        role="img"
        aria-label={`Image plane of the B1 side video at frame ${data.series.frame[index]}: tracked optical fronts of the upper and lower bands`}
      >
        <defs>
          <pattern id="bb-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="bb-hatch-line" />
          </pattern>
        </defs>
        <rect className="bb-flame-roi" x={r.flame.x[0]} y={r.flame.y[0]} width={r.flame.x[1] - r.flame.x[0]} height={r.flame.y[1] - r.flame.y[0]} />
        <rect className="bb-ignitor" x={r.ignitor.x[0]} y={r.ignitor.y[0]} width={r.ignitor.x[1] - r.ignitor.x[0]} height={r.ignitor.y[1] - r.ignitor.y[0]} />
        <rect className="bb-gap" x={r.flame.x[0]} y={r.gap.y[0]} width={r.flame.x[1] - r.flame.x[0]} height={r.gap.y[1] - r.gap.y[0]} />
        <text className="bb-label" x={r.flame.x[1] - 4} y={(r.gap.y[0] + r.gap.y[1]) / 2 + 2.5} textAnchor="end">
          dark gap (not used)
        </text>
        {BANDS.map((band) => {
          const [by0, by1] = r.bands[band].y;
          const x = data.series.fronts[band].x_px[index];
          const q = data.series.fronts[band].quality[index];
          const first = firstRecorded[band][index];
          const v = data.velocities[band];
          const fit = v.intercept_px + v.value_px_s * time;
          const fitLo = v.intercept_px + v.ci95_px_s[0] * time;
          const fitHi = v.intercept_px + v.ci95_px_s[1] * time;
          const ref = reference?.[band] ?? null;
          return (
            <g key={band} className={`bb-band bb-${band}`}>
              <rect className="bb-lane" x={r.flame.x[0]} y={by0} width={r.flame.x[1] - r.flame.x[0]} height={by1 - by0} />
              <text className="bb-label" x={r.flame.x[0] + 4} y={by0 - 4}>
                {band === "upper" ? "upper band" : "lower band"} · y {by0}–{by1} px
              </text>
              {x != null && Number.isFinite(first) && x > first && <rect className="bb-trail" x={first} y={by0} width={x - first} height={by1 - by0} />}
              {showFit && inWindow && (
                <>
                  <rect className="bb-fit-band" x={Math.min(fitLo, fitHi)} y={by0 - 3} width={Math.abs(fitHi - fitLo) || 0.5} height={by1 - by0 + 6} />
                  <line className="bb-fit" x1={fit} x2={fit} y1={by0 - 5} y2={by1 + 5} />
                </>
              )}
              {x != null ? (
                <>
                  <line className={`bb-front ${q === "low" ? "bb-low" : ""}`} x1={x} x2={x} y1={by0 - 6} y2={by1 + 6} />
                  <circle className="bb-front-dot" cx={x} cy={(by0 + by1) / 2} r={3.2} />
                </>
              ) : (
                <text className="bb-missing" x={(r.flame.x[0] + r.flame.x[1]) / 2} y={(by0 + by1) / 2 + 4} textAnchor="middle">
                  {data.series.qualityCodes[q]} at this frame
                </text>
              )}
              {ref != null && <path className="bb-ref" d={`M${ref} ${by0 - 9} l5 5 l-5 5 l-5 -5 Z`} />}
            </g>
          );
        })}
        {ticks.map((t) => (
          <g key={t}>
            <line className="bb-tick" x1={t} x2={t} y1={r.flame.y[1] + 4} y2={r.flame.y[1] + 9} />
            <text className="bb-tick-label" x={t} y={r.flame.y[1] + 20} textAnchor="middle">
              {t}
            </text>
          </g>
        ))}
        <text className="bb-axis" x={r.flame.x[1]} y={y1 - 2} textAnchor="end">
          image column x (px) · propagation →
        </text>
      </svg>
    </div>
  );
}
