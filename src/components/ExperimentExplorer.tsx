import { lazy, Suspense, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Beaker,
  ChevronRight,
  Database,
  Search,
  SlidersHorizontal,
  Wind,
  X,
} from "lucide-react";
import type { ExperimentTest, Investigation, NasaData } from "../types";
import { CATEGORY_LABELS, number } from "../config";
import { useModalFocus } from "../hooks/useModalFocus";
import { RecordVideos } from "./research/RecordVideos";
import { SAME_INVESTIGATION_ID } from "./research/sameSmoke";

// Loaded on request only: the SAME evidence module and its JSON stay out of the first render.
const SameSmokeObservation = lazy(() => import("./research/SameSmokeObservation"));

export function ExperimentExplorer({
  data,
  onApply,
  applicationPending = false,
}: {
  data: NasaData;
  onApply: (test: ExperimentTest) => void;
  applicationPending?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedId, setSelectedId] = useState("PSI-25");
  const [detail, setDetail] = useState<ExperimentTest | null>(null);
  const [page, setPage] = useState(0);
  const [smokeOpen, setSmokeOpen] = useState(false);
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
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
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
          <span className="eyebrow">CATÁLOGO NASA PSI</span>
          <h1>Dados reais. Contexto preservado.</h1>
          <p>
            Consulte os registros originais, suas unidades e o contexto de cada
            investigação.
          </p>
        </div>
        <span className="source-badge">
          <Database size={14} />
          Snapshot NASA PSI
        </span>
      </div>
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
          Todas as famílias
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
                <strong>{investigation.name}</strong>
                <small>
                  {investigation.id} ·{" "}
                  {investigation.testCount > 0
                    ? `${investigation.testCount} registros`
                    : "Metadados"}
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
                  <h2>{selected.title || selected.name}</h2>
                  <p>{selected.description}</p>
                </div>
                <a
                  className="icon-button"
                  title="Abrir investigação original NASA"
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
                    ? "Tabela conectada"
                    : selected.status === "metadata-only"
                      ? "Somente metadados"
                      : "Dados indisponíveis"}
                </span>
                <span>{selected.platform}</span>
                <span>
                  {number(selected.testCount, 0)} registros importados
                </span>
              </div>
              {selected.recordGrain && (
                <p className="record-grain">
                  Unidade da tabela: {selected.recordGrain}.
                </p>
              )}
              {selected.id === SAME_INVESTIGATION_ID && (
                <div className="same-entry">
                  <div>
                    <strong>Smoke &amp; Detection: evidência do SAME</strong>
                    <p>
                      Fumaça de materiais superaquecidos (não propagação de
                      chama): Tabela 1 agregada por material, envelhecimento,
                      razão DustTrak B/A e resposta dos detectores da ISS e do
                      Space Shuttle, com cada valor rotulado como publicado,
                      medido, derivado, hipótese ou indisponível. Os 8 registros
                      abaixo reproduzem a matriz de testes planejada, não os 47
                      testes voados.
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() => setSmokeOpen(true)}
                  >
                    <Wind size={15} />
                    Abrir análise Smoke &amp; Detection
                  </button>
                </div>
              )}
              <details className="data-notice">
                <summary>
                  Contexto e limites desta investigação (
                  {selected.limitations.length})
                </summary>
                {selected.limitations.map((limitation, index) => (
                  <p key={index}>{limitation}</p>
                ))}
              </details>
              {selected.tests.length > 0 ? (
                <>
                  <div className="table-toolbar">
                    <label className="search-field">
                      <Search size={16} />
                      <input
                        aria-label="Buscar experimento ou material"
                        placeholder="Buscar teste, material ou condição…"
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setPage(0);
                        }}
                      />
                    </label>
                    <button className="button secondary" onClick={downloadRows}>
                      <ArrowDownToLine size={15} />
                      Exportar dados
                    </button>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Registro</th>
                          <th>Material / combustível</th>
                          <th>O₂ inicial</th>
                          <th>Pressão</th>
                          <th>Fluxo</th>
                          <th aria-label="Detalhes" />
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
                                  {test.label || test.id}
                                </button>
                              </td>
                              <td>{test.material || "Não informado"}</td>
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
                        Nenhum teste corresponde à sua busca.
                      </div>
                    )}
                  </div>
                  <div className="table-pagination">
                    <span>
                      {filtered.length ? safePage * pageSize + 1 : 0}–
                      {Math.min((safePage + 1) * pageSize, filtered.length)} de{" "}
                      {filtered.length} registros
                    </span>
                    <div>
                      <button
                        className="button secondary small"
                        disabled={safePage === 0}
                        onClick={() => setPage(safePage - 1)}
                      >
                        Anterior
                      </button>
                      <button
                        className="button secondary small"
                        disabled={(safePage + 1) * pageSize >= filtered.length}
                        onClick={() => setPage(safePage + 1)}
                      >
                        Próxima
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <Database size={26} />
                  <h3>Investigação catalogada</h3>
                  <p>
                    Não há tabela numérica importada neste snapshot. Acesse a
                    fonte para documentos e mídias; não substituímos medições
                    ausentes por dados sintéticos.
                  </p>
                  <a
                    href={selected.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    Explorar na NASA <ArrowUpRight size={14} />
                  </a>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              Nenhuma investigação nesta categoria.
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
                  {detail.investigationId} · REGISTRO ORIGINAL
                </span>
                <h2 id="test-detail-title">{detail.label || detail.id}</h2>
              </div>
              <button
                className="icon-button"
                aria-label="Fechar detalhes"
                onClick={() => setDetail(null)}
              >
                <X size={20} />
              </button>
            </div>
            <p className="muted">
              Campos preservados da tabela NASA. Ausência de um valor não
              significa zero ou extinção.
            </p>
            {detail.sourceFile && (
              <p className="record-origin">
                {detail.sourceFile} · registro CSV {detail.sourceRow}
              </p>
            )}
            {detail.normalizationNotes &&
              detail.normalizationNotes.length > 0 && (
                <div className="data-notice">
                  {detail.normalizationNotes.join(" ")}
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
            <div className="data-notice">
              Aplicar copia apenas condições numéricas disponíveis. O
              experimento não é uma validação da cabine nem da animação.
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
              Usar condições no laboratório <ChevronRight size={16} />
            </button>
          </section>
        </div>
      )}
      {smokeOpen && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <p className="same-loading">Carregando análise SAME…</p>
            </div>
          }
        >
          <SameSmokeObservation onClose={() => setSmokeOpen(false)} />
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
          <span className="eyebrow">PROVENIÊNCIA & LIMITES</span>
          <h1>Uma fonte para cada afirmação.</h1>
          <p>O que foi importado, de onde veio e o que ainda não sabemos.</p>
        </div>
      </div>
      <div className="provenance-banner">
        <Database size={24} />
        <div>
          <strong>NASA Physical Sciences Informatics</strong>
          <p>
            Snapshot recuperado em{" "}
            {new Date(data.retrievedAt).toLocaleString("pt-BR")}. A aplicação
            usa os arquivos locais importados, sem depender da disponibilidade
            do portal durante a demonstração. As contagens representam registros
            tabulares, incluindo resumos e referências, não ensaios
            independentes.
          </p>
          <a
            className="provenance-download"
            href={`${import.meta.env.BASE_URL}data/nasa-provenance.json`}
            download="habitatfire-proveniencia.json"
          >
            <ArrowDownToLine size={13} />
            Baixar manifesto de origem e hashes SHA-256
          </a>
        </div>
      </div>
      <div className="source-grid">
        {data.investigations.map((i) => (
          <SourceCard key={i.id} investigation={i} />
        ))}
      </div>
      <div className="limitations-panel">
        <h2>Visualização não é certificação.</h2>
        <p>
          A cabine é uma interpretação geométrica, não um modelo CAD oficial. A
          animação é ilustrativa: não há CFD, propagação calibrada,
          probabilidade de detecção ou eficácia de supressão calculadas nesta
          versão.
        </p>
        <p>
          Experimentos com sólidos, gotículas e gases são apresentados como
          famílias diferentes. Não usamos seus resultados como rótulos
          intercambiáveis de um único classificador. Condições da cabine e
          resultados locais não herdam validação de um ensaio.
        </p>
        <p>
          Materiais atribuídos à cabine são hipóteses editáveis do cenário, não
          uma declaração da composição real da Orion ou da ISS.
        </p>
      </div>
      {data.errors.length > 0 && (
        <div className="limitations-panel">
          <h3>Limitações da última sincronização</h3>
          {data.errors.map((e, n) => (
            <p key={`${e.id}-${n}`}>
              {e.id}: {e.message}
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
          {i.status === "downloaded" ? "Tabela importada" : "Metadados"}
        </span>
      </div>
      <h2>{i.name}</h2>
      <p>{i.title}</p>
      <div className="source-card-meta">
        {CATEGORY_LABELS[i.category]} · {i.platform}
      </div>
      <strong className="record-count">
        {i.testCount > 0
          ? `${i.testCount} registros disponíveis`
          : "Sem tabela numérica importada"}
      </strong>
      {i.doi && <small className="mono">DOI {i.doi}</small>}
      <div className="source-card-links">
        <a href={i.sourceUrl} target="_blank" rel="noreferrer">
          Investigação NASA <ArrowUpRight size={14} />
        </a>
        {i.dataUrl && (
          <a href={i.dataUrl} target="_blank" rel="noreferrer">
            Arquivo original <ArrowUpRight size={14} />
          </a>
        )}
      </div>
    </article>
  );
}
