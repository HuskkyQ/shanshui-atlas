import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLeifengModel, createLeifengOverviewFoundation, createLeifengOverviewTower } from '../src/models/leifeng-pagoda.js';

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

test('Leifeng model has finite bounded geometry for a close-range scene', () => {
  const { group } = createLeifengModel();
  group.updateMatrixWorld(true);
  const rendered = meshes(group);
  assert.ok(rendered.length > 0);
  assert.ok(rendered.length < 40, `model uses ${rendered.length} render objects`);
  assert.ok(rendered.reduce((sum, mesh) => sum + triangleCount(mesh), 0) < 180000);
  rendered.forEach((mesh) => {
    Object.values(mesh.geometry.attributes).forEach((attribute) => {
      for (const value of attribute.array) assert.ok(Number.isFinite(value), `${mesh.name} contains non-finite geometry`);
    });
  });
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(bounds.min.y >= -0.01, 'model drops below its local ground plane');
  assert.ok(bounds.max.y > 30 && bounds.max.y < 38, `unexpected tower height: ${bounds.max.y}`);
});

test('tower describes five octagonal floors with a narrowing silhouette', () => {
  const { group } = createLeifengModel();
  const floors = [];
  group.traverse((object) => {
    if (/^tower-floor-\d$/.test(object.name)) floors.push(object.userData);
  });
  floors.sort((a, b) => a.level - b.level);
  assert.equal(floors.length, 5);
  assert.deepEqual(floors.map(({ level }) => level), [1, 2, 3, 4, 5]);
  floors.forEach((floor, index) => {
    assert.equal(floor.sides, 8);
    assert.ok(floor.roofY > floor.baseY);
    if (index) assert.ok(floor.footprintRadius < floors[index - 1].footprintRadius);
  });
  const bounds = new THREE.Box3().setFromObject(group.getObjectByName('leifeng-tower'));
  assert.ok(bounds.max.x - bounds.min.x > 18, 'octagonal base is too narrow for the tower');
  const roof = group.getObjectByName('tower-roofs');
  const ridges = group.getObjectByName('tower-roof-ridges');
  assert.equal(roof.userData.samplesPerEdge, 4);
  assert.equal(ridges.userData.levelCount, 5);
  assert.equal(ridges.userData.ridgesPerLevel, 8);
  const normals = roof.geometry.getAttribute('normal');
  let upwardNormals = 0;
  for (let index = 0; index < normals.count; index += 1) {
    if (normals.getY(index) > 0.1) upwardNormals += 1;
  }
  assert.ok(upwardNormals > normals.count / 2, 'swept roof faces should be visible from the default elevated camera');
});

test('interaction anchors cover the facade, base, eaves and lakeward terrace', () => {
  const { anchors } = createLeifengModel();
  assert.deepEqual(Object.keys(anchors).sort(), ['base', 'eaves', 'lakeView', 'tower']);
  Object.entries(anchors).forEach(([name, anchor]) => {
    assert.equal(anchor.length, 3, `${name} is not a 3D anchor`);
    assert.ok(anchor.every(Number.isFinite), `${name} contains a non-finite coordinate`);
  });
  assert.ok(anchors.tower[1] > anchors.base[1]);
  assert.ok(anchors.eaves[1] > anchors.tower[1]);
  assert.ok(anchors.tower[2] > 0 && anchors.base[2] > 0, 'facade anchors should face the +z entrance');
  assert.ok(anchors.lakeView[2] < 0, 'lake-view anchor should sit on the -z side');
});

test('solid entrance steps rise continuously from the path to the tower platform', () => {
  const { group } = createLeifengModel();
  group.updateMatrixWorld(true);
  const steps = group.getObjectByName('entry-steps');
  const base = group.getObjectByName('tower-base');
  const path = group.getObjectByName('approach-path');
  assert.ok(steps && base && path);
  assert.equal(steps.userData.treadCount, 12);
  const stepBounds = new THREE.Box3().setFromObject(steps);
  const baseBounds = new THREE.Box3().setFromObject(base);
  const pathBounds = new THREE.Box3().setFromObject(path);
  assert.ok(Math.abs(stepBounds.min.y) < 1e-6, 'stairs float above local ground');
  assert.ok(Math.abs(stepBounds.max.y - base.userData.topY) < 1e-6, 'stairs miss the platform height');
  assert.ok(stepBounds.max.z >= pathBounds.min.z, 'approach path does not reach the stairs');
  assert.ok(stepBounds.min.z <= baseBounds.max.z, 'top tread does not reach the tower platform');
});

test('model identifies itself as an artistic approximation', () => {
  const { group } = createLeifengModel();
  assert.equal(group.userData.kind, 'artistic-approximation');
  assert.equal(group.userData.floorCount, 5);
  assert.equal(group.userData.sides, 8);
  assert.equal(group.userData.entranceDirection, '+z');
  assert.equal(group.userData.lakeDirection, '-z');
});

test('overview tower reuses the detailed tower form at a map-scale size', () => {
  const tower = createLeifengOverviewTower();
  const { group: closeModel } = createLeifengModel();
  tower.updateMatrixWorld(true);
  closeModel.updateMatrixWorld(true);
  const overviewCore = tower.getObjectByName('leifeng-tower');
  const closeCore = closeModel.getObjectByName('leifeng-tower');
  assert.ok(overviewCore && closeCore);
  const floors = overviewCore.children.filter((object) => /^tower-floor-\d$/.test(object.name));
  assert.equal(floors.length, 5);
  assert.equal(tower.userData.sides, 8);
  const rendered = meshes(tower);
  assert.ok(rendered.reduce((sum, mesh) => sum + triangleCount(mesh), 0) < 10000, 'overview tower exceeds map-scale budget');
  for (const name of ['tower-base', 'entry-steps', 'tower-roofs', 'tower-windows', 'tower-finial']) {
    assert.ok(overviewCore.getObjectByName(name), `overview omits ${name}`);
  }
  const bounds = new THREE.Box3().setFromObject(tower);
  const closeBounds = new THREE.Box3().setFromObject(closeCore);
  assert.ok(bounds.min.y >= -0.0001);
  const heightRatio = (bounds.max.y - bounds.min.y) / (closeBounds.max.y - closeBounds.min.y);
  assert.ok(heightRatio > 0.019 && heightRatio < 0.021, `unexpected overview scale ratio: ${heightRatio}`);
  assert.ok(bounds.max.y > 0.6 && bounds.max.y < 0.75, `unexpected overview height: ${bounds.max.y}`);
});

test('overview foundation samples interior terrain and keeps an upward, non-intersecting slope', () => {
  const bell = (x, z, cx, cz, radius, height) => height * Math.max(0, 1 - Math.hypot(x - cx, z - cz) / radius);
  const getHeight = (x, z) => 0.2 + bell(x, z, 0.2, 0, 0.07, 1) + bell(x, z, -0.30, 0.25, 0.055, 0.62);
  const { group, baseY } = createLeifengOverviewFoundation({ x: 0, z: 0, getHeight });
  assert.ok(baseY > 1.19, `interior peak was not sampled: ${baseY}`);
  group.updateMatrixWorld(true);
  const pathRay = new THREE.Raycaster(new THREE.Vector3(0, baseY + 1, group.userData.platformRadius), new THREE.Vector3(0, -1, 0));
  const pathHit = pathRay.intersectObject(group.getObjectByName('leifeng-overview-approach'))[0];
  assert.ok(pathHit && pathHit.point.y >= baseY, 'approach sinks into the platform across its center');
  const slope = group.getObjectByName('leifeng-overview-slope');
  const assertAboveTerrain = (mesh, name) => {
    const position = mesh.geometry.getAttribute('position');
    const index = mesh.geometry.index;
    for (let offset = 0; offset < index.count; offset += 3) {
      const a = new THREE.Vector3().fromBufferAttribute(position, index.getX(offset));
      const b = new THREE.Vector3().fromBufferAttribute(position, index.getX(offset + 1));
      const c = new THREE.Vector3().fromBufferAttribute(position, index.getX(offset + 2));
      if (name === 'slope') assert.ok(new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).y > 0, 'slope face points downward');
      for (const [wa, wb, wc] of [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]]) {
        const point = a.clone().multiplyScalar(wa).addScaledVector(b, wb).addScaledVector(c, wc);
        assert.ok(point.y >= getHeight(point.x, point.z) - 0.005, `${name} triangle intersects sampled terrain`);
      }
    }
  };
  assertAboveTerrain(slope, 'slope');
  const approach = group.getObjectByName('leifeng-overview-approach');
  assert.ok(approach.geometry.getAttribute('position').count > 4, 'approach should follow the foundation in multiple segments');
  assertAboveTerrain(approach, 'approach');
});
