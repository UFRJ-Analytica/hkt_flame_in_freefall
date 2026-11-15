import { useCallback, useEffect, useRef, useState } from "react";
import { advanceTime, clampTime, nextStop, previousStop } from "./replayCore";

/** Discrete update interval used when the viewer asked the system to reduce motion. */
const REDUCED_MOTION_TICK_MS = 500;

export function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia?.(query).matches === true);
  useEffect(() => {
    const media = window.matchMedia?.(query);
    if (!media) return;
    const update = () => setReduced(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export interface ReplayClock {
  time: number;
  start: number;
  end: number;
  playing: boolean;
  speed: number;
  speeds: readonly number[];
  reducedMotion: boolean;
  toggle: () => void;
  pause: () => void;
  seek: (t: number) => void;
  stepForward: () => void;
  stepBack: () => void;
  restart: () => void;
  setSpeed: (speed: number) => void;
}

/**
 * Experiment-time clock for a replay. Playback never starts by itself. `stops` are the recorded
 * sample times: stepping moves between them, so a step never lands on an invented sample.
 * With reduced motion the clock still advances, but in discrete jumps instead of a smooth sweep.
 */
export function useReplayClock({
  start,
  end,
  stops,
  speeds,
  initialTime,
  initialSpeed,
}: {
  start: number;
  end: number;
  stops: readonly number[];
  speeds: readonly number[];
  initialTime?: number;
  initialSpeed?: number;
}): ReplayClock {
  const reducedMotion = usePrefersReducedMotion();
  const [time, setTime] = useState(() => clampTime(initialTime ?? start, start, end));
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(initialSpeed ?? speeds[0] ?? 1);
  const timeRef = useRef(time);
  timeRef.current = time;

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    let pending = 0;
    const tick = (now: number) => {
      const elapsed = now - last;
      last = now;
      pending += elapsed;
      if (!reducedMotion || pending >= REDUCED_MOTION_TICK_MS) {
        const next = advanceTime(timeRef.current, pending, speed, end);
        pending = 0;
        timeRef.current = next;
        setTime(next);
        if (next >= end) {
          setPlaying(false);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, end, reducedMotion]);

  const seek = useCallback(
    (t: number) => {
      setPlaying(false);
      setTime(clampTime(t, start, end));
    },
    [start, end],
  );
  const toggle = useCallback(() => {
    if (!playing && timeRef.current >= end) setTime(start);
    setPlaying((value) => !value);
  }, [playing, start, end]);

  return {
    time,
    start,
    end,
    playing,
    speed,
    speeds,
    reducedMotion,
    toggle,
    pause: () => setPlaying(false),
    seek,
    stepForward: () => seek(nextStop(stops, timeRef.current)),
    stepBack: () => seek(previousStop(stops, timeRef.current)),
    restart: () => seek(start),
    setSpeed,
  };
}
