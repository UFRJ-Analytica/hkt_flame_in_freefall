import { X } from "lucide-react";
import { useModalFocus } from "../../hooks/useModalFocus";
import { number } from "../../config";
import { englishText } from "../../i18n/english";
import type { Atmosphere, ExperimentTest } from "../../types";
import { CONDITION_FIELDS, originLabel, type ConditionOrigins } from "../../research/provenance";

export function ConditionConfirmation({ test, atmosphere, origins, onClose, onConfirm }: {
  test: ExperimentTest; atmosphere: Atmosphere; origins: ConditionOrigins; onClose: () => void; onConfirm: () => void;
}) {
  useModalFocus(true, onClose);
  return <div className="modal-backdrop condition-confirmation-backdrop" onClick={onClose}><section className="modal condition-confirmation" role="dialog" aria-modal="true" aria-labelledby="condition-confirm-title" onClick={(e) => e.stopPropagation()}>
    <div className="modal-heading"><div><span className="eyebrow">APPLY AVAILABLE VALUES ONLY</span><h2 id="condition-confirm-title">Review scenario changes</h2></div><button className="icon-button" aria-label="Cancel application" onClick={onClose}><X size={20} /></button></div>
    <p>{test.investigationId} · {englishText(test.label || test.id)}</p><p className="record-origin">{test.id} · {test.sourceFile ?? "File not reported"} · row {test.sourceRow ?? "not reported"}</p>
    <div className="condition-diff">{CONDITION_FIELDS.map((field) => {
      const value = test[field.record];
      return <div key={field.key}><header><strong>{englishText(field.label)}</strong><span>{number(atmosphere[field.key])} → {number(value ?? atmosphere[field.key])} {field.unit}</span></header>
        {value == null ? <><small className="condition-preserved">Missing from this record: keep the current value and origin.</small><small>{englishText(originLabel(origins[field.key]))}</small></> : <><small>Current origin: {englishText(originLabel(origins[field.key]))}</small><small>New origin: {test.investigationId} · {test.id} · {test.sourceFile ?? "file not reported"} · row {test.sourceRow ?? "not reported"}</small></>}
      </div>;
    })}</div>
    <p className="data-notice">Only known O₂, pressure, and flow values will be copied. Material, vehicle, and gravity will not change. Applying sample conditions does not validate the cabin or animation.</p>
    <div className="condition-actions"><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" onClick={onConfirm}>Confirm available conditions</button></div>
  </section></div>;
}
