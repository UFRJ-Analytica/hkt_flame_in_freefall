import { X } from "lucide-react";
import { useModalFocus } from "../../hooks/useModalFocus";
import { number } from "../../config";
import type { Atmosphere, ExperimentTest } from "../../types";
import { CONDITION_FIELDS, originLabel, type ConditionOrigins } from "../../research/provenance";

export function ConditionConfirmation({ test, atmosphere, origins, onClose, onConfirm }: {
  test: ExperimentTest; atmosphere: Atmosphere; origins: ConditionOrigins; onClose: () => void; onConfirm: () => void;
}) {
  useModalFocus(true, onClose);
  return <div className="modal-backdrop condition-confirmation-backdrop" onClick={onClose}><section className="modal condition-confirmation" role="dialog" aria-modal="true" aria-labelledby="condition-confirm-title" onClick={(e) => e.stopPropagation()}>
    <div className="modal-heading"><div><span className="eyebrow">APLICAR SOMENTE VALORES DISPONÍVEIS</span><h2 id="condition-confirm-title">Revisar mudanças do cenário</h2></div><button className="icon-button" aria-label="Cancelar aplicação" onClick={onClose}><X size={20} /></button></div>
    <p>{test.investigationId} · {test.label || test.id}</p><p className="record-origin">{test.id} · {test.sourceFile ?? "Arquivo não informado"} · linha {test.sourceRow ?? "não informada"}</p>
    <div className="condition-diff">{CONDITION_FIELDS.map((field) => {
      const value = test[field.record];
      return <div key={field.key}><header><strong>{field.label}</strong><span>{number(atmosphere[field.key])} → {number(value ?? atmosphere[field.key])} {field.unit}</span></header>
        {value == null ? <><small className="condition-preserved">Ausente no registro: manter valor e origem atuais.</small><small>{originLabel(origins[field.key])}</small></> : <><small>Origem atual: {originLabel(origins[field.key])}</small><small>Nova origem: {test.investigationId} · {test.id} · {test.sourceFile ?? "arquivo não informado"} · linha {test.sourceRow ?? "não informada"}</small></>}
      </div>;
    })}</div>
    <p className="data-notice">Somente O₂, pressão e fluxo conhecidos serão copiados. Material, veículo e gravidade não mudam. Aplicar condições de uma amostra não valida a cabine nem a animação.</p>
    <div className="condition-actions"><button className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" onClick={onConfirm}>Confirmar condições disponíveis</button></div>
  </section></div>;
}
