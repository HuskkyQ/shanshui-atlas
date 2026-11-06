import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, DirectionalLight, Color, Fog } from 'three';
import { watchSceneTheme } from '../src/shared/scene-palette.js';
import { getExhibitionLight, getLightingForDate } from '../src/shared/lighting.js';

test('exhibition lighting retains day settings and keeps the scene legible after sunset', () => {
  const noon = getLightingForDate(new Date('2026-11-06T04:00:00Z'), 30.241, 120.14);
  const evening = getLightingForDate(new Date('2026-11-06T11:00:00Z'), 30.241, 120.14);
  const day = getExhibitionLight(noon.daylight);
  const night = getExhibitionLight(evening.daylight);

  assert.equal(noon.period, '日光');
  assert.equal(day.ambientIntensity, 2.1);
  assert.equal(day.fogMix, 1);
  assert.equal(day.waterLight, 1);
  assert.ok(evening.sun.altitude < 0);
  assert.ok(night.ambientMix >= 0.85);
  assert.ok(night.ambientIntensity > day.ambientIntensity);
  assert.ok(night.fogMix >= 0.6 && night.fogMix < 1);
  assert.ok(night.waterLight >= 0.85 && night.waterLight < 1);
});

test('fixed-light scenes follow the selected theme without changing illumination', (t) => {
  globalThis.window = new EventTarget();
  globalThis.document = { documentElement: { dataset: { atlasTheme: 'inkstone' } } };
  t.after(() => {
    delete globalThis.window;
    delete globalThis.document;
  });

  const scene = new Scene();
  scene.background = new Color('#bdcec7');
  const fog = scene.fog = new Fog('#afc1ba', 1, 100);
  const sunlight = new DirectionalLight('#fff1ce', 2.4);
  sunlight.castShadow = true;
  scene.add(sunlight);
  const stopWatching = watchSceneTheme(scene);
  assert.equal(scene.background.getHexString(), '4a484a');

  document.documentElement.dataset.atlasTheme = 'celadon';
  window.dispatchEvent(new Event('atlas-theme-change'));
  assert.equal(scene.background.getHexString(), 'bdcec7');
  assert.equal(scene.fog, fog);
  assert.equal(fog.color.getHexString(), 'afc1ba');
  assert.equal(sunlight.visible, true);
  assert.equal(sunlight.castShadow, true);
  assert.equal(sunlight.intensity, 2.4);

  stopWatching();
  document.documentElement.dataset.atlasTheme = 'inkstone';
  window.dispatchEvent(new Event('atlas-theme-change'));
  assert.equal(scene.background.getHexString(), 'bdcec7');
});
