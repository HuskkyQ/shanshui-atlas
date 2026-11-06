import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import metadata from '../src/data/xingping-dem.json' with { type: 'json' };
import water from '../src/data/xingping-water.json' with { type: 'json' };
import settlements from '../src/data/xingping-settlements.json' with { type: 'json' };
import vegetation from '../src/data/xingping-vegetation.json' with { type: 'json' };
import { buildXingpingModel } from '../src/xingping/model.js';
import { createXingpingContext } from '../src/xingping/context.js';

const bytes = await readFile(new URL('../src/data/xingping-dem.bin', import.meta.url));
const elevations = Uint16Array.from({ length: bytes.length / 2 }, (_, index) => bytes.readUInt16LE(index * 2));
const create = (deferDetail = false) => buildXingpingModel({ metadata, elevations, water, deferDetail });

test('geographic conversion keeps east positive and north negative Z', () => {
  const model = create();
  const origin = model.toWorld((metadata.west + metadata.east) / 2, (metadata.south + metadata.north) / 2);
  const east = model.toWorld((metadata.west + metadata.east) / 2 + .01, (metadata.south + metadata.north) / 2);
  const north = model.toWorld((metadata.west + metadata.east) / 2, (metadata.south + metadata.north) / 2 + .01);
  assert.ok(east.x > origin.x); assert.ok(north.z < origin.z);
  model.dispose();
});

test('source water polygon and holes are retained as separate water surfaces', () => {
  const model = create();
  assert.equal(model.waterPolygons.length, water.polygons.length);
  const surfaces = model.group.getObjectByName('xingping-water').children;
  assert.equal(surfaces.flatMap(mesh => mesh.userData.polygonIds).length, water.polygons.length);
  assert.ok(surfaces.every(mesh => mesh.userData.waterLevelMeasured === false));
  const polygon = water.polygons[0];
  const hole = polygon.holes?.[0];
  if (hole) {
    const center = hole.reduce((sum, point) => ({ lon: sum.lon + point.lon / hole.length, lat: sum.lat + point.lat / hole.length }), { lon: 0, lat: 0 });
    const point = model.toWorld(center.lon, center.lat);
    assert.equal(model.isWater(point.x, point.z), false);
    const ray = new THREE.Raycaster(point.clone().setY(model.waterLevel + 10), new THREE.Vector3(0, -1, 0));
    assert.equal(ray.intersectObjects(surfaces, true).length, 0);
  }
  for (const mesh of surfaces) for (let i = 0; i < mesh.geometry.attributes.position.count; i += 1) {
    assert.ok(mesh.geometry.attributes.position.getX(i) >= model.bounds.minX - 1e-5);
    assert.ok(mesh.geometry.attributes.position.getX(i) <= model.bounds.maxX + 1e-5);
    assert.ok(mesh.geometry.attributes.position.getZ(i) >= model.bounds.minZ - 1e-5);
    assert.ok(mesh.geometry.attributes.position.getZ(i) <= model.bounds.maxZ + 1e-5);
  }
  model.dispose();
});

test('near detail changes sampling without shrinking the complete terrain footprint', () => {
  const model = create();
  const camera = new THREE.PerspectiveCamera();
  const center = model.toWorld((metadata.west + metadata.east) / 2, (metadata.south + metadata.north) / 2);
  camera.position.copy(center).add(new THREE.Vector3(0, 20, 80));
  model.update(camera, 0);
  const terrain = model.group.getObjectByName('xingping-terrain');
  const far = terrain.children.find(child => child.visible);
  assert.equal(far.userData.sourceSampleStep, 3);
  model.buildDetail(); camera.position.copy(center).add(new THREE.Vector3(0, 2, 8)); model.update(camera, 1);
  const near = terrain.children.find(child => child.visible);
  assert.equal(near.userData.sourceSampleStep, 1);
  far.geometry.computeBoundingBox(); near.geometry.computeBoundingBox();
  assert.ok(far.geometry.boundingBox.min.distanceTo(near.geometry.boundingBox.min) < .05);
  assert.ok(Math.abs(far.geometry.boundingBox.max.x - near.geometry.boundingBox.max.x) < .05);
  assert.ok(Math.abs(far.geometry.boundingBox.max.z - near.geometry.boundingBox.max.z) < .05);
  model.dispose();
});

test('dispose releases each shared resource exactly once', () => {
  const model = create();
  const calls = new Map();
  model.group.traverse(object => {
    for (const resource of [object.geometry, object.material].filter(Boolean)) {
      if (calls.has(resource)) continue;
      calls.set(resource, 0);
      resource.addEventListener('dispose', () => calls.set(resource, calls.get(resource) + 1));
    }
  });
  model.dispose(); model.dispose();
  assert.ok(calls.size > 0);
  assert.ok([...calls.values()].every(count => count === 1));
});

test('water triangles face upward so the river can be seen from above', () => {
  const model = create();
  model.group.updateMatrixWorld(true);
  for (const surface of model.group.getObjectByName('xingping-water').children) {
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(surface.matrixWorld);
    const normal = surface.geometry.getAttribute('normal');
    for (const i of surface.geometry.index.array) assert.ok(new THREE.Vector3().fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).y > .99);
  }
  model.dispose();
});

test('an island is solid source terrain and has no water triangle over its interior', () => {
  const metadata = { width: 9, height: 9, west: 110.5, east: 110.508, south: 24.92, north: 24.928, minElevation: 150, maxElevation: 150, waterElevation: 140 };
  const outer = [{ lon: 110.5, lat: 24.92 }, { lon: 110.508, lat: 24.92 }, { lon: 110.508, lat: 24.928 }, { lon: 110.5, lat: 24.928 }];
  const hole = [{ lon: 110.503, lat: 24.923 }, { lon: 110.505, lat: 24.923 }, { lon: 110.505, lat: 24.925 }, { lon: 110.503, lat: 24.925 }];
  const model = buildXingpingModel({ metadata, elevations: new Uint16Array(81).fill(1500), water: { polygons: [{ outer, holes: [hole], source: {} }] } });
  const island = model.toWorld(110.504, 24.924), river = model.toWorld(110.501, 24.924);
  assert.equal(model.isWater(island.x, island.z), false);
  assert.equal(model.getHeight(island.x, island.z), model.elevationToWorld(150));
  assert.equal(model.isWater(river.x, river.z), true);
  const surfaces = model.group.getObjectByName('xingping-water');
  model.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(island.x, 100, island.z), new THREE.Vector3(0, -1, 0));
  assert.equal(ray.intersectObject(surfaces, true).length, 0);
  ray.ray.origin.set(river.x, 100, river.z);
  assert.ok(ray.intersectObject(surfaces, true).length > 0);
  model.dispose();
});

test('native land samples keep their recorded height across the full rectangle', () => {
  const model = create(true);
  for (let row = 0; row < metadata.height; row += 11) for (let col = 0; col < metadata.width; col += 13) {
    const point = model.toWorld(metadata.west + col / (metadata.width - 1) * (metadata.east - metadata.west), metadata.north - row / (metadata.height - 1) * (metadata.north - metadata.south));
    const source = elevations[row * metadata.width + col] / 10;
    assert.ok(Math.abs(model.sourceElevation(point.x, point.z) - source) < 1e-7);
    if (!model.isWater(point.x, point.z)) assert.ok(Math.abs(model.getHeight(point.x, point.z) - model.elevationToWorld(source)) < 1e-7);
  }
  model.dispose();
});

test('context loads once after terrain and releases instance buffers with its owner', async () => {
  const model = buildXingpingModel({ metadata, elevations, water, deferDetail: true, includeContext: true });
  assert.equal(model.group.getObjectByName('xingping-settlements'), undefined);
  const context = createXingpingContext(model, {
    fetchImpl: async (url) => ({ ok: true, json: async () => url.includes('settlements') ? settlements : vegetation }),
  });
  const pending = context.start();
  assert.equal(context.start(), pending);
  assert.equal(await pending, true);
  assert.ok(model.group.getObjectByName('xingping-settlements').userData.inferredBuildings > 1000);
  assert.equal(model.group.getObjectByName('xingping-vegetation').userData.generatedTrees, 5000);
  const calls = new Map();
  model.group.traverse(object => {
    for (const resource of [object.geometry, object.material, object.isInstancedMesh ? object : null].filter(Boolean)) {
      if (calls.has(resource)) continue;
      calls.set(resource, 0); resource.addEventListener('dispose', () => calls.set(resource, calls.get(resource) + 1));
    }
  });
  context.dispose(); context.dispose(); model.dispose(); model.dispose();
  assert.ok([...calls.values()].every(v => v === 1));
});

test('leaving during context imports never attaches late scenery', async () => {
  const model = buildXingpingModel({ metadata, elevations, water, deferDetail: true, includeContext: true });
  const context = createXingpingContext(model);
  const pending = context.start(); context.dispose(); model.dispose();
  assert.equal(await pending, false);
  assert.equal(model.group.getObjectByName('xingping-settlements'), undefined);
  assert.equal(model.group.getObjectByName('xingping-vegetation'), undefined);
});

test('disposing during cooperative vegetation sampling does not attach a late group', async () => {
  const model = buildXingpingModel({ metadata, elevations, water, deferDetail: true, includeContext: true });
  let release;
  let yielded;
  const context = createXingpingContext(model, {
    fetchImpl: async (url) => ({ ok: true, json: async () => url.includes('settlements') ? settlements : vegetation }),
    vegetationYieldTask: () => new Promise(resolve => { release = resolve; yielded = true; }),
  });
  const pending = context.start();
  for (let attempt = 0; !yielded && attempt < 100; attempt += 1) await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(yielded, true);
  context.dispose();
  release();
  assert.equal(await pending, false);
  assert.equal(model.group.getObjectByName('xingping-vegetation'), undefined);
  model.dispose();
});
