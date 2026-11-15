import { lazy, Suspense, useState, type ReactNode } from "react";
import { ArrowRight, BookOpen, Film, Flame, Grid3x3, Images, Table2, Wind } from "lucide-react";
import { NatureBadge } from "../replay/NatureBadge";
import type { ReplayNature } from "../replay/replayCore";
import { REPLAY_CATALOG, type ReplayId } from "../replay/replayCatalog";
import "../replay/replay.css";

// Every module and its JSON load only when opened. Each replay keeps its own renderer and data;
// the shared controls never imply a shared physical model.
const BassB1Replay = lazy(() => import("./BassB1Replay"));
const SaffireImageReplay = lazy(() => import("./SaffireImageReplay"));
const SaffireModelReplay = lazy(() => import("./SaffireModelReplay"));
const SofieVideoReplay = lazy(() => import("./SofieVideoReplay"));
const SameSequenceReplay = lazy(() => import("./SameSequenceReplay"));
// Full analysis modules (already in the catalogue), reachable from the same cards.
const BassB1Observation = lazy(() => import("./BassB1Observation"));
const SofieGelObservation = lazy(() => import("./SofieGelObservation"));
const SameSmokeObservation = lazy(() => import("./SameSmokeObservation"));
const FlareObservation = lazy(() => import("./FlareObservation"));

type Analysis = "bass2" | "sofie" | "same" | "flare";
type Open = { kind: "replay"; id: ReplayId } | { kind: "analysis"; id: Analysis };

const CARD: Record<ReplayId, { icon: ReactNode; analysis?: { id: Analysis; label: string }; extra?: string }> = {
  "bass2-b1": { icon: <Film size={18} />, analysis: { id: "bass2", label: "Full B1 video analysis" } },
  "saffire-ii-images": { icon: <Images size={18} />, extra: "3-D trial scenes stay in the SAFFIRE modes of the Simulation lab." },
  "saffire-i-model": { icon: <Grid3x3 size={18} />, extra: "The 3-D central-ignition scene (illustrative) stays in the SAFFIRE I mode." },
  "sofie-1410c": { icon: <BookOpen size={18} />, analysis: { id: "sofie", label: "SoFIE-GEL extinction evidence" } },
  "same-sequence": { icon: <Wind size={18} />, analysis: { id: "same", label: "Smoke & Detection analysis" } },
  "flare-static": { icon: <Table2 size={18} />, analysis: { id: "flare", label: "Open FLARE published evidence" } },
};

export function ExperimentReplays({ modeSwitch }: { modeSwitch: ReactNode }) {
  const [open, setOpen] = useState<Open | null>(null);
  const close = () => setOpen(null);
  return (
    <main className="replays">
      {modeSwitch}
      <p className="replays-intro">
        Explore NASA and JAXA evidence with shared playback controls; each view identifies its data and units.
      </p>
      <div className="replay-grid">
        {REPLAY_CATALOG.map((entry) => {
          const card = CARD[entry.id];
          return (
            <article key={entry.id} className={`replay-card ${entry.animated ? "" : "replay-static"}`}>
              <header>
                <span className="replay-icon">{card.icon}</span>
                <small>{entry.tag}</small>
              </header>
              <div className="replay-natures">
                {entry.natures.map((n) => (
                  <NatureBadge key={n} nature={n as ReplayNature} />
                ))}
              </div>
              <h3>{entry.title}</h3>
              <dl>
                <div>
                  <dt>Shows</dt>
                  <dd>{entry.quantity}</dd>
                </div>
                <div>
                  <dt>Unit</dt>
                  <dd>{entry.unit}</dd>
                </div>
                <div>
                  <dt>Time</dt>
                  <dd>{entry.timeReference}</dd>
                </div>
              </dl>
              <details className="rp-details">
                <summary>Data and limitations</summary>
                <dl>
                  <div>
                    <dt>Data</dt>
                    <dd>{entry.basis}</dd>
                  </div>
                  <div>
                    <dt>Limits</dt>
                    <dd>{entry.limits}</dd>
                  </div>
                </dl>
                {card.extra && <p className="replay-extra">{card.extra}</p>}
              </details>
              <div className="replay-actions">
                {entry.animated && (
                  <button className="button primary" onClick={() => setOpen({ kind: "replay", id: entry.id })}>
                    Open replay <ArrowRight size={14} />
                  </button>
                )}
                {card.analysis && (
                  <button className={`button ${entry.animated ? "secondary" : "primary"}`} onClick={() => setOpen({ kind: "analysis", id: card.analysis!.id })}>
                    {entry.animated ? null : <Flame size={14} />}
                    {card.analysis.label}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <details className="rp-details">
        <summary>About these evidence views</summary>
        <p className="replays-intro">
          NASA and JAXA experiments shown from their own data. Each card says what you will see: original images, data measured from video, a recorded
          measurement sequence, or a computational simulation. They share the same playback controls, not the same physics, and none of them predicts
          your scenario.
        </p>
      </details>
      {open && (
        <Suspense fallback={<div className="modal-backdrop"><p className="evidence-loading">Loading experiment…</p></div>}>
          {open.kind === "replay" && open.id === "bass2-b1" && <BassB1Replay onClose={close} />}
          {open.kind === "replay" && open.id === "saffire-ii-images" && <SaffireImageReplay onClose={close} />}
          {open.kind === "replay" && open.id === "saffire-i-model" && <SaffireModelReplay onClose={close} />}
          {open.kind === "replay" && open.id === "sofie-1410c" && <SofieVideoReplay onClose={close} />}
          {open.kind === "replay" && open.id === "same-sequence" && <SameSequenceReplay onClose={close} />}
          {open.kind === "analysis" && open.id === "bass2" && <BassB1Observation onClose={close} />}
          {open.kind === "analysis" && open.id === "sofie" && <SofieGelObservation onClose={close} />}
          {open.kind === "analysis" && open.id === "same" && <SameSmokeObservation onClose={close} />}
          {open.kind === "analysis" && open.id === "flare" && <FlareObservation onClose={close} />}
        </Suspense>
      )}
    </main>
  );
}
