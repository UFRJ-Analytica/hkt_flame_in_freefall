# SoFIE-GEL: análise, comparação e próxima etapa

Este documento consolida a fase P0/P1. Detalhes em:

- [SOFIE_DATA_REVIEW.md](SOFIE_DATA_REVIEW.md): fontes, IDs e arquivos;
- [SOFIE_GEL_METHOD.md](SOFIE_GEL_METHOD.md): condições, variáveis e metodologia;
- [SOFIE_PILOT_REVIEW.md](SOFIE_PILOT_REVIEW.md): piloto e calibração.

Rótulos: **[NASA]**, **[PSI]**, **[Medição]**, **[Derivado]**, **[Inferência]**, **[Hipótese]**.

## 1. Resumo executivo

- **Disponibilidade no PSI.** **[PSI]** Não há dataset SoFIE público no NASA PSI (PSI-1 a PSI-230 verificados). Os dados de voo (vídeos brutos e telemetria) não estão acessíveis publicamente.
- **O que existe publicamente [NASA]:**
  - 5 casos de extinção do GEL com condições completas (Tabela 1 de NTRS 20240007628), agora em `data/sofie/gel-extinction-cases-ntrs20240007628.json`;
  - faixas e conclusões de 2025 (resumo);
  - um vídeo de divulgação editado do teste 1410C, associado pelo nome do arquivo-fonte nos metadados.
- **Primeira métrica implementada:** a frequência de giro das chamas no vídeo 1410C. **[Medição]** Há periodicidade significativa de 2,66 a 4,43 Hz de vídeo em 10 janelas.
  - Sob a hipótese de tempo real, 3 das 10 janelas ficam na faixa publicada de 2–3,5 Hz.
  - A hipótese de câmera lenta de 3× é incompatível com a publicação.
  - A base de tempo do vídeo não está documentada. É coerência, não validação.
- **Escala espacial: bloqueada no vídeo público.** Seria viável nos vídeos brutos, pelos quadros com LED verde e a esfera de 4 cm.

## 2. Respostas aos critérios de conclusão

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PSI ID do SoFIE-GEL | **Nenhum ID público encontrado.** Não atribuo ID (§2 de SOFIE_DATA_REVIEW) |
| 2 | Outras investigações SoFIE | RTDFS, MIST, NCA e SMμRF existem como investigações NASA (seleção de 2009). Nenhuma tem dataset PSI público. Só imagens de divulgação (MIST e RTDFS) e artigos de solo (NCA) |
| 3 | Quais têm dados adequados | Nenhuma tem tabelas ou telemetria públicas. O GEL tem o melhor conjunto: Tabela 1 por teste mais vídeo associável |
| 4 | Vídeos úteis | Um: a edição pública do teste 1410C (46 s, cadência 3, uma transição). Útil para medidas sem escala, condicionadas à base de tempo |
| 5 | Variáveis medidas | Fluxo, O₂, pressão, 5 termopares (perda condutiva), imagens de 4 câmeras (30 fps), LED, radiômetros, CO, CO₂ (SOFIE_GEL_METHOD §3–§6) |
| 6 | FIAT ou equivalente | **FIAT não encontrada** em fonte pública. Os pesquisadores rastreiam o ângulo da ponta da chama e o standoff, sem software nomeado. O Spotlight (GRC) é a ferramenta NASA mais próxima, sem evidência de uso no SoFIE |
| 7 | Existe escala espacial | Não no vídeo público. Nos vídeos brutos: esfera de 40 mm em quadros LED, válida no plano médio (SOFIE_PILOT_REVIEW §4) |
| 8 | O que pode ser reproduzido | Coerência interna da Tabela 1 (a = 3U/2R; Re com ν única) **[Derivado]**. Ordem de grandeza da frequência de giro do 1410C sob H1 **[Medição]**. Nada em mm |
| 9 | Melhor piloto | Teste 1410C (vídeo público com associação documentada e resultado publicado) |
| 10 | Primeira implementação | Feita: cadência, transições, assimetria e periodograma com significância. A próxima depende de dados brutos (§6) |

## 3. Comparação com Saffire e BASS-II

| Característica | Saffire (I–VI) | BASS-II (B1) | SoFIE-GEL |
|---|---|---|---|
| Geometria | Placas grandes planas (SIBAL de 940 × 406 mm; amostras de 29 × 5 cm no II) | Lâmina fina plana vista de perfil (PMMA de 100 µm no B1) | **Esfera** de 4 cm (corpo rombudo 3-D) |
| Material | SIBAL (algodão e fibra de vidro), algodão, PMMA, Nomex | PMMA, papel e outros | PMMA fundido com termopares |
| Escala | Grande (≈ 1 m), veículo Cygnus | Pequena (cm), MSG | Pequena (4 cm), CIR, duto de 13,3 cm |
| Fluxo | ≈ 20–25 cm/s concorrente | Ventilador (display "Fan", não convertido em cm/s) | 0,2–80 cm/s forçado, medido |
| O₂ | 21,2–31 % | Por teste | 13–34 % |
| Pressão | 54–99 kPa | — (não informada como escalar) | 0,15–1,1 atm |
| Aquecimento interno | Não | Não | **Sim**: pré-aquecimento subsuperficial medido (W/cm²) |
| Fenômeno principal | Propagação sobre superfície (mm/s) | Propagação sobre superfície (px/s, sem escala) | **Crescimento e extinção** de chama envolvente; quenching vs blowoff; pulsação e giro |
| Dados disponíveis | PSI-98/99/100 com imagens e tabelas | PSI-25 com vídeos e tabelas | **Sem PSI público**; Tabela 1 (5 casos) mais 1 vídeo editado |
| Medidas extraíveis | Frente em mm, taxa | Frente em px, velocidade em px/s | Frequências (Hz); com dados brutos, ângulo da ponta, standoff (mm) e limites de extinção |

**Harmonizáveis.** Condições de atmosfera (O₂ em %, pressão em kPa ou atm, gravidade) e material (PMMA comum a BASS-II e GEL).

**Comparáveis com cuidado.** Fluxo em cm/s (Saffire, GEL), mas em configurações diferentes: concorrente sobre placa vs estagnação numa esfera. A grandeza física adequada no GEL é a taxa de deformação a = 3U/(2R), sem equivalente direto em placa.

**Não diretamente comparáveis.**

- A taxa de propagação sobre placa (Saffire, BASS-II) não equivale ao crescimento ou à extinção sobre a esfera (GEL).
- O BASS-II em px/s não tem escala.
- **Não se misturam modelos de geometrias diferentes.**

## 4. Pipeline proposto (mínimo)

```text
scripts/sofie/
  fetch_sofie.py        aquisição com manifesto (feito)
  pilot_video.py        leitura, cadência, transições, assimetria, periodograma (feito; vídeo público)
  -- quando houver vídeo bruto de voo:
  timebase_sofie.py     relógio do vídeo ↔ telemetria (O2, p, fluxo); quadros perdidos como lacunas
  calibrate_sofie.py    círculo da esfera em quadros LED → centro, raio (px), px/mm no plano médio, por quadro LED
  segment_sofie.py      máscara da chama (canal azul/CH*, limiar e conectividade), excluindo quadros LED
  contour_sofie.py      contorno → ângulo da ponta (θ = arcsin(x/R), lados ±), standoff no eixo de estagnação
  extinction_sofie.py   instante de extinção (área luminosa < limiar por N quadros), modo (ponta recua vs buraco na base)
  test_sofie.py         sintéticos (esfera e chama conhecidas) mais conferência com a Tabela 1 e as Figs. 3/5/8
```

**Validação com dados publicados (quando houver dados brutos):**

- 1409B: extinção em 757,55 s; 10 ciclos de pulsação de 0,4 s.
- 1409C: 927 s de pulsação, 1,4 → 0,8 Hz; standoff de 7 → 10 mm.
- 1408A: giro de 3,18 s.
- 1410C: giro de 2–3,5 Hz.

Esses números estão em `data/sofie/gel-extinction-cases-ntrs20240007628.json` (`dynamics`).

**Fora do escopo:** modelo preditivo generalizado e integração com o frontend.

## 5. Resultados reproduzidos

| Resultado | Situação | Tipo |
|---|---|---|
| a = 3U/(2R) e Re = UD/ν (ν ≈ 0,15 cm²/s) nos 5 casos da Tabela 1 | Coerente dentro do arredondamento | Derivado |
| Frequência de giro do 1410C | Periodicidade significativa de 2,66–4,43 Hz (H1); 3 de 10 janelas em 2–3,5 Hz; H2 incompatível | Medição (tempo de vídeo), coerência |
| Duração da fase giratória do 1410C | Cerca de 30 s de vídeo (15,7–45,7 s), compatível com os cerca de 35 s publicados só sob H1 | Medição, coerência |
| Standoff, ângulo da ponta, extinção em mm ou s de teste | **Não reproduzível** com dados públicos | — |

## 6. Limitações

- **Sem dados PSI públicos.** Sem telemetria e sem vídeos brutos. O único vídeo é uma edição de divulgação com trilha, cadência 3 e uma transição.
- **Base de tempo do vídeo não documentada.** H1 é inferida pela coerência com a publicação, que por isso não serve como validação independente.
- **Ambiguidade da métrica de giro.** A assimetria esquerda/direita mede a frequência de passagem (n chamas × rotação). Aliasing acima de 5 Hz não é excluído.
- **Artigo de 2025 inacessível** por automação (403). O mapa O₂ × velocidade e o efeito do pré-aquecimento estão só como faixas do resumo.
- **Divergência documental:** diâmetro de 4 cm (artigo) vs "4 a 5 cm" (GRC) vs "40 cm" (slide de 2019).
- **FIAT não identificada** em fonte pública.

## 7. Próxima etapa recomendada

1. **Pedir os dados brutos do GEL.** Para os 5 casos da Tabela 1, solicitar aos PIs ou à NASA GRC (P. Ferkul, S. Olson; PSI) os vídeos SoFIE Cam1, Cam2 e ACME a 30 fps com quadros LED e a telemetria de O₂, pressão, fluxo e termopares, ou acompanhar a liberação no PSI. Isso desbloqueia a escala, a base de tempo e todas as validações do §4.
2. **Monitorar o PSI.** Quando aparecer um ID SoFIE, aplicar o padrão de inventário e manifesto já usado no BASS-II e no SAME, sem misturar subexperimentos.
3. **Ler o artigo de 2025** por acesso institucional ou manual, e transcrever o mapa de extinção (O₂ × a) com o tipo "published".
4. **Com dados brutos, a primeira implementação deve ser** `calibrate_sofie.py` (círculo da esfera em quadros LED) mais o standoff no ponto de estagnação do caso 4 (1409C), validado contra a Fig. 8 (7 → 10 mm). É a única medida em mm com valor publicado.
