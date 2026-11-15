# BASS-II (PSI-25) — inspeção dos vídeos piloto e metodologia de medição

Inspeção de três vídeos baixados do PSI em 14/11/2026. Nada aqui é segmentação ou medição de chama: os quadros foram amostrados, ampliados e observados. Os vídeos ficam em `data/cache/bass2/videos/` e as pranchas de contato em `data/cache/bass2/previews/` (ambos fora do Git); os hashes estão em `data/bass2/videos-manifest.json`.

Marcação usada: **[NASA]** documento da NASA; **[PSI]** tabela ou listagem do PSI; **[Vídeo]** observado nos quadros; **[Inferência]** conclusão nossa; **[Hipótese]** não confirmada. As páginas citadas são do PDF do Summary Report (NASA/TM-20210011385).

## 1. Vídeos selecionados

| Arquivo | Registro | Bytes | SHA-256 |
|---|---|---:|---|
| `PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1.mp4` | `PSI-25:t0:r2` (B1) | 5 803 980 | `e82f6426…d273cd` |
| `PSI-25_Raw Data_BASS_GMT178_SAMPLE_135_TEST_T11.mp4` | `PSI-25:t0:r111` (T11) | 12 444 685 | `8b058470…524177` |
| `PSI-25_Raw Data_BASS_GMT178_SAMPLE_135_TEST_T11_2ND_VIEW.mp4` | `PSI-25:t0:r111` (T11) | 31 544 262 | `53307802…fabfd7` |

Total: 49 792 927 bytes (limite autorizado: 60 MB). As três associações são "confirmadas" no inventário (teste, amostra e GMT coincidem).

### Por que estes

| | B1 | T11 |
|---|---|---|
| Material **[NASA/PSI]** | Filme de PMMA de 100 µm, 2 cm de largura, fluxo oposto | Tecido SIBAL, 2,2 cm de largura, fluxo concorrente |
| Regime **[PSI]** | Um ajuste só: Fan 62, Air 5, 2 restritores | Um ajuste só: Fan 48, Air 5, 2 restritores |
| O₂ inicial **[PSI]** | 22,2% no CSV; 20,6% não calibrado (incerto, ver revisão documental §7.3) | 17,1% |
| Observação do relatório **[NASA]** | "Ignited very quickly, turned flow off after spread halfway; flame extinguished very quickly" | "Burned completely, steady" |
| Resultado publicado **[NASA]** | Propagação estável de 2,2 mm/s; extinção em até 2 s após o corte do fluxo (p. 21) | 4 cm/s, 17,1% O₂ na Tabela 7.1; taxa só em gráfico (Figura 7.4) |
| Horário no relógio do vídeo **[NASA]** | 10:09:50 a 10:10:16 | Não informado |
| Calibração do ventilador **[PSI]** | Disponível para GMT 50, 2 restritores | Disponível para GMT 178, 2 restritores |
| Mídia listada **[PSI]** | Principal 5,8 MB; sequência de fotos 2,8 MB | Principal 12,4 MB; "2ND_VIEW" 31,5 MB; sequência de fotos 3,7 MB |

B1 é o melhor caso de validação que existe para PMMA: curto, regime único e com valor numérico publicado. T11 foi mantido como candidato SIBAL por ter regime único, queima completa e arquivo "2ND_VIEW". A inspeção mostrou que essa escolha tem dois problemas (seções 4 e 5).

## 2. Características técnicas **[Vídeo]**

Não há `ffprobe` nem `ffmpeg` instalados. Os dados abaixo vêm da leitura dos átomos MP4 (`scripts/bass2/inspect_video_bass2.py`, biblioteca padrão); a decodificação dos quadros usou o OpenCV já instalado.

| | B1 | T11 | T11 2ND_VIEW |
|---|---|---|---|
| Contêiner | MP4 (`ftyp`, `free`, `mdat`, `moov`) | idem | idem |
| Vídeo | H.264 (`avc1`) | H.264 | H.264 |
| Áudio | AAC (`mp4a`), 48 kHz | AAC | AAC |
| Resolução armazenada | 720 × 480 | 720 × 480 | 720 × 480 |
| Proporção de pixel (`pasp`) | 10:11 → exibição 654,5 × 480 (4:3) | **40:33 → exibição 872,7 × 480 (16:9)** | não lida |
| Base de tempo | 30 000 unidades/s | idem | idem |
| Duração de cada quadro | 1 001 unidades em todos os quadros | idem | idem |
| FPS nominal = FPS médio | 29,970 | 29,970 | 29,970 |
| Quadros | 1 343 | 3 575 | 5 669 |
| Duração | 44,81 s | 119,29 s | 189,16 s |
| Quadros-chave | 6 | 15 | 23 |
| Lista de edição | 1 trecho; começa na unidade 2 002 (atraso de 2 quadros de reordenação) | idem | idem |
| Cortes aparentes | Nenhum no contêiner | Nenhum | Nenhum |

Observações:

- Os três arquivos são **reencodes**: 720 × 480 a 29,97 quadros/s com taxa de bits baixa (~1 Mbit/s no B1 e no T11). A câmera original é de 760 × 480 **[NASA, p. 13]**. Os originais estão nos ZIPs "original videos" (14,6 MB para B1; 69,9 MB para T11), que não foram baixados.
- **A proporção de pixel difere entre os arquivos.** A câmera é 4:3; a marcação 16:9 do T11 parece um ajuste de conversão **[Hipótese]**. Qualquer calibração espacial precisa tratar o eixo horizontal e o vertical separadamente e conferir a proporção arquivo por arquivo.
- Não há carimbo de tempo por quadro além do índice e da base de tempo constante.

## 3. Sobreposição de dados **[Vídeo]**

Presente no vídeo principal de B1 e de T11, no topo do quadro (aproximadamente x de 150 a 720, y de 30 a 85 px):

```
FUEL   AIR   FAN   RAD
  -2     5    62  1.27
02/20/14  10:10:03
```

| Campo na tela | Correspondência | Unidade | Base |
|---|---|---|---|
| `FUEL` | Vazão de N₂. O rótulo vem do hardware SPICE, que injetava combustível gasoso | cm³/min | **[NASA]** p. 13 para a grandeza; **[Inferência]** para o rótulo |
| `AIR` | Leitura do transdutor de velocidade = coluna `Air display` | cm/s | **[NASA]** ReadMe e p. 13 |
| `FAN` | Tensão do ventilador × 10 = coluna `Fan display` | 10 × V | **[NASA]** ReadMe e p. 13 |
| `RAD` | Sinal do radiômetro, não calibrado | adimensional | **[NASA]** p. 13 |
| Data e hora | Relógio do sistema de vídeo do MSG | mm/dd/aa hh:mm:ss | **[Vídeo]** |

Conferência com o CSV: B1 mostra `FAN` 61–62 e `AIR` 5 (CSV: 62 e 5); T11 mostra `FAN` 48 e `AIR` 5 (CSV: 48 e 5). **A correspondência entre os campos do CSV e a sobreposição está confirmada nos dois testes.**

Data: B1 mostra 02/20/14 e o teste é de 19/02/2014; T11 mostra 06/28/14 e o teste é de 27/06/2014. É o dia a mais descrito no ReadMe. **[NASA + Vídeo]**

### Os valores mudam durante o teste?

Sim. **[Vídeo]**

| Tempo do vídeo | Relógio | B1: `FAN` | `AIR` | `RAD` |
|---|---|---|---|---|
| 0,0 s | 10:09:36 | 61 | 5 | 0,05 |
| 12,2 s | 10:09:47 | 62 | 5 | 1,30 (ignitor) |
| 16,3 s | 10:09:51 | 62 | 5 | 0,90 |
| 32,6 s | 10:10:07 | 62 | 5 | 1,29 |
| 36,6 s | 10:10:11 | 55 | 5 | 1,22 |
| 38,0 s | 10:10:13 | 46 | 5 | 1,03 |
| 40,7 s | 10:10:15 | 38 | 5 | 0,52 |
| 44,8 s | 10:10:19 | 38 | 4 | 0,22 |

- O corte do fluxo descrito no relatório aparece como a queda de `FAN` de 62 para 38 entre 10:10:10 e 10:10:15. `AIR` continua em 5 e só cai para 4 no fim: é a resposta lenta de ~1 min documentada.
- No T11, `FAN` fica em 48 (49 por instantes) e `AIR` em 5 (6 por instantes) durante os 119 s; `RAD` sobe de 0,14 para ~3,4 por volta de 100 s e cai para 0,37 no fim.
- `FUEL` oscila entre −1 e −3 nos dois vídeos: N₂ desligado, com ruído de zero. **[Inferência]**

### Cadência de atualização **[Vídeo]**

Diferença quadro a quadro em uma janela fixa sobre o valor de `RAD`: as mudanças ocorrem a intervalos de 6 ou 7 quadros (e múltiplos, quando o valor se repete), média de ~6,24 quadros, ou **~4,8 atualizações por segundo**. Os documentos dizem 4 Hz (SRD) ou 5 Hz (ReadMe).

### Relógio da sobreposição × tempo do arquivo **[Vídeo]**

| | Relógio no primeiro e no último quadro | Relógio decorrido | Tempo do arquivo | Razão |
|---|---|---|---|---|
| B1 | 10:09:36 → 10:10:19 | 43 s (±1) | 44,78 s | 0,96 |
| T11 | 14:19:40 → 14:21:38 | 118 s (±1) | 119,25 s | 0,99 |

> **Correção (fase P2, `BASS2_B1_TIMEBASE_AND_TELEMETRY.md` §6–7):** a conclusão original deste parágrafo estava errada. Com a leitura de todos os quadros e o vídeo original (TS), o relógio e o tempo do arquivo avançam na mesma taxa: inclinação 0,9995 ± 0,0008 no MP4 e no TS. A diferença vem de **30 quadros de preenchimento no início do MP4** (~1,0 s, cópias do primeiro quadro, cobrindo o áudio que começa antes do vídeo) e da quantização de 1 s do relógio nas pontas. As 11 leituras espaçadas citadas tinham resolução de 1 s e não sustentavam uma deriva de 4%. O tempo do MP4 é utilizável depois de descontado o deslocamento de 30 quadros.

Texto original, mantido para registro: "No B1 a razão se mantém ao longo do vídeo (em 11 intervalos de 4,07 s de arquivo o relógio avança 3,9 s em média), então não é erro de leitura nas pontas. O tempo do MP4 não é uma base física confiável: no B1 ele corre ~4% mais devagar que o relógio do experimento."

## 4. O que se vê em cada vídeo **[Vídeo]**

### B1 — PMMA, vista lateral

- Fundo totalmente preto (duto anodizado, luz do volume de trabalho apagada; Ops §8.6).
- 0 a 10 s: nada além da sobreposição.
- ~10 a 13 s: brilho saturado do ignitor à esquerda. Por um instante ele ilumina a borda do suporte da amostra (uma aresta vertical e uma barra horizontal no alto do quadro), e parte do brilho invade a área da sobreposição.
- ~14 a 37 s: chama bem definida, formada por **duas faixas luminosas paralelas**, uma de cada lado do filme, visto de perfil. O filme em si não aparece. A chama é rosada/avermelhada na imagem, com a ponta direita mais fraca e azulada.
- A chama avança **da esquerda para a direita** e fica mais longa com o tempo. Isso bate com o relatório: fluxo da direita para a esquerda, ignição na ponta esquerda (p. 29).
- ~37 a 40 s: com a queda de `FAN`, a chama enfraquece e some em 2 a 3 s, como o relatório descreve.
- Pixels acima de um brilho moderado existem só entre 10,2 e 37,8 s do arquivo.
- Pontos fixos isolados (pixels quentes do sensor) aparecem com ganho alto.

### T11 — SIBAL, vista lateral

- Fundo preto. Entre ~17 e ~27 s aparece o brilho do ignitor, à direita.
- **Depois disso a chama é praticamente invisível.** Mesmo multiplicando o brilho por 6, o que se vê são traços azulados muito fracos que se deslocam lentamente da direita para a esquerda ao longo de ~80 s. O valor máximo de pixel fora da sobreposição tem mediana de 74 (em 255).
- O radiômetro, porém, sobe continuamente (`RAD` de 0,14 a ~3,4): há chama, e ela queima a amostra inteira, como o relatório registra.
- É exatamente o que o relatório avisa para esta condição (4 cm/s, 17,1% de O₂): "When flow speed and O2 concentration were low, the flame became very dim blue and was difficult to see in the side video camera" (p. 102). Para esses casos o grupo do T'ien usou as fotos de topo, com exposição de 1/8 a 1/4 s (p. 103).

### T11 "2ND_VIEW"

- **Não é uma segunda câmera científica.** É uma câmera de cabine, por cima do ombro do tripulante, mostrando a frente do glovebox, o monitor de vídeo 1 (com a sobreposição), o monitor 2 (imagem da câmera fotográfica) e as mãos e a cabeça do operador.
- Dura 189 s, mais que o vídeo principal, e não tem sobreposição própria.
- Serve como contexto operacional (quando o ignitor foi acionado, quando as fotos foram disparadas), não para medir a chama nem para fusão entre câmeras.
- O papel `second-view` do inventário deve ser lido assim. Só este arquivo foi inspecionado; os outros 101 arquivos "2ND_VIEW" podem ser diferentes. **[Hipótese]** de que sejam do mesmo tipo.

## 5. Avaliação para medição

| Critério | B1 | T11 |
|---|---|---|
| Qualidade visual | Boa: alto contraste entre chama e fundo; compressão visível, mas a chama tem dezenas de pixels de comprimento | Insuficiente: chama abaixo do ruído de compressão na maior parte do teste |
| Chama distinguível do fundo | Sim | Não, na vista lateral |
| Chama distinguível do material | O material não aparece; só a chama | Idem |
| Interferências | Ignitor saturado nos primeiros segundos; brilho invadindo a sobreposição; pixels quentes | Ignitor; pixels quentes |
| Região de interesse | Faixa horizontal central do quadro, abaixo da sobreposição (y > ~100 px) | — |
| Geometria observável | Posição das pontas esquerda e direita da chama, comprimento e separação das duas faixas | Nenhuma de forma confiável |
| Frente de chama | Visível: ponta direita (a montante) | Não visível |
| Calibração temporal | Possível pelo relógio da sobreposição (resolução de 1 s; tiques detectáveis) | Idem |
| Calibração espacial | **Sem referência de escala no quadro escuro** | Idem |

### Calibração espacial

Nenhum objeto de tamanho conhecido aparece nos quadros escuros. Caminhos possíveis, em ordem de confiança:

1. **Fotos de topo** (`Still_Sequence.mp4` ou os pacotes de fotos da Nikon): a largura da amostra (20 mm no filme; 22 mm no SIBAL) e as bordas do suporte aparecem no mesmo plano da chama. O grupo do Bhattacharjee sobrepôs pontos a cada 6 mm nessas imagens (p. 30).
   *Correção da fase P2:* o `Still_Sequence.mp4` do B1 **não contém as fotos**. É a gravação da tela de revisão da câmera: miniaturas de baixa resolução, em que a amostra não aparece. Só os NEF originais ou a folha de prova poderiam servir, e nenhum deles está entre os arquivos do B1 já baixados (ver `BASS2_B1_SPATIAL_CALIBRATION.md`).
2. **Vídeos originais completos** (ZIP "original videos"): podem conter trechos com a luz acesa, mostrando o suporte, a amostra de ~95 mm e a "escala móvel" da seção de teste (p. 12). **[Hipótese]**
3. **Comprimento queimado conhecido**: no T11 a amostra de 10 cm queimou inteira; a distância entre a ignição e o fim da queima dá uma escala ao longo do eixo de propagação. No B1 a chama só percorreu metade da amostra.
4. **Largura do campo igual à seção de teste**: se os 720 px cobrissem os 17 cm, a escala seria ~4,2 px/mm. **[Hipótese]** sem nenhuma confirmação documental.

Usar o valor publicado (2,2 mm/s) para calibrar a escala e depois "validar" contra o mesmo valor seria circular.

### Uma conferência grosseira, não uma medição **[Inferência]**

Lendo a prancha de contato do B1 a olho, a ponta direita da chama avança ~150 px entre 17,2 s e 32,8 s do arquivo, ou ~10 px por segundo de relógio. Com a hipótese 4 acima (~4,2 px/mm), isso daria algo em torno de 2,3 mm/s, da mesma ordem dos 2,2 mm/s publicados. A incerteza dessa leitura é grande (±20% ou mais) e a escala é uma suposição; o número só indica que a ordem de grandeza é plausível e que vale a pena medir direito.

## 6. Metodologia recomendada

### 6.1 O que cada vídeo permite observar

| Fenômeno | Vista lateral (vídeo) | Vista de topo (fotos) |
|---|---|---|
| Região luminosa da chama | Sim, quando a chama é forte (B1). Não em chamas azuis fracas (T11) | Sim, inclusive chamas fracas (exposição longa) **[NASA]** |
| Frente de chama (borda de ataque) | Sim: extremidade a montante da região luminosa | Sim: foi o que a NASA rastreou |
| Frente de pirólise | Não diretamente; o material não aparece | Parcial: camada de bolhas no PMMA, limite da zona queimada |
| Região carbonizada / queimada | Não (cena escura) | Sim no SIBAL (a malha de fibra de vidro fica; "bright spots" de brasa atrás da chama, p. 103); só na foto pós-queima iluminada no PMMA |
| Combustível ainda não consumido | Não | Sim, se houver iluminação ou na foto pós-queima |

No BASS-II a grandeza medida pela NASA é a **frente de chama**, não a frente de carbonização que o protótipo Saffire detecta.

### 6.2 Comparação das abordagens

| # | Abordagem | Onde serve | Limites | Recomendação |
|---|---|---|---|---|
| 1 | Segmentação da região luminosa | B1 e chamas fortes na vista lateral; fotos de topo | Ignitor saturado; brilho na sobreposição; falha em chamas fracas | Usar para comprimento, largura e área aparentes, depois de mascarar a sobreposição e o período do ignitor |
| 2 | Perfil de intensidade RGB com limiar ao longo do eixo de propagação | Frente de chama em filmes e placas de PMMA; é o método da NASA (p. 30) | O limiar (30 nas fotos da NASA) depende da câmera e da exposição; precisa ser reajustado para o vídeo comprimido | **Método principal** para a posição da frente |
| 3 | Segmentação em HSV | Separar chama azul de fuliginosa; excluir o ignitor avermelhado | A cor do vídeo comprimido é pouco confiável (a chama do B1 aparece rosada) | Só como apoio à classificação de regime (azul × fuliginosa), não para a posição |
| 4 | Rastreamento de contornos | Geometrias 2D: seção esférica, chamas em bastão, forma da frente vista de topo | Sensível a ruído e à compressão | Segunda etapa, depois que o método 2 estiver validado |
| 5 | Borda de carbonização | SIBAL nas fotos de topo ou pós-queima | Não existe para PMMA (o material vaporiza); invisível no vídeo escuro | Só para SIBAL, e como grandeza distinta da frente de chama |
| 6 | Rastreamento temporal da frente | Sempre | Precisa aceitar recuo (blowoff), extinção e reignição, que são fenômenos reais aqui | Regressão linear por trecho de regime constante, como a NASA (5 posições consecutivas, p. 30; Tabela 5.1 por velocidade) |
| 7 | Combinação com a telemetria sobreposta | Sempre que houver sobreposição | Exige ler os dígitos (OCR de fonte fixa) | **Necessária**: dá o instante de cada mudança de `FAN`, a base de tempo física (relógio) e o sinal `RAD` para marcar ignição e extinção |

### 6.3 Por material e geometria

| Amostra | Fonte de imagem recomendada | Grandeza principal | Observações |
|---|---|---|---|
| Filmes de PMMA (B) | Fotos de topo; vídeo lateral como segunda fonte | Posição da borda de ataque; velocidade por regime | Comparável ao valor publicado (2,2 mm/s em 100 µm) |
| Placas de PMMA (M) | Fotos de topo e vídeo lateral | Velocidade por trecho de fluxo constante | Testes de 6 a 30 min; taxas de 0,012 a 0,144 mm/s na Tabela 5.1; em O₂ ~19% as placas de dois lados queimam por regressão, não por propagação (p. 66) |
| Bastões pretos (P), fluxo oposto | Vídeo lateral | Borda de ataque ao longo do bastão | Chamas azuis e fracas em baixa velocidade (p. 56) |
| Bastões transparentes (O), estagnação | Vídeo lateral | Extinção e blowoff; regressão da ponta | A chama fica na ponta e o bastão regride: não é propagação de frente (p. 59). O bastão transparente não oferece contraste próprio |
| SIBAL (T), fluxo concorrente | Fotos de topo em baixa velocidade; vídeo lateral só acima de ~10 cm/s | Ponta, base e comprimento da chama (Figura 7.2) | Fluxo concorrente: a "frente" relevante é a ponta a jusante e a base; a chama pode não atingir regime estável em 10 cm |
| Seção esférica (T3, T7) | Vídeo lateral e fotos | Crescimento da chama | Geometria 3D; sem valor publicado em tabela |
| Nomex (F1–F3) | — | — | Não houve ignição sustentada |

Um único detector não serve a todos os casos.

### 6.4 Grandezas pretendidas

| Grandeza | B1 (PMMA, lateral) | SIBAL em baixa velocidade (lateral) | Com fotos de topo |
|---|---|---|---|
| Posição da frente em px | Viável | Não observável | Viável |
| Posição da frente em mm | Viável com calibração adicional | Não observável | Viável (largura da amostra no quadro) |
| Comprimento da chama em mm | Viável com calibração adicional | Não observável | Viável |
| Largura aparente | Não observável (vista de perfil); a separação entre as faixas é observável | Não observável | Viável |
| Área aparente em mm² | Viável com calibração adicional; é uma projeção lateral, com sentido físico limitado | Não observável | Viável |
| Centroide | Viável | Não observável | Viável |
| Velocidade da frente em mm/s | Viável com calibração adicional e com o relógio da sobreposição como base de tempo | Não observável | Viável (1 foto por ~1 a 1,2 s) |
| Mudança de velocidade por regime | Viável nos testes com vários ajustes, lendo `FAN` na sobreposição | Insuficiente para determinar | Insuficiente para determinar: é preciso sincronizar as fotos com a sobreposição do vídeo |
| Extinção e reignição | Viável (brilho + queda de `RAD`) | Viável só por `RAD` | Viável |

### 6.5 Referências para validação

1. **B1:** 2,2 mm/s de propagação estável e extinção em até 2 s após o corte (p. 21). Um teste, um número.
2. **Placas M:** Tabela 5.1, 18 testes com taxa por velocidade. É o melhor conjunto para validar a separação por regime.
3. **Filmes B em vários regimes** (B6, B10, B11, B13): dados catalogados pelo grupo em flame.sdsu.edu e nos artigos de 2015–2017 (não verificados aqui).
4. **SIBAL:** Figura 7.4 (gráfico) e Zhao et al., Proc. Combust. Inst. 36 (2017) — valores a extrair do artigo.
5. **Conferência interna:** a velocidade do fluxo obtida de `FAN` + calibração do dia deve reproduzir a coluna de velocidade das Tabelas 5.1 e 7.1.

## 7. Limitações

- Só três arquivos foram vistos, de dois testes. Conclusões sobre "os vídeos BASS-II" em geral são extrapolações.
- Os MP4 são reencodes; cor, nitidez e base de tempo podem diferir dos originais.
- A leitura da sobreposição foi feita a olho em quadros amostrados; a cadência de 4,8 Hz vem de diferença de quadros em uma janela fixa, não de leitura dos dígitos.
- A escala espacial não foi determinada.
- O T11 não serve como piloto de visão computacional na vista lateral.

## 8. Recomendação de piloto

- **PMMA: manter B1.**
- **SIBAL: trocar a fonte, não necessariamente o teste.** Baixar a sequência de fotos de topo do T11 (`…TEST_T11_Still_Sequence.mp4`, 3,7 MB) e a do B1 (2,8 MB). São a modalidade que a NASA usou e cabem no limite de vídeo ainda disponível (~10 MB). Se a vista lateral for obrigatória para SIBAL, os candidatos são T1 (10 cm/s, 18,5% O₂, 11,7 MB, com horário de início e fim no relatório) e T19 (11 cm/s, 17,2% O₂, 9,2 MB).
- Esses downloads não foram feitos porque a autorização desta etapa cobria apenas um vídeo principal por material e a segunda vista do SIBAL.
