# FLARE: variáveis, definições e modelos publicados

Rótulos: ver [FLARE_DATA_REVIEW.md](FLARE_DATA_REVIEW.md).

## 1. LOC, MLOC e MOC (definições dos autores)

| Termo | Definição | Fonte |
|---|---|---|
| **LOC** (em 1g, "LOC1g") | "minimum oxygen concentration in which steady downward spread [is] achieved", em gravidade normal (fluxo flutuante assumido de cerca de 35 cm/s) | **[Publicado]** Tsuboi et al. 2016; Takahashi e Maruta 2018 |
| **LOC(Vg)** | concentração-limite em função da velocidade do fluxo oposto: a curva em "U" do mapa de inflamabilidade | **[Publicado]** 2018 (Fig. 1), 2024, 2026 |
| **MLOC** | "minimum limiting oxygen concentration", o mínimo da curva em "U" em microgravidade, variando o fluxo oposto | **[Publicado]** 2016, 2018; **[NASA/JAXA]** página JAXA ("minimum limiting oxygen concentration (MLOC) at which flame spread is sustained") |
| **Vcr** | velocidade do fluxo oposto em que o MLOC ocorre | **[Publicado]** 2016 |
| **LOCb** | LOC de blowoff em fluxo forçado (ensaio de solo) | **[Publicado]** 2018 |
| **ΔO₂** | diferença entre MLOC e LOC1g. **Os sinais diferem**: 2016 imprime MLOC − LOC (negativo), 2018 imprime LOC1g − MLOC (positivo) | **[Publicado]**; registrados como impressos |
| **MOC** (NASA-STD-6001) | concentração de O₂ do ensaio NASA Test 1 (propagação ascendente, critério de autoextinção). **Não é o LOC/MLOC do FLARE** | **[NASA/JAXA]** NTRS 20160001023 |

**[Inferência]** LOC1g e MLOC são medidos em gravidades diferentes e configurações de fluxo diferentes (descendente com empuxo vs fluxo oposto forçado). Não são a mesma grandeza em dois ambientes. Valores medidos e previstos ficam em registros separados.

## 2. Dicionário de dados

| Variável | Significado | Unidade | Campanha | Origem | Medida ou derivada |
|---|---|---|---|---|---|
| `material` | PMMA (Acryplen), NOMEX HT90-40, papel-filtro, LDPE, ETFE, HDPE | — | todas | fontes | identificação |
| `thickness_mm` | espessura | mm | 1g, parabólico (PMMA 0,125); WSTF (0,8–5,99) | 2016, 2018, NTRS 2016 | especificação |
| largura × comprimento | dimensões | mm, cm | 8 × 2 cm (1g e parabólico); 130 × 40 ou 20 mm (ISS) | 2016, 2018, 2024 | especificação |
| `geometry` | folha plana, tecido, fio, bastão | — | — | fontes | identificação |
| `balanceGas` | N₂, CO₂ ou Ar | — | 1g, parabólico (2016) | 2016 | condição |
| O₂ | fração volumétrica | % | todas | tabelas | condição ou limite |
| `pressure` | pressão | kPa ou atm | ISS 100 kPa; 1g ~1 atm; WSTF 101,3 kPa | 2024, 2016 | condição |
| temperatura | ambiente | K | ISS 298 K | 2024 | condição |
| `Vg` | velocidade do fluxo oposto | cm/s | parabólico 0–20; ISS 10–18 (exemplo); blowoff 40–130 | 2016, 2018, 2024 | condição |
| direção do fluxo | oposto (todos os dados obtidos); concorrente (citado no programa, sem dados) | — | — | página JAXA | condição |
| gravidade | 1g / µg de voo parabólico (~20 s) / torre (4,5 s) / ISS | — | — | fontes | condição |
| `LOC`, `MLOC` | limites (§1) | % O₂ | ver §1 | tabelas | **medida** ou **prevista** (separadas) |
| `Vcr` | velocidade no MLOC | cm/s | parabólico | 2016 | medida ou prevista; "2~6 cm/s" é faixa (sem número) |
| `deltaO2` | MLOC − LOC ou LOC1g − MLOC | p.p. | — | 2016, 2018 | publicada; **reproduzida** |
| `Vf` | taxa de propagação | mm/s | parabólico (figuras); ISS (1,0–1,5 em 2-D) | 2016, 2026 | medida (só resumo ou figura) |
| `Rf`, `Lg` | raio da chama 3-D; comprimento de pré-aquecimento | mm | ISS (NOMEX), IR | 2026 | medida e modelo (não obtidos) |
| `E*`, `A*` | energia de ativação e fator pré-exponencial empíricos (blowoff) | J/mol; m³/(kg s) | 1g | 2018 | calibração |
| `B1`, `B2` | constantes do modelo (0,28; 2,76) | — | 1g; torre | 2018 | calibração |
| propriedades do gás | c_p, λ_g, α_g, a_abs | J/(mol K), W/(m K), mm²/s, — | — | 2016 Tabela 1 | literatura |
| tempo de ignição, distância da frente | — | — | — | **não encontrados** nas fontes obtidas | — |

## 3. Metodologia experimental

- **Voo parabólico** **[Publicado]** (2016):
  - câmara fechada com fluxo oposto de 0–20 cm/s;
  - ignição por fio Ni-Cr 10 s antes da microgravidade;
  - câmera visível (taxa de propagação em 5 s) e câmera IR (pré-aquecimento);
  - MLOC obtido variando O₂ e Vg.
- **Blowoff em 1g** **[Publicado]** (2018): túnel de 14 × 14 cm com fluxo ascendente de 40–130 cm/s numa glovebox de 1 m³. O blowoff é definido em x_d = 4 cm, metade da amostra.
- **ISS/Kibo, SCEM** **[NASA/JAXA]**, folheto:
  - fluxo recirculado por ventilador e retificado por colmeia;
  - anemômetro de fio quente;
  - O₂ e pressão controlados (até 45 % de O₂; também baixa pressão);
  - ignição por fio aquecido numa extremidade;
  - câmeras visível, IR e de alta velocidade.

  **[Publicado]** 2024: em órbita foi medida a distribuição de velocidade, usada no modelo de velocidade efetiva.

## 4. Modelos publicados

**[Publicado]** Takahashi e Maruta (2018) e Tsuboi et al. (2016) usam análise de escala de chama 2-D sobre combustível termicamente fino, com fluxo oposto.

- **Balanço de calor na zona de pré-aquecimento do sólido.** Condução do gás, menos a perda radiativa da superfície, reduzida pelo fator (1 − 1/Da) para o efeito cinético finito.
- **Duas grandezas adimensionais:**
  - **R_rad**, número de perda radiativa, que cresce quando Vg diminui (extinção por quenching radiativo);
  - **Da**, número de Damköhler = t_res/t_chem, que cai quando a velocidade efetiva aumenta (blowoff).
- **Critério de extinção:** **R_rad + 1/Da = 1**. O LOC(Vg) é a concentração em que a soma atinge a unidade; o mínimo da curva é o MLOC.
- **Velocidade efetiva** na frente, pela camada-limite linear: V_g,eff depende de Vg e de Re_x = Vg·x_d/ν (x_d = 4 cm).
- **Constantes empíricas** (2018), aplicadas igualmente a PMMA e NOMEX:
  - B1 = 0,28, calibrada no LOC descendente de 17,0 % do PMMA;
  - B2 = 2,76, calibrada na torre de 4,5 s (extinção radiativa a 3 cm/s e 21 %).
- **Parâmetros cinéticos para materiais sem cinética conhecida (NOMEX):** A* e E* empíricos vindos do ensaio de blowoff em 1g, com média entre 70 e 120 cm/s.
- **Evolução:**
  - **2024**: o modelo original reproduziu o ramo de blowoff do papel-filtro na ISS, mas superestimou a região inflamável abaixo de 10 cm/s. Foi corrigido modelando a velocidade efetiva também no ramo radiativo, com o perfil medido em órbita.
  - **2026**: o modelo 2-D vale para o PMMA. O NOMEX forma chamas esféricas 3-D, e foi derivado um LOC 3-D com Lg(Rf, Re) e um critério de raio crítico.

**[Inferência] O que não foi implementado, e por quê.** A curva LOC(Vg) exige fechamentos que não estão tabelados: temperatura de chama em função de Y_O, propriedades do gás em T_v, emissividade, espessura e propriedades do sólido. As equações também estão embaralhadas na camada de texto do PDF. Implementá-la agora exigiria escolher parâmetros, o que viola a regra de não implementar modelos sem conhecer todas as hipóteses. Por isso só a aritmética das tabelas foi reproduzida.
