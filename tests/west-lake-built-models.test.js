import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createWestLakeBuiltModels } from '../src/west-lake-built-models.js';
import { getWestLakeBuiltPOIs } from '../src/west-lake-built-pois.js';

const data = JSON.parse(readFileSync(new URL('../src/data/west-lake-built-landmarks.json', import.meta.url)));
const WATER_HEIGHT = 3.5;
const CENTER_LON = 120.14;
const CENTER_LAT = 30.24;
const LON_SCALE = 111320 * Math.cos(CENTER_LAT * Math.PI / 180) * 0.0025;
const LAT_SCALE = 111320 * 0.0025;

function pointInRing(longitude, latitude, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const intersects = ((yi > latitude) !== (yj > latitude))
      && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function createTerrain() {
  return {
    waterHeight: WATER_HEIGHT,
    toWorld(longitude, latitude) {
      return [(longitude - CENTER_LON) * LON_SCALE, (CENTER_LAT - latitude) * LAT_SCALE];
    },
    isWater(x, z) {
      const longitude = x / LON_SCALE + CENTER_LON;
      const latitude = CENTER_LAT - z / LAT_SCALE;
      return !data.islands.some(({ outer }) => pointInRing(longitude, latitude, outer));
    },
    // Keep the synthetic terrain above water on land while retaining the
    // water-plane contract used by the built-landmark module.
    getHeight() { return WATER_HEIGHT + 0.4; },
  };
}

function createModels() {
  const models = createWestLakeBuiltModels(createTerrain(), data);
  models.group.updateMatrixWorld(true);
  return models;
}

function allMeshes(root) {
  const meshes = [];
  root.traverse((object) => { if (object.isMesh) meshes.push(object); });
  return meshes;
}

function geometryTriangleCount(geometry) {
  const position = geometry.getAttribute('position');
  return geometry.index ? geometry.index.count / 3 : position.count / 3;
}

function updateNear(models) {
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 200);
  camera.position.set(0, 12, 18);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  models.update(camera, 800);
}

test('built landmark geometry contains only finite attributes and stays within the visible budget', () => {
  const models = createModels();
  const meshes = allMeshes(models.group);
  assert.ok(meshes.length > 0);
  meshes.forEach((mesh) => {
    Object.values(mesh.geometry.attributes).forEach((attribute) => {
      for (const value of attribute.array) assert.ok(Number.isFinite(value), `${mesh.name || 'mesh'} has non-finite geometry`);
    });
  });
  updateNear(models);
  const visible = meshes.filter((mesh) => mesh.visible);
  const triangles = visible.reduce((sum, mesh) => sum + geometryTriangleCount(mesh.geometry), 0);
  assert.ok(visible.length <= 45, `built models use ${visible.length} visible draw calls`);
  assert.ok(triangles <= 35000, `built models use ${triangles} visible triangles`);
});

test('causeways and structures are placed at or above the water plane', () => {
  const models = createModels();
  const bounds = new THREE.Box3();
  allMeshes(models.group).forEach((mesh) => {
    bounds.setFromObject(mesh);
    assert.ok(bounds.min.y >= WATER_HEIGHT - 0.01, `${mesh.name || 'mesh'} drops below water height`);
  });
});

test('horizontal causeway faces point upward', () => {
  const models = createModels();
  const surfaces = allMeshes(models.group).filter((mesh) => mesh.userData.surface === 'causeway');
  assert.ok(surfaces.length > 0, 'causeway ribbons should expose userData.surface="causeway"');
  let horizontalFaces = 0;
  surfaces.forEach((mesh) => {
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    const read = (offset) => index ? index.getX(offset) : offset;
    for (let offset = 0; offset < (index ? index.count : position.count); offset += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(position, read(offset));
      const b = new THREE.Vector3().fromBufferAttribute(position, read(offset + 1));
      const c = new THREE.Vector3().fromBufferAttribute(position, read(offset + 2));
      if (Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) > 1e-5) continue;
      const normalY = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).y;
      if (Math.abs(normalY) > 1e-8) {
        horizontalFaces += 1;
        assert.ok(normalY > 0, `${mesh.name || 'causeway'} has a downward-facing horizontal face`);
      }
    }
  });
  assert.ok(horizontalFaces > 0, 'expected causeway top faces');
});

test('all required bridge and landmark anchors are present', () => {
  const models = createModels();
  for (const id of ['yingbo', 'suolan', 'wangshan', 'yadi', 'dongpu', 'kuahong', 'duanqiao', 'jindai', 'huxinting', 'santan']) {
    assert.ok(models.anchors.has(id), `missing anchor: ${id}`);
    const anchor = models.anchors.get(id);
    assert.ok([anchor.x, anchor.y, anchor.z].every(Number.isFinite), `invalid anchor: ${id}`);
  }
  assert.equal(data.bridges.filter(({ id }) => ['yingbo', 'suolan', 'wangshan', 'yadi', 'dongpu', 'kuahong'].includes(id)).length, 6);
});

test('bridge bounds stay centered on their source bridge centerline', () => {
  const models = createModels();
  const high = models.group.children[1];
  high.updateMatrixWorld(true);
  data.bridges.forEach((bridge) => {
    const object = high.getObjectByName(`bridge-${bridge.id}`);
    assert.ok(object, `missing bridge object: ${bridge.id}`);
    const bounds = new THREE.Box3().setFromObject(object);
    const [x, z] = createTerrain().toWorld(...bridge.center);
    const center = bounds.getCenter(new THREE.Vector3());
    assert.ok(Math.hypot(center.x - x, center.z - z) < 0.25, `${bridge.id} is off its source centerline`);
  });
});

test('near and far camera updates do not throw and retain visible built models', () => {
  const models = createModels();
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 200);
  camera.position.set(0, 12, 18);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  assert.doesNotThrow(() => models.update(camera, 800, 1));
  camera.position.set(0, 180, 180);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  assert.doesNotThrow(() => models.update(camera, 800, 2));
  assert.ok(models.group.visible, 'built model group became hidden at far distance');
  assert.ok(allMeshes(models.group).some((mesh) => mesh.visible), 'all built model meshes disappeared at far distance');
});

test('bridge detail LOD changes with real projected distance while base remains visible', () => {
  const models = createModels();
  const bridge = models.group.children[1].getObjectByName('bridge-kuahong');
  assert.ok(bridge);
  bridge.updateMatrixWorld(true);
  const center = bridge.getWorldPosition(new THREE.Vector3());
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 300);
  const visible = (object) => {
    for (let parent = object; parent; parent = parent.parent) if (!parent.visible) return false;
    return true;
  };
  const count = () => {
    let detail = 0, base = 0;
    bridge.traverse((object) => {
      if (!object.isMesh || !visible(object)) return;
      if (object.userData.detail) detail += 1; else base += 1;
    });
    return { detail, base };
  };
  const move = (distance, elapsed) => {
    camera.position.set(center.x, center.y + 0.1, center.z + distance);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    models.update(camera, 800, elapsed);
    return count();
  };
  const near = move(0.3, 1);
  const far = move(180, 2);
  assert.ok(near.detail > far.detail, `expected detail reduction near=${near.detail} far=${far.detail}`);
  assert.ok(near.base > 0 && far.base > 0, 'bridge base disappeared during LOD switch');
});

test('three pools expose three tower source positions or an explicit artistic fallback', () => {
  const santan = data.landmarks.find(({ id }) => id === 'santan');
  assert.ok(santan);
  assert.ok((santan.points?.length || 0) >= 1, 'santan needs at least one mapped tower point');
  const models = createModels();
  const anchor = models.anchors.get('santan');
  assert.ok(anchor.y >= WATER_HEIGHT - 0.01, 'santan anchor fell below water');
  const santanNames = [];
  const towers = [];
  models.group.traverse((object) => {
    if (object.name.startsWith('santan-tower-')) { santanNames.push(object.name); towers.push(object); }
  });
  assert.equal(new Set(santanNames).size, 3, 'three pools should render exactly three tower models');
  const mapped = santan.points[0];
  assert.deepEqual(towers[0].userData.coordinate, [mapped.longitude, mapped.latitude], 'mapped tower moved from its source coordinate');
  towers.forEach((tower) => {
    assert.ok(Math.abs(tower.position.y - (WATER_HEIGHT - 0.005)) < 1e-6, `${tower.name} base is not seated on water`);
    const [longitude, latitude] = tower.userData.coordinate;
    assert.equal(createTerrain().isWater(...createTerrain().toWorld(longitude, latitude)), true, `${tower.name} is inside the island`);
  });
});

test('built data supports the island and POI handoff without duplicate IDs', () => {
  assert.ok(Array.isArray(data.islands), 'built landmark data must include an islands array');
  data.islands.forEach((island) => assert.ok(island.outer?.length > 3, `${island.id} needs a closed island outline`));
  const originalAttractions = JSON.parse(readFileSync(new URL('../src/data/west-lake-attractions.json', import.meta.url)));
  const pois = getWestLakeBuiltPOIs(data, originalAttractions);
  assert.equal(new Set(pois.map(({ id }) => id)).size, pois.length, 'built POIs must have unique IDs');
  ['sudi', 'baidi', 'yingbo', 'suolan', 'wangshan', 'yadi', 'dongpu', 'kuahong', 'duanqiao', 'jindai', 'huxinting', 'santan', 'xiaoyingzhou']
    .forEach((id) => assert.ok(pois.some((poi) => poi.id === id), `missing POI: ${id}`));
  pois.filter(({ modelled }) => modelled).forEach((poi) => {
    assert.ok(Number.isFinite(poi.longitude) && Number.isFinite(poi.latitude), `${poi.id} needs WGS84 coordinates`);
    assert.ok(Array.isArray(poi.viewOffset) && poi.viewOffset.length === 3, `${poi.id} needs a 3D view offset`);
  });
});
