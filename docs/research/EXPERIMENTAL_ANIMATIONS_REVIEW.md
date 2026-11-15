# Reproduções experimentais no HabitatFire: revisão das animações

Branch `feat/animations-flare-integration`, criada de `origin/develop` (32b5a2c). O remoto não tem branch `dev`; a linha compartilhada é `develop`. Esta revisão cobre:

- o inventário do que já existia;
- a auditoria da animação de Rhenan;
- os renderizadores novos e a base comum de controles;
- o que ficou estático e por quê.

Rótulos usados no texto:

| Rótulo | Significado |
|---|---|
| **[Fato]** | Lido no código ou nos arquivos versionados |
| **[Medição]** | Vem dos dados |
| **[Inferência]** | Interpretação nossa |
| **[Decisão]** | Escolha de implementação |

## 1. Inventário das animações antes desta branch

| Onde | O que anima | Natureza | Origem dos dados |
|---|---|---|---|
| `src/components/SaffireScene.tsx` + controles em `src/App.tsx` (modos SAFFIRE I–VI do laboratório) | Grade de células da amostra SAFFIRE em 3D | Modelo estocástico (I, III, II-5/6, IV–VI) ou observação de borda (II-1…4, 7–9) | `public/data/saffire/*.json`, gerados por `scripts/calibrate_saffire*.py` |
| `src/components/CabinScene.tsx` | Ignição na cabine | Ilustrativa (progresso em %) | Nenhuma medição |
| `src/habitat/` (habitat lunar) | Propagação no revestimento, ensemble de 20 realizações | Modelo calibrado no SAFFIRE, com níveis de aplicabilidade | `trial-registry.json`, `psi-98-s1-neighbors.json` |
| `src/components/research/BassB1Observation.tsx` | Cursor sobre o gráfico x(t) das duas trajetórias do B1 | Medido em vídeo | `public/data/bass2/b1-replay.json` |
| `src/components/research/ExperimentReplays.tsx` (aba de Lucas, eed4081) | Nenhuma: cartões que abrem os módulos B1, SoFIE-GEL e SAME | — | — |
| `SofieGelObservation.tsx`, `SameSmokeObservation.tsx` | Nada animado: tabelas e gráficos estáticos | Publicado / medido | `gel-evidence.json`, `smoke-analysis.json` |

**[Fato]** Os quadros originais do SAFFIRE II já estavam publicados no projeto, mas nenhuma tela os usava:

- `public/data/saffire/ii-replays/*/*.jpg`: 80 imagens, 702 286 bytes;
- os arquivos `psi-99-ii{1,2,3,4,7,8,9}-replay.json`;
- o validador `readSaffireIIReplay` em `src/saffire.ts`.

## 2. A implementação de Rhenan (commits 5ac3b2d e 7eec703)

**[Fato] Componente.** `SaffireScene.tsx`, com React Three Fiber e drei `OrbitControls`. Não tem folha de estilo própria: as cores são materiais Three.js.

**[Fato] Geometria.** A placa é uma caixa retangular de `lengthMm × widthMm`, lida da grade do artefato:

- 940 × 406 mm no SAFFIRE I e III;
- 290 × 406 mm na placa do SAFFIRE II.

A câmera fica em perspectiva oblíqua (`position ≈ [0,36; 0,95; 1,13] × escala`), e é por isso que o retângulo aparece como **paralelogramo**. Não existe uma geometria 2D de paralelogramo no código.

**[Fato] Estados das células.** Cada linha da grade é desenhada em trechos contíguos do mesmo estado:

| Estado | Significado | Cor |
|---|---|---|
| `null` | Fora da vista | Cinza `#62747e` |
| `0` | Intacta | Bege `#cdc09b` |
| `1` | Frente alcançada / carbonizada | Escuro `#452f31` |
| `2` | Brilho de borda observado | Laranja emissivo |

**[Fato] Representação da chama.** Não há geometria de chama. A "chama" é uma faixa laranja emissiva de 6 mm na fronteira entre células alcançadas e intactas, além do estado 2. Uma seta ciano indica o fluxo. O componente aceita `observedFrontMm` (uma linha ciano da frente medida), mas o `App.tsx` não passa essa propriedade.

**[Fato] Controle de tempo** (`src/App.tsx`):

- um `setInterval` de 100 ms faz `time = início + decorrido × speed`;
- a velocidade alterna entre 1, 2 e 4×;
- o slider tem passo `stepSeconds = 2`;
- a grade exibida é `steps[floor(time / 2)]`, pré-calculada com `useMemo`.

**[Fato] Ligação com dados.** Cada modo está ligado a um ensaio:

- **SAFFIRE I e III:** `simulateSaffire` faz uma ignição central que combina o ajuste S1 (a favor do fluxo) com o S2 (contra o fluxo). Os próprios rótulos do laboratório a chamam de "Illustrative central ignition".
- **IV–VI e II-5/6:** `simulateLongitudinal`, calibrada pela velocidade publicada ou medida.
- **II-1…4 e 7–9:** `saffireIILocalizedGrid`, que mostra a atividade de borda observada.

A semente fixa é 1951.

**[Inferência]** Portanto, não é uma demonstração conceitual solta: são modelos estocásticos ajustados a imagens de ensaios específicos. A cena de ignição central, porém, é declaradamente ilustrativa.

**[Decisão]** Não alteramos `SaffireScene.tsx`, `src/saffire.ts` nem os modos do laboratório. O replay de modelo novo (§5.3) chama `simulateFromObservedFront` de `src/saffire.ts` sem modificá-la. Ele reaproveita a linguagem de estados (cores e paleta) e a regra de traçar trechos por linha.

## 3. Arquitetura comum (`src/components/replay/`)

| Arquivo | Papel |
|---|---|
| `replayCore.ts` | Funções puras, sem imports: `lastIndexAtOrBefore`, `sampleAt` (última amostra ≤ t, sem interpolação, `null` continua `null`), `nextStop`/`previousStop` (passos só sobre tempos gravados), `advanceTime`. Também a taxonomia `ReplayNature` |
| `useReplayClock.ts` | Relógio em tempo experimental com `requestAnimationFrame`. Nunca começa sozinho. Com `prefers-reduced-motion` avança em saltos de 0,5 s |
| `ReplayControls.tsx`, `ReplayTimeline.tsx` | Play/pausa, amostra anterior/seguinte, reinício, velocidades, linha do tempo com trechos e eventos, e o rótulo da referência temporal |
| `ExperimentalReplay.tsx` | Moldura modal: selo de natureza, legenda científica, grandeza, unidade, referência de tempo e limitações sempre visíveis |
| `NatureBadge.tsx`, `nature.css` | Selo de natureza com texto, para nunca depender só da cor |
| `useReplayData.ts` | Busca o JSON só quando o módulo abre, valida o contrato e cancela ao fechar |
| `replayCatalog.ts` | Para cada experimento: natureza, grandeza, unidade, base temporal, arquivos e motivo de ser animado ou estático. Usado pela aba e pelos testes |
| `replay.css` | Estilos comuns (`rp-`) e blocos por renderizador (`bb-`, `si-`, `sm-`, `sv-`, `ss-`) |

Os controles são compartilhados; o modelo físico não. Cada módulo tem o próprio renderizador e a própria leitura dos dados. Não há pontuação conjunta nem simulação combinada.

### Natureza dos dados

| Selo | Significado |
|---|---|
| *Experimental images* | Quadros originais da câmera, sem modificação |
| *Experimental video* | Vídeo público da NASA, como publicado |
| *Data measured from video* | Posições ou estatísticas extraídas quadro a quadro |
| *Measurement sequence* | Janelas de instrumento na ordem medida; os valores são resumos de janela |
| *Computational simulation* | Saída de modelo estocástico. Não é chama observada |
| *Illustrative* | Só auxílio visual. Nenhum módulo novo usa este selo |
| *Published values · static* | Tabelas publicadas, sem série temporal |

## 4. Diferença entre reprodução experimental e simulação

- **Reprodução experimental** (BASS-II B1, SAFFIRE II, SAME, cursor do SoFIE): mostra em cada instante a última amostra gravada. Não cria valores entre amostras. Ausências ficam visíveis como ausências.
- **Simulação** (SAFFIRE I · S1): mostra estados produzidos por um modelo, com semente fixa e reprodutível. O único valor medido no mesmo quadro é a frente mediana das câmeras, desenhada à parte (tracejado ciano) e rotulada como observação. A divisão entre o período de ajuste (0–246 s, dentro da amostra) e o trecho reservado (246–352 s, mesmo ensaio) aparece na linha do tempo e no gráfico.

## 5. Módulos que passaram a ter reprodução

Todos abrem pela aba **Simulation lab → NASA experiment replays**, carregam sob demanda e seguem o idioma da interface da `develop` (inglês).

### 5.1 BASS-II B1 — Experimental Replay (`BassB1Replay.tsx`)

- **[Medição] Dados.** `b1-replay.json` tem uma posição por quadro decodificado (874 quadros), com códigos de qualidade (`ok`, `low`, `absent`, `rejected`, `unseeded`). Traz também:
  - 9 eventos;
  - 41 mudanças de FAN/AIR lidas na sobreposição do vídeo;
  - os ajustes de 9,77 px/s (IC95 9,70–9,90) na trajetória superior e de 9,56 px/s (IC95 9,43–9,79) na inferior.
- **[Fato] Plano da amostra.** O arquivo novo `public/data/bass2/b1-sample-plane.json`, gerado por `scripts/bass2/build_b1_sample_plane.py`, copia de `data/bass2/b1/flamefront-config.json` as regiões que o rastreamento usou:
  - região da chama: x 40–560, y 230–355;
  - banda superior: y 248–278;
  - banda inferior: y 308–338;
  - faixa escura e brilho do ignitor.
- **[Decisão] Representação.**
  - A vista é o plano da imagem do vídeo lateral, em escala de pixels, e não o paralelogramo: não há geometria 3D do filme registrada nessa vista (`registration.json: insufficient`).
  - Cada banda mostra a frente do quadro corrente. A frente de baixa confiança aparece tracejada; detecção ausente ou rejeitada aparece como texto, sem marcador.
  - Um trecho sombreado vai da primeira à posição corrente.
  - A reta do ajuste e a faixa do IC95 da inclinação só aparecem quando o usuário pede, rotuladas como "not a measurement".
  - FAN e AIR mostram o último valor lido, porque só as mudanças foram transcritas.
- **[Fato] Rótulos.** A grandeza é chamada de *tracked optical front* (borda de montante da região brilhante, +x). Não é desenhada nem rotulada como contorno de chama.
  - **[Inferência]** O relatório B1 fala em "lâminas luminosas"; o pedido desta etapa associa a fronteira à frente de pirólise/carbonização. Como a análise não decide entre as duas leituras, a interface diz isso explicitamente.
  - A legenda pedida aparece em inglês, como o restante da interface: "Optical trajectories measured in the experimental video; position in pixels, without absolute spatial calibration."
- Nada é convertido para mm ou mm/s.

### 5.2 SAFFIRE II — Experimental Image Replay (`SaffireImageReplay.tsx`)

- **[Fato] Dados.** As amostras 1, 2, 3, 4, 7, 8 e 9 têm 10 a 15 JPEGs originais cada, já versionados.
  - O tempo vem dos carimbos do arquivo: segundos desde o primeiro quadro arquivado de cada câmera.
  - Os metadados de material, espessura, fluxo, O₂ e desfecho vêm de `SAFFIRE_II_CASES`.
- **[Fato] Seleção dos quadros.** `scripts/build_saffire_ii_replays.py` escolheu cada quadro entre os arquivados a ±0,55 s de um tempo-alvo, preferindo brilho visível. A sequência é uma curadoria, não um vídeo contínuo, e a interface diz isso.
- **[Decisão] Exibição.**
  - Cada quadro fica na tela até o próximo gravado, sem fusão nem interpolação.
  - Só o quadro seguinte é pré-carregado.
  - Nenhum quadro foi baixado ou duplicado.

### 5.3 SAFFIRE I · S1 — Stochastic Model Replay (`SaffireModelReplay.tsx`)

- **[Fato] Modelo.** `simulateFromObservedFront(model, 1951)` sobre `psi-98-s1-neighbors.json`. Grade de 94 × 21 células de 10 × 20 mm, passo de 2 s, 352 s.
  - Parte da frente observada no início da janela.
  - A faixa é o espalhamento do próprio modelo em 20 sementes (1951–1970), via `frontEnsemble`. Não é incerteza experimental.
- **[Medição] Comparação.** A linha tracejada ciano é `observedTrajectory`, a frente mediana medida nas imagens.
  - Números publicados no artefato para o trecho reservado: erro médio de posição de 17,4 mm; 1,95 mm/s observado contra 1,84 mm/s simulado.
- **[Fato] Identificação.**
  - O selo é *Computational simulation* e a legenda diz "Not an observed flame".
  - O texto avisa que o modelo foi ajustado a este único ensaio e não é um modelo universal do SAFFIRE.
  - O trecho reservado é do mesmo ensaio e aparato, portanto não é validação independente.

### 5.4 SoFIE-GEL — Video / Exploratory Analysis (`SofieVideoReplay.tsx`)

- **[Fato] Vídeo.** Não está no projeto. A referência pública utilizável é `https://images-assets.nasa.gov/video/SoFIE-GEL/SoFIE-GEL~large.mp4`, com 27 042 449 bytes e o mesmo SHA-256 registrado em `gel-evidence.json` e em `data/sofie/docs-manifest.json`.
  - O vídeo só é montado quando o usuário clica em "Stream the public NASA video", com `preload="metadata"` e sem som.
  - Daí em diante ele segue a linha do tempo, que também está em segundos de vídeo.
  - Em 1× a taxa é a do vídeo publicado; outras velocidades aparecem como alteração.
- **[Fato] Cursor.** Percorre as 14 janelas exploratórias de 8 s. Para as janelas que contêm o instante, mostra o pico em Hz de vídeo, a significância e as duas hipóteses de base temporal:
  - H1, tempo real: ×1;
  - H2, câmera lenta 3×: ×3.

  A faixa publicada de 2,0–3,5 Hz fica ao lado e nunca no eixo de vídeo.
- **Limitações exibidas:**
  - cerca de 10 quadros únicos por segundo, pela triplicação de quadros;
  - a ambiguidade entre tempo real e câmera lenta;
  - nenhuma escala espacial;
  - análise exploratória, não usada como parâmetro de simulação, sem reconstrução 3D;
  - os 5 casos de extinção não são animados.

### 5.5 SAME — Smoke Generation and Detection Evidence (`SameSequenceReplay.tsx`)

- **[Fato] Dados.** O arquivo novo `public/data/same/same-sequence.json`, gerado por `scripts/same/build_same_sequence.py` a partir de `data/same/derived/same-tests.json`, cobre os 15 testes reduzidos com janelas de solenoide. Para cada teste traz:
  - o registro;
  - o aquecimento;
  - as janelas na ordem, com o trecho de platô e as medianas de platô por instrumento, nas unidades do instrumento.

  Os tempos são segundos desde a primeira amostra do registro. Cada conversão de horário GMT é conferida contra a época já gravada.
- **[Decisão] Exibição.**
  - Os valores aparecem quando o platô da janela termina, porque são medianas do platô inteiro.
  - Os detectores são comparados lado a lado, nunca numa escala comum.
  - Não há nuvem de fumaça, transporte de partículas nem concentração espacial.
- **[Medição] Achado durante a verificação.** A redução P1 guarda só a primeira e a última amostra com `HeatingInProgress = 1` e a contagem delas. No teste 23 são 106 amostras ao longo de 4516 s.
  - O gerador marca `continuousAt1Hz` só quando a contagem prova uma amostra por segundo. Em 13 de 15 testes isso vale; os outros dois são o T23 e o T32 (61 amostras em 62 s).
  - Nesses dois casos o aquecimento aparece como dois extremos ligados por um tracejado, com a explicação. Desenhá-lo como barra contínua inventaria um aquecimento ininterrupto.

## 6. O que ficou estático e por quê

| Módulo | Motivo |
|---|---|
| FLARE | Tabelas publicadas (1g e voo parabólico), sem série temporal e sem séries da ISS nesta base. Uma chama animada inventaria comportamento. Ganhou só um filtro por material, gás e campanha, que esconde ou mostra valores existentes e nunca preenche combinações |
| SoFIE-GEL, 5 casos de extinção | Resultados pontuais publicados, sem séries temporais |
| SAME, Tabela 1, envelhecimento e razões DustTrak | Valores agregados por material, sem dimensão temporal. Continuam no módulo *Smoke & Detection* |
| SAFFIRE IV–VI | Só há velocidades publicadas e o modelo longitudinal do laboratório; nenhum quadro está no projeto |
| BASS-II, outros testes | Só o B1 foi processado (P0–P4) |

## 7. Limitações técnicas e científicas

1. **B1:**
   - posições em pixels, sem escala;
   - a identidade física da frente óptica não está estabelecida;
   - as anotações de referência são preliminares e de um único anotador, a IA;
   - FAN e AIR são leituras do overlay, e AIR tem resposta de cerca de 1 min.
2. **SAFFIRE II:** os quadros são uma seleção que favorece brilho. Os intervalos entre quadros não representam amostragem uniforme.
3. **SAFFIRE I:**
   - é saída de modelo;
   - a concordância de 0 a 246 s é dentro da amostra;
   - o trecho reservado é do mesmo ensaio.
4. **SoFIE-GEL:**
   - o vídeo é uma edição de divulgação, com trilha sonora;
   - a reprodução do vídeo depende da rede e do servidor da NASA, e não foi exercitada na verificação, para não baixar o vídeo nesta etapa;
   - a análise é exploratória.
5. **SAME:**
   - valores são resumos de janela;
   - volts sem calibração;
   - a contagem do P-Trak depende da diluição, que não está nos arquivos;
   - o aquecimento não contínuo de T23 e T32 não é localizado amostra a amostra.
6. **Interface:**
   - a `develop` passou a interface para inglês, então títulos e legendas pedidos em português aparecem traduzidos. Os artefatos científicos e as células `raw` não mudam;
   - o Dashboard e o laboratório já buscavam `gel-evidence.json`, `b1-replay.json` e `psi-98-s1-neighbors.json` na página inicial, antes desta branch. Os módulos e os arquivos novos carregam só sob demanda.

## 8. Integração do FLARE na `develop`

- **[Fato] Commit.** O commit `80b3233` (`origin/feat/flare-analysis`) não estava em `origin/develop`. Ele foi aplicado com `cherry-pick -x` no commit `cd34d51`.
- **[Fato] Conflitos.** Foram resolvidos mantendo os dois lados:
  - `ExperimentExplorer.tsx`: o FLARE entra no grupo existente *Published evidence · outside PSI*, ao lado do SoFIE-GEL;
  - `styles.css`, `.gitignore` e `README.md`.
- **[Fato] Dados intactos.** Os 8 arquivos de dados FLARE ficaram idênticos byte a byte aos de `80b3233` e foram marcados `-text` no `.gitattributes`.
- **[Fato] Tradução.** O texto do componente foi traduzido. As frases do JSON passam por `englishDisplayData` com `src/i18n/flare.en.json`, e um teste falha se alguma frase exibida ficar sem tradução.

## 9. Verificação

- **Testes Node:** `node --test scripts/test_experimental_replays.mjs`, 8 testes, incluídos em `npm run sim:check` (49 no total). Cobrem:
  - nada interpolado; ausências preservadas; passos só sobre tempos gravados;
  - séries B1 ordenadas; FAN/AIR mantidos até a mudança seguinte; regiões iguais à configuração;
  - quadros do SAFFIRE II ordenados e presentes;
  - modelo reproduzível com a semente e partindo da frente observada;
  - janelas SoFIE dentro do segmento analisado, e URL e hash do vídeo iguais ao manifesto;
  - sequência SAME igual à redução;
  - catálogo separando observação e simulação, com o FLARE estático;
  - carregamento sob demanda.
- **Testes Python:**
  - `scripts/same/test_same_sequence.py` (8);
  - `scripts/bass2/test_b1_sample_plane.py` (5);
  - `scripts/flare/test_flare_replay.py` (13).
- **Navegador:** Edge headless sobre o build de produção.
  - Os 5 replays e o FLARE abrem e fecham.
  - Play, pausa, passos e velocidade mudam o estado como esperado.
  - Sem overflow em 390 px, sem erros no console, sem texto em português na interface e sem requisições ao cache ou ao vídeo da NASA.
  - Com redução de movimento, o avanço é discreto.
  - O catálogo PSI continua funcionando.

## 10. Reconstrução

```powershell
python scripts/bass2/build_b1_sample_plane.py --check
python scripts/same/build_same_sequence.py --check
python -m unittest discover -s scripts/bass2 -p "test_*.py"
python -m unittest discover -s scripts/same -p "test_*.py"
npm run sim:check; npm run typecheck; npm run build
```
