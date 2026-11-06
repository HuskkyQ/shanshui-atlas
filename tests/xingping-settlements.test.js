import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { createXingpingSettlements } from '../src/xingping/settlements.js';

const dataUrl = new URL('../src/data/xingping-settlements.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(dataUrl, 'utf8'));

const world = (lon, lat) => new THREE.Vector3(lon, 0, lat);
const fixture = (buildings = [], roads = []) => ({ buildings, roads, landuse: [], shoals: [], source: {} });
test('road planes face upward and both transformed ends meet the sampled ground', () => {
  const road = { id: 'road', highway: 'path', bridge: false, points: [{ lon: -.1, lat: 0 }, { lon: -.05, lat: .05 }] };
  const getHeight = (x, z) => .2 * x + .1 * z;
  const model = createXingpingSettlements({ toWorld: world, getHeight, data: fixture([], [road]) });
  const roads = model.group.getObjectByName('xingping-source-roads'), matrix = new THREE.Matrix4();
  assert.equal(roads.count, 1); roads.getMatrixAt(0, matrix);
  for (const [localY, p] of [[-.5, road.points[0]], [.5, road.points[1]]]) {
    const actual = new THREE.Vector3(0, localY, 0).applyMatrix4(matrix);
    const expected = new THREE.Vector3(p.lon, getHeight(p.lon, p.lat) + .0015, p.lat);
    assert.ok(actual.distanceTo(expected) < 1e-7);
  }
  assert.ok(new THREE.Vector3(0, 0, 1).applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).y > 0);
  model.dispose();
});
test('only source bridge records cross water and their entire deck stays above the plane', () => {
  const road = { id: 'bridge', highway: 'footway', bridge: true, points: [{ lon: 0, lat: 0 }, { lon: 0, lat: .08 }] };
  const options = { toWorld: world, getHeight: () => 1, isWater: () => true, waterLevel: 2 };
  const model = createXingpingSettlements({ ...options, data: fixture([], [road]) });
  const roads = model.group.getObjectByName('xingping-source-roads'), matrix = new THREE.Matrix4(); roads.getMatrixAt(0, matrix);
  for (const y of [-.5, .5]) assert.ok(new THREE.Vector3(0, y, 0).applyMatrix4(matrix).y > 2.04);
  const dryOnly = createXingpingSettlements({ ...options, data: fixture([], [{ ...road, bridge: false }]) });
  assert.equal(dryOnly.group.getObjectByName('xingping-source-roads').count, 0);
  model.dispose(); dryOnly.dispose();
});
test('a mapped ceremonial gate stays open below the lintel', () => {
  const gate = { id: 'gate', sourceType: 'footprint', ceremonial_gate: 'paifang', points: [{ lon: 1, lat: -.01 }, { lon: 1.2, lat: -.01 }, { lon: 1.2, lat: .01 }, { lon: 1, lat: .01 }, { lon: 1, lat: -.01 }] };
  const model = createXingpingSettlements({ toWorld: world, data: fixture([gate]) });
  const object = model.group.getObjectByName('xingping-gate-gate'); assert.ok(object);
  object.updateWorldMatrix(true, true);
  const ray = new THREE.Raycaster(new THREE.Vector3(1.1, .03, -.2), new THREE.Vector3(0, 0, 1));
  assert.equal(ray.intersectObject(object, true).length, 0);
  assert.equal(model.group.getObjectByName('xingping-building-walls').geometry.attributes.position.count, 0);
  model.dispose();
});
test('concave source footprints remain concave and severe inferred slopes are rejected', () => {
  const points = [[0,0],[.2,0],[.2,.1],[.1,.1],[.1,.2],[0,.2],[0,0]].map(([lon,lat])=>({lon,lat}));
  const original = { id: 'source', sourceType: 'footprint', points };
  const inferred = { id: 'inferred', sourceType: 'inferred', points: [[1,0],[1.2,0],[1.2,.1],[1,.1],[1,0]].map(([lon,lat])=>({lon,lat})) };
  const model = createXingpingSettlements({ toWorld: world, getHeight: (x) => x > .5 ? x : 0, data: fixture([original,inferred]) });
  model.group.updateMatrixWorld(true);
  const roofs = model.group.getObjectByName('xingping-building-roofs');
  const ray = new THREE.Raycaster(new THREE.Vector3(.15, 1, .15), new THREE.Vector3(0,-1,0));
  assert.equal(ray.intersectObject(roofs).length, 0);
  ray.ray.origin.set(.05,1,.15); assert.ok(ray.intersectObject(roofs).length > 0);
  assert.equal(model.group.userData.inferredBuildings, 0);
  model.dispose();
});

test('settlement data preserves source traceability and required geographic layers', () => {
  assert.equal(data.source.dataset, 'OpenStreetMap');
  assert.equal(data.source.snapshotDate, '2026-10-23');
  assert.ok(data.source.generatedAt);
  assert.ok(data.source.sha256);
  assert.ok(data.buildings.length > 0);
  assert.ok(data.counts.inferredBuildings >= 1000);
  assert.ok(data.roads.length > 0);
  assert.ok(data.landuse.some((item) => item.landuse === 'residential'));
  assert.ok(data.shoals.some((item) => item.id === 'way:1316142632'));
});

test('source footprints are closed and use compact real-world dimensions', () => {
  for (const building of data.buildings) {
    assert.ok(['footprint', 'inferred'].includes(building.sourceType));
    assert.ok(building.points.length >= 4);
    assert.deepEqual(building.points[0], building.points.at(-1));
    assert.ok(building.areaM2 > 0);
    if (building.sourceType === 'footprint') assert.ok(building.areaM2 < 20000);
  }
});

test('road records identify bridge status from source tags', () => {
  assert.ok(data.roads.some((road) => road.bridge === true));
  assert.ok(data.roads.every((road) => road.points.length >= 2));
});

test('source geometry is retained and inferred lots are attributed to residential polygons', () => {
  const originals = data.buildings.filter((b) => b.sourceType === 'footprint');
  assert.equal(originals.length, 12);
  assert.ok(data.buildings.filter((b) => b.sourceType === 'inferred').every((b) => b.inferredFrom?.startsWith('way:')));
});

test('settlement renderer exposes lifecycle and avoids water', async () => {
  const { createXingpingSettlements } = await import('../src/xingping/settlements.js');
  const result = createXingpingSettlements({
    toWorld: (lon, lat) => ({ x: (lon - 110.5) * 1000, z: (lat - 24.93) * -1000 }),
    getHeight: () => 0,
    isWater: () => false,
    data,
  });
  assert.ok(result.group);
  assert.equal(typeof result.update, 'function');
  assert.equal(typeof result.dispose, 'function');
  assert.ok(result.group.userData.sourceBuildings > 0);
  result.dispose();
  result.dispose();
});

test('renderer samples water exclusions and does not share mutable materials', async () => {
  const { createXingpingSettlements } = await import('../src/xingping/settlements.js');
  const options = { toWorld: (lon, lat) => ({ x: (lon - 110.5) * 1000, z: (lat - 24.93) * -1000 }), getHeight: () => 0, isWater: (x) => x < 15, data };
  const a = createXingpingSettlements(options); const b = createXingpingSettlements(options);
  assert.ok(a.group.userData.worldExclusions.length > 0);
  assert.notEqual(a.group.children[0].material, b.group.children[0].material);
  a.dispose(); b.dispose();
});
