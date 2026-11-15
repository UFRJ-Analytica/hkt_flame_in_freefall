import { lazy, Suspense, useState, type ReactNode } from "react";
import { ArrowRight, BookOpen, Film, Wind } from "lucide-react";

// Measured or published NASA experiments replayed from their own data (not the HabitatFire model).
const SameSmokeObservation = lazy(() => import("./SameSmokeObservation"));
const SofieGelObservation = lazy(() => import("./SofieGelObservation"));
const BassB1Observation = lazy(() => import("./BassB1Observation"));

type Replay = "bass2" | "sofie" | "same";

const REPLAYS: { id: Replay; icon: ReactNode; tag: string; title: string; what: string; data: string; caveat: string; action: string }[] = [
  {
    id: "bass2", icon: <Film size={18} />, tag: "BASS-II · PSI-25 · test B1",
    title: "Flame-front propagation measured from the flight video",
    what: "Frame-by-frame tracking of the luminous flame sheet over a 100 µm PMMA film on the ISS, with temporal playback, events and front trajectories.",
    data: "Measured from the raw NASA video (pixels over time).",
    caveat: "Pixel units: no spatial scale yet, so speeds are not comparable to mm/s.",
    action: "Open B1 video observation",
  },
  {
    id: "sofie", icon: <BookOpen size={18} />, tag: "SoFIE-GEL · published, outside PSI",
    title: "Extinction of burning PMMA spheres: quenching and blowoff",
    what: "The five published extinction cases for 4 cm PMMA spheres, mapping oxygen at extinction against flow and strain rate, with the two extinction branches.",
    data: "Published values (NASA NTRS 20240007628; Combustion and Flame 2025).",
    caveat: "Five cases only; no PSI dataset exists for SoFIE-GEL.",
    action: "Open SoFIE-GEL evidence",
  },
  {
    id: "same", icon: <Wind size={18} />, tag: "SAME · PSI-102",
    title: "Smoke particle size and detector response in microgravity",
    what: "Smoke from overheated spacecraft materials: count-median diameter by material and aging, DustTrak ratios, and ISS / Shuttle detector signals.",
    data: "Each value labelled published, measured, derived, assumption or unavailable.",
    caveat: "Smoke from overheating, not flame spread; flight detector volts are uncalibrated.",
    action: "Open Smoke & Detection analysis",
  },
];

export function ExperimentReplays({ modeSwitch }: { modeSwitch: ReactNode }) {
  const [open, setOpen] = useState<Replay | null>(null);
  return (
    <main className="replays">
      {modeSwitch}
      <p className="replays-intro">
        These are NASA experiments reconstructed from their own data (flight video, published tables and smoke measurements) by the HabitatFire team. They show what was observed, not a model prediction.
      </p>
      <div className="replay-grid">
        {REPLAYS.map((r) => (
          <article key={r.id} className="replay-card">
            <header><span className="replay-icon">{r.icon}</span><small>{r.tag}</small></header>
            <h3>{r.title}</h3>
            <p>{r.what}</p>
            <dl>
              <div><dt>Data</dt><dd>{r.data}</dd></div>
              <div><dt>Limits</dt><dd>{r.caveat}</dd></div>
            </dl>
            <button className="button primary" onClick={() => setOpen(r.id)}>{r.action} <ArrowRight size={14} /></button>
          </article>
        ))}
      </div>
      {open && (
        <Suspense fallback={<div className="modal-backdrop"><p className="evidence-loading">Loading experiment…</p></div>}>
          {open === "same" && <SameSmokeObservation onClose={() => setOpen(null)} />}
          {open === "sofie" && <SofieGelObservation onClose={() => setOpen(null)} />}
          {open === "bass2" && <BassB1Observation onClose={() => setOpen(null)} />}
        </Suspense>
      )}
    </main>
  );
}
