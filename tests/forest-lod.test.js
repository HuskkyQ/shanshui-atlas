import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createForest } from '../src/forest.js';

const VARIANTS = new Set([
  'layered-pine',
  'windswept-pine',
  'broadleaf',
  'slender-broadleaf',
]);

function makeTerrain({ minX = -6, maxX = 6, minZ = -6, maxZ = 6, water = () => false, height = 1.5 } = {}) {
  return {
    bounds: { minX, maxX, minZ, maxZ },
    getHeight: () => height,
    isWater: water,
  };
}

function makeCamera(y, z, fov = 45) {
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 500);
  camera.position.set(0, y, z);
  camera.lookAt(0, 1.5, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function activeEntries(group) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const entries = [];
  for (const mesh of group.children) {
    for (let index = 0; index < mesh.count; index += 1) {
      mesh.getMatrixAt(index, matrix);
      position.setFromMatrixPosition(matrix);
      entries.push({
        detail: mesh.userData.detail,
        variant: mesh.userData.variant,
        index,
        x: position.x,
        y: position.y,
        z: position.z,
      });
    }
  }
  return entries;
}

function counts(group) {
  return group.children.reduce((result, mesh) => {
    result.total += mesh.count;
    if (mesh.userData.detail === 'near') result.near += mesh.count;
    return result;
  }, { total: 0, near: 0 });
}

function assertFiniteGeometry(mesh) {
  for (const name of ['position', 'normal', 'color']) {
    const attribute = mesh.geometry.getAttribute(name);
    assert.ok(attribute, `${mesh.userData.variant}/${mesh.userData.detail} has ${name}`);
    for (const value of attribute.array) assert.ok(Number.isFinite(value), `${name} contains a finite value`);
  }
}

test('forest exposes four finite near/far tree geometries with grounded roots', () => {
  const { group } = createForest(makeTerrain(), { kind: 'huangshan' });
  assert.equal(group.children.length, 8);
  assert.deepEqual(new Set(group.children.map((mesh) => mesh.userData.variant)), VARIANTS);
  assert.deepEqual(new Set(group.children.map((mesh) => mesh.userData.detail)), new Set(['near', 'far']));

  for (const mesh of group.children) {
    assertFiniteGeometry(mesh);
    const position = mesh.geometry.getAttribute('position');
    let minimumY = Infinity;
    for (let index = 1; index < position.count * 3; index += 3) minimumY = Math.min(minimumY, position.array[index]);
    assert.ok(Math.abs(minimumY) < 0.02, `${mesh.userData.variant}/${mesh.userData.detail} root is grounded`);
    const triangles = mesh.geometry.index ? mesh.geometry.index.count / 3 : position.count / 3;
    if (mesh.userData.detail === 'near') assert.ok(triangles < 1300, `${mesh.userData.variant} near is bounded`);
    else assert.ok(triangles <= 140, `${mesh.userData.variant} far is bounded`);
  }
});

test('forest placement is seeded, stays on land, and avoids clearings', () => {
  const terrain = makeTerrain({ water: (x) => x > 0 });
  const options = {
    kind: 'west-lake',
    clearings: [{ x: -2, z: -2, radius: 1.5 }],
    paths: [[[-5, -4], [0, 0], [4, 4]]],
  };
  const first = createForest(terrain, options);
  const second = createForest(terrain, options);
  const camera = makeCamera(0, 16);
  first.update(camera, 720, 0);
  second.update(camera, 720, 0);
  const a = activeEntries(first.group);
  const b = activeEntries(second.group);
  assert.equal(a.length, b.length);
  assert.deepEqual(a, b, 'same terrain and camera produce the same seeded placement');
  assert.ok(a.length > 0, 'test terrain contains trees');
  for (const entry of a) {
    assert.ok(entry.x >= terrain.bounds.minX && entry.x <= terrain.bounds.maxX);
    assert.ok(entry.z >= terrain.bounds.minZ && entry.z <= terrain.bounds.maxZ);
    assert.ok(entry.x <= 0.000001, 'active trees stay off the water stub');
    assert.ok(Math.hypot(entry.x + 2, entry.z + 2) >= 1.5 - 0.0001, 'active trees avoid clearings');
    for (const path of options.paths) {
      for (let index = 1; index < path.length; index += 1) {
        const [ax, az] = path[index - 1];
        const [bx, bz] = path[index];
        const dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((entry.x - ax) * dx + (entry.z - az) * dz) / (dx * dx + dz * dz)));
        const distance = Math.hypot(entry.x - (ax + t * dx), entry.z - (az + t * dz));
        assert.ok(distance >= 0.36 - 0.0001, 'active trees avoid every path segment');
      }
    }
    assert.ok(Math.abs(entry.y - 1.485) < 0.0001, 'tree roots use the terrain height minus the planting offset');
  }
});

test('forest increases density and detail when the camera moves closer', () => {
  const { group, update } = createForest(makeTerrain(), { kind: 'huangshan' });
  const farCamera = makeCamera(45, 65);
  const nearCamera = makeCamera(10, 16);
  update(farCamera, 720, 0);
  const far = counts(group);
  update(nearCamera, 720, 1);
  const near = counts(group);
  assert.ok(near.total > far.total, `near total ${near.total} should exceed far total ${far.total}`);
  assert.ok(near.near > far.near, `near detail ${near.near} should exceed far detail ${far.near}`);
  update(farCamera, 720, 2);
  assert.deepEqual(counts(group), far, 'moving back restores the far LOD counts');
});

test('near detail is capped while remaining candidates fall back to far detail', () => {
  const { group, update } = createForest(makeTerrain({ minX: -15, maxX: 15, minZ: -15, maxZ: 15 }), { kind: 'huangshan' });
  const camera = makeCamera(45, 65);
  update(camera, 8000, 0);
  const result = counts(group);
  assert.ok(group.userData.candidateCount > 1400, 'large terrain provides enough candidates to exercise the cap');
  assert.ok(result.near <= 1400, `near detail count ${result.near} stays capped`);
  assert.equal(result.total, group.userData.candidateCount, 'far detail keeps every candidate visible');
  assert.equal(result.total - result.near, group.children
    .filter((mesh) => mesh.userData.detail === 'far')
    .reduce((sum, mesh) => sum + mesh.count, 0));
});
