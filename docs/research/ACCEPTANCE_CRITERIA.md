# Critérios de aceitação científica e contrato de dados

## Registro entregue primeiro

Contrato público: `public/data/saffire/trial-registry.json`, `schemaVersion: 1`.
Gerador: `scripts/build_trial_registry.py`; testes: `scripts/test_trial_registry.py`.

O registro contém os nove ensaios solicitados, sem médias ou preenchimento físico de campos ausentes. Condições não nulas exigem referência própria. Hashes são calculados dos bytes dos modelos. Taxas `char-front`, `flame-base` e `published-rate` não são intercambiáveis. A condição III preserva o conflito 30 cm/s na tabela PSI versus 25 cm/s adotados no artigo. II-6 também preserva 25 cm/s no artefato versus 20 cm/s na curadoria.

VI-2: Tabela 1, página impressa 3 de ICES-2024-365 conferida visualmente no navegador em 14/11/2026: SIBAL, comprimento 50 cm, fluxo concorrente 20 cm/s, pressão 54,1 kPa, O2 31,0 mol%. A largura do corpo de prova e a largura da grade do render são mantidas distintas. Fonte: https://ntrs.nasa.gov/api/citations/20240002981/downloads/Saffire-ICES-2024-ICES-365-accepted%20final.pdf

IV-1 e V-2 preservam as condições adotadas nos artefatos e no artigo de propagação citado pelo colega (Tabela 1/Figura 8, DOI 10.1016/j.combustflame.2022.112559). Os valores alternativos do relatório preliminar ficam em `conflicts`; não foram reconciliados por média. A revisão independente da fonte dessas taxas não é substituída pela consistência do JSON.

Esta é a entrega incremental da tarefa 1; as regras de elegibilidade e de exportação serão detalhadas na tarefa 4, sem alterar a interface do registro.

## Estado

Tarefa 1: registro dos nove ensaios publicado; frontend consome public/data/saffire/trial-registry.json sem tratar null como compatível.
Tarefa 2: S2_REVIEW.md concluído; a velocidade curta de I S2 é sensível à quantização e não é aprovada como física validada.
Verificação: cálculos da revisão reproduzíveis; regressões Python/Node exigidas antes do push, sem recalibrar scripts protegidos.
Não verificado: pixels/sensores S2 ausentes, regime pós-ignitor, validação externa e transferência lunar.
Próximas entregas: proveniência cross-trial e critérios completos; sem merge em develop/main.
