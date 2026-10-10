import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import layout from '../src/data/lingyin-layout.json' with { type: 'json' };
import { createLingyinModel } from '../src/models/lingyin-temple.js';

function meshes(root) {
  const result = [];
  root.traverse((object) => { if (object.isMesh) result.push(object); });
  return result;
}

function triangleCount(mesh) {
  const positions = mesh.geometry.getAttribute('position');
  const base = mesh.geometry.index ? mesh.geometry.index.count / 3 : positions.count / 3;
  return base * (mesh.isInstancedMesh ? mesh.count : 1);
}

test('Lingyin model has finite close-scene geometry within a restrained render budget', () => {
  const { group } = createLingyinModel();
  group.updateMatrixWorld(true);
  const rendered = meshes(group);
  assert.ok(rendered.length > 50, 'the exterior ensemble lacks visible architectural detail');
  assert.ok(rendered.length < 100, `model uses ${rendered.length} render objects`);
  assert.ok(rendered.reduce((sum, mesh) => sum + triangleCount(mesh), 0) < 70000, 'model exceeds the scene triangle budget');
  rendered.forEach((mesh) => {
    Object.values(mesh.geometry.attributes).forEach((attribute) => {
      for (const value of attribute.array) assert.ok(Number.isFinite(value), `${mesh.name} contains non-finite geometry`);
    });
  });
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(bounds.min.y >= -0.41, `model drops unexpectedly below its ground: ${bounds.min.y}`);
  assert.ok(bounds.max.y > 14 && bounds.max.y < 18, `unexpected ensemble height: ${bounds.max.y}`);
});

test('five central halls follow the researched south-to-north order and climb stepped terraces', () => {
  const { group, anchors } = createLingyinModel();
  const order = ['tianwang', 'daxiong', 'yaoshi', 'zhizhi', 'huayan'];
  const buildings = order.map((key) => group.getObjectByName(`building-${key}`));
  buildings.forEach((building, index) => assert.ok(building, `missing axis building: ${order[index]}`));
  for (let index = 1; index < buildings.length; index += 1) {
    assert.ok(buildings[index].position.z < buildings[index - 1].position.z, `${order[index]} is not north of ${order[index - 1]}`);
    const current = layout.buildings.find((building) => building.key === order[index]);
    const previous = layout.buildings.find((building) => building.key === order[index - 1]);
    assert.ok(current.terraceY > previous.terraceY, `${order[index]} terrace does not rise`);
    assert.ok(anchors[order[index]].y > current.terraceY, `${order[index]} anchor is not over its roof`);
  }
  assert.deepEqual(group.userData.axisOrder, order);
  assert.equal(group.userData.orientation, 'north=-z');
});

test('main halls retain their distinguishing bay and swept-roof forms', () => {
  const { group } = createLingyinModel();
  const daxiong = group.getObjectByName('building-daxiong');
  const yaoshi = group.getObjectByName('building-yaoshi');
  const zhizhi = group.getObjectByName('building-zhizhi');
  assert.equal(daxiong.userData.bays, 7);
  assert.equal(daxiong.userData.roofLayers, 3);
  assert.equal(daxiong.userData.officialHeightMeters, 33.6);
  assert.equal(yaoshi.userData.bays, 7);
  assert.equal(yaoshi.userData.roofLayers, 2);
  assert.equal(zhizhi.userData.architecturalForm, 'three-function-levels');
  assert.equal(zhizhi.getObjectByName('zhizhi-floor-bands').userData.functionalLevels, 3);
  for (const key of ['tianwang', 'daxiong', 'yaoshi', 'zhizhi', 'huayan']) {
    const roof = group.getObjectByName(`${key}-swept-xieshan-roofs`);
    assert.equal(roof.userData.style, 'xieshan');
    assert.equal(roof.userData.upturnedCorners, true);
    assert.equal(roof.userData.lowerHipUpperGable, true);
    const gables = group.getObjectByName(`${key}-roof-gables`);
    assert.ok(gables, `${key} has no physical gable geometry`);
    assert.equal(gables.userData.gableCount, roof.userData.layers * 2);
    assert.equal(gables.geometry.getAttribute('position').count, roof.userData.layers * 6);
    const normals = roof.geometry.getAttribute('normal');
    let upward = 0;
    for (let index = 0; index < normals.count; index += 1) if (normals.getY(index) > 0.05) upward += 1;
    assert.ok(upward > normals.count * 0.8, `${key} roof faces away from the elevated camera`);
  }
});

test('Luohan Hall is a multi-wing wan-plan compound rather than a single block', () => {
  const { group } = createLingyinModel();
  const luohan = group.getObjectByName('building-luohan');
  assert.equal(luohan.userData.planSymbol, '卍');
  assert.equal(luohan.userData.architecturalForm, 'wan-plan-compound-hall');
  assert.equal(luohan.userData.interiorCopperHallModeled, false);
  assert.equal(luohan.getObjectByName('luohan-wan-plan-walls').userData.sectionCount, 9);
  assert.equal(luohan.getObjectByName('luohan-upper-eaves').userData.doubleEave, true);
  assert.equal(luohan.getObjectByName('luohan-central-copper-hall-silhouette'), undefined);
  const bounds = new THREE.Box3().setFromObject(luohan);
  assert.ok(bounds.max.x - bounds.min.x > 17 && bounds.max.z - bounds.min.z > 17, 'wan-plan wings do not read at campus scale');
});

test('OSM footprint plinths support every building and all five terraces are joined by stairs', () => {
  const { group } = createLingyinModel();
  group.updateMatrixWorld(true);
  const plinths = group.getObjectByName('osm-building-plinths');
  assert.equal(plinths.userData.count, 10);
  layout.buildings.forEach((building) => {
    const object = group.getObjectByName(`building-${building.key}`);
    const center = new THREE.Vector3();
    object.getWorldPosition(center);
    const hit = new THREE.Raycaster(
      new THREE.Vector3(center.x, 30, center.z), new THREE.Vector3(0, -1, 0),
    ).intersectObject(plinths, false)[0];
    assert.ok(hit, `${building.key} has no platform under its center`);
    assert.ok(Math.abs(hit.point.y - (building.terraceY + 0.36)) < 1e-4, `${building.key} floats above its OSM plinth`);
  });
  const stairs = group.getObjectByName('continuous-axis-stairs');
  assert.equal(stairs.userData.connectsAllFiveAxisTerraces, true);
  assert.equal(stairs.userData.flights.length, 4);
  const stairBounds = new THREE.Box3().setFromObject(stairs);
  assert.ok(Math.abs(stairBounds.min.y) < 1e-6, 'solid stair flights do not meet ground/supporting terraces');
  assert.ok(stairBounds.max.y > 6.9, 'stairs do not reach the upper court');
  stairs.userData.flights.forEach((flight) => {
    assert.ok(flight.treadDepth > flight.treadRun, `${flight.from}-${flight.to} treads do not overlap`);
    assert.equal(flight.treadCount, Math.ceil(
      Math.hypot(flight.end[0] - flight.start[0], flight.end[1] - flight.start[1]) / 1.05,
    ));
    for (let sample = 0; sample <= flight.treadCount * 4; sample += 1) {
      const t = sample / (flight.treadCount * 4);
      const x = THREE.MathUtils.lerp(flight.start[0], flight.end[0], t);
      const z = THREE.MathUtils.lerp(flight.start[1], flight.end[1], t);
      const hit = new THREE.Raycaster(
        new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0),
      ).intersectObject(stairs, false)[0];
      assert.ok(hit, `${flight.from}-${flight.to} has a gap at ${t.toFixed(3)}`);
    }
    const endpointHits = [flight.start, flight.end].map(([x, z]) => new THREE.Raycaster(
      new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0),
    ).intersectObject(plinths, false)[0]);
    assert.ok(endpointHits[0] && endpointHits[1], `${flight.from}-${flight.to} does not overlap both supporting plinths`);
    assert.ok(Math.abs(endpointHits[0].point.y - flight.lowerTop) < 1e-4);
    assert.ok(Math.abs(endpointHits[1].point.y - flight.upperTop) < 1e-4);
  });
});

test('hotspot anchors are finite Vector3 points above all seven named roofs', () => {
  const { group, anchors } = createLingyinModel();
  const keys = ['daxiong', 'huayan', 'jigong', 'luohan', 'tianwang', 'yaoshi', 'zhizhi'];
  assert.deepEqual(Object.keys(anchors).sort(), keys);
  keys.forEach((key) => {
    assert.ok(anchors[key].isVector3, `${key} anchor is not a THREE.Vector3`);
    assert.ok(anchors[key].toArray().every(Number.isFinite), `${key} anchor is not finite`);
    const bounds = new THREE.Box3().setFromObject(group.getObjectByName(`building-${key}`));
    assert.ok(anchors[key].y > bounds.max.y, `${key} anchor is hidden inside its roof`);
  });
});

test('model labels surveyed and artistic facts and owns independent resources', () => {
  const first = createLingyinModel().group;
  const second = createLingyinModel().group;
  assert.equal(first.userData.kind, 'artistic-approximation');
  assert.equal(first.userData.layoutAccuracy, 'approximate-not-surveyed');
  assert.equal(first.userData.terraceHeightAccuracy, 'artistic-estimate');
  assert.equal(first.userData.scope, 'exterior-only-no-interior-statues');
  const firstMeshes = meshes(first);
  const secondMeshes = meshes(second);
  assert.equal(firstMeshes.length, secondMeshes.length);
  firstMeshes.forEach((mesh, index) => {
    assert.notEqual(mesh.geometry, secondMeshes[index].geometry, `${mesh.name} shares geometry across model instances`);
    const firstMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const secondMaterials = Array.isArray(secondMeshes[index].material) ? secondMeshes[index].material : [secondMeshes[index].material];
    firstMaterials.forEach((material, materialIndex) => {
      assert.notEqual(material, secondMaterials[materialIndex], `${mesh.name} shares material across model instances`);
    });
  });
});
