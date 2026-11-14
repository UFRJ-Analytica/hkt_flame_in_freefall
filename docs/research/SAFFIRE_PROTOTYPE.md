# SAFFIRE I · S1 no laboratório

O modo de ensaio no HabitatFire mostra uma simulação estocástica da frente de pirólise de uma folha SIBAL, com as condições registradas para `PSI-98:t0:r2`. O passo carrega uma probabilidade ajustada às imagens do ensaio. A validação separa um trecho posterior do mesmo ensaio. O modelo cobre avanço ao longo do fluxo.

## Reprocessar

Com Python 3.11 ou mais recente, instale NumPy, Pillow e SciPy. Na raiz do projeto:

```powershell
python scripts/ingest_saffire.py --experiment PSI-98:t0:r2
python scripts/calibrate_saffire.py --experiment PSI-98:t0:r2
python scripts/calibrate_saffire_neighbors.py
npm run dev
```

Em **Modo do laboratório**, selecione **SAFFIRE I · S1**. O JSON derivado é servido com a aplicação e a reprodução funciona sem acesso ao PSI. Se o resultado for indisponível, a interface mostra o diagnóstico.

O comando de ingestão usa o inventário PSI já sincronizado no projeto. Pressupõe cerca de 1 GB livre para os ZIPs e documentos. Use `--import-dir <pasta>` para aproveitar cópias locais e `--offline` para reconstruir a partir do cache. Arquivos parciais ficam em `.part` e são retomados quando o servidor aceita requisições de intervalo. O manifesto em `data/saffire/psi-98-s1` guarda hash, versão, URL estável, inventário de cada parte e ID do catálogo. Os ZIPs e as sobreposições de conferência ficam em `data/cache/saffire/psi-98-s1`. As partes 2 e 3 de S1C2 têm a mesma sequência. A extração conta cada timestamp apenas uma vez e verifica o CRC quando há duplicatas.

O PDF complementar de tamanho e offsets de imagem retorna HTTP 404 pelo PSI. A documentação de nomenclatura, o desenho de posição dos termopares e a telemetria de S1 estão no cache. O registro usa os JPEGs já mapeados e as dimensões publicadas.

## Registro e análise

O registro manual usa bordas visíveis da moldura, a largura publicada e o sentido de avanço visível nas duas câmeras. A transformação é aproximada e as faixas externas e áreas ocluídas das imagens são excluídas. Na janela anotada, amostras são tomadas a cada 2 s em instantes iluminados, conferindo os timestamps das duas câmeras. A fronteira é segmentada pelo contraste do canal verde. Os pontos anotados no arquivo de registro e as medidas da região em comum conferem a detecção e a junção. O diretório de diagnóstico registra cada observação, posição física, par de timestamps e sobreposições de conferência.

As células têm 10 mm no fluxo e 20 mm na transversal, com a última faixa recortada na borda. A unidade de análise é uma célula intacta imediatamente adjacente à frente na direção do fluxo. A frequência de avanço em 2 s vem de pares de observações válidas. Saltos, lacunas e recuos observados são registrados. A comparação temporal começa da frente observada no começo dos 30% reservados, usa a mesma regra do frontend e publica erro de posição e velocidade em unidades físicas. A duração no laboratório começa no início da janela analisada, já com a frente presente.

O resultado incluído no projeto usou 352 s, com 98,1% de cobertura de linhas e instantes após filtragem. Foram 876 transições em 2.466 exposições no ajuste, o que dá 35,5% por passo. No trecho reservado, o erro absoluto médio foi 17,4 mm e as velocidades foram 1,95 mm/s nas imagens e 1,84 mm/s na realização simulada. O erro médio nos 19 pontos anotados detectados foi 8,75 mm. A diferença mediana em 555 pares de medidas no campo comum foi 3,57 mm. Essas checagens compartilham o mesmo aparato e ensaio.

## Modelo por vizinhança

O laboratório usa agora `psi-98-s1-neighbors.json`, gerado a partir das observações da frente e do modelo longitudinal original, que continua disponível em `psi-98-s1.json`. A grade 2D é reconstruída preenchendo, para cada faixa observada, todas as células anteriores à frente. As três posições consultadas são montante, acima e abaixo. Uma sequência como `101` significa montante e abaixo alcançados, acima intacto. Bordas externas contam como ausência de vizinho; estados desconhecidos são censurados. Exposições com nenhum vizinho ativo não representam oportunidade de propagação no modelo.

O ajuste usa 70% dos instantes e exige 30 exposições para publicar cada probabilidade. Menos de 100 exposições aparece como amostra pequena na interface. As condições 001 e 010 tiveram respectivamente 1 avanço em 160 exposições e 2 em 281. São contagens de células reconstruídas a partir de posições de frente, não evidência de causalidade lateral isolada. A condição 011 não teve exposições e sua transição fica suspensa. Saltos e oclusões podem afetar a reconstrução. O script gera três imagens em `analysis/lateral-*.jpg` com os pontos estimados em faixas vizinhas, para revisão.

No trecho reservado, 20 sementes deram erro médio de posição de 14,1 mm para o modelo de vizinhança e 19,9 mm para o anterior. O erro médio da forma centrada da frente foi 13,3 mm e 18,5 mm, respectivamente. A velocidade média simulada foi 1,85 e 1,73 mm/s, contra 1,95 mm/s observado. Esses números são uma avaliação temporal no mesmo ensaio, dependem do registro aproximado e não estabelecem transferência para outro material, orientação ou geometria. Na simulação, posições de frente usam a célula alcançada mais distante de cada faixa, inclusive quando houver células isoladas. O artefato também registra a quantidade e a fração de transições suspensas nas 20 realizações.

Para incluir outro ensaio, acrescente uma configuração com o ID do catálogo, as fontes, os arquivos e o registro e as anotações de suas câmeras. A heurística do canal verde depende do regime de iluminação e do material. O manifesto e o resultado versionado são as interfaces para uma futura seleção de evidências. A tabela do PSI e os arquivos de mídia originais permanecem rastreáveis.

## Verificação

### Frente contínua na cena central

O simulador atual avança na primeira célula intacta da faixa em cada sentido. Os estados dos vizinhos laterais selecionam a taxa conjunta quando a combinação tem pelo menos 30 exposições. Para combinações sem estimativa, aplica-se a média longitudinal da mesma direção. Essa regra mantém a região alcançada contínua em cada faixa.

O S2 usa a câmera S2C2 com a região previamente alterada censurada. O ajuste contra o fluxo usa 29 avanços em 96 exposições com vizinho a jusante (30,2% por passo). Os casos com vizinhos laterais ativos ficaram abaixo do mínimo. A checagem temporal usa 12 faixas com observações disponíveis ao longo de todo o trecho reservado. Em 20 sementes, a velocidade média simulada foi 1,49 mm/s, comparada a 2,00 mm/s nas observações, com erro médio de posição de 3,7 mm. A revisão visual foi feita nas sobreposições do detector. Para S1, a frente contínua teve erro médio de 14,5 mm e velocidade de 1,84 mm/s, comparada a 1,95 mm/s observados. A ignição central combina esses ajustes em uma cena ilustrativa.

```powershell
python -m unittest discover -s scripts
npm run build
```
