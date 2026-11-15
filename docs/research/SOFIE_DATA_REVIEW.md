# SoFIE: revisão dos dados, P0/P1

Este documento cobre o programa Solid Fuel Ignition and Extinction (SoFIE), com prioridade para o SoFIE-GEL (Growth and Extinction Limit).

Documentos associados:

- [SOFIE_GEL_METHOD.md](SOFIE_GEL_METHOD.md): condições, variáveis e metodologia.
- [SOFIE_PILOT_REVIEW.md](SOFIE_PILOT_REVIEW.md): piloto, vídeo e calibração.
- [SOFIE_ANALYSIS.md](SOFIE_ANALYSIS.md): comparação, pipeline, resultados e próximas etapas.

Rótulos usados nos quatro documentos:

| Rótulo | Significado |
|---|---|
| **[NASA]** | Fato publicado pela NASA ou pelos pesquisadores (fonte citada) |
| **[PSI]** | Resultado de consulta ao NASA PSI |
| **[Medição]** | Medido aqui, em arquivo público |
| **[Derivado]** | Calculado a partir de números publicados |
| **[Inferência]** | Conclusão deste projeto |
| **[Hipótese]** | Não verificada |

Data das consultas: 15 nov 2026.

## 1. Resumo executivo

- **[PSI] Não existe investigação SoFIE pública no NASA PSI.** Consultei o índice de busca (30 termos) e os metadados de PSI-1 a PSI-230. Nenhum identificador PSI público corresponde ao GEL, RTDFS, MIST, NCA ou SMuRF. As ocorrências de "SoFIE" no PSI são citações dentro do BASS-II (PSI-25) e do BASS (PSI-26). **Nenhum ID PSI ou DOI de dataset foi atribuído aqui**, e 38 IDs abaixo de 150 (e outros acima de 150) retornam 403, ou seja, não são públicos.
- **[NASA] As fontes públicas são documentos e mídia de divulgação:**
  - um artigo de simpósio do GEL (NTRS 20240007628), com 5 casos de extinção quantificados (Tabela 1);
  - um artigo de 2025 na *Combustion and Flame* (DOI 10.1016/j.combustflame.2025.114244), cujo texto não pôde ser obtido (403); uso apenas o resumo;
  - duas apresentações do projeto (NTRS 2019);
  - a NASA Image and Video Library (um vídeo GEL e imagens GEL, MIST e RTDFS).
- **[Medição] Associação vídeo↔teste.** O vídeo público "SoFIE-GEL – flame appearing to spin itself into extinction" é uma edição do teste **1410C**, segundo o nome do arquivo-fonte nos metadados XMP. É o Caso 5 do artigo NTRS: 50 cm/s, extinção por blowoff, chamas giratórias de 2 a 3,5 Hz.
- **[Inferência]** O GEL é o melhor alvo entre os subexperimentos: é o único com resultados quantitativos publicados por teste e vídeo associável a um teste. Nenhum subexperimento tem tabelas ou telemetria públicas.

## 2. Identificadores e páginas oficiais

| Investigação | ID PSI | DOI do dataset | Página oficial | Responsável (seleção de 2009) |
|---|---|---|---|---|
| SoFIE (instalação) | **não encontrado** | — | [science.nasa.gov/…/sofie](https://science.nasa.gov/biological-physical/investigations/sofie/); [GRC SoFIE](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/solid-fuel-ignition-and-extinction-sofie/) | Gerente da instalação: P. Ferkul (GRC); operador ZIN Technologies |
| SoFIE-GEL | **não encontrado** | — | [science.nasa.gov/…/sofie-gel](https://science.nasa.gov/biological-physical/investigations/sofie-gel/) | James S. T'ien (CWRU) |
| SoFIE-RTDFS | **não encontrado** | — | página GRC | Subrata Bhattacharjee (SDSU) |
| SoFIE-MIST | **não encontrado** | — | science.nasa.gov/…/sofie-mist; página GRC | Carlos Fernandez-Pello (UC Berkeley) |
| SoFIE-NCA | **não encontrado** | — | página GRC | Fletcher Miller (SDSU) |
| SMμRF | **não encontrado** | — | página GRC | Sandra Olson (GRC) |

**Como a ausência foi verificada:**

- **[PSI] Busca no índice** `geode-py/ws/repo/search`, com termos como SoFIE, Solid Fuel Ignition, Growth and Extinction Limit, GEL, RTDFS, MIST, Narrow Channel, SMuRF, PMMA sphere, sphere, Ferkul, Olson, T'ien, Fernandez-Pello e extinction.
- **[PSI] Consulta direta** a `geode-py/ws/repo/investigations/PSI-n` para n = 1…230:
  - 112 IDs públicos abaixo de 150, nenhum SoFIE;
  - 150–230: só investigações de outras áreas (FAMIS, ACME CFI-G, ACE, PEP…) ou 403.
- **[Inferência]** Se os dados SoFIE estiverem num ID com 403, são não públicos (embargo ou curadoria em andamento). A página do GEL dizia apenas "Delivery to the ISS via NG-17" (atualizada em mai/2023).

## 3. Diferenças entre subinvestigações

Fonte: apresentações NTRS 20190030735 e 20200000361, página GRC, artigo GEL.

| | GEL | RTDFS | MIST | NCA | SMμRF |
|---|---|---|---|---|---|
| Combustível | Esfera de PMMA de 4 cm (página GRC: 4–5 cm; um slide de 2019 diz "40 cm-dia", provável erro de digitação) | Folhas finas de PMMA | Cilindros de PMMA (15 cm) e materiais de engenharia | Placa espessa de PMMA (10 × 5 × 1 cm) | Bastões (30 cm) e folhas (30 × 5 cm) |
| Configuração | Escoamento concorrente/forçado ao redor de corpo rombudo | Propagação oposta; efeito da espessura | Ignição com fluxo radiante externo; propagação oposta | Propagação oposta em canal estreito (em solo simula µg) | Correlação entre testes em 1 g e microgravidade ventilada |
| Grandeza principal | Crescimento e extinção da chama (forma, dimensões); limites de extinção vs fluxo, O₂, pressão e pré-aquecimento | Taxa de propagação; extinção radiativa (< 2 cm/s) e blowoff (> 40 cm/s) | Mapas de ignição e extinção | Taxa de propagação e limites de extinção | Limites de inflamabilidade |
| Amostras planejadas | 15 esferas, 3 testes por esfera | 24 folhas | 22 bastões | 20 placas | 43 (10 bastões, 33 folhas) |
| Mídia pública | 1 vídeo editado (1410C); imagens (13/01/2023, 09/03/2023, 21/03/2024) | Sequência de imagens (02/01/2025) | Imagens (08/08/2024) | Só artigos de solo (NTRS 2013, 2019) | — |
| Resultados quantitativos públicos | Tabela 1 com 5 casos (NTRS 20240007628); resumo de 2025 com faixas e mapa | Não encontrados | Não encontrados | Só em solo | Não encontrados |

**Decisão de escopo.** **[Inferência]** O GEL continua sendo o alvo. RTDFS e NCA não têm dados de voo públicos mais completos: o NCA tem apenas resultados de solo. Os subexperimentos não são misturados, e os artigos de NCA ficam só como referência de metodologia de propagação oposta.

## 4. Dados e arquivos recuperados

A aquisição é feita por [`scripts/sofie/fetch_sofie.py`](../../scripts/sofie/fetch_sofie.py) e registrada em [`data/sofie/docs-manifest.json`](../../data/sofie/docs-manifest.json).

- **Uso do orçamento:**
  - documentos e imagens: **10 226 910 bytes** (teto de 120 MB);
  - vídeo piloto: **27 042 449 bytes** (teto de 50 MB).
- **Forma de download:** `.part` com renomeação atômica, SHA-256 de cada arquivo, conferência do tipo do arquivo (PDF, JPEG, MP4) e lista fixa de hosts permitidos.
- **Cache:** `data/cache/sofie/`, ignorado pelo Git.

| Arquivo | Origem | Bytes | Conteúdo |
|---|---|---:|---|
| NTRS-20240007628_GELsymposiumfinalRev1.pdf | ntrs.nasa.gov | 2 663 061 | Li, T'ien, Ferkul, Olson e Johnston: extinção (quenching/blowoff), Tabela 1 com 5 casos |
| NTRS-20190030735.pdf | ntrs.nasa.gov | 3 539 942 | SoFIE Design/Status (2019) |
| NTRS-20200000361.pdf | ntrs.nasa.gov | 2 940 091 | SoFIE Project on ISS (2019): amostras e operação |
| NTRS-20140004923.pdf | ntrs.nasa.gov | 493 217 | NCA (solo): propagação oposta sobre PMMA fino |
| media/jsc2023e002281_orig.jpg | images-assets.nasa.gov | 104 515 | 1º teste GEL (13/01/2023), 17,5 % O₂, 20 cm/s |
| media/jsc2023e013681_orig.jpg | images-assets.nasa.gov | 306 119 | Montagem a cerca de 3 s, 28 % O₂, extinção por redução de pressão |
| media/jsc2024e021222_orig.jpg | images-assets.nasa.gov | 173 007 | Teste GEL com LED verde (superfície visível) |
| media/SoFIE-GEL_metadata.json | images-assets.nasa.gov | 6 958 | exiftool/XMP do vídeo: ingrediente "1410C with Interstellar theme.mp4" |
| media/SoFIE-GEL_large.mp4 | images-assets.nasa.gov | 27 042 449 | Vídeo piloto (derivado "large"; o original de 59 451 335 bytes excede 50 MB) |

**Falha registrada.** O artigo de 2025 tem versão final em acesso aberto (CC BY-NC-ND 4.0) em commons.case.edu, mas o servidor e a editora responderam **HTTP 403** a acesso automatizado. A falha fica no manifesto, e não tentei contornar o bloqueio. Usei apenas o resumo da página de registro.

## 5. Auditoria do repositório

| Local | SoFIE? |
|---|---|
| `data/raw/psi/` (24 investigações) | Não. O PSI-25 (BASS-II) cita "Provide SoFIE PIs with preliminary data" |
| `public/data/nasa-experiments.json`, `nasa-provenance.json` | Não (só a mesma citação do PSI-25) |
| `public/data/research-corpus.json` | Passagens textuais sobre SoFIE (BASS como precursor; inserto CIR; atmosferas de exploração). Nenhum dado |
| `scripts/sync_nasa.py`, `scripts/build_research_corpus.py` | Não há ID SoFIE no catálogo |
| `src/components/ExperimentExplorer.tsx`, `src/types.ts` | Nada específico |
| `docs/research/` | Nada |
| `origin/feat/simu-estocastica` (só leitura) | Protótipo estocástico do Saffire. Base anterior à `main` (563f4e2); a `main` já contém os documentos Saffire |
| `origin/feat/bass2-propagation`, `origin/feat/same-smoke-analysis` (só leitura) | Estrutura de pipeline reaproveitável como padrão (§6) |

## 6. Reuso de trabalhos anteriores

- **Reutilizado como padrão, não como código importado:**
  - aquisição com manifesto, retomada, renomeação atômica e SHA-256 (BASS-II e SAME);
  - JSON derivado com `--check`;
  - rótulos de tipo de valor (SAME);
  - duas hipóteses explícitas de base de tempo (BASS-II).
- **Não reutilizado:** a segmentação de frente do BASS-II. Ela mede a posição de uma frente sobre uma lâmina plana vista de perfil, uma geometria que não existe no GEL (corpo esférico 3-D, chama envolvente, ponta e base da chama). O piloto mede uma grandeza sem escala (frequência), escolhida justamente para não depender dessa transferência.
