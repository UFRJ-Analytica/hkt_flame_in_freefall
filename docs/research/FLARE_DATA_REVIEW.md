# FLARE: revisão dos dados, P0/P1

O FLARE (*Fundamental Research on International Standard of Fire Safety in Space – Base for Safety of Future Manned Missions*, ou *Flammability Limits at Reduced-g Experiment*) é uma investigação liderada pela JAXA. O PI é Osamu Fujita (Hokkaido University). Participam NASA (GRC, WSTF), ESA e universidades no Japão, nos EUA e na França.

Documentos associados:

- [FLARE_METHOD.md](FLARE_METHOD.md): variáveis, definições e modelos;
- [FLARE_ANALYSIS.md](FLARE_ANALYSIS.md): resultados, comparação e próximas etapas;
- [FLARE_PILOT_REVIEW.md](FLARE_PILOT_REVIEW.md): piloto.

Rótulos usados nos quatro documentos:

| Rótulo | Significado |
|---|---|
| **[NASA/JAXA]** | Informação oficial |
| **[Publicado]** | Resultado científico publicado |
| **[Medição]** | Valor experimental |
| **[Derivado]** | Cálculo reproduzido aqui |
| **[Digitalizado]** | Extraído de figura (nenhum nesta fase) |
| **[Inferência]** | Interpretação deste projeto |
| **[Hipótese]** | Não confirmada |

Data das consultas: 15 nov 2026.

## 1. Inventário de fontes

| Fonte | Situação | Conteúdo útil |
|---|---|---|
| [Página JAXA do FLARE](https://humans-in-space.jaxa.jp/en/biz-lab/experiment/theme/detail/000807.html) | lida (web) | **[NASA/JAXA]** Objetivos: MLOC em microgravidade; comparação com 1g; nova metodologia de previsão; norma internacional. Amostras planas, bastões e fios isolados. Fluxo oposto e concorrente menor que 30 cm/s. SCEM no MSPR/Kibo. Sem números de condições |
| [Página NASA GRC do FLARE](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/flammability-limits-at-reduced-g-experiment-flare/) | cópia local (`data/raw/research/nasa-flare.html`) | **[NASA/JAXA]** Equipe; campanhas em 1g, voo parabólico e ISS/Kibo; mesmo hardware do "Solid Combustion"; número de Damköhler crítico |
| NTRS 20160001023 (Task Group 5, WSTF) | baixado (1,13 MB) | **[NASA/JAXA]** Campanha terrestre NASA: NASA-STD-6001 Test 1, ignitor de fio quente, materiais (LDPE, ETFE, HDPE, PMMA de 0,8/2,99/5,99 mm, Nomex HT90-40). Sem valores de MOC |
| NASA Annual Highlights 2024 | baixado (12,5 MB) | **[NASA/JAXA]** Resumo do artigo de 2024: 19 experimentos; corridas #16 e #29 na Fig. 28; modelo revisto |
| Folheto JAXA de 2026 | baixado (1,43 MB) | **[NASA/JAXA]** SCEM: pressão atmosférica e baixa, O₂ até 45 %, fluxo recirculado com colmeia e anemômetro de fio quente, câmeras visível/IR/alta velocidade. Amostras: papel-filtro, NOMEX, acrílico, fios. FLARE-2 e FLARE-3 (gravidade lunar e parcial) |
| Takahashi e Maruta, TASTJ 16 (2018) 28 | baixado, J-STAGE aberto (1,0 MB) | **[Publicado]** Modelo de escala (R_rad + 1/Da = 1); **Tabela 2**: LOC1g e MLOC de PMMA e NOMEX (medido e previsto) |
| Tsuboi et al., TASTJ 14 (2016) Ph_1 | baixado, J-STAGE aberto (0,82 MB) | **[Publicado]** **Tabela 2**: LOC, MLOC, ΔO₂ e Vcr de PMMA em N₂, CO₂ e Ar (medido e previsto); **Tabela 1**: propriedades dos gases |
| Takahashi et al., PROCI 40 (2024) 105200, papel-filtro na ISS | **bloqueado** (ScienceDirect HTTP 403); CC BY-NC-ND | Resumo e metadados (OpenAlex/Crossref) em `data/flare/sources/publications-metadata.json` |
| Takahashi et al., CNF 286 (2026) 114803, PMMA/NOMEX na ISS | **bloqueado** (403); CC BY-NC-ND | Resumo e metadados |
| Kobayashi et al., PROCI 42 (2026) 106032, papel-filtro na ISS | **bloqueado** (não tentado, mesmo host); CC BY | Resumo: propagação 2-D de 1,0–1,5 mm/s; modo flamelet |
| Takahashi et al., Fire Technology 60 (2024) 313, papel-filtro na ISS | **bloqueado**: cópia aberta no repositório JAXA em manutenção (JAIRO Cloud, HTTP 503 desde 28/10/2026) | Metadados |
| ICES 2026, 109009 (CFRP) e 108903 (gravidade parcial) | **falha** (HTTP 403 no repositório TTU) | Metadados |

**Aquisição.**

- O script é [`scripts/flare/fetch_flare.py`](../../scripts/flare/fetch_flare.py). Ele usa uma lista fixa de hosts permitidos e faz downloads retomáveis (`.part`) e atômicos, conferindo o tipo do arquivo e calculando o SHA-256.
- Total baixado: **16 863 770 bytes**, de um teto de 120 MB. O manifesto é [`data/flare/docs-manifest.json`](../../data/flare/docs-manifest.json); o cache fica em `data/cache/flare/`, ignorado pelo Git.
- **Nenhum bloqueio (403, 503, autenticação) foi contornado.** Uma tentativa de acessar a API de texto completo da Elsevier foi negada pela política de permissões da sessão e não foi repetida por outra via.
- **Vídeos:** nenhum baixado, porque nenhum vídeo público foi associado a um teste FLARE.

## 2. NASA PSI

**[Medição] Não existe investigação FLARE no NASA PSI.**

- **Busca no índice:** FLARE, Flammability Limits, Flammability Limits at Reduced-g Experiment, Fundamental Research on International Standard of Fire Safety in Space, JAXA, Solid Combustion, Kibo, Fujita, Kikuchi, Kamigaichi, Legros, Hokkaido, filter paper, Nomex, limiting oxygen, MLOC, LOC, opposed flow, wire insulation, NASA-STD-6001.
- **Resultado:** as ocorrências são de texto completo em outras investigações:
  - Fujita e Legros são coautores do artigo Saffire (PSI-98/99);
  - "Fundamental Research…" aparece no FLEX (PSI-68/69);
  - "JAXA" corresponde a um round robin de materiais (PSI-1).
- **IDs públicos:** os títulos de PSI-1 a PSI-230 já haviam sido verificados nesta sessão, e nenhum é FLARE.

**Nenhum ID PSI ou DOI de dataset é atribuído.** **[Inferência]** Os dados de voo do FLARE pertencem à JAXA. O canal de dados público mais provável é a JAXA (repositório institucional e páginas Kibo), não o PSI.

## 3. Campanhas identificadas, mantidas separadas

Os detalhes estão em [`data/flare/derived/flare-inventory.json`](../../data/flare/derived/flare-inventory.json).

| Campanha | Plataforma e gravidade | Material e geometria | Atmosfera e fluxo | Medidas | Objetivo | Dados quantitativos aqui |
|---|---|---|---|---|---|---|
| 1g NASA (WSTF) | laboratório, 1g | LDPE, ETFE, HDPE, PMMA (0,8–5,99 mm), Nomex HT90-40; placas e fios | 101,3 kPa | MOC pelo NASA-STD-6001 Test 1; ignitor | correlacionar o Test 1 com o LOI de voo | não |
| 1g Japão | laboratório (Gifu), 1g | PMMA 0,125 mm (8 × 2 cm); NOMEX HT90-40 | O₂ em N₂, CO₂ ou Ar; descendente (~35 cm/s flutuante) e forçado de 40–130 cm/s | LOC1g; LOC de blowoff; A* e E* | parâmetros de solo para prever o MLOC | **sim** (Tabelas 2 de 2016 e 2018) |
| Voo parabólico | aeronave DAS, cerca de 20 s de µg | idem | fluxo oposto de 0–20 cm/s; N₂, CO₂, Ar | MLOC, Vcr, taxa de propagação, pré-aquecimento (IR) | validar o modelo | **sim** (MLOC medido) |
| Torre de queda | 4,5 s de µg | PMMA fino | 21 % O₂, Vg = 3 cm/s | extinção radiativa | calibrar B2 = 2,76 | ponto de calibração |
| ISS/Kibo, papel-filtro | SCEM, µg de longa duração, desde mai/2022 | papel-filtro de 130 × 40 ou 20 mm | 298 K, 100 kPa; ex.: 15,5 % O₂, Vg de 10–18 cm/s em passos de 2 | mapa O₂ × Vg; taxa de propagação; velocidade em órbita | verificar a curva prevista em solo | só o resumo (19 ensaios; 1,0–1,5 mm/s) |
| ISS/Kibo, PMMA e NOMEX | SCEM | PMMA não carbonizante; NOMEX HT90-40 carbonizante; folhas finas | fluxo oposto, inclusive quiescente | LOC, MLOC, raio da chama 3-D, Lg | critério de raio crítico 3-D | **não** (texto completo bloqueado) |
| ISS/Kibo, fios isolados | SCEM (carretel) | fios isolados | não informado | não informado | efeito da geometria; autoignição por sobrecorrente | não ("em andamento") |
| Extensões | previsões | CFRP; gravidade parcial | — | previsões | — | não (403) |

**[NASA/JAXA]** Bastões aparecem como geometria no programa (página JAXA e folheto), mas nenhum resultado de bastão foi encontrado. **Não há dados de fluxo concorrente** nas fontes obtidas.

**Excluído por não ser FLARE:** Carmignani et al., PROCI 42 (2026) 106484, sobre acrílico quiescente na ISS. É do **SoFIE (NASA)**.

## 4. Dados recuperados e base derivada

| Arquivo (versionado) | Conteúdo |
|---|---|
| `data/flare/sources/tastj2016-tsuboi-table1-table2.json` | Transcrição literal das Tabelas 1 e 2 de 2016 (strings como impressas) |
| `data/flare/sources/tastj2018-takahashi-table1-table2.json` | Tabelas 1 e 2 de 2018, constantes B1/B2, forma do modelo, campanhas e notas do texto |
| `data/flare/sources/publications-metadata.json` | Metadados dos 4 artigos FLARE da ISS, com resumos só dos licenciados CC; exclusão do artigo SoFIE |
| `data/flare/derived/flare-inventory.json` | Campanhas, fontes e situação de cada documento |
| `data/flare/derived/flare-records.json` | 63 registros (um por valor publicado), com campanha, material, gravidade, tipo (medido/previsto/calibração/…), unidade e célula original |
| `data/flare/derived/flare-analysis.json` | Reprodução de ΔO₂, erros do modelo, consistência entre fontes e pontos de evidência do MLOC |

Gerados por [`scripts/flare/inventory_flare.py`](../../scripts/flare/inventory_flare.py), [`normalize_flare.py`](../../scripts/flare/normalize_flare.py) e [`analyze_flare.py`](../../scripts/flare/analyze_flare.py), todos com `--check`.
