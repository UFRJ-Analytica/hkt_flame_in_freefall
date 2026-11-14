# SAFFIRE II · nove ensaios

No laboratório, selecione **SAFFIRE II** e escolha a amostra. Todos os casos
usam a mesma cena 3D, com uma placa visual de 29 × 40,6 cm e células de
10 × 20 mm. Os ensaios usaram amostras de 29 × 5 cm. A largura visual
extrapola o comportamento observado na amostra estreita. Cada uma das
21 faixas visuais do SIBAL usa a mesma taxa, com um sorteio próprio.

| Ensaio | Material | Visualização |
| --- | --- | --- |
| 2-1 a 2-3 | Silicone (PDMS) | Atividade localizada na borda a montante; sem propagação sustentada |
| 2-4 | Silicone (PDMS) | Atividade localizada na borda a jusante; sem propagação sustentada |
| 2-5 | SIBAL, 20 cm/s | Avanço a favor do fluxo, calibrado na S5C1: 44/96 (45,8%) por 2 s |
| 2-6 | SIBAL, 25 cm/s | Avanço a favor do fluxo, calibrado na S6C1: 41/78 (52,6%) por 2 s |
| 2-7 | PMMA + Nomex | Atividade na borda, com estado final de 5 cm de PMMA consumido; Nomex intacto |
| 2-8 e 2-9 | PMMA estruturado e plano | Atividade na borda durante a chama ancorada |

Os desfechos e condições usam a [tabela PSI-99](https://psi.nasa.gov/physci/repo/data/investigations/PSI-99) e a [apresentação da NASA](https://ntrs.nasa.gov/citations/20170008805).
Para 2-6, adota-se a velocidade de 25 cm/s na apresentação. A tabela bruta
registra 20 cm/s. A regressão de superfície do PMMA exige um modelo próprio.
Nos sete casos sem frente de pirólise rastreável, a placa marca a
luminosidade alaranjada observada na borda do quadro, inclusive a do ignitor.
A marca é esquemática e permanece até a próxima observação selecionada.
Não há estimativa para a probabilidade de avanço nesses casos. Para II-7,
a extensão final vem da tabela experimental e a primeira captura tardia sem
luminosidade marca a apresentação desse estado na cena.

## Dados e reprodução

Os 37 ZIPs de câmera e o documento de nomenclatura (930,5 MB) ficam no cache.
O manifesto guarda hashes, nomes, câmeras e intervalos de timestamps. A lista
completa vem do histórico de versões público do PSI-99. Os três arquivos
mapeados que aparecem com o nome S2C2 no catálogo trazem quadros S3C2. Para 2-2
usa-se a sequência original S2C2, que foi baixada e verificada separadamente.

Com NumPy, SciPy e Pillow, na raiz do projeto:

```powershell
python scripts/ingest_saffire_ii.py
python scripts/calibrate_saffire_ii5.py data/cache/saffire/psi-99 data/cache/saffire/psi-99/analysis-5
python scripts/calibrate_saffire_ii5.py data/cache/saffire/psi-99 data/cache/saffire/psi-99/analysis-6 --sample 6
python scripts/build_saffire_ii_replays.py public/data/saffire
python scripts/build_saffire_ii_board.py public/data/saffire
```

Use `--offline` na ingestão para verificar os arquivos já armazenados. Após
revisar a análise, copie os JSONs compactos `psi-99-ii5.json` e
`psi-99-ii6.json` para `public/data/saffire`. As cenas carregam somente os JSONs
de calibração e de observações. Os 80 JPEGs selecionados servem de evidência
e de entrada para reconstruir os estados de borda.

No II-6, a calibração selecionou 39 quadros entre 22 e 98 s, decodificando
273 dos 9.600 JPEGs da S6C1. A grade preserva 10 × 20 mm. Nos 30% reservados,
duas faixas ficaram continuamente observáveis: 2,43 mm/s nas imagens,
2,73 mm/s na média de 20 simulações e 10,7 mm de erro médio. A taxa publicada
é 2,6 mm/s. O [método do II-5](SAFFIRE_II_5.md) descreve o mesmo protocolo.
As duas simulações usam taxas longitudinais e semente fixa.
