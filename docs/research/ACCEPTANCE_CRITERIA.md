# Critérios de aceitação científica e contrato de dados

## Escopo e verificações

Critérios para registro, observáveis, uso condicionado e exportação. São requisitos do produto, não uma certificação de segurança. `scripts/test_acceptance_data.py` verifica apenas as partes expressas nos dados; não testa frontend, exportação da interface, pixels originais ou transferência física. Os scripts protegidos do colega e `src/` não são alterados nesta entrega.

## A. Registro de ensaios

- `public/data/saffire/trial-registry.json` usa exatamente `schemaVersion: 1`, `generatedBy: scripts/build_trial_registry.py` e a lista `trials` definida no contrato do frontend.
- Nove IDs únicos: SAFFIRE-I-S1, SAFFIRE-I-S2, SAFFIRE-II-5, SAFFIRE-II-6, SAFFIRE-III-S1, SAFFIRE-III-S2, SAFFIRE-IV-1, SAFFIRE-V-2, SAFFIRE-VI-2. IDs não dependem da ordem das listas de origem.
- Toda condição não nula, incluindo direção e gravidade, deve ter entrada própria em `conditionSources`. Não reutilizar uma fonte que não contenha o campo. Cada número vem do artefato indicado ou da fonte primária especificada; transformação ou conflito fica explícito.
- Pressão ausente não vira 101,3 kPa. Faixa de O2 não vira ponto médio. Unidade ambígua não é reparada silenciosamente. Não herdar espessura de outro ensaio por igualdade do nome do tecido.
- `model.artifactSha256` deve corresponder aos bytes atuais do arquivo. Reconstruir o registro após atualizar qualquer modelo. JSON inválido, valor não finito, kind desconhecido, ID duplicado, fonte de condição removida ou hash divergente deve falhar antes de publicação.
- O registro reconstruído deve ser idêntico ao publicado, sem timestamp variável. Hash comprova identidade de bytes, não validade científica.

### Conferência das fontes

VI-2: a Tabela 1 da página impressa 3 de ICES-2024-365 foi conferida visualmente no navegador em 14/11/2026: SIBAL, 50 cm de comprimento, escoamento concorrente 20 cm/s, 54,1 kPa e 31,0 mol% O2. O documento descreve Cygnus orbital, não gravidade lunar. Fonte: https://ntrs.nasa.gov/api/citations/20240002981/downloads/Saffire-ICES-2024-ICES-365-accepted%20final.pdf

IV-1 e V-2 mantêm as condições adotadas nos artefatos e no artigo de propagação citado pelo colega, Tabela 1 e Figura 8: DOI 10.1016/j.combustflame.2022.112559. As curvas digitalizadas remetem à Figura 8, p15 do manuscrito aceito: https://discovery.ucl.ac.uk/id/eprint/10164340/1/SIBAL-cotton%20revised%20Sept%20per%20review%20track%20changes%20accepted.pdf . Condições alternativas no ICES-2024-365 ficam em `conflicts`, sem média. O registro não afirma ter resolvido diferenças de condição inicial, instante ou versão de publicação.

III preserva 30 cm/s na tabela PSI versus 25 cm/s e 21,2% O2 adotados no artigo da equipe, DOI 10.1016/j.combustflame.2018.10.012. A fonte de cada valor continua explícita. II-6 preserva 25 cm/s no artefato versus 20 cm/s na curadoria PSI-99; não há resolução artificial desse conflito.

## B. Observado, simulado no ensaio e extrapolado

O frontend e a exportação devem usar o mesmo modo científico, não só cores diferentes:

1. **Observado/reconstruído:** série de câmera/sensor ou curva digitalizada, com arquivo, versão, escala, relógio, janela, definição do alvo e método. Digitalização de figura é dado derivado, não série bruta nem nova repetição experimental.
2. **Simulação nas condições do ensaio:** execução de um modelo explicitamente identificado, condicionada à ignição/frente inicial e às hipóteses do próprio ensaio. Deve exibir o observável e a avaliação correspondente à versão executada.
3. **Extrapolação/exploratório:** alteração de material, espessura, geometria física, interface, atmosfera, gravidade ou regime sem validação apropriada. O resultado pode ser exibido como cenário de hipótese opt-in, mas não receber rótulo de previsão validada, risco físico absoluto ou garantia de barreira segura.
4. **Indisponível:** faltam dados ou modelo para a saída solicitada. Não calcular zero nem transformar desconhecido em seguro.

`char-front` representa a frente de contraste/carbonização do pipeline, ainda sujeita a revisão física; não equivale automaticamente à base da chama. `flame-base` identifica essa base. `published-rate` mantém uma taxa publicada cuja equivalência ao detector de carbonização não foi estabelecida. Não combinar esses alvos para ajustar um único efeito de ventilação sem um modelo explícito da diferença observacional.

Uma linha/curva experimental não pode ser sobreposta a um foco central em duas direções como se fosse observação dessa condição. Quando condição inicial, recorte ou origem temporal diferirem, mostrar o deslocamento e a comparação adequada ou suprimir a sobreposição.

## C. Quando o habitat pode chamar algo de condicionado ao ensaio

A etiqueta se aplica ao **modelo e observável do ensaio**, não a todo o habitat. Requisitos cumulativos:

- Mesma identidade experimental, material/composição, espessura, geometria física, faces expostas, suporte, sentido do escoamento, modalidade de ignição e alvo; ou uma transferência explicitamente validada. Uma textura sobre uma parede curva não estabelece equivalência de perdas, confinamento, convecção ou interfaces.
- O2, pressão e velocidade mantêm o valor nominal ou a faixa realmente documentada para o ensaio e o intervalo pertinente. Fonte sem incerteza não permite inventar uma tolerância física. Igualdade numérica serve para correspondência de metadados, não prova de equivalência experimental exata.
- A faixa 21,5–21,7% de O2 de I-S1 é a faixa reportada do ensaio, não IC nem autorização de extrapolação conjunta. VI-2 fornece 31,0% O2, 54,1 kPa e 20 cm/s nominais, mas não define tolerâncias universais ao redor desses pontos. Não aprovar automaticamente ±1,5 cm/s, 95–105 kPa ou qualquer outra faixa escolhida pela interface.
- Material categórico deve corresponder ao corpo de prova e estado físico, não apenas ao nome comercial. Desfecho de não ignição não vira barreira incombustível sob exposição arbitrária.
- Gravidade é microgravidade nesses ensaios. A gravidade lunar de um módulo de superfície difere do domínio medido: exige tratamento como extrapolação, mesmo com atmosfera semelhante. Não há tolerância que transforme 1/6 g em microgravidade.
- Campo físico necessário não tabulado permanece desconhecido. Pode-se mostrar a simulação empírica daquele ensaio com a lacuna visível; não afirmar que uma nova condição de habitat é equivalente a esse campo desconhecido.
- A avaliação corresponde ao modelo executado. Ajustar `speedMatch` à velocidade de um trecho anteriormente reservado consome essa informação de ajuste. A comparação retrospectiva do kernel anterior não é teste final intocado do kernel reajustado. Os gates devem controlar cálculo, rótulos e exportação, não apenas um painel paralelo.

A auditoria histórica T4-current foi realizada no pin 72c3bb3; o pin de implementação d47b2ba já altera caminhos e a referência de fluxo III. Os achados devem ser rastreados aos arquivos atuais; não transpor valores antigos como se fossem atuais. No código atual, `src/habitat/habitatModel.ts` continua usando correção de intensidade por fluxo e `speedMatch`, não resolve correções físicas de pressão/gravidade.

Base física: ICES-2025-392, pp6–11, compara ensaios terrestres forçados com gravidade parcial simulada em centrífuga. A conclusão p11 distingue respostas por material e o texto p10 deixa a velocidade lunar relevante não determinada. Não existe multiplicador universal de gravidade validado para os materiais do habitat. Fonte: https://ntrs.nasa.gov/api/citations/20250002114/downloads/ICES_2025-392-correctedcaptions.pdf

### Critério de qualidade preditiva

Declarar antes do ajuste qual decisão depende de posição/tempo/velocidade, a tolerância correspondente e o erro de observação em mm e s. Validar em grupos por amostra/ensaio e congelar registro, recorte e estimador antes do teste. Se faltarem réplicas ou uma tolerância ligada à decisão, o status é exploratório; não escolher 30% por conveniência para aprovar o modelo. Comparar baseline de frente/chegada, erro absoluto e relativo, forma, censura e estabilidade a janelas/FPS/escala. Sementes não são ensaios e sua dispersão não representa toda a incerteza. Revisão S2 específica: `S2_REVIEW.md`.

## D. Exportação reprodutível do cenário

A implementação do frontend é responsabilidade do outro agente; este documento não declara a exportação já implementada. Aceitar somente quando o export contiver:

- schemaVersion da exportação, ID do cenário e versão/commit do código;
- snapshot ou hash do registro, trial IDs e cada modelo/artefato efetivamente carregado com SHA-256;
- modo científico, observável, unidade, janela e origem temporal; dados observados separados de sorteios;
- condições solicitadas, condições do ensaio, unknowns, fontes, conflitos e resultado do gate com razões;
- geometria métrica da superfície, espessuras conhecidas, materiais, zonas, conectividade, interfaces e foco/frente inicial;
- algoritmo/versão, passo temporal, horizonte, seeds completas, gerador aleatório, kernels, fatores e fallbacks efetivamente usados;
- distinção de incerteza observacional, parâmetros, entre ensaios e dispersão de sementes; ausências explicitadas;
- arquivos mínimos ou fingerprints para reconstrução offline, sem segredos, credenciais ou URLs temporariamente assinadas.

Teste de aceitação da futura integração: exportar, reimportar e obter o mesmo estado/campo de chegada e os mesmos rótulos para as mesmas sementes e bytes. Alterar um hash ou remover uma dependência deve recusar reprodução exata, não usar silenciosamente outro kernel. Se perder III, não rotular como III uma execução de I. O teste de dados nesta branch não substitui esse teste ponta a ponta.

## Comandos de verificação

No diretório scripts, com o Python existente do projeto:

    ..\.venv\Scripts\python.exe -m unittest test_trial_registry test_acceptance_data test_crosstrial_saffire test_modeling_targets test_saffire test_sync_nasa

Na raiz:

    node --test scripts/test_saffire_*.mjs
    .venv\Scripts\python.exe scripts/build_trial_registry.py

O worktree isolado reutiliza o interpretador absoluto da pasta original; não instala outra venv. ZIPs, frames e verificações transitórias permanecem ignorados em data/cache/ ou .scratch/.

## Estado

Tarefa 1: registro publicado; frontend consome public/data/saffire/trial-registry.json, preservando fontes, conflitos e nulls.
Tarefa 2: S2_REVIEW.md publicado; quantização e ausência de pixels/ignitor impedem aprovação física das taxas S2.
Tarefa 3: execução real e JSON aditivo concluídos; campos observations, timeSensitivity e provenance.frameAudit documentados em CROSSTRIAL_PROVENANCE.md.
Tarefa 4: critérios e testes de dados entregues; gate/exportação do frontend ainda exigem integração e teste ponta a ponta.
Não verificado: transferência lunar, incerteza total, teste externo congelado, segurança de interfaces ou certificação.
