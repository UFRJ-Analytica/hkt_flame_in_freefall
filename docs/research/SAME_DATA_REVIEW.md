# SAME (PSI-102): revisão dos dados, P0/P1

Este documento trata do Smoke Aerosol Measurement Experiment (SAME), conduzido no Microgravity Science Glovebox da ISS durante a Expedição 15, em setembro e início de outubro de 2007.

**O SAME não é um experimento de propagação de chama.** As amostras foram aquecidas abaixo do ponto de ignição para produzir fumaça de pirólise. Os instrumentos medem aerossol e resposta de detectores.

Documentos associados:

- [SAME_MOMENT_METHOD.md](SAME_MOMENT_METHOD.md): o método dos momentos.
- [SAME_ANALYSIS.md](SAME_ANALYSIS.md): resultados, limitações e proposta para o HabitatFire.

Convenção de rótulos usada nos três documentos:

| Rótulo | Significado |
|---|---|
| **[NASA]** | Fato publicado pela NASA ou NIST, com página ou arquivo citado |
| **[Medição]** | Estatística dos sinais de voo, em unidades do instrumento |
| **[Derivado]** | Cálculo feito aqui a partir de números publicados |
| **[Inferência]** | Conclusão deste projeto apoiada nos dados |
| **[Hipótese]** | Não verificada |

## 1. Fontes e proveniência

| Fonte | Identificação | Uso |
|---|---|---|
| NASA PSI-102, SAME | <https://psi.nasa.gov/physci/repo/data/investigations/PSI-102>; DOI 10.60555/gd4k-8h62; `metadata.json` versão 4 (sha256 `fe221f13…`) | Catálogo de arquivos e downloads |
| SAME Final Science Report | Urban, Ruff, Sheredy, Cleary, Yang, Mulholland e Yuan, NIST/NASA, 15 mar 2010. Cópia PSI: `PSI-102_Reports_SAME_Final Science Report.pdf`, 3 712 845 bytes. Também em <https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=904707> | Método, calibração, Tabela 1, Apêndice A (log dos voos) e apêndices B–E (artigos de 2008 e 2009) |
| Baseline Concept Description Doc, Operations Manual 007, Software Description Doc | Pasta PSI "Science Documents" / "Reference Data" | Matriz planejada, protocolo de operação, diluidor dinâmico |
| Planilhas "Analyzed Data" | 28 de 52 baixadas (§3) | Séries de housekeeping de voo a 1 Hz |
| Logs do software de voo | 6 arquivos `.xls`/`.xlsx` (dias GMT 252, 254, 255, 256, 267) | Comandos e estados por teste |
| NASA PSI-101, SAME-R | <https://psi.nasa.gov/physci/repo/data/investigations/PSI-101> | Somente para separar e listar diferenças (§5) |

**Aquisição.**

- O script é [`scripts/same/fetch_same.py`](../../scripts/same/fetch_same.py). Ele baixa somente arquivos públicos listados no `metadata.json` do PSI-102.
- O teto combinado é de 120 MB; foram usados **96 388 548 bytes** em 39 arquivos.
- Vídeos, coleções de imagens e ZIPs grandes são recusados.
- Os downloads são retomáveis (HTTP Range sobre `.part`) e atômicos (renomeação após conferir o tamanho), com SHA-256 de cada arquivo.
- A URL S3 assinada nunca é gravada.
- O manifesto é [`data/same/docs-manifest.json`](../../data/same/docs-manifest.json). Os originais ficam em `data/cache/same/`, ignorado pelo Git (`.gitignore`).

**[Inferência]** O PSI-102 aponta como "experimentHardware" o hardware do Comparative Soot Diagnostics (CSD). O texto "approach" do PSI-102 descreve o procedimento do CSD: ignitor, combustão de 2 minutos e transcrição de dados a partir do vídeo. Não descreve o SAME. A descrição operacional válida do SAME está no relatório final e no Operations Manual.

## 2. Auditoria do que já existia no repositório

| Local | Conteúdo SAME antes desta fase |
|---|---|
| `data/raw/psi/PSI-102/` | `metadata.json`, `manifest.json` e `PSI-102_Experimental table_SAME.csv` (331 bytes, 8 linhas) |
| `data/raw/psi/PSI-101/` | `metadata.json`, `manifest.json` e `PSI-101_Experimental table_SAME-R.csv` (109 registros) |
| `public/data/nasa-experiments.json` | Registro PSI-102 com 8 "tests" vindos do CSV. Campos normalizados: `material`, `flowCmS`; "Weight loss rate" e "Aging Duration" ficaram só em `raw` |
| `public/data/nasa-provenance.json` | Proveniência do CSV e do metadata |
| `public/data/research-corpus.json` | Um documento (`nasa-same`, folheto NASA sobre SAME/SAME-R), sem dados por teste |
| `scripts/sync_nasa.py` | Catálogo `'PSI-102': ('SAME', 'detection')`, `'PSI-101': ('SAME-R', 'detection')`; importa somente o CSV experimental |
| `backend/research.py` | Nenhuma referência específica ao SAME |
| `docs/research/` | Uma linha em `DATA_CONNECTION.md` e uma em `PREDICTIVE_MODELING_RESEARCH.md` |

**Constatação importante sobre a tabela experimental do PSI-102.**

- **[NASA]** O CSV "Experimental table" tem 8 linhas: Teflon 5/5/5/10 cm/s, 2/1/2/2 mg/min, 1/1/20/1 min. As linhas 5 a 8 dizem apenas "Kapton: same conditions as 1-4" e equivalentes para os outros materiais.
- **[Inferência]** Essa tabela reproduz a matriz **planejada** da EIRD Rev. 1.01, que está no Baseline Concept Description Doc §6.4, Tabela 1 (20 testes: 2 taxas de perda de massa × 2 vazões × 2 envelhecimentos).
- **[Inferência]** Ela **não** registra os testes voados. O registro real é o Apêndice A do relatório final: 47 pontos de teste, transcritos em [`data/same/appendix-a-flight-log.csv`](../../data/same/appendix-a-flight-log.csv).
- Os 8 "tests" do catálogo público do HabitatFire devem, portanto, ser lidos como condições planejadas.

## 3. Inventário PSI-102

O inventário é gerado por [`scripts/same/inventory_same.py`](../../scripts/same/inventory_same.py) e gravado em [`data/same/derived/same-inventory.json`](../../data/same/derived/same-inventory.json).

| Classe | Arquivos listados | Baixados | Observação |
|---|---:|---:|---|
| Séries de housekeeping de voo ("Analyzed Data" .xls/.xlsx) | 52 | 28 | Exportações do `.hkp` a 1 Hz; várias são cópias "zgy average", "with plots" ou multi-teste |
| Logs do software de voo | 7 | 6 | Comandos, estados, diluição, avisos |
| Documentos científicos e de referência | 6 | 4 | Relatório final, manual de operações, conceito, software |
| Documentos de engenharia | 23 | 0 | Desenhos, esquemas, VPRED, relatório do fio |
| Apresentações | 6 | 0 | Incluem "SAME-2" (provável SAME-R): não baixadas para não misturar |
| Vídeos de engenharia | 4 | 0 | "Resistive Heater Coil TN001/TN002" (MP4 7 MB, ZIP 140–169 MB) |
| Coleção de imagens | 1 | 0 | "SAME OPS images.zip" (25 MB) |
| Entradas vazias (0 bytes) | 4 | 0 | XMLs `16904___9` etc. |
| Metadados (ISA-Tab) | 1 | 1 | Sem conteúdo científico |
| **Total** | **104 (657,6 MB)** | **39 (96,4 MB)** | |

**Sem vídeos de voo.** **[NASA]** O PSI-102 não lista nenhum vídeo dos testes de voo nem uma pasta "Raw Data". A lista "removed" do metadata mostra que versões antigas tinham os mesmos documentos sob "Raw Data".

### 3.1 Estado dos 47 testes do Apêndice A

Arquivo: [`same-tests.json`](../../data/same/derived/same-tests.json).

| Situação | Testes |
|---|---|
| Processados com janelas por estado de solenoide (planilha HKP completa, 98 colunas) | 2, 17, 23, 24, 25, 26, 27, 28, 29, 32, 33, 34, 35, 37, 46 (15 testes) |
| Só a janela de média da NASA ("for average"; planilha sem estados) | 11, 13, 14, 15 |
| Baixados, mas sem como segmentar sem adivinhar | 4, 5, 6, 7, 8, 9, 10, 12, 16, 30, 31 |
| Não baixados (orçamento) | 1, 3, 18–22, 36, 38–45, 47 |

Cobertura dos quatro materiais sólidos da Tabela 1 com janelas por estado:

| Material | Testes processados |
|---|---|
| Kapton | 29, 33 |
| Lamp wick | 17, 32, 34, 46 |
| Silicone | 23, 24, 27, 35 |
| Teflon | 25, 26, 28 |

**[NASA]** Cinco materiais, seis amostras de cada (30 amostras iniciais). O DBP foi reaquecido várias vezes: 22 dos 47 pontos.

## 4. Dicionário de dados

### 4.1 Housekeeping de voo

Fonte: planilhas "Analyzed Data", aba HKP com 98 colunas.

| Coluna original (preservada) | Chave derivada | Unidade | Tipo | Notas |
|---|---|---|---|---|
| `TimeString`, `Time` | — | `AAAA/DDD/hh:mm:ss`, s (época Unix) | direta | 1 Hz; A/D de 8 bits (relatório §5) |
| `TestNumber` | `testNumberColumn` | — | direta | Número da **matriz de comando**, não o número do Apêndice A (o dia 255 usa 2 para dois testes) |
| `HeatingInProgress`, `SampleResistance(Ohms)` | `conditions.RtOverR0` | razão | medida | R0 = fio frio (10 s antes do aquecimento); Rt = mediana da metade mais quente do aquecimento |
| `LFEFlowRate[AT08](SCCM)` | `lfeFlowDuringHeating_sccm` | sccm | medida | Vazão do medidor de fluxo laminar durante o aquecimento; a conversão para cm/s exige a área do duto |
| `PTrakMeasurement(PtPerCC)` | `ptrak` | pt/cc | direta | **Após o caminho de diluição controlada**; −999 = código de erro; faixa nominal 0–10⁵ |
| `DustTrakA/BMeasurement(MgPerM3)` | `dusttrakA/B` | mg/m³ | direta | Escala de fábrica (calibração para poeira de teste), não calibrada para fumaça; A = impactador 1 µm, B = 10 µm |
| `IonDetectorA/BMeasurement(Volts)` | `ionA/B` | V | direta | Câmara de ionização (≈ M1 após calibração) |
| `ISSDetectorScatter/ObscurationMeasurement(Volts)` | `issScatter/issObscuration` | V | direta | Espalhamento satura em ≈ −6,25 V |
| `STSDetectorMeasurement(Volts)`, `STSDetectorPower`, `STSDetectorAlarm` | `sts` | V | direta | Desligado (`Power = 0`) nos testes de envelhecimento longo |
| `PTrakSolenoid[VR06]`, `CommDiagA/BDilutionSolenoid`, `DynamicDilutorSolenoid` | `solenoidStates` | 0/1 | direta | Definem as janelas e o estado de diluição |

### 4.2 Registro harmonizado por teste

Arquivo: `same-tests.json`. Campos de cada teste:

- **Identificação:** `investigationId`, `test` (número do Apêndice A), `sampleId` (carrossel e posição), `material`, `heating` (Initial/Reheat), `gmtDay`.
- **`appendixA`:** texto bruto do Apêndice A.
- **`housekeeping`:**
  - arquivo, aba e sha256;
  - baseline (30 s antes da primeira janela);
  - `conditions`;
  - `windows[]`, cada uma com papel (`primary`, `secondary`, `no-smoke`), início e fim, platô, estatísticas por canal (mediana, máximo, mínimo, n, delta do baseline), flags e estados de diluição;
  - `secondaryAgingClass`, `dusttrakBSecondaryOverPrimary`.
- **`nasaAveragingWindows`:** intervalos de média dos analistas da NASA, quando existem.
- **`status`.**

**Não existem campos M0, M1 ou M3.** O motivo está no §4 de [SAME_MOMENT_METHOD.md](SAME_MOMENT_METHOD.md). Valores ausentes são `null` e nunca zero. Valores ambíguos permanecem como texto bruto.

### 4.3 Grandezas separadas por tipo

| Tipo | O que existe |
|---|---|
| Medidas diretas | Sinais de housekeeping acima (unidades do instrumento) |
| Medidas calibradas | **Nenhuma** nos arquivos PSI-102 (as calibrações NIST não foram publicadas no PSI) |
| Grandezas derivadas (NASA) | D0.5, D1.5, Dg e σg por material (Tabela 1, p. 17), mais versões preliminares nos apêndices C, D e E |
| Publicadas só como agregado | A Tabela 1 é por material ("baseline" e "720 s aged"); não há valor por teste |
| Ausentes | Razões de diluição, curvas de calibração, densidades dos materiais, taxa de perda de massa por teste, conversão Rt/R0 → temperatura |

## 5. Separação SAME (PSI-102) / SAME-R (PSI-101)

| Aspecto | SAME, PSI-102 | SAME-R, PSI-101 |
|---|---|---|
| Voo | Expedição 15, set–out 2007 (relatório final) | 16 jul a 9 set 2010, 66 pontos de teste |
| Arquivos PSI | 104, 658 MB | 342, 6,3 GB (223 "Raw Data", 86 "Analyzed Data") |
| Materiais | Teflon, Kapton, silicone, lamp wick, DBP | **Pyrell®** (espuma retardante, Foamex) substitui o DBP |
| Condições | Rt/R0 ≈ 1,18–1,45; fluxo durante o aquecimento | **Temperaturas mais altas** e **aquecimento sem fluxo** |
| Instrumentos | Dois "Commercial Diagnostic Enclosures" (DustTrak + ionização) | Um deles foi substituído pelo **M-pass** (instrumento GRC) |
| Pós-voo | — | Três campanhas em solo para melhorar a redução de dados e **validar a hipótese lognormal** |
| Tabela experimental PSI | 8 linhas (matriz planejada) | 109 registros (teste, Rt/R0, duração, envelhecimento primário, mistura e líquido) |

Fonte: campo "approach" do `metadata.json` do PSI-101 e Final Science Report. **[Inferência]** Os números de teste se sobrepõem (o SAME-R reutiliza a numeração "SAME Test #"), por isso os dois conjuntos nunca devem ser unidos por número de teste. Nesta fase **nenhum arquivo ou valor do PSI-101 foi usado** (`same-inventory.json` → `reflight.usedHere = false`).

## 6. Papel dos vídeos

- **[NASA]** Não há vídeos de voo do SAME no PSI-102. A frase sobre "digital data transcribed from the video record" vem do texto herdado do CSD (§1).
- **[NASA]** O SAME gravava vídeo do aquecimento (log: "Video recording started", "Lights! Cameras!"). Os sinais, porém, foram digitalizados diretamente pelo DACU a 1 Hz e estão nas planilhas HKP.
- **[Inferência]** Não há necessidade de OCR nem de visão computacional: as leituras dos instrumentos, o relógio e o número do teste já estão em formato numérico.
- Os dois vídeos disponíveis mostram ensaios de engenharia do fio aquecedor, sem relação com as medidas de aerossol. Por isso não foram baixados, e nenhuma segunda implementação de visão computacional foi feita.

## 7. Reprodução

```powershell
python scripts/same/fetch_same.py docs                         # documentos prioritários
python scripts/same/fetch_same.py files "PSI-102_Analyzed Data_GMT271kapton29.xls" ...
python scripts/same/inventory_same.py                          # same-inventory.json (+ --appendix para retranscrever)
python scripts/same/normalize_same.py                          # same-tests.json (requer o cache)
python scripts/same/analyze_same.py                            # same-analysis.json + figuras
python -m unittest discover -s scripts/same -p "test_*.py"
```

- O ambiente não tem `xlrd`, e esta fase não instala dependências.
- [`scripts/same/xls_reader.py`](../../scripts/same/xls_reader.py) lê o formato BIFF8/OLE2 só com a biblioteca padrão. Cobre números, RK/MULRK, fórmulas com resultado em cache, SST com CONTINUE e rótulos; ignora gráficos embutidos.
- As planilhas `.xlsx` são lidas com `openpyxl`, já instalado.
