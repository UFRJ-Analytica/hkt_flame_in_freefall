# SAME: o método dos momentos e a instrumentação

**Fonte principal:** SAME Final Science Report (NIST/NASA, 15 mar 2010), §3.A "The Moment Method" (pp. 4–9), §3.B "Instrumentation" (pp. 9–12), §3.C "Instrument Calibration" (pp. 12–14). Os números de equação abaixo são os do relatório.

**Implementação:** [`scripts/same/moment_method.py`](../../scripts/same/moment_method.py). Testes em [`scripts/same/test_same.py`](../../scripts/same/test_same.py) (classes `MomentMethod`, `InvalidInputs`, `Uncertainty`, `Table1`).

Rótulos: **[NASA]**, **[Derivado]**, **[Inferência]**, **[Hipótese]** (ver [SAME_DATA_REVIEW.md](SAME_DATA_REVIEW.md)).

## 1. Fundamentação

### Distribuição numérica

**[NASA]** f_N(D) = dN/dD é o número de partículas por unidade de volume com diâmetro entre D e D + dD (Eq. 1). Dimensão: [L⁻⁴].

### Momentos

**[NASA]** M_i = ∫₀^∞ Dⁱ f_N(D) dD (Eq. 2f). Dimensão: [Lⁱ⁻³].

| Momento | O que representa |
|---|---|
| M0 | Nt, a concentração numérica |
| M1 | A "concentração de diâmetro" |
| M3 | Proporcional, mas não igual, ao volume (ou à massa, com densidade constante) das partículas: o volume é π/6·M3 |

### Diâmetros característicos

**[NASA]**

| Diâmetro | Definição | Nomes |
|---|---|---|
| D0.5 | M1/M0 | Diâmetro médio aritmético (count mean diameter, CMD, d̄) |
| D1.5 | (M3/M0)^(1/3) | Diâmetro de massa média (diameter of average mass, d̄_m) |

### Hipótese lognormal

**[NASA]** f_N(D) = Nt / (√(2π) · D · ln σg) · exp[−(ln D − ln Dg)² / (2 ln² σg)] (Eq. 3). Aqui Dg é o diâmetro médio geométrico (= mediana numérica) e σg o desvio-padrão geométrico (Eqs. 4–5).

A distribuição fica definida por **três** parâmetros, de modo que **três momentos independentes bastam**. A NASA escolheu M0, M1 e M3.

### Hatch-Choate

**[NASA]** D_p = Dg · exp(p · ln² σg) (Eq. 6). Com p = 0,5 obtém-se o D0.5, e com p = 1,5 o D1.5.

### Inversão

**[NASA]**

- Dg = √(D0.5³ / D1.5) (Eq. 7).
- σg = exp(√ln(D1.5/D0.5)) (Eq. 8).
- Nt = M0.

**[Derivado]** Em termos dos momentos (Eq. 9), Dg = M0^(−4/3) · M1^(3/2) · M3^(−1/6). Também σg = exp{√[ln(M0^(2/3) · M3^(1/3) / M1)]} (Eq. 10). O texto extraído do PDF embaralha os expoentes; os valores acima foram rederivados das Eqs. 7–8 e verificados numericamente (`test_eq9_closed_form_equals_eq7`).

### Verificação de implementação

O exemplo da Fig. 3 (Dg = 1,0 µm, σg = 1,6) dá D0.5 = 1,117 µm e D1.5 = 1,393 µm, como no relatório (p. 7). O teste `test_report_figure_3_example` confirma esses valores.

## 2. Hipótese estatística, unidades e validade

### Hipótese

A distribuição é **unimodal e lognormal**. A conversão de três momentos em (Nt, Dg, σg) só é exata nessa família.

### Unidades

Todos os diâmetros devem estar na mesma unidade (nm, neste projeto). M_i carrega [número/volume] · [diâmetro]ⁱ. Os diâmetros D_p não dependem da unidade de concentração, desde que M0, M1 e M3 se refiram ao **mesmo volume de gás** (mesma diluição).

### Condições de validade

- **Positividade e finitude.** M0, M1, M3 > 0 e finitos.
- **Desigualdade de Jensen.** D1.5 ≥ D0.5 vale para qualquer distribuição, porque (M3/M0)^(1/3) ≥ M1/M0. A implementação **recusa** entradas que a violem: elas indicam erro de calibração, de diluição ou de sincronia, nunca um aerossol real.
- **Caso monodisperso.** D1.5 = D0.5 corresponde a σg = 1.

### Distribuições bimodais

Com uma moda fina e outra grossa (gotas de líquido mais aglomerados, por exemplo), os três momentos continuam bem definidos. A lognormal ajustada, porém, é uma lognormal "equivalente": reproduz M0, M1 e M3, mas distribui errado a massa acima e abaixo de qualquer corte.

**[NASA]** O apêndice C (AIAA-2009-956, p. C-5) relata que a iteração com a teoria de Mie **não convergiu** em alguns casos (silicone) e atribui isso a uma possível distribuição bimodal.

**[Inferência]** A comparação do §5 de [SAME_ANALYSIS.md](SAME_ANALYSIS.md) entre a razão dos DustTraks e a fração de massa lognormal acima de 1 µm aponta na mesma direção para lamp wick e silicone.

### Diâmetros diferentes não se comparam

| Diâmetro | Peso | Valor para Silicone (sem envelhecimento) |
|---|---|---|
| Dg (mediana numérica) | — | 189 nm |
| D0.5 (média aritmética) | número | 257 nm |
| D1.5 (diâmetro de massa média) | volume, no sentido de massa média por partícula | 472 nm |
| Mediana de massa (MMD) = Dg · exp(3 ln² σg) | massa | ≈ 1 175 nm **[Derivado]** |

Um CMD de 189 nm convive, portanto, com mais da metade da massa acima de 1 µm.

## 3. Incerteza

**[NASA]** Para momentos independentes (sem covariância), a NASA dá as Eqs. 12–13:

- u_r²(Dg) = (16/9) u_r²(M0) + 2,25 u_r²(M1) + (1/36) u_r²(M3)
- u_r²(σg) = [u_r²(M0) + 2,25 u_r²(M1) + 0,25 u_r²(M3)] / (9 ln² σg)

**[NASA]** A incerteza de M1 é a que mais pesa, e a de M3 a que menos pesa.

**[Derivado]**

- A Eq. 13 foi rederivada aqui porque o PDF extraído é ilegível nesse trecho.
- `relative_uncertainty` implementa as duas equações. `relative_uncertainty_numeric` confere o resultado por diferenças finitas, com concordância de 10⁻⁵.
- A incerteza relativa de σg **diverge quando σg → 1**: em aerossóis estreitos, σg fica mal determinado.

**Limite.** A NASA não publica u_r(M0), u_r(M1) nem u_r(M3) por teste. Por isso nenhuma incerteza de Dg ou σg foi atribuída aos números da Tabela 1. A função está pronta para quando essas incertezas existirem.

## 4. Instrumentos

| Instrumento | Grandeza observada | Momento associado | Unidade no arquivo | Calibração disponível | Limitações |
|---|---|---|---|---|---|
| **P-Trak** (TSI, contador de núcleos de condensação com isopropanol; condensador modificado para µg) | Contagem de partículas que crescem por condensação | **M0** | pt/cc (`PTrakMeasurement(PtPerCC)`) | **[NASA]** Curvas com gotas monodispersas de DOP (100, 600 e 1200 nm) contra o TSI 3022 (Fig. 7). Correlações separadas por tamanho, escolhidas a partir da estimativa inicial do tamanho. **Coeficientes não publicados.** | Faixa de 0 a 10⁵ /cm³ e de 20 nm a 1 µm (p. 9; o apêndice B diz "4 a 5 µm"). A fumaça tinha 0,5–5 × 10⁶ /cm³, o que exige diluição. **O diluidor dinâmico opera em malha fechada ("Dilution control enabled")**: a leitura não é proporcional à concentração sem a razão de diluição, que não está no PSI. −999 = erro. Leituras acima de 10⁵ ocorrem |
| **Câmara de ionização** (detector residencial modificado, Am-241) | Queda da corrente iônica quando íons se ligam às partículas (sinal em V) | **≈ M1** (proporcional, não igual) | V (`IonDetectorA/BMeasurement`) | **[NASA]** Pouca dependência do tamanho (Fig. 8, contra o TSI Electrical Aerosol Detector). Uma correlação única para todos os tamanhos. **Coeficientes não publicados.** | Exige ~10⁵ /cm³; sem diluição. O sinal depende do baseline (deriva entre testes). Há dois canais, A e B; a NASA plota o B |
| **DustTrak** ×2 (TSI, fotômetro de espalhamento a 90°, laser vermelho) | Luz espalhada → "mg/m³" na escala de fábrica | **≈ M3**, com dependência do tamanho | mg/m³ (`DustTrakA/BMeasurement`); A tem impactador de 1 µm, B de 10 µm | **[NASA]** Resposta não monotônica prevista por Mie (Fig. 9, DOP). No resultado final, o DustTrak foi **calibrado diretamente contra um TEOM para cada fonte de fumaça** e convertido em D1.5 com **densidades estimadas**. Versões anteriores usavam iteração Mie com índice de refração. **Fatores TEOM e densidades não publicados.** | 0,001–100 mg/m³; diluição fixa em alguns testes (solenoide `CommDiag*Dilution`). Proporcional a M3 só entre 0,2 e 2 µm. A calibração por fonte só vale se a distribuição não mudar muito. O corte do impactador é **aerodinâmico** |
| **Detector ISS** (Allied Signal/Honeywell, laser de diodo IR, espalhamento direto a 30°, mais transmissão) | Espalhamento referenciado ao feixe | Nenhum momento único (pesa partículas > ~0,3–1 µm) | V (`ISSDetectorScatter/Obscuration`) | Alarme de projeto a 1 %/pé de obscurecimento (UL), ajustado com esferas de 0,5 µm | Pouca sensibilidade abaixo do comprimento de onda. **Satura** em ≈ −6,25 V no arquivo. O sinal de fumaça é uma deflexão negativa no arquivo bruto; a NASA inverte para plotar |
| **Detector STS** (Brunswick/Celesco, ionização com bomba e separador inercial > 1 µm) | Ionização | ~M1 de partículas < 1 µm | V (`STSDetectorMeasurement`), deflexão negativa | Alarme de projeto a 2 mg/m³ (partículas de 1 µm) ou subida de 0,022 mg/m³/s | **Desligado** (`STSDetectorPower = 0`) nos testes de envelhecimento longo |
| Precipitador térmico (grades de TEM) | Morfologia e tamanho por microscopia | — | — | — | **[NASA]** Grades contaminadas por partículas estranhas; só lamp wick (teste 32) e Teflon (teste 26) com partículas distintas |
| Fio aquecedor | Resistência Rt (controle) | — | Ω (`SampleResistance(Ohms)`) | **[NASA]** Relatório de caracterização do fio (PSI, não baixado) | Rt/R0 é medido; a conversão para temperatura não foi feita aqui |

**[NASA]** Os sinais dos detectores **não são equivalentes**, e o relatório insiste nisso (p. 3): os detectores da ISS e do STS têm sensibilidades a tamanho que não se sobrepõem.

## 5. O que falta para reconstruir M0, M1 e M3 dos dados de voo

1. **M0:** a razão de diluição do caminho do P-Trak em cada instante. O controle é em malha fechada; o setpoint (sccm) aparece só nos logs de alguns dias, e a relação sccm → razão não está documentada. Faltam também as curvas de calibração do P-Trak por tamanho (Fig. 7, sem coeficientes).
2. **M1:** a correlação "volts → EAD" da câmara de ionização (Fig. 8, sem coeficientes) e o baseline adotado.
3. **M3:** o fator TEOM/DustTrak por fonte de fumaça, a diluição fixa dos DustTraks e as densidades estimadas dos materiais. Nenhum deles foi publicado.
4. **Janelas:** o intervalo exato de média de cada teste. As abas "for average" existem só para alguns testes e, em alguns casos, cobrem o teste inteiro.

**Conclusão [Inferência].**

- **Não é cientificamente sustentável calcular M0, M1, M3, Dg ou σg por teste a partir dos arquivos PSI-102.** Fazê-lo exigiria inventar coeficientes. Por isso `same-tests.json` declara `momentsAvailable: false` e nenhuma leitura bruta é convertida em momento.
- **O que é sustentável:**
  - reproduzir a aritmética da Tabela 1 (Eqs. 7–8);
  - derivar as consequências lognormais dos parâmetros publicados;
  - fazer verificações que não dependem de calibração absoluta (razão entre os dois DustTraks, conservação do sinal de massa no envelhecimento, ordenação das respostas dos detectores).

## 6. Evolução dos números publicados

**[NASA]** Os mesmos dados foram reduzidos de formas diferentes ao longo do tempo:

| Publicação | Grandeza | Kapton | Lamp wick | Silicone | Teflon |
|---|---|---|---|---|---|
| AIAA-2008-0806 (Apêndice E, Tab. 1) | D0.5 (nm), P-Trak + ionização | 114 | 248 | 263 | 223 |
| 08ICES-2089 (Apêndice D, Tab. 1) | D0.5 médio (nm) / razão DustTrak B/A | 128 / 1,26 | 172 / 1,79 | 227 / 1,92 | 158 / 1,22 |
| AIAA-2009-956 (Apêndice C, Tab. 1) | Dg / D0.5 / D1.5 (µm), iteração Mie | 0,080 / 0,105 / 0,172 | 0,186 / 0,227 / 0,420 | 0,189 / N/A / N/A ("did not converge") | 0,159 / 0,205 / 0,219 |
| Relatório final, Tab. 1 (p. 17) | Dg / D0.5 / D1.5 (nm), DustTrak calibrado por TEOM | 80 / 105 / 179 | 186 / 227 / 341 | 189 / 257 / 472 | 170 / 205 / 297 |

**[Derivado]** Na tabela de 2009, só Kapton satisfaz a Eq. 7 (Dg recalculado 0,082 µm). Lamp wick daria 0,167 µm em vez de 0,186, e Teflon 0,198 µm em vez de 0,159. Na tabela final, todas as oito linhas satisfazem as Eqs. 7–8 dentro do arredondamento (|ΔDg| ≤ 0,8 nm; |Δσg| ≤ 0,005).

**[Inferência]** O D0.5 de um mesmo material variou até 30 % entre versões (lamp wick: 248 → 172 → 227 nm). Isso mede a sensibilidade do resultado às escolhas de calibração e de janela, e é a melhor estimativa disponível da incerteza sistemática real.
