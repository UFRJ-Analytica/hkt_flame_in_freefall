import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowRight, ArrowUpRight, CheckCircle2, CircleSlash, FlaskConical } from "lucide-react";
import {
  assessSaffireS1, PARTIAL_GRAVITY_SOURCES, rankComparables, readModelingTargets,
  type Criterion, type ModelingTargets, type Scenario, type Status, type TargetRecord,
} from "./domain";
import "./model.css";

const STATUS_TITLE: Record<Status, string> = {
  ok: "Dentro do domínio medido",
  warn: "Próximo do domínio, com ressalvas",
  out: "Fora do domínio medido",
};
const STATUS_ICON = { ok: CheckCircle2, warn: AlertTriangle, out: CircleSlash };
const OUTCOME_CLASS: Record<string, string> = { sustained: "sustained", "no-sustained": "none", anchored: "anchored", "not-ignited": "none" };
const num = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: digits });

function useModelingTargets() {
  const [targets, setTargets] = useState<ModelingTargets | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const request = new AbortController();
    fetch(`${import.meta.env.BASE_URL}data/modeling-targets.json`, { signal: request.signal })
      .then((response) => { if (!response.ok) throw new Error("Alvos de modelagem indisponíveis."); return response.json(); })
      .then((value) => setTargets(readModelingTargets(value)))
      .catch((reason: unknown) => { if (!request.signal.aborted) setError(reason instanceof Error ? reason.message : "Erro ao carregar."); });
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
    <section className="applicability-panel" aria-label="Aplicabilidade de modelos calibrados">
      <header className="applicability-head">
        <div>
          <span className="eyebrow">PREVISÃO PARA ESTE CENÁRIO</span>
          <h2 className={`status-${assessment.status}`}><Icon size={15} /> {STATUS_TITLE[assessment.status]}</h2>
          <p>
            Modelo calibrado disponível: <strong>avanço da frente · SAFFIRE I S1</strong>. Comparado com {surfaceName.toLowerCase()} em {scenario.material}.
          </p>
        </div>
        <button className="button secondary" onClick={onOpenModel}>
          {assessment.status === "out" ? "Ver o ensaio de referência" : "Abrir o modelo"} <ArrowRight size={14} />
        </button>
      </header>

      <ul className="criteria">
        {assessment.criteria.map((criterion) => <CriterionRow key={criterion.id} criterion={criterion} />)}
      </ul>

      {partialGravity && (
        <div className="gravity-callout" role="note">
          <AlertTriangle size={15} />
          <div>
            <strong>Gravidade parcial não tem ensaio no PSI.</strong>
            <p>
              Em 1/6 g o empuxo volta a induzir escoamento, mas sem o <em>blowoff</em> de 1 g. Ensaios em centrífuga e voo
              parabólico (LUCI) indicam que alguns materiais queimam com menos O₂ na gravidade lunar do que na Terra; o tecido SIBAL
              queima para baixo em 1/6 g e se extingue em 1 g. Ensaios em centrífuga (ICES-2025-392) mostram que o efeito depende do material: materiais de maior temperatura de pirólise podem ficar menos inflamáveis. O FM² vai medir na superfície lunar. Nem µg nem 1 g são limites conservadores universais.
            </p>
            <span className="gravity-links">
              <a href={PARTIAL_GRAVITY_SOURCES.fm2} target="_blank" rel="noreferrer">FM² · NASA Glenn <ArrowUpRight size={11} /></a>
              <a href={PARTIAL_GRAVITY_SOURCES.luci} target="_blank" rel="noreferrer">LUCI · NTRS <ArrowUpRight size={11} /></a>
            </span>
          </div>
        </div>
      )}

      <div className="comparables-head">
        <h3><FlaskConical size={14} /> Ensaios medidos mais próximos</h3>
        {targets && (
          <span className="comparables-actions">
            <a className="text-link subtle" href={`${import.meta.env.BASE_URL}data/modeling-targets.json`} download="habitatfire-alvos-modelagem.json">
              <ArrowDownToLine size={12} /> JSON
            </a>
            <button className="text-link subtle" onClick={() => downloadCsv(targets.records)}><ArrowDownToLine size={12} /> CSV</button>
          </span>
        )}
      </div>
      {error && <p className="model-muted">{error}</p>}
      {!targets && !error && <p className="model-muted">Carregando alvos de modelagem…</p>}
      <ol className="comparables">
        {comparables.map(({ record, mismatches }) => (
          <li key={record.id}>
            <details>
              <summary>
                <span className="cmp-id">{record.campaign} · {record.sample}</span>
                <span className="cmp-material">{record.materialDetail}{record.thicknessMm ? ` · ${num(record.thicknessMm, 2)} mm` : ""}</span>
                <span className="cmp-conditions">
                  {record.flowCmS} cm/s {record.flowDirection === "concurrent" ? "concorrente" : "oposto"} ·{" "}
                  {record.oxygenPct ? `${record.oxygenApproximate ? "~" : ""}${num(record.oxygenPct[0])}${record.oxygenPct[1] !== record.oxygenPct[0] ? `–${num(record.oxygenPct[1])}` : ""}% O₂` : "O₂ não tabulado"} · µg
                </span>
                <span className="cmp-result">
                  {record.outcome
                    ? <span className={`outcome ${OUTCOME_CLASS[record.outcome]}`}>{targets?.outcomeLabels[record.outcome]}</span>
                    : <span className="outcome unknown">Desfecho não tabulado</span>}
                  {record.spreadRateMmS !== null && <strong>{num(record.spreadRateMmS)} mm/s</strong>}
                </span>
                {mismatches.length > 0 && <span className="cmp-chips">{mismatches.map((m) => <i key={m}>{m}</i>)}</span>}
              </summary>
              <div className="cmp-detail">
                {record.notes.map((note) => <p key={note}>{note}</p>)}
                {record.spreadRateSource && <p>Taxa: {record.spreadRateSource.label}.</p>}
                {record.onegComparison?.burnLength && (
                  <p>Mesmo material em 1 g: comprimento queimado "{record.onegComparison.burnLength}", taxa "{record.onegComparison.spreadRate}".</p>
                )}
                <p className="cmp-source">
                  {record.source.file}, linha {record.source.row} · frames {record.framesStatus === "processed" ? "processados" : record.framesStatus === "available" ? "disponíveis, não processados" : "não publicados no PSI"} ·{" "}
                  <a href={record.source.url} target="_blank" rel="noreferrer">{record.investigation} <ArrowUpRight size={10} /></a>
                </p>
              </div>
            </details>
          </li>
        ))}
      </ol>
      {targets && <p className="model-caption">{targets.limits.join(" ")}</p>}
    </section>
  );
}

function CriterionRow({ criterion }: { criterion: Criterion }) {
  const Icon = STATUS_ICON[criterion.status];
  return (
    <li className={`criterion ${criterion.status}`}>
      <Icon size={13} aria-label={STATUS_TITLE[criterion.status]} />
      <span className="crit-label">{criterion.label}</span>
      <span className="crit-values"><strong>{criterion.scenario}</strong> <small>ensaio: {criterion.domain}</small></span>
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
  anchor.download = "habitatfire-alvos-modelagem.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
