import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWaterSurface, shouldRenderReflection } from '../src/xingping/water-surface.js';

const ring = (a, b, c, d) => [[a, b], [c, b], [c, d], [a, d]].map(([x, z]) => new THREE.Vector3(x, 0, z));
const polygons = [{ id: 'test', outer: ring(-3, -3, 3, 3), holes: [ring(-1, -1, 1, 1)] }];
test('reflected water still has its exact mapped footprint and an open island', () => {
  const water = createWaterSurface({ polygons, waterLevel: 2, reflection: true });
  water.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(water.group, true).length, 0);
  ray.ray.origin.x = 2;
  const hits = ray.intersectObject(water.group, true);
  assert.ok(hits.length > 0);
  assert.ok(Math.abs(hits[0].point.y - 2) < 1e-8);
  assert.deepEqual(water.mesh.userData.polygonIds, ['test']);
  assert.equal(water.mesh.userData.reflectionFrameRate, 15);
  water.dispose();
});
test('far views skip the reflection pass and render targets are released once', () => {
  const water = createWaterSurface({ polygons, waterLevel: 2, reflection: true });
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 20, 150);
  water.update(camera, 0);
  assert.equal(water.mesh.userData.reflectionEnabled, false);
  camera.position.set(0, 3, 8);
  water.update(camera, 1);
  assert.equal(water.mesh.userData.reflectionEnabled, true);
  let released = 0;
  water.mesh.getRenderTarget().addEventListener('dispose', () => released++);
  water.dispose(); water.dispose();
  assert.equal(released, 1);
});

test('reflection throttle allows the first frame and caps later renders at 15 FPS', () => {
  assert.equal(shouldRenderReflection(0, -Infinity), true);
  assert.equal(shouldRenderReflection(1, 1), false);
  assert.equal(shouldRenderReflection(1 + 1 / 15 - 1e-6, 1), false);
  assert.equal(shouldRenderReflection(1 + 1 / 15 + 1e-4, 1), true);
});
