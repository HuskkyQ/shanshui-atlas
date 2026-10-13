import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHouseModel } from '../src/models/house/model.js';

function meshes(root) {
  const result = [];
  root.traverse((object) => { if (object.isMesh) result.push(object); });
  return result;
}

test('house exposes finite, grounded geometry and reusable anchors', () => {
  const house = createHouseModel();
  house.group.updateMatrixWorld(true);
  const rendered = meshes(house.group);
  assert.ok(rendered.length > 0);
  assert.ok(rendered.length < 40);
  for (const mesh of rendered) {
    for (const attribute of Object.values(mesh.geometry.attributes)) {
      for (const value of attribute.array) assert.ok(Number.isFinite(value), `${mesh.name} contains non-finite geometry`);
    }
    const normals = mesh.geometry.getAttribute('normal');
    assert.ok(normals && normals.count > 0, `${mesh.name} needs normals`);
  }
  const bounds = new THREE.Box3().setFromObject(house.group);
  assert.ok(Math.abs(bounds.min.y) < 0.01, `model should rest on y=0, got ${bounds.min.y}`);
  assert.ok(bounds.max.y > 5.2 && bounds.max.y < 6.4, `unexpected height ${bounds.max.y}`);
  assert.ok(bounds.max.x - bounds.min.x > 9 && bounds.max.x - bounds.min.x < 11.5);
  assert.ok(bounds.max.z - bounds.min.z > 6 && bounds.max.z - bounds.min.z < 8.5);
  assert.deepEqual(Object.keys(house.anchors).sort(), ['base', 'entrance', 'roof']);
  assert.equal(house.footprint.width, 10.2);
  assert.equal(house.footprint.depth, 7.875);
  assert.ok(house.anchors.entrance[2] > 0);
  assert.ok(house.anchors.entrance[1] > house.anchors.base[1]);
  assert.ok(house.anchors.roof[1] > house.anchors.entrance[1]);
  assert.equal(house.group.userData.entranceDirection, '+z');
  const ridgeBounds = new THREE.Box3().setFromObject(house.group.getObjectByName('roof-ridge'));
  const frontEaveBounds = new THREE.Box3().setFromObject(house.group.getObjectByName('roof-slab-front'));
  assert.ok(ridgeBounds.max.y > frontEaveBounds.min.y, 'ridge must be higher than the front eave');
  assert.ok(Math.abs(ridgeBounds.max.x - ridgeBounds.min.x) > 7, 'ridge should run along the X axis');
  const frontTiles = house.group.getObjectByName('roof-tiles-front');
  assert.ok(frontTiles.isInstancedMesh && frontTiles.count >= 7, 'front roof needs distributed tile bars');
  const tileA = new THREE.Object3D();
  const tileB = new THREE.Object3D();
  frontTiles.getMatrixAt(0, tileA.matrix);
  frontTiles.getMatrixAt(frontTiles.count - 1, tileB.matrix);
  tileA.matrix.decompose(tileA.position, tileA.quaternion, tileA.scale);
  tileB.matrix.decompose(tileB.position, tileB.quaternion, tileB.scale);
  assert.ok(Math.abs(tileA.quaternion.x) > 0.1, 'tile bars must follow the roof slope');
  assert.notEqual(tileA.position.x, tileB.position.x, 'tile bars should be distributed along X');
  const roofNormal = new THREE.Vector3(0, 1, 0).applyQuaternion(house.group.getObjectByName('roof-slab-front').quaternion).normalize();
  const tileBottom = new THREE.Vector3(0, -0.0225, 0).applyMatrix4(tileA.matrix);
  const slab = house.group.getObjectByName('roof-slab-front');
  const slabPlanePoint = tileBottom.clone().sub(roofNormal.clone().multiplyScalar(roofNormal.dot(tileBottom.clone().sub(slab.position))));
  const roofTop = slabPlanePoint.clone().addScaledVector(roofNormal, 0.09);
  const tileClearance = roofNormal.dot(tileBottom.clone().sub(roofTop));
  assert.ok(tileClearance >= 0 && tileClearance <= 0.01, `tile bottom clearance is ${tileClearance}`);
  const gable = house.group.getObjectByName('gable-right');
  const gableBounds = new THREE.Box3().setFromObject(gable);
  assert.ok(gableBounds.max.y < ridgeBounds.max.y, 'gable should remain below the roof ridge cap');
  const gableHit = new THREE.Raycaster(new THREE.Vector3(4.4, 5.5, 0), new THREE.Vector3(1, 0, 0)).intersectObject(gable)[0];
  assert.ok(gableHit && gableHit.point.y > 5.4, 'gable upper triangle should reach near the ridge');
  const baseBounds = new THREE.Box3().setFromObject(house.group.getObjectByName('stone-base'));
  const highStepBounds = new THREE.Box3().setFromObject(house.group.getObjectByName('entry-step-high'));
  const lowStepBounds = new THREE.Box3().setFromObject(house.group.getObjectByName('entry-step-low'));
  assert.ok(Math.abs(highStepBounds.max.y - baseBounds.max.y) < 1e-6, 'top step must meet the base');
  assert.ok(lowStepBounds.min.y <= 0.001 && lowStepBounds.max.y < highStepBounds.max.y, 'steps must rise continuously');
  house.dispose();
});

test('house instances have independent transforms and disposable resources', () => {
  const first = createHouseModel();
  const second = createHouseModel();
  const parentA = new THREE.Group();
  const parentB = new THREE.Group();
  parentA.position.set(3, 2, -4);
  parentB.rotation.y = Math.PI / 2;
  parentA.add(first.group);
  parentB.add(second.group);
  parentA.updateMatrixWorld(true);
  parentB.updateMatrixWorld(true);
  const firstPosition = new THREE.Vector3();
  const secondPosition = new THREE.Vector3();
  first.group.getWorldPosition(firstPosition);
  second.group.getWorldPosition(secondPosition);
  assert.deepEqual(firstPosition.toArray(), [3, 2, -4]);
  assert.deepEqual(secondPosition.toArray(), [0, 0, 0]);

  const firstResources = meshes(first.group).flatMap((mesh) => [mesh.geometry, mesh.material]);
  const secondResources = meshes(second.group).flatMap((mesh) => [mesh.geometry, mesh.material]);
  const disposalCounts = (resources) => resources.map((resource) => {
    let count = 0;
    const dispose = resource.dispose.bind(resource);
    resource.dispose = () => { count += 1; dispose(); };
    return () => count;
  });
  const firstDisposals = disposalCounts(firstResources);
  const secondDisposals = disposalCounts(secondResources);
  first.dispose();
  assert.equal(first.group.children.length, 0);
  assert.ok(firstDisposals.every((count) => count() === 1), 'first instance did not release all resources');
  assert.ok(secondDisposals.every((count) => count() === 0), 'first dispose released second instance resources');
  second.dispose();
  assert.ok(secondDisposals.every((count) => count() === 1));
  second.dispose();
  assert.ok(secondDisposals.every((count) => count() === 1), 'dispose should be idempotent');
});
