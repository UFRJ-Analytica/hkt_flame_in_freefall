# SoFIE-GEL: guia de avaliação do módulo "Published Experimental Evidence"

O módulo do HabitatFire apresenta a evidência publicada do SoFIE-GEL. A base científica está em:

- [SOFIE_DATA_REVIEW.md](SOFIE_DATA_REVIEW.md)
- [SOFIE_GEL_METHOD.md](SOFIE_GEL_METHOD.md)
- [SOFIE_PILOT_REVIEW.md](SOFIE_PILOT_REVIEW.md)
- [SOFIE_ANALYSIS.md](SOFIE_ANALYSIS.md)

**É uma camada de evidência.** Não é modelo de propagação, previsão de incêndio nem regra de extinção. Não está conectada ao BASS-II, à cabine 3D nem ao catálogo PSI.

## 1. Como acessar

1. `npm run dev` (ou `npm run build` seguido de `npm run preview`).
2. Abra **Experimentos**.
3. No topo da lista de investigações, no grupo **"Evidência publicada · fora do PSI"** (visível em "Todas as famílias" e "Sólidos"), clique em **SoFIE-GEL**.

A entrada é separada dos itens PSI e marcada como "sem dataset PSI". Ela não seleciona uma investigação do catálogo, não altera a tabela PSI e não oferece "Usar condições no laboratório".

**Carregamento sob demanda.**

- O componente [`SofieGelObservation.tsx`](../../src/components/research/SofieGelObservation.tsx) é carregado com `React.lazy`, em chunk próprio (cerca de 20 KB JS e 6 KB CSS).
- O componente busca `public/data/sofie/gel-evidence.json` (cerca de 17 KB) só depois do clique.
- Nada vem de `data/cache/`.

Para fechar: ×, Esc ou clique fora.

## 2. O que é exibido

| Bloco | Conteúdo | Tipos |
|---|---|---|
| E. Limitações permanentes (no topo) | As 7 limitações obrigatórias e a frase "não é modelo nem previsão" | — |
| Legenda | `published`, `derived`, `video_observation`, `exploratory`, `hypothesis`, `unavailable`, cada um com texto e borda própria | — |
| A. Identificação científica | SoFIE-GEL, NASA, PI, CIR/ISS, objetivo, esfera de PMMA de 4 cm (com a divergência documental), faixas da campanha (2025), **dataset PSI indisponível**, com o motivo | published, unavailable |
| B. Cinco casos de extinção | Tabela com caso e amostra, modo, local, fluxo, O₂, pressão, Re, taxa de deformação e perda condutiva (1410C "não registrada"). Coerência derivada da tabela. Dinâmicas publicadas por caso. Conclusões publicadas | published, derived, unavailable |
| C. Comparação experimental | O₂ na extinção × taxa de deformação (5 pontos, eixo log, forma por modo, linha de 7,5 1/s publicada); barras de fluxo, O₂ e perda condutiva por caso. **Sem ajuste, regressão ou extrapolação** | published |
| D. Caso 1410C | Rótulo **"Análise exploratória — não validada experimentalmente"**. Dados do vídeo (associação pelo XMP, codec, duplicação 3×, transição de edição, escala indisponível). Picos por janela com faixa publicada sobreposta (comparável só sob H1) e Nyquist de 5 Hz. Tabela H1 × H2. Aliasing | video_observation, exploratory, hypothesis, published, unavailable |
| Fontes | NTRS 20240007628, CNF 2025 (texto não obtido, 403), página NASA, vídeo NASA, revisões | — |

## 3. Origem de cada grandeza

| Grandeza | Origem | Tipo |
|---|---|---|
| Os 5 casos (fluxo, O₂, p, Re, a, perda condutiva, modo, local) | NTRS 20240007628, Tabela 1, via `data/sofie/gel-extinction-cases-ntrs20240007628.json` | published |
| Dinâmicas (ciclos, períodos, standoff 7 → 10 mm, giro 2–3,5 Hz…) | Texto de NTRS 20240007628 (§3.1–3.5) | published |
| Faixas da campanha, junção a 7,5 1/s, O₂ mínimo, efeito do pré-aquecimento | Resumo de CNF 277 (2025) 114244 | published |
| 3U/(2R) e ν = UD/Re | Calculados aqui | derived |
| Codec, duplicação de quadros, transição, associação 1410C | Arquivo do vídeo público e metadados XMP (`data/sofie/pilot/pilot-1410c.json`) | video_observation |
| Picos por janela, significância por permutação | `scripts/sofie/pilot_video.py` | exploratory |
| H1 e H2, aliasing, várias chamas | Interpretações não decididas pelos dados | hypothesis |
| Dataset PSI, escala espacial, perda condutiva do 1410C | Não disponíveis publicamente | unavailable (`null` com motivo) |

**Resultados do vídeo e resultados publicados ficam em blocos separados do JSON.** A faixa publicada de 2–3,5 Hz aparece no bloco do vídeo apenas como referência rotulada `published`. A frequência do vídeo tem `useAsModelParameter: false`.

## 4. Limitações

1. Não há telemetria bruta pública.
2. Não há vídeos originais de voo; o único vídeo é uma edição de divulgação.
3. O vídeo não tem calibração espacial.
4. A base temporal é ambígua: cada quadro aparece 3 vezes (H1 ou H2).
5. Cinco casos não sustentam generalização preditiva nem regra de extinção.
6. A frequência de rotação não está validada.
7. A geometria esférica não equivale às amostras planas do BASS-II (nem às placas do Saffire).

## 5. Como reconstruir e verificar

```powershell
python scripts/sofie/build_sofie_replay.py          # public/data/sofie/gel-evidence.json
python scripts/sofie/build_sofie_replay.py --check  # "reproduzível"
python -m unittest discover -s scripts/sofie -p "test_*.py"
npm run typecheck
npm run build
```

O que esses comandos garantem:

- [`build_sofie_replay.py`](../../scripts/sofie/build_sofie_replay.py) lê só arquivos versionados: a tabela transcrita, o resultado do piloto e o manifesto.
- Os hashes de proveniência usam finais de linha normalizados.
- [`test_sofie_replay.py`](../../scripts/sofie/test_sofie_replay.py) verifica:
  - reprodutibilidade;
  - os 5 casos iguais à transcrição;
  - unidades;
  - os seis tipos, com `unavailable` sempre `null` e com motivo;
  - perda condutiva do 1410C nula;
  - nenhum ID PSI ou DOI de dataset;
  - separação entre publicado e exploratório, mais o rótulo exploratório;
  - coerência derivada;
  - as 7 limitações;
  - proveniência;
  - ausência de comprimentos ou velocidades extraídos do vídeo;
  - tamanho do arquivo.
