import { useMemo } from "react";
import { frontEnsemble, frontMedianMm, readSaffireModel, SAFFIRE_ID, simulateFromObservedFront, type Grid, type SaffireModel } from "../../saffire";
import { ExperimentalReplay, LegendItem } from "../replay/ExperimentalReplay";
import { ReplayControls } from "../replay/ReplayControls";
import { useReplayClock } from "../replay/useReplayClock";
import { useReplayData } from "../replay/useReplayData";
import { lastIndexAtOrBefore } from "../replay/replayCore";
import { SAFFIRE_ENSEMBLE_SEEDS, SAFFIRE_MODEL_SEED } from "../replay/replayCatalog";

const SPEEDS = [5, 10, 20, 40];
const fmt = (v: number, digits = 0) => v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
type Trajectory = { timeS: number; frontMedianMm: number | null; visibleRows: number }[];

export default function SaffireModelReplay({ onClose }: { onClose: () => void }) {
  const { data, error } = useReplayData("data/saffire/psi-98-s1-neighbors.json", (v) => readSaffireModel(v, SAFFIRE_ID), "The SAFFIRE I model artefact");
  return (
    <ExperimentalReplay
      id="sm"
      eyebrow="NASA SAFFIRE I · PSI-98 · SAMPLE S1 · SIBAL 0.37 MM · CONCURRENT FLOW 20 CM/S"
      title="SAFFIRE I · S1 — Stochastic Model Replay"
      natures={["computational-model", "video-derived"]}
      caption="Computational simulation: the neighbourhood model fitted to this one trial, started from the observed front, with a fixed seed. Not an observed flame."
      quantity="Model cell state on the 10 × 20 mm grid; median front (simulated, and measured for comparison)"
      unit="mm along the sample (94 × 21 cells over 940 × 406 mm)"
      timeReference="Seconds from the start of the analysed window; one model step = 2 s"
      notices={[
        "Every cell state shown is model output. The only measured quantity drawn is the median front extracted from the camera images, as a separate dashed line.",
        "The model was fitted to this same trial: 0–246 s is the fitting period, so agreement there is in-sample. Only 246–352 s was held out, and it is the same apparatus and trial, not an independent validation.",
        `The seed is fixed (${SAFFIRE_MODEL_SEED}), so the replay is reproducible. The band is the model's own spread over ${SAFFIRE_ENSEMBLE_SEEDS.length} seeds, not experimental or parameter uncertainty.`,
        "The model describes the pyrolysis-front advance along the flow for SIBAL under these trial conditions. It is not a universal SAFFIRE model and is not transferable to other materials, orientations or geometries.",
        "The model and its parameters are unchanged (src/saffire.ts, simulateFromObservedFront); this view only draws its states.",
      ]}
      onClose={onClose}
      status={{ loading: !data && !error ? "Loading model artefact and running the fixed-seed simulation…" : undefined, error }}
    >
      {data && <ModelReplay model={data} />}
    </ExperimentalReplay>
  );
}

function ModelReplay({ model }: { model: SaffireModel }) {
  const steps = useMemo(() => simulateFromObservedFront(model, SAFFIRE_MODEL_SEED), [model]);
  const ensemble = useMemo(() => frontEnsemble(model, [...SAFFIRE_ENSEMBLE_SEEDS]), [model]);
  const measured: Trajectory = model.observedTrajectory ?? [];
  const stepTimes = useMemo(() => steps.map((_, i) => i * model.stepSeconds), [steps, model]);
  const simulated = useMemo(() => steps.map((s) => frontMedianMm(model, s.grid)), [steps, model]);
  const clock = useReplayClock({ start: 0, end: model.durationSeconds, stops: stepTimes, speeds: SPEEDS, initialSpeed: 10 });
  const i = Math.max(0, lastIndexAtOrBefore(stepTimes, clock.time));
  const measuredIndex = lastIndexAtOrBefore(
    measured.map((m) => m.timeS),
    stepTimes[i],
  );
  const measuredNow = measuredIndex >= 0 && measured[measuredIndex].timeS === stepTimes[i] ? measured[measuredIndex].frontMedianMm : null;
  const split = model.diagnostics?.splitTimeS ?? null;
  const blocked = steps.slice(0, i + 1).reduce((sum, s) => sum + s.blocked, 0);

  return (
    <div className="rp-body">
      <section className="rp-stage" aria-label="Model grid of SAFFIRE I sample S1">
        <GridView model={model} grid={steps[i].grid} simulatedMm={simulated[i]} measuredMm={measuredNow} />
        <ul className="rp-legend">
          <LegendItem swatch="sm-sw-intact">Model state: intact cell</LegendItem>
          <LegendItem swatch="sm-sw-reached">Model state: front reached</LegendItem>
          <LegendItem swatch="sm-sw-hidden">Row outside the camera view (no state)</LegendItem>
          <LegendItem swatch="sm-sw-sim">Simulated median front (model)</LegendItem>
          <LegendItem swatch="sm-sw-meas">Measured median front from the camera images (observation)</LegendItem>
        </ul>
      </section>
      <ReplayControls
        clock={clock}
        timeLabel="Seconds from the start of the analysed window"
        formatTime={(t) => `${fmt(t)} s`}
        stepUnit="model step (2 s)"
        speedNote="Speed scales trial time; the model only has states every 2 s and each is held until the next step."
        segments={split != null ? [{ start: 0, end: split, label: "Fitting period (in-sample)", tone: "fit" }, { start: split, end: model.durationSeconds, label: "Held-out period (same trial)", tone: "holdout" }] : []}
      />
      <div className="rp-panels">
        <dl className="rp-readout">
          <div>
            <dt>Model step</dt>
            <dd className="mono">
              {i} · {fmt(stepTimes[i])} s
            </dd>
          </div>
          <div>
            <dt>Simulated median front</dt>
            <dd className="mono">{simulated[i] == null ? "—" : `${fmt(simulated[i]!)} mm`}</dd>
          </div>
          <div>
            <dt>Measured median front</dt>
            <dd className="mono">{measuredNow == null ? "—" : `${fmt(measuredNow)} mm`}</dd>
          </div>
          <div>
            <dt>Period</dt>
            <dd>{split == null ? "—" : stepTimes[i] < split ? "fitting (in-sample)" : "held-out (same trial)"}</dd>
          </div>
          <div>
            <dt>Suspended transitions so far</dt>
            <dd className="mono">{blocked}</dd>
          </div>
        </dl>
        <div className="rp-panel rp-wide">
          <h4>Median front over time: measured (dashed) and simulated run, with the model's own spread</h4>
          <FrontChart model={model} measured={measured} simulated={simulated} stepTimes={stepTimes} ensemble={ensemble} time={stepTimes[i]} split={split} />
        </div>
        <p className="rp-note rp-wide">
          Published check of this artefact on the held-out period: mean position error {fmt(model.validation.positionMaeMm, 1)} mm; speed{" "}
          {fmt(model.validation.observedSpeedMmS, 2)} mm/s in the images vs {fmt(model.validation.simulatedSpeedMmS, 2)} mm/s simulated. Probability per
          step {fmt(model.probability * 100, 1)} % ({model.train.transitions} transitions in {model.train.exposures} exposures).
        </p>
      </div>
    </div>
  );
}

function GridView({ model, grid, simulatedMm, measuredMm }: { model: SaffireModel; grid: Grid; simulatedMm: number | null; measuredMm: number | null }) {
  const { lengthMm, widthMm, dxMm, dyMm } = model.grid;
  return (
    <div className="rp-scroll">
      <svg className="rp-svg sm-grid" viewBox={`-10 -34 ${lengthMm + 20} ${widthMm + 62}`} role="img" aria-label="Model cell states over the sample">
        <rect className="sm-board" x={0} y={0} width={lengthMm} height={widthMm} />
        {grid.map((row, y) => {
          const runs: { start: number; end: number; state: number | null }[] = [];
          row.forEach((state, x) => {
            const last = runs[runs.length - 1];
            if (last && last.state === state) last.end = x + 1;
            else runs.push({ start: x, end: x + 1, state });
          });
          const top = y * dyMm;
          const h = Math.min(widthMm, (y + 1) * dyMm) - top;
          return runs.map((run) => (
            <rect
              key={`${y}-${run.start}`}
              className={run.state === null ? "sm-hidden" : run.state === 1 ? "sm-reached" : "sm-intact"}
              x={run.start * dxMm}
              y={top}
              width={Math.min(lengthMm, run.end * dxMm) - run.start * dxMm}
              height={h}
            />
          ));
        })}
        {simulatedMm != null && <line className="sm-sim" x1={simulatedMm} x2={simulatedMm} y1={-8} y2={widthMm + 8} />}
        {measuredMm != null && <line className="sm-meas" x1={measuredMm} x2={measuredMm} y1={-14} y2={widthMm + 14} />}
        <text className="sm-label" x={0} y={-16}>
          flow →
        </text>
        <text className="sm-label" x={lengthMm} y={widthMm + 24} textAnchor="end">
          {lengthMm} mm × {widthMm} mm · cells {dxMm} × {dyMm} mm
        </text>
      </svg>
    </div>
  );
}

function FrontChart({
  model,
  measured,
  simulated,
  stepTimes,
  ensemble,
  time,
  split,
}: {
  model: SaffireModel;
  measured: Trajectory;
  simulated: (number | null)[];
  stepTimes: number[];
  ensemble: { timeS: number; min: number; max: number }[];
  time: number;
  split: number | null;
}) {
  const W = 640;
  const H = 210;
  const M = { left: 48, right: 12, top: 12, bottom: 30 };
  const sx = (t: number) => M.left + (t / model.durationSeconds) * (W - M.left - M.right);
  const sy = (mm: number) => H - M.bottom - (mm / model.grid.lengthMm) * (H - M.top - M.bottom);
  const path = (points: [number, number | null][]) => {
    let d = "";
    let pen = false;
    for (const [t, v] of points) {
      if (v == null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${sx(t).toFixed(1)},${sy(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const band = `${ensemble.map((e, k) => `${k ? "L" : "M"}${sx(e.timeS).toFixed(1)},${sy(e.max).toFixed(1)}`).join("")}${[...ensemble]
    .reverse()
    .map((e) => `L${sx(e.timeS).toFixed(1)},${sy(e.min).toFixed(1)}`)
    .join("")}Z`;
  return (
    <div className="rp-scroll">
      <svg className="rp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Median front over time: measured, simulated run and model spread">
        {[0, 200, 400, 600, 800].map((mm) => (
          <g key={mm}>
            <line className="rp-grid" x1={M.left} x2={W - M.right} y1={sy(mm)} y2={sy(mm)} />
            <text className="rp-tick" x={M.left - 6} y={sy(mm) + 3} textAnchor="end">
              {mm}
            </text>
          </g>
        ))}
        {[0, 100, 200, 300].map((t) => (
          <text key={t} className="rp-tick" x={sx(t)} y={H - M.bottom + 14} textAnchor="middle">
            {t} s
          </text>
        ))}
        {split != null && (
          <>
            <line className="rp-split" x1={sx(split)} x2={sx(split)} y1={M.top} y2={H - M.bottom} />
            <text className="rp-tick" x={sx(split) - 4} y={M.top + 8} textAnchor="end">
              fitting (in-sample)
            </text>
            <text className="rp-tick" x={sx(split) + 4} y={M.top + 8}>
              held-out
            </text>
          </>
        )}
        <path className="sm-band" d={band} />
        <path className="sm-sim-line" d={path(stepTimes.map((t, k) => [t, simulated[k]]))} />
        <path className="sm-meas-line" d={path(measured.map((m) => [m.timeS, m.frontMedianMm]))} />
        <line className="rp-cursor" x1={sx(time)} x2={sx(time)} y1={M.top} y2={H - M.bottom} />
        <text className="rp-tick" x={M.left} y={H - 4}>
          median front (mm) vs time · band: model spread over {SAFFIRE_ENSEMBLE_SEEDS.length} seeds
        </text>
      </svg>
    </div>
  );
}
