import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLandmarkIconScaler } from '../src/shared/landmark-scale.js';

function fixture(className = 'scenic-hotspot') {
  const classes = new Set([className]);
  const styles = new Map();
  const interaction = { hover: false, focus: false };
  const label = new THREE.Object3D();
  let writes = 0;
  label.element = {
    classList: { contains: (name) => classes.has(name) },
    matches: (selector) => (selector.includes(':hover') && interaction.hover)
      || (selector.includes(':focus-visible') && interaction.focus),
    style: {
      transform: 'translate(-50%,-50%) translate(100px,80px)',
      setProperty(name, value) { styles.set(name, value); writes += 1; },
    },
  };
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  camera.position.set(0, 0, 10);
  const target = new THREE.Vector3();
  const update = createLandmarkIconScaler([label], camera, target);
  const size = () => Number.parseFloat(styles.get('--landmark-icon-size') ?? '22px');
  const hitSize = () => Number.parseFloat(styles.get('--landmark-hit-size') ?? '30px');
  return { label, camera, target, update, size, hitSize, classes, interaction, writes: () => writes };
}

test('map icons shrink with distance and stop at the minimum size', () => {
  const view = fixture();
  view.update();
  assert.equal(view.size(), 22);
  view.camera.position.z = 20;
  view.update();
  assert.ok(view.size() < 22 && view.size() > 14);
  view.camera.position.z = 100;
  view.update();
  assert.equal(view.size(), 14);
  assert.ok(view.hitSize() >= 30, 'far icons lost their original click area');
});

test('near icons stop at 30px and remain inside a larger clickable button', () => {
  const view = fixture();
  view.camera.position.z = 1;
  view.update();
  assert.equal(view.size(), 30);
  assert.equal(view.hitSize(), 34);
  assert.equal(view.label.userData.landmarkHitSize, view.hitSize());
  assert.equal(view.label.element.style.transform, 'translate(-50%,-50%) translate(100px,80px)');
});

test('lens zoom affects icon size without requiring camera movement', () => {
  const view = fixture();
  view.camera.fov = 70;
  view.camera.updateProjectionMatrix();
  view.update();
  assert.ok(view.size() < 22, 'a wider field of view did not shrink icons');
  view.camera.fov = 40;
  view.camera.zoom = 4;
  view.camera.updateProjectionMatrix();
  view.update();
  assert.equal(view.size(), 30, 'lens zoom did not enlarge and cap icons');
});

test('panning and orbiting preserve the zoom-based size', () => {
  const view = fixture();
  view.update();
  view.camera.position.add(new THREE.Vector3(15, -5, 20));
  view.target.add(new THREE.Vector3(15, -5, 20));
  view.update();
  assert.equal(view.size(), 22, 'pan changed icon size');
  view.camera.position.copy(view.target).add(new THREE.Vector3(10, 0, 0));
  view.camera.lookAt(view.target);
  view.update();
  assert.equal(view.size(), 22, 'orbit changed icon size');
});

test('selected, pinned, hovered and keyboard-focused far icons stay readable', () => {
  const view = fixture();
  view.camera.position.z = 100;
  for (const state of ['is-active', 'is-open', 'is-pinned']) {
    view.classes.add(state);
    view.update();
    assert.equal(view.size(), 22, state);
    view.classes.delete(state);
  }
  view.interaction.hover = true;
  view.update();
  assert.equal(view.size(), 22, 'hover');
  view.interaction.hover = false;
  view.interaction.focus = true;
  view.update();
  assert.equal(view.size(), 22, 'keyboard focus');
  view.interaction.focus = false;
  view.update();
  assert.equal(view.size(), 14, 'unfocused icon did not shrink again');
});

test('garden icons keep their original click area and stable frames do not rewrite CSS', () => {
  const view = fixture('garden-hotspot');
  view.camera.position.z = 100;
  view.update();
  assert.equal(view.size(), 14);
  assert.equal(view.hitSize(), 31);
  const writes = view.writes();
  view.update();
  assert.equal(view.writes(), writes);
});
