// Experimental replays: time series integrity, no invented samples, units, reproducible model runs,
// separation between observation and simulation, telemetry synchronisation and lazy loading.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  advanceTime, isStrictlyIncreasing, lastIndexAtOrBefore, nextStop, previousStop, sampleAt,
} from '../src/components/replay/replayCore.ts';
import {
  REPLAY_CATALOG, SAFFIRE_ENSEMBLE_SEEDS, SAFFIRE_II_FRAME_SAMPLES, SAFFIRE_MODEL_SEED, SOFIE_PUBLIC_VIDEO,
} from '../src/components/replay/replayCatalog.ts';
import { readSaffireIIReplay, readSaffireModel, SAFFIRE_ID, simulateFromObservedFront } from '../src/saffire.ts';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const json = (path) => JSON.parse(read(path));

test('playback helpers show the last recorded sample and never interpolate', () => {
  const times = [0, 1, 2, 4];
  const values = [10, null, 30, 50];
  assert.equal(lastIndexAtOrBefore(times, -0.1), -1);
  assert.equal(sampleAt(times, values, -0.1), null);
  assert.equal(sampleAt(times, values, 0.99), 10);
  assert.equal(sampleAt(times, values, 1.5), null, 'a missing sample stays missing');
  assert.equal(sampleAt(times, values, 3.9), 30, 'between samples the earlier one is held, not an average');
  assert.equal(sampleAt(times, values, 99), 50);
  assert.equal(nextStop(times, 2), 4);
  assert.equal(nextStop(times, 4), 4);
  assert.equal(previousStop(times, 2), 1);
  assert.equal(previousStop(times, 0), 0);
  for (const t of [-1, 0.5, 2, 3.2]) {
    assert.ok(times.includes(nextStop(times, t)) && times.includes(previousStop(times, t)), 'steps land on recorded times');
  }
  assert.equal(advanceTime(1, 500, 2, 10), 2);
  assert.equal(advanceTime(9.5, 1000, 4, 10), 10, 'the clock stops at the end');
  assert.equal(advanceTime(3, -50, 1, 10), 3);
  assert.equal(isStrictlyIncreasing([0, 1, 1]), false);
});

test('BASS-II B1: measured series, pixel units, held telemetry and data-driven sample plane', () => {
  const b1 = json('public/data/bass2/b1-replay.json');
  const plane = json('public/data/bass2/b1-sample-plane.json');
  const config = json('data/bass2/b1/flamefront-config.json');
  const { series } = b1;
  assert.ok(isStrictlyIncreasing(series.t_s));
  assert.ok(isStrictlyIncreasing(series.frame));
  assert.deepEqual([b1.units.position, b1.units.velocity], ['px', 'px/s']);
  assert.equal(b1.spatialScale.mm_per_px, null);
  assert.equal(b1.physicalVelocity.value_mm_s, null);
  assert.equal(plane.spatialScale.mm_per_px, null);
  assert.equal(plane.units, 'px');
  assert.deepEqual(plane.regions.bands.upper.y, config.regions.bands.upper.y);
  assert.deepEqual(plane.regions.bands.lower.y, config.regions.bands.lower.y);
  assert.deepEqual(plane.regions.flame.x, config.regions.flame.x);
  assert.deepEqual(plane.regions.ignitor.x, config.regions.ignitor.x);
  assert.equal(Math.round(b1.velocities.upper.value_px_s * 100) / 100, 9.77);
  assert.equal(Math.round(b1.velocities.lower.value_px_s * 100) / 100, 9.56);
  for (const band of ['upper', 'lower']) {
    const x = series.fronts[band].x_px;
    for (let i = 0; i < series.t_s.length - 1; i += 1) {
      const mid = (series.t_s[i] + series.t_s[i + 1]) / 2;
      assert.equal(sampleAt(series.t_s, x, mid), x[i], `${band}: frame ${series.frame[i]} is held, not interpolated`);
    }
    const missing = x.map((v, i) => [v, i]).filter(([v]) => v == null).map(([, i]) => i);
    assert.ok(missing.length > 0, `${band}: the series has gaps to preserve`);
    for (const i of missing) assert.equal(sampleAt(series.t_s, x, series.t_s[i]), null);
  }
  const telemetry = b1.telemetry.points;
  const tTimes = telemetry.map((p) => p.t_s);
  assert.ok(isStrictlyIncreasing(tTimes));
  telemetry.forEach((p, i) => {
    assert.equal(sampleAt(tTimes, telemetry, p.t_s), p, 'each FAN/AIR change shows exactly at its time');
    if (i + 1 < telemetry.length) assert.equal(sampleAt(tTimes, telemetry, (p.t_s + telemetry[i + 1].t_s) / 2), p, 'held until the next change');
  });
  assert.ok(b1.events.every((e) => e.t_s >= series.t_s[0] && e.t_s <= series.t_s.at(-1)), 'events inside the replay range');
});

test('SAFFIRE II: original frames in recorded order, files present, archive time base', () => {
  for (const sample of SAFFIRE_II_FRAME_SAMPLES) {
    const replay = readSaffireIIReplay(json(`public/data/saffire/psi-99-ii${sample}-replay.json`), sample);
    const times = replay.frames.map((f) => f.timeSeconds);
    assert.ok(isStrictlyIncreasing(times), `II-${sample} ordered`);
    assert.ok(times[0] >= 0);
    assert.equal(replay.durationSeconds, times.at(-1));
    for (const frame of replay.frames) assert.ok(existsSync(new URL(`public/data/saffire/${frame.path}`, root)), frame.path);
  }
});

test('SAFFIRE I model replay is reproducible with its fixed seed and starts from the observed front', () => {
  const model = readSaffireModel(json('public/data/saffire/psi-98-s1-neighbors.json'), SAFFIRE_ID);
  const a = simulateFromObservedFront(model, SAFFIRE_MODEL_SEED);
  const b = simulateFromObservedFront(model, SAFFIRE_MODEL_SEED);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'same seed, same states');
  assert.equal(JSON.stringify(simulateFromObservedFront(model)), JSON.stringify(a), 'catalogue seed = model default seed');
  assert.notEqual(JSON.stringify(simulateFromObservedFront(model, SAFFIRE_MODEL_SEED + 1)), JSON.stringify(a), 'the run is stochastic');
  assert.equal(a.length, model.durationSeconds / model.stepSeconds + 1);
  model.initialFront.forEach((front, y) => {
    const row = a[0].grid[y];
    if (front === null) assert.ok(row.every((c) => c === null));
    else assert.deepEqual(row, row.map((_, x) => (x < front ? 1 : 0)));
  });
  const observed = model.observedTrajectory.map((o) => o.timeS);
  assert.ok(isStrictlyIncreasing(observed));
  assert.ok(observed.every((t) => t % model.stepSeconds === 0 && t <= model.durationSeconds), 'measured fronts sit on model steps');
  assert.equal(SAFFIRE_ENSEMBLE_SEEDS.length, 20);
  assert.equal(new Set(SAFFIRE_ENSEMBLE_SEEDS).size, 20);
});

test('SoFIE-GEL 1410C: windows in video time, public video matches the recorded file, not a model input', () => {
  const v = json('public/data/sofie/gel-evidence.json').video1410C;
  const manifest = read('data/sofie/docs-manifest.json');
  const windows = v.windows.value;
  assert.ok(isStrictlyIncreasing(windows.map((w) => w.video_s[0])));
  const [a0, a1] = v.segments[1].value;
  assert.ok(windows.every((w) => w.video_s[0] >= a0 && w.video_s[1] <= a1 + 1e-9), 'windows inside the analysed segment');
  assert.ok(windows.every((w) => w.peak_Hz == null || w.peak_Hz <= v.method.nyquist_videoHz));
  assert.equal(v.useAsModelParameter, false);
  assert.equal(v.spatialScale.value, null);
  assert.equal(v.video.sha256, SOFIE_PUBLIC_VIDEO.sha256);
  assert.ok(manifest.includes(`"url": "${SOFIE_PUBLIC_VIDEO.url}"`) || manifest.includes(`"url":"${SOFIE_PUBLIC_VIDEO.url}"`));
  assert.ok(manifest.includes(SOFIE_PUBLIC_VIDEO.sha256) && manifest.includes(String(SOFIE_PUBLIC_VIDEO.bytes)));
});

test('SAME sequence: recorded order, windows inside records, values and units equal the reduction', () => {
  const seq = json('public/data/same/same-sequence.json');
  const source = json('data/same/derived/same-tests.json');
  const byTest = new Map(source.tests.map((t) => [t.test, t]));
  assert.equal(seq.kind, 'measurement-sequence');
  assert.equal(seq.tests.length, source.tests.filter((t) => t.housekeeping?.method === 'state').length);
  for (const channel of seq.channels) assert.equal(channel.unit, source.units.channels[channel.key].unit);
  for (const t of seq.tests) {
    const hk = byTest.get(t.test).housekeeping;
    assert.ok(isStrictlyIncreasing(t.windows.map((w) => w.start_s)), `T${t.test} windows ordered`);
    assert.equal(t.windows.length, hk.windows.length);
    t.windows.forEach((w, i) => {
      assert.ok(w.start_s >= 0 && w.start_s < w.end_s && w.end_s <= t.duration_s);
      assert.equal(w.end_s - w.start_s, hk.windows[i].endEpoch_s - hk.windows[i].startEpoch_s);
      if (w.plateau) assert.ok(w.plateau.start_s >= w.start_s && w.plateau.end_s <= w.end_s);
      else assert.equal(hk.windows[i].plateauSamples, 0);
      for (const [key, stats] of Object.entries(w.channels)) {
        assert.equal(stats?.median ?? null, hk.windows[i].channels[key]?.median ?? null, `T${t.test} W${w.index} ${key}`);
      }
    });
    if (t.sampleHeating) assert.ok(t.sampleHeating.start_s <= t.sampleHeating.end_s && t.sampleHeating.end_s <= t.duration_s);
  }
  assert.doesNotMatch(read('public/data/same/same-sequence.json'), /"(series|samples_s|interpolat)/);
});

test('catalogue separates observation, measured data and simulation; FLARE stays static', () => {
  const byId = Object.fromEntries(REPLAY_CATALOG.map((e) => [e.id, e]));
  assert.deepEqual(byId['saffire-ii-images'].natures, ['experimental-images']);
  assert.ok(byId['saffire-i-model'].natures.includes('computational-model'));
  assert.deepEqual(byId['bass2-b1'].natures, ['video-derived']);
  assert.deepEqual(byId['same-sequence'].natures, ['measurement-sequence']);
  assert.equal(byId['flare-static'].animated, false);
  assert.deepEqual(byId['flare-static'].natures, ['published-static']);
  assert.ok(REPLAY_CATALOG.every((e) => !e.natures.includes('illustrative')), 'no illustrative module poses as a replay');
  for (const entry of REPLAY_CATALOG) {
    for (const path of entry.data) {
      const expanded = path.includes('{') ? SAFFIRE_II_FRAME_SAMPLES.map((n) => path.replace(/\{[^}]+\}/, String(n))) : [path];
      for (const p of expanded) if (!p.includes('*')) assert.ok(existsSync(new URL(`public/${p}`, root)), `${entry.id}: ${p}`);
    }
  }
  const imageReplay = read('src/components/research/SaffireImageReplay.tsx');
  assert.doesNotMatch(imageReplay, /simulate|frontEnsemble/, 'the image replay draws no model output');
  const modelReplay = read('src/components/research/SaffireModelReplay.tsx');
  assert.match(modelReplay, /natures=\{\["computational-model"/);
  const bass = read('src/components/research/BassB1Replay.tsx');
  assert.match(bass, /BASS-II B1 — Experimental Replay/);
  assert.match(bass, /Optical trajectories measured in the experimental video; position in pixels, without absolute spatial calibration\./);
  assert.doesNotMatch(bass, /mm_per_px\s*[*/]|[*/]\s*[\w.?]*mm_per_px/, 'no px → mm conversion');
  assert.match(bass, /physicalVelocity\?\.value_mm_s === null/, 'the replay refuses data carrying a physical velocity');
  assert.ok(!existsSync(new URL('src/components/research/FlareReplay.tsx', root)), 'no FLARE flame animation');
});

test('replay modules are loaded on demand only', () => {
  const tab = read('src/components/research/ExperimentReplays.tsx');
  for (const name of ['BassB1Replay', 'SaffireImageReplay', 'SaffireModelReplay', 'SofieVideoReplay', 'SameSequenceReplay', 'FlareObservation']) {
    assert.match(tab, new RegExp(`const ${name} = lazy\\(\\(\\) => import\\("\\./${name}"\\)\\)`), `${name} is lazy`);
    assert.doesNotMatch(tab, new RegExp(`^import .*\\./${name}"`, 'm'), `${name} has no static import`);
  }
  const explorer = read('src/components/ExperimentExplorer.tsx');
  assert.match(explorer, /const FlareObservation = lazy\(\(\) => import\("\.\/research\/FlareObservation"\)\)/);
  const sofie = read('src/components/research/SofieVideoReplay.tsx');
  assert.match(sofie, /\{streaming \? \(\s*<video/, 'the public video is mounted only after the viewer asks for it');
});
