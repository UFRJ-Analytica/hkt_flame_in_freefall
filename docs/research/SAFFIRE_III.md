# SAFFIRE III · PSI-100

Os ensaios usam SIBAL (algodão com fibra de vidro) em uma placa de 940 × 406 mm. Para a comparação foi adotado o valor de 25 cm/s e 21,2% de O₂ do [artigo da equipe](https://doi.org/10.1016/j.combustflame.2018.10.012). O manifesto preserva os 30 cm/s e a espessura “.33 cm” da tabela original. A espessura não é usada na calibração.

Na raiz do repositório, com as mesmas dependências Python do SAFFIRE I:

```powershell
python scripts/ingest_saffire_iii.py
python scripts/calibrate_saffire_iii.py
node --test scripts/test_saffire_iii.mjs
```

A ingestão verifica tamanhos, CRC e SHA-256 dos dez ZIPs de JPEGs mapeados, registra timestamps e guarda a documentação e as duas planilhas de sensores em `data/cache/saffire/psi-100`. Use `--offline` para reconstruir o manifesto a partir do cache. Os sensores ficam disponíveis para conferência e as taxas de transição são ajustadas pelas imagens.

A análise usa a borda carbonizada sob LED verde. Em S1, as câmeras C1 e C2 são alinhadas pela moldura e conferidas na área em comum. Os timestamps mostram S2 antes de S1. A faixa escura deixada por S2 é excluída pelo recorte em S1C2. Em S2, C1 não mostra o avanço observado na C2. A análise de S2 usa C2 e registra um quadro iluminado anterior à ignição. Os quadros sobrepostos e as observações ficam em `data/cache/saffire/psi-100/analysis`.

A grade usa 10 × 20 mm e intervalos de 2 s. O ajuste e a validação separam 70% e 30% da janela observável. A comparação usa 20 sementes, com limite de 30 mm de erro médio de posição e 30% de erro relativo na velocidade média para habilitar o sentido correspondente. A inspeção visual foi feita sobre as sobreposições, sem anotações cegas. As regiões fora da faixa observada não fornecem evidência de generalização.

| Sentido | Modelo usado | Velocidade observada | Velocidade simulada | Erro médio |
| --- | --- | ---: | ---: | ---: |
| A favor · S1 | Frente contínua com ajuste por vizinhança | 2,43 mm/s | 2,19 mm/s | 14,8 mm |
| Contra · S2 | Frente contínua com ajuste por vizinhança | 1,05 mm/s | 0,76 mm/s | 7,0 mm |

Cada faixa pode avançar apenas na célula adjacente à sua frente. O simulador consulta os vizinhos laterais dessa célula para escolher a taxa conjunta. Quando a combinação tem menos de 30 exposições, usa a média longitudinal do ensaio. Em S2, foram 55/408 (13,48%) com apenas o vizinho a jusante e 85/441 (19,27%) ao agregar todas as configurações com esse vizinho. As combinações de S2 que incluem vizinhos laterais usam a média agregada. A ignição central e o avanço até as extremidades são extrapolações ilustrativas.
