import type { ReactNode } from "react";
import { ArrowUpRight, BookOpen, Info } from "lucide-react";
import { SAFFIRE_SOURCE, type SaffireModel } from "../saffire";
import { wilson } from "./domain";
import "./model.css";

const NTRS = "https://ntrs.nasa.gov/api/citations/20170008805/downloads/20170008805.pdf";
const pct = (p: number, digits = 1) => `${(p * 100).toLocaleString("pt-BR", { maximumFractionDigits: digits })}%`;
const num = (n: number | undefined | null, digits = 1) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: digits });
const NEIGHBOUR_LABEL = (key: string) =>
  [key[0] === "1" && "Montante", key[1] === "1" && "Acima", key[2] === "1" && "Abaixo"].filter(Boolean).join(" + ");

export type EnsemblePoint = { timeS: number; min: number; max: number; median: number };

export function SaffireEvidence({ model, ensemble, time, seedCount, children }: {
  model: SaffireModel | null;
  ensemble: EnsemblePoint[];
  time: number;
  seedCount: number;
  /** Extra sections rendered before the sources, e.g. the opposed-flow (S2) card. */
  children?: ReactNode;
}) {
  if (!model) {
    return (
      <aside className="evidence-panel model-panel" aria-label="Evidência SAFFIRE">
        <div className="panel-title"><BookOpen size={15} /><h2>Modelo de avanço</h2></div>
        <p className="model-muted">Carregando o artefato do ensaio…</p>
      </aside>
    );
  }
  const holdout = model.neighborhoodHoldout?.combinations ?? {};
  let brierModel = 0, brierConstant = 0, holdoutN = 0;
  for (const [key, entry] of Object.entries(model.combinations)) {
    const test = holdout[key];
    if (entry.probability === null || !test?.exposures) continue;
    const p = entry.probability, q = model.probability, T = test.transitions, N = test.exposures;
    brierModel += T * (1 - p) ** 2 + (N - T) * p ** 2;
    brierConstant += T * (1 - q) ** 2 + (N - T) * q ** 2;
    holdoutN += N;
  }
  const split = model.diagnostics?.splitTimeS ?? Math.round(model.durationSeconds * 0.7);
  const nb = model.comparison.neighborhood;
  return (
    <aside className="evidence-panel model-panel" aria-label="Evidência SAFFIRE">
      <div className="panel-title"><BookOpen size={15} /><h2>Modelo de avanço</h2><span className="model-badge warn">1 ensaio</span></div>
      <div className="model-panel-body">
        <section className="model-question">
          <span className="eyebrow">O QUE ESTE MODELO RESPONDE</span>
          <p>Com a chama já acesa na borda a montante, quais células da folha a frente alcança a cada 2 s.</p>
          <p className="model-negative"><Info size={12} /> Não estima a probabilidade de um incêndio começar: o ensaio usa ignição forçada.</p>
        </section>

        <section>
          <h3 className="model-h">Domínio de validade</h3>
          <dl className="model-domain">
            <dt>Material</dt><dd>SIBAL 0,37 mm · 940 × 406 mm</dd>
            <dt>Escoamento</dt><dd>20 cm/s, concorrente</dd>
            <dt>O₂</dt><dd>21,5–21,7%</dd>
            <dt>Pressão</dt><dd className="unknown">não tabulada</dd>
            <dt>Gravidade</dt><dd>microgravidade · Cygnus</dd>
            <dt>Ignição</dt><dd>182 W por 8 s <span className="model-flag" title="A p. 23 do NTRS 20170008805 cita 165 W; tabela PSI e p. 31 citam 182 W.">165 W na p. 23</span></dd>
          </dl>
        </section>

        <section>
          <h3 className="model-h">Frente observada × simulada</h3>
          <FrontChart model={model} ensemble={ensemble} time={time} split={split} />
          <p className="model-caption">
            Mediana entre faixas da posição da frente. Faixa âmbar: mínimo–máximo de {seedCount} realizações com parâmetros fixos
            (variabilidade do próprio modelo, não incerteza experimental). Até {split} s os dados entraram no ajuste.
          </p>
        </section>

        <section>
          <h3 className="model-h">Probabilidade de avanço em 2 s</h3>
          <div className="prob-table" role="table" aria-label="Probabilidades por vizinhança">
            <div className="prob-row head" role="row">
              <span role="columnheader">Vizinhos alcançados</span>
              <span role="columnheader">Ajuste · IC 95%</span>
              <span role="columnheader">Reservado</span>
            </div>
            {Object.entries(model.combinations).filter(([key]) => key !== "000").map(([key, entry]) => {
              const test = holdout[key];
              const [lo, hi] = wilson(entry.transitions, entry.exposures);
              return (
                <div className="prob-row" role="row" key={key}>
                  <span role="cell" className="prob-label">
                    {NEIGHBOUR_LABEL(key)}
                    <small>{num(entry.transitions, 0)}/{num(entry.exposures, 0)} avanços</small>
                  </span>
                  <span role="cell">
                    {entry.probability === null ? <em className="model-muted">sem estimativa · {entry.reason ?? "dados insuficientes"}</em> : <>
                      <strong>{pct(entry.probability)}</strong>
                      <span className="prob-bar" aria-hidden>
                        <i style={{ left: `${lo * 100}%`, width: `${Math.max(1, (hi - lo) * 100)}%` }} />
                        <b style={{ left: `${entry.probability * 100}%` }} />
                      </span>
                      <small>{pct(lo)}–{pct(hi)}{entry.transitions < 5 ? " · poucos eventos" : ""}</small>
                    </>}
                  </span>
                  <span role="cell">
                    {test?.exposures ? <>
                      <strong className="holdout">{pct(test.transitions / test.exposures)}</strong>
                      <small>{num(test.transitions, 0)}/{num(test.exposures, 0)}</small>
                    </> : <em className="model-muted">—</em>}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="model-caption">
            "Acima/abaixo" são faixas vizinhas da folha, não a direção da gravidade. Sem nenhum vizinho alcançado, o modelo não
            propaga. O intervalo de Wilson trata cada exposição como independente; células e instantes são correlacionados,
            então a incerteza real é maior.
          </p>
        </section>

        <section>
          <h3 className="model-h">Checagem no trecho reservado <span className="model-badge">mesmo ensaio</span></h3>
          <div className="model-metrics">
            <div><strong>{num(nb.positionMaeMm.mean)} mm</strong><span>erro médio de posição<br />({num(nb.positionMaeMm.min)}–{num(nb.positionMaeMm.max)} entre {model.comparison.seedCount} sementes)</span></div>
            <div><strong>{num(model.comparison.baseline.positionMaeMm.mean)} mm</strong><span>mesmo erro com p constante ({pct(model.probability)})</span></div>
            <div><strong>{num(nb.simulatedSpeedMmS.mean, 2)} <small>mm/s</small></strong><span>velocidade simulada · {num(model.comparison.observedSpeedMmS, 2)} observada</span></div>
            {holdoutN > 0 && <div><strong>{num(brierModel / holdoutN, 3)}</strong><span>Brier de 1 passo · {num(brierConstant / holdoutN, 3)} com p constante ({num(holdoutN, 0)} células-passo)</span></div>}
          </div>
          {model.diagnostics?.annotation && (
            <p className="model-caption">
              Extração da frente: erro de {num(model.diagnostics.annotation.maeMm)} mm contra {model.diagnostics.annotation.matchedPoints} de{" "}
              {model.diagnostics.annotation.annotatedPoints} pontos anotados; diferença mediana entre câmeras de {num(model.diagnostics.medianOverlapErrorMm)} mm;
              cobertura de {pct(model.diagnostics.coverage ?? 0)}.
            </p>
          )}
          <div className="domain-note">
            <Info size={14} />
            <span>Separação temporal dentro de um único ensaio. Não valida outro material, geometria, atmosfera ou gravidade.</span>
          </div>
        </section>

        {children}

        <div className="model-sources">
          <a href={SAFFIRE_SOURCE} target="_blank" rel="noreferrer">PSI-98 · dados e frames <ArrowUpRight size={12} /></a>
          <a href={NTRS} target="_blank" rel="noreferrer">NTRS 20170008805 <ArrowUpRight size={12} /></a>
        </div>
      </div>
    </aside>
  );
}

function FrontChart({ model, ensemble, time, split }: { model: SaffireModel; ensemble: EnsemblePoint[]; time: number; split: number }) {
  const W = 300, H = 150, L = 34, R = 8, T = 10, B = 22;
  const tMax = model.durationSeconds, yMax = model.grid.lengthMm;
  const x = (t: number) => L + (t / tMax) * (W - L - R);
  const y = (mm: number) => T + (1 - mm / yMax) * (H - T - B);
  const observed = (model.observedTrajectory ?? []).filter((p) => p.frontMedianMm !== null);
  const band = ensemble.length
    ? `M${ensemble.map((p) => `${x(p.timeS)},${y(p.max)}`).join("L")}L${[...ensemble].reverse().map((p) => `${x(p.timeS)},${y(p.min)}`).join("L")}Z`
    : "";
  const line = (pts: [number, number][]) => pts.map(([a, b], i) => `${i ? "L" : "M"}${x(a)},${y(b)}`).join("");
  const ticksY = [0, 300, 600, 900];
  const ticksX = [0, 100, 200, 300];
  return (
    <svg className="front-chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Posição da frente ao longo de ${tMax} s: observada nas câmeras e faixa de realizações simuladas`}>
      <rect x={x(split)} y={T} width={x(tMax) - x(split)} height={H - T - B} className="fc-holdout" />
      {ticksY.map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="fc-grid" /><text x={L - 5} y={y(v) + 3} className="fc-tick" textAnchor="end">{v}</text></g>)}
      {ticksX.map((v) => <text key={v} x={x(v)} y={H - 8} className="fc-tick" textAnchor="middle">{v} s</text>)}
      <text x={x(split) + 4} y={T + 9} className="fc-label">reservado</text>
      <text x={L + 4} y={T + 9} className="fc-label">ajuste</text>
      {band && <path d={band} className="fc-band" />}
      {ensemble.length > 0 && <path d={line(ensemble.map((p) => [p.timeS, p.median]))} className="fc-sim" />}
      <path d={line(observed.map((p) => [p.timeS, p.frontMedianMm as number]))} className="fc-obs" />
      <line x1={x(Math.min(time, tMax))} x2={x(Math.min(time, tMax))} y1={T} y2={H - B} className="fc-now" />
      <text x={6} y={T + 2} className="fc-tick" transform={`rotate(-90 6 ${T + 2})`} textAnchor="end">mm</text>
      <g className="fc-legend" transform={`translate(${L + 6}, ${T + 24})`}>
        <line x1={0} x2={12} y1={0} y2={0} className="fc-obs" /><text x={16} y={3}>câmeras</text>
        <line x1={0} x2={12} y1={11} y2={11} className="fc-sim" /><text x={16} y={14}>simulação (mediana)</text>
      </g>
    </svg>
  );
}
