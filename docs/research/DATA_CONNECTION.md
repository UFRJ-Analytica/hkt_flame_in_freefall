# Conexão NASA PSI — dados efetivamente importados

## Resultado

O importador `scripts/sync_nasa.py` foi executado contra o catálogo público NASA PSI. Recuperou os 24 identificadores citados em PROJECT.md, com 22 arquivos CSV de 20 investigações/projetos e quatro registros somente com metadados. O snapshot contém **2.001 registros tabulares**, sem erros de download nesta execução.

Essas contagens não são equivalentes a ensaios independentes. Há tabelas de testes, resumos diários de ignições, faixas por combustível e referências a conjuntos de dados. A aplicação informa a unidade de cada tabela e não os reúne como rótulos de um classificador.

Prova primária local: `../../public/data/nasa-provenance.json`, com 46 artefatos de origem (24 metadados + 22 CSVs), horários e hashes SHA-256. Os originais e manifestos por investigação estão em `../../data/raw/psi/`.

## Inventário do snapshot

| PSI | Nome / contexto | Registros importados |
| --- | --- | ---: |
| PSI-25 | BASS-II, sólidos | 129 |
| PSI-69 | FLEX, gotículas | 274 |
| PSI-99 | Saffire-II | 9 |
| PSI-98 | Saffire-I | 2 |
| PSI-100 | Saffire-III | 2 |
| PSI-20 | ACME BRE, resumos de ignições em queimador | 18 |
| PSI-102 | SAME | 8 |
| PSI-101 | SAME-R | 109 |
| PSI-159 | ACME CFI-G, tabelas normal e inversa | 333 |
| PSI-117 | Estudo computacional de cool flames | 0 — metadados |
| PSI-115 | Modelagem de fumaça | 0 — metadados |
| PSI-26 | BASS | 122 |
| PSI-68 | FLEX-2, faixas de condições por combustível | 8 |
| PSI-10 | ACME Flame Design, tabelas normal e inversa | 327 |
| PSI-21 | ACME CLD, resumos de sessões | 32 |
| PSI-22 | ACME E-FIELD, resumos de sessões | 32 |
| PSI-23 | ACME s-Flame, resumos de sessões | 18 |
| PSI-39 | CFI | 87 |
| PSI-106 | SLICE | 12 |
| PSI-107 | SPICE | 469 |
| PSI-47 | DAFT / DAFT-2 | 2 |
| PSI-62 | Modelagem de propagação | 0 — metadados |
| PSI-60 | Análise computacional/experimental SPICE | 0 — metadados |
| PSI-142 | Referências a dados/figuras | 8 |

Os títulos e identificadores atuais foram lidos do PSI. A lista acima reproduz o snapshot local, não uma alegação de que todos esses projetos sejam experimentos em voo.

## Caminho reproduzível

1. Metadados oficiais: `https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-25` (o accession varia por projeto).
2. A lista `experimentalTable` informa o nome e a versão de cada CSV público.
3. O próprio frontend PSI usa `/geode-py/ws/studies/{accession}/download?file=...&version=...&redirect=false`.
4. Esse endpoint fornece uma URL S3 temporariamente assinada. O importador a usa em memória, valida a origem esperada e não a grava nos manifestos.
5. São preservados os bytes CSV, os metadados, o hash e o endpoint estável de download. Não há download de vídeos ou grandes arquivos.
6. `public/data/nasa-experiments.json` alimenta o frontend por requisição same-origin; nenhuma chave NASA ou LLM é necessária durante a demonstração.

Comandos PowerShell:

```powershell
npm run data:sync
npm run data:offline
npm run data:check
```

O modo offline reconstrói a partir dos arquivos preservados e mantém o horário original de recuperação das fontes; não apresenta a reconstrução como uma nova consulta NASA.

## Correções importantes frente aos documentos conceituais

- BASS-II tem 129 linhas de testes e 17 colunas no CSV recuperado. Não há coluna explícita de pressão, desfecho binário ou velocidade calibrada em cm/s. `Fan display` e `Air display` são preservados, mas não convertidos em velocidade.
- FLEX possui 274 registros. O₂ vem como fração molar e a pressão em mmHg: os campos normalizados usam percentual e kPa. O campo original `Test end` continua disponível, mas não foi transformado em rótulo universal de queima/extinção.
- Saffire-II contém nove linhas de amostras, mais linhas de visualização e notas. Somente as nove amostras são contadas como registros; notas ficam preservadas nos manifestos. Células vazias de material não foram preenchidas por herança da linha anterior.
- ACME BRE é Burning Rate Emulator com misturas gasosas em queimador. Sua tabela é um resumo por dia com contagens de chamas, não um dataset de atrasos de ignição de materiais sólidos.
- O CSV BRE contém literalmente `3400%` e `2100%`. Esses tokens foram preservados e não reinterpretados como 34% ou 21%. O₂ normalizado permanece nulo nesses casos.
- O PSI-117 atual é um estudo computacional, não a tabela FLEX descrita no conceito. Sem tabela experimental pública listada, ele aparece somente como metadados.
- Os metadados de plataforma de Saffire-I/III no PSI indicam ISS. O campo foi preservado com ressalva, não usado para inferir o local real de cada ensaio.

A fonte de cada ponto é o metadata.json e o CSV de mesmo accession em `data/raw/psi/`, com hash no respectivo manifest.json. PROJECT.md e TECHNICAL_FOUNDATIONS.md não foram editados nesta entrega.

## Regras de normalização

- `raw` preserva chaves e valores das células CSV, inclusive grafias, espaços, valores estranhos e unidades; células vazias viram null. Os bytes originais também ficam preservados.
- Somente escalares numéricos explícitos são convertidos. Listas (`21; 26.5; 40`), aproximações (`~ 21.5`) e intervalos (`22.1 to 22.0`) não viram um ponto inventado.
- `1 atm = 101,325 kPa` e `760 mmHg = 101,325 kPa`; concentração molar é multiplicada por 100 somente nos campos explicitamente identificados como fração molar inicial.
- Oxigênio fora de 0–100% é recusado como condição normalizada, sem alterar o original.
- Pressões aproximadas e colunas sem unidade inequívoca permanecem apenas no original.
- `sourceFile`, `sourceRow` e o identificador único vinculam cada registro normalizado ao seu CSV. `sourceRow` é a posição lógica do registro CSV, incluindo cabeçalho, não um contador de linhas físicas em arquivos com células multilinha.

## Verificação executada

- Seis verificações focadas de importação passaram em 0,148 s: escalares/intervalos, unidades FLEX, ausência de velocidade calibrada BASS, anomalias BRE, notas Saffire e rastreabilidade célula a célula de todos os registros do snapshot.
- O hash de cada metadata/CSV local foi comparado ao manifesto; IDs de registros são únicos.
- A reconstrução offline produziu as mesmas contagens.
- Build TypeScript/Vite passou.
- No navegador: 24 investigações na lista e 2.001 registros no contador; BASS-II B1 abriu seu original e aplicou apenas O₂=22,2%, mantendo pressão=101,3 kPa e fluxo=10 cm/s. O JSON exportado preservou accession, arquivo, registro e campos aplicados.
- FLEX registro 1 mostrou a pressão original 757,7 mmHg e exportou 101,01835855263158 kPa, com O₂=21% e o fluxo do cenário mantido.
- A anomalia BRE `3400%` apareceu no original, com aplicação numérica desabilitada.
- A aba Fontes exibiu 24 cartões e manifesto baixável. O catálogo móvel não apresentou overflow horizontal em 390 px.

## Limite da entrega

Os dados agora estão conectados à experiência de exploração. Isso não valida a geometria da cabine nem transforma a animação em previsão. Nenhum GP, classificador, modelo de detecção, eficácia de extinção ou autômato calibrado foi treinado nesta integração.
