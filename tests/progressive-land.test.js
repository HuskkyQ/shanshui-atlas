import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createProgressiveLand } from '../src/zhouzhuang/progressive-land.js';

const materials = { ground: new THREE.MeshBasicMaterial(), stone: new THREE.MeshBasicMaterial() };
const bounds = { minX: 0, maxX: 16, minZ: 0, maxZ: 16 };
const waterQuery = { signedDistance: (x) => Math.abs(x - 8) < 1 ? -1 : 1 };

test('progressive land replaces coarse geometry with worker buffers', async () => {
  let handler;
  let terminated = false;
  const worker = { set onmessage(value) { handler = value; }, postMessage() {
    handler({ data: { type: 'land-geometry', position: new Float32Array([0, 2, 0, 1, 2, 0, 0, 2, 1]), bankPosition: new Float32Array() } });
  }, terminate() { terminated = true; } };
  const progressive = createProgressiveLand(materials, waterQuery, bounds, { workerFactory: () => worker });
  assert.equal(await progressive.ready, true);
  assert.equal(progressive.group.getObjectByName('land-blocks').geometry.getAttribute('position').count, 3);
  assert.equal(terminated, true);
  progressive.dispose();
});

test('dispose resolves pending work and ignores late worker messages', async () => {
  let handler;
  const worker = { set onmessage(value) { handler = value; }, postMessage() {}, terminate() {} };
  const progressive = createProgressiveLand(materials, waterQuery, bounds, { workerFactory: () => worker });
  progressive.dispose();
  assert.equal(await progressive.ready, false);
  handler({ data: { type: 'land-geometry', position: new Float32Array([0, 2, 0]), bankPosition: new Float32Array() } });
  assert.equal(progressive.group.getObjectByName('land-blocks').geometry.getAttribute('position').count > 3, true);
});

test('a failed worker still completes full terrain and allows walking', async () => {
  let worker;
  const warn = console.warn;
  console.warn = () => {};
  try {
    const progressive = createProgressiveLand(materials, waterQuery, bounds, {
      workerFactory: () => (worker = { postMessage() {}, terminate() {} }),
    });
    worker.onerror(new Error('worker unavailable'));
    assert.equal(await progressive.ready, true);
    progressive.dispose();
  } finally {
    console.warn = warn;
  }
});
