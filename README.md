# HabitatFire

Workspace de segurança contra incêndios: selecione uma estrutura na cabine 3D, formule uma pergunta e explore investigações, registros comparáveis e trechos científicos com fontes rastreáveis. Cenários visuais são ilustrativos, não previsões de incêndio certificadas.

## Executar localmente

Requer Node.js 22.12+ e Python 3.11+. A API local usa a biblioteca padrão do Python; a busca local e o modelo SAFFIRE usam arquivos locais. Para reprocessar imagens SAFFIRE são necessários NumPy, Pillow, SciPy e acesso à internet para o download inicial.

```powershell
npm install
npm run dev
```

Abra http://127.0.0.1:5173. `npm run dev` inicia a API em 127.0.0.1:8000 e o frontend com proxy same-origin. O processo só encerra os subprocessos que ele iniciou, não servidores preexistentes.

```powershell
npm run dev:web   # somente frontend; busca contextual exige API separada
npm run api       # somente API; configuração IA é opcional
```

Se as portas já estiverem ocupadas, sem encerrar processos de outros projetos:

```powershell
$env:HABITATFIRE_API_PORT='8010'
$env:HABITATFIRE_WEB_PORT='5175'
npm run dev
```

Use `HABITATFIRE_PYTHON` para selecionar um executável Python específico, se necessário. Não é preciso instalar pacotes Python para iniciar o backend normal.

O snapshot contém 2.001 registros tabulares dos 24 identificadores PSI citados no conceito: 20 investigações/projetos com tabelas e quatro somente com metadados. São registros de naturezas diferentes, incluindo ensaios, resumos diários, faixas de parâmetros e referências; não são 2.001 ensaios independentes. A importação terminou sem erros de download.

```powershell
npm run data:sync       # atualiza pela NASA, sem baixar vídeos ou grandes arquivos
npm run data:offline    # reconstrói usando os CSVs já recuperados
npm run data:check      # verificações focadas de unidades, origem e falhas de atualização
npm run research:check  # verificações focadas do backend, sem rede/modelos pagos
npm run sim:check       # motor do habitat e simulações SAFFIRE (Node)
```

```powershell
npm run typecheck
npm run build
npm run preview
```

## A experiência

- Cabine procedural interativa inspirada na Orion e segundo ambiente inspirado em um módulo orbital.
- Vista em corte, órbita, aproximação, restauração da câmera, seleção de superfícies e tela cheia.
- Atmosfera, ventilação e hipóteses de materiais editáveis.
- Camadas de materiais, representação térmica ilustrativa e representação de ventilação.
- Ignição ilustrativa com reprodução, pausa, velocidade e linha do tempo.
- **SAFFIRE I e III** com avanço a favor e contra o fluxo calibrado pelas imagens dos dois ensaios de cada voo. Consulte os procedimentos de [I](docs/research/SAFFIRE_PROTOTYPE.md) e [III](docs/research/SAFFIRE_III.md).
- **SAFFIRE II** com nove amostras. II-5 e II-6 têm avanço estocástico calibrado pelas imagens. As demais exibem a atividade observada na borda. Consulte os [dados e a metodologia de II](docs/research/SAFFIRE_II.md).
- **SAFFIRE IV-1, V-2 e VI-2** com avanço estocástico a favor do fluxo, calibrado por velocidade publicada. Consulte os [dados e checagens de IV a VI](docs/research/SAFFIRE_IV_V_VI.md).
- [Relatório SAFFIRE I a VI em PDF](docs/research/relatorio_saffire_i_a_vi.pdf) com metodologia, probabilidades, validação e desfechos dos 25 casos.
- **Habitat lunar · simulação 3D** (modo inicial). O vídeo oficial (0:53–1:24) motiva o desafio com habitats na superfície lunar: **gravidade parcial (1/6 g)** e **atmosfera enriquecida em O₂**. Os dados da NASA são de microgravidade (ISS/Cygnus); o habitat mostra exatamente essa lacuna. Módulo em corte numa base lunar (segundo módulo, rover pressurizado, painéis, lander); o foco de ignição é clicado na parede e o fogo se propaga pelo revestimento com o modelo de vizinhança do SAFFIRE (grade 10 × 20 mm, 2 s), ensemble de 20 realizações e mapa de probabilidade.
  - **Ensaio de referência**: o cenário é comparado aos ensaios compatíveis do registro (`public/data/saffire/trial-registry.json`, nove ensaios com fontes, conflitos e hashes); no preset lunar o mais próximo é o SAFFIRE VI-2 (31% O₂, 54,1 kPa).
  - **Três níveis separados**: observado no ensaio; simulado na placa do ensaio (o único condicionado ao ensaio); seu cenário, no máximo *exploratório nas condições do ensaio* ou *interpolado entre ensaios* (I a 20 cm/s, III a 25 cm/s), e *extrapolação* quando O₂, pressão, escoamento ou gravidade diferem. Correspondência só no valor nominal ou faixa documentada (`docs/research/ACCEPTANCE_CRITERIA.md`).
  - Base da chama e frente carbonizada nunca são misturadas; o núcleo de cada ensaio é ajustado a um único observável.
  - Chama e fumaça em partículas são **efeito visual qualitativo** dependente da gravidade (em µg, sem empuxo: chama azulada colada à superfície e fumaça seguindo a ventilação; em 1/6 g: chama e fumaça sobem). Não são calibradas.
  - **Exportar/Importar**: o JSON carrega commit, SHA-256 de cada artefato, sementes, núcleo e motivos do gate; a importação restaura o cenário e diz se a reprodução é idêntica ou por que não é exata.
- Aplicabilidade de modelos calibrados no modo cabine: compara material, O₂, pressão, escoamento e gravidade com o domínio medido, critério a critério; fora do domínio mostra os ensaios medidos mais próximos. Em gravidade parcial, cita LUCI/FM².
- Alvos de modelagem curados (`npm run targets:build` → `public/data/modeling-targets.json`, exportáveis em JSON/CSV) com a célula original de cada valor interpretado.
- Catálogo real com filtros, busca, paginação, campos originais, exportação e aplicação das condições numéricas disponíveis ao cenário; verificado no navegador com BASS-II e FLEX.
- Proveniência e limitações visíveis na aplicação.
- Vídeos brutos da NASA por registro: 1.629 vídeos referenciados pelos metadados PSI, 790 registros ligados por regra explícita de nome de arquivo (ensaio exato no BASS-II, ACME Flame Design/CFI-G e CFI; mesmo dia de teste nos resumos diários do ACME). Os vídeos não são redistribuídos: `/api/media` aceita só arquivos do índice e redireciona para o link assinado do PSI. Reconstruir o índice: `npm run media:index`.

## Busca contextual e IA opcional

O backend combina busca lexical com vocabulário científico PT/EN, correspondência de identificadores e comparação estruturada. Sem IA configurada, a interface identifica esse modo como `lexical-structured`; com embeddings ativos, como `hybrid` (fusão de rankings lexical + vetorial). Investigações, registros e passagens são objetos separados; scores de recuperação não são probabilidades de risco.

O corpus científico contém oito documentos NASA e 167 passagens extraídas, com localização em página para os quatro PDFs. Fontes: guia de combustão, BASS, Saffire, SAME, SoFIE, FLARE, FM2 e Spinoff de detecção. Originais e hashes em `data/raw/research/`; snapshot em `public/data/research-corpus.json`. A disponibilidade de uma página sobre um projeto não equivale à existência de novos ensaios nesse snapshot.

A camada de IA é opcional e exclusivamente server-side:

| Papel | Serviço | Padrão |
|---|---|---|
| Síntese com citações verificadas | Claude (Anthropic API), saída estruturada em JSON | `claude-opus-5-5` |
| Embeddings | Voyage AI via MongoDB Atlas (*AI Model APIs*) | `voyage-4` (1024 dim.) |
| Índice vetorial persistente | MongoDB Atlas Vector Search (cluster na AWS) | coleção `habitatfire.passages` |

Copie `.env.example` para `.env` (ignorado pelo Git) e preencha. O backend lê `.env` ao iniciar; variáveis já definidas no ambiente têm precedência. Dependências: `.venv\Scripts\python.exe -m pip install -r backend/requirements.txt` (o `npm run dev` usa o Python do `.venv` automaticamente).

- `HABITATFIRE_ENABLE_AI=1`: opt-in explícito. Com `0` (padrão), nenhuma chamada externa acontece mesmo que existam chaves.
- `ANTHROPIC_API_KEY` / `CLAUDE_MODEL`: geração.
- `VOYAGE_API_KEY` / `VOYAGE_MODEL`: embeddings.
- `MONGODB_URI`, `MONGODB_USER`, `MONGODB_PASSWORD`, `MONGODB_DB`: índice vetorial. Sem MongoDB, os vetores ficam em memória.

Os vetores do corpus são calculados uma vez e salvos no Atlas por (modelo, versão do corpus); reinícios reutilizam o índice. A síntese do Claude só é aceita se cada achado citar IDs de evidências realmente recuperadas e não introduzir números ausentes das fontes; caso contrário, o resultado extrativo é preservado. Nenhuma chave deve ser colocada em variável `VITE_*`, código, exportação ou commit.

## Reconstruir o corpus científico (opcional)

Somente a reconstrução de PDFs exige a dependência de ingestão, isolada em um ambiente do projeto:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r scripts/requirements-ingest.txt
.\.venv\Scripts\python.exe scripts/build_research_corpus.py --offline
# Para recuperar novamente as fontes públicas:
.\.venv\Scripts\python.exe scripts/build_research_corpus.py
```

O modo offline valida hashes e preserva os horários de recuperação. Uma falha parcial não substitui o corpus público anterior por uma versão degradada. Não se baixam vídeos/arquivos grandes, nem se inventam passagens quando uma fonte falha.

## Dados e limites

A aplicação consome `public/data/nasa-experiments.json`. Os CSVs e metadados originais estão em `data/raw/psi/`, com manifestos de origem, data e SHA-256. O arquivo `public/data/nasa-provenance.json` é baixável pela aba Fontes. É um snapshot reproduzível, não um serviço NASA em tempo real.

Ausências não viram zero, desfechos não são inventados e valores aproximados, listas e intervalos não são reduzidos a pontos. O cenário aplica apenas campos escalares disponíveis e mantém a referência do registro/arquivo no JSON exportado. BASS-II não informa pressão ou velocidade calibrada; seus campos Fan display e Air display não foram tratados como cm/s.

Sólidos, gotas, gases e detecção são contextos diferentes. Não há classificador treinado que misture esses rótulos. Os números apresentados no catálogo são campos de experimentos, não probabilidades de risco de uma cabine.

A cabine usa geometria aproximada e atribuições hipotéticas de materiais. As cenas SAFFIRE reproduzem as amostras nas condições de cada ensaio. I e III usam probabilidades condicionadas à vizinhança e checadas em um trecho reservado do próprio ensaio. Os parâmetros laterais descrevem associações observadas. Os modelos têm finalidade exploratória e validade restrita às condições analisadas.

PROJECT.md e TECHNICAL_FOUNDATIONS.md distinguem a entrega de evidências/cenários dos sketches históricos de modelos físicos. Reprodução experimental exige mídia/tempo medidos; previsão calibrada exige observações e validação independentes. Nenhum desses modos deve ser fabricado a partir de um score de busca.

## SAME (PSI-102): Smoke & Detection

Em **Experimentos → SAME (PSI-102)**, o botão **Abrir análise Smoke & Detection** carrega sob demanda um módulo de evidência sobre a fumaça de materiais superaquecidos abaixo da ignição. O SAME não é propagação de chama.

O módulo mostra:

- a Tabela 1 publicada, agregada por material, com Dg e σg reproduzidos pelas Eqs. 7–8;
- o envelhecimento (dois pontos publicados mais a conservação do sinal de massa medida);
- a razão DustTrak B/A reproduzida dos sinais brutos de voo;
- a resposta dos detectores da ISS e do Space Shuttle.

Cada valor é rotulado como `published`, `measured`, `derived`, `model_assumption` ou `unavailable`. **M0, M1 e M3 por teste não estão disponíveis**, porque faltam calibrações, razões de diluição e densidades. O SAME-R (PSI-101) não está incluído.

O módulo lê apenas `public/data/same/smoke-analysis.json` (cerca de 49 KB), gerado de forma reprodutível a partir dos derivados versionados:

```powershell
python scripts/same/build_same_replay.py          # regenera
python scripts/same/build_same_replay.py --check  # confere
python -m unittest discover -s scripts/same -p "test_*.py"
```

Documentação: `docs/research/SAME_DATA_REVIEW.md`, `SAME_MOMENT_METHOD.md`, `SAME_ANALYSIS.md` e `SAME_FRONTEND_REVIEW.md` (guia de avaliação).
## SoFIE-GEL: evidência publicada (fora do PSI)

Em **Experimentos**, o grupo **"Evidência publicada · fora do PSI"** traz a entrada **SoFIE-GEL**, que abre sob demanda o módulo *NASA SoFIE-GEL — Published Experimental Evidence*. O módulo reúne:

- os 5 casos de extinção de chama sobre esfera de PMMA de 4 cm em microgravidade (Tabela 1 de NASA NTRS 20240007628), com tabela e gráficos SVG sem ajuste;
- as conclusões publicadas;
- a análise do vídeo público do teste 1410C, marcada como **"Análise exploratória — não validada experimentalmente"**.

**Não há dataset SoFIE público no NASA PSI**, e nenhum ID PSI é atribuído. Não é modelo de propagação nem previsão. Cinco casos não sustentam generalização. O vídeo não tem escala espacial e tem base temporal ambígua. A geometria esférica não se compara às amostras planas do BASS-II.

O módulo lê só `public/data/sofie/gel-evidence.json`:

```powershell
python scripts/sofie/build_sofie_replay.py          # regenera
python scripts/sofie/build_sofie_replay.py --check  # confere
python -m unittest discover -s scripts/sofie -p "test_*.py"
```

Documentação: `docs/research/SOFIE_DATA_REVIEW.md`, `SOFIE_GEL_METHOD.md`, `SOFIE_PILOT_REVIEW.md`, `SOFIE_ANALYSIS.md` e `SOFIE_FRONTEND_REVIEW.md`.

## Estrutura

```text
src/
  App.tsx                          laboratório e integração do cenário
  components/CabinScene.tsx        cena Three.js / React Three Fiber
  components/SaffireScene.tsx      cena da amostra SAFFIRE na grade
  components/ExperimentExplorer.tsx catálogo e fontes
  components/research/SameSmokeObservation.tsx módulo SAME Smoke & Detection (lazy)
  components/research/SofieGelObservation.tsx evidência SoFIE-GEL (lazy)
  hooks/                          carregamento de dados e acesso por teclado
  config.ts                       presets e materiais hipotéticos
  types.ts                        contrato de cena e dados
  research/                       contrato de busca e contexto
  styles.css                      tokens e layout responsivo
backend/                         API local, recuperação e adaptadores opcionais de IA
scripts/sync_nasa.py              importação de tabelas públicas, com modo offline
scripts/test_sync_nasa.py         verificações focadas de unidades e origem
scripts/build_research_corpus.py  extração citável dos documentos científicos
scripts/dev.mjs                   inicia API e frontend locais
scripts/ingest_saffire.py         download e manifesto das imagens do ensaio
scripts/calibrate_saffire*.py     extração da frente e ajuste das transições
scripts/same/                     SAME: aquisição, normalização, método dos momentos, artefato da UI
data/same/                        SAME: manifesto, log de voo e derivados (cache em data/cache/same/, fora do Git)
scripts/sofie/                    SoFIE: aquisição, piloto 1410C, artefato da UI
data/sofie/                       SoFIE: manifesto, casos publicados, piloto (cache em data/cache/sofie/, fora do Git)
data/saffire/                     registro e proveniência do ensaio
data/cache/saffire/               arquivos grandes locais, fora do Git
public/data/                     snapshot e manifesto consumidos pela UI
data/raw/psi/                    CSVs, metadados e hashes preservados
data/raw/research/               PDFs/HTML NASA e manifesto de proveniência
docs/research/                   contexto e conexão de dados
```

A experiência mantém React, TypeScript e Vite, com cena carregada separadamente. O backend HTTP Python é intencionalmente pequeno; não exige FastAPI, Qdrant, Docker, GPU ou migração para Next.js. Busca local e conteúdo extrativo não são anunciados como um LLM conectado. Deploy e configuração de modelos externos ficam para uma etapa posterior.

## Data and Resources

- NASA PSI: https://psi.nasa.gov
- Briefing do desafio: https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/
- Fontes efetivamente utilizadas: aba Fontes, `public/data/nasa-provenance.json` e `docs/research/DATA_CONNECTION.md`. Os endpoints estáveis de cada arquivo estão nos manifestos; URLs S3 temporariamente assinadas não são persistidas.
- React: https://react.dev
- Three.js: https://threejs.org
- React Three Fiber: https://r3f.docs.pmnd.rs
- drei: https://drei.docs.pmnd.rs
- Lucide: https://lucide.dev
- Vite: https://vite.dev
- Fontes DM Sans e IBM Plex Mono, com fallback do sistema. A cena não depende de modelos, HDRs ou texturas remotas.

Desenvolvimento assistido por ferramentas de IA; qualquer submissão deve descrever esse uso e observar as regras do evento. Este repositório não representa afiliação ou aprovação da NASA.
