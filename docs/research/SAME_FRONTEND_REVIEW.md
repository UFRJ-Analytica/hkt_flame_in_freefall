# SAME (PSI-102): guia de avaliação do módulo Smoke & Detection

Este guia serve para avaliar o módulo de interface que apresenta a evidência do SAME no HabitatFire. A base científica está em [SAME_DATA_REVIEW.md](SAME_DATA_REVIEW.md), [SAME_MOMENT_METHOD.md](SAME_MOMENT_METHOD.md) e [SAME_ANALYSIS.md](SAME_ANALYSIS.md). Esses documentos não foram alterados nesta fase.

**O módulo é uma ferramenta de exploração de evidência.** Não é um simulador de partículas nem de propagação de chama, e não tem controles de simulação.

## 1. Como acessar

1. `npm run dev` (ou `npm run build` seguido de `npm run preview`).
2. Abra **Experimentos** e selecione **SAME · PSI-102** na lista.
3. No bloco "Smoke & Detection: evidência do SAME", clique em **Abrir análise Smoke & Detection**.

O que o carregamento faz:

- O componente ([`src/components/research/SameSmokeObservation.tsx`](../../src/components/research/SameSmokeObservation.tsx)) é carregado com `React.lazy`, em chunk próprio (cerca de 32 KB JS e 8 KB CSS).
- Ele busca `public/data/same/smoke-analysis.json` (cerca de 49 KB) **somente depois do clique**.
- O primeiro render do catálogo não carrega nada do SAME.
- O módulo nunca lê `data/cache/`, PDFs ou planilhas.
- O bloco de entrada informa que os 8 registros da tabela PSI-102 são a matriz planejada, e não os 47 testes voados.

Fechar: botão ×, tecla Esc ou clique fora. O foco volta ao botão (`useModalFocus`).

## 2. O que é exibido

| Seção | Conteúdo | Tipos de valor |
|---|---|---|
| Aviso permanente (fixo no topo ao rolar) | "Os momentos M0, M1 e M3 por teste não estão disponíveis devido à ausência das calibrações e razões de diluição necessárias." | — |
| Avisos científicos | Os 7 avisos obrigatórios, visíveis antes dos dados (não em tooltips) | — |
| Legenda de tipos | `published`, `measured`, `derived`, `model_assumption`, `unavailable`, cada um com rótulo de texto e borda própria (não só cor) | — |
| A. Identificação | NASA SAME, PSI-102, DOI, MSG/ISS, Expedição 15 (set–out 2007), equipe, objetivo, 47 pontos de teste, envelhecimento de 10 a 1800 s | published |
| B. Materiais | Cinco materiais: testes de voo e amostras (Apêndice A); testes processados; Rt/R0 do fio, duração do aquecimento e vazão LFE (média e faixa); presença na Tabela 1. Grade dos 47 testes por situação, com o material indicado | published, measured |
| C. Distribuição | Gráfico de Dg com o traço D0,5–D1,5 por material (sem envelhecimento vs 720 s). Tabela 1 com Dg e σg publicados e recalculados, mediana de massa e massa acima de 1 µm (modelo). Versões publicadas anteriores, com coerência com a Eq. 7 | published, derived, model_assumption |
| D. Envelhecimento | Barras de Dg nos dois pontos publicados (sem curva contínua). DustTrak B secundário/primário nos 6 testes de envelhecimento longo. Razões 720 s ÷ 0 s; número previsto se M3 se conserva (hipótese). Variação medida do número marcada como indisponível | published, derived, measured, model_assumption, unavailable |
| E. Detectores | Tabela de instrumentos (P-Trak, câmara de ionização, DustTrak A/B, ISS, STS): princípio, momento associado, unidade, faixa, calibração (indisponível, com o motivo) e limitações. Razão B/A por teste vs média publicada vs expectativa lognormal. Respostas da câmara de ionização, do ISS (saturado = vazado) e do STS (desligado = "off", nunca zero). Tabela por teste | measured, published, derived, model_assumption, unavailable |
| F. Método dos momentos | Definições de f_N, M_i, M0, M1, M3, D0,5, D1,5, Dg e σg; hipótese lognormal; verificação da Fig. 3; três colunas (calculado / medido / não reconstruível); o que falta | model_assumption, derived, unavailable |
| Grandezas indisponíveis e fontes | 8 grandezas com o motivo; links para o relatório final, para o PSI-102 e para os documentos do projeto | unavailable |

Cada valor numérico pode ser conferido no JSON: todo número está num objeto `{kind, value, unit?, source?, note?, reason?}`.

## 3. Origem de cada grandeza

| Grandeza na interface | Origem | Tipo |
|---|---|---|
| Dg, D0,5, D1,5, σg da Tabela 1 | Final Science Report (2010), Tabela 1, p. 17 | published |
| Dg e σg recalculados | Eqs. 7–8 aplicadas a D0,5 e D1,5 publicados (`moment_method.py`) | derived |
| Mediana de massa; frações acima de 300 nm e 1 µm; M0/M3 relativo | Hatch-Choate e lognormal com parâmetros publicados | model_assumption |
| Razões de envelhecimento (720 s ÷ 0 s) | Razões entre linhas publicadas da Tabela 1 | derived |
| "Número se M3 conservado" | D1,5⁻³: só vale se o volume de partículas se conserva | model_assumption |
| Razão B/A por teste; DustTrak B secundário/primário; deltas dos detectores; Rt/R0; vazão LFE; idade no platô | Planilhas HKP de voo, janelas por solenoide (`normalize_same.py`) | measured |
| Média ± dp de B/A; diferença relativa | Estatística sobre os testes medidos | derived |
| B/A publicado | 08ICES-2089, Tabela 1 (Apêndice D) | published |
| Testes de voo e amostras por material | Apêndice A do relatório final | published |
| M0, M1, M3, Dg, σg e Nt por teste; temperatura do fio; taxa de perda de massa; velocidade do ar; variação medida do número; modelo preditivo | Não calculáveis com o PSI-102 | unavailable (`value: null` com `reason`) |

## 4. Limitações preservadas na interface

1. O SAME investiga fumaça de materiais superaquecidos, não propagação de chama. Nenhum número é velocidade.
2. M0, M1 e M3 por teste não foram reconstruídos (aviso permanente mais seção F).
3. A Tabela 1 é agregada por material. Não se sabe quais testes entraram em cada linha, e não há distribuição por teste.
4. A lognormal unimodal é hipótese. Para silicone e lamp wick, ela não é coerente com a razão B/A medida.
5. A razão B/A não é calibração absoluta.
6. Não existe modelo preditivo validado. Material e set-point de aquecimento estão confundidos.
7. O SAME-R (PSI-101) não está incluído.

Também ficam explícitos na interface:

- a cobertura (15 testes com janelas por solenoide, 4 só com a janela NASA, 11 não segmentáveis, 17 não baixados);
- o STS desligado nos testes de envelhecimento longo;
- a saturação do ISS;
- o P-Trak sob diluição em malha fechada;
- as janelas secundárias curtas não interpretadas.

## 5. Como reconstruir e verificar

```powershell
python scripts/same/build_same_replay.py          # public/data/same/smoke-analysis.json
python scripts/same/build_same_replay.py --check  # "reproduzível"
python -m unittest discover -s scripts/same -p "test_*.py"
npm run typecheck
npm run build
```

O que esses comandos garantem:

- [`build_same_replay.py`](../../scripts/same/build_same_replay.py) lê apenas os derivados versionados: `data/same/derived/*.json` e `data/same/appendix-a-flight-log.csv`.
- Os hashes de proveniência são calculados sobre o texto com finais de linha normalizados. A verificação, portanto, não depende de `core.autocrlf`.
- Para regenerar os próprios derivados a partir do cache NASA, veja o §7 de [SAME_DATA_REVIEW.md](SAME_DATA_REVIEW.md).
- [`test_same_replay.py`](../../scripts/same/test_same_replay.py) verifica:
  - reprodutibilidade;
  - os cinco tipos;
  - `unavailable` sempre nulo e com motivo;
  - cinco materiais e 47 testes;
  - cobertura 15/4/11/17;
  - Tabela 1 com 8 linhas agregadas e sem distribuição por teste;
  - igualdade com a análise P1;
  - dois pontos de envelhecimento;
  - o aviso obrigatório;
  - ausência de chaves M0/M1/M3, velocidades, caminhos de cache e dados do PSI-101;
  - STS desligado como indisponível;
  - tamanho menor que 100 KB.

**Verificação manual recomendada.**

- Em largura de 390 px não há overflow horizontal da página: gráficos e tabelas largas rolam dentro do próprio painel.
- O aviso permanente continua visível ao rolar.
- Os tooltips (`<title>`) dos pontos repetem o tipo do valor.
