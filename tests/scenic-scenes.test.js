import test from 'node:test';
import assert from 'node:assert/strict';
import { getScenicScene } from '../src/west-lake/scenic-scenes.js';

test('all four ready scenes have their own POI, content, and lazy loader', () => {
  const leifeng = getScenicScene('leifeng-pagoda');
  const santan = getScenicScene('santanyinyue');
  const lingyin = getScenicScene('lingyin-temple');
  const jingci = getScenicScene('jingci-temple');
  assert.equal(leifeng.poiId, 'leifeng');
  assert.equal(santan.poiId, 'santan');
  assert.equal(lingyin.poiId, 'lingyin-temple');
  assert.equal(jingci.poiId, 'jingci-temple');
  for (const scene of [leifeng, santan, lingyin, jingci]) {
    assert.equal(scene.status, 'ready');
    assert.equal(scene.enabled, true);
    assert.equal(scene.hidden, false);
    assert.equal(typeof scene.loader, 'function');
    assert.equal(scene.content.id, scene.id);
    assert.equal(scene.content.name, scene.name);
    const count = scene === lingyin || scene === jingci ? 7 : 4;
    assert.equal(scene.content.hotspots.length, count);
    assert.equal(new Set(scene.content.hotspots.map((item) => item.id)).size, count);
    scene.content.hotspots.forEach((item) => {
      assert.ok(item.description.length > 0);
      assert.equal(new URL(item.source.url).protocol, 'https:');
    });
  }
  assert.notEqual(leifeng.content, santan.content);
  assert.notEqual(leifeng.loader, santan.loader);
  assert.notEqual(lingyin.content, leifeng.content);
  assert.notEqual(lingyin.loader, santan.loader);
});

test('unknown scenes do not invent a loader or entry', () => {
  assert.equal(getScenicScene('unknown'), null);
});
