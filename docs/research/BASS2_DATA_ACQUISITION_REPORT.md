# BASS-II (PSI-25) — relatório de aquisição de dados e inventário

Etapa P0/P1 do trabalho de medição de propagação no BASS-II, executada em 14/11/2026 na branch `feat/bass2-propagation`. Entrega uma base documentada e rastreável; **não** contém detector, rastreador nem modelo.

Documentos complementares:

- `BASS2_DOCUMENTATION_REVIEW.md` — o que os documentos da NASA dizem (variáveis, calibração, matrizes, métodos, resultados publicados).
- `BASS2_PILOT_VIDEO_REVIEW.md` — inspeção dos vídeos piloto e metodologia recomendada.

Marcação: **[NASA]** documento da NASA; **[PSI]** tabela ou listagem do PSI; **[Vídeo]** observado nos quadros; **[Inferência]**; **[Hipótese]**.

## 1. O que foi produzido

| Caminho | Conteúdo | Versionado |
|---|---|---|
| `scripts/bass2/fetch_bass2.py` | Baixa só arquivos nomeados do PSI-25, com teto de bytes por tipo, `.part`, renomeação atômica e manifesto | Sim |
| `scripts/bass2/documents_bass2.py` | Extrai calibração, matrizes, Apêndice A e tabelas publicadas dos documentos em cache | Sim |
| `scripts/bass2/inventory_bass2.py` | Reconstrói o inventário dos 129 registros a partir de dados locais (biblioteca padrão) | Sim |
| `scripts/bass2/inspect_video_bass2.py` | Relatório do contêiner MP4 (biblioteca padrão) e pranchas de contato (OpenCV, opcional) | Sim |
| `scripts/bass2/test_inventory_bass2.py`, `test_documents_bass2.py` | 26 testes | Sim |
| `data/bass2/docs-manifest.json`, `videos-manifest.json` | Nome, endereço estável, tamanho, data e SHA-256 de cada arquivo baixado | Sim |
| `data/bass2/documents-derived.json` | Fatos extraídos dos documentos, com célula ou página | Sim |
| `data/bass2/inventory.json` | Os 129 registros com arquivos, confiança, condições e documentos | Sim |
| `data/cache/bass2/docs/`, `videos/`, `previews/` | Documentos, vídeos e pranchas | **Não** (`.gitignore`) |
| `docs/research/BASS2_*.md` | Três relatórios | Sim |

Arquivos existentes alterados: apenas `.gitignore` (uma linha, `data/cache/bass2/`). Nada em `src/`, `backend/`, `scripts/sync_nasa.py` ou nos JSONs do catálogo foi tocado.

Dependências: nenhuma instalada. `documents_bass2.py` chama o `pdftotext` já presente no sistema; sem ele, as partes derivadas do PDF ficam marcadas como indisponíveis. As pranchas usam o OpenCV e o NumPy já instalados.

### Como refazer

```powershell
python scripts/bass2/fetch_bass2.py docs            # ~52 MB do PSI (ou --verify, sem rede)
python scripts/bass2/documents_bass2.py             # gera documents-derived.json
python scripts/bass2/inventory_bass2.py             # gera inventory.json (funciona offline)
python scripts/bass2/fetch_bass2.py videos "<nome exato do MP4>"
python scripts/bass2/inspect_video_bass2.py
python -m unittest discover -s scripts/bass2 -p "test_*.py"
```

O inventário roda sem os documentos em cache: nesse caso os campos vindos do relatório (as-run, direção, observações, calibração) ficam vazios e a associação de mídia é a mesma.

## 2. Arquivos NASA recuperados

Sete documentos, 52 390 435 bytes (limite: 60 MB), todos do endpoint público do PSI, sem falhas:

| Documento | Bytes | SHA-256 (início) |
|---|---:|---|
| `PSI-25_Reference Data_Fan calibration data.xlsx` | 23 973 | `bc0dca3e` |
| `PSI-25_Science Documents_BASS-II_ReadMe.docx` | 21 538 | `69f32647` |
| `PSI-25_Science Documents_BASS-II_Test.Matrices.xlsx` | 28 956 | `1a3b283d` |
| `PSI-25_Science Documents_BASS-II_SRD.pdf` | 1 108 340 | `d00a763d` |
| `PSI-25_Engineering Documents_BASS-II_Ops.docx` | 1 111 856 | `76fb21a7` |
| `PSI-25_Engineering Documents_BASS-II_Engineering Requirements.pptx` | 1 123 356 | `08ab1b85` |
| `PSI-25_Reports_BASS-II Summary Report.pdf` | 48 972 416 | `5ffa911f` |

Três vídeos, 49 792 927 bytes (limite: 60 MB):

| Vídeo | Bytes | SHA-256 |
|---|---:|---|
| `…BASS_GMT178_SAMPLE_135_TEST_T11.mp4` | 12 444 685 | `8b058470f86f511714004831ced53a87739cf6b43cd7f65947a745debc524177` |
| `…BASS_GMT178_SAMPLE_135_TEST_T11_2ND_VIEW.mp4` | 31 544 262 | `53307802f61ee0c67bde1135e00d8a26d12e02ecd132118c6ba4520682fabfd7` |
| `…BASS_GMT50_SAMPLE_147_TEST_B1.mp4` | 5 803 980 | `e82f64268c51efeea73a3f11e690a2f6e504845e980fb60356a6ef1584d273cd` |

O tamanho HTTP de cada arquivo foi conferido com o do catálogo antes de gravar. Hashes completos, datas de recuperação e identificador de recurso do PSI estão nos manifestos. As URLs assinadas temporárias não foram gravadas.

**Indisponíveis:** nenhum. O NTRS não precisou ser usado.

**Não baixados, de propósito:** os outros 293 MP4, os 173 ZIPs de vídeos originais e de fotos, os 91 ZIPs de imagens da ISS (135 GB) e as 125 folhas de prova.

## 3. Significado das variáveis e calibração

Resumo; detalhes e citações em `BASS2_DOCUMENTATION_REVIEW.md` §3–4.

- **`Fan display`** = tensão do ventilador × 10 mostrada no vídeo (máx. 122); a célula às vezes traz o ajuste do potenciômetro (0–10). **[NASA]**
- **`Air display`** = velocidade medida no duto, em cm/s, com resposta de ~1 min e resolução de ±0,5 cm/s. **[NASA]**
- **`Flow restrictor`** = número de placas perfuradas na entrada do ventilador (0, 1 ou 2). **[NASA]**
- **Conversão Fan → velocidade:** possível pela calibração do mesmo dia e do mesmo número de restritores; `U = 1,0066 × AIR` na seção de teste. Foi o método da NASA. **[NASA]**
- **Cobertura:** 108 dos 129 registros têm calibração do dia e do restritor; 20 não têm calibração do dia (GMT 51, 164, 167, 204, 211 e 2016); 1 (T15) tem o dia calibrado para outro número de restritores. **[PSI]**
- **A calibração varia de 20 a 40 cm/s** a 12,2 V com dois restritores, conforme o dia. Não pode ser reaproveitada entre dias. **[PSI]**
- **Conferência:** T11 (Fan 48, GMT 178) dá ~4,1 cm/s pela calibração; a NASA publica 4 cm/s. **[Inferência]**

## 4. Regimes experimentais

- O CSV e a planilha listam os ajustes de `Fan display` e `Air display` **em ordem, sem horário**.
- 17 registros têm um único ajuste de fluxo; os outros 112 têm sequências, texto ("blowoff", "ext", "incr to") ou células vazias.
- O Apêndice A do relatório dá a direção do fluxo de 120 testes (67 opostos, 38 concorrentes, 15 de estagnação), o horário de início de 52 e de início e fim de 14, além de observações em texto. *Nota da fase P2:* as palavras Opposed, Concurrent e Stagnation estão impressas na coluna intitulada "Sample distance", que nos testes de GMT 45 contém números. A leitura como direção do fluxo é uma **[Inferência]**, coerente com as descrições dos pesquisadores, mas a coluna não se chama "direção".
- **Os instantes de ignição, estabilização e mudança de regime não estão em nenhuma tabela.** A sobreposição do vídeo mostra `FAN` e `AIR` em cada quadro, atualizados ~4,8 vezes por segundo, e é a fonte para datar os regimes. **[Vídeo]**

## 5. Reconciliação entre 126 testes e 129 registros

- **[NASA]** "A total of 126 tests were conducted… more than the planned 103 tests, since some samples were burned more than once."
- **[PSI]** O Apêndice A lista 126 execuções, numeradas de 1 a 126 na ordem em que ocorreram, sem lacunas.
- **[PSI]** As 3 linhas do CSV que não estão no Apêndice A são O20, O21 e O22, de 26/02/2016.
- **129 = 126 (campanha de 2014 descrita no relatório) + 3 (testes de 2016).**

Outras contagens: 119 números de teste distintos; 10 executados duas vezes (sufixos a/b); 23 amostras usadas em mais de uma execução; nenhuma linha administrativa. As datas de 2018 em T9 e T18 são erro de digitação da fonte (as-run 33 e 35, GMT 175 de 2014).

## 6. Inventário de mídia

### 6.1 Arquivos listados no PSI-25 **[PSI]**

694 arquivos, 274,6 GB.

| Papel | Arquivos | GB | O que é |
|---|---:|---:|---|
| `primary-video` | 128 | 7,97 | Vídeo lateral do experimento, com sobreposição |
| `second-view` | 102 | 9,04 | Arquivos "_2ND_VIEW". No único inspecionado (T11) é uma câmera de cabine, não uma segunda câmera científica |
| `still-sequence` | 52 | 0,45 | Fotos de topo da Nikon convertidas em vídeo |
| `auxiliary-video` | 10 | 0,20 | Câmera de laboratório, perda de sinal, pós-queima, compilações |
| `shifted-video`, `vlc-recording` | 1 + 3 | 0,04 | Versões editadas ou regravadas |
| `original-videos-zip` | 114 | 25,5 | Vídeos originais por teste |
| `test-point-zip` | 58 | 95,8 | Pacotes `GMT2014_ddd_BASS_S…_TP…`; os nomes citam "D300s" e "NEF" (fotos da Nikon), não abertos |
| `test-zip-unspecified` | 1 | 0,25 | ZIP do M14 sem descrição no nome |
| `proof-sheet-pdf` | 125 | 0,12 | Folhas de prova das fotos |
| `iss-image-zip` | 91 | 135,2 | Pacotes com número de foto da ISS, sem chave de teste |
| `document` | 9 | 0,05 | Documentos, imagem representativa, metadados |

### 6.2 Regra de associação

Cada nome de arquivo traz até três chaves: número do teste, número da amostra e dia GMT. O inventário compara as três com as células do registro:

| Grau | Critério |
|---|---|
| **confirmada** | Teste, amostra e GMT coincidem |
| **provável** | O teste coincide e nada no nome contradiz o registro; ou amostra + GMT isolam um único registro quando o nome não traz o teste |
| **ambígua** | O nome serve a mais de um registro, ou contradiz o registro que cita |
| **não encontrada** | Nenhum MP4 pôde ser ligado ao registro |

Um nome parecido não basta: sem pelo menos uma chave que confira, o arquivo fica fora dos registros.

Diferenças em relação a `origin/develop:scripts/build_media_index.py` (lido, não modificado):

- Aceita sufixos `a`/`b` (`TEST_O3a`, `TEST_P13b`), que a expressão regular do `develop` rejeitava.
- Lê também o padrão `GMT2014_ddd_BASS_S…_TP…` (fotos e folhas de prova) e nomes livres (`O5a-all.mp4`).
- Confere amostra e GMT em vez de confiar só na concatenação das três chaves.
- Usa o dia do ano da data como segunda evidência de GMT e registra quando a coluna GMT diverge.
- Classifica o papel de cada arquivo e mantém fora dos registros o que não é experimento.
- Mesma leitura do histórico de arquivos (último evento por caminho).

### 6.3 Estatísticas **[PSI]**

| Vídeo ligado ao registro | Registros |
|---|---:|
| confirmada | 120 |
| provável | 2 (M3, O10) |
| ambígua | 1 (B17) |
| não encontrada | 6 (F2, P8, P10, O20, O21, O22) |

O `develop` ligava 98 registros. Ligações arquivo–registro: 563 confirmadas, 26 prováveis, 9 ambíguas. 100 arquivos ficaram fora dos registros (91 pacotes da ISS e 9 documentos).

| Pesquisador | Registros | Com MP4 | MP4 ligados | MB | Com "2ND_VIEW" | Com sequência de fotos | Regime único |
|---|---:|---:|---:|---:|---:|---:|---:|
| Bhattacharjee (filmes de PMMA) | 22 | 22 | 54 | 637 | 15 | 15 | 7 |
| Ferkul (Nomex, vela) | 4 | 3 | 6 | 144 | 2 | 1 | 3 |
| Miller (placas de PMMA) | 20 | 20 | 46 | 6 228 | 15 | 4 | 0 |
| Olson (bastões, estagnação) | 27 | 24 | 59 | 4 378 | 20 | 10 | 0 |
| Fernandez-Pello (bastões, fluxo oposto) | 27 | 25 | 58 | 5 351 | 22 | 5 | 2 |
| T'ien (SIBAL, seção esférica) | 29 | 29 | 75 | 1 023 | 20 | 15 | 5 |

Outros números: 119 registros têm vídeo principal; 94 têm "2ND_VIEW"; 50 têm sequência de fotos em MP4; 50 têm pacote de fotos; 125 têm folha de prova; 111 têm ZIP de vídeos originais.

### 6.4 Casos sem correspondência plena

| Registro | Situação | Evidência |
|---|---|---|
| **B17** (GMT 183, amostra 175m) | Ambígua | Os únicos vídeos com GMT 183 e amostra 175 chamam-se `…SAMPLE_175_TESTB15…`. O B15 real é de GMT 188, amostra 149, e tem vídeos próprios. Provável erro no nome do arquivo **[Hipótese]**; a folha de prova `…S175M_TPB17…` é do B17 |
| **O10** (CSV diz GMT 213) | Provável | Arquivos com GMT 203, que é o dia do ano de 22/07/2014 e o GMT impresso no Apêndice A. A coluna GMT do CSV está errada |
| **M3** | Provável | Só há vídeos auxiliares de perda de sinal (`M3-over-the-shoulder-view-during-LOS.mp4`, `M3-rack-video-during-LOS.mp4`), ligados apenas pelo número do teste; nenhum vídeo principal completo |
| **P8** (amostra 197m) | Não encontrada | Só uma folha de prova, com amostra 198 no nome (ligação ambígua) |
| **P10** | Não encontrada | Só a folha de prova |
| **F2** (Nomex, sem ignição) | Não encontrada | Nenhum arquivo |
| **O20, O21, O22** (2016) | Não encontrada | Nenhum arquivo de 2016 na listagem |

Outras ligações não confirmadas: `GMT2014_210_BASS_S219_TPP16.zip` cita P16 mas tem amostra e GMT do O16; folhas de prova `TP06`, `TP07`, `TP08a`, `TP08b`, `TP09` sem a letra do pesquisador (resolvidas por amostra + GMT + número); ZIPs `…SAMPLE_185_TEST` e `…SAMPLE_188_TEST` sem número de teste (P1 e P2 por amostra + GMT).

### 6.5 Os 129 registros

Gerado de `data/bass2/inventory.json`. Colunas: P = vídeo principal, 2 = "2ND_VIEW", F = sequência de fotos, X = outros vídeos, Z = ZIPs, PDF = folhas de prova. "Dir." vem do Apêndice A.

| Teste | As-run | GMT | Amostra | Material | Dir. | O₂ % | Vídeo | P | 2 | F | X | Z | PDF | MB de vídeo |
|---|---:|---:|---|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|
| B1 | 7 | 50 | 147 | PMMA | oposto | 22,2 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 8,6 |
| B2 | 8 | 50 | 155 | PMMA | oposto | 22,2 | confirmada | 1 | 0 | 0 | 0 | 1 | 1 | 7,9 |
| B3 | 11 | 50 | 148 | PMMA | oposto | 22,2 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 10,1 |
| B4 | 9 | 50 | 159 | PMMA | oposto | 22,2 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 15,9 |
| B5 | 10 | 50 | 156 | PMMA | oposto | 22,2 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 13,8 |
| B6 | 57 | 188 | 153m | PMMA | oposto | 21,0 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 18,1 |
| B7 | 12 | 50 | 161 | PMMA | oposto | 22,2 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 20,7 |
| B8 | 60 | 188 | 157m | PMMA | oposto | 21,0 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 37,4 |
| B9 | 58 | 188 | 154m | PMMA | oposto | 21,0 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 10,0 |
| B10 | 62 | 188 | 173m | PMMA | oposto | 21,0 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 40,6 |
| B11 | 61 | 188 | 158m | PMMA | oposto | 21,0 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 39,6 |
| B12 | 13 | 50 | 160 | PMMA | oposto | 22,2 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 16,5 |
| B13 | 63 | 188 | 162m | PMMA | oposto | 21,0 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 62,9 |
| B14 | 47 | 183 | 174m | PMMA | oposto | 15,0 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 13,4 |
| B15 | 59 | 188 | 149m | PMMA | oposto | 21,0 | confirmada | 2 | 2 | 1 | 0 | 2 | 1 | 76,0 |
| B16 | 51 | 183 | 150m | PMMA | oposto | 17,3 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 30,1 |
| B17 | 48 | 183 | 175m | PMMA | oposto | 17,5 | ambígua | 1 | 1 | 0 | 0 | 1 | 1 | 52,6 |
| B18 | 49 | 183 | 176m | PMMA | oposto | 17,4 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 38,3 |
| B19 | 52 | 183 | 151m | PMMA | oposto | 17,3 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 23,3 |
| B20 | 50 | 183 | 152m | PMMA | oposto | 17,4 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 30,7 |
| B21 | 121 | 216 | 174m | PMMA | oposto | 20,8 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 40,4 |
| B22 | 126 | 216 | 176m | PMMA | oposto | 20,7 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 28,9 |
| F1 | 14 | 50 | 227 | Nomex | concorrente | 22,2 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 12,0 |
| F2 | 103 | 209 | 228m | Nomex | concorrente | 21,0 | não encontrada | 0 | 0 | 0 | 0 | 0 | 0 | 0,0 |
| F3 | 115 | 213 | 229m | Nomex | concorrente | 21,7 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 29,2 |
| F4 | 36 | 175 | 39M | cera (vela) | estagnação | 17,4 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 103,1 |
| M1 | 15 | 51 | 222 | PMMA | oposto | 22,2 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 69,6 |
| M2 | 17 | 51 | 224 | PMMA | oposto | 22,2 | confirmada | 1 | 0 | 2 | 0 | 1 | 1 | 228,5 |
| M3 | 82 | 192 | 226m | PMMA | oposto | 20,8 | provável | 0 | 0 | 0 | 2 | 3 | 1 | 28,6 |
| M4 | 113 | 212 | 171m | PMMA | oposto | 21,8 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 342,5 |
| M5 | 18 | 51 | 167 | PMMA | oposto | 22,2 | confirmada | 1 | 0 | 2 | 0 | 1 | 1 | 208,7 |
| M6 | 111 | 212 | 163m | PMMA | oposto | 21,8 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 321,8 |
| M7 | 81 | 192 | 177m | PMMA | oposto | 18,9 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 289,4 |
| M8 | 79 | 192 | 178m | PMMA | oposto | 19,1 | confirmada | 1 | 1 | 0 | 0 | 4 | 1 | 418,4 |
| M9 | 78 | 192 | 179m | PMMA | oposto | 18,0 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 258,7 |
| M10 | 97 | 204 | 180m | PMMA | oposto | 20,1 | confirmada | 2 | 2 | 0 | 2 | 4 | 1 | 517,8 |
| M11 | 80 | 192 | 181m | PMMA | oposto | 20,0 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 456,9 |
| M12 | 114 | 212 | 165m | PMMA | oposto | 21,7 | confirmada | 1 | 1 | 0 | 0 | 3 | 1 | 282,9 |
| M13 | 112 | 212 | 169m | PMMA | oposto | 20,8 | confirmada | 1 | 1 | 0 | 0 | 3 | 1 | 327,3 |
| M14 | 16 | 51 | 223 | PMMA | oposto | 22,2 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 192,4 |
| M15 | 64 | 188 | 225m | PMMA | oposto | 21,0 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 347,0 |
| M16 | 99 | 204 | 164m | PMMA | oposto | 19,2 | confirmada | 1 | 1 | 0 | 0 | 3 | 1 | 253,7 |
| M17 | 88 | 196 | 166m | PMMA | oposto | 18,8 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 500,3 |
| M18 | 87 | 196 | 168m | PMMA | oposto | 17,9 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 407,8 |
| M19 | 98 | 204 | 170m | PMMA | oposto | 19,0 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 409,9 |
| M20 | 116 | 213 | 172m | PMMA | oposto | 18,0 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 364,3 |
| O1 | 5 | 49 | 207 | PMMA | — | 22,2 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 40,0 |
| O2 | 6 | 49 | 204 | PMMA | — | 22,2 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 34,8 |
| O3a | 23 | 164 | 205M | PMMA | concorrente | 18,0 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 51,4 |
| O3b | 24 | 164 | 205M | PMMA | concorrente | 18,0 | confirmada | 1 | 1 | 1 | 0 | 0 | 1 | 88,3 |
| O4 | 66 | 189 | 216m | PMMA | estagnação | 14,8 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 331,4 |
| O5a | 89 | 202 | 220m | PMMA | concorrente | 15,1 | confirmada | 2 | 2 | 1 | 1 | 2 | 1 | 351,6 |
| O5b | 90 | 202 | 220m | PMMA | concorrente | 14,2 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 64,8 |
| O6 | 37 | 177 | 206M | PMMA | estagnação | 16,7 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 216,0 |
| O7 | 38 | 177 | 214m | PMMA | estagnação | 16,0 | confirmada | 1 | 1 | 0 | 1 | 1 | 1 | 224,2 |
| O8a | 39 | 177 | 208m | PMMA | estagnação | 15,7 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 129,7 |
| O8b | 40 | 177 | 208m | PMMA | estagnação | 15,5 | confirmada | 1 | 1 | 0 | 0 | 0 | 1 | 137,1 |
| O9 | 41 | 177 | 209m | PMMA | estagnação | 15,0 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 149,7 |
| O10 | 95 | 203 | 210m | PMMA | concorrente | 16,7 | provável | 0 | 1 | 1 | 0 | 2 | 1 | 118,4 |
| O11 | 65 | 189 | 184m | PMMA | estagnação | 15,4 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 284,3 |
| O12 | 67 | 189 | 217m | PMMA | estagnação | 13,6 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 129,8 |
| O13a | 91 | 202 | 221m | PMMA | concorrente | 15,9 | confirmada | 2 | 1 | 1 | 0 | 2 | 1 | 395,8 |
| O13b | 92 | 202 | 221m | PMMA | concorrente | 14,6 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 72,4 |
| O14 | 117 | 213 | 183m | PMMA | concorrente | 16,3 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 240,6 |
| O15a | 100 | 209 | 218m | PMMA | estagnação | 17,1 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 158,7 |
| O15b | 101 | 209 | 218m | PMMA | estagnação | 16,7 | confirmada | 1 | 1 | 0 | 0 | 0 | 1 | 478,3 |
| O16 | 106 | 210 | 219m | PMMA | estagnação | 14,5 | confirmada | 2 | 2 | 0 | 0 | 2 | 1 | 126,4 |
| O17 | 96 | 203 | 211m | PMMA | concorrente | 15,1 | confirmada | 0 | 1 | 1 | 0 | 2 | 1 | 155,7 |
| O18 | 102 | 209 | 212m | PMMA | estagnação | 15,2 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 167,9 |
| O19 | 118 | 213 | 213m | PMMA | concorrente | 15,3 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 231,5 |
| O20 | — | 57 | 204m | PMMA | — | 16,5 | não encontrada | 0 | 0 | 0 | 0 | 0 | 0 | 0,0 |
| O21 | — | 57 | 219m | PMMA | — | 15,9 | não encontrada | 0 | 0 | 0 | 0 | 0 | 0 | 0,0 |
| O22 | — | 57 | 220m | PMMA | — | 15,4 | não encontrada | 0 | 0 | 0 | 0 | 0 | 0 | 0,0 |
| P1 | 25 | 167 | 185M | PMMA | oposto | 17,7 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 116,3 |
| P2 | 26 | 167 | 188M | PMMA | oposto | 17,4 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 126,8 |
| P3a | 27 | 167 | 215M | PMMA | oposto | 17,7 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 138,4 |
| P3b | 28 | 167 | 215M | PMMA | oposto | 17,4 | confirmada | 1 | 1 | 0 | 0 | 0 | 1 | 255,5 |
| P4 | 54 | 184 | 197m | PMMA | oposto | 18,5 | confirmada | 1 | 0 | 0 | 0 | 1 | 1 | 156,2 |
| P5 | 83 | 195 | 202m | PMMA | oposto | 19,3 | confirmada | 2 | 1 | 0 | 0 | 2 | 1 | 461,1 |
| P6 | 53 | 184 | 186m | PMMA | oposto | 18,9 | confirmada | 1 | 0 | 0 | 0 | 1 | 1 | 57,6 |
| P8 | 56 | 184 | 197m | PMMA | oposto | 16,4 | não encontrada | 0 | 0 | 0 | 0 | 0 | 1 | 0,0 |
| P9 | 84 | 195 | 202m | PMMA | oposto | 17,6 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 284,7 |
| P10 | 55 | 184 | 187m | PMMA | oposto | 17,0 | não encontrada | 0 | 0 | 0 | 0 | 0 | 1 | 0,0 |
| P12 | 104 | 210 | 199m | PMMA | oposto | 17,5 | confirmada | 2 | 2 | 0 | 0 | 3 | 1 | 245,4 |
| P13a | 85 | 195 | 203m | PMMA | oposto | 20,7 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 424,8 |
| P13b | 86 | 195 | 203m | PMMA | oposto | 20,6 | confirmada | 1 | 0 | 0 | 0 | 1 | 1 | 56,4 |
| P14 | 29 | 174 | 189M | PMMA | oposto | 18,4 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 230,5 |
| P15 | 30 | 174 | 190M | PMMA | oposto | 18,0 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 190,2 |
| P16 | 93 | 203 | 191m | PMMA | concorrente | 18,2 | confirmada | 1 | 1 | 0 | 0 | 3 | 1 | 219,0 |
| P17 | 105 | 210 | 192m | PMMA | oposto | 16,8 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 238,1 |
| P18 | 107 | 211 | 193m | PMMA | oposto | 20,0 | confirmada | 1 | 2 | 0 | 0 | 2 | 1 | 239,1 |
| P19 | 94 | 203 | 194m | PMMA | concorrente | 17,5 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 373,0 |
| P20 | 109 | 211 | 195m | PMMA | oposto | 19,0 | confirmada | 2 | 2 | 0 | 0 | 3 | 1 | 247,3 |
| P21a | 31 | 174 | 196M | PMMA | oposto | 16,3 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 102,8 |
| P21b | 32 | 174 | 196M | PMMA | oposto | 16,3 | confirmada | 1 | 1 | 0 | 0 | 0 | 1 | 81,7 |
| P22a | 68 | 189 | 200m | PMMA | oposto | 20,8 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 70,8 |
| P22b | 69 | 189 | 200m | PMMA | oposto | 20,0 | confirmada | 1 | 1 | 0 | 0 | 0 | 1 | 165,3 |
| P23 | 110 | 211 | 201m | PMMA | oposto | 18,2 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 324,0 |
| P24 | 108 | 211 | 819L | PMMA | oposto | 19,0 | confirmada | 1 | 1 | 1 | 0 | 3 | 1 | 314,9 |
| P25 | 70 | 189 | 217m | PMMA | oposto | 20,9 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 232,3 |
| T1 | 1 | 45 | 128 | SIBAL | — | 18,5 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 13,7 |
| T2 | 2 | 45 | 129 | SIBAL | — | 18,5 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 18,4 |
| T3 | 43 | 178 | 182m | PMMA | estagnação | 17,2 | confirmada | 2 | 2 | 1 | 0 | 1 | 1 | 182,2 |
| T4 | 3 | 45 | 130 | SIBAL | — | 18,7 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 10,6 |
| T5 | 19 | 100 | 131 | SIBAL | concorrente | 18,8 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 37,6 |
| T6 | 20 | 100 | 132 | SIBAL | concorrente | 18,8 | confirmada | 1 | 0 | 0 | 0 | 1 | 1 | 23,6 |
| T7 | 75 | 190 | 182m | PMMA | estagnação | 17,3 | confirmada | 2 | 2 | 1 | 0 | 2 | 1 | 130,9 |
| T9 | 33 | 175 | 133M | SIBAL | concorrente | 16,4 | confirmada | 1 | 0 | 0 | 0 | 1 | 1 | 10,8 |
| T10 | 34 | 175 | 134M | SIBAL | concorrente | 16,4 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 26,0 |
| T11 | 42 | 178 | 135m | SIBAL | concorrente | 17,1 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 47,6 |
| T12 | 44 | 178 | 136m | SIBAL | concorrente | 16,8 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 10,2 |
| T13 | 21 | 100 | 137 | SIBAL | concorrente | 17,5 | confirmada | 1 | 0 | 0 | 1 | 1 | 1 | 65,9 |
| T14 | 45 | 178 | 140m | SIBAL | concorrente | 16,9 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 32,4 |
| T15 | 4 | 45 | 138 | SIBAL | — | 18,7 | confirmada | 1 | 0 | 1 | 0 | 1 | 1 | 7,3 |
| T16 | 22 | 100 | 139 | SIBAL | concorrente | 17,6 | confirmada | 1 | 0 | 0 | 4 | 1 | 1 | 91,1 |
| T17 | 46 | 178 | 142m | SIBAL | concorrente | 16,9 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 21,7 |
| T18 | 35 | 175 | 141M | SIBAL | concorrente | 17,4 | confirmada | 1 | 1 | 0 | 0 | 1 | 1 | 27,7 |
| T19 | 71 | 190 | 143m | SIBAL | concorrente | 17,2 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 20,8 |
| T20 | 72 | 190 | 144m | SIBAL | concorrente | 17,2 | confirmada | 0 | 1 | 1 | 0 | 2 | 1 | 5,7 |
| T21 | 73 | 190 | 145m | SIBAL | concorrente | 17,2 | confirmada | 1 | 1 | 1 | 3 | 2 | 1 | 13,9 |
| T22 | 76 | 190 | 146m | SIBAL | concorrente | 17,1 | confirmada | 1 | 1 | 1 | 0 | 2 | 1 | 13,7 |
| T23 | 74 | 190 | 133m | SIBAL | concorrente | 17,2 | confirmada | 1 | 1 | 1 | 0 | 2 | 1 | 13,4 |
| T24 | 77 | 190 | 133m | SIBAL | concorrente | 18,2 | confirmada | 1 | 1 | 1 | 0 | 1 | 1 | 36,3 |
| T25 | 119 | 216 | 138m | SIBAL | concorrente | 20,8 | confirmada | 1 | 1 | 1 | 0 | 2 | 1 | 20,4 |
| T26 | 120 | 216 | 137m | SIBAL | concorrente | 20,8 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 37,5 |
| T27 | 122 | 216 | 146m | SIBAL | concorrente | 20,7 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 27,0 |
| T28a | 123 | 216 | 144m | SIBAL | concorrente | 20,7 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 18,9 |
| T28b | 124 | 216 | 144m | SIBAL | concorrente | 20,7 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 16,8 |
| T29 | 125 | 216 | 145m | SIBAL | concorrente | 20,7 | confirmada | 1 | 1 | 0 | 0 | 2 | 1 | 40,1 |

## 7. Vídeos piloto

Detalhes em `BASS2_PILOT_VIDEO_REVIEW.md`.

- **Técnica [Vídeo]:** H.264, 720 × 480, 29,97 quadros/s constantes, áudio AAC; B1 com 1 343 quadros (44,8 s), T11 com 3 575 (119,3 s), "2ND_VIEW" com 5 669 (189,2 s). São reencodes; a proporção de pixel declarada difere (10:11 no B1, 40:33 no T11).
- **Sobreposição [Vídeo]:** `FUEL` (N₂), `AIR` (cm/s), `FAN` (10 × V), `RAD` (radiômetro), data e relógio. `FAN` e `AIR` conferem com o CSV nos dois testes. Atualização a ~4,8 Hz.
- **Tempo [Vídeo]:** o relógio da sobreposição avança 43 s em 44,8 s de arquivo no B1 e 118 s em 119,3 s no T11. *Correção da fase P2:* não há deriva; o MP4 do B1 tem 30 quadros de preenchimento no início, e a taxa do relógio é a mesma do arquivo (inclinação 0,9995 ± 0,0008). Ver `BASS2_B1_TIMEBASE_AND_TELEMETRY.md`.
- **B1 [Vídeo]:** chama nítida, em duas faixas (vista de perfil), avançando contra o fluxo; extinção em 2 a 3 s depois que `FAN` cai de 62 para 38.
- **T11 [Vídeo]:** chama praticamente invisível na vista lateral, apesar de o radiômetro registrar a queima. Coincide com o aviso do relatório para baixa velocidade e baixo O₂.
- **"2ND_VIEW" [Vídeo]:** câmera de cabine mostrando o glovebox e os monitores; não serve para medição.
- **Escala [Vídeo]:** nenhum objeto de tamanho conhecido nos quadros escuros.

## 8. Respostas às perguntas de conclusão

1. **Quais vídeos BASS-II temos?** No PSI: 296 MP4 (17,7 GB), dos quais 128 vídeos principais cobrindo 119 registros, 52 sequências de fotos de topo cobrindo 50 registros e 102 "2ND_VIEW". Localmente: três (B1, T11 e T11 "2ND_VIEW").
2. **Qual é o melhor piloto?** B1: PMMA, regime único, chama nítida, 45 s, valor publicado de 2,2 mm/s. Para SIBAL, o T11 só é utilizável pelas fotos de topo; na vista lateral, T1 ou T19.
3. **O que aparece na sobreposição?** `FUEL`, `AIR`, `FAN`, `RAD`, data (um dia adiantada) e relógio com segundos.
4. **Conseguimos a velocidade do fluxo em cm/s?** Sim, de duas formas: `AIR` direto (lento, ±0,5 cm/s) e `FAN` + calibração do dia (o método da NASA), para 108 dos 129 registros.
5. **Há informação temporal para identificar mudanças de regime?** Sim, no vídeo: `FAN` muda de forma legível quadro a quadro e o relógio dá a base de tempo. Nas tabelas, não.
6. **Conseguimos calibrar pixels para milímetros?** Ainda não. Faltam as fotos de topo (largura da amostra visível) ou um trecho iluminado dos vídeos originais.
7. **A chama é distinguível?** No B1, sim, com folga. No T11 lateral, não. Depende do teste: chamas azuis de baixa velocidade e baixo O₂ somem na vista lateral.
8. **O que implementar no pipeline?** Leitor de vídeo com mapa de tempo pelo relógio; leitura da sobreposição (dígitos de fonte fixa); máscara da sobreposição e do período do ignitor; perfil de intensidade com limiar ao longo do eixo de propagação; regressão por trecho de regime constante com incerteza; registro espacial por teste; conversão `FAN` → cm/s pela calibração do dia.
9. **Que resultados publicados validam as medições?** 2,2 mm/s do B1; Tabela 5.1 (18 placas de PMMA com taxa por velocidade); velocidades da Tabela 7.1; limites de extinção de ~1 cm/s (filmes) e 1 a 5 cm/s (SIBAL).

## 9. Limitações

- Três vídeos de dois testes não representam os 296.
- O Apêndice A foi extraído de texto de PDF por regras; cada valor deve ser conferido no PDF antes de ser citado (o campo `parse` do JSON diz isso). Seis linhas não têm direção impressa e uma não tem observação.
- A ordem 0/1/2 dos blocos de calibração é inferida para 26 dos 27 dias.
- O papel `second-view` e o conteúdo dos pacotes `test-point-zip` foram deduzidos de um arquivo e dos nomes.
- O O₂ dos testes de fevereiro de 2014 é incerto segundo o próprio relatório.
- Os MP4 são reencodes de baixa taxa de bits; os originais não foram examinados.

## 10. Próxima etapa recomendada

1. Autorizar ~6,5 MB adicionais: as sequências de fotos de topo de B1 (2,8 MB) e T11 (3,7 MB). São a modalidade usada pela NASA, resolvem a escala (largura da amostra no quadro) e a visibilidade do SIBAL.
2. Autorizar o ZIP de vídeos originais do B1 (14,6 MB) para comparar com o reencode: resolução, base de tempo e eventual trecho iluminado com a escala.
3. Implementar primeiro a **leitura da sobreposição e o mapa de tempo** (relógio, `FAN`, `AIR`, `RAD` por quadro) no B1. É independente da chama, é verificável contra o CSV e é pré-requisito de qualquer velocidade.
4. Só então o perfil de intensidade e a regressão no B1, com validação contra 2,2 mm/s.
5. Depois, um teste de placa (por exemplo M7 ou M16) para validar a separação por regime contra a Tabela 5.1.
