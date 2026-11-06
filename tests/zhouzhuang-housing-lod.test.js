import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHousingLOD } from '../src/zhouzhuang/housing-lod.js';

const houses = Array.from({ length: 12 }, (_, i) => ({ x: i * 12, z: 0, width: 6, depth: 5 }));
function camera(x, z = 0, y = 8) { const c = new THREE.PerspectiveCamera(); c.position.set(x, y, z); return c; }

test('initial update renders every footprint in coarse and builds no detail', () => {
  const calls = [];
  const lod = createHousingLOD({ houses, createBatch: (items, level) => { calls.push([items.length, level]); return new THREE.Group(); } });
  lod.update(camera(0), { immediate: false });
  assert.equal(calls.filter(([, level]) => level === 'detail').length, 0);
  assert.equal(calls.filter(([, level]) => level === 'coarse').reduce((sum, [count]) => sum + count, 0), houses.length);
  assert.equal(lod.stats.visibleHouseCount, houses.length);
  assert.equal(lod.stats.detailedHouseCount, 0);
});

test('near camera promotes one cached chunk at a time without duplicate visible houses', () => {
  const calls = [];
  const lod = createHousingLOD({ houses, createBatch: (items, level, key) => { calls.push([items.length, level, key]); return new THREE.Group(); } });
  const c = camera(0);
  lod.update(c);
  const first = calls.length;
  lod.update(c);
  assert.ok(calls.length <= first + 2);
  lod.update(c);
  assert.equal(lod.stats.visibleHouseCount, houses.length);
  assert.equal(lod.stats.detailedHouseCount, houses.length);
  assert.ok(lod.group.children.filter((child) => child.visible).length <= lod.chunkCount * 2);
  const before = calls.length;
  const refreshes = lod.stats.spatialRefreshes;
  lod.update(c);
  assert.equal(calls.length, before);
  assert.equal(lod.stats.spatialRefreshes, refreshes, 'stationary frames reuse the ranked distance cache');
  lod.update(camera(2), { immediate: true });
  assert.ok(lod.stats.spatialRefreshes > refreshes, 'camera movement refreshes the cache');
});

test('walking keeps nearby shell available and dispose prevents new batches', () => {
  let calls = 0;
  const lod = createHousingLOD({ houses, createBatch: () => { calls += 1; return new THREE.Group(); } });
  lod.update(camera(0), { walking: true, immediate: true });
  assert.equal(lod.stats.visibleHouseCount, houses.length);
  lod.dispose();
  const before = calls;
  lod.update(camera(0), { immediate: true });
  assert.equal(calls, before);
  assert.equal(lod.stats.builtChunks, 0);
});

test('vertical distance keeps a high top-down camera at the coarse level', () => {
  const calls = [];
  const lod = createHousingLOD({ houses, createBatch: (items, level) => { calls.push(level); return new THREE.Group(); } });
  lod.update(camera(0, 0, 2000), { immediate: true });
  assert.equal(calls.filter((level) => level === 'detail').length, 0);
  assert.equal(lod.stats.visibleHouseCount, houses.length);
});

test('moving far away keeps all coarse footprints covered', () => {
  const lod = createHousingLOD({ houses, createBatch: (items, level) => {
    const group = new THREE.Group();
    group.userData = { lodLevel: level, houseCount: items.length };
    return group;
  } });
  lod.update(camera(0), { immediate: true });
  lod.update(camera(2000, 2000), { immediate: true });
  const coarse = lod.group.children.filter((child) => child.visible && child.userData.lodLevel === 'coarse');
  assert.equal(coarse.reduce((sum, child) => sum + child.userData.houseCount, 0), houses.length);
  assert.equal(lod.stats.visibleHouseCount, houses.length);
  assert.equal(lod.stats.detailedHouseCount, 0);
});

test('detail layers overlay their shell without double-counting houses', () => {
  const lod = createHousingLOD({ houses: houses.slice(0, 4), createBatch: () => new THREE.Group() });
  lod.update(camera(0), { immediate: true });
  const visible = lod.group.children.filter((child) => child.visible);
  assert.ok(visible.some((child) => child.userData.lodLevel === 'shell'));
  assert.ok(visible.some((child) => child.userData.lodLevel === 'detail'));
  assert.equal(lod.stats.visibleHouseCount, 4);
});

test('dispose leaves cached groups for the owner to release', () => {
  const lod = createHousingLOD({ houses, createBatch: () => new THREE.Group() });
  lod.update(camera(0), { immediate: true });
  const before = lod.group.children.length;
  lod.dispose();
  assert.equal(lod.group.children.length, before);
  assert.equal(lod.stats.builtChunks, 0);
});
