# Proveniência executada do cross-trial I/III

## Reprodução real e compatibilidade

O comando abaixo foi executado no worktree `feat/trial-registry`, reutilizando os quatro ZIPs existentes no cache original, sem download ou instalação. Ele reextrai observações e acrescenta proveniência; não recalibra os kernels operacionais nem transforma o segundo ensaio em teste externo do modelo final.

    .venv\Scripts\python.exe scripts/crosstrial_saffire.py --cache-dir C:/Users/lucas/Documents/hkt_nasa_flame_snapshot_20261114/data/cache/saffire/psi-100-s1 --provenance-only

No worktree, foi usado o interpretador absoluto `C:/Users/lucas/Documents/hkt_nasa_flame_snapshot_20261114/.venv/Scripts/python.exe`. O modo aditivo rejeita observações que não reproduzam a trajetória e os contadores já publicados. As chaves e os valores científicos anteriores permanecem; o fingerprint do script é atualizado intencionalmente. A origem temporal nos nomes dos dados experimentais é histórica e não é a data do commit.

## Campos adicionados ao JSON

Arquivo: `public/data/saffire/crosstrial-i-iii.json`.

- `provenance.frameAudit.zipAssets`: nome, tamanho e SHA-256 dos bytes exatos de cada ZIP, membros verificados por leitura/CRC e bytes descomprimidos.
- `provenance.frameAudit`: contagem de quadros únicos, duplicatas e sua linhagem. Timestamps duplicados só são deduplicados com CRC32 e tamanho iguais, após verificar o conteúdo dos membros. CRC32 não é identidade criptográfica dos JPEGs; o ZIP é identificado por SHA-256. Nomes duplicados dentro do mesmo ZIP e timestamps com conteúdo incompatível falham.
- `provenance.scriptHashConvention`: SHA do código com CRLF normalizado para LF, para não confundir checkout Windows com mudança de algoritmo. Os hashes dos ZIPs não são normalizados.
- `observations.epochInitialMs`: timestamp do primeiro quadro iluminado selecionado; não é o instante do ignitor nem prova de sincronização absoluta. `epochInitialUtc` é sua interpretação como Unix ms, explicitamente limitada.
- `observations.selectedFrames`: timestamp, tempo relativo, intensidade verde usada na seleção, ZIP/member/CRC/tamanhos, frente contínua por faixa (`frontMm`) e frente quantizada/monotonicizada (`frontGridCells`). `rowCentersMm` explicita a posição das faixas.
- `timeSensitivity.deltaSeconds`: intervalos reais entre rajadas, sem impor que cada diferença seja exatamente 2 s.
- `timeSensitivity.combinations`: população de risco, eventos, censura e exposição por configuração, comparando o estimador intervalar em tempo real com a hipótese fixa de 2 s.
- `timeSensitivity.frontSpeedOLS`: comparação da mesma posição e dos mesmos índices de janela, mudando somente o eixo temporal.

## Resultados desta execução

- Quatro ZIPs, 432.800.393 bytes observados; 19.033 quadros únicos; zero duplicatas; 317 quadros iluminados selecionados.
- Epoch inicial: 1496610868189 ms, definido pelo nome do primeiro quadro selecionado.
- Δt mínimo 1,666 s, máximo 2,337 s, média 2,000820 s. Duração real 632,259 s; hipótese fixa 632 s.
- Mesma janela de 94 pontos: OLS com timestamps reais 2,204034 mm/s; OLS com intervalos fixos 2,204458 mm/s; diferença relativa −0,019212%.

São resultados do pipeline de observação, não novas medições de temperatura, calor ou validação de incêndio lunar. A seleção, escala manual, detector, monotonicização e censura legados foram mantidos.

## Interpretação estatística

A análise usa a célula intacta no início do intervalo, vizinhança conhecida com ao menos um vizinho alcançado e estado final conhecido. Configuração `000` é excluída. Estado/vizinhança desconhecidos excluem o intervalo inteiro, sem inventar sobrevivência ou exposição parcial. O fim do vídeo não gera tempo adicional em risco. A classe da vizinhança é congelada no início; ativações dentro do intervalo não foram medidas.

A verossimilhança agrupada é `sum_event log(1-exp(-lambda*dt)) - sum_no_event lambda*dt`. Ela não equivale a `eventos/soma(dt)` de tempos exatos de falha. No caso uniforme, a probabilidade Bernoulli e a intensidade equivalente se relacionam por `p=1-exp(-lambda*dt)`. Caso todos os intervalos sejam eventos, não há MLE finito de intensidade: o JSON usa `null` e status `all-events-unbounded`, nunca Infinity/NaN. Classes com pouca exposição permanecem descritivas; o mínimo operacional legado não é substituído pela análise.

Dependência entre células/tempos, transições internas não observadas, erro de registro, censura informativa e discrepância física permanecem limitações. A sensibilidade temporal não é intervalo de confiança, identificação causal do fluxo ou validação externa.

## Verificações

`test_crosstrial_saffire.py` cobre CRC real de membro corrompido, colisão de timestamp, nome ambíguo, ordenação, likelihood com exemplo analítico, censura, dados inválidos, estrutura publicada e fingerprint portável. Os resultados científicos legados são comparados recursivamente antes da publicação; campos novos não apagam os antigos.

Após alterar o cross-trial, regerar `modeling-targets.json` com o builder permitido atualiza o hash do derivado; regerar `trial-registry.json` mantém o contrato e os hashes conferíveis. A revisão do registro também corrigiu referências de campos e mantém I-S2 como ponto aproximado de O2 (21,5%), sem tratá-lo como intervalo medido de largura zero.
