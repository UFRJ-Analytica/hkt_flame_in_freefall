import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpFromLine, ArrowUpRight, Check, FlaskConical, GitCompareArrows, LoaderCircle, X } from "lucide-react";
import {
  buildDossier, checkDossier, dossierCsv, dossierMarkdown, pairDelta, readWorkspace,
  type ObservableKind, type Workspace, type WsTrial,
} from "./workspace";
import { SERIES_COLORS, TrajectoryChart } from "./TrajectoryChart";
import { englishText } from "../i18n/english";
import "./specialist.css";

const KIND_LABEL: Record<ObservableKind, string> = {
  "char-front": "Char front (images)", "flame-base": "Flame base", "published-rate": "Published rate",
};
const VALIDATION_LABEL: Record<string, string> = {
  "temporal-holdout-same-trial": "held-out segment of the same trial",
  "published-curve-consistency": "consistency with the published curve",
  "cross-trial": "cross-trial comparison", none: "no check",
};
const FIELD_LABEL: Record<string, string> = {
  material: "Material", thicknessMm: "Thickness", lengthMm: "Length", widthMm: "Width", oxygen: "O₂",
  pressureKpa: "Pressure", flowCmS: "Flow", flowDirection: "Direction", gravity: "Gravity",
};
const num = (n: number | null | undefined, d = 2) => n === null || n === undefined || !Number.isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d });
const o2 = (t: WsTrial) => t.conditions.oxygenRangePct ? `${num(t.conditions.oxygenRangePct[0], 1)}–${num(t.conditions.oxygenRangePct[1], 1)}%`
  : t.conditions.oxygenPct !== null ? `${num(t.conditions.oxygenPct, 1)}%` : "O₂ ?";
const cond = (v: unknown) => v === null || v === undefined ? "unknown"
  : typeof v === "object" ? (() => { const o = v as { pointPct: number | null; rangePct: [number, number] | null }; return o.rangePct ? `${num(o.rangePct[0], 1)}–${num(o.rangePct[1], 1)}%` : `${num(o.pointPct, 1)}%`; })()
  : typeof v === "number" ? num(v, 2) : englishText(String(v));

type LoadState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; ws: Workspace };

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function SpecialistWorkspace({ modeSwitch, onUseInHabitat }: { modeSwitch: ReactNode; onUseInHabitat: (trialId: string) => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const request = new AbortController();
    setState({ status: "loading" });
    fetch(`${import.meta.env.BASE_URL}data/saffire/specialist-workspace.json`, { signal: request.signal })
      .then(async (r) => {
        if (!r.ok || !r.headers.get("content-type")?.includes("json")) throw new Error(`HTTP ${r.status}: specialist-workspace.json has not been published in this environment yet.`);
        return readWorkspace(await r.json());
      })
      .then((ws) => setState({ status: "ready", ws }))
      .catch((e: unknown) => { if (!request.signal.aborted) setState({ status: "error", message: e instanceof Error ? e.message : "Failed to load." }); });
    return () => request.abort();
  }, [reloadKey]);

  return (
    <main className="specialist">
      <aside className="scenario-panel specialist-side" aria-label="Laboratory mode">
        <div className="panel-title"><FlaskConical size={15} /><h2>Specialist workspace</h2></div>
        <section className="control-section">{modeSwitch}</section>
        <section className="control-section">
          <p className="preset-note">SAFFIRE trials with conditions, sources, models, speeds, and stored curves. Comparisons are descriptive: speed differences do not isolate the effect of any one condition.</p>
        </section>
      </aside>
      <div className="specialist-main">
        {state.status === "loading" && <div className="ws-empty"><LoaderCircle size={18} className="spin" /> Loading specialist-workspace.json…</div>}
        {state.status === "error" && (
          <div className="ws-empty error" role="alert">
            <AlertTriangle size={18} />
            <div>
              <strong>Specialist workspace unavailable</strong>
              <p>{englishText(state.message)}</p>
              <p>No embedded data is substituted: the workspace only displays what the generator published (scripts/build_specialist_workspace.py).</p>
              <button className="button secondary" onClick={() => setReloadKey((k) => k + 1)}>Try again</button>
            </div>
          </div>
        )}
        {state.status === "ready" && <Bench ws={state.ws} onUseInHabitat={onUseInHabitat} />}
      </div>
    </main>
  );
}

function Bench({ ws, onUseInHabitat }: { ws: Workspace; onUseInHabitat: (id: string) => void }) {
  const [material, setMaterial] = useState("all");
  const [campaign, setCampaign] = useState("all");
  const [kind, setKind] = useState("all");
  const [curveOnly, setCurveOnly] = useState(false);
  const [review, setReview] = useState("all");
  const [detail, setDetail] = useState<string>(ws.trials[0]?.id ?? "");
  const [compare, setCompare] = useState<string[]>([]);
  const [importMsg, setImportMsg] = useState<null | { ok: boolean; lines: string[] }>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const materials = [...new Set(ws.trials.map((t) => t.material))];
  const campaigns = [...new Set(ws.trials.map((t) => t.campaign))];
  const shown = useMemo(() => ws.trials.filter((t) =>
    (material === "all" || t.material === material) && (campaign === "all" || t.campaign === campaign) &&
    (kind === "all" || t.observables[0].kind === kind) && (!curveOnly || t.analysis.trajectory.status === "available") &&
    (review === "all" || t.analysis.reviewStatus === review)), [ws, material, campaign, kind, curveOnly, review]);
  const colorOf = (id: string) => SERIES_COLORS[ws.trials.findIndex((t) => t.id === id) % SERIES_COLORS.length];
  const toggle = (id: string) => setCompare((c) => c.includes(id) ? c.filter((x) => x !== id) : [...c, id]);
  const detailTrial = ws.trials.find((t) => t.id === detail);
  const exportSel = compare.length ? compare : detail ? [detail] : [];

  async function importDossier(file: File) {
    let parsed: unknown;
    try { parsed = JSON.parse(await file.text()); } catch { setImportMsg({ ok: false, lines: ["The file is not valid JSON."] }); return; }
    const res = checkDossier(parsed, ws, __APP_COMMIT__);
    if (!res.ok) { setImportMsg({ ok: false, lines: ["Dossier rejected; nothing was changed.", ...res.errors] }); return; }
    setCompare(res.selection);
    setDetail(res.selection[0]);
    setImportMsg({ ok: res.mismatches.length === 0, lines: res.mismatches.length
      ? ["Selection restored, but with mismatches:", ...res.mismatches]
      : [`Selection restored (${res.selection.length} trials); code, registry, artifacts, and metrics match the dossier exactly.`] });
  }

  return (
    <>
      <section className="ws-head">
        <div>
          <span className="eyebrow">SAFFIRE EVIDENCE · {ws.trials.length} TRIALS</span>
          <h2>Trial gallery</h2>
          <p className="ws-provenance">Generated by {ws.generatedBy} · registry sha256 {ws.registry.sha256.slice(0, 12)}… · {ws.artifacts.length} hashed artifacts</p>
        </div>
        <div className="ws-filters" role="group" aria-label="Filters">
          <select aria-label="Material" value={material} onChange={(e) => setMaterial(e.target.value)}><option value="all">All materials</option>{materials.map((m) => <option key={m} value={m}>{englishText(m)}</option>)}</select>
          <select aria-label="Campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)}><option value="all">All campaigns</option>{campaigns.map((m) => <option key={m} value={m}>{englishText(m)}</option>)}</select>
          <select aria-label="Observable" value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">All observables</option>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select aria-label="Review" value={review} onChange={(e) => setReview(e.target.value)}><option value="all">All review statuses</option><option value="usable-with-limitations">Usable with limitations</option><option value="review-required">Under review</option></select>
          <label className="ws-check"><input type="checkbox" checked={curveOnly} onChange={(e) => setCurveOnly(e.target.checked)} /> with curve</label>
        </div>
      </section>

      {shown.length === 0 ? <div className="ws-empty">No trials match these filters.</div> : (
        <ul className="ws-gallery">
          {shown.map((t) => {
            const o = t.observables[0];
            const inCompare = compare.includes(t.id);
            return (
              <li key={t.id} className={`ws-card ${detail === t.id ? "active" : ""} ${t.analysis.reviewStatus}`}>
                <button className="ws-card-main" onClick={() => setDetail(t.id)} aria-pressed={detail === t.id}>
                  <span className="ws-card-top"><i style={{ background: colorOf(t.id) }} />{englishText(t.campaign)} · {englishText(t.sample)}
                    {t.analysis.reviewStatus === "review-required" && <b className="ws-review">under review</b>}</span>
                  <strong>{englishText(t.material)}</strong>
                  <span className="ws-card-cond">{o2(t)} · {t.conditions.pressureKpa !== null ? `${num(t.conditions.pressureKpa, 1)} kPa` : "P ?"} · {t.conditions.flowCmS} cm/s {t.conditions.flowDirection === "concurrent" ? "concurrent" : "opposed"}</span>
                  <span className="ws-card-obs">{num(o.speedMmS)} mm/s · {KIND_LABEL[o.kind]}</span>
                  <span className="ws-card-tags">
                    <em>{VALIDATION_LABEL[t.model.validation] ?? englishText(t.model.validation)}</em>
                    <em className={t.analysis.trajectory.status === "available" ? "on" : ""}>{t.analysis.trajectory.status === "available" ? "curve" : "no curve"}</em>
                    {t.analysis.capabilities.habitatAnchor && <em>habitat anchor</em>}
                  </span>
                </button>
                <label className="ws-compare-toggle">
                  <input type="checkbox" checked={inCompare} onChange={() => toggle(t.id)} aria-label={`Compare ${t.id}`} /> compare
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <div className="ws-split">
        {detailTrial && <Detail trial={detailTrial} color={colorOf(detailTrial.id)} onUseInHabitat={onUseInHabitat} />}
        <Compare ws={ws} ids={compare} colorOf={colorOf} onClear={() => setCompare([])} />
      </div>

      <section className="ws-dossier">
        <div>
          <h3>Dossier</h3>
          <p>{exportSel.length ? `${exportSel.length} trial(s): ${exportSel.join(", ")}` : "Select trials to export."} Includes conditions, sources, models, metrics, exact artifact hashes, descriptive comparisons, and limitations.</p>
        </div>
        <div className="ws-dossier-actions">
          <button className="button secondary" disabled={!exportSel.length} onClick={() => download("habitatfire-dossier.json", JSON.stringify(buildDossier(ws, exportSel, __APP_COMMIT__), null, 2), "application/json")}><ArrowDownToLine size={13} />JSON</button>
          <button className="button secondary" disabled={!exportSel.length} onClick={() => download("habitatfire-dossier.csv", dossierCsv(buildDossier(ws, exportSel, __APP_COMMIT__)), "text/csv")}><ArrowDownToLine size={13} />CSV</button>
          <button className="button secondary" disabled={!exportSel.length} onClick={() => download("habitatfire-dossier.md", dossierMarkdown(buildDossier(ws, exportSel, __APP_COMMIT__), englishText), "text/markdown")}><ArrowDownToLine size={13} />Markdown</button>
          <button className="button secondary" onClick={() => fileRef.current?.click()}><ArrowUpFromLine size={13} />Import dossier</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importDossier(f); e.target.value = ""; }} />
        </div>
        {importMsg && (
          <div className={`ws-import ${importMsg.ok ? "ok" : "warn"}`} role="status">
            {importMsg.ok ? <Check size={14} /> : <AlertTriangle size={14} />}
            <ul>{importMsg.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            <button aria-label="Close" onClick={() => setImportMsg(null)}><X size={13} /></button>
          </div>
        )}
      </section>

      <section className="ws-limits">
        <h3>Dataset limitations</h3>
        <ul>{ws.limitations.map((l) => <li key={l}>{englishText(l)}</li>)}</ul>
      </section>
    </>
  );
}

function Detail({ trial: t, color, onUseInHabitat }: { trial: WsTrial; color: string; onUseInHabitat: (id: string) => void }) {
  const a = t.analysis, m = a.speedComparison, tr = a.trajectory;
  const rows: [string, string, string | null][] = [
    ["Material", englishText(t.material), null], ["Thickness", t.thicknessMm !== null ? `${t.thicknessMm} mm` : "unknown", null],
    ["Sample", t.geometry.lengthMm && t.geometry.widthMm ? `${t.geometry.lengthMm / 10} × ${t.geometry.widthMm / 10} cm` : "unknown", null],
    ["O₂", o2(t), "oxygenPct"], ["Pressure", t.conditions.pressureKpa !== null ? `${num(t.conditions.pressureKpa, 1)} kPa` : "not tabulated", "pressureKpa"],
    ["Flow", `${t.conditions.flowCmS} cm/s ${t.conditions.flowDirection === "concurrent" ? "concurrent" : "opposed"}`, "flowCmS"],
    ["Gravity", t.conditions.gravity === "microgravity" ? "microgravity" : englishText(t.conditions.gravity), "gravity"],
  ];
  return (
    <section className="ws-detail" aria-label={`Details for ${t.id}`}>
      <header>
        <span className="eyebrow"><i style={{ background: color }} />DETAILS</span>
        <h3>{englishText(t.campaign)} · {englishText(t.sample)} <small>{t.id}</small></h3>
        {a.reviewStatus === "review-required" && <p className="ws-gate"><AlertTriangle size={13} /> Under scientific review (S2_REVIEW.md): visible as evidence, not used as a habitat anchor.</p>}
      </header>
      <table className="ws-table">
        <tbody>{rows.map(([k, v, field]) => {
          const src = field ? t.conditionSources.find((s) => s.field === field) : null;
          return <tr key={k}><th>{k}</th><td>{v}</td><td className="ws-src">{src ? src.url ? <a href={src.url} target="_blank" rel="noreferrer">{englishText(src.label)} <ArrowUpRight size={10} /></a> : englishText(src.label) : ""}</td></tr>;
        })}</tbody>
      </table>
      <div className="ws-metrics">
        {t.observables.map((o) => (
          <div key={o.window}><span>{KIND_LABEL[o.kind]}</span><strong>{num(o.speedMmS)} <small>mm/s</small></strong><em>{englishText(o.window)}</em></div>
        ))}
        {m && <div><span>Validation window ({m.sourceField})</span><strong>{num(m.observedMmS)} → {num(m.simulatedMmS)} <small>mm/s</small></strong>
          <em>obs. → sim. · error {num(m.signedErrorPct, 1)}%{m.positionMaeReportedMm !== null ? ` · position MAE ${num(m.positionMaeReportedMm, 1)} mm (reported)` : ""}</em></div>}
      </div>
      <dl className="ws-model">
        <dt>Model</dt><dd>{englishText(t.model.kind ?? "—")} · {VALIDATION_LABEL[t.model.validation] ?? englishText(t.model.validation)}</dd>
        <dt>Artifact</dt><dd className="mono">{t.model.artifact} · sha256 {t.model.artifactSha256?.slice(0, 16)}…</dd>
        <dt>External validation</dt><dd>no ({englishText(a.validationSummary.note)})</dd>
        <dt>Curve</dt><dd>{tr.status === "available" ? `${tr.points.length} points · ${englishText(tr.note)}` : englishText(tr.note)}</dd>
      </dl>
      {tr.status === "available" ? <TrajectoryChart trials={[{ trial: t, color }]} height={200} />
        : <div className="ws-empty small">No paired trajectory is stored for this trial; no curve is synthesized.</div>}
      {(t.conflicts.length > 0 || a.warnings.length > 0 || a.missingData.length > 0) && (
        <ul className="ws-warnings">
          {[...new Set([...t.conflicts, ...a.warnings])].map((w) => <li key={w}><AlertTriangle size={11} /> {englishText(w)}</li>)}
          {a.missingData.length > 0 && <li><AlertTriangle size={11} /> Missing data: {a.missingData.map(englishText).join(", ")}</li>}
        </ul>
      )}
      {a.capabilities.habitatAnchor && (
        <button className="button secondary" onClick={() => onUseInHabitat(t.id)}>Use as a habitat reference <ArrowRight size={13} /></button>
      )}
    </section>
  );
}

function Compare({ ws, ids, colorOf, onClear }: { ws: Workspace; ids: string[]; colorOf: (id: string) => string; onClear: () => void }) {
  const trials = ids.map((id) => ws.trials.find((t) => t.id === id)!).filter(Boolean);
  if (trials.length < 2) {
    return (
      <section className="ws-compare">
        <h3><GitCompareArrows size={14} /> Comparison</h3>
        <div className="ws-empty small">Select “compare” on two or more trials.</div>
      </section>
    );
  }
  const withCurve = trials.filter((t) => t.analysis.trajectory.status === "available");
  const base = trials[0];
  return (
    <section className="ws-compare" aria-label="Trial comparison">
      <h3><GitCompareArrows size={14} /> Comparison · {trials.length} trials <button className="text-link subtle" onClick={onClear}>clear</button></h3>
      {withCurve.length ? <TrajectoryChart trials={withCurve.map((t) => ({ trial: t, color: colorOf(t.id) }))} />
        : <div className="ws-empty small">None of the selected trials has a stored curve; the comparison is limited to the metrics below.</div>}
      {withCurve.length > 0 && withCurve.length < trials.length && <p className="ws-note">No curve: {trials.filter((t) => !withCurve.includes(t)).map((t) => t.id).join(", ")}.</p>}
      <table className="ws-table quant">
        <thead><tr><th>Trial</th><th>Observable</th><th>Rate</th><th>Obs. → sim.</th><th>Error</th><th>Δ vs {englishText(base.campaign)} {englishText(base.sample)}</th></tr></thead>
        <tbody>{trials.map((t) => {
          const m = t.analysis.speedComparison;
          const d = t.id === base.id ? null : pairDelta(ws, base.id, t.id);
          return (
            <tr key={t.id}>
              <th><i style={{ background: colorOf(t.id) }} />{englishText(t.campaign)} · {englishText(t.sample)}</th>
              <td>{KIND_LABEL[t.observables[0].kind]}</td>
              <td>{num(t.observables[0].speedMmS)} mm/s</td>
              <td>{m ? `${num(m.observedMmS)} → ${num(m.simulatedMmS)}` : "—"}</td>
              <td>{m?.signedErrorPct != null ? `${num(m.signedErrorPct, 1)}%` : "—"}</td>
              <td>{t.id === base.id ? "reference" : d?.speedDeltaMmS == null ? "incompatible observables" : `${d.speedDeltaMmS > 0 ? "+" : ""}${num(d.speedDeltaMmS)} mm/s (${num(d.speedDeltaPct, 1)}%)`}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <div className="ws-confounds">
        <h4>Conditions that differ between pairs (confounders)</h4>
        {trials.slice(1).map((t) => {
          const c = pairDelta(ws, base.id, t.id);
          if (!c) return null;
          const flip = c.trialIds[0] !== base.id;
          return (
            <div key={t.id} className="ws-pair">
              <strong>{englishText(base.campaign)} {englishText(base.sample)} × {englishText(t.campaign)} {englishText(t.sample)}</strong>
              <ul>{c.conditionDiffs.filter((x) => x.status !== "same").map((x) => (
                <li key={x.field} className={x.status}>{FIELD_LABEL[x.field] ?? x.field}: {cond(flip ? x.right : x.left)} → {cond(flip ? x.left : x.right)}{x.status === "unknown" ? " (unknown)" : ""}</li>
              ))}</ul>
              <p>{c.warnings.map(englishText).join(" ")}</p>
            </div>
          );
        })}
        <p className="ws-note">Interpretation: descriptive, not causal. When multiple conditions differ at once, no speed difference isolates the effect of O₂, pressure, or flow.</p>
      </div>
    </section>
  );
}
