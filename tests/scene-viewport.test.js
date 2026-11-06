import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { resizeTerrainViewport } from '../src/shared/scene-viewport.js';

test('desktop and mobile resize preserve the current camera pose', () => {
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 1000);
  camera.position.set(12, 9, -16);
  camera.lookAt(3, 2, 1);
  const position = camera.position.clone();
  const quaternion = camera.quaternion.clone();
  const calls = [];
  const renderer = { setSize: (...args) => calls.push(args) };
  for (const [width, height] of [[1280, 720], [390, 844], [844, 390]]) {
    const result = resizeTerrainViewport({ clientWidth: width, clientHeight: height }, camera, renderer);
    assert.deepEqual(result, { width, height });
    assert.deepEqual(camera.position, position);
    assert.deepEqual(camera.quaternion.toArray(), quaternion.toArray());
    assert.equal(camera.aspect, width / height);
    assert.equal(camera.fov, width < 700 ? 53 : 42);
  }
  assert.deepEqual(calls, [[1280, 720, false], [390, 844, false], [844, 390, false]]);
});

test('hidden containers do not change projection or renderer size', () => {
  const camera = new THREE.PerspectiveCamera(42, 1, .1, 1000);
  const projection = camera.projectionMatrix.clone();
  const renderer = { setSize() { assert.fail('hidden container resized'); } };
  assert.equal(resizeTerrainViewport({ clientWidth: 0, clientHeight: 720 }, camera, renderer), null);
  assert.deepEqual(camera.projectionMatrix, projection);
});
