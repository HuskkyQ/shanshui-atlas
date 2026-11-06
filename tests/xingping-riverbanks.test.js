import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import metadata from '../src/data/xingping-dem.json' with { type: 'json' };
import water from '../src/data/xingping-water.json' with { type: 'json' };
import { createRiverbanks, MAX_CONNECTOR_RISE } from '../src/xingping/riverbanks.js';
import { buildXingpingModel } from '../src/xingping/model.js';

const shoreline = (points) => ({
  outer: points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
  holes: [],
});
const create = (terrainHeight) =>
  createRiverbanks({
    shoals: [],
    toWorld: () => new THREE.Vector3(),
    waterLevel: 0,
    shorelines: [
      shoreline([
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ]),
    ],
    terrainHeight,
  });
const edgeDistance = (x, z, ring) =>
  ring.reduce((minimum, a, i) => {
    const b = ring[(i + 1) % ring.length],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
    return Math.min(minimum, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)));
  }, Infinity);

test('high DSM shoreline samples use a dense rock closure instead of a giant olive connector', () => {
  const riverbanks = create(() => 2);
  const banks = riverbanks.group.getObjectByName('xingping-shoreline-connectors');
  const rocks = riverbanks.group.getObjectByName('xingping-shoreline-rock');

  assert.equal(banks.geometry.getAttribute('position').count, 0);
  assert.equal(banks.geometry.index.count, 0);
  assert.equal(banks.userData.connectorSegmentCount, 0);
  assert.ok(rocks.geometry.getAttribute('position').count > 0);
  assert.ok(rocks.geometry.index.count > 0);
  assert.ok(rocks.userData.highRiseSegments > 0);
  assert.equal(rocks.userData.minimumVerticalRows, 5);
  const rockPositions = rocks.geometry.getAttribute('position');
  const rockNormals = rocks.geometry.getAttribute('normal');
  let reliefVertex = false;
  for (let i = 0; i < rockPositions.count; i += 1) {
    assert.ok(
      Number.isFinite(rockPositions.getX(i)) &&
        Number.isFinite(rockPositions.getY(i)) &&
        Number.isFinite(rockPositions.getZ(i)),
    );
    assert.ok(
      Number.isFinite(rockNormals.getX(i)) &&
        Number.isFinite(rockNormals.getY(i)) &&
        Number.isFinite(rockNormals.getZ(i)),
    );
    reliefVertex ||=
      rockPositions.getX(i) < -0.001 ||
      rockPositions.getX(i) > 1.001 ||
      rockPositions.getZ(i) < -0.001 ||
      rockPositions.getZ(i) > 1.001;
  }
  assert.equal(
    reliefVertex,
    true,
    'high-bank rock surface has inland relief in XZ, not only Y wobble',
  );

  riverbanks.dispose();
});

test('low banks remain continuous and bounded by the connector rise', () => {
  const riverbanks = create(() => 0.12);
  const banks = riverbanks.group.getObjectByName('xingping-shoreline-connectors');
  const positions = banks.geometry.getAttribute('position');
  const normals = banks.geometry.getAttribute('normal');

  assert.ok(positions.count > 0);
  for (let i = 0; i < positions.count; i += 1) {
    assert.ok(positions.getY(i) <= MAX_CONNECTOR_RISE + 0.01);
    assert.ok(
      Number.isFinite(positions.getX(i)) &&
        Number.isFinite(positions.getY(i)) &&
        Number.isFinite(positions.getZ(i)),
    );
    assert.ok(
      Number.isFinite(normals.getX(i)) &&
        Number.isFinite(normals.getY(i)) &&
        Number.isFinite(normals.getZ(i)),
    );
  }

  riverbanks.dispose();
  assert.equal(riverbanks.group.children.length, 0);
});

test('real mapped high-bank relief does not shift vertices into the water polygon', () => {
  const bytes = readFileSync(new URL('../src/data/xingping-dem.bin', import.meta.url));
  const elevations = Uint16Array.from({ length: bytes.length / 2 }, (_, index) =>
    bytes.readUInt16LE(index * 2),
  );
  const model = buildXingpingModel({ metadata, elevations, water, deferDetail: true });
  const riverbanks = createRiverbanks({
    shoals: [],
    toWorld: model.toWorld,
    waterLevel: model.waterLevel,
    shorelines: model.waterPolygons,
    bounds: model.bounds,
    isWater: model.isWater,
    terrainHeight: (x, z) => model.elevationToWorld(model.sourceElevation(x, z)),
  });
  const rocks = riverbanks.group.getObjectByName('xingping-shoreline-rock');
  const positions = rocks.geometry.getAttribute('position');
  assert.ok(positions.count > 0);
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i),
      z = positions.getZ(i);
    const boundaryDistance = Math.min(
      ...model.waterPolygons.flatMap(({ outer, holes }) =>
        [outer, ...(holes || [])].map((ring) => edgeDistance(x, z, ring)),
      ),
    );
    assert.ok(
      !model.isWater(x, z) || boundaryDistance < 1e-5,
      `rock relief vertex ${i} remains on dry side`,
    );
  }
  riverbanks.dispose();
  model.dispose();
});
