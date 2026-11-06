import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createJiumaCliff } from '../src/xingping/jiuma-cliff.js';

const terrainHeight = (x, z) => 0.35 + Math.max(0, x) * (1.15 + 0.12 * Math.sin(z));
const makeCliff = () =>
  createJiumaCliff({
    line: [new THREE.Vector3(1, 0, -3), new THREE.Vector3(1.1, 0, 0), new THREE.Vector3(0.9, 0, 3)],
    terrainHeight,
    isWater: (x) => x < 0,
    waterLevel: 0.3,
    bounds: { minX: -4, maxX: 6, minZ: -5, maxZ: 5 },
  });

test('the river-facing cliff has steep geometric faces and joins its original back edge', () => {
  const cliff = makeCliff();
  assert.ok(cliff);
  const mesh = cliff.group.getObjectByName('jiuma-rock-face');
  assert.ok(mesh);
  let triangles = 0;
  cliff.group.traverse((object) => {
    if (object.geometry)
      triangles +=
        ((object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3) *
        (object.isInstancedMesh ? object.count : 1);
  });
  assert.ok(triangles < 20000, 'local rock and shrub geometry has a fixed drawing budget');
  cliff.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(-3, 1.5, 0), new THREE.Vector3(1, 0, 0));
  const hit = ray.intersectObject(mesh)[0];
  assert.ok(hit, 'a horizontal approach meets a real wall rather than colored slope fragments');
  assert.ok(hit.face.normal.x < -0.7 && Math.abs(hit.face.normal.y) < 0.5);
  for (const station of cliff.stations) {
    assert.ok(Math.abs(station.back.y - terrainHeight(station.back.x, station.back.z)) < 1e-8);
  }
  assert.equal(cliff.getHeight(5, 4), null, 'the display patch does not affect exterior terrain');
  cliff.dispose();
});

test('cliff vertices stay on land and have finite normals, a source bound and safe cleanup', () => {
  const cliff = makeCliff();
  const resources = new Map();
  cliff.group.traverse((object) => {
    for (const resource of [object.geometry, object.material].filter(Boolean)) {
      if (resources.has(resource)) continue;
      resources.set(resource, 0);
      resource.addEventListener('dispose', () =>
        resources.set(resource, resources.get(resource) + 1),
      );
    }
    if (!object.geometry) return;
    const position = object.geometry.getAttribute('position');
    const normal = object.geometry.getAttribute('normal');
    for (let i = 0; i < position.count; i++) {
      if (!object.isInstancedMesh)
        assert.ok(position.getX(i) >= -0.015, 'surface does not expand into mapped water');
      for (const attribute of [position, normal])
        for (let axis = 0; axis < 3; axis++) {
          assert.ok(Number.isFinite(attribute.array[i * 3 + axis]));
        }
    }
  });
  assert.equal(cliff.group.userData.measuredGeometry, false);
  assert.ok(cliff.footprint.outer.length > 8);
  cliff.dispose();
  cliff.dispose();
  assert.ok([...resources.values()].every((count) => count === 1));
});
