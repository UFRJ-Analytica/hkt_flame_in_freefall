import type { ReactNode } from "react";
import { TriangleAlert, X } from "lucide-react";
import { useModalFocus } from "../../hooks/useModalFocus";
import type { ReplayNature } from "./replayCore";
import { NatureBadge } from "./NatureBadge";
import "./replay.css";

/**
 * Shared frame of every experimental replay: what is shown, of which nature, in which unit and on
 * which time reference. Detailed scientific notices are available on demand; the renderer is the child.
 */
export function ExperimentalReplay({
  id,
  eyebrow,
  title,
  natures,
  quantity,
  unit,
  timeReference,
  caption,
  notices,
  onClose,
  status,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  natures: ReplayNature[];
  quantity: string;
  unit: string;
  timeReference: string;
  /** One-sentence scientific caption, shown under the title. */
  caption: string;
  notices: string[];
  onClose: () => void;
  status?: { loading?: string; error?: string | null };
  children?: ReactNode;
}) {
  useModalFocus(true, onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal rp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-heading">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2 id={`${id}-title`}>{title}</h2>
          </div>
          <button className="icon-button" aria-label={`Close ${title}`} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="rp-identity">
          <div className="rp-natures">
            {natures.map((nature) => (
              <NatureBadge key={nature} nature={nature} />
            ))}
          </div>
          <p className="rp-caption">{caption}</p>
          <dl className="rp-meta">
            <div>
              <dt>Quantity</dt>
              <dd>{quantity}</dd>
            </div>
            <div>
              <dt>Unit</dt>
              <dd>{unit}</dd>
            </div>
            <div>
              <dt>Time reference</dt>
              <dd>{timeReference}</dd>
            </div>
          </dl>
        </div>
        {status?.error && (
          <div className="data-notice" role="alert">
            {status.error}
          </div>
        )}
        {!status?.error && status?.loading && <p className="rp-loading">{status.loading}</p>}
        {!status?.error && !status?.loading && children}
        {notices.length > 0 && (
          <details className="rp-details rp-notices">
            <summary tabIndex={0}>
              <TriangleAlert size={14} aria-hidden="true" /> Limitations of this visualization
            </summary>
            <ul>
              {notices.map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

/** Legend entry: a swatch class plus text. Colour is never the only cue; each entry says what it is. */
export function LegendItem({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <li>
      <i className={`rp-swatch ${swatch}`} aria-hidden="true" />
      {children}
    </li>
  );
}
