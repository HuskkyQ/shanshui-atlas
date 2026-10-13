import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  captureScenicEntryView,
  applyScenicEntryView,
  fitScenicEntryView,
} from '../src/shared/scenic-entry-view.js';

function controlsFor(camera) {
  return { target: new THREE.Vector3(), minPolarAngle: 0.12, maxDistance: 90,
    update() { camera.lookAt(this.target); camera.updateMatrixWorld(true); } };
}

test('scaled World model and first scenic frame have identical projected geometry and camera direction', () => {
  const world = new THREE.PerspectiveCamera(39, 1280 / 720, 0.01, 500);
  const model = new THREE.Group();
  model.position.set(8, 3, -4);
  model.scale.setScalar(0.02);
  model.rotation.y = 0.43;
  model.updateMatrixWorld(true);
  const localTarget = new THREE.Vector3(0, 14, 0);
  const target = model.localToWorld(localTarget.clone());
  world.position.copy(model.localToWorld(new THREE.Vector3(-40, 45, 72)));
  world.zoom = 1.3;
  world.lookAt(target);
  world.updateProjectionMatrix();
  world.updateMatrixWorld(true);
  const entry = captureScenicEntryView(world, target, model);
  const scenic = new THREE.PerspectiveCamera(55, world.aspect, 0.1, 260);
  const controls = controlsFor(scenic);
  const bounds = new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 35, 15));
  const settled = applyScenicEntryView(scenic, controls, entry, bounds, 1280, 720);
  for (const point of [[-4, 7, 3], [4, 22, -5], [0, 35, 0]]) {
    const expected = model.localToWorld(new THREE.Vector3(...point)).project(world);
    const actual = new THREE.Vector3(...point).project(scenic);
    assert.ok(actual.distanceTo(new THREE.Vector3(expected.x, expected.y, actual.z)) < 1e-6);
  }
  const direction = scenic.position.clone().sub(controls.target).normalize();
  assert.ok(direction.distanceTo(new THREE.Vector3(...entry.direction)) < 1e-10);
  for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
    const position = scenic.position.clone().lerp(settled.position, progress);
    const focus = controls.target.clone().lerp(settled.target, progress);
    assert.ok(position.sub(focus).normalize().distanceTo(direction) < 1e-10, 'settling rotates the inherited view');
  }
});

test('mobile first frame preserves lens offset and a different scene origin', () => {
  const world = new THREE.PerspectiveCamera(60, 390 / 844, 0.01, 500);
  world.setViewOffset(390, 844, 0, -84.4, 390, 844);
  world.position.set(1, 2, 3);
  const target = new THREE.Vector3(0, 0.03, 0);
  world.lookAt(target); world.updateMatrixWorld(true);
  const model = new THREE.Group(); model.scale.setScalar(0.01); model.updateMatrixWorld(true);
  const entry = captureScenicEntryView(world, target, model);
  const scenic = new THREE.PerspectiveCamera(55, world.aspect, 0.1, 190);
  const controls = controlsFor(scenic);
  const origin = new THREE.Vector3(0, -0.03, 8);
  const bounds = new THREE.Box3(new THREE.Vector3(-13, 0, -6), new THREE.Vector3(13, 10, 11));
  const settled = applyScenicEntryView(scenic, controls, entry, bounds, 390, 844, origin);
  const expected = new THREE.Vector3(0.02, 0.04, 0).project(world);
  const actual = new THREE.Vector3(2, 4, 0).add(origin).project(scenic);
  assert.ok(Math.abs(actual.x - expected.x) < 1e-6 && Math.abs(actual.y - expected.y) < 1e-6);
  assert.ok(controls.maxDistance >= scenic.position.distanceTo(controls.target), 'controls clip the inherited distance');
  assert.ok(scenic.far > scenic.position.distanceTo(controls.target));
  scenic.position.copy(settled.position); controls.target.copy(settled.target); controls.update();
  const center = bounds.getCenter(new THREE.Vector3()).project(scenic);
  assert.ok(Math.abs(center.y - 0.4) < 1e-6, 'mobile subject should settle above the information card');
});

test('a scene without a World miniature fits its bounds using the inherited geographic direction', () => {
  const world = new THREE.PerspectiveCamera(39, 1, 0.1, 200);
  world.position.set(-12, 16, -18); world.lookAt(0, 0, 0); world.updateMatrixWorld(true);
  const entry = captureScenicEntryView(world, new THREE.Vector3());
  const scenic = new THREE.PerspectiveCamera(40, 1280 / 720, 0.1, 500);
  const controls = controlsFor(scenic);
  const bounds = new THREE.Box3(new THREE.Vector3(-25, 0, -90), new THREE.Vector3(25, 20, 40));
  applyScenicEntryView(scenic, controls, entry, bounds, 1280, 720);
  assert.ok(scenic.position.clone().sub(controls.target).normalize().distanceTo(new THREE.Vector3(...entry.direction)) < 1e-10);
  for (const x of [-25, 25]) for (const y of [0, 20]) for (const z of [-90, 40]) {
    const projected = new THREE.Vector3(x, y, z).project(scenic);
    assert.ok(Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1, 'inherited-angle view crops the campus');
  }
});

test('pure scenic fitting keeps wide bounds clear of the desktop detail panel', () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-18, 0, -8), new THREE.Vector3(18, 10, 12));
  const entry = {
    direction: new THREE.Vector3(7, 10, 43).sub(new THREE.Vector3(2.5, 4, 0.5)).normalize().toArray(),
    fov: 40,
    projection: { x: 0, y: 0 },
  };
  const view = fitScenicEntryView(entry, bounds, 1280, 720);
  assert.ok(view.position.clone().sub(view.target).normalize().distanceTo(new THREE.Vector3(...entry.direction)) < 1e-10);

  const camera = new THREE.PerspectiveCamera(entry.fov, 1280 / 720, 0.1, 300);
  camera.position.copy(view.position);
  camera.lookAt(view.target);
  camera.updateMatrixWorld(true);
  for (const x of [-18, 18]) for (const y of [0, 10]) for (const z of [-8, 12]) {
    const projected = new THREE.Vector3(x, y, z).project(camera);
    assert.ok(projected.x >= -0.78 && projected.x <= 0.42, 'tower group overlaps a side panel');
    assert.ok(Math.abs(projected.y) <= 0.7, 'tower group is vertically cropped');
  }
});
