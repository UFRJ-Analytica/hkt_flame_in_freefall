import { AlertTriangle, ArrowUpRight, CheckCircle2, Crosshair, HelpCircle } from "lucide-react";
import {
  compareToTrial, LEVEL_LABEL, OBSERVABLE_LABEL, rankTrials,
  type AnchorKernel, type RunLevel, type Trial,
} from "./trials";

const num = (n: number | null | undefined, digits = 1) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const DIFF_ICON = { match: CheckCircle2, untabulated: HelpCircle, differs: AlertTriangle };
const DIFF_TEXT = { match: "dentro da tolerância", untabulated: "não tabulado no ensaio", differs: "difere: extrapolação" };

/** Which model is computing, from which trial, and how far the scenario is from it. Observed,
 *  trial-conditioned simulation and scenario result are shown as three separate levels. */
export function ModelInUse({ anchor, level, diffs, kernel, flowRule, scenarioSpeed, onRunTrial }: {
  anchor: Trial; level: RunLevel; diffs: ReturnType<typeof compareToTrial>; kernel: AnchorKernel | undefined;
  flowRule: string; scenarioSpeed: number | null; onRunTrial: () => void;
}) {
  const c = anchor.conditions;
  const assumed = diffs.filter((d) => d.status === "untabulated").map((d) => d.label);
  const sources = [...new Map(anchor.conditionSources.map((s) => [s.label, s])).values()];
  return (
    <section className="model-in-use">
      <span className="eyebrow">MODELO EM USO</span>
      <h3>{anchor.campaign} · {anchor.sample} <small>{anchor.material}</small></h3>
      <p className="anchor-conditions">
        {c.oxygenPct !== null ? `${num(c.oxygenPct)}% O₂` : "O₂ não tabulado"} · {c.pressureKpa !== null ? `${num(c.pressureKpa)} kPa` : "pressão não tabulada"} ·{" "}
        {c.flowCmS} cm/s {c.flowDirection === "concurrent" ? "a favor" : "contra"} · microgravidade
      </p>
      <div className="anchor-sources">
        {sources.map((s) => s.url
          ? <a key={s.label} href={s.url} target="_blank" rel="noreferrer">{s.label} <ArrowUpRight size={10} /></a>
          : <span key={s.label}>{s.label}</span>)}
      </div>

      <ol className="levels">
        <li className="lvl observed">
          <span className="lvl-n">1</span>
          <div>
            <strong>Observado no ensaio</strong>
            {anchor.observables.map((o) => (
              <p key={`${o.kind}-${o.window}`}><b>{num(o.speedMmS, 2)} mm/s</b> · {OBSERVABLE_LABEL[o.kind]} · {o.window}
                {o.source.url && <> · <a href={o.source.url} target="_blank" rel="noreferrer">{o.source.label}</a></>}</p>
            ))}
          </div>
        </li>
        <li className="lvl conditioned">
          <span className="lvl-n">2</span>
          <div>
            <strong>Simulado na placa do ensaio · condicionado ao ensaio</strong>
            {kernel
              ? <p><b>{num(kernel.simulatedAtTrialMmS, 2)} mm/s</b> na placa do ensaio · alvo {num(kernel.target.speedMmS, 2)} mm/s ({OBSERVABLE_LABEL[kernel.target.kind].toLowerCase()})</p>
              : <p>Calibrando o núcleo…</p>}
            {kernel?.target.kind === "flame-base" && <p className="lvl-note">O núcleo propaga células alcançadas; ajustá-lo à taxa da base da chama assume regime estacionário (base e frente de pirólise avançando juntas). Não é a mesma observação que a frente carbonizada dos ensaios I e III.</p>}
            {kernel && kernel.borrowed.length > 0 && <p className="lvl-note">Informação emprestada de outro ensaio: {kernel.borrowed.join(", ")}.</p>}
            {kernel && <p className="lvl-note">O fator de intensidade foi ajustado a esta velocidade; essa informação foi usada na calibração e não é teste intocado.</p>}
          </div>
        </li>
        <li className={`lvl scenario ${level}`}>
          <span className="lvl-n">3</span>
          <div>
            <strong>Seu cenário · {LEVEL_LABEL[level]}</strong>
            <p><b>{scenarioSpeed !== null ? `${num(scenarioSpeed, 2)} mm/s` : "—"}</b> na parede do habitat</p>
            <p className="lvl-note">{flowRule}</p>
            {assumed.length > 0 && <p className="lvl-note">Não tabulado no ensaio (permanece desconhecido, não é atribuído ao ensaio): {assumed.join(", ").toLowerCase()}.</p>}
          </div>
        </li>
      </ol>

      <table className="diff-table">
        <thead><tr><th>Condição</th><th>Cenário</th><th>Ensaio</th></tr></thead>
        <tbody>
          {diffs.map((d) => {
            const Icon = DIFF_ICON[d.status];
            return (
              <tr key={d.field} className={d.status}>
                <td><Icon size={12} aria-label={DIFF_TEXT[d.status]} /> {d.label}</td>
                <td>{d.scenario}</td>
                <td>{d.trial}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="model-caption">Uma condição só corresponde ao valor nominal ou à faixa documentada do ensaio, sem tolerância inventada; condição não tabulada permanece desconhecida. A parede do habitat nunca é a placa do ensaio, por isso o cenário é no máximo exploratório (critérios de aceitação, seção C).</p>
      {level !== "trial-conditions" && (
        <button className="button secondary trial-run" onClick={onRunTrial}><Crosshair size={13} /> Rodar nas condições do ensaio</button>
      )}
    </section>
  );
}

export function TrialList({ ranked, selected, auto, onSelect, registrySource }: {
  ranked: ReturnType<typeof rankTrials>; selected: string | null; auto: boolean; onSelect: (id: string) => void; registrySource: string;
}) {
  return (
    <section className="trial-list">
      <h3 className="model-h">Ensaios compatíveis</h3>
      <ul>
        {ranked.map(({ trial, diffs }) => {
          const differing = diffs.filter((d) => d.status === "differs").map((d) => d.label);
          return (
            <li key={trial.id}>
              <button type="button" aria-pressed={trial.id === selected} onClick={() => onSelect(trial.id)}>
                <span className="tl-name">{trial.campaign} · {trial.sample} <small>{trial.material}</small></span>
                <span className="tl-cond">
                  {trial.conditions.oxygenPct !== null ? `${num(trial.conditions.oxygenPct)}%` : "O₂ ?"} · {trial.conditions.pressureKpa !== null ? `${num(trial.conditions.pressureKpa)} kPa` : "P ?"} · {trial.conditions.flowCmS} cm/s
                </span>
                <span className={`tl-diff ${differing.length ? "warn" : "ok"}`}>{differing.length ? `difere em ${differing.join(", ")}` : "todas as condições tabuladas batem"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="model-caption">
        {auto ? "Seleção automática: o ensaio mais próximo do cenário. " : ""}Ordenado por distância em material, O₂, pressão e escoamento; a distância não é probabilidade. Registro: {registrySource}.
      </p>
      {!auto && <button className="text-link subtle" onClick={() => onSelect("auto")}>Voltar à seleção automática</button>}
    </section>
  );
}
