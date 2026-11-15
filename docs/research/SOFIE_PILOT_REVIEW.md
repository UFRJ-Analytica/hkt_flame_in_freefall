# SoFIE-GEL: seleção e inspeção do piloto

Pipeline: [`scripts/sofie/pilot_video.py`](../../scripts/sofie/pilot_video.py). Resultado: [`data/sofie/pilot/pilot-1410c.json`](../../data/sofie/pilot/pilot-1410c.json), reprodutível com `--check`. Rótulos: ver [SOFIE_DATA_REVIEW.md](SOFIE_DATA_REVIEW.md).

## 1. Candidatos

| Critério | **A. Vídeo "SoFIE-GEL" (teste 1410C)** | B. Montagem jsc2023e013681 |
|---|---|---|
| 1. Vídeo disponível | Sim: MP4 público de 46 s (derivado "large", 27 MB) | Não: imagem única com cerca de 45 recortes |
| 2. Condições conhecidas | Sim: Tabela 1 de NTRS 20240007628 (49,68 cm/s; 14,37 % O₂ na extinção; 1,07 atm; saída do duto) | Parcial: 28 % O₂ no início; extinção por redução de pressão; fluxo e teste não informados |
| 3. Geometria identificável | Esfera, haste e ignitor visíveis no início; depois só a chama | Sim, sobretudo nos quadros com LED verde |
| 4. Escala recuperável | Não, de forma rigorosa: sem régua nem quadros LED; corte de edição | Potencialmente: quadros LED mostram a esfera de 4 cm na mesma câmera |
| 5. Resultado publicado | Sim: chamas giratórias de 2 a 3,5 Hz, cerca de 35 s de rotação, 40 s estabilizada lateralmente | Não há resultado publicado associado a esse teste |
| 6. Qualidade visual | 1920 × 1080, mas 10 quadros únicos/s (cadência 3) e edição com trilha | Recortes de cerca de 210 px por quadro, intervalo "about 3 seconds" |
| 7. Vídeo ↔ registro | **Sim**: o XMP do arquivo diz que a única fonte é "1410C with Interstellar theme.mp4" | **Não**: a legenda não identifica o teste |

**Escolha: A (1410C).** **[Inferência]** É o único item público em que mídia, identificação do teste e um resultado quantitativo publicado coincidem. B serve para demonstrar a viabilidade da calibração (§4), não como piloto.

A foto jsc2023e002281 (primeiro teste, 13/01/2023) é um quadro único sem teste identificado.

## 2. Inspeção do vídeo piloto

| Item | Valor | Tipo |
|---|---|---|
| Arquivo | `data/cache/sofie/media/SoFIE-GEL_large.mp4`, 27 042 449 bytes (SHA-256 no JSON) | — |
| Origem | NASA Image and Video Library, nasa_id "SoFIE-GEL", publicado em 05/05/2023 | [NASA] |
| Produção | Adobe Premiere Pro 2023, salvo em 08/06/2023; ingrediente único "1410C with Interstellar theme.mp4" (46 s); áudio estéreo AAC de 48 kHz (trilha) | [NASA], metadados |
| Codec e resolução | H.264, 1920 × 1080, progressivo | [Medição] |
| FPS e time base | 30 fps; 1380 quadros; carimbos uniformes de 33,333 ms (mín = máx); duração de 45,97 s; timecode inicial 00:00:00:00 | [Medição] |
| Cadência | **Cada quadro-fonte se repete 3 vezes** (mudança em 100 % dos índices i ≡ 0 mod 3 e em 0,9 % dos demais): 10 quadros únicos por segundo de vídeo, 460 no total | [Medição] |
| Cortes | Uma transição de edição entre 11,0 e 11,6 s (diferença maior que 3 × a mediana local). Segmentos: 0–10,9 s (chama envolvente) e 11,7–45,9 s (desagregação, chamas giratórias e extinção) | [Medição] |
| Sobreposição | Nenhum relógio, régua ou rótulo nos quadros inspecionados | [Medição] |
| Visibilidade da chama | Boa: azul e lilás sobre fundo escuro. A luminosidade cai com o tempo (área luminosa de cerca de 35 000 → cerca de 2 500 px no quadro reduzido) | [Medição] |
| Geometria | Esfera com haste para cima e ignitor (bobina) embaixo, visíveis por transparência na chama envolvente. Escoamento de baixo para cima na imagem (ponto de estagnação no ignitor) | [Inferência] |
| Referência dimensional | Nenhuma régua. O diâmetro da esfera (4 cm) é a única referência, e a esfera fica encoberta pela chama na maior parte do vídeo | [Medição] |
| Quadros LED | Não aparecem nesta edição | [Medição] |

**Base de tempo: o bloqueio principal.** A repetição de quadros admite duas leituras:

- **H1, tempo real:** fonte de 10 fps exibida em tempo real.
- **H2, câmera lenta:** fonte de 30 fps (a taxa citada no artigo) exibida em câmera lenta de 3×.

Os metadados não dizem qual é a correta. Há uma pista física sob H1: a fase giratória visível dura cerca de 30 s de vídeo, compatível com os cerca de 35 s publicados. Sob H2, corresponderia a cerca de 10 s.

## 3. Métrica do piloto: frequência de giro das chamas (sem escala)

**Método:**

1. Ficar com um quadro por quadro-fonte.
2. No segmento posterior ao corte, calcular a assimetria esquerda/direita da luminosidade, A(t) = (L − R)/(L + R), em torno do centro horizontal da chama.
3. Calcular periodogramas Lomb-Scargle em janelas de 8 s com passo de 2 s.
4. Comparar o pico de cada janela com o quantil de 99 % de 200 permutações (semente 1410).

Quadros sem chama viram NaN e são descartados, nunca preenchidos com zero. Janelas pouco luminosas são puladas.

| Janela (s do vídeo) | Pico (Hz de vídeo) | Significativo |
|---|---:|---|
| 11,7–19,7 | 0,13 | sim (deriva lenta da chama envolvente; excluída por limiar de 1 Hz declarado) |
| 13,7–21,7 | 0,13 | não |
| 15,7–23,7 | 3,04 | sim |
| 17,7–25,7 | 3,03 | sim |
| 19,7–27,7 | 3,52 | sim |
| 21,7–29,7 | 3,62 | sim |
| 23,7–31,7 | 3,57 | sim |
| 25,7–33,7 | 4,43 | sim |
| 27,7–35,7 | 4,39 | sim |
| 29,7–37,7 | 4,35 | sim |
| 31,7–39,7 | 4,24 | sim |
| 33,7–41,7 | 4,27 | não |
| 35,7–43,7 | 2,72 | não |
| 37,7–45,7 | 2,66 | sim |

| Hipótese | Faixa física das 10 janelas giratórias | Janelas dentro de 2–3,5 Hz |
|---|---|---|
| H1, tempo real (fonte de 10 fps) | 2,66–4,43 Hz | 3 de 10 |
| H2, câmera lenta de 3× (fonte de 30 fps) | 7,97–13,29 Hz | 0 de 10 |

**Leitura [Inferência].**

- O vídeo público tem periodicidade estatisticamente significativa na fase de chamas giratórias.
- Sob H1, ela fica na mesma ordem de grandeza e parcialmente dentro da faixa publicada; H2 é incompatível com a publicação.
- Os picos de 3,5–4,4 Hz no fim da fase têm duas explicações possíveis, não resolvidas:
  - mais de uma chama passando pela face visível (frequência de passagem = n × rotação);
  - aliasing de uma componente acima de 5 Hz, já que 6 Hz amostrado a 10 Hz aparece em 4 Hz, como demonstra o teste sintético.
- **Isto é verificação de coerência, não validação.** A faixa publicada foi usada para discriminar a base de tempo, então não serve ao mesmo tempo como confirmação independente.

## 4. Calibração espacial

**Vídeo piloto: bloqueada.**

- Não há régua, e o enquadramento e o zoom mudam na transição de edição.
- A esfera fica encoberta pela chama, e não há quadros LED.
- O JSON registra `spatialScale.status = "not-applied"` e não traz nenhuma grandeza em mm.

**Vídeos brutos de voo, se forem liberados: viável com cuidados.**

- **Quadros LED.** A montagem jsc2023e013681 e a imagem jsc2024e021222 mostram que o LED verde pisca periodicamente (cerca de 1 em 8–10 quadros da montagem) e revela o contorno da esfera na mesma câmera fixa. Ajustar um círculo ao contorno dá px/mm no **plano médio da esfera** (D = 40 mm).
- **Validade da escala:**
  - vale para medidas no plano que contém o eixo do escoamento e é perpendicular à linha de visada, como o standoff no ponto de estagnação e a extensão axial da chama;
  - **não vale** para estruturas fora desse plano, como as chamas giratórias na face da esfera ou a parte de trás da envoltória: pela projeção perspectiva, uma estrutura mais próxima ou mais distante da câmera tem outra escala.
- **Superfície curva.** O contorno visível da esfera é a sua silhueta, mas o ângulo da ponta da chama sobre a superfície exige converter a posição projetada em ângulo polar: θ = arcsin(x/R) na vista lateral, com a ambiguidade frente/trás.
- **Distorção e distância da câmera:** não documentadas. Precisam ser estimadas, por exemplo pela circularidade da silhueta em quadros LED.
- **Regressão do PMMA:** durante a queima o diâmetro diminui um pouco. A escala deve ser recalculada por quadro LED, e não fixada.

## 5. Arquivos do piloto

| Arquivo | Versionado | Conteúdo |
|---|---|---|
| `data/sofie/pilot/pilot-1410c.json` | sim | Propriedades, cadência, cortes, segmentos, janelas, hipóteses H1/H2, valores publicados, escala não aplicada, periodograma não incluído (só os picos) |
| `data/cache/sofie/media/SoFIE-GEL_large.mp4` | não (cache) | Vídeo |
| `data/cache/sofie/media/SoFIE-GEL_metadata.json` | não (cache) | XMP e exiftool |
