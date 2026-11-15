import { englishText } from "../i18n/english";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Crosshair, HelpCircle } from "lucide-react";
import {
  compareToTrial, LEVEL_LABEL, OBSERVABLE_LABEL, rankTrials,
  type AnchorKernel, type RunLevel, type Trial,
} from "./trials";

const num = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });
const DIFF_ICON = { match: CheckCircle2, untabulated: HelpCircle, differs: AlertTriangle };
const DIFF_TEXT = { match: "within tolerance", untabulated: "not tabulated in trial", differs: "differs: extrapolation" };

/** Which model is computing, from which trial, and how far the scenario is from it. Observed,
 *  trial-conditioned simulation and scenario result are shown as three separate levels. */
export function ModelInUse({ anchor, level, diffs, kernel, flowRule, scenarioSpeed, onRunTrial }: {
  anchor: Trial; level: RunLevel; diffs: ReturnType<typeof compareToTrial>; kernel: AnchorKernel | undefined;
  flowRule: string; scenarioSpeed: number | null; onRunTrial: () => void;
}) {
  const c = anchor.conditions;
  const assumed = diffs.filter((d) => d.status === "untabulated").map((d) => d.label);
  const sources = [...new Map(anchor.conditionSources.map((s) => [s.label, s])).values()];
  return (
    <section className="model-in-use">
      <span className="eyebrow">MODEL IN USE</span>
      <h3>{anchor.campaign} · {anchor.sample} <small>{englishText(anchor.material)}</small></h3>
      <p className="anchor-conditions">
        {c.oxygenPct !== null ? `${num(c.oxygenPct)}% O₂` : "O₂ not tabulated"} · {c.pressureKpa !== null ? `${num(c.pressureKpa)} kPa` : "pressure not tabulated"} ·{" "}
        {c.flowCmS} cm/s {c.flowDirection === "concurrent" ? "concurrent" : "opposed"} · microgravity
      </p>
      <div className="anchor-sources">
        {sources.map((s) => s.url
          ? <a key={englishText(s.label)} href={s.url} target="_blank" rel="noreferrer">{englishText(s.label)} <ArrowUpRight size={10} /></a>
          : <span key={englishText(s.label)}>{englishText(s.label)}</span>)}
      </div>

      <ol className="levels">
        <li className="lvl observed">
          <span className="lvl-n">1</span>
          <div>
            <strong>Observed in trial</strong>
            {anchor.observables.map((o) => (
              <p key={`${o.kind}-${englishText(o.window)}`}><b>{num(o.speedMmS, 2)} mm/s</b> · {OBSERVABLE_LABEL[o.kind]} · {englishText(o.window)}
                {o.source.url && <> · <a href={o.source.url} target="_blank" rel="noreferrer">{englishText(o.source.label)}</a></>}</p>
            ))}
          </div>
        </li>
        <li className="lvl conditioned">
          <span className="lvl-n">2</span>
          <div>
            <strong>Simulated on the test specimen · conditioned on the trial</strong>
            {kernel
              ? <p><b>{num(kernel.simulatedAtTrialMmS, 2)} mm/s</b> on the test specimen · target {num(kernel.target.speedMmS, 2)} mm/s ({OBSERVABLE_LABEL[kernel.target.kind].toLowerCase()})</p>
              : <p>Calibrating the kernel…</p>}
            {kernel?.target.kind === "flame-base" && <p className="lvl-note">The kernel propagates reached cells; fitting it to the flame-base rate assumes steady state (base and pyrolysis front advancing together). This is not the same observation as the char front in trials I and III.</p>}
            {kernel && kernel.borrowed.length > 0 && <p className="lvl-note">Information borrowed from another trial: {kernel.borrowed.map(englishText).join(", ")}.</p>}
            {kernel && <p className="lvl-note">The intensity factor was fitted to this speed; this information was used in calibration and is not an untouched test.</p>}
          </div>
        </li>
        <li className={`lvl scenario ${level}`}>
          <span className="lvl-n">3</span>
          <div>
            <strong>Your scenario · {LEVEL_LABEL[level]}</strong>
            <p><b>{scenarioSpeed !== null ? `${num(scenarioSpeed, 2)} mm/s` : "—"}</b> on the habitat wall</p>
            <p className="lvl-note">{englishText(flowRule)}</p>
            {assumed.length > 0 && <p className="lvl-note">Not tabulated in the trial (remains unknown, not attributed to the trial): {assumed.join(", ").toLowerCase()}.</p>}
          </div>
        </li>
      </ol>

      <table className="diff-table">
        <thead><tr><th>Condition</th><th>Scenario</th><th>Trial</th></tr></thead>
        <tbody>
          {diffs.map((d) => {
            const Icon = DIFF_ICON[d.status];
            return (
              <tr key={d.field} className={d.status}>
                <td><Icon size={12} aria-label={DIFF_TEXT[d.status]} /> {d.label}</td>
                <td>{englishText(d.scenario)}</td>
                <td>{englishText(d.trial)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="model-caption">A condition matches only the trial's nominal value or documented range, with no invented tolerance; untabulated conditions remain unknown. The habitat wall is never the test specimen, so the scenario is exploratory at best (acceptance criteria, section C).</p>
      {level !== "trial-conditions" && (
        <button className="button secondary trial-run" onClick={onRunTrial}><Crosshair size={13} /> Run at trial conditions</button>
      )}
    </section>
  );
}

export function TrialList({ ranked, selected, auto, onSelect, registrySource }: {
  ranked: ReturnType<typeof rankTrials>; selected: string | null; auto: boolean; onSelect: (id: string) => void; registrySource: string;
}) {
  return (
    <section className="trial-list">
      <h3 className="model-h">Compatible trials</h3>
      <ul>
        {ranked.map(({ trial, diffs }) => {
          const differing = diffs.filter((d) => d.status === "differs").map((d) => d.label);
          return (
            <li key={trial.id}>
              <button type="button" aria-pressed={trial.id === selected} onClick={() => onSelect(trial.id)}>
                <span className="tl-name">{trial.campaign} · {trial.sample} <small>{englishText(trial.material)}</small></span>
                <span className="tl-cond">
                  {trial.conditions.oxygenPct !== null ? `${num(trial.conditions.oxygenPct)}%` : "O₂ ?"} · {trial.conditions.pressureKpa !== null ? `${num(trial.conditions.pressureKpa)} kPa` : "P ?"} · {trial.conditions.flowCmS} cm/s
                </span>
                <span className={`tl-diff ${differing.length ? "warn" : "ok"}`}>{differing.length ? `differs in ${differing.join(", ")}` : "all tabulated conditions match"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="model-caption">
        {auto ? "Automatic selection: the nearest trial to the scenario. " : ""}Ranked by distance in material, O₂, pressure, and flow; distance is not probability. Registry: {englishText(registrySource)}.
      </p>
      {!auto && <button className="text-link subtle" onClick={() => onSelect("auto")}>Return to automatic selection</button>}
    </section>
  );
}
