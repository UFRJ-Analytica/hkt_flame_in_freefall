import type { WsTrial } from "./workspace";

export const SERIES_COLORS = ["#f4a467", "#5de6e3", "#b39bff", "#8ec9ac", "#f08aa4", "#e6cf8c", "#7fb2ff", "#c9c9c9", "#ff8c5a"];
const ORIGIN_LABEL: Record<string, string> = {
  "relative-validation-window-start": "t = 0 no início da janela de validação",
  "published-figure-clock": "relógio da figura publicada",
};

/** Position vs time for the trials that actually carry a stored curve. Observed = solid,
 *  simulated = dashed; longitudinal-baseline curves are dotted and labelled as such. */
export function TrajectoryChart({ trials, height = 240 }: { trials: { trial: WsTrial; color: string }[]; height?: number }) {
  const series = trials.filter(({ trial }) => trial.analysis.trajectory.status === "available");
  if (!series.length) return null;
  const W = 560, H = height, L = 46, R = 12, T = 12, B = 30;
  let tMax = 1, xMax = 1;
  for (const { trial } of series) for (const p of trial.analysis.trajectory.points) {
    tMax = Math.max(tMax, p.timeS);
    xMax = Math.max(xMax, p.observedMm, p.simulatedMm ?? 0);
  }
  tMax = Math.ceil(tMax / 20) * 20; xMax = Math.ceil(xMax / 100) * 100;
  const x = (t: number) => L + (t / tMax) * (W - L - R);
  const y = (v: number) => T + (1 - v / xMax) * (H - T - B);
  const path = (pts: [number, number][]) => pts.map(([a, b], i) => `${i ? "L" : "M"}${x(a).toFixed(1)},${y(b).toFixed(1)}`).join("");
  const ticks = (max: number, n: number) => Array.from({ length: n + 1 }, (_, i) => (max * i) / n);
  return (
    <figure className="traj-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Posição da frente em mm ao longo do tempo para ${series.length} ensaios`}>
        {ticks(xMax, 4).map((v) => <g key={`y${v}`}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="tc-grid" /><text x={L - 6} y={y(v) + 3} textAnchor="end" className="tc-tick">{v}</text></g>)}
        {ticks(tMax, 5).map((v) => <text key={`x${v}`} x={x(v)} y={H - 10} textAnchor="middle" className="tc-tick">{v} s</text>)}
        <text x={10} y={T + 6} className="tc-tick" transform={`rotate(-90 10 ${T + 6})`} textAnchor="end">mm</text>
        {series.map(({ trial, color }) => {
          const tr = trial.analysis.trajectory;
          const baseline = tr.relationToRegisteredModel === "baseline-not-registered-model";
          const obs = tr.points.map((p) => [p.timeS, p.observedMm] as [number, number]);
          const sim = tr.points.filter((p) => p.simulatedMm !== null).map((p) => [p.timeS, p.simulatedMm as number] as [number, number]);
          return (
            <g key={trial.id}>
              <path d={path(obs)} fill="none" stroke={color} strokeWidth={1.8} />
              {sim.length > 1 && <path d={path(sim)} fill="none" stroke={color} strokeWidth={1.4} strokeDasharray={baseline ? "1.5 3" : "5 3"} opacity={0.85} />}
            </g>
          );
        })}
      </svg>
      <figcaption>
        {series.map(({ trial, color }) => {
          const tr = trial.analysis.trajectory;
          return (
            <span key={trial.id}>
              <i style={{ background: color }} />{trial.campaign} · {trial.sample}
              <small>{tr.relationToRegisteredModel === "baseline-not-registered-model" ? "simulado = baseline longitudinal (não é o modelo por vizinhança)" : "simulado = mesmo modelo do registro"} · {ORIGIN_LABEL[tr.timeOrigin ?? ""] ?? tr.timeOrigin}</small>
            </span>
          );
        })}
        <em>Linha cheia: observado · tracejada: modelo · pontilhada: baseline longitudinal. As séries têm origens de tempo próprias; sobreposição não alinha eventos físicos.</em>
      </figcaption>
    </figure>
  );
}
