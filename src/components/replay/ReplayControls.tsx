import { Pause, Play, RotateCcw, SkipBack, SkipForward } from "lucide-react";
import type { ReplayClock } from "./useReplayClock";
import { ReplayTimeline, type TimelineMarker, type TimelineSegment } from "./ReplayTimeline";

const speedLabel = (value: number) => `${value < 1 ? value.toString().replace(/^0/, "") : value}×`;

/**
 * Shared transport for every replay: play/pause, step to the previous/next recorded sample, restart,
 * playback speed and the experiment-time timeline. The renderer decides what a "sample" is.
 */
export function ReplayControls({
  clock,
  timeLabel,
  formatTime,
  stepUnit,
  markers,
  segments,
  speedNote,
}: {
  clock: ReplayClock;
  /** What the clock measures, e.g. "Experiment time from frame 332 (s)". */
  timeLabel: string;
  formatTime: (t: number) => string;
  /** What one step moves to, e.g. "frame", "image", "model step", "event". */
  stepUnit: string;
  markers?: TimelineMarker[];
  segments?: TimelineSegment[];
  /** Optional note on what speed means for this replay (e.g. video playback rate). */
  speedNote?: string;
}) {
  return (
    <div className="rp-controls">
      <div className="rp-buttons">
        <button className="button secondary small" onClick={clock.toggle} aria-label={clock.playing ? "Pause replay" : "Play replay"}>
          {clock.playing ? <Pause size={14} /> : <Play size={14} />}
          <span>{clock.playing ? "Pause" : "Play"}</span>
        </button>
        <button className="button secondary small rp-icon-button" onClick={clock.stepBack} aria-label={`Previous ${stepUnit}`} title={`Previous ${stepUnit}`}>
          <SkipBack size={14} />
        </button>
        <button className="button secondary small rp-icon-button" onClick={clock.stepForward} aria-label={`Next ${stepUnit}`} title={`Next ${stepUnit}`}>
          <SkipForward size={14} />
        </button>
        <button className="button secondary small rp-icon-button" onClick={clock.restart} aria-label="Restart replay" title="Restart">
          <RotateCcw size={14} />
        </button>
        <div className="rp-speed" role="group" aria-label="Playback speed">
          {clock.speeds.map((value) => (
            <button
              key={value}
              className={`chip ${clock.speed === value ? "active" : ""}`}
              aria-pressed={clock.speed === value}
              onClick={() => clock.setSpeed(value)}
            >
              {speedLabel(value)}
            </button>
          ))}
        </div>
        <output className="rp-clock mono" aria-live="off">
          {formatTime(clock.time)}
        </output>
      </div>
      <ReplayTimeline
        time={clock.time}
        start={clock.start}
        end={clock.end}
        step="any"
        label={timeLabel}
        valueText={formatTime(clock.time)}
        markers={markers}
        segments={segments}
        onSeek={clock.seek}
      />
      <div className="rp-timeline-labels">
        <span>{formatTime(clock.start)}</span>
        <span className="rp-time-label">{timeLabel}</span>
        <span>{formatTime(clock.end)}</span>
      </div>
      {(speedNote || clock.reducedMotion) && (
        <p className="rp-speed-note">
          {speedNote}
          {clock.reducedMotion && " Reduced motion is on: playback advances in discrete steps."}
        </p>
      )}
    </div>
  );
}
