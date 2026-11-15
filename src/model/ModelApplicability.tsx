import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpRight, CheckCircle2, CircleSlash, FlaskConical } from "lucide-react";
import {
  assessSaffireS1, PARTIAL_GRAVITY_SOURCES, rankComparables, readModelingTargets,
  type Criterion, type ModelingTargets, type Scenario, type Status, type TargetRecord,
} from "./domain";
import { englishText } from "../i18n/english";
import "./model.css";

const STATUS_TITLE: Record<Status, string> = {
  ok: "Within the measured domain",
  warn: "Near the domain, with caveats",
  out: "Outside the measured domain",
};
const STATUS_ICON = { ok: CheckCircle2, warn: AlertTriangle, out: CircleSlash };
const OUTCOME_CLASS: Record<string, string> = { sustained: "sustained", "no-sustained": "none", anchored: "anchored", "not-ignited": "none" };
const num = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });

function useModelingTargets() {
  const [targets, setTargets] = useState<ModelingTargets | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const request = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/modeling-targets.json`, { signal: request.signal })
      .then((response) => { if (!response.ok) throw new Error("Modeling targets unavailable."); return response.json(); })
      .then((value) => setTargets(readModelingTargets(value)))
      .catch((reason: unknown) => { if (!request.signal.aborted) setError(reason instanceof Error ? englishText(reason.message) : "Error loading data."); });
    return () => request.abort();
  }, []);
  return { targets, error };
}

export function ModelApplicability({ scenario, surfaceName, onOpenModel }: {
  scenario: Scenario;
  surfaceName: string;
  onOpenModel: () => void;
}) {
  const { targets, error } = useModelingTargets();
  const assessment = assessSaffireS1(scenario);
  const comparables = useMemo(() => targets ? rankComparables(targets.records, scenario).slice(0, 5) : [], [targets, scenario]);
  const Icon = STATUS_ICON[assessment.status];
  const partialGravity = scenario.gravityG >= 0.01;
  return (
    <section className="applicability-panel" aria-label="Calibrated model applicability">
      <header className="applicability-head">
        <div>
          <span className="eyebrow">PREDICTION FOR THIS SCENARIO</span>
          <h2 className={`status-${assessment.status}`}><Icon size={15} /> {STATUS_TITLE[assessment.status]}</h2>
          <p>
            Available calibrated model: <strong>front advance · SAFFIRE I S1</strong>. Compared with {englishText(surfaceName).toLowerCase()} in {englishText(scenario.material)}.
          </p>
        </div>
        <button className="button secondary" onClick={onOpenModel}>
          {assessment.status === "out" ? "View the reference trial" : "Open the model"} <ArrowRight size={14} />
        </button>
      </header>

      <ul className="criteria">
        {assessment.criteria.map((criterion) => <CriterionRow key={criterion.id} criterion={criterion} />)}
      </ul>

      {partialGravity && (
        <div className="gravity-callout" role="note">
          <AlertTriangle size={15} />
          <div>
            <strong>No partial-gravity trial is available in PSI.</strong>
            <p>
              At 1/6 g, buoyancy again induces flow, but without the <em>blowoff</em> seen at 1 g. Centrifuge tests and
              parabolic flights (LUCI) indicate that some materials burn with less O₂ in lunar gravity than on Earth; SIBAL fabric
              burns downward at 1/6 g and extinguishes at 1 g. Centrifuge tests (ICES-2025-392) show that the effect depends on the material: materials with higher pyrolysis temperatures may become less flammable. FM² will measure on the lunar surface. Neither µg nor 1 g is a universal conservative bound.
            </p>
            <span className="gravity-links">
              <a href={PARTIAL_GRAVITY_SOURCES.fm2} target="_blank" rel="noreferrer">FM² · NASA Glenn <ArrowUpRight size={11} /></a>
              <a href={PARTIAL_GRAVITY_SOURCES.luci} target="_blank" rel="noreferrer">LUCI · NTRS <ArrowUpRight size={11} /></a>
            </span>
          </div>
        </div>
      )}

      <div className="comparables-head">
        <h3><FlaskConical size={14} /> Nearest measured trials</h3>
        {targets && (
          <span className="comparables-actions">
            <a className="text-link subtle" href={`${import.meta.env.BASE_URL}data/modeling-targets.json`} download="habitatfire-modeling-targets.json">
              <ArrowDownToLine size={12} /> JSON
            </a>
            <button className="text-link subtle" onClick={() => downloadCsv(targets.records)}><ArrowDownToLine size={12} /> CSV</button>
          </span>
        )}
      </div>
      {error && <p className="model-muted">{error}</p>}
      {!targets && !error && <p className="model-muted">Loading modeling targets…</p>}
      <ol className="comparables">
        {comparables.map(({ record, mismatches }) => (
          <li key={record.id}>
            <details>
              <summary>
                <span className="cmp-id">{record.campaign} · {record.sample}</span>
                <span className="cmp-material">{englishText(record.materialDetail)}{record.thicknessMm ? ` · ${num(record.thicknessMm, 2)} mm` : ""}</span>
                <span className="cmp-conditions">
                  {record.flowCmS} cm/s {record.flowDirection === "concurrent" ? "concurrent" : "opposed"} ·{" "}
                  {record.oxygenPct ? `${record.oxygenApproximate ? "~" : ""}${num(record.oxygenPct[0])}${record.oxygenPct[1] !== record.oxygenPct[0] ? `–${num(record.oxygenPct[1])}` : ""}% O₂` : "O₂ not tabulated"} · µg
                </span>
                <span className="cmp-result">
                  {record.outcome
                    ? <span className={`outcome ${OUTCOME_CLASS[record.outcome]}`}>{englishText(targets?.outcomeLabels[record.outcome] ?? record.outcome)}</span>
                    : <span className="outcome unknown">Outcome not tabulated</span>}
                  {record.spreadRateMmS !== null && <strong>{num(record.spreadRateMmS)} mm/s</strong>}
                </span>
                {mismatches.length > 0 && <span className="cmp-chips">{mismatches.map((m) => <i key={m}>{m}</i>)}</span>}
              </summary>
              <div className="cmp-detail">
                {record.notes.map((note) => <p key={note}>{englishText(note)}</p>)}
                {record.spreadRateSource && <p>Rate: {englishText(record.spreadRateSource.label)}.</p>}
                {record.onegComparison?.burnLength && (
                  <p>Same material at 1 g: burned length "{englishText(record.onegComparison.burnLength)}", rate "{englishText(record.onegComparison.spreadRate ?? "—")}".</p>
                )}
                <p className="cmp-source">
                  {record.source.file}, row {record.source.row} · frames {record.framesStatus === "processed" ? "processed" : record.framesStatus === "available" ? "available, not processed" : "not published in PSI"} ·{" "}
                  <a href={record.source.url} target="_blank" rel="noreferrer">{record.investigation} <ArrowUpRight size={10} /></a>
                </p>
              </div>
            </details>
          </li>
        ))}
      </ol>
      {targets && <p className="model-caption">{targets.limits.map(englishText).join(" ")}</p>}
    </section>
  );
}

function CriterionRow({ criterion }: { criterion: Criterion }) {
  const Icon = STATUS_ICON[criterion.status];
  return (
    <li className={`criterion ${criterion.status}`}>
      <Icon size={13} aria-label={STATUS_TITLE[criterion.status]} />
      <span className="crit-label">{criterion.label}</span>
      <span className="crit-values"><strong>{englishText(criterion.scenario)}</strong> <small>trial: {criterion.domain}</small></span>
      <span className="crit-note">{criterion.note}</span>
    </li>
  );
}

function downloadCsv(records: TargetRecord[]) {
  const columns = ["id", "campaign", "sample", "material", "materialDetail", "thicknessMm", "lengthMm", "widthMm", "flowCmS",
    "flowDirection", "oxygenMinPct", "oxygenMaxPct", "ignitionPowerW", "ignitionDurationS", "burnTimeS", "outcome",
    "spreadRateMmS", "burnLengthMm", "gravity", "sourceFile", "sourceRow", "sourceSha256", "notes"];
  const quote = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = records.map((r) => [r.id, r.campaign, r.sample, r.material, r.materialDetail, r.thicknessMm, r.lengthMm, r.widthMm,
    r.flowCmS, r.flowDirection, r.oxygenPct?.[0], r.oxygenPct?.[1], r.ignition?.powerW, r.ignition?.durationS, r.burnTimeS,
    r.outcome, r.spreadRateMmS, r.burnLengthMm, "microgravity", r.source.file, r.source.row, r.source.sha256, r.notes.join(" | ")]
    .map(quote).join(","));
  const url = URL.createObjectURL(new Blob([[columns.join(","), ...rows].join("\n")], { type: "text/csv" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "habitatfire-modeling-targets.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
