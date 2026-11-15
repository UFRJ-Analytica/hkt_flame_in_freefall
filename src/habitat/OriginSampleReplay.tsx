import { useMemo } from "react";
import { frontMedianMm, readSaffireModel, simulateFromObservedFront, type SaffireModel } from "../saffire";
import { ReplayControls } from "../components/replay/ReplayControls";
import { useReplayClock } from "../components/replay/useReplayClock";
import { useReplayData } from "../components/replay/useReplayData";
import { lastIndexAtOrBefore } from "../components/replay/replayCore";
import { SAFFIRE_MODEL_SEED } from "../components/replay/replayCatalog";
import "../components/replay/replay.css";

const SPEEDS = [1, 10, 30];

/** Compact view of the original replay's exact simulation function and artifact.
 * No habitat parameters are passed to this reference replay. */
export function OriginSampleReplay() {
  const { data, error } = useReplayData("data/saffire/psi-98-s1-neighbors.json", readSaffireModel, "The reference model");
  if (error) return <p className="origin-status" role="status">Reference replay could not load. The source links remain available.</p>;
  return data ? <Sample model={data} /> : <p className="origin-status" role="status">Loading reference replay…</p>;
}

function Sample({ model }: { model: SaffireModel }) {
  const steps = useMemo(() => simulateFromObservedFront(model, SAFFIRE_MODEL_SEED), [model]);
  const times = useMemo(() => steps.map((_, i) => i * model.stepSeconds), [model, steps]);
  const clock = useReplayClock({ start: 0, end: model.durationSeconds, stops: times, speeds: SPEEDS, initialSpeed: 10 });
  const index = Math.max(0, lastIndexAtOrBefore(times, clock.time));
  const grid = steps[index].grid;
  const simulated = frontMedianMm(model, grid);
  const measured = model.observedTrajectory?.find((point) => point.timeS === times[index])?.frontMedianMm;

  return <div className="origin-replay">
    <svg className="origin-sample-grid" viewBox={`0 0 ${model.grid.lengthMm} ${model.grid.widthMm}`}
      role="img" aria-label={`SAFFIRE I S1 model state at ${times[index]} seconds; amber cells show the reached front; dashed white line is the measured median front.`}>
      {grid.map((row, y) => row.map((cell, x) => <rect key={`${y}-${x}`} x={x * 10} y={y * 20} width={Math.min(10, model.grid.lengthMm - x * 10) - 1} height={Math.min(20, model.grid.widthMm - y * 20) - 1}
        fill={cell === null ? "#111822" : cell === 1 ? "#d99a55" : "#314553"} />))}
      {measured != null && <line x1={measured} x2={measured} y1={0} y2={model.grid.widthMm} stroke="#e9f4f8" strokeWidth={3} strokeDasharray="8 5" />}
    </svg>
    <p className="origin-legend"><span><i />Model cells</span><span><i className="origin-measured" />Measured median</span></p>
    <ReplayControls clock={clock} timeLabel="Reference trial time" formatTime={(t) => `${Math.floor(t)} s`} stepUnit="model step" />
    <p className="origin-readout">Front: <strong>{simulated == null ? "—" : `${simulated.toLocaleString("en-US")} mm`}</strong> · sample 0.94 × 0.406 m</p>
  </div>;
}
