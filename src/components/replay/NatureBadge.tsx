import { NATURE, type ReplayNature } from "./replayCore";
import "./nature.css";

/** Text badge saying what a visualization shows (experimental images, measured data, model, …). */
export function NatureBadge({ nature }: { nature: ReplayNature }) {
  return (
    <span className={`rp-nature rp-nature-${nature}`} title={NATURE[nature].description}>
      {NATURE[nature].label}
    </span>
  );
}
