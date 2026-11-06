import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createChengqiLouModel } from '../src/chengqi-lou/model.js';
import { CHENGQI_LAYOUT } from '../src/chengqi-lou/layout.js';

const TAU = Math.PI * 2;

function meshes(root) {
  const result = [];
  root.traverse((object) => { if (object.isMesh) result.push(object); });
  return result;
}

function triangleCount(root) {
  return meshes(root).reduce((sum, mesh) => {
    const positions = mesh.geometry.getAttribute('position');
    const base = (mesh.geometry.index?.count ?? positions.count) / 3;
    return sum + base * (mesh.isInstancedMesh ? mesh.count : 1);
  }, 0);
}

function assertFiniteGeometry(root) {
  root.traverse((object) => {
    if (!object.geometry) return;
    Object.values(object.geometry.attributes).forEach((attribute) => {
      for (const value of attribute.array) {
        assert.ok(Number.isFinite(value), `${object.name} contains non-finite geometry`);
      }
    });
  });
}

function nearestDistanceToRect(point, spec) {
  const dx = point.x - spec.x;
  const dz = point.z - spec.z;
  const cosine = Math.cos(-(spec.rotationY ?? 0));
  const sine = Math.sin(-(spec.rotationY ?? 0));
  const localX = dx * cosine + dz * sine;
  const localZ = -dx * sine + dz * cosine;
  const outsideX = Math.max(Math.abs(localX) - spec.width / 2, 0);
  const outsideZ = Math.max(Math.abs(localZ) - spec.depth / 2, 0);
  return Math.hypot(outsideX, outsideZ);
}

function projectedRadius(spec, axisAngle) {
  const relative = axisAngle + (spec.rotationY ?? 0);
  return Math.abs(Math.cos(relative)) * spec.width / 2
    + Math.abs(Math.sin(relative)) * spec.depth / 2;
}

test('Chengqi Lou exposes the five scene targets and finite anchors', () => {
  const { group, anchors } = createChengqiLouModel();
  for (const id of ['entrance', 'outer-ring', 'inner-rings', 'ancestral-hall', 'neighbors']) {
    const building = group.getObjectByName(`building-${id}`);
    assert.ok(building, `missing building-${id}`);
    assert.ok(anchors[id] instanceof THREE.Vector3, `${id} anchor is not a Vector3`);
    assert.ok(anchors[id].toArray().every(Number.isFinite), `${id} anchor is not finite`);
    const bounds = new THREE.Box3().setFromObject(building);
    assert.ok(bounds.containsPoint(anchors[id]) || anchors[id].y > bounds.max.y,
      `${id} anchor does not correspond to its building`);
  }
  assert.equal(group.userData.kind, 'artistic-approximation');
  assert.match(group.userData.sourceBoundary, /outer-diameter-and-ring-count-researched/);
});

test('outer ring retains the researched 73 metre diameter and 67-room four-storey massing', () => {
  const { group } = createChengqiLouModel();
  group.updateMatrixWorld(true);
  const outer = group.getObjectByName('building-outer-ring');
  const bounds = new THREE.Box3().setFromObject(outer);
  assert.ok(Math.abs((bounds.max.x - bounds.min.x) - 74.2) < 1.2,
    `unexpected outer eave diameter: ${bounds.max.x - bounds.min.x}`);
  assert.ok(bounds.max.y > 17 && bounds.max.y < 20,
    `unexpected outer ring height: ${bounds.max.y}`);
  assert.equal(outer.userData.floorCount, 4);
  assert.equal(outer.userData.wallHeightMetres, 16.4);
  assert.equal(outer.userData.wallHeightAccuracy, 'artistic-approximation');
  assert.equal(outer.userData.roomCountPerFloor, 67);
  assert.equal(CHENGQI_LAYOUT.outerDiameter, 73);
});

test('south, east and west entrances are real ground-level openings', () => {
  const { group } = createChengqiLouModel();
  group.updateMatrixWorld(true);
  const outer = group.getObjectByName('building-outer-ring');
  const entrances = [
    [new THREE.Vector3(0, 1.7, 44), new THREE.Vector3(0, 0, -1), 'south'],
    [new THREE.Vector3(44, 1.7, 0), new THREE.Vector3(-1, 0, 0), 'east'],
    [new THREE.Vector3(-44, 1.7, 0), new THREE.Vector3(1, 0, 0), 'west'],
  ];
  for (const [origin, direction, label] of entrances) {
    const raycaster = new THREE.Raycaster(origin, direction, 0, 16);
    const hits = raycaster.intersectObject(outer, true)
      .filter((hit) => hit.object.userData.blocksGroundPassage !== false);
    assert.equal(hits.length, 0, `${label} doorway is sealed by the outer ring`);
  }
  const axisRay = new THREE.Raycaster(new THREE.Vector3(0, 1.7, 44), new THREE.Vector3(0, 0, -1), 0, 51);
  const innerHits = axisRay.intersectObject(group.getObjectByName('building-inner-rings'), true)
    .filter((hit) => hit.object.userData.blocksGroundPassage !== false);
  assert.equal(innerHits.length, 0, 'inner rings seal the south entrance-to-centre passage');
  const entrance = group.getObjectByName('building-entrance');
  const passage = entrance.getObjectByName('entrance-passage-floor');
  assert.ok(passage, 'entrance needs a visible passage floor');
  assert.ok(entrance.getObjectByName('entrance-south-stone-jambs'),
    'south entrance needs structural jambs rather than a dark facade patch');
  const sideEntrances = group.getObjectByName('building-side-entrances');
  for (const label of ['east', 'west']) assert.ok(sideEntrances.getObjectByName(`entrance-${label}-stone-jambs`));
  const entranceBounds = new THREE.Box3().setFromObject(entrance);
  assert.ok(entranceBounds.max.x - entranceBounds.min.x < 8,
    'entrance hotspot includes the distant east and west gates');
  const passageBounds = new THREE.Box3().setFromObject(passage);
  assert.ok(passageBounds.min.z < CHENGQI_LAYOUT.rings.at(-1).innerRadius,
    'passage floor does not reach the central court');
});

test('outer facade keeps the second storey solid and cuts real small windows only above it', () => {
  const { group } = createChengqiLouModel();
  group.updateMatrixWorld(true);
  const outer = group.getObjectByName('building-outer-ring');
  const theta = TAU / 67 * 10;
  const originAt = (y) => new THREE.Vector3(Math.sin(theta) * 40, y, Math.cos(theta) * 40);
  const inward = new THREE.Vector3(-Math.sin(theta), 0, -Math.cos(theta));
  const secondStoreyHits = new THREE.Raycaster(originAt(6.6), inward, 0, 5)
    .intersectObject(outer, true);
  assert.ok(secondStoreyHits.some((hit) => hit.object.name === 'outer-ring-second-floor-wall'),
    'second storey should remain a solid rammed-earth facade');
  const thirdStoreyHits = new THREE.Raycaster(originAt(10.7), inward, 0, 5)
    .intersectObject(outer, true);
  assert.equal(thirdStoreyHits.length, 0, 'third-storey small window is a facade patch instead of a cut opening');
  for (let bay = 0; bay < 67; bay += 1) {
    const seamTheta = TAU / 67 * (bay + 0.49);
    const origin = new THREE.Vector3(Math.sin(seamTheta) * 40, 10.7, Math.cos(seamTheta) * 40);
    const direction = new THREE.Vector3(-Math.sin(seamTheta), 0, -Math.cos(seamTheta));
    const hits = new THREE.Raycaster(origin, direction, 0, 5).intersectObject(outer, true);
    assert.ok(hits.length > 0, `third-storey wall has an open vertical bay seam at ${bay}`);
  }
});

test('concentric buildings step down inward and preserve open-air ring lanes', () => {
  const { group } = createChengqiLouModel();
  const rings = [
    group.getObjectByName('building-outer-ring'),
    ...group.getObjectByName('building-inner-rings').children.filter((child) => child.userData.radialEnvelope),
  ];
  assert.deepEqual(rings.map((ring) => ring.userData.floorCount), [4, 2, 1]);
  assert.deepEqual(rings.map((ring) => ring.userData.roomCountPerFloor), [67, 34, 20]);
  const envelopes = rings.map((ring) => ring.userData.radialEnvelope);
  for (let index = 1; index < envelopes.length; index += 1) {
    const outside = envelopes[index - 1];
    const inside = envelopes[index];
    assert.ok(outside.innerRadius - inside.outerRadius >= 2,
      `ring ${index} leaves no open-air lane`);
    assert.ok(rings[index].userData.wallHeightMetres < rings[index - 1].userData.wallHeightMetres,
      `ring ${index} does not step down toward the centre`);
  }
  assert.ok(group.getObjectByName('outer-ring-gallery-slabs'));
  assert.ok(group.getObjectByName('outer-ring-gallery-columns')?.isInstancedMesh);
  assert.ok(group.getObjectByName('outer-ring-gallery-rails')?.isInstancedMesh);
  assert.ok(group.getObjectByName('outer-ring-visible-stairs'));
  assert.ok(group.getObjectByName('outer-ring-roof-tile-ribs')?.isInstancedMesh);
});

test('central ancestral hall is a rectangular hall opening onto a front court', () => {
  const { group } = createChengqiLouModel();
  group.updateMatrixWorld(true);
  const hall = group.getObjectByName('building-ancestral-hall');
  const court = hall.getObjectByName('ancestral-front-court');
  const body = hall.getObjectByName('ancestral-hall-body');
  assert.ok(court && body);
  const courtBounds = new THREE.Box3().setFromObject(court);
  const bodyBounds = new THREE.Box3().setFromObject(body);
  assert.ok(courtBounds.max.z > bodyBounds.max.z, 'front court is not on the entrance side of the hall');
  assert.ok(bodyBounds.max.x - bodyBounds.min.x > bodyBounds.max.z - bodyBounds.min.z,
    'ancestral hall reads as a closed circular core instead of a rectangular hall');
});

test('the Gaobei cluster includes all four named tulou at their documented scale', () => {
  const { group } = createChengqiLouModel();
  group.updateMatrixWorld(true);
  const neighbors = group.getObjectByName('building-neighbors');
  const qiaofu = neighbors.getObjectByName('neighbor-qiaofu');
  const shize = neighbors.getObjectByName('neighbor-shize');
  const wuyun = neighbors.getObjectByName('neighbor-wuyun');
  assert.ok(qiaofu && shize && wuyun, 'missing Qiaofu, Shize or Wuyun Lou');
  assert.equal(neighbors.children.filter((child) => child.name.startsWith('neighbor-')).length, 3);
  assert.deepEqual(qiaofu.userData.documentedDimensions, { diameter: 45, floors: 3 });
  assert.deepEqual(shize.userData.documentedDimensions, { width: 40.8, depth: 41.2, floors: 4 });
  assert.deepEqual(wuyun.userData.documentedDimensions, { width: 25.8, depth: 24.3, floors: 4 });
  assert.equal(CHENGQI_LAYOUT.neighbors.length, 3);
});

test('the four documented footprints remain separate at their mapped centres', () => {
  const [qiaofu, shize, wuyun] = CHENGQI_LAYOUT.neighbors;
  assert.ok(Math.hypot(qiaofu.x, qiaofu.z) > CHENGQI_LAYOUT.outerDiameter / 2 + qiaofu.outerRadius,
    'Qiaofu Lou overlaps Chengqi Lou');
  for (const neighbor of [shize, wuyun]) {
    assert.ok(nearestDistanceToRect(new THREE.Vector3(0, 0, 0), neighbor) > CHENGQI_LAYOUT.outerDiameter / 2,
      `${neighbor.label} overlaps Chengqi Lou`);
  }
  const deltaX = wuyun.x - shize.x;
  const deltaZ = wuyun.z - shize.z;
  const axes = [
    -(shize.rotationY ?? 0), Math.PI / 2 - (shize.rotationY ?? 0),
    -(wuyun.rotationY ?? 0), Math.PI / 2 - (wuyun.rotationY ?? 0),
  ];
  assert.ok(axes.some((axis) => {
    const projectedCentres = Math.abs(deltaX * Math.cos(axis) + deltaZ * Math.sin(axis));
    return projectedCentres > projectedRadius(shize, axis) + projectedRadius(wuyun, axis);
  }), 'Shize and Wuyun Lou overlap each other');
});

test('neighboring tulou show galleries, rooms, roofs and south-facing entrance halls', () => {
  const { group } = createChengqiLouModel();
  const neighbors = group.getObjectByName('building-neighbors');
  for (const id of ['qiaofu', 'shize', 'wuyun']) {
    const building = neighbors.getObjectByName(`neighbor-${id}`);
    const spec = CHENGQI_LAYOUT.neighbors.find((entry) => entry.id === id);
    assert.equal(building.userData.floorCount, spec.floors);
    assert.ok(building.getObjectByName(`${id}-gallery-slabs`), `${id} lacks timber gallery floors`);
    assert.ok(building.getObjectByName(`${id}-gallery-columns`)?.isInstancedMesh,
      `${id} lacks instanced gallery columns`);
    assert.ok(building.getObjectByName(`${id}-gallery-rails`)?.isInstancedMesh,
      `${id} lacks gallery rails`);
    assert.ok(building.getObjectByName(`${id}-room-doors`)?.isInstancedMesh,
      `${id} lacks visible room bays`);
    assert.ok(building.getObjectByName(`${id}-entrance-hall`), `${id} lacks a south entrance hall`);
    assert.ok(building.getObjectByName(`${id}-roof`), `${id} lacks a coherent roof group`);
  }
  assert.ok(neighbors.getObjectByName('qiaofu-upper-windows')?.isInstancedMesh,
    'Qiaofu Lou lacks the small outer windows visible in the reference');
});

test('neighbor south gates preserve a multi-ray passage from each entrance hall into its court', () => {
  const { group } = createChengqiLouModel();
  group.updateMatrixWorld(true);
  const neighbors = group.getObjectByName('building-neighbors');
  for (const spec of CHENGQI_LAYOUT.neighbors) {
    const building = neighbors.getObjectByName(`neighbor-${spec.id}`);
    const front = spec.type === 'round' ? spec.outerRadius : spec.depth / 2;
    const innerEdge = spec.type === 'round'
      ? spec.innerRadius - 2
      : spec.depth / 2 - Math.min(5.6, Math.min(spec.width, spec.depth) * 0.19) - 2;
    for (const offset of [-1.4, 0, 1.4]) {
      const localOrigin = new THREE.Vector3(offset, 1.5, front + 4);
      const origin = building.localToWorld(localOrigin.clone());
      const direction = new THREE.Vector3(0, 0, -1).transformDirection(building.matrixWorld);
      const hits = new THREE.Raycaster(origin, direction, 0, localOrigin.z - innerEdge)
        .intersectObject(building, true);
      assert.equal(hits.length, 0,
        `${spec.label} south passage is blocked at local x=${offset} by ${hits[0]?.object.name}`);
    }
  }
});

test('square neighbors preserve open-air courtyards and paths reach their south gates', () => {
  const { group } = createChengqiLouModel();
  group.updateMatrixWorld(true);
  const neighbors = group.getObjectByName('building-neighbors');
  for (const id of ['shize', 'wuyun']) {
    const spec = CHENGQI_LAYOUT.neighbors.find((entry) => entry.id === id);
    const building = neighbors.getObjectByName(`neighbor-${id}`);
    assert.equal(building.userData.courtyard.openToSky, true);
    const centreRay = new THREE.Raycaster(
      new THREE.Vector3(spec.x, 30, spec.z), new THREE.Vector3(0, -1, 0),
    );
    assert.equal(centreRay.intersectObject(building, true).length, 0,
      `${spec.label} covers its open-air central courtyard`);
    const path = group.getObjectByName(`${id}-entrance-path`);
    assert.ok(path, `${spec.label} has no path to its south gate`);
    const pathBounds = new THREE.Box3().setFromObject(path);
    const gate = building.localToWorld(new THREE.Vector3(0, pathBounds.max.y, spec.depth / 2));
    assert.ok(pathBounds.containsPoint(gate),
      `${spec.label} entrance path does not meet the south facade`);
  }
});

test('site trees form bounded clusters while staying clear of all four tulou', () => {
  const { group } = createChengqiLouModel();
  group.updateMatrixWorld(true);
  const neighbors = group.getObjectByName('building-neighbors');

  const trunks = group.getObjectByName('site-tree-trunks');
  assert.ok(trunks?.isInstancedMesh && trunks.count >= 20 && trunks.count <= 36);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  for (let index = 0; index < trunks.count; index += 1) {
    trunks.getMatrixAt(index, matrix);
    position.setFromMatrixPosition(matrix);
    assert.ok(Math.hypot(position.x, position.z) > CHENGQI_LAYOUT.rings[0].outerRadius + 4,
      `tree ${index} grows inside the main building precinct`);
    for (const id of ['qiaofu', 'shize', 'wuyun']) {
      const buildingBounds = new THREE.Box3().setFromObject(neighbors.getObjectByName(`neighbor-${id}`));
      assert.ok(!buildingBounds.expandByScalar(1.5).containsPoint(position), `tree ${index} intersects ${id}`);
    }
  }
});

test('a dense instanced bamboo grove fills the north clearing without covering a tulou', () => {
  const { group } = createChengqiLouModel();
  group.updateMatrixWorld(true);
  const stems = group.getObjectByName('site-bamboo-stems');
  const crowns = group.getObjectByName('site-bamboo-crowns');
  assert.ok(stems?.isInstancedMesh && stems.count >= 60 && stems.count <= 100);
  assert.ok(crowns?.isInstancedMesh && crowns.count === stems.count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  for (let index = 0; index < stems.count; index += 1) {
    stems.getMatrixAt(index, matrix);
    position.setFromMatrixPosition(matrix);
    assert.ok(position.x >= -25 && position.x <= 72, `bamboo ${index} leaves the north clearing`);
    assert.ok(position.z >= -74 && position.z <= -48, `bamboo ${index} leaves the north clearing`);
    assert.ok(Math.hypot(position.x, position.z) > CHENGQI_LAYOUT.rings[0].outerRadius + 5,
      `bamboo ${index} covers Chengqi Lou`);
  }
});

test('model geometry is finite, bounded, detailed, and isolated between instances', () => {
  const first = createChengqiLouModel().group;
  const second = createChengqiLouModel().group;
  first.updateMatrixWorld(true);
  second.updateMatrixWorld(true);
  assertFiniteGeometry(first);
  const bounds = new THREE.Box3().setFromObject(first);
  assert.ok(bounds.min.y >= -1.01 && bounds.max.y < 21);
  assert.ok(bounds.max.x - bounds.min.x >= 220 && bounds.max.x - bounds.min.x <= 250);
  assert.ok(meshes(first).length > 35, 'model lacks distinct architectural layers');
  assert.ok(meshes(first).length < 135, `model uses ${meshes(first).length} render objects`);
  assert.ok(triangleCount(first) > 25000, 'model is too sparse to show architectural depth');
  assert.ok(triangleCount(first) < 240000, `model exceeds triangle budget: ${triangleCount(first)}`);

  const firstWall = first.getObjectByName('outer-ring-ground-wall');
  const secondWall = second.getObjectByName('outer-ring-ground-wall');
  assert.notEqual(firstWall.geometry, secondWall.geometry, 'model instances share disposable geometry');
  assert.notEqual(firstWall.material, secondWall.material, 'model instances share disposable material');
});

test('model owns an idempotent disposer for scene teardown', () => {
  const model = createChengqiLouModel();
  const geometry = model.group.getObjectByName('outer-ring-ground-wall').geometry;
  const material = model.group.getObjectByName('outer-ring-ground-wall').material;
  let geometryDisposals = 0;
  let materialDisposals = 0;
  geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
  material.addEventListener('dispose', () => { materialDisposals += 1; });
  assert.equal(typeof model.dispose, 'function');
  model.dispose();
  model.dispose();
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 1);
});
