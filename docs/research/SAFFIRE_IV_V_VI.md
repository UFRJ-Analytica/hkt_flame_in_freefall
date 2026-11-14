# SAFFIRE IV, V e VI no laboratório

No seletor **Modo do laboratório**, cada ensaio abre a placa de 50 × 40,6 cm com a primeira coluna acesa a montante e a seta de ventilação. A grade tem células de 10 × 20 mm, com a última faixa transversal recortada a 6 mm. O VI-2 conserva a largura publicada aproximada de 40 cm no cadastro.

| Ensaio | Material | O₂ | Pressão | Velocidade de referência | Avanço por 2 s | Horizonte |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| IV-1 | SIBAL | 23,1% | 99 kPa | 3,6 mm/s | 72% | 138 s |
| V-2 | Algodão jersey | 26,9% | 76 kPa | 3,4 mm/s | 68% | 146 s |
| VI-2 | SIBAL | 31,0% | 54,1 kPa | 4,05 mm/s | 81% | 122 s |

Todos têm fluxo nominal de 20 cm/s e avanço concorrente. Para IV e V, as condições vêm da Tabela 1 do estudo de propagação em tecidos. Para VI, vêm da Tabela 1 do relatório preliminar e a taxa vem do estudo comparativo de calor e fumaça. A cronologia do VI confirma o sentido a favor do fluxo para o Evento 5. Os JSONs preservam as condições alternativas e identificadores de cada fonte. [Estudo de propagação](https://doi.org/10.1016/j.combustflame.2022.112559) · [Relatório preliminar VI](https://ntrs.nasa.gov/citations/20240002981) · [Estudo comparativo](https://www.researchgate.net/publication/410245330_Heat_and_Smoke_Emission_from_Tests_on_the_SAFFIRE_IV-VI_Experiments) · [Cronologia VI](https://ntrs.nasa.gov/citations/20250002675)

Cada faixa sorteia simultaneamente o avanço da primeira célula intacta. Com velocidade publicada \(v\), a probabilidade \(p=v\Delta t/\Delta x\) dá deslocamento esperado de \(p\Delta x\) por passo, até a borda. O horizonte arredonda para cima a travessia esperada de 49 células após a primeira coluna. Algumas faixas podem terminar antes e outras ainda estar a caminho da borda quando o horizonte termina. A semente 1951 permite repetir a reprodução. A rugosidade entre faixas vem do modelo e os efeitos lateral e contra o fluxo continuam sem estimativa.

## Checagens

| Ensaio | Série experimental | Janela | Inclinação observada | Inclinação simulada | Erro médio de posição |
| --- | --- | ---: | ---: | ---: | ---: |
| IV-1 | Base da chama em quadros escuros | 32–110 s | 3,66 mm/s | 3,62 mm/s | 3,8 mm |
| V-2 | Base da chama em quadros escuros | 32–92 s | 3,35 mm/s | 3,41 mm/s | 3,7 mm |
| VI-2 | Trajetória experimental indisponível | — | — | 4,06 mm/s | — |

O raster da página 15, a 180 dpi, fornece a posição da série laranja da base da chama pelo eixo esquerdo a cada 6 s. Os artefatos guardam os pontos, a referência, o hash do manuscrito e a calibração dos eixos em pixels. A escala é de cerca de 2 mm por pixel. O V-2 fica abaixo de 100 s e 300 mm para evitar a fase em que o algodão encolhe e enrola. [Figura 8 do manuscrito aceito](https://discovery.ucl.ac.uk/id/eprint/10164340/1/SIBAL-cotton%20revised%20Sept%20per%20review%20track%20changes%20accepted.pdf)

A checagem de IV e V alinha a posição inicial da grade ao primeiro ponto digitalizado, arredonda para a célula mais próxima e aplica o deslocamento subcélula constante às posições comparadas. A média de 20 sementes usa a posição média das 21 faixas em cada tempo amostrado. As inclinações são de regressões lineares e o erro médio absoluto exclui o ponto inicial. Como o artigo calculou a velocidade a partir da base da chama e a checagem usa a mesma série do mesmo ensaio, esses erros medem consistência com a curva publicada. Para VI-2, a checagem numérica de velocidade usa 20 sementes por 100 s em uma placa de teste de 1 m, antes de saturação na borda.

Os clipes públicos são referências visuais. Para recalibrar pelos quadros será preciso vincular a sequência ao ensaio, verificar escala e timestamps, rastrear a frente e separar ajuste e checagem no tempo. As taxas publicadas poderão então servir de referência. [Clipe e relato IV](https://www.nasa.gov/humans-in-space/the-flame-of-discovery-grows-as-saffire-sets-new-fires-in-space/) · [Relato VI](https://www.nasa.gov/centers-and-facilities/glenn/flame-burns-out-on-nasas-long-running-spacecraft-fire-experiment/)

## Dados e reprodução

Os demais ensaios estão cadastrados como evidência nos respectivos JSONs sob `relatedEvidence`. V-4 registra o contrafluxo nas nervuras de PMMA, incluindo a taxa máxima de 0,88 mm/s observada numa nervura de 1 mm e a redução de 20 para 5 cm/s após 360 s. Uma simulação futura desse caso precisa representar as nervuras e as fases de fluxo individualmente. [Estudo do V-4](https://ntrs.nasa.gov/citations/20210017785)

Os três JSONs em `public/data/saffire/` também são a origem dos dados exportados pelo laboratório. Para regerar os artefatos e verificar o motor com Node.js 22.12 ou mais recente:

```sh
node scripts/build_saffire_published.mjs
node --test scripts/test_saffire_published.mjs
```
