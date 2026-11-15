import type { CSSProperties } from "react";
import { progressOf } from "./replayCore";

export interface TimelineMarker {
  t: number;
  label: string;
  /** Visual class only (e.g. "event", "telemetry", "window"). */
  tone?: string;
}
export interface TimelineSegment {
  start: number;
  end: number;
  label: string;
  tone?: string;
}

/** Range input over experiment time, with recorded events and segments drawn on its track. */
export function ReplayTimeline({
  time,
  start,
  end,
  step,
  label,
  valueText,
  markers = [],
  segments = [],
  onSeek,
}: {
  time: number;
  start: number;
  end: number;
  step: number | "any";
  label: string;
  valueText: string;
  markers?: TimelineMarker[];
  segments?: TimelineSegment[];
  onSeek: (t: number) => void;
}) {
  const pct = (t: number) => `${progressOf(t, start, end) * 100}%`;
  return (
    <div className="rp-timeline">
      <div className="rp-track" aria-hidden="true">
        {segments.map((s) => (
          <span
            key={`${s.label}-${s.start}`}
            className={`rp-segment rp-tone-${s.tone ?? "window"}`}
            style={{ left: pct(s.start), width: `calc(${pct(s.end)} - ${pct(s.start)})` }}
            title={s.label}
          />
        ))}
        {markers.map((m) => (
          <span key={`${m.label}-${m.t}`} className={`rp-marker rp-tone-${m.tone ?? "event"}`} style={{ left: pct(m.t) }} title={m.label} />
        ))}
      </div>
      <input
        type="range"
        className="rp-range"
        min={start}
        max={end}
        step={step}
        value={time}
        aria-label={label}
        aria-valuetext={valueText}
        style={{ "--range-progress": pct(time) } as CSSProperties}
        onChange={(event) => onSeek(Number(event.target.value))}
      />
    </div>
  );
}
