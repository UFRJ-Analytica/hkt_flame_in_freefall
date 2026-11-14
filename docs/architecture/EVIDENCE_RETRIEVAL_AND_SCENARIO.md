# HabitatFire — busca de evidências e cenários 3D

**Estado:** arquitetura proposta; RAG, embeddings e previsão calibrada ainda não implementados. Esta atualização é documental, sem instalação, chamadas pagas, criação de serviços ou alteração da aplicação.

**Autoridade:** complementa PROJECT.md v1.4 e TECHNICAL_FOUNDATIONS.md. Este documento e as prioridades atuais do PROJECT.md prevalecem sobre os exemplos históricos de backend, agentes e monorepo da v1.3. O inventário efetivamente recuperado está em ../research/DATA_CONNECTION.md.

## 1. Decisão de produto

Manter a interface 3D como parte central da experiência. Ela fornece contexto espacial para perguntas reais de segurança, não apenas uma apresentação visual. A descoberta e interpretação com SI cumprem o núcleo do desafio; o cenário de fogo representativo torna essa evidência explorável sem fingir uma certificação de cabine.

O vídeo oficial pede encontrar investigações relevantes, extrair dados úteis à modelagem e destacar pesquisa para controles/equipamentos de segurança; a extensão terrestre aparece como complemento. A exploração lunar é uma motivação explícita, não um tema a descartar por falta de um preditor lunar.[1][2]

Jornada proposta:

1. Selecionar módulo, superfície/estrutura e material na cena.
2. Informar pergunta ou escolher intenção: prevenção/inflamabilidade, detecção, supressão, pós-incêndio ou aplicação terrestre.
3. Recuperar investigações e registros com justificativas, diferenças de condições e lacunas.
4. Inspecionar achados científicos, tabela original e documentos/imagens/vídeos associados.
5. Explorar um cenário com nível de fidelidade visível; aplicar somente condições de fato disponíveis.
6. Exportar fontes, observações, hipóteses e dados comparáveis para trabalho posterior.

O primeiro caminho deve ser pequeno e utilizável de ponta a ponta. Não exige quatro agentes, um serviço vetorial remoto, migração do frontend ou um simulador geral.

## 2. Formatos reais e tratamento recomendado

Inventário da integração existente, conforme DATA_CONNECTION.md: 24 metadados JSON, 22 CSVs de 20 investigações/projetos, quatro projetos somente com metadados e 2.001 registros tabulares. São registros de grãos diferentes, não 2.001 ensaios independentes. Nesta atualização não foi feita uma nova sincronização ou recontagem do snapshot.

| Material | O que temos ou encontramos | Tratamento |
| --- | --- | --- |
| Metadados PSI JSON | Originais em data/raw/psi/<accession>/metadata.json | Identidade, descrição, objetivos, vínculos e inventário; preservar original e ressalvas de metadados |
| Tabelas CSV | Originais e manifestos por investigação em data/raw/psi/ | Lookup estruturado de medidas/condições, com grão e unidades; manter valores brutos |
| Snapshot JSON | public/data/nasa-experiments.json, consumido pela UI | Camada normalizada de leitura; null continua desconhecido; vínculo para arquivo/registro |
| Proveniência JSON | public/data/nasa-provenance.json e manifestos locais | Origem, horário, hashes e artefatos; não gravar URLs S3 assinadas temporárias |
| PDFs e ReadMes | Relatórios, guia, publicações e documentação experimental | Corpus textual selecionado a ingerir; não presumir que já estão no catálogo da aplicação |
| Imagens e vídeos | Referências e exemplos mostrados nos recursos oficiais | Inicialmente links/captions com relação ao ensaio verificada; não presumir download/indexação multimodal |
| Séries temporais/dados derivados | Apenas se encontrados e efetivamente recuperados | Exigir esquema, unidade, método e eixo temporal antes de replay ou calibração |

O vídeo orienta consultar documentação e pastas por amostra, além de artigos com DOI; o texto integral nem sempre está disponível. A página Glenn e suas fichas explicam famílias e mecanismos, mas não substituem medições por ensaio.[2][3]

O guia de combustão é edição de 2015. Spinoffs e incidentes históricos dão contexto; não são automaticamente requisitos operacionais atuais nem observações para treino.[4][5][9]

## 3. Três índices lógicos ligados por IDs

### 3.1 Descoberta de investigações

Uma representação por investigação com accession, título, objetivos, abordagem, família/fase, material quando conhecido, plataforma, tópicos de segurança, natureza medida/computacional e links. Pode gerar uma descrição curta e fiel para embedding, mas sem ampliar fatos além da fonte.

### 3.2 Registros e condições experimentais

Uma camada estruturada com record ID, investigation ID, grão da tabela, arquivo, linha lógica e campos normalizados com unidades/proveniência. Consultas numéricas e contagens usam essa camada, não a memória do LLM nem a distância vetorial.

Não interpretar cada linha como ensaio: há resumos de sessões, listas de condições/faixas e referências. BRE é Burning Rate Emulator com resumos de ignições em queimador; não é uma tabela de atraso de ignição de materiais sólidos. BASS-II não oferece velocidade calibrada nas colunas de display, e FLEX não recebe um rótulo binário universal a partir de Test end. Ver DATA_CONNECTION.md.

### 3.3 Trechos científicos e documentação

Chunks por seção de ReadMes/PDFs/HTML recuperados, ligados à investigação quando o vínculo for sustentado. Cada trecho mantém source ID, URL estável/DOI, hash, título, data/revisão quando conhecida, página/seção/figura, tipo de evidência e idioma. Uma observação ligada a uma amostra precisa de seu record ID; menção genérica a BASS não autoriza associação com qualquer teste BASS-II.

Não misturar um resumo computacional, uma regra de qualificação terrestre, um ensaio em microgravidade e um artigo Spinoff como se fossem medições equivalentes.

## 4. Contexto de busca vindo da intenção e da cena

Contrato lógico proposto — não um novo tipo já presente no código:

- question e intent;
- módulo e mission context;
- selected surface ID, structure kind, assigned material e origem da atribuição;
- sample geometry/thickness/scale quando realmente conhecidos;
- oxigênio %, pressão kPa, diluente, magnitude/direção do fluxo e gravidade, com origem de cada campo;
- restrições explícitas do usuário;
- IDs de registros já selecionados;
- versão/revisão do contexto da UI e do corpus.

Usar kPa no contrato proposto preserva a convenção atual de ExperimentTest.pressureKpa. Não introduzir psi silenciosamente porque exemplos antigos usavam pressure_psi. Serializar unidades explicitamente; um campo atual de atmosphere.pressure exige a anotação de unidade no contrato futuro.

Os tipos hoje implementados estão em src/types.ts e não contêm todos esses metadados. A expansão é uma tarefa futura, não algo inferido pela documentação.

Regras:

1. Orion/ISS identifica o espaço de interação, não o local de um experimento recuperado. Um estudo em Cygnus pode ser pertinente a uma pergunta feita sobre uma cabine Orion, sem virar um teste da Orion.
2. PMMA/Nomex/Kapton atribuídos na cena são escolhas do cenário, não prova de um inventário oficial de materiais do veículo.
3. Uma pergunta de detecção em um cabo não deve retornar apenas artigos com o nome do polímero; pesquisas de aerossóis/detectores podem ser mais úteis que estudos de propagação.
4. Se o texto propõe mudar material/atmosfera, distinguir pergunta contrafactual de alteração da cena; apresentar um diff e pedir confirmação antes de aplicar. A camada de interpretação não altera o cenário silenciosamente.
5. Se a superfície tem forma de painel, um ensaio em haste do mesmo polímero pode ser um análogo útil, mas não um parâmetro calibrado para o painel.

## 5. Recuperação híbrida proposta

### A. Entender a pergunta

Regras simples e, quando necessário, saída estruturada de um LLM identificam a intenção e entidades. Resolver aliases de materiais/acrônimos preservando accession IDs. Manter pergunta original; uma expansão inglesa deve ser auxiliar e rastreável, nunca substituir restrições/unidades silenciosamente.

### B. Recuperar candidatos em paralelo

- Busca exata/lexical para PSI-25, BASS-II, PMMA, Kapton e nomes técnicos.
- Embeddings multilíngues para conceitos e consultas em português sobre fontes majoritariamente inglesas.
- Lookup estruturado para filtrar/comparar condições e reunir registros relacionados.

Busca semântica encontra textos por similaridade de representação; o modelo deve ser apropriado para pergunta curta versus passagem científica, não escolhido só por um benchmark genérico.[16]

### C. Combinar e agrupar

Combinar rankings lexical e semântico por RRF como baseline, sem somar diretamente scores BM25 e cosseno de escalas diferentes. Agrupar por investigation ID e limitar redundância de trechos para que uma publicação longa não ocupe toda a tela. A documentação Qdrant descreve fusão e consultas em múltiplos estágios; o mesmo desenho lógico não exige esse servidor na primeira entrega.[15]

Usar compatibilidade experimental e qualidade/proveniência para justificar pertinência. Não priorizar automaticamente um documento só por ser recente: uma observação antiga compatível pode ser mais útil que uma página recente sobre um projeto ainda sem dados disponíveis.

### D. Aplicar restrições sem esconder lacunas

Hard filters: accession explicitamente pedido, escopo do desafio e incompatibilidades conhecidas relevantes ao objetivo. A granularidade deve ser contextual: gases podem ser inadequados para calibrar propagação de sólido, mas relevantes como fundamentos de combustão ou agentes supressores.

Soft applicability: proximidade em condições conhecidas, material, geometria, plataforma e intenção. Pressão/fluxo ausente é desconhecido: não substituir por zero, não declarar compatível e não eliminar todo o resultado por defeito. Quando uma busca estrita não encontra nada, oferecer ampliar para análogos sem abandonar a restrição em silêncio.

Mostrar categorias: evidência diretamente comparável; análogo com diferenças; fundamento/contexto; pesquisa relacionada sem medições recuperadas.

### E. Sintetizar com evidências

Um único fluxo de síntese basta inicialmente. O LLM recebe a pergunta, o contexto e o evidence bundle; não recebe autoridade para criar medidas ou parâmetros de fogo. Cada achado aponta a um source ID e página/seção/registro. Tratar documentos recuperados como dados, nunca como instruções para ferramentas ou mudança de regras.

Sem evidência adequada, responder o que falta e oferecer investigações relacionadas. Score de recuperação não é probabilidade de queima, confiança científica, elegibilidade para simular ou certificação de segurança.

## 6. Embeddings: baseline pequeno e substituível

Candidato inicial: intfloat/multilingual-e5-base, pré-treinado, sem fine-tuning obrigatório. A ficha informa embeddings de 768 dimensões, prefixos query:/passage: inclusive em outros idiomas e truncamento em 512 tokens.[17]

Se esse candidato for usado:

- Fazer chunking com o tokenizer do modelo, incluindo título/contexto dentro do limite; não reutilizar automaticamente janelas antigas de 800 tokens.
- Preservar títulos, legenda/unidade e notas em tabelas; não separar números de seu significado.
- Versionar modelo/revisão, dimensão, normalização, chunker e hash do texto-fonte; reindexar ao mudar qualquer contrato de representação.
- Validar perguntas PT → fonte EN em um pequeno conjunto real, sem prometer que suporte multilíngue garante qualidade no nosso domínio.
- Cachear embeddings de documentos e, se útil, de consultas por versão; não treinar embeddings próprios no hackathon.

A primeira implementação pode persistir texto/metadados/vetores localmente e fazer busca exata em processo, mais um índice lexical. A documentação Sentence Transformers apresenta busca exata para corpora pequenos; escolher a escala pela quantidade efetiva de chunks, não pelo volume total do acervo PSI.[16]

Qdrant permanece uma opção se filtragem/persistência e integração justificarem seu custo operacional. Não é obrigatório nem foi instalado. Reranker é uma melhoria posterior para falhas observadas, não mais um serviço antes da primeira jornada funcionar.

O modelo é candidato, não vencedor avaliado. Hardware, latência, provedor LLM, hospedagem e orçamento não foram medidos/selecionados nesta decisão. Não provisionar nem fazer chamadas pagas automaticamente.

## 7. Contrato lógico do evidence bundle

- Identificador da busca, hash/revisão do contexto e versão do corpus.
- Intenção e entidades/restrições interpretadas, incluindo quais vieram do usuário/cena.
- Investigações ranqueadas com razões de relevância e natureza da evidência.
- Record IDs e condições observadas, com unidade, arquivo e linha lógica.
- Achados com citações e escopo experimental.
- Diferenças, incompatibilidades e campos desconhecidos.
- Dados disponíveis para modelagem, com alvo/unidade quando explícitos.
- Relação com prevenção/detecção/supressão/equipamentos, pós-incêndio e aplicação terrestre quando sustentada.
- Disponibilidade de mídia/replay efetivamente recuperado.
- Elegibilidade por capacidade de visualização/previsão, decidida por regras verificáveis.

Não incluir probabilidades de incêndio, tempos de alarme ou eficácia de extinção como consequência de um score de similaridade. Esses campos devem estar ausentes/nulos com motivo quando não sustentados.

## 8. A simulação continua — com três modos distintos

### Modo A: cenário ilustrativo informado por evidências

É a continuação natural do 3D atual. Estrutura selecionada define local e contexto espacial; material, atmosfera e fluxo podem alterar aspectos qualitativos apenas por regras divulgadas. A evidência recuperada explica mecanismos e condições relevantes, mas não transforma o comportamento procedural em resultado medido.

A cena pode mostrar chama/partículas, camadas e uma evolução representativa. Se o movimento temporal for arbitrário, usar progresso de animação/tempo ilustrativo, não tempo físico de detecção ou consumo. Se uma propagação entre superfícies for heurística, identificá-la como hipótese visual, não como trajetória NASA.

Cada regra visual futura deve registrar seu mecanismo/fonte, domínio pretendido, parâmetros assumidos e limites. No estado atual, não alegar que todas as regras procedurais já possuem essa fundamentação. Material sem evidência permite visual genérico identificado como tal, não uma assinatura específica inventada.

Label: “Cenário ilustrativo — hipóteses visuais, não previsão validada”.

### Modo B: reprodução experimental

Mostrar uma sequência/curva/vídeo medido de uma amostra identificada, com condições, dimensões e eixo temporal reais. É uma observação experimental, não uma previsão sobre a cabine.

Sem dados temporais recuperados, manter tabela/descrição ou visual ilustrativo — não fabricar os frames entre uma linha de resumo e uma animação. Uma curva medida em uma haste pode ser reproduzida na geometria da haste; sua transferência a uma parede Orion precisa de outro rótulo.

Label: “Observação experimental — amostra e condições identificadas”.

### Modo C: previsão calibrada, opcional

Só liberar um alvo físico específico quando existirem observações adequadas, geometria/regime comparáveis, calibração reproduzível e uma checagem independente. A ausência de algum requisito bloqueia essa previsão, não o cenário ilustrativo ou a consulta às fontes.

Um surrogate de velocidade de frente em um material/geometria específica não é, por associação, um modelo de fumaça, temperatura, tempo de alarme ou propagação de cabine inteira. Uma montagem 3D diferente pode continuar ilustrativa mesmo se um parâmetro local tiver validação.

Label: “Estimativa calibrada — alvo, domínio e validação disponíveis”.

A elegibilidade é por capacidade/resultado, não um único booleano que promove todo o cenário a “cientificamente validado”. Não há modo preditivo implementado hoje.

## 9. Fronteira entre RAG e modelo físico

RAG localiza e explica a evidência. Um gate determinístico verifica se ela pode parametrizar uma capacidade física. O renderizador apresenta o resultado com o rótulo correspondente.

Não fazer: embedding semelhante → LLM inventa taxa de propagação → chamas convincentes → interface exibe confiança em porcentagem.

Fazer: observação rastreável → verificação de material/composição, fase, geometria/escala, atmosfera/diluente, fluxo/direção, gravidade e ignição conforme o alvo → regra visual divulgada, replay medido ou modelo específico validado.

Regras científicas que a implementação futura deve respeitar:

- A esfera azul não representa qualquer chama em microgravidade; o vídeo mostra outros regimes.[2]
- Não garantir maior propagação downstream em todo regime nem extinção universal quando a ventilação para.[5]
- Não presumir eficácia monotônica de supressores; há resultados de arraste de oxidante e fortalecimento de chama por escoamento do agente.[5][6]
- Não igualar extinção visível a fim de toda combustão; cool flames exigem cuidado na interpretação.[5]
- Não transformar limites de qualificação medidos em 1g em um corte universal de ignição em microgravidade.[5]
- Não tratar zero g como upper bound conservador garantido de gravidade lunar; FM2 é pesquisa sobre essa transferência, não validação pronta do nosso cenário.[14]

## 10. Continuidade da interface e falhas

Manter as cenas atuais, câmera, seleção e controles. Acrescentar no painel contextual: “por que esta evidência”, condições comparadas, dados extraíveis, fontes, limitações e tipo de visualização. O acesso ao ensaio original deve ser próximo da interação 3D, não escondido em uma bibliografia isolada.

Se o usuário mudar módulo, superfície/material ou condições, invalidar a avaliação contextual anterior. Cache e respostas assíncronas precisam de chave que inclua pergunta/intenção, contexto relevante, corpus e versões do retriever/modelo; descartar resposta atrasada de outra seleção. Histórico pode continuar visível, identificado como referente ao cenário anterior.

Ao aplicar um registro com O2 conhecido e pressão/fluxo ausentes, mostrar o diff. Os campos restantes vêm do cenário ou ficam desconhecidos; não atribuí-los ao experimento. Mais de uma fonte aplicada exige proveniência por campo, não apenas “último experimento selecionado”.

Sem backend/LLM: manter catálogo, fontes e visual ilustrativo. Um resultado cacheado pode ser reutilizado apenas com correspondência de contexto/versão e identificação explícita; não simular uma consulta ao vivo.

## 11. Escopo e validação curtos

Próxima entrega proposta:

1. Uma pergunta real de material/baixo fluxo a partir da seleção 3D.
2. Uma pergunta de detecção/pirólise, para provar que o produto não responde apenas sobre chama já estabelecida.
3. Uma pergunta de supressão/equipamento e uma conexão terrestre com fonte.
4. Um caso sem cobertura, incluindo transferência lunar ou geometria incompatível.
5. Um cenário visual representativo ligado ao mesmo bundle e uma exportação de dados/proveniência.

SAME fundamenta a importância de pirólise, aerossóis e resposta do detector; Saffire inclui questões de escala e pós-incêndio.[8][7]

SoFIE/FLARE/FM2 acrescentam perguntas de geometria, correlação de testes e exploração, sem disponibilidade de novos dados automaticamente demonstrada.[12][13][14]

Fazer apenas checks focados: algumas consultas PT/EN com investigações relevantes conhecidas, identificador exato, campos ausentes, abstenção, citações, um caminho real no navegador e invalidação de resposta velha. Usar perguntas separadas para ajuste e confirmação; não anunciar uma grande avaliação científica a partir desses exemplos.

Se houver previsão numérica, não dispensar a validação que sustenta essa alegação: reduzir o alvo e o escopo, não reduzir a honestidade. Não investir o tempo principal em uma suíte ampla, fine-tuning ou repetidas tentativas de validar um preditor de cabine inteira.

## 12. Pendências explícitas

- Revalidar a cobertura da busca oficial PSI versus os 24 IDs selecionados; a página retornou vazia na pesquisa anterior.
- Recuperar e verificar um corpus textual pequeno ligado às perguntas de demonstração; documentos consultados para pesquisa não estão automaticamente ingeridos pela aplicação.
- Verificar disponibilidade/licença e relação de mídia com amostra antes de download ou uso.
- Escolher backend/provedor/execução de embeddings com base no ambiente e latência reais, sem infraestrutura paga automática.
- Avaliar o candidato de embedding e o ranking em perguntas reais; não confundir arquitetura recomendada com performance demonstrada.
- Extrair alvos físicos quantitativos somente se uma capacidade calibrada concreta for escolhida.

## Sources

[1] https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/?tab=resources
[2] https://www.youtube.com/watch?v=AVuEiKxOpc0
[3] https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science
[4] https://www.nasa.gov/missions/station/a-researchers-guide-to-combustion-science
[5] https://www.nasa.gov/wp-content/uploads/2016/05/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf?emrc=c9b273
[6] https://www.nasa.gov/wp-content/uploads/2025/07/burning-and-suppression-of-solids-bass.pdf?emrc=3a5c2c
[7] https://www.nasa.gov/wp-content/uploads/2025/07/spacecraft-fire-safety-demonstration-saffire.pdf?emrc=48d415
[8] https://www.nasa.gov/wp-content/uploads/2025/07/smoke-aerosol-measurement-experiment-same.pdf?emrc=b828be
[9] https://spinoff.nasa.gov/node/9407
[12] https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/solid-fuel-ignition-and-extinction-sofie
[13] https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/flammability-limits-at-reduced-g-experiment-flare
[14] https://www.nasa.gov/glenn/glenn-expertise-space-exploration/physical-sciences-program/combustion-science/flammability-of-materials-on-the-moon-fm2
[15] https://qdrant.tech/documentation/search/hybrid-queries
[16] https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html
[17] https://huggingface.co/intfloat/multilingual-e5-base
