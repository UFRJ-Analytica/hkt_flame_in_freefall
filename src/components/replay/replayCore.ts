// Pure playback helpers shared by every experimental replay. Import-free so Node tests load it directly.
//
// Scientific rule: a replay shows the last recorded sample at or before the playback time. It never
// creates intermediate measurements (no interpolation between samples), and a missing sample stays
// missing. Each module keeps its own renderer and its own interpretation of the data.

/** What the viewer is looking at. Shared controls never imply a shared physical model. */
export type ReplayNature =
  | "experimental-images"
  | "experimental-video"
  | "video-derived"
  | "measurement-sequence"
  | "computational-model"
  | "illustrative"
  | "published-static";

export const NATURE: Record<ReplayNature, { label: string; description: string }> = {
  "experimental-images": {
    label: "Experimental images",
    description: "Original flight camera frames, unmodified, in their recorded order.",
  },
  "experimental-video": {
    label: "Experimental video",
    description: "Public NASA video file, played as published.",
  },
  "video-derived": {
    label: "Data measured from video",
    description: "Positions or statistics extracted frame by frame from a flight video.",
  },
  "measurement-sequence": {
    label: "Measurement sequence",
    description: "Recorded instrument windows in their measured order; values are window summaries.",
  },
  "computational-model": {
    label: "Computational simulation",
    description: "Output of a stochastic model fitted to one trial. Not an observed flame.",
  },
  illustrative: {
    label: "Illustrative",
    description: "Visual aid only; carries no measured or modelled value.",
  },
  "published-static": {
    label: "Published values · static",
    description: "Published tables without a time series; shown as tables and charts, not animated.",
  },
};

/** True when every time is finite and strictly greater than the previous one. */
export function isStrictlyIncreasing(times: readonly number[]): boolean {
  return times.every((t, i) => Number.isFinite(t) && (i === 0 || t > times[i - 1]));
}

/** Index of the last time <= t, or -1 when t is before the first time. Binary search; times strictly increasing. */
export function lastIndexAtOrBefore(times: readonly number[], t: number): number {
  if (!times.length || t < times[0]) return -1;
  let lo = 0;
  let hi = times.length - 1;
  if (t >= times[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** The recorded sample shown at time t: the last sample at or before t. Never interpolated; null stays null. */
export function sampleAt<T>(times: readonly number[], values: readonly (T | null)[], t: number): T | null {
  const i = lastIndexAtOrBefore(times, t);
  return i < 0 ? null : (values[i] ?? null);
}

/** Next recorded time strictly after t (or the last time). Used by "step forward". */
export function nextStop(stops: readonly number[], t: number, epsilon = 1e-9): number {
  for (const stop of stops) if (stop > t + epsilon) return stop;
  return stops.length ? stops[stops.length - 1] : t;
}

/** Previous recorded time strictly before t (or the first time). Used by "step back". */
export function previousStop(stops: readonly number[], t: number, epsilon = 1e-9): number {
  for (let i = stops.length - 1; i >= 0; i -= 1) if (stops[i] < t - epsilon) return stops[i];
  return stops.length ? stops[0] : t;
}

/** Playback clock: experiment time advances by wall time × speed and stops at the end. */
export function advanceTime(t: number, elapsedMs: number, speed: number, end: number): number {
  return Math.min(end, t + (Math.max(0, elapsedMs) / 1000) * speed);
}

/** Clamp a requested time into the replay window. */
export function clampTime(t: number, start: number, end: number): number {
  return Math.min(end, Math.max(start, t));
}

/** Fraction of the window elapsed, for progress bars. */
export function progressOf(t: number, start: number, end: number): number {
  return end > start ? clampTime((t - start) / (end - start), 0, 1) : 0;
}
