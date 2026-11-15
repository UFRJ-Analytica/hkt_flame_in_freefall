import { useMemo, useState } from "react";
import { ExperimentalReplay, LegendItem } from "../replay/ExperimentalReplay";
import { ReplayControls } from "../replay/ReplayControls";
import { useReplayClock } from "../replay/useReplayClock";
import { useReplayData } from "../replay/useReplayData";
import { isStrictlyIncreasing } from "../replay/replayCore";

/* ------------------------------------------------------------------ contract (same-sequence.json) */
type Role = "primary" | "secondary" | "additional" | "no-smoke";
interface ChannelStats {
  median: number;
  min: number;
  max: number;
  n: number;
  deltaFromBaseline?: number;
  clippedAtRail?: boolean;
  powered?: boolean | null;
}
interface SameWindow {
  index: number;
  role: Role;
  roleLabel: string;
  smoke: boolean;
  start_s: number;
  end_s: number;
  samples: number;
  plateau: { start_s: number; end_s: number; samples: number } | null;
  channels: Record<string, ChannelStats | null>;
  flags: Record<string, Record<string, unknown>>;
  dusttrakRatioBoverA: number | null;
  dusttrakRatioNote: string | null;
  ageAtPlateauStart_s: number | null;
}
interface SameTest {
  test: number;
  sampleId: string;
  material: string;
  heating: string;
  gmtDay: number;
  recordStart: string;
  recordEnd: string;
  duration_s: number;
  rows: number;
  sampleHeating: {
    start_s: number;
    end_s: number;
    samples: number;
    continuousAt1Hz: boolean;
    definition: string;
    RtOverR0: number | null;
    lfeFlowMedian_sccm: number | null;
  } | null;
  baseline: { samples: number; values: Record<string, number | null>; definition: string };
  windows: SameWindow[];
}
interface SameSequence {
  schemaVersion: 1;
  kind: "measurement-sequence";
  title: string;
  channels: { key: string; label: string; unit: string; column: string }[];
  definitions: Record<string, string>;
  notes: string[];
  tests: SameTest[];
}

function read(value: unknown): SameSequence {
  const d = value as SameSequence;
  const ok =
    d?.schemaVersion === 1 &&
    d.kind === "measurement-sequence" &&
    Array.isArray(d.tests) &&
    d.tests.length > 0 &&
    d.tests.every(
      (t) =>
        isStrictlyIncreasing(t.windows.map((w) => w.start_s)) &&
        t.windows.every((w) => w.start_s >= 0 && w.end_s <= t.duration_s && w.start_s < w.end_s) &&
        t.windows.every((w) => !w.plateau || (w.plateau.start_s >= w.start_s && w.plateau.end_s <= w.end_s)),
    );
  if (!ok) throw new Error("The SAME sequence file does not match the expected contract.");
  return d;
}

const fmt = (v: number, digits = 0) => v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const value = (v: number) => (Math.abs(v) >= 100 ? fmt(v, 0) : Math.abs(v) >= 10 ? fmt(v, 1) : fmt(v, 3));
const SPEEDS = [10, 30, 60, 120];
const DETECTORS = ["ionA", "ionB", "issScatter", "issObscuration", "sts"];

export default function SameSequenceReplay({ onClose }: { onClose: () => void }) {
  const { data, error } = useReplayData("data/same/same-sequence.json", read, "The SAME sequence file");
  const [testId, setTestId] = useState<number | null>(null);
  const test = data ? (data.tests.find((t) => t.test === testId) ?? data.tests[0]) : null;
  return (
    <ExperimentalReplay
      id="ss"
      eyebrow="NASA SAME · PSI-102 · ISS EXPEDITION 15 (2007) · RECORDED MEASUREMENT WINDOWS"
      title="SAME — Smoke Generation and Detection Evidence"
      natures={["measurement-sequence"]}
      caption="The measured sequence of each test: sample heating, solenoid sampling windows and per-instrument plateau medians. Not a smoke simulation."
      quantity="Window boundaries and plateau medians per instrument"
      unit="Instrument units: pt/cc (P-Trak), mg/m³ (DustTrak), V (uncalibrated detector volts)"
      timeReference="Seconds from the first sample of the housekeeping record (1 Hz); GMT clock of the record shown"
      notices={[
        ...(data?.notes ?? []),
        "The timeline walks the recorded window boundaries; no value exists between them and none is drawn.",
        "Detector volts differ in principle and calibration: they are compared side by side, never on a common scale.",
      ]}
      onClose={onClose}
      status={{ loading: !data && !error ? "Loading SAME sequence…" : undefined, error }}
    >
      {data && test && (
        <>
          <div className="rp-chips" role="group" aria-label="SAME test">
            {data.tests.map((t) => (
              <button key={t.test} className={`chip ${t.test === test.test ? "active" : ""}`} aria-pressed={t.test === test.test} onClick={() => setTestId(t.test)}>
                T{t.test} · {t.material.split(" (")[0]}
                {t.heating === "Reheat" ? " · reheat" : ""}
              </button>
            ))}
          </div>
          <Sequence key={test.test} data={data} test={test} />
        </>
      )}
    </ExperimentalReplay>
  );
}

function Sequence({ data, test }: { data: SameSequence; test: SameTest }) {
  const stops = useMemo(() => {
    const all = new Set<number>([0, test.duration_s]);
    if (test.sampleHeating) all.add(test.sampleHeating.start_s).add(test.sampleHeating.end_s);
    for (const w of test.windows) {
      all.add(w.start_s).add(w.end_s);
      if (w.plateau) all.add(w.plateau.start_s).add(w.plateau.end_s);
    }
    return [...all].sort((a, b) => a - b);
  }, [test]);
  const clock = useReplayClock({ start: 0, end: test.duration_s, stops, speeds: SPEEDS, initialSpeed: 30 });
  const t = clock.time;
  const open = test.windows.find((w) => t >= w.start_s && t <= w.end_s) ?? null;
  const done = test.windows.filter((w) => w.plateau && t >= w.plateau.end_s);
  const shown = open && open.plateau && t >= open.plateau.end_s ? open : (done[done.length - 1] ?? null);
  const h = test.sampleHeating;
  const inHeatingSpan = !!h && t >= h.start_s && t <= h.end_s;
  // Only a span proven continuous (one sample per second) can be called "heating in progress".
  const heating = inHeatingSpan && h!.continuousAt1Hz;
  const phase = [
    heating ? "sample heating in progress" : null,
    inHeatingSpan && !heating ? `between the first and last heating samples (${h!.samples} samples, not continuous)` : null,
    open ? `window ${open.index} open (${open.roleLabel})${open.plateau && t >= open.plateau.start_s && t <= open.plateau.end_s ? ", within its plateau span" : ""}` : null,
    !open && test.windows[0] && t < test.windows[0].start_s ? `before window 1 (the baseline is the ${test.baseline.samples} samples just before it)` : null,
    !open && !heating && test.windows[0] && t >= test.windows[0].start_s ? "between sampling windows" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rp-body">
      <section className="rp-stage" aria-label={`Measured sequence of SAME test ${test.test}`}>
        <SequenceLanes test={test} time={t} />
        <ul className="rp-legend">
          <LegendItem swatch="ss-sw-heat">Sample heating (HeatingInProgress = 1, continuous at 1 Hz)</LegendItem>
          {h && !h.continuousAt1Hz && (
            <LegendItem swatch="ss-sw-heat-gap">
              First and last heating samples only: {h.samples} samples over {fmt(h.end_s - h.start_s + 1)} s, so heating was not continuous; the samples in
              between are not located in the derived file
            </LegendItem>
          )}
          <LegendItem swatch="ss-sw-window">Sampling window (solenoid open)</LegendItem>
          <LegendItem swatch="ss-sw-nosmoke">Window without smoke</LegendItem>
          <LegendItem swatch="ss-sw-plateau">Plateau span ({data.definitions.plateau})</LegendItem>
        </ul>
        <p className="rp-footnote">
          Record {test.recordStart} → {test.recordEnd} GMT · {test.rows} samples · {test.material} · sample {test.sampleId} · {test.heating.toLowerCase()} heating
          {test.sampleHeating?.RtOverR0 != null && ` · heater Rt/R0 ${fmt(test.sampleHeating.RtOverR0, 2)} (control quantity, not a temperature)`}
        </p>
      </section>
      <ReplayControls
        clock={clock}
        timeLabel="Seconds from the start of the housekeeping record"
        formatTime={(s) => `${fmt(s)} s`}
        stepUnit="recorded boundary"
        speedNote="Speed scales record time; values change only at recorded window boundaries."
        segments={[
          ...(h && h.continuousAt1Hz ? [{ start: h.start_s, end: h.end_s, label: "Sample heating", tone: "heat" }] : []),
          ...test.windows.map((w) => ({ start: w.start_s, end: w.end_s, label: `Window ${w.index} · ${w.roleLabel}`, tone: w.smoke ? "window" : "muted" })),
        ]}
        markers={[
          ...test.windows.filter((w) => w.plateau).map((w) => ({ t: w.plateau!.end_s, label: `Window ${w.index} plateau ends`, tone: "event" })),
          ...(h && !h.continuousAt1Hz
            ? [
                { t: h.start_s, label: "First heating sample", tone: "heat" },
                { t: h.end_s, label: "Last heating sample", tone: "heat" },
              ]
            : []),
        ]}
      />
      <p className="rp-phase" aria-live="polite">
        <strong>{fmt(t)} s:</strong> {phase || "record running"}
      </p>
      <div className="rp-panels">
        <div className="rp-panel rp-wide">
          <h4>Plateau medians by window (revealed when each plateau ends)</h4>
          <div className="table-scroll">
            <table className="rp-table">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Unit</th>
                  {test.windows.map((w) => (
                    <th key={w.index} className={open?.index === w.index ? "rp-current" : ""}>
                      W{w.index} · {w.role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.channels.map((c) => (
                  <tr key={c.key}>
                    <td>{c.label}</td>
                    <td className="mono">{c.unit}</td>
                    {test.windows.map((w) => (
                      <td key={w.index} className={`mono ${open?.index === w.index ? "rp-current" : ""}`}>
                        <Cell window={w} channel={c.key} time={t} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rp-panel">
          <h4>Detector responses {shown ? `· window ${shown.index}` : ""}</h4>
          {shown ? (
            <div className="rp-table-scroll">
              <table className="rp-table">
                <thead>
                  <tr>
                    <th>Detector</th>
                    <th>Δ from baseline (V)</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {DETECTORS.map((key) => {
                    const s = shown.channels[key];
                    const label = data.channels.find((c) => c.key === key)?.label ?? key;
                    return (
                      <tr key={key}>
                        <td>{label}</td>
                        <td className="mono">{s?.deltaFromBaseline != null ? value(s.deltaFromBaseline) : "—"}</td>
                        <td className="rp-small">
                          {s == null ? "no valid samples" : s.clippedAtRail ? "clipped at the rail" : s.powered === false ? "detector not powered" : ""}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rp-note">No plateau has ended yet at this time.</p>
          )}
          {shown?.dusttrakRatioBoverA != null && (
            <p className="rp-note">
              DustTrak B/A ratio of the plateau medians: {fmt(shown.dusttrakRatioBoverA, 2)} (factory scales){shown.dusttrakRatioNote ? `; ${shown.dusttrakRatioNote}` : ""}.
            </p>
          )}
          {shown?.ageAtPlateauStart_s != null && (
            <p className="rp-note">
              Time from the end of heating to the plateau start: {fmt(shown.ageAtPlateauStart_s)} s (an upper bound on smoke age at the instruments).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({ window: w, channel, time }: { window: SameWindow; channel: string; time: number }) {
  if (!w.plateau) return <span className="rp-missing">{time >= w.end_s ? "no plateau (no smoke)" : "—"}</span>;
  if (time < w.plateau.end_s) return <span className="rp-pending">{time >= w.start_s ? "plateau pending" : "—"}</span>;
  const s = w.channels[channel];
  if (!s) return <span className="rp-missing">not available</span>;
  return (
    <span title={`median of ${s.n} samples; min ${value(s.min)}, max ${value(s.max)}`}>
      {value(s.median)} <small>n={s.n}</small>
      {s.clippedAtRail && <small> · clipped</small>}
    </span>
  );
}

function SequenceLanes({ test, time }: { test: SameTest; time: number }) {
  const W = 640;
  const H = 120;
  const M = { left: 116, right: 12 };
  const sx = (s: number) => M.left + (s / test.duration_s) * (W - M.left - M.right);
  const lanes = [
    { y: 14, label: "Sample heating" },
    { y: 46, label: "Sampling windows" },
    { y: 78, label: "Plateau spans" },
  ];
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round((test.duration_s * f) / 10) * 10);
  return (
    <div className="rp-scroll">
      <svg className="rp-svg ss-lanes" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Recorded heating period, sampling windows and plateau spans">
        {lanes.map((lane) => (
          <g key={lane.label}>
            <text className="rp-tick" x={M.left - 8} y={lane.y + 13} textAnchor="end">
              {lane.label}
            </text>
            <line className="rp-grid" x1={M.left} x2={W - M.right} y1={lane.y + 9} y2={lane.y + 9} />
          </g>
        ))}
        {test.sampleHeating &&
          (test.sampleHeating.continuousAt1Hz ? (
            <rect className="ss-heat" x={sx(test.sampleHeating.start_s)} y={lanes[0].y} width={Math.max(1.5, sx(test.sampleHeating.end_s) - sx(test.sampleHeating.start_s))} height={18} rx={2} />
          ) : (
            <g className="ss-heat-gap">
              <line x1={sx(test.sampleHeating.start_s)} x2={sx(test.sampleHeating.end_s)} y1={lanes[0].y + 9} y2={lanes[0].y + 9} />
              <rect x={sx(test.sampleHeating.start_s) - 1.5} y={lanes[0].y} width={3} height={18} />
              <rect x={sx(test.sampleHeating.end_s) - 1.5} y={lanes[0].y} width={3} height={18} />
            </g>
          ))}
        {test.windows.map((w) => (
          <g key={w.index}>
            <rect className={w.smoke ? "ss-window" : "ss-nosmoke"} x={sx(w.start_s)} y={lanes[1].y} width={Math.max(1.5, sx(w.end_s) - sx(w.start_s))} height={18} rx={2} />
            <text className="ss-wlabel" x={sx(w.start_s) + 3} y={lanes[1].y + 13}>
              W{w.index}
            </text>
            {w.plateau && (
              <rect className="ss-plateau" x={sx(w.plateau.start_s)} y={lanes[2].y} width={Math.max(1.5, sx(w.plateau.end_s) - sx(w.plateau.start_s))} height={18} rx={2} />
            )}
          </g>
        ))}
        {ticks.map((s) => (
          <text key={s} className="rp-tick" x={sx(s)} y={H - 4} textAnchor="middle">
            {s} s
          </text>
        ))}
        <line className="rp-cursor" x1={sx(time)} x2={sx(time)} y1={6} y2={H - 16} />
      </svg>
    </div>
  );
}
