# FLARE: guia do módulo "FLARE — Flammability Limits at Reduced Gravity"

Este guia descreve o módulo do HabitatFire que apresenta a evidência publicada do FLARE (JAXA). A base científica está em:

- [FLARE_DATA_REVIEW.md](FLARE_DATA_REVIEW.md)
- [FLARE_METHOD.md](FLARE_METHOD.md)
- [FLARE_ANALYSIS.md](FLARE_ANALYSIS.md)
- [FLARE_PILOT_REVIEW.md](FLARE_PILOT_REVIEW.md)

**É uma camada de evidência publicada.** Não é reprodução dos dados da ISS, não é modelo e não prevê o resultado de cenários do usuário.

## 1. Acesso

1. Rode `npm run dev` (ou `npm run build` seguido de `npm run preview`).
2. Abra **Experiments**.
3. No grupo **"Published evidence · outside PSI"**, no topo da lista, clique em **FLARE**. O grupo é visível nos filtros "todas as famílias" e "sólidos", ao lado do SoFIE-GEL.

A entrada é separada dos itens PSI, porque não existe dataset FLARE no NASA PSI. Ela não altera o catálogo PSI nem oferece "Use conditions in the laboratory".

**Idioma.** Na `develop` a interface é em inglês. O texto do componente está em inglês. As frases em português do JSON são traduzidas só na exibição, por `englishDisplayData` com o dicionário [`src/i18n/flare.en.json`](../../src/i18n/flare.en.json). O artefato `flare-evidence.json` e as células impressas (`raw`) não mudam. Um teste falha se alguma frase exibida ficar sem tradução.

**Carregamento sob demanda.**

- O componente [`FlareObservation.tsx`](../../src/components/research/FlareObservation.tsx) é carregado com `React.lazy`, em chunk próprio de cerca de 17 KB JS e 5 KB CSS.
- O arquivo `public/data/flare/flare-evidence.json` (cerca de 25 KB) só é buscado depois do clique.
- Nada é lido de `data/cache/`.

## 2. Conteúdo

| Área | O que mostra |
|---|---|
| **D. Limitações e interpretação** (no topo, sempre visível) | As 6 limitações obrigatórias e o aviso de escopo |
| **A. Visão geral** | Objetivo; LOC × MLOC (e Vcr); papel do fluxo oposto; sustentação da chama; tabela das campanhas (1g, voo parabólico, ISS papel-filtro, ISS PMMA/NOMEX) com o que cada uma tem de dado quantitativo nesta base; aviso "Escopo desta versão"; PSI indisponível com o motivo |
| **B. Comparação de LOC e MLOC** | Gráfico por material, gás e publicação. Forma = grandeza (círculo LOC, quadrado MLOC, losango MLOC citado); preenchimento = natureza (medido preenchido na 1ª linha, citado na 2ª, previsto vazado e tracejado na última). Tabela com material, gás, referência, grandeza, valor impresso, natureza (medido / previsto / previsto · ponto de calibração / medido · citado), campanha · gravidade e origem. Divergências entre publicações. Erros do modelo dos autores |
| **C. Diferenças de O₂ e Vcr** | ΔO₂ por publicação, cada uma com sua convenção (2016: MLOC − LOC; 2018: LOC1g − MLOC), impresso e reproduzido. Tabela de Vcr como impresso (`2~6cm/s` permanece texto). Razão MLOC/LOC dos 5 pares medidos, rotulada como descritiva |
| **ISS, complementaridade e referências** | Só fatos dos resumos da ISS (nenhum LOC/MLOC da ISS); papel de BASS-II, Saffire, SoFIE-GEL e FLARE, sem pontuação conjunta; DOIs e páginas oficiais |

## 3. Origem dos dados

[`scripts/flare/build_flare_replay.py`](../../scripts/flare/build_flare_replay.py) gera o JSON da interface **somente** a partir dos derivados versionados da fase P0/P1:

- `data/flare/derived/flare-inventory.json`
- `data/flare/derived/flare-records.json`
- `data/flare/derived/flare-analysis.json`
- `data/flare/sources/publications-metadata.json`

Nenhum valor é digitado no frontend. Cada valor carrega:

- `kind`;
- a célula impressa (`raw`);
- a tabela de origem;
- o id do registro.

Os hashes de proveniência usam finais de linha normalizados.

**Ajuste no pipeline P1 para esta fase.** `normalize_flare.py` passou a registrar o Vcr de 6 cm/s citado no texto de 2018 (Ref. 17) como `measured-as-cited`, e `analyze_flare.py` passou a expor a divergência de Vcr (10 contra 6 cm/s). Antes, ela existia apenas como nota de texto. Nenhum valor existente mudou.

## 4. Garantias verificadas

- **Testes** ([`test_flare_replay.py`](../../scripts/flare/test_flare_replay.py), 13):
  - reprodutibilidade;
  - posicionamento fora do PSI;
  - valores iguais aos registros;
  - medido e previsto nunca na mesma entrada, com o ponto de calibração sinalizado;
  - divergências 14,7/14,9 % e 10/6 cm/s;
  - convenções de sinal;
  - `2~6cm/s` textual;
  - razões iguais à análise;
  - nenhum LOC/MLOC/Vcr da ISS;
  - ausência de conteúdo preditivo e as 6 limitações;
  - proveniência;
  - tradução de exibição completa;
  - tamanho do arquivo.
- **Navegador** (Edge headless, build de produção):
  - JSON e chunk carregam só após o clique, sem requisições ao cache;
  - 6 limitações visíveis, 4 seções, 19 linhas na tabela de limites, marcadores separados por natureza;
  - textos "2~6cm/s", "14.7 %", "14.9 %", "10 cm/s", "6 cm/s", "−2.3 p.p." e "+2.1 p.p." presentes (formato en-US), com as duas convenções;
  - sem overflow em 390 px (gráficos e tabelas largas rolam dentro do painel) e sem erros no console;
  - o catálogo PSI continua funcionando: seleção do SAME e detalhe de registro abrem e fecham.

## 5. Limitações (as mesmas da interface)

1. Os valores não constituem reprodução dos mapas completos da ISS.
2. 1g e microgravidade usam configurações distintas.
3. ΔO₂ não isola causalmente o efeito da gravidade.
4. Os mapas O₂ × velocidade não foram digitalizados.
5. Os artigos completos da ISS de 2024 e 2026 não estão nesta base.
6. O critério R_rad + 1/Da = 1 não foi implementado nem validado.

## 6. Reconstrução

```powershell
python scripts/flare/normalize_flare.py; python scripts/flare/analyze_flare.py
python scripts/flare/build_flare_replay.py          # public/data/flare/flare-evidence.json
python scripts/flare/build_flare_replay.py --check  # "reproduzível"
python -m unittest discover -s scripts/flare -p "test_*.py"
npm run typecheck; npm run build
```
