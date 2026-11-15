# BASS-II B1 — revisão independente das anotações de referência

## Por que revisar

A escolha do método de detecção da frente de chama no teste B1 (fase P3) usou como referência 32 quadros anotados à mão:

- [`data/bass2/b1/annotations/b1-manual-annotations.csv`](../../data/bass2/b1/annotations/b1-manual-annotations.csv).

Essa referência tem três limitações:

- **Um único anotador.** No CSV, `annotator = claude-assistente`: as leituras foram feitas pelo assistente de IA, a partir de pranchas ampliadas, antes de qualquer detector ser executado.
- **Não é independente nem de especialista.** Ela não é verdade de campo.
- **Precisão estimada em ±4 px.**

Por isso, a interface e os relatórios a tratam como **preliminar**. O que está em jogo:

- **A escolha do método.** A segmentação adaptativa venceu por MAE em relação a essa referência. Outro anotador pode mudar a ordem.
- **A velocidade não deve mudar muito.** Na segunda metade da janela, todas as definições de frente ficam entre 9,3 e 10,0 px/s (relatório P3, §11.2).

**Este documento não substitui o CSV preliminar.** Ele também não autoriza criar anotações automáticas em nome de um especialista. A revisão pode ocorrer em paralelo à entrega.

## O que anotar

São os mesmos 32 quadros do arquivo [`b1-annotation-template.csv`](../../data/bass2/b1/annotations/b1-annotation-template.csv) (`ts_frame`, índice do quadro decodificável do TS original):

- 28 quadros igualmente espaçados entre 332 e 1048;
- os quadros 1070, 1090, 1105 e 1120 (rampa do ventilador e extinção).

Em cada quadro há duas lâminas luminosas, uma de cada lado do filme visto de perfil: a **superior** (y ≈ 248–278) e a **inferior** (y ≈ 308–338). Para cada uma:

- **`<banda>_front_px`:** a coordenada x, em pixels do quadro original, onde termina a emissão visível no sentido da propagação (para a direita, x crescente).
  - Inclua a ponta azulada fraca, se houver.
  - Exclua o halo difuso.
  - Use décimos de pixel só se a ampliação permitir.
- **`<banda>_visible`:**
  - `1` se a lâmina for visível sem realce;
  - `0` se não houver emissão visível. Nesse caso, deixe `<banda>_front_px` vazio. Nunca escreva 0 como posição.
- **`annotator`:** seu nome ou identificador.
- **`method`:** por exemplo, `pranchas-3x` ou `interactive-matplotlib`.
- **`note`:** dúvidas, como "frente difusa", "ponta incerta" ou "ignitor ainda brilhante".

**Regras para preservar a independência:**

- Faça a anotação sem ver o CSV preliminar, as figuras de detecção (`flamefront-contact-detections.jpg`, `flamefront-trajectory.png`) ou a interface B1. Todos mostram as respostas anteriores ou as automáticas.
- Use apenas as pranchas sem detecções.

## Passo a passo

### 1. Obter o vídeo (uma vez por máquina; fica fora do Git)

O caminho preferido é o TS original. Baixe o ZIP de vídeos originais (~17 MB; já autorizado no orçamento "b1") e extraia o `.ts`:

```powershell
python scripts/bass2/fetch_bass2.py b1 "PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1 original videos.zip"
python -c "import zipfile; z = zipfile.ZipFile('data/cache/bass2/b1/PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1 original videos.zip'); m = [n for n in z.namelist() if n.endswith('TEST_B1.ts')][0]; open('data/cache/bass2/b1/original/BASS_GMT50_SAMPLE_147_TEST_B1.ts', 'wb').write(z.read(m))"
```

Crie antes a pasta `data/cache/bass2/b1/original/`, se ela não existir. `segment_b1.resolve_source` confere o SHA-256 registrado em `data/bass2/b1/timebase.json`.

Alternativa: o MP4 do PSI.

```powershell
python scripts/bass2/fetch_bass2.py videos "PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1.mp4"
```

Sem o TS, o MP4 é usado automaticamente, com o deslocamento de 30 quadros medido na fase P2. A imagem é equivalente: as frentes diferem menos de 1 px pelo método de perfil.

### 2. Gerar as pranchas

```powershell
python scripts/bass2/annotate_b1.py prepare
```

O comando gera 8 pranchas em `data/cache/bass2/previews/b1/annotation/sheet-01..08.png`, com 4 quadros por prancha.

- Cada quadro aparece sem ganho e sem nenhuma saída de detector, ampliado 3× entre x = 170 e 490.
- Há uma grade a cada 10 px, rotulada a cada 20 px em coordenadas do quadro original.
- Os limites das bandas aparecem tracejados.
- Conversão: `x_original = 170 + x_na_prancha / 3`.

O comando também regrava o modelo vazio `b1-annotation-template.csv`, sem tocar no CSV preliminar.

### 3. Anotar

Escolha uma das duas formas.

**Pelas pranchas:**

1. Copie o modelo para `data/bass2/b1/annotations/b1-annotations-<seu-nome>.csv`.
2. Preencha os 32 quadros abrindo as pranchas num visualizador de imagens com zoom.

**Interativa** (requer matplotlib com backend gráfico, por exemplo TkAgg num Python com Tk):

```powershell
python scripts/bass2/annotate_b1.py interactive --annotator "Seu Nome"
```

- Em cada quadro, clique primeiro a frente da lâmina superior e depois a da inferior.
- O botão direito encerra o quadro e marca como invisível a banda que ainda faltava clicar.
- O resultado vai para `b1-annotations-seu-nome.csv`.
- O script se recusa a gravar sobre um arquivo existente ou sobre o CSV preliminar.
- Se apenas a lâmina inferior for visível num quadro, o modo interativo não consegue registrar isso, porque o primeiro clique é sempre o da superior. Corrija essa linha no CSV à mão.

### 4. Validar e comparar

```powershell
python scripts/bass2/annotate_b1.py check --file data/bass2/b1/annotations/b1-annotations-seu-nome.csv
python scripts/bass2/annotate_b1.py compare --file data/bass2/b1/annotations/b1-annotations-seu-nome.csv
```

- `check` recusa:
  - visibilidade diferente de 0 ou 1;
  - banda visível sem coordenada;
  - coordenada em banda invisível;
  - linha sem anotador.
- `compare` mostra, por banda:
  - a concordância com a referência preliminar: n, MAE, viés, RMSE, máximo e discordâncias de visibilidade;
  - a concordância com cada série rastreada de `flamefront-tracks.csv` no intervalo estável.

Com dois anotadores humanos, a diferença entre eles (MAE e viés) é a melhor estimativa do erro de leitura. Ela deve ser comparada com o MAE dos detectores.

### 5. Usar a nova referência (decisão da equipe)

A análise lê `annotate_b1.ANNOTATIONS`, que aponta para o CSV preliminar. Para adotar a revisão humana:

1. Decida, em conjunto, qual arquivo passa a ser a referência. Pode ser um anotador ou o consenso de dois, registrando o critério.
2. Altere `ANNOTATIONS` em `scripts/bass2/annotate_b1.py` para o novo arquivo. **Mantenha o CSV preliminar no repositório**, para rastreabilidade.
3. Rode novamente:

```powershell
python scripts/bass2/analyze_b1.py
python scripts/bass2/build_b1_replay.py
python -m unittest discover -s scripts/bass2 -p "test_*.py"
```

4. Atualize, em `docs/research/BASS2_B1_FLAMEFRONT_ANALYSIS.md`, a §8 (validação), a §6 (método escolhido) e as menções a "referência preliminar".
5. Atualize também os textos de limitação em `build_b1_replay.py` (`LIMITATIONS`, item `annotations`) e `referenceAnnotations.note`. Isso faz a interface deixar de mostrar o aviso de anotação preliminar.

## Registro

| Data | Anotador | Arquivo | Forma | Situação |
|---|---|---|---|---|
| 2026-11-14 | claude-assistente (IA) | `b1-manual-annotations.csv` | pranchas 3×, antes dos detectores | preliminar, não independente |
| — | (pendente) | `b1-annotations-<nome>.csv` | — | aguardando revisão humana |
