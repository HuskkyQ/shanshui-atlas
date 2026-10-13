import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import layout from '../src/data/lingyin-layout.json' with { type: 'json' };
import { createLingyinModel } from '../src/west-lake/lingyin-temple/model.js';

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

const AXIS_ROTATION = 0.322;
const METERS_PER_LON = 111320 * Math.cos(layout.originWgs84[1] * Math.PI / 180);
const METERS_PER_LAT = 110540;

function scenePoints(building) {
  return building.footprintWgs84.map(([longitude, latitude]) => new THREE.Vector2(
    (longitude - layout.originWgs84[0]) * METERS_PER_LON * layout.sceneUnitsPerMeter,
    -(latitude - layout.originWgs84[1]) * METERS_PER_LAT * layout.sceneUnitsPerMeter,
  ));
}

function expectedOrientedBoundsCenter(building) {
  const points = scenePoints(building);
  const first = points[0];
  const last = points.at(-1);
  const unique = first.distanceTo(last) < 1e-7 ? points.slice(0, -1) : points;
  const cosine = Math.cos(AXIS_ROTATION);
  const sine = Math.sin(AXIS_ROTATION);
  const local = unique.map((point) => new THREE.Vector2(
    cosine * point.x - sine * point.y,
    sine * point.x + cosine * point.y,
  ));
  const minX = Math.min(...local.map((point) => point.x));
  const maxX = Math.max(...local.map((point) => point.x));
  const minZ = Math.min(...local.map((point) => point.y));
  const maxZ = Math.max(...local.map((point) => point.y));
  const localCenter = new THREE.Vector2((minX + maxX) / 2, (minZ + maxZ) / 2);
  return new THREE.Vector2(
    cosine * localCenter.x + sine * localCenter.y,
    -sine * localCenter.x + cosine * localCenter.y,
  );
}

function orientedLocalPoints(building) {
  const points = scenePoints(building);
  const first = points[0];
  const last = points.at(-1);
  const unique = first.distanceTo(last) < 1e-7 ? points.slice(0, -1) : points;
  const cosine = Math.cos(AXIS_ROTATION);
  const sine = Math.sin(AXIS_ROTATION);
  const rotated = unique.map((point) => new THREE.Vector2(
    cosine * point.x - sine * point.y,
    sine * point.x + cosine * point.y,
  ));
  const minX = Math.min(...rotated.map((point) => point.x));
  const maxX = Math.max(...rotated.map((point) => point.x));
  const minZ = Math.min(...rotated.map((point) => point.y));
  const maxZ = Math.max(...rotated.map((point) => point.y));
  const center = new THREE.Vector2((minX + maxX) / 2, (minZ + maxZ) / 2);
  return rotated.map((point) => point.sub(center));
}

function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    if (((current.y > z) !== (prior.y > z))
      && x < ((prior.x - current.x) * (z - current.y)) / (prior.y - current.y) + current.x) {
      inside = !inside;
    }
  }
  return inside;
}

test('Lingyin model has finite close-scene geometry within a restrained render budget', () => {
  const { group } = createLingyinModel();
  group.updateMatrixWorld(true);
  const rendered = meshes(group);
  assert.ok(rendered.length > 50, 'the exterior ensemble lacks visible architectural detail');
  assert.ok(rendered.length < 145, `model uses ${rendered.length} render objects`);
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

test('all building groups use the center of their oriented footprint bounds', () => {
  const { group } = createLingyinModel();
  layout.buildings.forEach((building) => {
    const object = group.getObjectByName(`building-${building.key}`);
    const expected = expectedOrientedBoundsCenter(building);
    assert.ok(object.position.distanceTo(new THREE.Vector3(expected.x, 0, expected.y)) < 1e-4,
      `${building.key} is not centered on its oriented footprint bounds`);
  });
});

test('axis courtyards sit in the same local north direction and span each inter-hall gap', () => {
  const { group } = createLingyinModel();
  const courtyards = group.getObjectByName('stepped-axis-courtyards');
  assert.equal(courtyards.userData.layoutMode, 'axis-aligned-open-courtyards');
  assert.equal(courtyards.userData.courtyards.length, 5);
  const axis = ['tianwang', 'daxiong', 'yaoshi', 'zhizhi', 'huayan'];
  axis.forEach((key, index) => {
    const building = group.getObjectByName(`building-${key}`);
    const court = courtyards.userData.courtyards[index];
    const center = new THREE.Vector3(court.center[0], 0, court.center[1]);
    const delta = center.clone().sub(building.position);
    const localNorth = new THREE.Vector3(Math.sin(AXIS_ROTATION), 0, Math.cos(AXIS_ROTATION));
    assert.ok(delta.dot(localNorth) > 0, `${key} courtyard is not in front of the hall`);
    assert.ok(Math.abs(delta.x * localNorth.z - delta.z * localNorth.x) < 0.05,
      `${key} courtyard drifts off the axis`);
  });
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
  const daxiongBase = layout.buildings.find((building) => building.key === 'daxiong').terraceY + 0.36;
  const daxiongBounds = new THREE.Box3().setFromObject(daxiong);
  assert.ok(daxiongBounds.max.y - daxiongBase < 10.752 + 0.35, 'Daxiong exceeds the official relative height');
  assert.ok(daxiong.getObjectByName('daxiong-eave-wall-bands'), 'Daxiong lacks solid bands between roof layers');
  for (const key of ['tianwang', 'daxiong', 'yaoshi', 'zhizhi', 'huayan']) {
    const roof = group.getObjectByName(`${key}-swept-xieshan-roofs`);
    assert.equal(roof.userData.style, 'xieshan');
    assert.equal(roof.userData.upturnedCorners, true);
    assert.equal(roof.userData.lowerHipUpperGable, true);
    const gables = group.getObjectByName(`${key}-roof-gables`);
    assert.ok(gables, `${key} has no physical gable geometry`);
    assert.equal(gables.userData.gableCount, 2);
    assert.equal(gables.geometry.getAttribute('position').count, gables.userData.gableCount * 3);
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
  assert.equal(luohan.getObjectByName('luohan-wan-plan-walls').userData.sourceOutlinePointCount, 21);
  assert.equal(luohan.getObjectByName('luohan-wan-plan-walls').userData.centralVoidModeled, false);
  assert.equal(luohan.getObjectByName('luohan-wing-roofs').userData.doubleEave, true);
  assert.equal(luohan.getObjectByName('luohan-central-copper-hall-silhouette'), undefined);
  const bounds = new THREE.Box3().setFromObject(luohan);
  assert.ok(bounds.max.x - bounds.min.x > 17 && bounds.max.z - bounds.min.z > 17, 'wan-plan wings do not read at campus scale');
});

test('Luohan roof segments cover the source outline while preserving its concave notches', () => {
  const { group } = createLingyinModel();
  group.updateMatrixWorld(true);
  const building = group.getObjectByName('building-luohan');
  const source = orientedLocalPoints(layout.buildings.find((item) => item.key === 'luohan'));
  const lower = building.getObjectByName('luohan-lower-eaves');
  const upper = building.getObjectByName('luohan-wing-roofs');
  let samples = 0;
  let covered = 0;
  for (let z = -9.25; z <= 9.25; z += 0.5) {
    for (let x = -9.25; x <= 9.25; x += 0.5) {
      if (!pointInPolygon(x, z, source)) continue;
      samples += 1;
      const origin = building.localToWorld(new THREE.Vector3(x, 30, z));
      const hit = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0))
        .intersectObjects([lower, upper], false)[0];
      if (hit) covered += 1;
    }
  }
  assert.ok(samples > 1000, 'source outline sampling is too small');
  assert.ok(covered / samples >= 0.95, `roof coverage is ${(covered / samples * 100).toFixed(1)}%`);
});

test('Luohan wall mesh preserves source concave notches without inventing a central hole', () => {
  const { group } = createLingyinModel();
  group.updateMatrixWorld(true);
  const building = layout.buildings.find((item) => item.key === 'luohan');
  const polygon = orientedLocalPoints(building);
  const wall = group.getObjectByName('luohan-wan-plan-walls');
  const toWorldRay = (x, z) => {
    const point = group.getObjectByName('building-luohan').localToWorld(new THREE.Vector3(x, 30, z));
    return new THREE.Raycaster(point, new THREE.Vector3(0, -1, 0)).intersectObject(wall, false)[0];
  };
  for (const [x, z] of [[-2, -8], [3, 5]]) {
    assert.equal(pointInPolygon(x, z, polygon), false);
    assert.equal(toWorldRay(x, z), undefined, `source concave notch at ${x},${z} was filled`);
  }
  for (const [x, z] of [[0, 0], [-8, 0]]) {
    assert.equal(pointInPolygon(x, z, polygon), true);
    assert.ok(toWorldRay(x, z), `source interior at ${x},${z} lost wall geometry`);
  }
});

test('OSM footprint plinths support every building and all five terraces are joined by stairs', () => {
  const { group } = createLingyinModel();
  group.updateMatrixWorld(true);
  const plinths = group.getObjectByName('osm-building-plinths');
  assert.equal(plinths.userData.count, layout.buildings.length);
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
    assert.equal(flight.treadCount, Math.max(2, Math.ceil((flight.upperTop - flight.lowerTop) / 0.18)));
    assert.ok(flight.flatLength > flight.stairLength, `${flight.from}-${flight.to} lacks an open landing run`);
    assert.ok(flight.stairLength > 0 && flight.flatLength > 0, `${flight.from}-${flight.to} has invalid channel lengths`);
    assert.ok(Array.isArray(flight.stairStart) && flight.stairStart.length === 2, `${flight.from}-${flight.to} has no stair start`);
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
