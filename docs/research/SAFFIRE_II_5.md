# SAFFIRE II · 2-5

O modo **SAFFIRE II · 2-5 · Ignição na borda** usa a amostra de SIBAL de 29 × 5 cm, com avanço a favor da ventilação de 20 cm/s. Cada faixa começa com a primeira célula alcançada na borda a montante. A cada passo de 2 s, a frente avança 10 mm com probabilidade de 44/96 (45,8%). As três faixas recebem a mesma taxa, com sorteios próprios e semente fixa. Os vizinhos laterais e o contrafluxo ficam sem parâmetro nesta cena.

## Reproduzir o ajuste

Com NumPy, SciPy e Pillow instalados, passe a pasta que contém os dois ZIPs mapeados de S5C1 e um diretório para os resultados.

```powershell
python scripts/ingest_saffire_ii.py
python scripts/calibrate_saffire_ii5.py data/cache/saffire/psi-99 data/cache/saffire/psi-99/analysis-5
```

O comando produz `psi-99-ii5.json` para o frontend, `results.json` com os recortes e contagens por vizinhança e `review.jpg` com as sobreposições. Para publicar uma nova calibração, confira os resultados e copie o JSON compacto para `public/data/saffire`. O JSON inclui o SHA-256 de cada ZIP.

O script seleciona 47 quadros iluminados entre 22 e 114 s, lendo 329 candidatos dos 9.600 JPEGs. A validação começa aos 86 s. Na grade de 10 × 20 mm, uma das três faixas permaneceu observável durante toda a janela reservada. Nessa faixa, a velocidade da frente foi 2,05 mm/s nas imagens e 2,29 mm/s em média nas 20 simulações, com erro médio de posição de 10,0 mm. A referência publicada é 2,1 mm/s. A duração de 144 s na interface é um horizonte de reprodução ilustrativo e começa na borda, enquanto a validação parte da frente já observada.
