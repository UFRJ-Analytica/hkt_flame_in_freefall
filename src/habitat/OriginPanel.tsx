import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Beaker, Box, Database, X } from "lucide-react";
import { englishText } from "../i18n/english";
import { useReplayData } from "../components/replay/useReplayData";
import { readRegistry } from "./trials";
import { findOriginTrial, originalFramePath, pieceSummary, safeEvidenceUrl, type OriginPiece } from "./originEvidence";
import { OriginSampleReplay } from "./OriginSampleReplay";
import "./origin.css";

export interface OriginPanelProps {
  anchorTrialId: string;
  piece: OriginPiece;
  onClose: () => void;
}

const fmt = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 3 });
const read = (value: unknown) => {
  const registry = readRegistry(value);
  if (!registry) throw new Error("Invalid trial registry.");
  return registry;
};

/** Integration: mount only while open; this component owns its dialog and CSS.
 * Observations remain distinct from the habitat's runtime calibration target.
 * The compact replay identifies its SAFFIRE I S1 foundation explicitly. */
export function OriginPanel({ anchorTrialId, piece, onClose }: OriginPanelProps) {
  const titleId = useId();
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Panel-scoped trap excludes links hidden inside closed disclosures. The shared
  // hook is intentionally untouched because another agent owns the application.
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
    ) ?? []).filter((node) => {
      const closed = node.closest("details:not([open])");
      return node.tabIndex >= 0 && node.getClientRects().length > 0 &&
        (!closed || node === closed.querySelector(":scope > summary"));
    });
    focusables()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab") return;
      const nodes = focusables(), first = nodes[0], last = nodes[nodes.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); previous?.focus(); };
  }, []);
  const { data, error } = useReplayData("data/saffire/trial-registry.json", read, "The trial registry");
  const trial = findOriginTrial(data, anchorTrialId);
  const framePath = trial ? originalFramePath(trial.id) : null;
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const frame = framePath && failedImage !== framePath ? `${import.meta.env.BASE_URL}${framePath}` : null;
  const sources = trial?.conditionSources.flatMap((source) => {
    const url = safeEvidenceUrl(source.url);
    return url ? [{ ...source, url }] : [];
  }).filter((source, i, rows) => rows.findIndex((row) => row.url === source.url) === i) ?? [];
  const observations = trial?.observables ?? [];
  const observation = observations[0];
  const observationUrl = safeEvidenceUrl(observation?.source?.url);
  const oxygen = trial?.conditions.oxygenRangePct?.map(fmt).join("–") ??
    (trial?.conditions.oxygenPct != null ? fmt(trial.conditions.oxygenPct) : null);
  const sampleSize = trial?.geometry.lengthMm && trial.geometry.widthMm ?
    `${fmt(trial.geometry.lengthMm / 1000)} × ${fmt(trial.geometry.widthMm / 1000)} m` : null;
  const knownPiece = [piece.lengthMm, piece.widthMm].every((n) => Number.isFinite(n) && n > 0);
  const pieceLength = knownPiece ? piece.lengthMm : 1200;
  const pieceWidth = knownPiece ? piece.widthMm : 400;

  return <div className="origin-backdrop" onClick={onClose}>
    <section ref={dialog} className="origin-panel" role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
      <header className="origin-heading">
        <div><span className="origin-eyebrow">FROM NASA DATA TO YOUR DESIGN</span><h2 id={titleId}>Model &amp; evidence</h2>
          <p>One traceable path from a measured trial to your configured piece.</p></div>
        <button type="button" className="origin-close" aria-label="Close Model & evidence" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="origin-steps">
        <section className="origin-card">
          <div className="origin-step"><span>01</span><Database size={17} /><ArrowRight size={16} className="origin-arrow" /></div>
          <h3>Observed</h3><span className="origin-badge">{trial ? "NASA experiment" : "Reference lookup"}</span>
          <h4>{trial ? `${trial.campaign} · ${trial.sample}` : anchorTrialId}</h4>
          {trial ? <>
            {frame && <img className="origin-original" src={frame} alt={`${trial.campaign} sample ${trial.sample}, original NASA camera frame`} onError={() => setFailedImage(framePath)} />}
            <dl className="origin-facts">
              <div><dt>Material</dt><dd>{englishText(trial.material)}{trial.thicknessMm != null ? ` · ${fmt(trial.thicknessMm)} mm` : ""}</dd></div>
              {sampleSize && <div><dt>Sample</dt><dd>{sampleSize}</dd></div>}
              {oxygen && <div><dt>Oxygen</dt><dd>{oxygen}% O₂</dd></div>}
              {trial.conditions.pressureKpa != null && <div><dt>Pressure</dt><dd>{fmt(trial.conditions.pressureKpa)} kPa</dd></div>}
              {trial.conditions.flowCmS != null && <div><dt>Flow</dt><dd>{fmt(trial.conditions.flowCmS)} cm/s · {trial.conditions.flowDirection}</dd></div>}
              <div><dt>Gravity</dt><dd>{trial.conditions.gravity}</dd></div>
            </dl>
            {observations.map((item, index) => <p className="origin-rate" key={`${item.kind}-${index}`} title={englishText(item.window)}>
              <strong>{fmt(item.speedMmS)} <small>mm/s</small></strong>
              <span>{item.artifact?.includes("crosstrial") ? "Char front · camera 1 cross-trial window" : observations.length > 1 && item.kind === "char-front" ? "Char front · two-camera held-out window" : ({ "char-front": "Measured char front", "flame-base": "Published flame base", "published-rate": "Published spread rate" })[item.kind]}</span>
            </p>)}
            {observationUrl && <a className="origin-source" href={observationUrl} target="_blank" rel="noreferrer">Open experimental source <ArrowUpRight size={13} /></a>}
          </> : <p className="origin-status" role="status">{error ? "Trial details could not load. The reference replay and piece remain available." : !data ? "Loading trial details…" : "This reference is not listed in the local registry. Explore the reference replay and your piece below."}</p>}
        </section>
        <section className="origin-card origin-model-card">
          <div className="origin-step"><span>02</span><Beaker size={17} /><ArrowRight size={16} className="origin-arrow" /></div>
          <h3>Model on the original sample</h3><span className="origin-badge">Computational replay</span>
          <h4>SAFFIRE I · S1</h4>
          <OriginSampleReplay />
          {trial && trial.id !== "SAFFIRE-I-S1" && <p className="origin-caption">Spatial rule: SAFFIRE I · selected trial: {trial.campaign} {trial.sample}.</p>}
        </section>
        <section className="origin-card">
          <div className="origin-step"><span>03</span><Box size={17} /></div>
          <h3>Applied to your piece</h3><span className="origin-badge origin-exploratory">Exploratory application</span>
          <div className="origin-piece-stage" aria-hidden="true"><span>YOUR PIECE</span>
            <svg className="origin-piece" viewBox={`0 0 ${pieceLength} ${pieceWidth}`} preserveAspectRatio="xMidYMid meet">
              <rect width={pieceLength} height={pieceWidth} fill="#343831" stroke="#c6b896" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <h4>{pieceSummary(piece)}</h4>
          <p className="origin-caption">{sampleSize ? `Reference sample ${sampleSize}` : "Reference dimensions follow the selected trial"}{trial ? ` · ${englishText(trial.material)}` : ""}{trial?.thicknessMm != null ? ` · ${fmt(trial.thicknessMm)} mm` : ""}.</p>
          <p className="origin-caption">The habitat applies the spatial rule to the configured fuel area and imposed ignition.</p>
        </section>
      </div>
      <details className="origin-assumptions"><summary tabIndex={0}>Assumptions &amp; sources</summary>
        <ul>
          <li>Thickness follows the reference sample; it is not an independently fitted control.</li>
          <li>The trial-derived spatial rule is applied to the configured geometry; the habitat run is exploratory.</li>
          <li>Ignition is imposed at your chosen location, not predicted.</li>
          <li>O₂, pressure and gravity inform the reference and applicability; they are not independent physical corrections.</li>
        </ul>
        {observations.length > 0 && <div className="origin-observation-sources"><h4>Recorded observations</h4>{observations.map((item, index) => <p key={index}><strong>{fmt(item.speedMmS)} mm/s</strong> · {englishText(item.window)}{item.artifact && <> · <code>{item.artifact}</code></>}</p>)}
          <p>These are distinct observed windows, not interchangeable calibration targets. The habitat’s model panel identifies the rate used for its current run.</p></div>}
        {trial?.model?.artifact && <p>Model artifact: <code>{trial.model.artifact}</code>{trial.model.artifactSha256 && <> · SHA-256 <code>{trial.model.artifactSha256}</code></>}</p>}
        {sources.length > 0 && <ul className="origin-source-list">{sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{englishText(source.label)} <ArrowUpRight size={12} /></a></li>)}</ul>}
      </details>
    </section>
  </div>;
}
