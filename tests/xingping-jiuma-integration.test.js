import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import metadata from '../src/data/xingping-dem.json' with { type: 'json' };
import water from '../src/data/xingping-water.json' with { type: 'json' };
import { buildXingpingModel } from '../src/xingping/model.js';
import { getPOIView, xingpingPOIs } from '../src/xingping/pois.js';
import * as THREE from 'three';

const demBytes = readFileSync(new URL('../src/data/xingping-dem.bin', import.meta.url));
const elevations = Uint16Array.from({ length: demBytes.length / 2 }, (_, index) =>
  demBytes.readUInt16LE(index * 2),
);

function createModel() {
  return buildXingpingModel({
    metadata,
    elevations,
    water,
    deferDetail: true,
    includeContext: true,
  });
}

function finiteAttribute(attribute, label) {
  assert.ok(attribute, `${label} attribute is present`);
  for (let i = 0; i < attribute.array.length; i += 1)
    assert.ok(Number.isFinite(attribute.array[i]), `${label}[${i}] is finite`);
}

function contains(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function insideWater(model, x, z) {
  return model.waterPolygons.some(
    ({ outer, holes }) =>
      contains(x, z, outer) && !(holes || []).some((hole) => contains(x, z, hole)),
  );
}

test('real includeContext model has finite geometry and the Jiuma patch stays out of water', () => {
  const model = createModel();
  let geometryCount = 0;
  model.group.traverse((object) => {
    if (!object.geometry) return;
    geometryCount += 1;
    finiteAttribute(object.geometry.getAttribute('position'), `${object.name}.position`);
    if (object.geometry.getAttribute('normal'))
      finiteAttribute(object.geometry.getAttribute('normal'), `${object.name}.normal`);
  });
  assert.ok(geometryCount > 0);

  // The cliff reconstruction must stay on land. Shoreline connectors are
  // intentionally allowed to dip a few millimetres below the water surface to
  // close the mapped edge, so they are not part of this land-patch assertion.
  for (const name of ['jiuma-rock-face']) {
    const object = model.group.getObjectByName(name);
    assert.ok(object, `${name} is included in the context model`);
    const positions = object.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i += 1)
      assert.equal(
        insideWater(model, positions.getX(i), positions.getZ(i)),
        false,
        `${name} vertex ${i} is not in mapped water`,
      );
  }
  assert.ok(model.jiumaCliff?.stations.length >= 3);
  model.dispose();
});

test('source elevation remains unchanged outside the Jiuma display patch', () => {
  const model = createModel();
  let checked = 0;
  for (let row = 0; row < metadata.height; row += 11)
    for (let col = 0; col < metadata.width; col += 13) {
      const lon = metadata.west + (col / (metadata.width - 1)) * (metadata.east - metadata.west);
      const lat =
        metadata.north - (row / (metadata.height - 1)) * (metadata.north - metadata.south);
      const point = model.toWorld(lon, lat);
      if (model.isWater(point.x, point.z) || model.jiumaCliff.getHeight(point.x, point.z) !== null)
        continue;
      const source = model.elevationToWorld(model.sourceElevation(point.x, point.z));
      assert.ok(Math.abs(model.getHeight(point.x, point.z) - source) < 1e-7);
      checked += 1;
    }
  assert.ok(checked > 100);
  model.dispose();
});

test('Jiuma marker coordinates remain source-backed despite specialized framing', () => {
  const model = createModel();
  const poi = xingpingPOIs.find((item) => item.id === 'jiumaha');
  const view = getPOIView(model, poi);
  const source = model.toWorld(poi.longitude, poi.latitude);
  assert.ok(view.markerPosition, 'specialized framing exposes a marker position');
  assert.equal(view.markerPosition.x, source.x);
  assert.equal(view.markerPosition.z, source.z);
  const portrait = getPOIView(model, poi, 390 / 844);
  assert.ok(
    portrait.position.distanceTo(portrait.target) > view.position.distanceTo(view.target) * 1.4,
  );
  assert.ok(
    portrait.markerPosition.equals(view.markerPosition),
    'responsive framing does not move the source marker',
  );
  for (const framed of [view, portrait])
    for (let step = 16; step <= 96; step++) {
      const point = framed.target.clone().lerp(framed.position, step / 96);
      assert.ok(
        point.y >= model.getHeight(point.x, point.z) + 0.08,
        'river-side approach stays clear of foreground terrain',
      );
    }
  for (const vector of [view.target, view.position, view.markerPosition])
    for (const value of vector.toArray()) assert.ok(Number.isFinite(value));
  model.dispose();
});

test('mapped cliff-bank samples use the reconstructed toe instead of a high DSM curtain', () => {
  const model = createModel();
  const stations = model.jiumaCliff.stations;
  for (let i = Math.ceil(stations.length * 0.25); i < stations.length * 0.75; i += 3) {
    const { foot, land } = stations[i];
    const x = foot.x - land.x * 0.003,
      z = foot.z - land.z * 0.003;
    assert.ok(Math.abs(model.jiumaCliff.getBankHeight(x, z) - model.waterLevel) < 0.02);
  }
  model.dispose();
});

test('back and end edges meet the actual source triangles and survive terrain refinement', () => {
  const model = createModel();
  const cliff = model.jiumaCliff.group;
  model.buildDetail();
  const native = model.group.getObjectByName('xingping-terrain-source-detail');
  const surface = cliff.getObjectByName('jiuma-rock-face');
  const position = surface.geometry.attributes.position,
    uv = surface.geometry.attributes.uv;
  native.updateMatrixWorld(true);
  let checked = 0;
  for (let i = 0; i < position.count; i++) {
    if (
      uv.getY(i) < 1.099 &&
      uv.getX(i) > 1e-6 &&
      uv.getX(i) < model.jiumaCliff.stations.at(-1).distance - 1e-6
    )
      continue;
    const point = new THREE.Vector3().fromBufferAttribute(position, i);
    const ray = new THREE.Raycaster(point.clone().setY(20), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(native)[0];
    assert.ok(
      hit && Math.abs(hit.point.y - point.y) < 0.01,
      'seam meets rendered triangles rather than a different interpolation',
    );
    checked += 1;
  }
  assert.ok(checked > 100);
  model.update({ position: { distanceTo: () => 0 } });
  assert.equal(model.group.getObjectByName('jiuma-cliff'), cliff);
  assert.equal(native.visible, true);
  model.update({ position: { distanceTo: () => 1000 } });
  assert.equal(model.group.getObjectByName('jiuma-cliff'), cliff);
  model.dispose();
});

test('includeContext resources dispose once when the model is disposed repeatedly', () => {
  const model = createModel();
  const calls = new Map();
  model.group.traverse((object) => {
    for (const resource of [
      object.geometry,
      object.material,
      object.customDepthMaterial,
      object.isInstancedMesh ? object : null,
    ].filter(Boolean)) {
      if (calls.has(resource) || typeof resource.addEventListener !== 'function') continue;
      calls.set(resource, 0);
      resource.addEventListener('dispose', () => calls.set(resource, calls.get(resource) + 1));
    }
  });
  model.dispose();
  model.dispose();
  assert.ok(calls.size > 0);
  assert.ok([...calls.values()].every((count) => count === 1));
});
