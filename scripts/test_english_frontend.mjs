import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { englishDisplayData, englishText } from '../src/i18n/english.ts';

const root = new URL('../', import.meta.url);
const json = (path) => JSON.parse(readFileSync(new URL(path, root), 'utf8'));

test('English document metadata and locale', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Orbital laboratory/);
  assert.doesNotMatch(html, /pt-BR|Laboratório/);
});

test('display translation preserves original evidence and raw source cells', () => {
  const source = { material: 'Alumínio', raw: { material: 'Alumínio' }, id: 'PSI-25:t0:r2', speed: 9.77, missing: null };
  const copy = englishDisplayData(source);
  assert.equal(copy.material, 'Aluminum');
  assert.equal(copy.raw.material, 'Alumínio');
  assert.equal(source.material, 'Alumínio');
  assert.equal(copy.id, source.id);
  assert.equal(copy.speed, source.speed);
  assert.equal(copy.missing, null);
  assert.equal(englishText('NASA PSI'), 'NASA PSI');
});

test('published display dictionaries are complete nonempty string mappings', () => {
  const merged = {};
  for (const path of ['src/i18n/catalog.en.json', 'src/i18n/saffire.en.json', 'src/i18n/experiments.en.json', 'src/i18n/flare.en.json']) {
    const dictionary = json(path);
    assert.ok(Object.keys(dictionary).length > 0, path);
    for (const [source, translation] of Object.entries(dictionary)) {
      assert.equal(typeof translation, 'string', source);
      assert.ok(translation.trim(), source);
      merged[source] = translation;
    }
  }
  for (const [source, translation] of Object.entries(merged)) {
    assert.equal(englishText(source), translation, source);
  }
});

test('localization does not change scientific workspace source values or numbers', () => {
  const workspace = json('public/data/saffire/specialist-workspace.json');
  const before = JSON.stringify(workspace);
  englishDisplayData(workspace);
  assert.equal(JSON.stringify(workspace), before);
});
