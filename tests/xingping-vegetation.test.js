import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import sourceWoodland from '../src/data/xingping-vegetation.json' with { type: 'json' };
import { createXingpingVegetation, createXingpingVegetationAsync } from '../src/xingping/vegetation.js';

const bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
const createOptions = (extra = {}) => ({
  bounds,
  toWorld: (lon, lat) => new THREE.Vector3(lon, 0, -lat),
  getHeight: (x, z) => 0.2 + Math.abs(x + z) * 0.005,
  sourceElevation: () => 180,
  isWater: (x, z) => Math.abs(x) < 0.22 && Math.abs(z) < 5,
  seed: 'test-xingping',
  maxTrees: 700,
  woodland: { source: sourceWoodland.source, polygons: [{ id: 'fixture:wood', points: [{ x: -4, z: -4 }, { x: 4, z: -4 }, { x: 4, z: 4 }, { x: -4, z: 4 }] }] },
  ...extra,
});

function instancePositions(group) {
  const mesh = group.children.find(child => child.isInstancedMesh);
  const matrix = new THREE.Matrix4();
  const positions = [];
  for (let i = 0; i < mesh.count; i += 1) {
    mesh.getMatrixAt(i, matrix);
    positions.push([matrix.elements[12], matrix.elements[13], matrix.elements[14]]);
  }
  return positions;
}

test('vegetation is an artistic, source-bounded two-pass instanced layer', () => {
  const vegetation = createXingpingVegetation(createOptions());
  assert.equal(vegetation.group.name, 'xingping-vegetation');
  assert.ok(vegetation.group.children.length <= 2);
  assert.ok(vegetation.group.children.every(child => child.isInstancedMesh));
  assert.equal(vegetation.group.userData.artistic, true);
  assert.match(vegetation.group.userData.source, /OSM|photo/i);
  assert.ok(vegetation.group.userData.treeHeightMeters[0] >= 6);
  assert.ok(vegetation.group.userData.treeHeightMeters[1] <= 12);
  assert.ok(vegetation.group.children.every(child => child.count <= 8000));
  vegetation.dispose();
});

test('tree bases stay out of the mapped river and explicit exclusions', () => {
  const vegetation = createXingpingVegetation(createOptions({ exclusions: [{ x: 2, z: 2, radius: 1.2 }] }));
  for (const [x, , z] of instancePositions(vegetation.group)) {
    assert.ok(Math.abs(x) > 0.3, `tree intersects river at ${x},${z}`);
    assert.ok(Math.hypot(x - 2, z - 2) > 1.2, `tree intersects exclusion at ${x},${z}`);
  }
  vegetation.dispose();
});

test('source woodland polygons are required and tree height stays within the world scale', () => {
  const vegetation = createXingpingVegetation(createOptions({ maxTrees: 100 }));
  assert.ok(sourceWoodland.counts.total >= 119);
  assert.ok(sourceWoodland.counts.relationPolygons > 0);
  assert.equal(vegetation.group.userData.sourcePolygons.length, 1);
  const trunks = vegetation.group.children.find(child => child.name === 'xingping-tree-trunks');
  const canopies = vegetation.group.children.find(child => child.name === 'xingping-tree-canopies');
  const trunkMatrix = new THREE.Matrix4();
  const canopyMatrix = new THREE.Matrix4();
  for (let i = 0; i < trunks.count; i += 1) {
    trunks.getMatrixAt(i, trunkMatrix); canopies.getMatrixAt(i, canopyMatrix);
    trunks.geometry.computeBoundingBox(); canopies.geometry.computeBoundingBox();
    const trunkBox = trunks.geometry.boundingBox.clone().applyMatrix4(trunkMatrix);
    const canopyBox = canopies.geometry.boundingBox.clone().applyMatrix4(canopyMatrix);
    const height = Math.max(trunkBox.max.y, canopyBox.max.y) - trunkBox.min.y;
    assert.ok(height <= .1201);
    assert.ok(height >= .0599);
  }
  vegetation.dispose();
});

test('building, farmland and road exclusions accept source-shaped polygons and lines', () => {
  const vegetation = createXingpingVegetation(createOptions({
    maxTrees: 400,
    buildings: [{ points: [{ x: -3, z: -1 }, { x: -2, z: -1 }, { x: -2, z: 1 }, { x: -3, z: 1 }] }],
    shoals: [{ points: [{ x: 1, z: -1 }, { x: 2, z: -1 }, { x: 2, z: 1 }, { x: 1, z: 1 }] }],
    roads: [{ points: [{ x: -4, z: 2 }, { x: 4, z: 2 }] }],
  }));
  for (const [x, , z] of instancePositions(vegetation.group)) {
    assert.ok(!(x > -3 && x < -2 && z > -1 && z < 1));
    assert.ok(!(x > 1 && x < 2 && z > -1 && z < 1));
    assert.ok(Math.abs(z - 2) >= 0.08);
  }
  vegetation.dispose();
});

test('source woodland holes remain empty', () => {
  const vegetation = createXingpingVegetation(createOptions({
    maxTrees: 400,
    woodland: { source: sourceWoodland.source, polygons: [{
      id: 'fixture:hole',
      outer: [{ x: -4, z: -4 }, { x: 4, z: -4 }, { x: 4, z: 4 }, { x: -4, z: 4 }],
      holes: [[{ x: -1, z: -1 }, { x: 1, z: -1 }, { x: 1, z: 1 }, { x: -1, z: 1 }]],
    }] },
  }));
  for (const [x, , z] of instancePositions(vegetation.group)) assert.ok(!(x > -1 && x < 1 && z > -1 && z < 1));
  vegetation.dispose();
});

test('far camera hides tree detail and near camera restores it', () => {
  const vegetation = createXingpingVegetation(createOptions({ maxTrees: 100 }));
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 0, 30);
  assert.equal(vegetation.update(camera), true);
  assert.equal(vegetation.group.visible, false);
  camera.position.set(0, 0, 1);
  assert.equal(vegetation.update(camera), true);
  assert.equal(vegetation.group.visible, true);
  assert.equal(vegetation.update(camera), false);
  vegetation.dispose();
});

test('same seed produces the same transforms and different seeds vary them', () => {
  const a = createXingpingVegetation(createOptions({ seed: 'same' }));
  const b = createXingpingVegetation(createOptions({ seed: 'same' }));
  const c = createXingpingVegetation(createOptions({ seed: 'different' }));
  assert.deepEqual(instancePositions(a.group), instancePositions(b.group));
  assert.notDeepEqual(instancePositions(a.group), instancePositions(c.group));
  a.dispose(); b.dispose(); c.dispose();
});

test('dispose is idempotent and releases each shared resource once', () => {
  const vegetation = createXingpingVegetation(createOptions());
  const trunks = vegetation.group.children.find(child => child.name === 'xingping-tree-trunks');
  const canopies = vegetation.group.children.find(child => child.name === 'xingping-tree-canopies');
  let instanceDisposals = 0;
  const trunkDispose = trunks.dispose.bind(trunks), canopyDispose = canopies.dispose.bind(canopies);
  trunks.dispose = () => { instanceDisposals += 1; trunkDispose(); };
  canopies.dispose = () => { instanceDisposals += 1; canopyDispose(); };
  let meshDisposeEvents = 0;
  trunks.addEventListener('dispose', () => { meshDisposeEvents += 1; });
  canopies.addEventListener('dispose', () => { meshDisposeEvents += 1; });
  const calls = new Map();
  vegetation.group.traverse(object => {
    for (const resource of [object.geometry, object.material, object.instanceMatrix].filter(resource => resource && typeof resource.addEventListener === 'function')) {
      if (calls.has(resource)) continue;
      calls.set(resource, 0);
      resource.addEventListener('dispose', () => calls.set(resource, calls.get(resource) + 1));
    }
  });
  vegetation.dispose(); vegetation.dispose();
  assert.equal(instanceDisposals, 2);
  assert.equal(meshDisposeEvents, 2);
  assert.ok(calls.size > 0);
  assert.ok([...calls.values()].every(count => count === 1));
});

test('async sampling yields and keeps the synchronous transform contract', async () => {
  let yields = 0;
  const sync = createXingpingVegetation(createOptions({ seed: 'async-contract', maxTrees: 160 }));
  const asyncResult = await createXingpingVegetationAsync(createOptions({ seed: 'async-contract', maxTrees: 160 }), {
    yieldTask: async () => { yields += 1; },
  });
  assert.ok(yields > 0);
  assert.equal(asyncResult.group.userData.generatedTrees, sync.group.userData.generatedTrees);
  const syncMesh = sync.group.children.find(child => child.name === 'xingping-tree-canopies');
  const asyncMesh = asyncResult.group.children.find(child => child.name === 'xingping-tree-canopies');
  assert.equal(asyncMesh.count, syncMesh.count);
  const a = new THREE.Matrix4(), b = new THREE.Matrix4();
  for (let index = 0; index < syncMesh.count; index += 1) {
    syncMesh.getMatrixAt(index, a); asyncMesh.getMatrixAt(index, b);
    assert.deepEqual(b.elements, a.elements);
  }
  sync.dispose(); asyncResult.dispose();
});

test('aborted async sampling does not construct a partial group', async () => {
  const controller = new AbortController();
  let yielded = false;
  await assert.rejects(() => createXingpingVegetationAsync(createOptions({ maxTrees: 5000 }), {
    signal: controller.signal,
    yieldTask: async () => { yielded = true; controller.abort(); },
  }), { name: 'AbortError' });
  assert.equal(yielded, true);
});
