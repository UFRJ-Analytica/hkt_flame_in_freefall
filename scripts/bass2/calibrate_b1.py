"""Spatial calibration of the B1 side-view video: what is documented, what is visible, and the verdict.

A pixel -> millimetre transform is only accepted when a documented physical dimension is visible in the
same image plane as the measurement (or a demonstrable registration links two views). This script
gathers the evidence and writes data/bass2/b1/registration.json. When the evidence is insufficient the
file says so (``status: insufficient``) and carries no scale, origin or residual.

Evidence produced (cache, git-ignored, data/cache/bass2/b1/calibration/):
  ignition-max-gamma.png      brightest frames of the ignition, gamma-stretched: structures lit by the igniter
  all-frames-max.png          per-pixel maximum over the whole TS: region ever lit
  still-sequence-thumbs.png   the top-view photo previews of the "Still_Sequence" video

    python scripts/bass2/calibrate_b1.py
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import overlay_bass2 as overlay  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / 'data/cache/bass2/b1'
TS = CACHE / 'original/BASS_GMT50_SAMPLE_147_TEST_B1.ts'
STILLS = CACHE / 'PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1_Still_Sequence.mp4'
OUT = CACHE / 'calibration'
REGISTRATION = ROOT / 'data/bass2/b1/registration.json'

DOCUMENTED = [
    {'quantity': 'largura da amostra', 'value_mm': 20.0, 'qualifier': 'nominal',
     'sources': ['PSI-25 CSV / Test.Matrices.xlsx, aba Bhattacharjee, E2: "100 micron pmma film, 2 cm wide"',
                 'Summary Report, PDF p. 29 e 45: "20 mm wide"',
                 'SRD, p. 5: "Flat 2 cm PMMA Samples (0.1 mm thick)"'],
     'visibleInSideView': False,
     'why': 'a câmera de vídeo vê o filme de perfil (pela janela frontal, ortogonal à câmera de topo; PDF p. 12–13 e 64): '
            'a largura fica na linha de visada'},
    {'quantity': 'comprimento da amostra', 'value_mm': 95.0, 'qualifier': 'aproximado ("about 95 mm long")',
     'sources': ['Summary Report, PDF p. 29 e 45'],
     'visibleInSideView': 'não nos quadros disponíveis',
     'why': 'é a dimensão ao longo do eixo de propagação, mas a amostra não aparece no vídeo escuro: '
            'só a chama e, por instantes, peças iluminadas pelo ignitor'},
    {'quantity': 'espessura da amostra', 'value_mm': 0.1, 'qualifier': 'nominal',
     'sources': ['CSV / Test.Matrices E2 ("100 micron")', 'SRD p. 5 ("0.1 mm thick")'],
     'visibleInSideView': False, 'why': 'menor que um pixel e invisível no escuro; não serve de escala'},
    {'quantity': 'seção do duto', 'value_mm': [76.0, 76.0, 170.0], 'qualifier': '7,6 x 7,6 x 17 cm; seção de teste de 17 cm',
     'sources': ['Summary Report, PDF p. 12 e 74'],
     'visibleInSideView': False,
     'why': 'paredes pretas anodizadas, sem iluminação; campo de visão do vídeo não documentado'},
    {'quantity': 'escala móvel na seção de teste', 'value_mm': None, 'qualifier': 'existência citada, sem dimensões',
     'sources': ['Summary Report, PDF p. 12: "a movable scale"', 'Ops §5 nota: "the deployed scale may not be visible in the image"'],
     'visibleInSideView': 'não identificada', 'why': 'nenhuma graduação aparece nos quadros do B1'},
    {'quantity': 'pontos de 6 mm na imagem de topo', 'value_mm': 6.0, 'qualifier': 'sobreposição gráfica da análise SDSU',
     'sources': ['Summary Report, PDF p. 30 e 47 (Figuras 2.7 e 2.18)'],
     'visibleInSideView': False, 'why': 'acrescentados pela análise em fotos de topo de outro teste; não existem no vídeo'},
]


def fit_axis(points: list[dict], axis: str) -> dict:
    """x_mm = s * (x_px - x0) from reference points {'px': {...}, 'mm': {...}, 'sigma_mm': float, 'sigma_px': float}.

    Needs at least two points with distinct pixel coordinates on the axis. Returns the scale, the origin,
    residuals and a 1-sigma scale uncertainty that combines the fit scatter with the stated uncertainty
    of the reference dimensions and of the edge picking.
    """
    usable = [point for point in points if point.get('px', {}).get(axis) is not None and point.get('mm', {}).get(axis) is not None]
    px = np.array([point['px'][axis] for point in usable], dtype=float)
    mm = np.array([point['mm'][axis] for point in usable], dtype=float)
    if len(usable) < 2 or np.ptp(px) == 0:
        raise ValueError(f'eixo {axis}: são necessários pelo menos dois pontos com coordenadas distintas')
    scale, intercept = np.polyfit(px, mm, 1)
    origin = -intercept / scale
    residuals = mm - (intercept + scale * px)
    span_px = float(np.ptp(px))
    sigma_mm = float(np.sqrt(np.mean([point.get('sigma_mm', 0.0) ** 2 for point in usable])))
    sigma_px = float(np.sqrt(np.mean([point.get('sigma_px', 0.0) ** 2 for point in usable])))
    scatter = float(np.sqrt(residuals @ residuals / (len(usable) - 2))) / span_px if len(usable) > 2 else 0.0
    # Two-point bound: relative error of a length = sqrt(2)*sigma_mm/L (reference) and sqrt(2)*sigma_px/span (picking).
    span_mm = abs(scale) * span_px
    relative = np.sqrt((np.sqrt(2) * sigma_mm / span_mm) ** 2 + (np.sqrt(2) * sigma_px / span_px) ** 2) if span_mm else np.inf
    return {'axis': axis, 'scale_mm_per_px': float(scale), 'origin_px': float(origin), 'points': len(usable),
            'residuals_mm': [round(float(value), 4) for value in residuals],
            'residualRms_mm': float(np.sqrt(np.mean(residuals ** 2))),
            'scaleUncertainty_mm_per_px': float(np.hypot(abs(scale) * relative, scatter)),
            'relativeUncertainty': float(np.hypot(relative, scatter / abs(scale)))}


def to_mm(registration: dict, x_px: float, y_px: float | None = None) -> tuple[float, float | None]:
    """Apply a validated per-axis registration; refuse anything else."""
    if registration.get('status') != 'validated':
        raise ValueError(f"calibração espacial não validada (status: {registration.get('status')}); medir em pixels")
    axes = registration['transformation']['axes']
    x_mm = axes['x']['scale_mm_per_px'] * (x_px - axes['x']['origin_px'])
    y_mm = (axes['y']['scale_mm_per_px'] * (y_px - axes['y']['origin_px'])
            if y_px is not None and 'y' in axes else None)
    return x_mm, y_mm


def frames_of(path: Path):
    import cv2

    capture = cv2.VideoCapture(str(path))
    while True:
        ok, frame = capture.read()
        if not ok:
            break
        yield frame
    capture.release()


def lit_structures(frames: list[np.ndarray]) -> tuple[dict, np.ndarray, np.ndarray]:
    """Edges of whatever the igniter lights up, measured on the brightest frames (not the flame)."""
    brightness = np.array([frame[100:].max(axis=2).mean() for frame in frames])
    brightest = np.sort(np.argsort(brightness)[-12:])
    stack = np.max(np.stack([frames[i] for i in brightest]), axis=0)
    gamma = np.clip((stack.astype(np.float32) / 255) ** 0.35 * 255, 0, 255).astype(np.uint8)
    gray = gamma.astype(np.float32).mean(axis=2)
    # The overlay text ends at y ~ 82: search below it, in the left part of the frame where the
    # igniter lights the hardware (x 30-400), away from the image border.
    top = 90
    gx = np.abs(np.diff(gray[top:150, 30:400], axis=1)).mean(axis=0)
    edge_x = int(np.argmax(gx)) + 30
    column = gray[top:200, min(gray.shape[1] - 1, edge_x + 6)]
    lit = np.flatnonzero(column > 0.5 * column.max()) + top
    gy = np.abs(np.diff(gray[top:, 30:400], axis=0)).mean(axis=1)
    rows = sorted(int(y) for y in np.argsort(gy)[-3:] + top)
    every = np.max(np.stack(frames[::2]), axis=0)
    return ({
        'framesUsed': [int(i) for i in brightest],
        'method': 'máximo por pixel dos 12 quadros mais claros (brilho do ignitor), gama 0,35; bordas por gradiente médio',
        'verticalEdge_px': {'x': edge_x, 'yRange': [int(lit.min()), int(lit.max())] if len(lit) else None},
        'horizontalEdges_px': {'y': rows, 'xRange': [30, 400]},
        'searchWindow_px': {'x': [30, 400], 'yFrom': top, 'note': 'abaixo da sobreposição (que termina em y ~ 82)'},
        'identity': 'desconhecida (provavelmente partes do suporte da amostra ou do ignitor)',
        'physicalDimension': None,
        'usableAsReference': False,
    }, gamma, every)


def still_thumbnails() -> tuple[dict, np.ndarray]:
    import cv2

    frames = list(frames_of(STILLS))
    picks = [int(round(i)) for i in np.linspace(0, len(frames) - 1, 12)]
    tiles = []
    for index in picks:
        tile = cv2.resize(frames[index][40:260, 0:420], (420, 220))
        cv2.putText(tile, f'#{index}', (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        tiles.append(tile)
    rows = [np.hstack(tiles[i:i + 4]) for i in range(0, len(tiles), 4)]
    return ({
        'file': STILLS.name, 'sha256': hashlib.sha256(STILLS.read_bytes()).hexdigest(), 'frames': len(frames),
        'content': 'vídeo da tela de revisão da Nikon D300s: miniatura da foto, histograma e metadados '
                   '(arquivo DSC_7171–7217.NEF, foto n/57, 4288 x 2848 RAW, ISO 1000, F2, "35mm", '
                   'compensação -4.0, hora da câmera 02/19/2014 10:03:42–10:04:33)',
        'photoCount': 57, 'photoCountMatchesCsv': 'Total Frames Shot = 57 (CSV / Test.Matrices J2)',
        'sampleVisible': False,
        'why': 'a miniatura ocupa ~200 x 120 px do quadro de vídeo e, com exposição de 1/160–1/250 s e -4 EV, só a chama '
               'e o ignitor aparecem; nenhuma borda da amostra ou do suporte é visível',
        'viewMatchesSideVideo': False,
        'viewNote': 'vista de topo (câmera fotográfica pela janela superior), ortogonal à vista lateral do vídeo',
    }, np.vstack(rows))


def main() -> int:
    frames = list(frames_of(TS))
    structures, gamma, every = lit_structures(frames)
    stills, thumbs = still_thumbnails()
    images = {}
    for name, image in (('ignition-max-gamma.png', gamma), ('all-frames-max.png', every), ('still-sequence-thumbs.png', thumbs)):
        overlay.write_image(OUT / name, image)
        images[name] = (OUT / name).relative_to(ROOT).as_posix()
    registration = {
        'schemaVersion': 1, 'recordId': 'PSI-25:t0:r2', 'test': 'B1', 'view': 'vídeo lateral (câmera Panasonic WV-CP654 com espelho, janela frontal)',
        'status': 'insufficient',
        'reason': 'Nenhuma dimensão física documentada é visível no plano do vídeo lateral, e a única outra vista '
                  '(fotos de topo) não mostra a amostra nem tem correspondência geométrica demonstrável com o vídeo.',
        'transformation': None, 'origin_px': None, 'scale_mm_per_px': None,
        'referencePoints': [], 'residuals_mm': None, 'uncertainty': None,
        'image': {'source': TS.relative_to(ROOT).as_posix(), 'sha256': hashlib.sha256(TS.read_bytes()).hexdigest(),
                  'width_px': int(frames[0].shape[1]), 'height_px': int(frames[0].shape[0]),
                  'pixelAspect': 'não determinada para o TS; o MP4 do PSI declara 10:11 — x e y precisam de escalas próprias'},
        'documentedDimensions': DOCUMENTED,
        'pixelObservationsWithoutScale': {'litStructures': structures},
        'topViewStills': stills,
        'rejectedShortcuts': [
            'Transferir uma escala das fotos de topo: outra câmera, outro plano, e a amostra não aparece nas miniaturas.',
            'Supor que a largura do quadro cobre a seção de teste de 17 cm: o campo de visão não está documentado.',
            'Usar "the flame propagated across half the sample length" (PDF p. 21): o ponto de partida e o comprimento '
            '("about 95 mm") são imprecisos, e o mesmo texto fornece a velocidade de referência (2,2 mm/s), o que '
            'tornaria a validação circular.',
            'Usar a separação entre as duas lâminas da chama: é uma propriedade da chama, não uma dimensão conhecida.',
        ],
        'pathsForward': [
            {'option': 'Folha de prova das fotos do B1 (GMT2014_050_BASS_S147M_TPB1_ProofSheet.pdf, 264 402 bytes)',
             'expectation': 'pode conter a foto pós-queima iluminada com lanterna (Ops §9.12), com a amostra e o suporte; '
                            'serviria para escala da vista de topo, não do vídeo lateral'},
            {'option': 'Vídeos de outros testes com o volume de trabalho iluminado ou com a escala móvel visível',
             'expectation': 'a câmera e o campo de visão são fixos (SRD p. 1: "The field of view of the video can not be changed"); '
                            'uma escala medida em outro teste valeria para o B1 se a montagem do suporte for a mesma (a confirmar)'},
            {'option': 'Desenho de engenharia do suporte de amostra plana e do duto',
             'expectation': 'não está entre os documentos do PSI-25; daria dimensões das peças iluminadas pelo ignitor'},
            {'option': 'Medir em pixels e converter depois',
             'expectation': 'a próxima etapa pode trabalhar em px e px/s, deixando a conversão em aberto'},
        ],
        'diagnostics': images,
        'validation': 'não aplicável: nenhuma transformação foi estabelecida',
    }
    REGISTRATION.parent.mkdir(parents=True, exist_ok=True)
    REGISTRATION.write_text(json.dumps(registration, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(json.dumps({'status': registration['status'], 'litStructures': structures['verticalEdge_px'],
                      'horizontalEdges': structures['horizontalEdges_px'], 'diagnostics': images}, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
