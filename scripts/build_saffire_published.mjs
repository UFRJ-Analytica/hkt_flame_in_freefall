import { writeFileSync } from "node:fs";
import { LONGITUDINAL_SEED, simulateLongitudinal } from "../src/saffire.ts";
import { readPublishedModel } from "../src/saffirePublished.ts";

const spread = {
  label: "Estudo de propagação em tecidos, Tabela 1 e Figura 8",
  url: "https://doi.org/10.1016/j.combustflame.2022.112559",
};
const comparison = {
  label: "Heat and Smoke Emission from Tests on the SAFFIRE IV–VI Experiments, Tabela 1",
  url: "https://www.researchgate.net/publication/410245330_Heat_and_Smoke_Emission_from_Tests_on_the_SAFFIRE_IV-VI_Experiments",
};
const preliminary = {
  label: "Resultados preliminares de SAFFIRE VI, Tabela 1",
  url: "https://ntrs.nasa.gov/citations/20240002981",
};
const ivv = {
  label: "Resultados preliminares de SAFFIRE IV e V, Figura 2 e Tabela 1",
  url: "https://ntrs.nasa.gov/citations/20210011521",
};
const vEvents = {
  label: "Cronologia do SAFFIRE V, Tabela 1",
  url: "https://ntrs.nasa.gov/citations/20240008602",
};
const viEvents = {
  label: "Cronologia do SAFFIRE VI, Tabela 1",
  url: "https://ntrs.nasa.gov/citations/20250002675",
};
const ribs = {
  label: "Propagação contrária ao fluxo no PMMA estruturado de SAFFIRE V",
  url: "https://ntrs.nasa.gov/citations/20210017785",
};
const manuscript = {
  label: "Manuscrito aceito, Figura 8, p. 15 do PDF",
  url: "https://discovery.ucl.ac.uk/id/eprint/10164340/1/SIBAL-cotton%20revised%20Sept%20per%20review%20track%20changes%20accepted.pdf",
  sha256: "455b945bb5cb50eb5e5e34e0c8e8911a561d6336ffb942f185d28e4f13e9f3cc",
};

const base = "Posição da base da chama em quadros escuros";
const related = (id, material, status, outcome, source, details = {}) => ({
  id, material, status, outcome, source, ...details,
});
const reported = (oxygenPct, pressureKpa, source, context) => ({ oxygenPct, pressureKpa, source, context });
const trials = [
  {
    sample: "IV-1",
    material: "SIBAL",
    aliases: [{ id: "SAFFIRE IV · Teste 4", source: comparison }, { id: "SAFFIRE IV · Amostra 4", source: spread }],
    measuredGeometry: { lengthMm: 500, widthMm: 406, widthApproximate: false, source: spread },
    conditions: reported(23.1, 99, spread, "Condições adotadas no estudo de propagação"),
    otherReportedConditions: [
      reported(22, 100, preliminary, "Condições do ensaio na tabela comparativa preliminar"),
      reported(23, 98, comparison, "Valores arredondados da tabela comparativa de calor e fumaça"),
    ],
    calibration: { speedMmS: 3.6, variable: base, source: spread },
    points: [[32, 106.5], [38, 127.8], [44, 152.6], [50, 172.2], [56, 197.7], [62, 218.2], [68, 242],
      [74, 264.2], [80, 285.5], [86, 306.8], [92, 329], [98, 352], [104, 370.7], [110, 386.9]],
    axesPx: { time: [[492, 0], [969, 150]], position: [[676, 0], [324, 600]] },
    media: [{
      label: "Clipe público de SIBAL, referência visual",
      url: "https://www.nasa.gov/humans-in-space/the-flame-of-discovery-grows-as-saffire-sets-new-fires-in-space/",
    }],
    relatedEvidence: [
      related("IV-2", "PMMA de duas faces", "anchored-flame",
        "A chama cresceu e permaneceu ancorada na borda. Houve regressão local do material.", ivv,
        { aliases: [{ id: "Evento 5", source: comparison }] }),
      related("IV-3", "Nomex", "not-ignited",
        "A amostra consta no painel, entre as duas que não chegaram a queimar no SAFFIRE IV.", ivv,
        { aliases: [{ id: "Evento 7", source: comparison }] }),
      related("IV-4", "PMMA de uma face", "not-ignited",
        "A ignição foi omitida após a queima intensa do PMMA de duas faces.", comparison,
        { aliases: [{ id: "Evento 8", source: comparison }] }),
    ],
  },
  {
    sample: "V-2",
    material: "Algodão jersey",
    aliases: [{ id: "SAFFIRE V · Evento 5", source: vEvents }, { id: "SAFFIRE V · Amostra 5", source: spread }],
    measuredGeometry: { lengthMm: 500, widthMm: 406, widthApproximate: false, source: spread },
    conditions: reported(26.9, 76, spread, "Condições adotadas no estudo de propagação"),
    otherReportedConditions: [
      reported(26.2, 70.7, preliminary, "Condições do ensaio na tabela comparativa preliminar"),
      reported(28, 74.1, comparison, "Valores arredondados da tabela comparativa de calor e fumaça"),
      reported(26.5, null, vEvents, "Condições do evento 5; pressão reduzida, sem valor na linha do evento"),
    ],
    calibration: { speedMmS: 3.4, variable: base, source: spread, fitWindow: "Antes de 100 s e de 300 mm, antes do enrolamento" },
    points: [[32, 83.5], [38, 99.5], [44, 121.7], [50, 147.4], [56, 165.2], [62, 188.3],
      [68, 209.6], [74, 222], [80, 241.5], [86, 261.1], [92, 285.9]],
    axesPx: { time: [[486, 0], [978, 180]], position: [[1119, 0], [753, 650]] },
    media: [],
    relatedEvidence: [
      related("V-1", "PMMA estruturado", "not-completed",
        "A amostra prevista para fluxo concorrente não entrou nos ensaios concluídos.", ivv,
        { aliases: [{ id: "Evento 4", source: vEvents }] }),
      related("V-3", "PMMA de uma face", "anchored-flame",
        "A chama cresceu e permaneceu ancorada na borda. Houve regressão local do material.", ivv,
        { aliases: [{ id: "Evento 6", source: vEvents }] }),
      related("V-4", "PMMA estruturado", "rib-spread",
        "Houve avanço contra o fluxo nas nervuras. A taxa de até 0,88 mm/s vale para uma nervura estreita. A ventilação passou de 20 para 5 cm/s.", ribs,
        { aliases: [{ id: "Evento 8", source: vEvents }], direction: "opposed", narrowRibSpeedMmS: 0.88,
          flowPhases: [{ fromSeconds: 0, flowCmS: 20 }, { fromSeconds: 360, flowCmS: 5 }] }),
    ],
  },
  {
    sample: "VI-2",
    material: "SIBAL",
    aliases: [{ id: "SAFFIRE VI · Evento 5", source: viEvents }],
    measuredGeometry: { lengthMm: 500, widthMm: 400, widthApproximate: true, source: viEvents },
    conditions: reported(31, 54.1, preliminary, "Condições do ensaio na tabela do relatório preliminar"),
    otherReportedConditions: [{
      lengthMm: 500, widthMm: 410, source: preliminary, context: "Largura nominal no resumo do relatório preliminar",
    }],
    calibration: { speedMmS: 4.05, variable: "Velocidade longitudinal de propagação da chama", source: comparison },
    media: [{
      label: "Relato e vídeo público da NASA, referência visual",
      url: "https://www.nasa.gov/centers-and-facilities/glenn/flame-burns-out-on-nasas-long-running-spacecraft-fire-experiment/",
    }],
    directionSource: viEvents,
    relatedEvidence: [
      related("VI-1", "Nomex", "ignition-failed", "A tentativa de ignição não produziu chama.", preliminary,
        { aliases: [{ id: "Evento 4", source: viEvents }] }),
      related("VI-3", "PMMA de duas faces", "anchored-flame",
        "A chama cresceu até a redução do fluxo. O estudo comparativo registrou crescimento da chama e avanço por regressão local.", comparison,
        { aliases: [{ id: "Evento 6", source: viEvents }] }),
      related("VI-4", "PMMA de uma face", "anchored-flame",
        "A chama cresceu até a redução do fluxo. O estudo comparativo registrou crescimento da chama e avanço por regressão local.", comparison,
        { aliases: [{ id: "Evento 8", source: viEvents }] }),
    ],
  },
];

const stepSeconds = 2;
const grid = { lengthMm: 500, widthMm: 406, dxMm: 10, dyMm: 20, columns: 50, rows: 21 };
const seeds = Array.from({ length: 20 }, (_, i) => LONGITUDINAL_SEED + i);
const mean = values => values.reduce((sum, v) => sum + v, 0) / values.length;
const slope = (times, positions) => {
  const center = mean(times);
  return times.reduce((sum, time, i) => sum + (time - center) * positions[i], 0)
    / times.reduce((sum, time) => sum + (time - center) ** 2, 0);
};
const meanPosition = (step, dxMm) => dxMm * mean(step.grid.map(row => row.reduce((n, cell) => n + Number(cell === 1), 0)));

function compareCurve(model, points, axesPx) {
  const [start, end] = [points[0][0], points.at(-1)[0]];
  const startMm = points[0][1];
  const initialColumns = Math.round(startMm / model.grid.dxMm);
  const offsetMm = startMm - initialColumns * model.grid.dxMm;
  const simulations = seeds.map(seed => simulateLongitudinal({ ...model, durationSeconds: end - start }, seed, initialColumns));
  const times = points.map(([time]) => time);
  const observed = points.map(([, position]) => position);
  const simulated = times.map(time => offsetMm + mean(simulations.map(steps =>
    meanPosition(steps[(time - start) / model.stepSeconds], model.grid.dxMm))));
  return {
    kind: "same-trial-curve",
    variable: model.calibration.variable,
    digitization: {
      source: manuscript, series: "ss dark base (laranja)", intervalSeconds: [start, end],
      axesPx, renderDpi: 180, points,
      method: "Mediana dos pixels laranja a ±2 px de cada tempo, restringindo a busca à vizinhança da curva; conversão com eixo esquerdo. Resolução de cerca de 2 mm por pixel.",
    },
    initialObservedPositionMm: startMm,
    seedCount: seeds.length,
    seeds,
    simulatedMeanPositionsMm: simulated,
    positionMaeMm: mean(simulated.slice(1).map((position, i) => Math.abs(position - observed[i + 1]))),
    observedSpeedMmS: slope(times, observed),
    simulatedSpeedMmS: slope(times, simulated),
  };
}

function checkSpeed(model) {
  const durationSeconds = 100;
  const testGrid = { ...model.grid, lengthMm: 1000, columns: 100 };
  const distances = seeds.map(seed => {
    const steps = simulateLongitudinal({ ...model, grid: testGrid, durationSeconds }, seed);
    return meanPosition(steps.at(-1), testGrid.dxMm) - testGrid.dxMm;
  });
  return {
    kind: "numerical-speed-only",
    reason: "As fontes públicas consultadas trazem a taxa e dados agregados, sem série de posição comparável.",
    seedCount: seeds.length, seeds, testGrid, durationSeconds,
    simulatedSpeedMmS: mean(distances) / durationSeconds,
  };
}

for (const { points, axesPx, ...trial } of trials) {
  const { sample, calibration } = trial;
  const probability = calibration.speedMmS * stepSeconds / grid.dxMm;
  const experimentId = `SAFFIRE-${sample}`;
  const model = {
    schemaVersion: 3, status: "ready", experimentId, ...trial,
    grid, stepSeconds, durationSeconds: stepSeconds * Math.ceil((grid.columns - 1) / probability),
    ignition: { edge: "upstream", initialReachedColumns: 1 },
    playbackSeed: LONGITUDINAL_SEED,
    probability,
    directionProbabilities: { concurrent: probability, opposed: null, lateral: null },
    calibration: { ...calibration, kind: "published-speed", formula: "p = speedMmS × stepSeconds / dxMm" },
    conditions: { ...trial.conditions, flowCmS: 20, direction: "concurrent" },
  };
  model.validation = points ? compareCurve(model, points, axesPx) : checkSpeed(model);
  readPublishedModel(model, experimentId);
  writeFileSync(new URL(`../public/data/saffire/${experimentId.toLowerCase()}.json`, import.meta.url),
    JSON.stringify(model, null, 2) + "\n");
}
