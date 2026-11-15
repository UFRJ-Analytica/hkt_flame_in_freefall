import { useEffect, useMemo, useState } from "react";
import { englishText } from "../../i18n/english";
import { readSaffireIIReplay, SAFFIRE_II_CASES, type SaffireIIReplay } from "../../saffire";
import { ExperimentalReplay } from "../replay/ExperimentalReplay";
import { ReplayControls } from "../replay/ReplayControls";
import { useReplayClock } from "../replay/useReplayClock";
import { useReplayData } from "../replay/useReplayData";
import { lastIndexAtOrBefore } from "../replay/replayCore";
import { SAFFIRE_II_FRAME_SAMPLES } from "../replay/replayCatalog";

const SPEEDS = [1, 2, 5, 10, 30];
const fmt = (v: number, digits = 1) => v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export default function SaffireImageReplay({ onClose }: { onClose: () => void }) {
  const [sample, setSample] = useState(SAFFIRE_II_FRAME_SAMPLES[0]);
  const path = `data/saffire/psi-99-ii${sample}-replay.json`;
  const { data, error } = useReplayData(path, (value) => readSaffireIIReplay(value, sample), "The SAFFIRE II frame sequence");
  const ready = data && data.experimentId === `PSI-99:t0:r${sample + 1}` ? data : null;
  return (
    <ExperimentalReplay
      id="si"
      eyebrow="NASA SAFFIRE II · PSI-99 · ORIGINAL CAMERA FRAMES"
      title="SAFFIRE II — Experimental Image Replay"
      natures={["experimental-images"]}
      caption="Original flight camera frames (JPEG Mapped) shown unmodified in their recorded order; no model output is drawn."
      quantity="Camera frame of the selected sample"
      unit="— (images; no spatial scale or colour processing applied)"
      timeReference="Seconds since the first archived frame of the camera, from the archive timestamps"
      notices={[
        "The frames are a curated selection already published in the project (10–15 per sample), not continuous video: each was chosen among the archived frames within ±0.55 s of a target time, preferring visible glow (scripts/build_saffire_ii_replays.py).",
        "Each frame stays on screen until the next recorded one. Nothing is blended or interpolated between frames.",
        "Images are shown as stored. No front position, scale or temperature is derived from them here.",
        "This is observation only. The stochastic model of SAFFIRE is a separate replay, labelled as a computational simulation.",
      ]}
      onClose={onClose}
      status={{ loading: !ready && !error ? "Loading frame sequence…" : undefined, error }}
    >
      <div className="rp-chips" role="group" aria-label="SAFFIRE II sample">
        {SAFFIRE_II_FRAME_SAMPLES.map((n) => (
          <button key={n} className={`chip ${n === sample ? "active" : ""}`} aria-pressed={n === sample} onClick={() => setSample(n)}>
            II-{n}
          </button>
        ))}
      </div>
      {ready && <Frames key={sample} replay={ready} sample={sample} />}
    </ExperimentalReplay>
  );
}

function Frames({ replay, sample }: { replay: SaffireIIReplay & { frameCountInArchives?: number }; sample: number }) {
  const times = useMemo(() => replay.frames.map((f) => f.timeSeconds), [replay]);
  const clock = useReplayClock({ start: 0, end: replay.durationSeconds, stops: times, speeds: SPEEDS, initialSpeed: 5, initialTime: times[0] });
  const index = lastIndexAtOrBefore(times, clock.time);
  const frame = index >= 0 ? replay.frames[index] : null;
  const url = (p: string) => `${import.meta.env.BASE_URL}data/saffire/${p}`;
  const meta = SAFFIRE_II_CASES.find((c) => c.sample === sample);
  // Fetch only the next image ahead of time; the sequence is never downloaded in bulk.
  useEffect(() => {
    const next = replay.frames[index + 1];
    if (next) new Image().src = url(next.path);
  }, [index, replay]);

  return (
    <div className="rp-body">
      <section className="rp-stage si-stage" aria-label={`SAFFIRE II sample ${sample}, camera ${replay.camera}`}>
        {frame ? (
          <img className="si-frame" src={url(frame.path)} alt={`SAFFIRE II-${sample}, camera ${replay.camera}, frame recorded at ${fmt(frame.timeSeconds, 3)} s`} />
        ) : (
          <p className="rp-missing si-empty">No frame was selected before {fmt(times[0], 2)} s.</p>
        )}
        <p className="rp-footnote">
          Frame {index + 1} of {replay.frames.length} published
          {replay.frameCountInArchives ? ` (of ${replay.frameCountInArchives.toLocaleString("en-US")} frames of this camera in the archives)` : ""} ·
          camera {replay.camera} · recorded at <span className="mono">{frame ? `${fmt(frame.timeSeconds, 3)} s` : "—"}</span>
        </p>
      </section>
      <ReplayControls
        clock={clock}
        timeLabel={`Time since the first archived ${replay.camera} frame (s)`}
        formatTime={(t) => `${fmt(t)} s`}
        stepUnit="recorded frame"
        speedNote="Speed scales recorded time; a frame is held until the next recorded one."
        markers={replay.frames.map((f, i) => ({ t: f.timeSeconds, label: `Frame ${i + 1} · ${fmt(f.timeSeconds, 3)} s`, tone: "frame" }))}
      />
      {meta && (
        <dl className="rp-readout rp-readout-wide">
          <div>
            <dt>Material</dt>
            <dd>{englishText(meta.material)}</dd>
          </div>
          <div>
            <dt>Thickness</dt>
            <dd>{meta.thickness ?? "not stated"}</dd>
          </div>
          <div>
            <dt>Flow · direction</dt>
            <dd>
              {meta.flow} cm/s · {meta.direction}
            </dd>
          </div>
          <div>
            <dt>O₂</dt>
            <dd>{meta.oxygen}</dd>
          </div>
          {"outcome" in meta && meta.outcome && (
            <div className="rp-wide">
              <dt>Recorded outcome</dt>
              <dd>{englishText(meta.outcome)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
