import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSantanModel } from '../src/models/santanyinyue.js';

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

test('Santan model has finite bounded geometry within a close-scene budget', () => {
  const { group } = createSantanModel();
  group.updateMatrixWorld(true);
  const rendered = meshes(group);
  assert.ok(rendered.length > 0);
  assert.ok(rendered.length < 60, `model uses ${rendered.length} render objects`);
  assert.ok(rendered.reduce((sum, mesh) => sum + triangleCount(mesh), 0) < 90000);
  rendered.forEach((mesh) => {
    Object.values(mesh.geometry.attributes).forEach((attribute) => {
      for (const value of attribute.array) assert.ok(Number.isFinite(value), `${mesh.name} contains non-finite geometry`);
    });
  });
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(bounds.min.y > -0.2, `model drops too far below the water plane: ${bounds.min.y}`);
  assert.ok(bounds.max.y > 8 && bounds.max.y < 14, `unexpected scene height: ${bounds.max.y}`);
});

test('three bottle-shaped stone towers form a stable triangular composition', () => {
  const { group } = createSantanModel();
  const towers = [1, 2, 3].map((index) => group.getObjectByName(`santan-stone-tower-${index}`));
  towers.forEach((tower, index) => {
    assert.ok(tower, `tower ${index + 1} is missing`);
    assert.equal(tower.userData.kind, 'bottle-shaped-stone-tower');
    assert.equal(tower.userData.holeCount, 5);
    assert.ok(tower.getObjectByName(`tower-${index + 1}-plinth`));
    assert.ok(tower.getObjectByName(`tower-${index + 1}-eaves`));
    assert.ok(tower.getObjectByName(`tower-${index + 1}-gourd-finial`));
  });
  const [a, b, c] = towers.map((tower) => new THREE.Vector2(tower.position.x, tower.position.z));
  const doubledArea = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  assert.ok(doubledArea > 80, `tower layout is nearly collinear: ${doubledArea}`);
});

test('each tower has five circular openings that pass through its stone wall', () => {
  const { group } = createSantanModel();
  group.updateMatrixWorld(true);
  for (let towerIndex = 1; towerIndex <= 3; towerIndex += 1) {
    const tower = group.getObjectByName(`santan-stone-tower-${towerIndex}`);
    const openings = [];
    tower.traverse((object) => {
      if (object.userData.openingType === 'through-hole') openings.push(object);
    });
    assert.equal(openings.length, 5, `tower ${towerIndex} does not expose five openings`);
    assert.deepEqual(openings.map((opening) => opening.userData.holeIndex).sort(), [1, 2, 3, 4, 5]);
    openings.forEach((opening) => {
      assert.equal(opening.geometry.parameters.shapes.holes.length, 1, `${opening.name} is not cut from its wall shape`);
      const center = new THREE.Vector3(...opening.userData.localOpeningCenter);
      const origin = opening.localToWorld(center.clone().add(new THREE.Vector3(0, 0, 1)));
      const direction = new THREE.Vector3(0, 0, -1).transformDirection(opening.matrixWorld);
      const hits = new THREE.Raycaster(origin, direction, 0, 2).intersectObject(opening, false);
      assert.equal(hits.length, 0, `${opening.name} is visually painted rather than open`);
    });
  }
});

test('the perforated wall overlaps the shoulder without a horizontal seam', () => {
  const { group } = createSantanModel();
  group.updateMatrixWorld(true);
  for (let towerIndex = 1; towerIndex <= 3; towerIndex += 1) {
    const tower = group.getObjectByName(`santan-stone-tower-${towerIndex}`);
    const origin = tower.localToWorld(new THREE.Vector3(0, 5.32, 4));
    const direction = new THREE.Vector3(0, 0, -1).transformDirection(tower.matrixWorld);
    const hits = new THREE.Raycaster(origin, direction, 0, 2.5).intersectObject(tower, true);
    assert.ok(hits.length > 0, `tower ${towerIndex} has an open seam below its shoulder`);
  }
});

test('hotspot anchors are finite Vector3 points covering towers, detail, island and moon view', () => {
  const { anchors } = createSantanModel();
  assert.deepEqual(Object.keys(anchors).sort(), ['island', 'moonView', 'towerDetail', 'towers']);
  Object.entries(anchors).forEach(([name, anchor]) => {
    assert.ok(anchor.isVector3, `${name} is not a THREE.Vector3`);
    assert.ok(anchor.toArray().every(Number.isFinite), `${name} contains a non-finite coordinate`);
  });
  assert.ok(anchors.towerDetail.y > anchors.towers.y, 'detail anchor should point at the perforated tower body');
  assert.ok(anchors.island.z < anchors.towers.z, 'island anchor should sit behind the three towers');
  assert.ok(anchors.moonView.y < 1, 'moon-view anchor should stay close to the lake surface');
});

test('scene environment is a partial island shoreline rather than a full island reconstruction', () => {
  const { group } = createSantanModel();
  const water = group.getObjectByName('santan-lake-surface');
  const island = group.getObjectByName('xiaoyingzhou-partial-island');
  const shore = group.getObjectByName('xiaoyingzhou-curved-shore');
  assert.ok(water && island && shore);
  assert.equal(island.userData.scope, 'partial-shoreline');
  assert.ok(shore.userData.arcPoints >= 5);
  assert.ok(group.getObjectByName('xiaoyingzhou-shore-pavilion'));
  assert.equal(group.getObjectByName('moon-reflection'), undefined, 'fixed daylight should not paint a moon reflection on the lake');
});

test('each model creation owns independent geometry and material resources', () => {
  const first = createSantanModel().group;
  const second = createSantanModel().group;
  const firstMeshes = meshes(first);
  const secondMeshes = meshes(second);
  assert.equal(firstMeshes.length, secondMeshes.length);
  firstMeshes.forEach((mesh, index) => {
    assert.notEqual(mesh.geometry, secondMeshes[index].geometry, `${mesh.name} shares geometry`);
    const firstMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const secondMaterials = Array.isArray(secondMeshes[index].material) ? secondMeshes[index].material : [secondMeshes[index].material];
    firstMaterials.forEach((material, materialIndex) => {
      assert.notEqual(material, secondMaterials[materialIndex], `${mesh.name} shares material`);
    });
  });
});
