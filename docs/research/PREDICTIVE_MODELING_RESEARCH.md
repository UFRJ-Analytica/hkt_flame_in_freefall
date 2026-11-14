# Modelagem preditiva e cenários lunares — pesquisa

Origem: slide "Challenge for Space Exploration" do vídeo oficial (base lunar com módulos cilíndricos, rover pressurizado, landers, EVA). O segundo objetivo do slide é o foco aqui: *"Extract data that supports predictive modeling of flammability and fire scenarios in space exploration."*

## 1. O que a NASA forneceu e o que ainda não usamos

Varredura de PSI-1 a PSI-220 na API do PSI: 132 investigações públicas, 23 de Combustion Science. **Todas as 23 já estão no snapshot** (mais PSI-62). A lacuna não é de investigações, é de **arquivos dentro delas**: hoje ingerimos as tabelas experimentais e o índice de vídeos; frames, séries temporais e documentos de engenharia ficaram de fora.

| Investigação | O que existe no PSI | Uso preditivo | Situação |
|---|---|---|---|
| SAFFIRE-I (PSI-98) | Sequências JPEG mapeadas, TIFF, PNG por amostra/câmera (S1–S3, C1/C2), visualização de escoamento F1/F2 | Rastreamento de frente → taxa de propagação, probabilidade de transição | S1 calibrada pelo colega; S2 (fluxo oposto) não |
| SAFFIRE-II (PSI-99) | Tabela com 9 amostras (silicone, SIBAL, PMMA, Nomex), O₂, potência/tempo de ignição, comprimento queimado e taxa µg e 1 g; só zip de metadados | Rótulos queima/não queima e taxas já medidas (SIBAL 2,1 e 2,6 mm/s; silicone ~0) | Tabela no catálogo; não usada como alvo |
| SAFFIRE-III (PSI-100) | 8 conjuntos JPEG + mapeados, grades de distorção F#C#, TIFF | Mesmo pipeline do colega; SIBAL a 30 cm/s, concorrente **e** oposto | Não processado |
| BASS-II (PSI-25) | 129 ensaios com PI, material/espessura, O₂ e CO/CO₂/CO calibrados início/fim, 302 mp4, proof sheets | Maior conjunto multi-condição: material × espessura × O₂ × fluxo | Vídeos indexados; nenhuma métrica extraída |
| BASS (PSI-26) | 111 mp4, drawings, txt | Idem, ensaios anteriores | Vídeos indexados |
| SAME / SAME-R / DAFT (PSI-101/102/47) | xls/csv de aerossóis por material e temperatura | Detecção: assinatura de fumaça por material | Só tabela |
| ACME, CFI, FLEX (PSI-10/23/39/159/68/69) | txt/csv/asc de séries temporais, mp4/ts | Extinção e limites de chamas gasosas/gotas | Só tabela |

Ponto de atenção conhecido: no BASS-II, *Fan display* e *Air display* não são velocidades calibradas. Antes de usar fluxo como variável contínua, é preciso achar a calibração nas proof sheets e documentos de engenharia; até lá ele entra como fator ordinal.

## 2. Chaves que cruzam tabela, mídia e documentos

- **SAFFIRE:** as colunas `Camera 1/Camera 2` da tabela (`S1C1`, `S5C2`) são exatamente os prefixos dos zips de frames. A ligação registro → frames é determinística.
- **BASS/BASS-II:** `GMT` + `Sample #` + `Test #` reconstroem o nome do vídeo e da proof sheet (`BASS_GMT###_SAMPLE_###_TEST_T#`). Essa regra já é usada em `nasa-media.json`.
- **Publicações:** o campo `publications` dos metadados aponta para papers no NTRS. Os PDFs do corpus (Saffire, BASS) podem ser ligados à investigação pelo DOI/título, permitindo citar o número do paper ao lado do registro.

Proposta: um grafo leve `investigação → registro → mídia/frames → métrica derivada → publicação`, em que cada métrica derivada (taxa de propagação, tempo de extinção) carrega o arquivo de origem, o hash e o método de extração.

## 3. Da imagem lunar para as evidências

| Elemento da imagem | Ambiente provável | Evidência mais próxima no PSI | Lacuna |
|---|---|---|---|
| Módulos habitáveis cilíndricos | Superfície, 1/6 g, atmosfera de exploração | SAFFIRE (amostras de ~1 m em volume grande da Cygnus): o análogo de maior escala que existe | Gravidade lunar não medida no PSI |
| Rover pressurizado | Volume pequeno, O₂ elevado e pressão reduzida | Saffire-VI: 54 kPa e 31 % O₂ (NTRS, **não** no PSI) | Dados IV–VI fora do PSI |
| Trajes/EVA, airlock | Atmosfera enriquecida em O₂ | SIBAL (tecido algodão-fibra de vidro, substituto de vestimenta); SAME para detecção | — |
| Assentos, painéis | Nomex, SIBAL, PMMA | Saffire-II e BASS-II | Transferência material → geometria não validada |

Atmosfera de exploração da NASA: 8,2 psia e 34 % O₂ (até ~35 %), escolhida para reduzir o prebreathe de EVA ao custo de maior inflamabilidade. Os materiais precisam passar no NASA-STD-6001B Test 1 nessas condições.

**Gravidade lunar não é intermediária "segura".** NASA (LUCI, FM²) relata que alguns materiais queimam com O₂ mais baixo em 1/6 g do que em 1 g. A perda convectiva cai, mas ainda há fluxo induzido suficiente para alimentar a chama, e não ocorre o *blowoff* do 1 g. Exemplo: o SIBAL só queima para baixo, em ar, em gravidade lunar (centrífuga e voo parabólico); em 1 g ele se extingue logo após a ignição. O FM² vai queimar SIBAL em ar e PMMA em atmosfera de exploração na superfície lunar (CLPS CP-21). Seus resultados ainda não estão publicados.

Consequência para o produto: um cenário lunar deve mostrar a previsão µg/1 g calibrada **e** um aviso explícito de que a extrapolação para 1/6 g pode ser não conservadora, citando LUCI/FM².

## 4. Base científica para a previsão

### 4.1 Física que restringe qualquer modelo

- **Mapa de inflamabilidade (Olson):** O₂ × velocidade característica do escoamento. Há extinção por *quenching* radiativo em baixa velocidade (≲ 2 cm/s para combustível fino) e por *blowoff* em alta (≈ 40 cm/s). Em gravidade parcial, a velocidade característica inclui o fluxo induzido por empuxo, que escala aproximadamente com g^(1/3): em 1/6 g, cerca de 55 % do valor em 1 g. Essa é uma estimativa de escala, não uma medição.
- **Propagação concorrente:** a taxa cresce linearmente com a velocidade do escoamento e cresce com O₂ e pressão (≈ √P); O₂ pesa mais que P. O SAFFIRE-I mediu 1,8 mm/s com 20 cm/s de fluxo, mais lento que amostras menores em µg (efeito de confinamento).
- **Opposed × concurrent:** a 20 cm/s o Saffire ficou acima do *crossover*, com o concorrente mais rápido. O S2 do SAFFIRE-I e do -III dá o par oposto.

Essas relações devem entrar como **estrutura** do modelo (sinais, monotonicidade, limites), não ser reaprendidas por ML com poucas dezenas de ensaios.

### 4.2 Simulação estocástica (o que o colega começou)

O autômato celular estocástico calibrado em frames do SAFFIRE-I S1 é o mesmo desenho dos trabalhos de *stochastic CA* bayesiano para incêndio florestal: probabilidade de transição por vizinhança, ajustada em observações de frente e com incerteza por estado. Ele já tem validação temporal honesta (erro médio de 14,1 mm e velocidade de 1,85 contra 1,95 mm/s no trecho reservado).

Evolução proposta:
1. **Mais ensaios no mesmo pipeline:** SAFFIRE-I S2 (oposto) e SAFFIRE-III S1/S2 (30 cm/s), o que dá variação de fluxo e de direção.
2. **Probabilidade condicionada a covariáveis físicas:** `logit p(avanço) = f(vizinhos) + β·[fluxo, direção, O₂, espessura, material]`, um modelo hierárquico bayesiano entre ensaios. Assim o simulador responde a condições de entrada em vez de reproduzir um único ensaio.
3. **3D:** mapear as células para as superfícies da malha do módulo (painéis, assentos), com velocidade local vinda do campo de ventilação da cena. A grade 2D do colega vira textura e estado por superfície. Isso é visualmente mais forte e continua rastreável ao ensaio.

### 4.3 ML: onde cabe e onde não cabe

Há poucas dezenas de ensaios rotulados (9 do Saffire-II, 129 linhas do BASS-II, poucas amostras Saffire I/III). Redes profundas não são justificáveis com esse volume. O padrão defensável é o do *flow assurance* e dos *digital twins* multifásicos: **modelo mecanístico + correção estatística + quantificação de incerteza**.

- **Probabilidade de propagação (classificação):** queima ou autoextinção em função de material, espessura, O₂, pressão e fluxo, por regressão logística bayesiana ou processo gaussiano, com as fronteiras de Olson como atributos. Saída: probabilidade com intervalo de credibilidade e indicador "fora do domínio" para 1/6 g e para O₂ acima do medido.
- **Taxa de propagação (regressão):** um GP com função média física (linear no fluxo, crescente em O₂) treinado nas taxas extraídas dos vídeos e frames.
- **Surrogate do CA:** quando o CA 3D ficar caro, um surrogate que aprende a distribuição de frentes do próprio CA (como os surrogates de difusão para CA de incêndio florestal) permite gerar ensembles em tempo real.

### 4.4 O que vídeos e frames rendem

1. **Rótulos de propagação:** posição da frente × tempo → taxa (mm/s), aceleração e extinção. Pipeline do colega, estendido ao BASS-II com uma régua da geometria da amostra nas proof sheets.
2. **Altura e comprimento de chama e luminosidade** como proxies de liberação de calor (o Saffire-I estimou 1200 ± 300 W).
3. **Tempo até extinção e desfecho** (queima completa, parcial, autoextinção) → alvo do classificador.
4. **Replay sincronizado:** vídeo real lado a lado com a realização simulada, como validação visual na demo.
5. **Pós-incêndio:** O₂, CO₂ e CO inicial e final do BASS-II dão consumo de O₂ e produção de CO por ensaio, um cenário de atmosfera pós-fogo no módulo.

## 5. Roteiro sugerido

1. Estender a calibração do colega ao SAFFIRE-I S2 e ao SAFFIRE-III S1/S2. **Status: pipeline existe; alto valor.**
2. Extrair taxa e desfecho do BASS-II a partir dos vídeos já indexados, mais o desfecho do Saffire-II, formando uma tabela única de alvos com proveniência.
3. Modelo de probabilidade de propagação com UQ e "fora do domínio" para lua e alto O₂.
4. CA 3D nas superfícies do módulo, condicionado às entradas (O₂, P, ventilação, material).
5. Cenário lunar (módulo de superfície e rover) com aviso LUCI/FM² e atmosfera de exploração como preset.
6. Painel de validação: erro no trecho reservado, cobertura de condições e lacunas (Saffire IV–VI e FM² fora do PSI).

## Fontes

- [FM² — NASA Glenn](https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/flammability-of-materials-on-the-moon-fm2/)
- [LUCI flammability results (ASGSR 2025, NTRS)](https://ntrs.nasa.gov/citations/20250010653)
- [Material flammability at lunar and Martian gravity (LPSC 2026)](https://www.hou.usra.edu/meetings/lpsc2026/pdf/1799.pdf)
- [Results of Large-Scale Spacecraft Flammability Tests (Saffire-I, NTRS)](https://ntrs.nasa.gov/api/citations/20170008805/downloads/20170008805.pdf)
- [Saffire VI (ICES-2024-365, NTRS)](https://ntrs.nasa.gov/api/citations/20240002981/downloads/Saffire-ICES-2024-ICES-365-accepted%20final.pdf?attachment=true)
- [Concurrent flame spread in normoxic microgravity (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S154074892600324X)
- [Olson — Mechanisms of microgravity flame spread over a thin solid (NTRS)](https://ntrs.nasa.gov/citations/19930066371)
- [JSC 29353D Flammability Configuration Analysis](https://standards.nasa.gov/system/files/tmp/JSC%2029353D%20Flammability%20Configuration%20Analysis%20for%20Spacecraft%20Applications.pdf)
- [NASA/TM-2013-217377 — 8 psia / 32 % O₂](https://ntrs.nasa.gov/api/citations/20130013505/downloads/20130013505.pdf)
- [Stochastic CA wildfire spread (arXiv 2306.03214)](https://arxiv.org/abs/2306.03214)
- [Diffusion surrogate for probabilistic wildfire spread (GMD 2026)](https://gmd.copernicus.org/articles/19/1027/2026/)
- [Digital twins for multiphase flow systems (Alan Turing Institute)](https://www.turing.ac.uk/research/research-projects/digital-twins-multiphase-flow-systems)
- [Physics-informed digital twins review (Springer 2026)](https://link.springer.com/article/10.1007/s11831-026-10754-w)
- PSI: `https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-{n}` (varredura PSI-1..220) e tabelas em `data/raw/psi/`.
