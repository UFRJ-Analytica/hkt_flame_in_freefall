# SoFIE-GEL: condições experimentais, variáveis e metodologia

**Fontes:**

- **[NASA-S]** NTRS 20240007628: Li, T'ien, Ferkul, Olson e Johnston, *Extinction of solid diffusion flame in microgravity: details of quenching and blowoff processes*.
- **[NASA-C]** Resumo de T'ien, Li, Ferkul, Olson e Johnston, *Combustion and Flame* 277 (2025) 114244.
- **[NASA-P]** Apresentações NTRS 20190030735 e 20200000361.
- Legendas da NASA Image and Video Library.

Rótulos: ver [SOFIE_DATA_REVIEW.md](SOFIE_DATA_REVIEW.md).

## 1. Combustível

| Item | Valor | Fonte |
|---|---|---|
| Material | PMMA (polimetilmetacrilato, "acrylic") | [NASA-S], [NASA-C] |
| Geometria | Esfera de **4 cm de diâmetro**, sustentada por tubo de aço inoxidável de 6,35 mm | [NASA-S] §2 |
| Montagem | Três amostras a 120° num indexador; uma por vez no duto | [NASA-S] §2 |
| Preparação | Fundida sob medida com **5 termopares embutidos**, 3 deles no eixo, perto do ponto de estagnação frontal (gradiente subsuperficial = grau de pré-aquecimento). Detalhes em Johnston (tese, CWRU, 2017) e Li et al. (Fire Saf. J. 133, 2022) | [NASA-S] §2 |
| Tipo ou grau de PMMA, massa | **Não informados** nas fontes obtidas | — |
| Pré-aquecimento | Camada superficial pré-aquecida pelo ignitor e pela própria chama antes do procedimento de extinção; quantificado pela perda de calor por condução (W/cm²) | [NASA-C], [NASA-S] Tabela 1 |
| Ignição | Fio enrolado aquecido eletricamente perto do ponto de estagnação a montante, recolhido após a ignição | [NASA-S] §2 |
| Campanha | 15 esferas, 3 testes por esfera (planejado) | [NASA-P] |

## 2. Atmosfera e escoamento

| Item | Valor | Fonte |
|---|---|---|
| Duto | Seção quadrada de 13,3 × 13,3 cm, 24,6 cm de comprimento; dois bancos de ventiladores; sensor de fluxo a montante | [NASA-S] §2 |
| Velocidade forçada | **0,2 a 80 cm/s** (80 cm/s truncado pelo limite da instalação) | [NASA-S], [NASA-C] |
| O₂ | **13 a 34 %** ([NASA-C]); 13 a 28 % a 1 atm nos casos de [NASA-S]. Medido na entrada do duto | — |
| Pressão | **0,15 a 1,1 atm** | [NASA-C] |
| Direção | Escoamento ao longo do eixo do duto, incidindo na esfera (ponto de estagnação frontal) | [NASA-S] |
| Gravidade | Microgravidade (ISS, Combustion Integrated Rack) | — |
| Câmara | CIR selada, volume livre de 85,7 L; extinção por **depleção natural de O₂** a velocidade constante (nos casos de [NASA-S]) ou por redução de fluxo, O₂ ou pressão ([NASA-C], legenda de jsc2023e013681) | — |
| Temperatura ambiente | Não informada | — |
| Primeiro teste | 13/01/2023 (17,5 % O₂, 20 cm/s) | Legenda de jsc2023e002281 |
| Duração total de queima | ~7 h de PMMA queimando em microgravidade | [NASA-C] |

## 3. Instrumentação

- **Câmeras [NASA-S].**
  - Três Sony FCB-MA130 (1400 × 1200 px): SoFIE Cam1 (perto da ignição), Cam2 e Cam3.
  - Uma Allied Vision GC-1380CH colorida, "ACME" (1360 × 1024 px), alinhada com a Cam2.
  - Taxa de quadros citada: **30 fps**.
  - Duas câmeras internas e uma externa cobrem todo o tubo de fluxo [NASA-P].
- **LED verde [NASA, jsc2024e021222].** Pisca durante a queima para tornar a superfície do combustível visível ("how far the flame is from the fuel and how much the fuel is heating up").
- **Outros [NASA-S], [NASA-P].** Radiômetros (no duto e ortogonais), sensores de O₂ (PyroScience FireSting, 4 entradas), CO, CO₂ e umidade, pressão, velocidade, termopares de campo distante e cromatógrafo do CIR.

## 4. Resultados publicados por teste

**[NASA-S] Tabela 1: casos de extinção a cerca de 1 atm.**

| Caso | Amostra GEL | Modo | Local | Fluxo (cm/s) | Re | Taxa de deformação a = 3U/(2R) (1/s) | O₂ na extinção (%) | p (atm) | Perda condutiva (W/cm²) |
|---|---|---|---|---:|---:|---:|---:|---:|---:|
| 1 | 1409B | quenching | dentro do duto | 4,83 | 128,8 | 3,63 | 14,21 | 1,04 | 0,36 |
| 2 | 1408A | blowoff | dentro do duto | 34,28 | 914,1 | 25,71 | 14,99 | 1,06 | 0,95 |
| 3 | 1402C | intermediário | dentro do duto | 11,50 | 306,7 | 8,63 | 13,54 | 1,07 | 0,37 |
| 4 | 1409C | quenching | saída do duto | 0,44 | 11,7 | 0,33 | 20,77 | 1,03 | 0,17 |
| 5 | **1410C** | blowoff | saída do duto | 49,68 | 1324,8 | 37,26 | 14,37 | 1,07 | não registrada |

**Transcrição.** A tabela está transcrita em [`data/sofie/gel-extinction-cases-ntrs20240007628.json`](../../data/sofie/gel-extinction-cases-ntrs20240007628.json), junto com os números dinâmicos do texto. A perda condutiva do caso 5 permanece `null` ("not recorded").

**[Derivado] Verificação da tabela.** Com R = 2 cm, a = 1,5·U/R confere em todas as linhas dentro do arredondamento das duas casas impressas (±0,009 s⁻¹; por exemplo, 1,5 × 49,68 / 2 = 37,26 s⁻¹). Re = U·D/ν é coerente com uma única viscosidade ν ≈ 0,15 cm²/s, a do ar perto da temperatura ambiente (por exemplo, 49,68 × 4 / 0,15 = 1325). Os dois testes estão em [`test_sofie.py`](../../scripts/sofie/test_sofie.py), classe `PublishedTable`.

**Medidas e observações dinâmicas [NASA-S]:**

- **Posição da ponta da chama:** dada em ângulo em torno da esfera, com 0° no ponto de estagnação frontal (Figs. 3 e 5).
- **Caso 1:** 10 ciclos de pulsação, com período constante de 0,4 s.
- **Caso 2:** base da chama percorre em média 5,4 cm; períodos de 0,41 s; giro azimutal por 3,18 s.
- **Caso 4:**
  - pulsação autossustentada por 927 s, a 1,4 → 1 → 0,8 Hz;
  - velocidade de pico da ponta de cerca de 25 cm/s;
  - **standoff** no ponto de estagnação de 7 → 10 mm (Fig. 8).
- **Caso 5 (1410C):**
  - chama estabilizada lateralmente por 40 s, girando por cerca de 35 s;
  - chamas giratórias de **2 a 3,5 Hz**, cobrindo área decrescente até a extinção.

**[NASA-C] Resultados de 2025:**

- **Fronteira de extinção a 1 atm** no mapa O₂ × velocidade (taxa de deformação): banda em "U truncado".
- **Pré-aquecimento:** mais pré-aquecimento alarga o domínio inflamável.
- **Modos de extinção:** quenching a baixa velocidade; blowoff no ponto de estagnação e na esteira a alta velocidade.
- **Junção dos ramos:** os dois ramos se encontram em 7,5 s⁻¹.
- **O₂ mínimo:** ligeiramente abaixo de 14 %.

## 5. Terminologia preservada

- **Crescimento da chama sobre a esfera** (*flame growth*): a chama nasce num ponto de ignição e envolve a esfera. É medido pela forma, pela extensão angular da ponta e pelas dimensões. **Não é** taxa de propagação sobre superfície plana (*flame spread rate*, BASS-II e Saffire).
- **Velocidade da ponta na pulsação** (~25 cm/s, caso 4): velocidade de uma frente pré-misturada transitória perto do limite. Também não é *spread rate*.
- **Standoff:** distância chama–superfície no ponto de estagnação (mm).
- **Extinção:** *quenching* (perdas de calor, baixa deformação) vs *blowoff* (tempo de residência curto, alta deformação).

## 6. Dicionário de variáveis

Para a futura base harmonizada (P2).

| Variável | Unidade | Tipo | Disponível publicamente |
|---|---|---|---|
| `sampleId` (ex.: 1410C) | — | identificação | Tabela 1 (5 casos); XMP do vídeo |
| `flow_cm_s`, `strainRate_per_s`, `reynolds` | cm/s, s⁻¹, — | medida / derivada | Tabela 1 |
| `o2_pct_at_extinction`, `p_atm` | %, atm | medida | Tabela 1 |
| `extinctionMode` | quenching / blowoff / intermediate | classificação | Tabela 1 |
| `sampleLocation` | duto / saída do duto | condição | Tabela 1 |
| `conductiveHeatLoss_W_cm2` | W/cm² | derivada dos termopares | Tabela 1 (4 de 5) |
| `tipAngle_deg(t)` | grau | medida de imagem | Só figuras (Figs. 3 e 5), sem tabela |
| `standoff_mm(t)` | mm | medida de imagem | Só figura (Fig. 8, caso 4) |
| `pulsationFrequency_Hz`, `spinFrequency_Hz` | Hz | medida de imagem | Texto (casos 1, 4 e 5) |
| Série temporal de O₂, p, fluxo, termopares | vários | telemetria | **Indisponível** (não público) |
| Vídeos brutos das câmeras | — | mídia | **Indisponível**; só uma edição pública (1410C) |

## 7. Metodologia de análise de imagem

**O que os pesquisadores fizeram [NASA-S]:**

- rastreamento da ponta da chama em ângulo, com uma câmera ortogonal à vista ilustrada;
- medida do standoff no ponto de estagnação;
- interpretação da luminosidade de CH* (pré-misturada vs difusão);
- quadros com LED para ver a superfície.

**Software.** O artigo **não nomeia** o software usado.

**FIAT (Flame Image Analysis Tool).** **Não encontrei** nenhuma referência pública a uma "FIAT" associada ao SoFIE (busca na web e no NTRS). A ferramenta NASA GRC mais próxima é o *Spotlight*, um programa de análise de sequências de imagens de combustão (NASA TM, 2006). Isso **não** indica que tenha sido usado no SoFIE.

**[Inferência] O que o HabitatFire pode reproduzir:**

| Medida | Viabilidade | Condição |
|---|---|---|
| Frequências de pulsação e giro | Sim (sem escala) | Se a base de tempo for conhecida |
| Ângulo da ponta da chama | Sim | Centro e raio da esfera no quadro (estimáveis em quadros LED) |
| Standoff em mm | Sim | Escala pelo diâmetro de 4 cm em quadros LED da mesma câmera fixa |

Nenhuma dessas medidas é viável de forma rigorosa no vídeo público editado, salvo a frequência, e ainda assim condicionada à base de tempo (ver [SOFIE_PILOT_REVIEW.md](SOFIE_PILOT_REVIEW.md)).
