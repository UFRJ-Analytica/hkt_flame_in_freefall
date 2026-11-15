# BASS-II (PSI-25) — revisão da documentação NASA

Revisão dos sete documentos do PSI-25 recuperados em 14/11/2026. Os arquivos ficam em `data/cache/bass2/docs/` (fora do Git); nome, origem, tamanho, data e SHA-256 de cada um estão em `data/bass2/docs-manifest.json`. Os fatos extraídos por programa estão em `data/bass2/documents-derived.json` (gerado por `scripts/bass2/documents_bass2.py`).

Convenções deste texto:

- **[NASA]** fato escrito em um documento da NASA, com página, aba ou célula.
- **[PSI]** dado encontrado nas tabelas ou na listagem de arquivos do PSI.
- **[Inferência]** conclusão nossa a partir desses dados.
- **[Hipótese]** ainda não confirmada.
- "PDF p. N" é a página do arquivo PDF do Summary Report; "rel. p. N" é o número impresso na página.

## 1. Documentos lidos

| Documento | Bytes | O que contém |
|---|---:|---|
| `PSI-25_Science Documents_BASS-II_ReadMe.docx` | 21 538 | Definição de cada coluna da matriz de testes; lista de publicações |
| `PSI-25_Reference Data_Fan calibration data.xlsx` | 23 973 | Uma aba, `Fan Calibration data`, A1:DE35: 27 calibrações (pot, Fan Display, Air Display) por dia e por número de restritores |
| `PSI-25_Science Documents_BASS-II_Test.Matrices.xlsx` | 28 956 | Seis abas, uma por pesquisador, 129 linhas no total |
| `PSI-25_Science Documents_BASS-II_SRD.pdf` | 1 108 340 | Requisitos científicos, manifesto de amostras, matrizes planejadas (16 p.) |
| `PSI-25_Engineering Documents_BASS-II_Ops.docx` | 1 111 856 | Procedimento de bordo 2.014 "BASS OPS WITH REDUCED O2 PARTIAL PRESSURE" (27 p.) |
| `PSI-25_Engineering Documents_BASS-II_Engineering Requirements.pptx` | 1 123 356 | Requisitos de engenharia e fotos do hardware (7 slides) |
| `PSI-25_Reports_BASS-II Summary Report.pdf` | 48 972 416 | NASA/TM-20210011385, outubro de 2021, 137 p. |

Todos vieram do PSI (endereço estável no manifesto). O NTRS não foi necessário.

## 2. Montagem experimental **[NASA]**

Summary Report, PDF p. 12–13 (rel. p. 4–5), salvo indicação:

- Duto de fluxo preto anodizado de 7,6 × 7,6 × 17 cm, dentro do Microgravity Science Glovebox (MSG) da ISS; seção de teste de 17 cm.
- Ventilador de velocidade variável. Até dois restritores na entrada reduzem a faixa de vazão: máximo de ~55 cm/s sem restritor e ~35 cm/s com dois.
- Transdutor de velocidade omnidirecional TSI 8475 entre a colmeia e a tela de entrada; tempo de resposta de ~1 min.
- Dentro da seção de teste: bocal de N₂, **uma escala móvel** e um radiômetro (termopilha Oriel 71768), não calibrado.
- Câmera fotográfica Nikon D300s (4 320 × 2 968 px, lente de 60 mm) pela janela superior — vista de topo, normal à superfície da amostra.
- Câmera de vídeo Panasonic WV-CP654 (760 × 480 px) com espelho, pela janela frontal — vista lateral, de perfil para amostras planas. Vídeo a 29,97 quadros/s (PDF p. 102).
- Amostras: bastões de PMMA de 6,35 a 12,7 mm de diâmetro, placas e filmes de PMMA de 0,125 a 5 mm, seção de esfera de PMMA de 4 cm, tecido algodão/fibra de vidro (SIBAL). Amostras planas com 1 ou 2 cm de largura.
- Ignição manual por fio quente Kanthal A-1.
- Pressão total de 99,2 a 99,5 kPa nos testes de filme de PMMA (PDF p. 46).
- O₂ reduzido por diluição do volume de trabalho com N₂ da ISS; fan no máximo durante a diluição (PDF p. 14).

## 3. Significado das variáveis

| Campo | Significado | Unidade | Fonte | Variação temporal? | Confiança |
|---|---|---|---|---|---|
| `Fan display` | Tensão instantânea do ventilador × 10, lida na sobreposição do vídeo. Máximo 122 (12,2 V). A célula às vezes traz também o ajuste do potenciômetro da caixa de controle (0 a 10). | 10 × V (potenciômetro: adimensional) | ReadMe; Summary Report PDF p. 13 | **Sim.** Muitas células listam vários valores na ordem em que foram aplicados | Alta |
| `Air display` | Velocidade do ar medida no duto, lida na sobreposição do vídeo | cm/s | ReadMe; Summary Report PDF p. 12–13 | Sim, mas com resposta de ~1 min: só é estável após muito tempo no mesmo ajuste | Alta para o significado; média para o valor em regimes curtos |
| `Flow restrictor` | Número de placas perfuradas na entrada do ventilador. 0 = maior vazão; 2 = menor vazão | contagem (0, 1, 2) | ReadMe; Ops §6 | Fixo durante o teste | Alta |
| `Radiometer gain` | Ganho do radiômetro, ajustado para não saturar. Leitura não calibrada, útil só de forma relativa | 1000, 250, 50 ou 10 | ReadMe; Ops §9.5 | Às vezes trocado durante o teste (`250>50`) | Alta |
| `Total Frames Shot` | Fotos tiradas com a Nikon, incluindo teste e pós-queima | contagem | ReadMe | — | Alta |
| `Calibrated initial/final O2 % by vol` | Leitura do sensor CSA-CP corrigida por um deslocamento diário calculado com o MCA da ISS | % vol | ReadMe; Summary Report PDF p. 14 | Inicial e final; resolução do sensor 0,1% | Alta, exceto em fevereiro de 2014 (seção 7.3) |
| `Initial/Final CO2 % by vol` | Sensor CDM | % vol (resolução 0,1) | ReadMe; PDF p. 14 | Inicial e final | Alta |
| `Initial/Final CO (ppm)` | Sensor CSA-CP; `OR` = acima de 1 000 ppm | ppm (resolução 1) | ReadMe; PDF p. 14 | Inicial e final | Alta |
| `GMT` | Dia do ano; a ISS usa GMT | dia | ReadMe | — | Alta |
| `Date` | Data real do teste. **A data mostrada no vídeo é um dia depois**, por um ano bissexto não tratado pelo computador de bordo | m/d/aaaa | ReadMe; cabeçalho da matriz | — | Alta |
| `Test #` | Inicial do pesquisador + número da matriz inicial; `a`/`b` quando a mesma amostra foi usada duas vezes no mesmo dia | — | ReadMe | — | Alta |
| `Sample #` | Número da amostra; algumas foram usadas em mais de um teste | — | ReadMe | — | Alta. Os sufixos `m`, `M`, `L` não estão definidos |
| `PI` | Aba da planilha | — | Planilha de matrizes | — | Alta |

Variáveis que **não** estão no CSV mas existem em outro documento:

| Variável | Onde está | Observação |
|---|---|---|
| Direção do fluxo (opposed, concurrent, stagnation) | Summary Report, Apêndice A | 120 de 126 linhas; as 6 de GMT 45 e 49 não trazem a palavra. Os termos estão na coluna intitulada "Sample distance", que nos testes de GMT 45 traz números; ler a coluna como direção é **[Inferência]** (nota da fase P2) |
| Número "as-run" (ordem de execução) | Apêndice A | 1 a 126 |
| Horário de início/fim no relógio do vídeo | Apêndice A | Início em 52 testes; início e fim em 14 |
| Observações (ignição, extinção, blowoff, cor) | Apêndice A | Texto livre por teste |
| O₂ não calibrado inicial/final | Apêndice A | Permite ver o deslocamento aplicado |
| Vazão de N₂ | Sobreposição do vídeo, rótulo `FUEL` | cm³/min (PDF p. 13) |
| Sinal do radiômetro | Sobreposição do vídeo, rótulo `RAD` | Não calibrado |
| Largura real das amostras de tecido | PDF p. 102 | 1,2 e 2,2 cm (o CSV diz "1 cm"/"2 cm"); 10 cm de comprimento exposto; 0,32 mm de espessura |
| Dimensão dos filmes de PMMA | PDF p. 29 | 20 mm × ~95 mm, 100 a 400 µm |
| Dimensão dos bastões | PDF p. 55 | 6,35, 9,525 e 12,7 mm de diâmetro; 57,15 mm de comprimento |
| Temperatura | — | Não registrada por teste |
| Duração da queima | Tabela 5.1 (só placas de PMMA) | Em minutos |

## 4. Fan display, Air display e calibração

### 4.1 O que está documentado **[NASA]**

- `Fan display` é a tensão × 10 mostrada no vídeo (ReadMe). O ventilador **para acima de zero volt**: a nota da célula D1 da planilha diz que ele desliga "above 3.8 volts" e recomenda não usar o ponto de 3,8 V como vazão zero.
- `Air display` é a leitura direta do transdutor, em cm/s (ReadMe). O mostrador só tem a casa das unidades, o que dá resolução efetiva de ±0,5 cm/s (PDF p. 74). O requisito de exatidão do hardware herdado do SPICE era ±10% (SRD p. 1).
- A velocidade na seção de teste é `U = 1,0066 × AIR` (planilha, células A33 e E7), "based on SPICE fan calibration data at 56 mm downstream, 36 mm from bottom (centerline)" (A34).
- A calibração era feita **ao fim de cada dia de operação, para cada configuração de restritor em uso** (PDF p. 13 e p. 74; Ops §11: potenciômetro em 10, 8, 6, 4, 2 e 0, esperando ~1 min por leitura).
- Os pesquisadores determinaram a velocidade **pela tensão do ventilador e pela calibração**, não pela leitura instantânea do ar: "A hot wire anemometer is used to calibrate the flow velocity with fan voltage, which is used to determine the flow velocity" (PDF p. 29).
- Em velocidades muito baixas a calibração tem "high error bars", e há atraso entre a mudança no ventilador e a chegada da nova velocidade à chama (PDF p. 21).

### 4.2 Relação potenciômetro → Fan display **[PSI]**

Na planilha a relação é praticamente a mesma em todos os dias:

| Pot | 10 | 8 | 6 | 4 | 2 | 1 | 0,5 | 0 |
|---|---|---|---|---|---|---|---|---|
| Fan display | 122 | 105–105,5 | 88–89 | 72 | 55 | 46,5–47 | 42 | 38 |

Por isso, nas células do CSV, valores até ~10 são ajustes de potenciômetro e valores de 38 a 122 são leituras do Fan display. As duas faixas não se sobrepõem. **[Inferência]**

### 4.3 Cobertura da calibração **[PSI]**

A planilha organiza cada dia em três blocos. Os rótulos "no restrictor", "1 restrictor" e "2 resrictor" só aparecem na coluna D do primeiro dia; para os outros dias a ordem 0/1/2 segue a nota de D1 ("Data is organized by number of restrictors used") **[Inferência]**. A leitura é coerente: onde há mais de um bloco medido, o ar a 12,2 V cai do bloco 0 para o bloco 2.

| GMT 2014 | Colunas | Restritores com medidas | Ar a Fan 122 (cm/s) | Nota da planilha |
|---|---|---|---|---|
| 043 | A:C | 0, 1, 2 | 29 / 21 / 18 | Coluna de exemplo; a célula de data (B3) diz 01/04/2014, incompatível com o dia 43 |
| 45 | G:I | 2 | 22 | |
| 49 | K:M | 0, 1, 2 | 59 / 38 / 31 | post soot cleaning |
| 50 | O:Q | 0, 1, 2 | 59 / 31 / 22 | post soot cleaning |
| 091 | S:U | 0, 2 | 54 / 34,5 | door repair |
| 100 | W:Y | 0, 2 | 55 / 37 | |
| 174 | AA:AC | 0, 2 | 55 / 36 | |
| 175 | AE:AG | 2 | 38 | |
| 177 | AI:AK | 2 | 37 | |
| 178 | AM:AO | 2 | 33 | |
| 183 | AQ:AS | 0, 2 | 52 / 34 | |
| 184 | AU:AW | 2 | 36 | |
| 188 | AY:BA | 0 (só o máximo), 2 | 43 / 27 | post soot cleaning |
| 188 | BC:BE | 2 | 35 | end |
| 189 | BG:BI | 2 | 35 | |
| 190 | BK:BM | 0 (dois pontos), 2 | 47 / 32 | |
| 192 | BO:BQ | 2 | 35 | |
| 195 | BS:BU | 2 | 30 | |
| 196 | BW:BY | 2 | 32,5 | |
| 202 | CA:CC | 2 | 40 | |
| 203 | CE:CG | 2 | 32 | |
| 209 | CI:CK | 2 | 22 | |
| 210 | CM:CO | 2 (e bloco 0 com os mesmos valores) | 20 | Ver anomalia abaixo |
| 212 | CQ:CS | 1 | 29 | a.m., post soot cleaning |
| 212 | CU:CW | 1 | 40 | p.m. |
| 213 | CY:DA | 1 | 35 | |
| 216 | DC:DE | 1 (só o máximo) | 27,5 | "Max air reading only after ops, 27.5" |

Consequências:

- **A calibração muda muito de um dia para outro.** Com dois restritores, o ar a 12,2 V vai de 20 a 40 cm/s. A própria planilha associa parte disso à limpeza de fuligem. Uma calibração não pode ser levada de um dia para outro.
- **Dias de teste sem calibração na planilha:** GMT 51, 164, 167, 204 e 211 de 2014, e 26/02/2016. São 20 registros (M1, M2, M5, M10, M14, M16, M19, O3a, O3b, P1, P2, P3a, P3b, P18, P20, P23, P24, O20, O21, O22).
- **T15** (GMT 45, sem restritor) tem o dia calibrado só para dois restritores.
- Os outros 108 registros têm calibração do mesmo dia e do mesmo número de restritores (campo `fanCalibration` do inventário).
- **Anomalia em GMT 210:** o bloco 0 repete os valores do bloco 2 (20, 15, 10, 7, 3 cm/s), muito abaixo de qualquer outro dia sem restritor (43 a 59). Tratar como duplicação até confirmar. **[Hipótese]**

### 4.4 Resposta à questão prioritária

1. **`Air display` é a velocidade medida em cm/s?** Sim. **[NASA]** ReadMe e Summary Report coincidem, e o rótulo `AIR` aparece na sobreposição dos vídeos piloto.
2. **`Fan display` pode ser convertido em velocidade?** Sim, por interpolação na calibração **do mesmo dia e do mesmo número de restritores**, multiplicando por 1,0066 para a seção de teste. Foi assim que a NASA obteve as velocidades publicadas. **[NASA]**
3. **Verificação em dois testes** **[Inferência]**:
   - T11 (GMT 178, 2 restritores, Fan 48): os pontos vizinhos são Fan 38 → 0 e Fan 55 → 7 cm/s. A interpolação dá ~4,1 cm/s; a Tabela 7.1 do relatório publica 4 cm/s. O `Air display` do CSV diz 5.
   - B3 (GMT 50, 2 restritores, Fan 47): a calibração tem o ponto Fan 47 → 2,5 cm/s; o relatório descreve o segundo teste de filme de 100 µm com "3 cm/s" (PDF p. 21). O `Air display` do CSV diz 2.
4. **Limites.** Não converter fora da faixa calibrada, nem para dias ou restritores sem calibração. Abaixo de Fan ~47 a incerteza é alta (o ventilador para em 38 e a planilha desaconselha usar esse ponto).

### 4.5 Como cada leitura se relaciona com o regime temporal

- O CSV lista os ajustes na ordem em que ocorreram, **sem horário**. Ele não permite datar mudanças de regime.
- O vídeo mostra `FAN` e `AIR` em todos os quadros. Nos pilotos a sobreposição se atualiza a ~4,8 Hz (ver `BASS2_PILOT_VIDEO_REVIEW.md`). **A leitura da sobreposição é a única fonte que dá o instante de cada mudança.**
- `FAN` responde de imediato; `AIR` demora ~1 min. Para um regime curto, a velocidade deve vir de `FAN` + calibração; `AIR` serve de conferência quando o ajuste dura mais de um minuto.
- Há atraso de transporte entre o ventilador e a chama (PDF p. 21), não quantificado nos documentos.

## 5. Sobreposição do vídeo

| Fonte | O que diz |
|---|---|
| Summary Report, PDF p. 13 | Vazão de N₂ (cm³/min), tensão do ventilador (10 × V), leitura do transdutor de ar (cm/s) e sinal do radiômetro |
| SRD p. 1 | Vazão de GN₂, tensão do ventilador, velocidade **e direção** do ar e radiação da chama; aquisição a **4 Hz**, que "can not be changed from SPICE/BASS" |
| Engineering Requirements, slide 1 | Idem, 4 Hz, exatidão de ±10% |
| ReadMe | "Video display data rate is **5 Hz**" |
| Summary Report, PDF p. 74 | Radiômetro "at 5 Hz" |
| Ops §11.5, Figura 18 | Valores `AIR` e `FAN` lidos no "MSG Video Monitor 1" |
| Ops §4.3 | A data no monitor de vídeo pode estar um dia adiantada |
| Apêndice A, teste T1 | "Video display time is currently 1 day plus 6 min 10 s ahead of actual GMT" |

Os documentos divergem entre 4 Hz e 5 Hz. Nos vídeos piloto medimos ~4,8 Hz.

## 6. Matrizes experimentais e reconciliação 126 × 129

### 6.1 Três versões da mesma matriz

| Versão | Linhas | Colunas | Diferenças |
|---|---:|---|---|
| CSV do PSI (`data/raw/psi/PSI-25/…BASS-II.csv`) | 129 | 17 | Tabela achatada, com a coluna `PI` |
| Planilha `Test.Matrices.xlsx` | 129 | 16 por aba | Idêntica ao CSV em todas as células, exceto a ordem das palavras do material em 6 linhas do T'ien ("SIBAL 2 cm" × "2 cm SIBAL"). O CSV trocou as vírgulas das listas por espaços |
| Summary Report, Apêndice A (Tabelas A.1–A.6, PDF p. 111–121) | 126 | ~35 | Acrescenta horário, as-run, ignitor, direção, distância da amostra, ajustes da câmera, O₂ não calibrado e observações |

Linhas por aba: Bhattacharjee 22, Ferkul 4, Miller 20, Olson 27, Fernandez-Pello 27, T'ien 29.

### 6.2 Reconciliação

- **[NASA]** "A total of 126 tests were conducted as part of BASS-II. This is more than the planned 103 tests, since some samples were burned more than once" (PDF p. 11).
- **[PSI]** O Apêndice A tem 126 linhas, com números as-run de 1 a 126, sem lacunas nem repetições.
- **[PSI]** As três linhas do CSV ausentes do Apêndice A são **O20, O21 e O22**, de 26/02/2016. O cabeçalho da aba Olson diz "GMT 2014- (except last 3 tests from 2016)".
- **Conclusão:** 129 = 126 testes de 2014 (os do relatório) + 3 testes de 2016, posteriores à campanha descrita. **[Inferência]**, sustentada pelas contagens acima.

Cada linha do CSV é uma execução (um acionamento de ignição com registro próprio), não uma amostra nem um número de teste:

- 119 números de teste distintos; 10 foram executados duas vezes com sufixos `a`/`b` (O3, O5, O8, O13, O15, P3, P13, P21, P22, T28).
- 23 amostras aparecem em mais de uma linha (lista em `reconciliation.samplesUsedMoreThanOnce` do inventário). Exemplos: amostra 133 em T9, T23 e T24; amostra 220 em O5a, O5b e O22.
- Não há linhas administrativas no CSV do PSI-25 (ao contrário do PSI-26, que tem "SOOT Cleaning").
- Várias execuções não tiveram ignição sustentada: os três Nomex (F1–F3; PDF p. 54), T9, T10, T12, T23, T28a, T28b (Tabela 7.1) e O12 ("no ign at any flow").

### 6.3 Regimes por teste

O campo `conditions` de cada registro do inventário guarda:

- `fanDisplayRaw` e `airDisplayRaw`: texto do CSV.
- `fanDisplaySteps` e `airDisplaySteps`: os itens da célula da planilha separados por vírgula, na ordem original. Um item só recebe valor numérico se for um número puro; "pot 0.4", "<1", "blowoff" ficam como texto.
- `singleFlowSetting`: verdadeiro quando Fan e Air têm um único número cada. São 17 registros: B1, B2, B3, B4, B5, B7, B12, F1, F2, F3, P21a, P21b, T1, T3, T11, T28a, T28b.
- `flowDirection`, `timing` e `observationsRaw`: do Apêndice A.

Horários de ignição, estabilização e mudança de regime **não existem em nenhuma tabela**. O Apêndice A dá, no máximo, início e fim aproximados no relógio do vídeo. Esses instantes terão de ser lidos no vídeo.

## 7. Anomalias dos dados resolvidas pela documentação

### 7.1 O₂ final absurdo é artefato de fórmula **[Inferência]**

O Apêndice A mostra lado a lado o O₂ calibrado e o não calibrado:

| Teste | Calibrado inicial | Calibrado final | Não calibrado inicial | Não calibrado final | Leitura |
|---|---|---|---|---|---|
| B1 | 22,2 | 22,2 | 20,6 | 20,6 | Deslocamento do dia = 1,6 |
| B2 | 22,2 | **1,6** | 20,6 | — | Final ausente; 1,6 é só o deslocamento |
| P22a | 20,8 | **0,6** | 20,2 | — | Idem (deslocamento 0,6) |
| T28a | 20,7 | **0,9** | 19,8 | — | Idem (0,9) |
| F3 | 21,7 | **0,9** | 20,8 | — | Idem; o CSV traz "none" |
| P22b | 20,0 | **39,1** | — | 19,1 | 20,0 + 19,1: soma de duas células |
| T28b | 20,7 | **40,4** | — | 19,7 | 20,7 + 19,7 |

Esses valores não são medições e não devem ser usados.

### 7.2 Outras

- **B14, O₂ = 15,0:** é o valor do teste (14,1 não calibrado), não um desalinhamento de colunas. O relatório registra "only brief ignition, flame extinguished".
- **T9, T18 e F4 com ano 2018:** o erro está também no relatório ("6/24/2018"); GMT 175 e as-run 33–36 confirmam 24/06/2014.
- **O10 com GMT 213:** o Apêndice A imprime "7/22/14, GMT 203"; os arquivos do PSI também usam GMT 203. O 213 é erro de digitação da planilha.
- **T15, Fan display "80122":** o Apêndice A imprime "80, 122".
- **P17, Fan display "233":** permanece sem explicação (o máximo é 122).

### 7.3 O₂ de fevereiro de 2014 é incerto **[NASA]**

- A Tabela 7.1 marca T1 e T2 (GMT 45) com a nota "O2 reading in these two tests might be inaccurate".
- A observação de B3 no Apêndice A diz "Probably 20.6 O2 to start".
- A Figura 2.20 descreve B03, B11, B4 e B13 em "20.7 percent O2", enquanto o CSV dá 22,2% para os testes de GMT 50.

Para os testes de GMT 45 a 51, o O₂ calibrado do CSV (18,5 a 22,2%) deve ser tratado com cautela.

## 8. Como a NASA mediu a propagação **[NASA]**

| Grupo | Fonte da imagem | Método | Página |
|---|---|---|---|
| Bhattacharjee (filmes de PMMA, fluxo oposto) | Fotos de topo da Nikon, 1 por segundo | Aplicativo MATLAB "Flame Analyzer". Isola a faixa central de ~14 mm para excluir as bordas; converte RGB em intensidade; faz a média na largura; a borda de ataque é o ponto onde a intensidade cruza um **limiar fixo (30)**; também rastreia o máximo de intensidade. A velocidade é a inclinação de uma **regressão linear sobre 5 posições consecutivas**. Reprodutibilidade de 5% | PDF p. 30 e 47 |
| Miller e Wichman (placas de PMMA) | Fotos e vídeos | Rastreamento no Spotlight-16 (software da NASA), exportado para Excel; posição × tempo por trecho de fluxo constante | PDF p. 64 |
| T'ien (SIBAL, fluxo concorrente) | Vídeo lateral a 29,97 quadros/s e fotos de topo a ~1 por 1,2 s | Rastreamento da ponta, da base e do comprimento da chama. "When flow speed and O2 concentration were low, the flame became very dim blue and was difficult to see in the side video camera"; as fotos de topo, com exposição de 1/8 a 1/4 s, registram até chamas fracas | PDF p. 102–103 |
| Fernandez-Pello (bastões, fluxo oposto) | Vídeo e fotos | Taxa de propagação por condição de fluxo; método não detalhado no relatório | PDF p. 56–59 |
| Olson (bastões, estagnação) | Vídeo a 30 quadros/s e fotos | Limites de extinção e blowoff; regressão do bastão | PDF p. 74–76 |

Os "Still_Sequence.mp4" do PSI são, segundo o relatório, as fotos de topo convertidas em vídeo ("The still images from the BASS experiments are converted to videos", PDF p. 47). **[Inferência]** para a correspondência exata com os arquivos do PSI. *Correção da fase P2:* no B1, o `Still_Sequence` é a gravação da tela de revisão da Nikon (miniatura, histograma e metadados), não as fotos em resolução de análise.

## 9. Resultados publicados que podem validar medições

| Resultado | Valor | Fonte |
|---|---|---|
| Filme de PMMA de 100 µm, primeiro teste (B1): propagação estável antes do corte do fluxo | 2,2 mm/s; extinção em até 2 s após o corte | PDF p. 21 e 31 |
| Filme de PMMA de 100 µm: maior taxa em microgravidade | ~2,2 mm/s, entre ~1 e ~40 cm/s | PDF p. 48–49 |
| Velocidade de extinção, filmes de 100 a 300 µm | ~1 cm/s (~1,5 cm/s para 400 µm) | PDF p. 21 |
| Velocidade de extinção a ~16% de O₂ | ~2,6 cm/s (100 µm) e ~4 cm/s (200 µm) | PDF p. 23 |
| Placas de PMMA: taxa de propagação por velocidade, 18 dos 20 testes M | 0,012 a 0,144 mm/s; ex. M7: 10, 6, 5, 3 cm/s → 0,106, 0,099, 0,083, 0,07 mm/s | Tabela 5.1, PDF p. 65 |
| SIBAL: velocidade, O₂ e desfecho por teste | Ex. T11: 2,2 cm, 4 cm/s, 17,1% | Tabela 7.1, PDF p. 104 |
| SIBAL: taxa de propagação estável | Só em gráfico (Figura 7.4), sem tabela | PDF p. 106 |
| SIBAL: limite de extinção por baixa velocidade | 1 a 5 cm/s, maior em O₂ mais baixo | PDF p. 108 |
| Bastões pretos de PMMA: faixas de O₂ e velocidade por diâmetro | Tabela 4.2; taxas só em gráfico | PDF p. 56–58 |

As Tabelas 5.1 e 7.1 estão em `documents-derived.json` (`publishedResults`) e ligadas a cada registro no inventário (`published`). O O₂ inicial das duas tabelas coincide com o do catálogo em todos os testes.

## 10. Anomalias de operação **[NASA]** (Apêndice C, PDF p. 127)

1. GMT 51: o canto da porta de Lexan superaqueceu por um vazamento durante uma queima longa; reparo em GMT 86 e 91.
2. Após GMT 167: o vídeo do experimento caiu por defeito no conector da câmera; reparado em GMT 170.
3. GMT 205: jato de vapor em chamas durante tentativa de blowoff deixou mancha de fuligem na janela; limpa em GMT 209.

A planilha de calibração registra ainda limpezas de fuligem em GMT 49, 50, 188 e 212.

## 11. Divergências entre documentos

| Tema | Valores |
|---|---|
| Cadência da sobreposição | 4 Hz (SRD, Engineering Requirements) × 5 Hz (ReadMe, Summary Report) |
| Velocidade máxima | 40 cm/s (metadados PSI-25) × 50 cm/s (PDF p. 29) × ~55 cm/s sem restritor (PDF p. 12) |
| Largura do SIBAL | "1 cm"/"2 cm" (matriz) × 1,2/2,2 cm (PDF p. 102) |
| O₂ dos testes B de GMT 50 | 22,2% (matriz) × 20,7% (Figura 2.20) × "probably 20.6" (Apêndice A) |
| Matriz de calibração, 1º dia | GMT 043 × data 01/04/2014 |
| Câmera de vídeo | 760 × 480 px (PDF p. 13) × "high-definition" (PDF p. 64) |

## 12. Índice do Summary Report

| Tema | PDF p. | Rel. p. |
|---|---|---|
| Contagem de testes; diluição com N₂ | 11 | 3 |
| Duto, ventilador, restritores, transdutor, escala, câmeras, sobreposição | 12–13 | 4–5 |
| Sensores de O₂, CO, CO₂ | 14 | 6 |
| Filmes de PMMA: extinção, 2,2 mm/s | 21–23 | 13–15 |
| Método de imagem (RGB, limiar, regressão) | 30 e 47 | 22 e 39 |
| Comparação microgravidade × 1g, Figura 2.20 | 45–50 | 37–42 |
| Nomex e vela | 54 | 46 |
| Bastões em fluxo oposto | 55–60 | 47–52 |
| Placas de PMMA, Tabela 5.1 | 64–67 | 56–59 |
| Bastões em estagnação; resolução do transdutor | 74–76 | 66–68 |
| SIBAL, Tabela 7.1, visibilidade na vista lateral | 101–109 | 93–101 |
| Matrizes de teste (Apêndice A) | 111–121 | 103–113 |
| Anomalias (Apêndice C) | 127–128 | 119–120 |

## 13. O que os documentos não respondem

- Campo de visão e escala (mm por pixel) das duas câmeras.
- Posição e graduação da "escala móvel".
- Atraso entre a mudança no ventilador e a chegada à chama.
- Significado dos sufixos `m`, `M`, `L` em `Sample #`.
- Conteúdo exato dos pacotes `GMT2014_ddd_BASS_S…_TP….zip` (os nomes citam "D300s" e "NEF", o que indica fotos da Nikon, mas nenhum foi aberto).
- Taxas numéricas de propagação para SIBAL e bastões (só em gráficos; os artigos originais precisam ser consultados).
