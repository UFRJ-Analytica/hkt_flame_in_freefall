# FLARE: análise, comparação e próximas etapas

Rótulos: ver [FLARE_DATA_REVIEW.md](FLARE_DATA_REVIEW.md). Os dados estão em `data/flare/derived/`.

## 1. Resumo

- **[Medição] Disponibilidade.** Não há dataset FLARE no NASA PSI. Os valores quantitativos acessíveis vêm de **tabelas publicadas em acesso aberto** (J-STAGE, 2016 e 2018), das campanhas de 1g e de voo parabólico com PMMA fino e NOMEX HT90-40. Dos artigos da ISS (2024 papel-filtro; 2026 PMMA/NOMEX; 2026 dinâmica do papel-filtro), só há resumos: os textos completos responderam 403 ou estão em repositório em manutenção.
- **[Derivado] Reprodução.**
  - As 10 diferenças ΔO₂ impressas (medidas e previstas, em 2016 e 2018) foram reproduzidas exatamente a partir de LOC e MLOC.
  - Os erros de MLOC do modelo também foram reproduzidos: −1,7, −3,8 e −2,4 p.p. em 2016 (N₂, CO₂, Ar), e −0,1 e +0,1 p.p. em 2018 (PMMA, NOMEX).
- **Relação estudável hoje.** MLOC < LOC1g para todos os pontos (5 pares material/gás). MLOC/LOC1g fica entre 0,79 (PMMA em CO₂) e 0,94 (NOMEX em ar). Vcr medido: 10 cm/s (N₂), 9 cm/s (Ar) e "2~6 cm/s" (CO₂).
- **Não reproduzível agora:** os mapas e os valores da ISS. O artigo de 2026 só está disponível como resumo.

## 2. Resultados quantitativos

### 2.1 Tabela 2 de Tsuboi et al. (2016): PMMA de 0,125 mm, 1g e voo parabólico

| | N₂ | CO₂ | Ar |
|---|---:|---:|---:|
| LOC medido (1g) **[Medição]** | 17,0 % | 24,3 % | 12,9 % |
| LOC previsto **[Publicado]** | 17,0 %* | 24,0 % | 12,0 % |
| MLOC medido (µg, parabólico) **[Medição]** | 14,7 % | 19,2 % | 11,6 % |
| MLOC previsto **[Publicado]** | 13,0 % | 15,4 % | 9,2 % |
| ΔO₂ = MLOC − LOC, medido / previsto | −2,3 / −4 | −5,1 / −8,6 | −1,3 / −2,8 |
| Vcr medido / previsto | 10 / 8 cm/s | "2~6" / 3 cm/s | 9 / 9 cm/s |

\*Ponto de calibração do modelo, não uma previsão independente.

### 2.2 Tabela 2 de Takahashi e Maruta (2018): PMMA e NOMEX, 1g e voo parabólico

| | PMMA | NOMEX HT90-40 |
|---|---:|---:|
| LOC1g medido **[Medição]** | 17,0 % | 31,5 % |
| MLOC medido (parabólico) **[Medição]** | 14,9 % | 29,5 % |
| MLOC previsto **[Publicado]** | 14,8 % | 29,6 % |
| ΔO₂ = LOC1g − MLOC, medido / previsto | 2,1 / 2,2 | 2,0 / 1,9 |
| E* / A* do blowoff (calibração) | 1,46×10⁵ J/mol / 1,10×10⁹ | 9,36×10⁵ J/mol / 1,37×10²⁴ |

### 2.3 Consistência entre fontes **[Derivado]**

- **LOC1g do PMMA em ar ou N₂:** 17,0 % nas duas fontes.
- **MLOC do PMMA:** 14,7 % (Tabela de 2016 e texto de 2018, citando a Ref. 17 com Vg = 6 cm/s) contra **14,9 %** (Tabela 2 de 2018). A divergência de 0,2 p.p. foi **preservada, não reconciliada**.
- **Vcr do N₂:** a Tabela de 2016 dá 10 cm/s, e o texto de 2018 cita 6 cm/s para o mesmo MLOC. Outra inconsistência entre as fontes. **[Hipótese]** Podem ser campanhas parabólicas diferentes.

### 2.4 ISS/Kibo (apenas resumos) **[Publicado]**

- **Papel-filtro (2024):**
  - 19 ensaios em fluxo oposto; 298 K; 100 kPa;
  - varredura de 10 a 18 cm/s em passos de 2 cm/s a 15,5 % O₂;
  - o modelo original superestimou a região inflamável abaixo de 10 cm/s, e a versão com velocidade efetiva medida em órbita reproduziu o mapa.
- **Papel-filtro (2026):**
  - propagação 2-D de 1,0–1,5 mm/s (regime térmico);
  - modo flamelet mais lento;
  - propagação observada **abaixo do LOC previsto pelo modelo 2-D**.
- **PMMA e NOMEX (2026):**
  - LOC e MLOC do PMMA concordam com o modelo 2-D;
  - o NOMEX forma chamas esféricas 3-D, com extinção num raio crítico.
- **Valores numéricos desses mapas: não disponíveis aqui.**

## 3. Evidência para MLOC = f(U, O₂, material, geometria, g)

| Fator | O que os dados obtidos sustentam | Limite |
|---|---|---|
| U (fluxo oposto) | **[Publicado]** Curva em "U": quenching radiativo em fluxo baixo, blowoff em fluxo alto; mínimo em Vcr de cerca de 3–10 cm/s (PMMA) | Pontos da curva só em figuras (não digitalizadas) |
| O₂ | MLOC é uma concentração; o diluente muda tudo: PMMA de 11,6 % (Ar) a 19,2 % (CO₂) | Só três diluentes, um material |
| Material | PMMA 14,7–14,9 % vs NOMEX 29,5 % (ar) | NOMEX só em tecido; materiais carbonizantes exigem o modelo 3-D de 2026 |
| Geometria | Só folhas planas finas e tecido têm dados | Bastões e fios sem resultados obtidos |
| g | MLOC (µg) < LOC (1g) em todos os 5 pares; ΔO₂ de 1,3–5,1 p.p. | 1g usa propagação descendente com empuxo, e µg usa fluxo oposto forçado: não é a mesma configuração |
| Fluxo concorrente | **sem dados** nas fontes obtidas | — |

**[Inferência]** O conjunto atual é útil como **tabela de evidência**, não como base de regressão. São 5 pares material/gás e 2 materiais, e faltam os pontos dos mapas. Nenhuma relação funcional foi ajustada.

## 4. Comparação com BASS-II, Saffire e SoFIE-GEL

| Característica | BASS-II | Saffire | SoFIE-GEL | FLARE |
|---|---|---|---|---|
| Materiais | PMMA (100 µm no B1), papel e outros | SIBAL, algodão, PMMA, Nomex | PMMA (esfera fundida) | PMMA fino, NOMEX HT90-40, papel-filtro; fios (em andamento) |
| Geometria | lâmina plana fina | placas grandes | esfera de 4 cm | folhas finas; tecido; fios e bastões (sem dados) |
| Fluxo | ventilador (display, sem cm/s) | ~20–25 cm/s concorrente | 0,2–80 cm/s ao redor da esfera | **oposto**, 0–20 cm/s (parabólico), ~10–18 cm/s (ISS, exemplo); concorrente sem dados |
| O₂ | por teste | 21–31 % | 13–34 % | 9–31,5 % nos limites tabelados; SCEM até 45 % |
| Pressão | não escalar | 54–99 kPa | 0,15–1,1 atm | ~1 atm (1g e parabólico); 100 kPa (ISS) |
| Gravidade | µg (ISS) | µg (Cygnus) | µg (ISS) | 1g, voo parabólico, torre de queda, ISS (separados) |
| Propagação | frente em px/s | mm/s | crescimento sobre esfera, não propagação | mm/s (1,0–1,5 em 2-D na ISS, resumo) |
| Limite de inflamabilidade | não é o foco | não | extinção (quenching e blowoff), O₂ na extinção | **LOC(Vg), MLOC, Vcr** (foco principal) |
| Resultados quantitativos aqui | velocidades em px/s | taxas em mm/s | 5 casos de extinção | 5 pares LOC1g/MLOC tabelados; ΔO₂ reproduzidos |
| Aplicabilidade futura | dinâmica de frente | propagação em grande escala | extinção em corpo rombudo | **critério de inflamabilidade** (O₂ mínimo × fluxo) por material |

**Harmonizáveis:** O₂ (%), pressão, gravidade, material (PMMA comum a BASS-II, SoFIE e FLARE), velocidade do fluxo em cm/s (com a direção identificada).

**Não diretamente comparáveis:**

- fluxo **oposto** (FLARE) vs **concorrente** (Saffire);
- folha fina (FLARE, BASS-II) vs esfera espessa (SoFIE);
- limite de O₂ (FLARE) vs taxa de propagação (BASS-II, Saffire);
- LOC1g (descendente, com empuxo) vs MLOC (µg).

**[Inferência] Como o FLARE complementa o BASS-II.** O BASS-II mede *como* uma frente avança sobre uma lâmina fina. O FLARE diz *se* ela avança, isto é, o O₂ mínimo em função do fluxo oposto, para o mesmo tipo de combustível termicamente fino. Uma camada futura pode usar o FLARE como fronteira de inflamabilidade documentada (por material e diluente), ao lado das velocidades BASS-II, sem converter uma grandeza na outra.

## 5. Limitações

- Os textos completos de 2024 e 2026 não foram obtidos. Não há valores dos mapas da ISS e não há tabelas suplementares (CSV/XLSX), cuja existência não foi confirmada.
- Os mapas de 2016 e 2018 estão só em figuras. A digitalização foi avaliada como viável (os rótulos são texto vetorial), mas não foi feita: falta um extrator de posições no ambiente, e nenhuma instalação foi feita.
- LOC1g e MLOC vêm de configurações diferentes. ΔO₂ é a diferença publicada, não um efeito puro da gravidade.
- Divergências entre fontes no MLOC (14,7 vs 14,9 %) e no Vcr (10 vs 6 cm/s) do PMMA.
- O modelo publicado não foi reimplementado (FLARE_METHOD §4).
- Não há dados de fluxo concorrente, bastões ou fios.

## 6. Próxima etapa recomendada

1. **Obter os textos completos de 2024 e 2026**, que estão em acesso aberto CC BY-NC-ND. O usuário pode baixá-los manualmente (a automação recebe 403) e colocá-los em `data/cache/flare/`. Depois: transcrever as tabelas de condições e resultados da ISS e verificar se há suplementos.
2. **Digitalizar os mapas de 2016 e 2018** (e da ISS, quando houver) com um extrator de posições de texto ou por raster com calibração de eixos registrada, sempre com o rótulo `digitized_from_figure`.
3. **Só então** implementar o critério R_rad + 1/Da = 1 com os parâmetros publicados, validando contra a Tabela 2 de 2018 (MLOC de 14,8/29,6 %) antes de qualquer uso.
