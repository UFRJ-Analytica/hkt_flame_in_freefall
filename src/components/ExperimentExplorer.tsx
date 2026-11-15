import { lazy, Suspense, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Beaker,
  BookOpen,
  ChevronRight,
  Flame,
  Database,
  Film,
  Search,
  SlidersHorizontal,
  Sparkles,
  Wind,
  X,
} from "lucide-react";
import type { ExperimentTest, Investigation, NasaData } from "../types";
import { CATEGORY_LABELS, number } from "../config";
import { useModalFocus } from "../hooks/useModalFocus";
import { RecordVideos } from "./research/RecordVideos";
import { englishText } from "../i18n/english";
import { SAME_INVESTIGATION_ID } from "./research/sameSmoke";
import { SIPanel } from "../si/SIPanel";

// Loaded on request only: the SAME evidence module and its JSON stay out of the first render.
const SameSmokeObservation = lazy(() => import("./research/SameSmokeObservation"));
import { SOFIE_GEL_TITLE } from "./research/sofieGel";

// Published evidence outside the PSI catalogue: module and JSON load only when opened.
const SofieGelObservation = lazy(() => import("./research/SofieGelObservation"));
import { BASS_B1_RECORD_ID } from "./research/bassB1";

// Measured video analysis of BASS-II test B1, loaded only when opened.
const BassB1Observation = lazy(() => import("./research/BassB1Observation"));

import { FLARE_TITLE } from "./research/flareEvidence";

// FLARE (JAXA) published flammability limits, outside the PSI catalogue: loaded only when opened.
const FlareObservation = lazy(() => import("./research/FlareObservation"));

export function ExperimentExplorer({
  data,
  onApply,
  applicationPending = false,
  initialId,
}: {
  data: NasaData;
  onApply: (test: ExperimentTest) => void;
  applicationPending?: boolean;
  initialId?: string;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState(initialId && data.investigations.some((i) => i.id === initialId) ? initialId : "PSI-25");
  const [detail, setDetail] = useState<ExperimentTest | null>(null);
  const [page, setPage] = useState(0);
  const [smokeOpen, setSmokeOpen] = useState(false);
  const [sofieOpen, setSofieOpen] = useState(false);
  const [observationOpen, setObservationOpen] = useState(false);
  const [siOpen, setSiOpen] = useState(false);
  const openInvestigation = (id: string) => {
    if (!data.investigations.some((i) => i.id === id)) return;
    setCategory("all");
    setSelectedId(id);
    setPage(0);
    setDetail(null);
  };
  const [flareOpen, setFlareOpen] = useState(false);
  useModalFocus(detail !== null && !applicationPending, () => setDetail(null));
  const investigations = data.investigations.filter(
    (i) => category === "all" || i.category === category,
  );
  const selected =
    investigations.find((i) => i.id === selectedId) ?? investigations[0];
  const filtered = useMemo(
    () =>
      (selected?.tests ?? []).filter((test) =>
        `${test.id} ${test.material ?? ""} ${test.label} ${JSON.stringify(test.raw)}`
          .toLocaleLowerCase("en-US")
          .includes(query.toLocaleLowerCase("en-US")),
      ),
    [selected, query],
  );
  const pageSize = 12;
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / pageSize) - 1),
  );
  function downloadRows() {
    if (!selected) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            investigation: selected.id,
            sourceUrl: selected.sourceUrl,
            retrievedAt: data.retrievedAt,
            tests: filtered,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `habitatfire-${selected.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="explorer">
      <div className="page-heading">
        <div>
          <span className="eyebrow">NASA PSI CATALOG</span>
          <h1>Real data. Context preserved.</h1>
          <p>
            Explore original records, their units, and the context of each
            investigation.
          </p>
        </div>
        <div className="heading-actions">
          <button type="button" className="button primary si-open" onClick={() => setSiOpen((v) => !v)} aria-expanded={siOpen}>
            <Sparkles size={14} /> {siOpen ? "Close SI" : "Ask SI about this database"}
          </button>
          <span className="source-badge">
            <Database size={14} />
            NASA PSI snapshot
          </span>
        </div>
      </div>
      {siOpen && (
        <aside className="si-drawer" aria-label="SI assistant for the catalog">
          <button type="button" className="icon-button si-drawer-close" onClick={() => setSiOpen(false)} aria-label="Close SI"><X size={15} /></button>
          <SIPanel
            context={{ stage: "catalog", investigation: selectedId }}
            title="SI · catalog assistant"
            intro="Ask about the 24 PSI combustion investigations and their 2,001 records. SI reads investigation metadata, queries records and opens the investigation it is talking about."
            suggestions={[
              "Which investigations tested Kapton, and under what oxygen levels?",
              "What does BASS-II record for each test, and which columns matter for modeling?",
              "Which investigations have no public data table, and why does that matter?",
            ]}
            placeholder="Ask about investigations, materials, conditions…"
            onAction={(a) => { if (a.action === "open") openInvestigation(a.id); }}
            onOpenInvestigation={openInvestigation}
          />
        </aside>
      )}
      <div className="category-filters">
        <SlidersHorizontal size={15} />
        <button
          className={category === "all" ? "chip active" : "chip"}
          onClick={() => {
            setCategory("all");
            setPage(0);
            setDetail(null);
          }}
        >
          All families
        </button>
        {Object.entries(CATEGORY_LABELS)
          .filter(([id]) => data.investigations.some((i) => i.category === id))
          .map(([id, label]) => (
            <button
              key={id}
              className={category === id ? "chip active" : "chip"}
              onClick={() => {
                setCategory(id);
                setPage(0);
                setDetail(null);
              }}
            >
              {label}
            </button>
          ))}
      </div>
      <div className="explorer-layout">
        <aside className="investigation-list">
          {(category === "all" || category === "solid") && (
            <div className="evidence-group">
              <span className="evidence-group-label">
                Published evidence · outside PSI
              </span>
              <button
                className="investigation-item evidence-item"
                onClick={() => setSofieOpen(true)}
                aria-label={`${SOFIE_GEL_TITLE}: open evidence (no public PSI dataset)`}
              >
                <div className="investigation-icon">
                  <BookOpen size={19} />
                </div>
                <span>
                  <strong>SoFIE-GEL</strong>
                  <small>NASA · 5 published cases · no PSI dataset</small>
                </span>
                <ChevronRight size={15} />
              </button>
              <button
                className="investigation-item evidence-item"
                onClick={() => setFlareOpen(true)}
                aria-label={`${FLARE_TITLE}: open published evidence (no PSI dataset)`}
              >
                <div className="investigation-icon">
                  <Flame size={19} />
                </div>
                <span>
                  <strong>FLARE</strong>
                  <small>JAXA · published LOC/MLOC · no PSI dataset</small>
                </span>
                <ChevronRight size={15} />
              </button>
            </div>
          )}
          {investigations.map((investigation) => (
            <button
              key={investigation.id}
              className={`investigation-item ${selected?.id === investigation.id ? "active" : ""}`}
              onClick={() => {
                setSelectedId(investigation.id);
                setPage(0);
                setDetail(null);
              }}
            >
              <div className="investigation-icon">
                <Beaker size={19} />
              </div>
              <span>
                <strong>{englishText(investigation.name)}</strong>
                <small>
                  {investigation.id} ·{" "}
                  {investigation.testCount > 0
                    ? `${investigation.testCount} records`
                    : "Metadata"}
                </small>
              </span>
              <ChevronRight size={15} />
            </button>
          ))}
        </aside>
        <section className="experiment-content">
          {selected ? (
            <>
              <div className="investigation-heading">
                <div>
                  <div className="row">
                    <span className="eyebrow">{selected.id}</span>
                    <span className="tiny-tag">
                      {CATEGORY_LABELS[selected.category]}
                    </span>
                  </div>
                  <h2>{englishText(selected.title || selected.name)}</h2>
                  <p>{englishText(selected.description)}</p>
                </div>
                <a
                  className="icon-button"
                  title="Open original NASA investigation"
                  href={selected.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ArrowUpRight size={20} />
                </a>
              </div>
              <div className="dataset-facts">
                <span>
                  <i className="dot green" />
                  {selected.status === "downloaded"
                    ? "Table connected"
                    : selected.status === "metadata-only"
                      ? "Metadata only"
                      : "Data unavailable"}
                </span>
                <span>{englishText(selected.platform)}</span>
                <span>
                  {number(selected.testCount, 0)} imported records
                </span>
              </div>
              {selected.recordGrain && (
                <p className="record-grain">
                  Table record unit: {englishText(selected.recordGrain)}.
                </p>
              )}
              {selected.id === SAME_INVESTIGATION_ID && (
                <div className="same-entry">
                  <div>
                    <strong>Smoke &amp; Detection: SAME evidence</strong>
                    <p>
                      Smoke from overheated materials (not flame spread):
                      Table 1 aggregated by material, aging,
                      DustTrak B/A ratio, and ISS and Space Shuttle
                      detector responses, with each value labeled as published,
                      measured, derived, an assumption, or unavailable. The 8 records
                      below reproduce the planned test matrix, not the 47
                      flight tests.
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => setSmokeOpen(true)}
                  >
                    <Wind size={15} />
                    Open Smoke &amp; Detection analysis
                  </button>
                </div>
              )}
              <details className="data-notice">
                <summary>
                  Context and limitations of this investigation (
                  {selected.limitations.length})
                </summary>
                {selected.limitations.map((limitation, index) => (
                  <p key={index}>{englishText(limitation)}</p>
                ))}
              </details>
              {selected.tests.length > 0 ? (
                <>
                  <div className="table-toolbar">
                    <label className="search-field">
                      <Search size={16} />
                      <input
                        aria-label="Search experiments or materials"
                        placeholder="Search tests, materials, or conditions…"
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setPage(0);
                        }}
                      />
                    </label>
                    <button className="button secondary" onClick={downloadRows}>
                      <ArrowDownToLine size={15} />
                      Export data
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Record</th>
                          <th>Material / fuel</th>
                          <th>Initial O₂</th>
                          <th>Pressure</th>
                          <th>Flow</th>
                          <th aria-label="Details" />
                        </tr>
                      </thead>
                      <tbody>
                        {filtered
                          .slice(safePage * pageSize, (safePage + 1) * pageSize)
                          .map((test, index) => (
                            <tr
                              key={`${test.id}-${index}`}
                              onClick={() => setDetail(test)}
                            >
                              <td>
                                <button
                                  className="table-test"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDetail(test);
                                  }}
                                >
                                  {englishText(test.label || test.id)}
                                </button>
                                {test.id === BASS_B1_RECORD_ID && (
                                  <span className="tiny-tag b1-row-tag" title="Flame front measured in this test's video">
                                    analyzed video
                                  </span>
                                )}
                              </td>
                              <td>{englishText(test.material || "Not reported")}</td>
                              <td className="mono">
                                {number(test.oxygenPct)}
                                {test.oxygenPct != null ? "%" : ""}
                              </td>
                              <td className="mono">
                                {number(test.pressureKpa)}
                                {test.pressureKpa != null ? " kPa" : ""}
                              </td>
                              <td className="mono">
                                {number(test.flowCmS)}
                                {test.flowCmS != null ? " cm/s" : ""}
                              </td>
                              <td>
                                <ChevronRight size={14} />
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                    {filtered.length === 0 && (
                      <div className="empty-state">
                        No tests match your search.
                      </div>
                    )}
                  </div>
                  <div className="table-pagination">
                    <span>
                      {filtered.length ? safePage * pageSize + 1 : 0}–
                      {Math.min((safePage + 1) * pageSize, filtered.length)} of{" "}
                      {filtered.length} records
                    </span>
                    <div>
                      <button
                        className="button secondary small"
                        disabled={safePage === 0}
                        onClick={() => setPage(safePage - 1)}
                      >
                        Previous
                      </button>
                      <button
                        className="button secondary small"
                        disabled={(safePage + 1) * pageSize >= filtered.length}
                        onClick={() => setPage(safePage + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <Database size={26} />
                  <h3>Cataloged investigation</h3>
                  <p>
                    No numerical table has been imported in this snapshot. Visit the
                    source for documents and media; we do not replace missing
                    measurements with synthetic data.
                  </p>
                  <a
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    Explore at NASA <ArrowUpRight size={14} />
                  </a>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              No investigations in this category.
            </div>
          )}
        </section>
      </div>
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <section
            className="modal test-detail"
            role={applicationPending ? undefined : "dialog"}
            aria-modal={applicationPending ? undefined : "true"}
            inert={applicationPending}
            aria-labelledby="test-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {detail.investigationId} · ORIGINAL RECORD
                </span>
                <h2 id="test-detail-title">{englishText(detail.label || detail.id)}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Close details"
                onClick={() => setDetail(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="muted">
              Fields preserved from the NASA table. A missing value does not
              mean zero or extinction.
            </p>
            {detail.sourceFile && (
              <p className="record-origin">
                {detail.sourceFile} · CSV record {detail.sourceRow}
              </p>
            )}
            {detail.normalizationNotes &&
              detail.normalizationNotes.length > 0 && (
                <div className="data-notice">
                  {detail.normalizationNotes.map(englishText).join(" ")}
                </div>
              )}
            <RecordVideos recordId={detail.id} investigationId={detail.investigationId} />
            <div className="raw-fields">
              {Object.entries(detail.raw)
                .filter(([, value]) => value != null && value !== "")
                .map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>{String(value)}</strong>
                  </div>
                ))}
            </div>
            {detail.id === BASS_B1_RECORD_ID && (
              <div className="b1-entry">
                <span>
                  <strong>Experimental observation available.</strong> Flame
                  fronts measured in this test's video (in pixels, without a physical
                  scale), with temporal playback, events, and limitations.
                </span>
                <button
                  className="button secondary"
                  onClick={() => {
                    setDetail(null);
                    setObservationOpen(true);
                  }}
                >
                  <Film size={15} />
                  Open B1 observation (video measurements)
                </button>
              </div>
            )}
            <div className="data-notice">
              Applying copies only available numerical conditions. The
              experiment does not validate the cabin or animation.
            </div>
            <button
              className="button primary full"
              disabled={
                detail.oxygenPct == null &&
                detail.pressureKpa == null &&
                detail.flowCmS == null
              }
              onClick={() => {
                onApply(detail);
              }}
            >
              Use conditions in the laboratory <ChevronRight size={16} />
            </button>
          </section>
        </div>
      )}
      {smokeOpen && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <p className="same-loading">Loading SAME analysis…</p>
            </div>
          }
        >
          <SameSmokeObservation onClose={() => setSmokeOpen(false)} />
        </Suspense>
      )}
      {sofieOpen && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <p className="evidence-loading">Loading SoFIE-GEL evidence…</p>
            </div>
          }
        >
          <SofieGelObservation onClose={() => setSofieOpen(false)} />
        </Suspense>
      )}
      {observationOpen && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <div className="modal" role="status">
                Loading B1 observation…
              </div>
            </div>
          }
        >
          <BassB1Observation onClose={() => setObservationOpen(false)} />
        </Suspense>
      )}
      {flareOpen && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <p className="evidence-loading">Loading FLARE evidence…</p>
            </div>
          }
        >
          <FlareObservation onClose={() => setFlareOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

export function SourcesView({ data }: { data: NasaData }) {
  return (
    <div className="sources-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">PROVENANCE & LIMITATIONS</span>
          <h1>A source for every claim.</h1>
          <p>What was imported, where it came from, and what we still do not know.</p>
        </div>
      </div>
      <div className="provenance-banner">
        <Database size={24} />
        <div>
          <strong>NASA Physical Sciences Informatics</strong>
          <p>
            Snapshot retrieved on{" "}
            {new Date(data.retrievedAt).toLocaleString("en-US")}. The application
            uses locally imported files, without depending on portal
            availability during the demonstration. Counts represent tabular
            records, including summaries and references, not independent
            tests.
          </p>
          <a
            className="provenance-download"
            href={`${import.meta.env.BASE_URL}data/nasa-provenance.json`}
            download="habitatfire-provenance.json"
          >
            <ArrowDownToLine size={13} />
            Download provenance manifest and SHA-256 hashes
          </a>
        </div>
      </div>
      <div className="source-grid">
        {data.investigations.map((i) => (
          <SourceCard key={i.id} investigation={i} />
        ))}
      </div>
      <div className="limitations-panel">
        <h2>Visualization is not certification.</h2>
        <p>
          The cabin is a geometric interpretation, not an official CAD model. The
          animation is illustrative: this version does not calculate CFD,
          calibrated spread, detection probability, or suppression
          effectiveness.
        </p>
        <p>
          Solid, droplet, and gas experiments are presented as separate
          families. Their results are not used as interchangeable labels
          for a single classifier. Cabin conditions and local results
          do not inherit validation from a test.
        </p>
        <p>
          Materials assigned to the cabin are editable scenario assumptions, not
          a statement of the actual composition of Orion or the ISS.
        </p>
      </div>
      {data.errors.length > 0 && (
        <div className="limitations-panel">
          <h3>Limitations of the last synchronization</h3>
          {data.errors.map((e, n) => (
            <p key={`${e.id}-${n}`}>
              {e.id}: {englishText(e.message)}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
function SourceCard({ investigation: i }: { investigation: Investigation }) {
  return (
    <article className="source-card">
      <div className="row between">
        <span className="source-id">{i.id}</span>
        <span className="tiny-tag">
          {i.status === "downloaded" ? "Imported table" : "Metadata"}
        </span>
      </div>
      <h2>{englishText(i.name)}</h2>
      <p>{englishText(i.title)}</p>
      <div className="source-card-meta">
        {CATEGORY_LABELS[i.category]} · {englishText(i.platform)}
      </div>
      <strong className="record-count">
        {i.testCount > 0
          ? `${i.testCount} records available`
          : "No numerical table imported"}
      </strong>
      {i.doi && <small className="mono">DOI {i.doi}</small>}
      <div className="source-card-links">
        <a href={i.sourceUrl} target="_blank" rel="noreferrer">
          NASA investigation <ArrowUpRight size={14} />
        </a>
        {i.dataUrl && (
          <a href={i.dataUrl} target="_blank" rel="noreferrer">
            Original file <ArrowUpRight size={14} />
          </a>
        )}
      </div>
    </article>
  );
}
