# Revisão de Saffire-I S2 e Saffire-III S2

**Base auditada:** `d47b2baee4d98a68a84fff1bce6d9f1fbc5937eb`, branch `feat/trial-registry`. Escopo: leitura estática, inventário local e recálculo de agregados salvos; nenhuma calibração, simulação, instalação, treino ou alteração de código. `ready` abaixo é o valor do artefato, não uma aprovação científica desta revisão.

## 1. Decisão de utilizabilidade

- **Registry/proveniência: utilizáveis como registros de ensaio e derivados exploratórios**, com identidade, direção, fontes, campos desconhecidos e ressalvas preservados. Não é necessário esperar nova anotação de imagens para registrar os ensaios existentes.
- **Continuação temporal condicionada: evidência exploratória limitada**, não validação externa. Ambos os kernels são ajustados na parte inicial do próprio S2 e comparados com sua continuação, iniciada na frente observada do trecho reservado.[6][7]
- **Previsão quantitativa física/transferência: não comprovada.** Não aprovar a partir do rótulo `ready`, da regra de 30%, de sementes Monte Carlo ou da concordância com uma média bibliográfica. Falta demonstrar observável, erro de registro/detecção, regime pós-ignitor e desempenho em ensaio fisicamente separado, mantido fora do desenvolvimento.
- **Revisão visual independente: pendente.** O cache indicado não contém imagens S2 nesta execução; por isso não se confirma aqui que os pontos detectados acompanhem uma frente física, nem que a janela exclua o transitório do ignitor. As declarações de revisão nos JSONs são procedência dos autores, não inspeção de pixels realizada nesta revisão.[4][5]

## 2. Fontes primárias e identidade física

A apresentação NASA NTRS **20170008805**, pp. 16, 20–21 e 29, descreve I S2 como queima oposta no combustível remanescente após a queima concorrente. A Tabela I informa cerca de **10 cm** restantes, largura **40,6 cm**, espessura **0,37 mm**, ar a **20 cm/s**, O₂ aproximadamente **21,5%**, ignição **182 W por 8 s** e duração de queima **70 s**. As velocidades médias relatadas são **1,8 mm/s concorrente** e **1,3 mm/s oposta**: nesta fonte, a concorrente é mais rápida.[1]

Consequência para a curadoria: I S1 e I S2 não devem contar como réplicas independentes de material virgem. S2 tem história térmica e combustível remanescente; uma grade nominal de 940 mm não prova que 940 mm estejam disponíveis para propagação oposta.[1][4]

O CSV NASA preservado de PSI-98, L1–3, também identifica S2 como `Opposed`, câmeras `S2C1/S2C2`, 20 cm/s, 182 W, 8 s e 70 s, mas registra espessura `0.37` sob cabeçalho em cm e comprimento/largura em ordem conflitante com a apresentação. Conservar o literal e a interpretação bibliográfica separadamente; não converter silenciosamente a célula em espessura confirmada.[2]

Para III S2, o CSV NASA PSI-100, L1–3, confirma `Opposed`, `S2C1/S2C2`, SIBAL, 94 × 40,6 cm, mas informa **30 cm/s** e espessura literal **`.33 cm`**. Não informa potência/duração de ignição, pressão ou O₂.[3] O manifesto e o derivado usam **25 cm/s e 21,2% O₂**; `ingest_saffire_iii.py:L73–79` atribui essas condições a `10.1016/j.combustflame.2018.10.012`, preservando 30 cm/s em `sourceTable`.[9][10] O artigo completo não foi lido nesta revisão: essa atribuição não resolve por si o conflito nem comprova as condições específicas de S2. Registrar ambas as versões com sua origem, deixando a adjudicação pendente.

## 3. Janelas, câmeras, direção e ignitor

| Item | I S2 | III S2 |
|---|---|---|
| Identidade do derivado | `PSI-98:t0:r3`, `S2C2` | `PSI-100:t0:r3`, `S2C2` |
| Janela configurada | `BASE=1465937796510`; amostras nominais de 15 a 35 s, passo 2 s | início `1496610689000`, duração 62 s, passo 2 s |
| Registro usado | `EDGE=301`, `SCALE=2.24 px/mm`; x crescente a partir da borda; limites intactos por faixa | `edgeX=326`, `edgeMm=0`, `scale=2.24`, `sign=+1`, ROI x=333..645, y=154..1068 |
| Separação temporal | 11 observações; split no índice 7: treino 15..29 s, reserva 29..35 s | `firstObservedSecond=0`, `splitTimeS=42`: treino 0..42 s, reserva 42..62 s |
| Referência anterior | baseline selecionado em `1465937797610`, usado para limitar combustível intacto | script exige quadro em torno de `1496610675000`, 14 s antes do início, sem detecção de frente |
| Direção física | oposta ao escoamento segundo NASA/CSV; o eixo do detector cresce com o avanço | oposta segundo CSV/manifesto; sinal +1 converte pixel x em avanço, não em direção de ventilação |

Localizações de I: `calibrate_saffire_s2.py:L18–24,110–151,162–179` e JSON L3–29,30–328,463–477.[4][6]

Localizações de III: `calibrate_saffire_iii.py:L24–35,79–103,118–165,169–207` e JSON L5–55,264–279.[5][7]

**Não confundir os relógios.** Em I, `timeS` é relativo a uma constante do script; o instante de energização/desligamento do ignitor não é ligado a essa constante por evento/sensor no derivado.[4][6]

Em III, a janela é um par epoch/duração e o quadro chamado anterior à ignição é uma escolha do script; não há no JSON prova independente de sua relação com a corrente do ignitor.[5][7]

Os 8 s bibliográficos de I não autorizam deduzir automaticamente que a amostra nominal em 15 s esteja sete segundos após desligamento.[1]

**Controle negativo é útil, mas insuficiente.** Em III, a verificação prévia rejeita uma frente falsa antes da queima; não demonstra que 0..42 s sejam regime autossustentado ou estacionário. A condição inicial de III é 3 células por faixa: já é uma frente reconstruída, não ensaio de probabilidade de ignição.[5][7]

**A direção precisa de evidência conjunta.** `sign=+1` e crescimento de coordenadas são compatíveis com a convenção implementada para S2; não provam a orientação do escoamento nos pixels. Falta confrontar ROI, borda de ignição, setas/metadados e sequência temporal. Não inverter uma etiqueta NASA apenas porque uma inclinação numérica ficou maior.

## 4. Verificação do cache existente: limite real desta revisão

Inventário executado com `os.listdir` e `os.walk` em:

`C:/Users/lucas/Documents/hkt_nasa_flame_snapshot_20261114/data/cache/saffire`

Resultado: somente `psi-100-s1`, contendo **4 ZIPs S1C1** e **6 JPGs de análise**; **nenhum diretório/ZIP/JPG S2**, nenhuma planilha de sensores S2 e nenhum `review.jpg` de I S2. Também foi conferida a inexistência de `data/cache/saffire` no worktree e no workspace `C:/Users/lucas/Documents/hkt_nasa_flame`. Não foi feito download para preencher a lacuna.

O manifesto versionado de III declara `S2C1` e `S2C2` como `available` e fornece hashes, contagens e intervalos: `S2C2` tem 3.139 quadros declarados, de `1496610671122` a `1496610776106`.[10] **Essa disponibilidade declarada não é disponibilidade física verificada neste cache.** A janela e o controle negativo configurados caem dentro desse intervalo declarado, mas não foi possível conferir seus quadros, CRCs, iluminação, timestamps efetivos ou o conteúdo do controle negativo.

Em I, o JSON preserva observações e hash de ZIP; em III, preserva hash do manifesto, registro e resumos, mas não a sequência completa `S2-observations.json` produzida no cache.[4][5][7] O hash do manifesto de III coincide com `provenance.manifestSha256`; isso verifica vínculo documental, não bytes dos ZIPs ausentes. Não foi usada imagem S1 como substituto visual de S2.

## 5. Números recalculados e diagnóstico das médias conflitantes

Recálculos feitos por Python sobre os JSONs, sem importar/executar os calibradores. Erro assinado: `100 × (v_sim / v_obs − 1)`. Métrica selecionada: `contiguousValidation`, nunca média entre campos de modelos diferentes.[4][5]

| Grandeza | I S2 | III S2 |
|---|---:|---:|
| Transições/exposições longitudinais de treino | 29/96 = 0,302083 por passo | 85/441 = 0,192744 por passo |
| Velocidade observada da checagem, mm/s | 2,000000 | 1,045455 |
| Velocidade média simulada selecionada, mm/s | 1,487500 | 0,759091 |
| Erro relativo assinado | **−25,625000%** | **−27,391304%** |
| MAE de posição, mm | 3,708333 | 7,023810 |
| Reserva nominal / sementes | 6 s / 20 | 20 s / 20 |

### I S2: a quantização altera fortemente a inclinação curta

Há **173/231** posições não nulas, cobertura **74,891775%**. Os limites intactos variam de **34,821429 a 141,964286 mm**. A reserva usa **12 faixas fixas**, não a população inteira ao longo do tempo. O script fixa esse conjunto justamente para impedir que a saída de faixas do campo altere a mediana.[4][6]

A reprodução da mediana espacial na grade para as quatro observações reservadas dá **[50, 50, 60, 60] mm**, em tempos nominais **[0, 2, 4, 6] s**: OLS = **2,000000 mm/s**. Pelos timestamps efetivos, os tempos são **[0, 2,033, 3,999, 5,966] s**, e a mesma série quantizada dá **2,010112 mm/s**. Entretanto, as medianas das posições **contínuas salvas, nas mesmas 12 faixas**, são **[52,232143; 54,464286; 57,142857; 59,821429] mm**; OLS nos timestamps efetivos = **1,280496 mm/s**.[4]

Isso identifica uma sensibilidade importante à grade/janela: 2,00 não pode ser tratado sem ressalvas como velocidade física contínua. A inclinação contínua é um diagnóstico sobre observações já processadas, não nova medição dos pixels, correção homologada ou novo alvo para reajustar o modelo. Não substituir a métrica selecionada retrospectivamente só para melhorar o resultado.

A diferença entre o resumo 2,00 e os 1,3 mm/s publicados para a queima oposta inteira não demonstra aceleração física nem inversão da relação concorrente/oposta. Há diferenças de janela, quantização e observável: o detector segue contraste verde/escuro, enquanto a fonte distingue posições de base da chama e pirólise.[1][6] Não calcular uma “média física” entre esses números; a proximidade de 1,280496 com 1,3 também não é validação independente.

### III S2: quatro estimadores não são quatro medições da mesma física

O JSON contém os seguintes resultados **distintos**:[5]

| Campo / implementação | Velocidade simulada, mm/s | Interpretação |
|---|---:|---|
| `validation.simulatedSpeedMmS` | 0,909091 | baseline longitudinal, uma execução do comparador histórico |
| `comparison.baseline.simulatedSpeedMmS.mean` | 0,950000 | baseline longitudinal, média de 20 sementes |
| `comparison.neighborhood.simulatedSpeedMmS.mean` | aproximadamente 0 | simulador de vizinhanças sem fallback |
| `contiguousValidation.simulatedSpeedMmS` | 0,759091 | modelo contíguo com fallback longitudinal, selecionado pelo gate |

`simulate_grid` pula configurações cuja probabilidade é nula; `simulate_contiguous` permite fallback longitudinal. O treino de III tem somente 4 exposições em `111`, 11 em `101` e 18 em `110`, abaixo do mínimo de 30; a frente inicial plana encontra configurações sem probabilidade publicada. Assim, a estagnação do simulador genérico é compatível com falta de cobertura do estimador, **não prova de extinção física**. As regras diferentes explicam por que não se deve agregar essas médias.[5][8]

O artefato informa cobertura 100%, zero pontos de sobreposição e MAE selecionado de 7,02 mm. Como S2 usa apenas S2C2, não há teste de concordância intercâmeras nessa janela; cobertura interna não equivale a precisão geométrica demonstrada.[5][7]

## 6. Por que 30% e 30 mm não são critérios científicos estabelecidos

No código, I exige MAE ≤ **10 mm** e erro de velocidade ≤ **30%**; III exige MAE ≤ **30 mm**, erro ≤ **30%**, cobertura ≥ 70% e contagem mínima de comparações. Esses são gates de implementação, sem orçamento de erro ou norma experimental demonstrados nas fontes examinadas.[6][7] “30 exposições” é outro limiar, de publicação de probabilidades por configuração, não fundamentação para tolerância de 30%.[8]

Sensibilidade calculada: com o mesmo erro relativo salvo, **ambos passam a 30% e ambos falham a 25% ou 20%**. Isso mostra dependência do limiar; não justifica escolher um dos três. A reserva de III tem deslocamento por `v_obs × 20 s` de **20,909091 mm**: permitir MAE de 30 mm é mais permissivo que esse deslocamento resumido. Além disso, os MAEs representam **30,902778%** e **33,592133%** de `v_obs × duração da reserva` em I e III, respectivamente. Essa razão é apenas diagnóstico de escala, não novo critério de aprovação.[4][5]

Critérios justificáveis devem partir da **decisão pretendida**, não da necessidade de fazer `ready`:

1. **Identidade/observabilidade:** confirmar câmera, direção, região intacta, escala e origem temporal; manter censura e o histórico de queima. Definir se a saída é chegada de contraste, pirólise ou outra frente.
2. **Regime:** verificar desligamento do ignitor por corrente/evento e excluir ou modelar explicitamente seu transitório; avaliar separadamente remanescente, bordas e perda de visibilidade. Testar sensibilidade a janelas e faixas fixas, sem escolher a mais favorável após olhar o teste.
3. **Orçamento de erro:** estabelecer a distância/tempo que muda a decisão e medir erro de registro, anotação/detecção, sincronização e discretização. Como triagem conservadora, usar um orçamento explícito `E_pos(H) = E_observação + H × |Δv|`, com hipóteses de regime e discrepância declaradas; não vender essa expressão como intervalo probabilístico ou dinâmica validada.
4. **Tolerância ligada ao uso:** se a decisão admite erro espacial `L` no horizonte `H`, uma condição candidata é `|Δv| ≤ (L − E_observação)/H`, somente com margem positiva e hipóteses sustentadas. Um erro relativo deriva daí e de `|v_obs|`; não é universal. Perto de velocidade nula, privilegiar erro absoluto/tempo de chegada em vez de percentagem instável.
5. **Generalização:** protocolo congelado antes do ensaio externo, com métricas de posição, velocidade, forma e cobertura; intervalos que distingam sementes, incerteza observacional e variação entre ensaios.

**Não há nesta revisão base para fixar um novo limiar numérico de aprovação física.** Até existir decisão de uso e orçamento medido, conservar 30%/30 mm apenas como descrição de uma heurística implementada, sem qualificar o produto como validado.

## 7. Teste temporal exploratório versus validação externa

O split cronológico evita usar contagens futuras para ajustar as probabilidades daquele teste, mas compartilha amostra, aquisição, registro, detector, seleção de janela e regime. I reserva somente quatro instantes; III reserva 11 pontos nominais. As 20 sementes não aumentam o número de ensaios físicos. Não foi demonstrado que janelas, ROI, thresholds ou escolha do modelo foram congelados antes de olhar a reserva.[6][7][8]

Portanto, chamar os resultados de **checagem temporal exploratória de continuação condicionada**. Para validação externa, reservar ensaio fisicamente separado sem usá-lo para escolher janela, detector, fallback ou tolerância; documentar condições compatíveis e observação independente. Comparar com uma média publicada da mesma queima é checagem de reconstrução, não teste externo. Usar I S2 para ajustar e III S2 para validar exigiria congelamento e reconciliação das condições — não é o procedimento implementado, pois cada um ajusta seu próprio S2.[6][7]

## 8. Tarefas específicas de revisão — não bloqueiam o registry

| Prioridade | Tarefa / evidência de fechamento | Efeito enquanto pendente |
|---|---|---|
| Alta | Localizar os ZIPs S2 e os JPGs já produzidos; conferir hashes e timestamps dos quadros realmente usados, sem refazer download grande por padrão. | Manter `visual_independent_review` desconhecido/pendente; não transformar `available` do manifesto em verificação local. |
| Alta | Revisão de I S2 no baseline, início, split e fim, com duas anotações independentes; conferir frente contínua versus grade e censura do remanescente. | Conservar 2,00 como métrica quantizada curta, acompanhada da sensibilidade 1,280496; não usá-la como física validada. |
| Alta | Revisar III S2 nos quadros anterior/0/42/62 s e conferir associação câmera–borda–fluxo; obter corrente/eventos do ignitor e definir janela pós-transitório. | Origem física do tempo e regime permanecem não comprovados. |
| Alta | Adjudicar 25 versus 30 cm/s e O₂ 21,2% com trecho/tabela primária específico de III S2; preservar os literais CSV e a espessura ambígua. | Registry pode armazenar versões conflitantes sem promover uma a condição confirmada. |
| Média | Estimar erro de registro/detecção com anotações separadas; análise de sensibilidade à escala, grade, faixa, pulso e janela, mantendo teste final reservado. | Não criar tolerância universal por conveniência. |
| Média | Vincular cada métrica ao simulador/fallback e organizar protocolo externo por ensaio físico, com histórico de uso dos dados. | Não interpretar estagnação genérica nem média entre modelos como fenômeno físico. |

São tarefas de curadoria/validação científica; **não bloqueiam cadastrar identidades, fontes e linhagem existentes**. Bloqueiam apenas elevar a alegação para frente física verificada, teste externo ou previsão transferível. Esta revisão não altera o status de runtime nem código de colegas.

## 9. Reprodução dos cálculos e trilha de auditoria

Trecho equivalente aos cálculos executados, somente leitura; executar a partir da raiz deste worktree. Os valores derivam de posições salvas e não de nova extração dos pixels:

```python
import json
import statistics as st
from pathlib import Path

a = json.loads(Path('public/data/saffire/psi-98-s2-neighbors.json').read_text())
b = json.loads(Path('public/data/saffire/psi-100-s2-neighbors.json').read_text())
for name, obj in [('I', a), ('III', b)]:
    v = obj['contiguousValidation']
    print(name, 'erro_pct=', 100 * (v['simulatedSpeedMmS'] / v['observedSpeedMmS'] - 1),
          'MAE_mm=', v['positionMaeMm'])

o = a['observations']
split = int((len(o) - 1) * .7)
reserved = o[split:]
limits = a['intactLimitMmByRow']
# Mesma grade de centros/censura do states(), sem chamar o calibrador.
def cells(obs, row):
    f = obs['frontMm'][row]
    return [None if f is None or (x + .5) * 10 >= limits[row]
            else int((x + .5) * 10 <= f) for x in range(94)]
rows = [y for y in range(21)
        if all(1 in cells(frame, y) and 0 in cells(frame, y) for frame in reserved)]
grid = [st.median([sum(c == 1 for c in cells(frame, y)) * 10 for y in rows])
        for frame in reserved]
continuous = [st.median([frame['frontMm'][y] for y in rows]) for frame in reserved]
times = [(frame['timestampMs'] - reserved[0]['timestampMs']) / 1000
         for frame in reserved]
def slope(x, y):
    mx, my = st.mean(x), st.mean(y)
    return sum((t - mx) * (v - my) for t, v in zip(x, y)) / sum((t - mx)**2 for t in x)
assert len(rows) == 12 and grid == [50, 50, 60, 60]
assert abs(slope([0, 2, 4, 6], grid) - 2) < 1e-10
assert abs(slope(times, continuous) - 1.2804964625918942) < 1e-10
print('faixas=', rows, 'grade=', grid, 'tempos=', times)
print('OLS_grade_timestamps=', slope(times, grid), 'OLS_continuo=', slope(times, continuous))
```

Localizações de decisão: I JSON L329–478, script L45–107,162–179; III JSON L97–164,165–279, script L169–230; regras de simulação em `calibrate_saffire_neighbors.py:L62–130,138–160`. Tabelas NASA originais: ambos os CSVs L1–3. NTRS: páginas 16,20–21,29; texto local preservado em `C:/Users/lucas/Documents/HabitatFire-research/lunar-predictive-simulation/research/T1/ntrs-saffire-pdf.txt:L200–204,236–248,308–324`. O endpoint oficial de metadados e o texto completo NTRS foram consultados com HTTP 200; a extração web genérica falhou por backend somente de busca, contornado pela leitura direta do endpoint NASA. Não foi preciso baixar mídia.

SHA-256 calculados dos bytes lidos:

| Arquivo | SHA-256 |
|---|---|
| `public/data/saffire/psi-98-s2-neighbors.json` | `4c614561f45fab7d2e3c9197db4b9df785b9cfbf7268e005a3cf1eb0a68b6c50` |
| `public/data/saffire/psi-100-s2-neighbors.json` | `6582f3f4f91250c332f9ea352ae8a0954354df97fb9ca9d00d1bad9ed4900b03` |
| `scripts/calibrate_saffire_s2.py` | `2c56c77944999fd8713571b481024134a923ed4ab559168f8b9850fc63bf0ac6` |
| `scripts/calibrate_saffire_iii.py` | `edfd75b91ee087e6d279b86391529aea1ba60846bcd17df04da5618116fb58f5` |
| `data/saffire/psi-100/manifest.json` | `329e05fbb181e0264f57aea984d9997a206fd40406958d154590918d77d69ff7` |

Limites finais: sem pixels S2, sensores, erro geométrico independente, teste externo congelado ou confirmação do pós-ignitor. Consistência dos JSONs e inclinações reproduzidas não resolvem essas lacunas. O único arquivo de produto criado por esta tarefa é este documento; não houve commit/push.

## Sources

[1] https://ntrs.nasa.gov/api/citations/20170008805/downloads/20170008805.pdf — NASA NTRS 20170008805
[2] file:///C:/Users/lucas/Documents/habitatfire-trial-registry/data/raw/psi/PSI-98/PSI-98_Experimental%20table_SAFFIRE-1.csv — NASA PSI-98 tabela original preservada
[3] file:///C:/Users/lucas/Documents/habitatfire-trial-registry/data/raw/psi/PSI-100/PSI-100_Experimental%20table_SAFFIRE-3.csv — NASA PSI-100 tabela original preservada
[4] file:///C:/Users/lucas/Documents/habitatfire-trial-registry/public/data/saffire/psi-98-s2-neighbors.json — Artefato I S2
[5] file:///C:/Users/lucas/Documents/habitatfire-trial-registry/public/data/saffire/psi-100-s2-neighbors.json — Artefato III S2
[6] file:///C:/Users/lucas/Documents/habitatfire-trial-registry/scripts/calibrate_saffire_s2.py — Extrator I S2
[7] file:///C:/Users/lucas/Documents/habitatfire-trial-registry/scripts/calibrate_saffire_iii.py — Extrator III
[8] file:///C:/Users/lucas/Documents/habitatfire-trial-registry/scripts/calibrate_saffire_neighbors.py — Estimadores e simuladores
[9] file:///C:/Users/lucas/Documents/habitatfire-trial-registry/scripts/ingest_saffire_iii.py — Ingestao III
[10] file:///C:/Users/lucas/Documents/habitatfire-trial-registry/data/saffire/psi-100/manifest.json — Manifesto III
