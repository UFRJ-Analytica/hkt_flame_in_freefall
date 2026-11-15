import { useEffect, useMemo, useRef, useState } from "react";
import { Film } from "lucide-react";
import { englishDisplayData } from "../../i18n/english";
import { ExperimentalReplay, LegendItem } from "../replay/ExperimentalReplay";
import { ReplayControls } from "../replay/ReplayControls";
import { useReplayClock } from "../replay/useReplayClock";
import { useReplayData } from "../replay/useReplayData";
import { SOFIE_PUBLIC_VIDEO } from "../replay/replayCatalog";

/* ------------------------------------------------------------------ contract (gel-evidence.json → video1410C) */
type Range = [number, number];
interface SpinWindow {
  video_s: Range;
  status: string;
  peak_Hz: number | null;
  peakPower: number | null;
  threshold99: number | null;
  significant: boolean | null;
}
interface Video1410C {
  label: string;
  test: string;
  video: { title: string; origin: string; fps: number; duration_s: number; frames: number; sha256: string; overlay: string; editing: string };
  cadence: { value: number; uniqueFramesPerVideoSecond: number; note: string };
  editTransition_video_s: { value: Range };
  segments: { value: Range }[];
  method: { signal: string; window_s: number; step_s: number; permutations: number; seed: number; spinFloor_Hz: number; nyquist_videoHz: number };
  windows: { kind: "exploratory"; value: SpinWindow[]; unit: string };
  timeBase: {
    H1_realTime: { value: Range; assumes: string };
    H2_slowMotion: { value: Range; assumes: string };
    note: string;
  };
  aliasing: { value: string; note: string };
  publishedReference: { value: Range; unit: string; source: string; note: string };
  spatialScale: { value: null; reason: string };
  useAsModelParameter: false;
}

function read(value: unknown): Video1410C {
  const v = (value as { video1410C?: Video1410C })?.video1410C;
  const windows = v?.windows?.value ?? [];
  const ok =
    !!v &&
    v.windows.kind === "exploratory" &&
    windows.length > 0 &&
    windows.every((w, i) => w.video_s[0] < w.video_s[1] && (i === 0 || w.video_s[0] > windows[i - 1].video_s[0])) &&
    v.spatialScale?.value === null &&
    v.useAsModelParameter === false &&
    v.video?.sha256 === SOFIE_PUBLIC_VIDEO.sha256;
  if (!ok) throw new Error("The SoFIE-GEL 1410C analysis does not match the expected contract.");
  return englishDisplayData(v);
}

const fmt = (x: number, digits = 1) => x.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const SPEEDS = [0.5, 1, 2];

export default function SofieVideoReplay({ onClose }: { onClose: () => void }) {
  const { data, error } = useReplayData("data/sofie/gel-evidence.json", read, "The SoFIE-GEL evidence");
  return (
    <ExperimentalReplay
      id="sv"
      eyebrow="NASA SOFIE-GEL · TEST 1410C · PMMA SPHERE 4 CM · OUTSIDE PSI"
      title="SoFIE-GEL — Video / Exploratory Analysis"
      natures={["experimental-video", "video-derived"]}
      caption="Exploratory analysis — not experimentally validated. A time cursor over the spin-window frequencies computed from the public video."
      quantity="Peak frequency of each 8 s spin window of the left/right luminosity asymmetry"
      unit="Hz in video time (Nyquist 5 Hz at ~10 unique frames/s)"
      timeReference="Seconds of the public NASA video (46 s, edited outreach release)"
      notices={[
        "Effective video rate is about 10 frames/s: each source frame is repeated in 3 consecutive frames of the 30 fps MP4.",
        "Real time versus slow motion is unresolved, so video-time frequencies are not converted to a single physical frequency (two hypotheses shown, H1 and H2).",
        "No spatial scale: no ruler in the frame, and the 4 cm sphere is a 3-D body seen in projection. Nothing is converted to mm.",
        "Exploratory frequency analysis, not experimental validation. It is never used as a simulation parameter, and no 3-D flame is reconstructed.",
        "The five published extinction cases are point results without time series; they are not animated (see the SoFIE-GEL evidence module).",
      ]}
      onClose={onClose}
      status={{ loading: !data && !error ? "Loading 1410C analysis…" : undefined, error }}
    >
      {data && <Replay v={data} />}
    </ExperimentalReplay>
  );
}

function Replay({ v }: { v: Video1410C }) {
  const windows = v.windows.value.filter((w) => w.status === "analysed" && w.peak_Hz != null);
  const stops = useMemo(() => {
    const all = new Set<number>([0, v.video.duration_s, ...v.segments.flatMap((s) => s.value), ...windows.flatMap((w) => w.video_s)]);
    return [...all].sort((a, b) => a - b);
  }, [v, windows]);
  const clock = useReplayClock({ start: 0, end: v.video.duration_s, stops, speeds: SPEEDS, initialSpeed: 1 });
  const [streaming, setStreaming] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const active = windows.filter((w) => clock.time >= w.video_s[0] && clock.time <= w.video_s[1]);
  const segment = v.segments.findIndex((s) => clock.time >= s.value[0] && clock.time <= s.value[1]);
  const inEdit = clock.time >= v.editTransition_video_s.value[0] && clock.time <= v.editTransition_video_s.value[1];

  // The video follows the replay clock (same time base: video seconds). Rate 1 = as published.
  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.playbackRate = clock.speed;
    if (clock.playing) void el.play().catch(() => undefined);
    else el.pause();
  }, [clock.playing, clock.speed, streaming]);
  useEffect(() => {
    const el = video.current;
    if (el && Math.abs(el.currentTime - clock.time) > (clock.playing ? 0.35 : 0.05)) el.currentTime = clock.time;
  }, [clock.time, clock.playing, streaming]);

  return (
    <div className="rp-body">
      <section className="rp-stage sv-stage">
        {streaming ? (
          <video
            ref={video}
            className="sv-video"
            src={SOFIE_PUBLIC_VIDEO.url}
            preload="metadata"
            muted
            playsInline
            aria-label={`${v.video.title} (public NASA video, muted)`}
          />
        ) : (
          <div className="sv-placeholder">
            <p>
              The public NASA video is not stored in this project. It can be streamed from the NASA Image and Video Library (
              {fmt(SOFIE_PUBLIC_VIDEO.bytes / 1e6, 0)} MB) and then follows this timeline.
            </p>
            <button className="button secondary small" onClick={() => setStreaming(true)}>
              <Film size={14} /> Stream the public NASA video
            </button>
            <a className="text-link" href={SOFIE_PUBLIC_VIDEO.page} target="_blank" rel="noreferrer">
              NASA page of the video
            </a>
          </div>
        )}
        <p className="rp-footnote">
          {v.video.editing}. {v.video.overlay}. {streaming && "Muted: the release carries a music soundtrack."}
        </p>
      </section>
      <ReplayControls
        clock={clock}
        timeLabel="Video time (s)"
        formatTime={(t) => `${fmt(t)} s`}
        stepUnit="window boundary"
        speedNote={clock.speed === 1 ? "1× = the video as published." : `${clock.speed}× alters the published playback rate.`}
        segments={[
          ...v.segments.map((s, i) => ({ start: s.value[0], end: s.value[1], label: i === 0 ? "Before the edit (not analysed)" : "Analysed segment", tone: i === 0 ? "muted" : "window" })),
          { start: v.editTransition_video_s.value[0], end: v.editTransition_video_s.value[1], label: "Edit transition", tone: "edit" },
        ]}
      />
      <div className="rp-panels">
        <div className="rp-panel rp-wide">
          <h4>{v.label}</h4>
          <SpinChart v={v} windows={windows} time={clock.time} />
          <ul className="rp-legend">
            <LegendItem swatch="sv-sw-sig">Window with significant periodicity (permutation test, 99%)</LegendItem>
            <LegendItem swatch="sv-sw-ns">Window without significant periodicity</LegendItem>
            <LegendItem swatch="sv-sw-active">Windows containing the cursor</LegendItem>
          </ul>
        </div>
        <div className="rp-panel">
          <h4>At {fmt(clock.time)} s of video</h4>
          <p className="rp-note">
            {inEdit ? "Edit transition between the two segments." : segment === 0 ? "First segment, before the edit: not analysed." : segment === 1 ? "Analysed segment." : "Outside the analysed segments."}
          </p>
          {active.length ? (
            <div className="rp-table-scroll">
              <table className="rp-table">
                <thead>
                  <tr>
                    <th>Window (video s)</th>
                    <th>Peak (video Hz)</th>
                    <th>Significant</th>
                    <th>H1 · real time</th>
                    <th>H2 · slow motion 3×</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((w) => (
                    <tr key={w.video_s[0]}>
                      <td className="mono">
                        {fmt(w.video_s[0])}–{fmt(w.video_s[1])}
                      </td>
                      <td className="mono">{fmt(w.peak_Hz!, 3)}</td>
                      <td>{w.significant ? "yes" : "no"}</td>
                      <td className="mono">{fmt(w.peak_Hz!, 3)} Hz</td>
                      <td className="mono">{fmt(w.peak_Hz! * 3, 3)} Hz</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rp-note">No analysed window contains this time.</p>
          )}
          <details className="rp-details">
            <summary tabIndex={0}>Time-base hypotheses and interpretation</summary>
            <p className="rp-note">
              H1 assumes {v.timeBase.H1_realTime.assumes}; H2 assumes {v.timeBase.H2_slowMotion.assumes}. Both are hypotheses. {v.timeBase.note}
            </p>
            <p className="rp-note">
              <strong>Published spin range (physical):</strong> {fmt(v.publishedReference.value[0])}–{fmt(v.publishedReference.value[1])} {v.publishedReference.unit}, kept beside the
              analysis and never drawn on the video-time axis. {v.publishedReference.source}.
            </p>
            <p className="rp-note">{v.aliasing.value}</p>
          </details>
        </div>
      </div>
    </div>
  );
}

function SpinChart({ v, windows, time }: { v: Video1410C; windows: SpinWindow[]; time: number }) {
  const W = 620;
  const H = 200;
  const M = { left: 40, right: 12, top: 12, bottom: 30 };
  const maxHz = v.method.nyquist_videoHz;
  const sx = (t: number) => M.left + (t / v.video.duration_s) * (W - M.left - M.right);
  const sy = (hz: number) => H - M.bottom - (hz / maxHz) * (H - M.top - M.bottom);
  return (
    <div className="rp-scroll">
      <svg className="rp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Peak frequency of each spin window over video time">
        <rect className="sv-muted" x={sx(v.segments[0].value[0])} y={M.top} width={sx(v.segments[0].value[1]) - sx(v.segments[0].value[0])} height={H - M.top - M.bottom} />
        {[0, 1, 2, 3, 4, 5].map((hz) => (
          <g key={hz}>
            <line className="rp-grid" x1={M.left} x2={W - M.right} y1={sy(hz)} y2={sy(hz)} />
            <text className="rp-tick" x={M.left - 6} y={sy(hz) + 3} textAnchor="end">
              {hz}
            </text>
          </g>
        ))}
        {[0, 10, 20, 30, 40].map((t) => (
          <text key={t} className="rp-tick" x={sx(t)} y={H - M.bottom + 14} textAnchor="middle">
            {t} s
          </text>
        ))}
        {windows.map((w) => {
          const on = time >= w.video_s[0] && time <= w.video_s[1];
          return (
            <g key={w.video_s[0]} className={`sv-window ${w.significant ? "sv-sig" : "sv-ns"} ${on ? "sv-on" : ""}`}>
              <title>{`${fmt(w.video_s[0])}–${fmt(w.video_s[1])} s: ${fmt(w.peak_Hz!, 3)} Hz${w.significant ? "" : " (not significant)"}`}</title>
              <line x1={sx(w.video_s[0])} x2={sx(w.video_s[1])} y1={sy(w.peak_Hz!)} y2={sy(w.peak_Hz!)} />
              <circle cx={sx((w.video_s[0] + w.video_s[1]) / 2)} cy={sy(w.peak_Hz!)} r={3} />
            </g>
          );
        })}
        <line className="rp-cursor" x1={sx(time)} x2={sx(time)} y1={M.top} y2={H - M.bottom} />
        <text className="rp-tick" x={M.left} y={H - 4}>
          peak frequency (video Hz) vs video time · up to the 5 Hz Nyquist limit
        </text>
      </svg>
    </div>
  );
}
