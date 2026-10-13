import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { enableShiftPan } from '../src/shared/scene-controls.js';

class EventTargetStub {
  constructor(root = this) {
    this.root = root;
    this.listeners = new Map();
  }

  addEventListener(type, listener, options = {}) {
    const capture = options === true || options.capture === true;
    const list = this.listeners.get(type) || [];
    list.push({ listener, capture });
    this.listeners.set(type, list);
  }

  removeEventListener(type, listener, options = {}) {
    const capture = options === true || options.capture === true;
    const list = this.listeners.get(type) || [];
    this.listeners.set(type, list.filter((entry) => entry.listener !== listener || entry.capture !== capture));
  }

  dispatch(type, init = {}) {
    const event = {
      type,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() { this.immediateStopped = true; },
      ...init,
    };
    const list = [...(this.listeners.get(type) || [])];
    for (const entry of [...list].sort((a, b) => Number(b.capture) - Number(a.capture))) {
      if (event.immediateStopped) break;
      entry.listener(event);
    }
    return event;
  }
}

function makeControls() {
  const root = new EventTargetStub();
  const element = new EventTargetStub(root);
  element.style = {};
  element.clientWidth = 800;
  element.clientHeight = 600;
  element.setPointerCapture = () => {};
  element.releasePointerCapture = () => {};
  element.getRootNode = () => root;
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, 0.1, 1000);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const controls = new OrbitControls(camera, element);
  controls.enableDamping = false;
  controls.enablePan = false;
  const cleanup = enableShiftPan(controls);
  return { camera, controls, element, cleanup };
}

function pointer(pointerType, button, pageX, pageY, modifiers = {}) {
  return {
    pointerId: 1,
    pointerType,
    button,
    pageX,
    pageY,
    clientX: pageX,
    clientY: pageY,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    ...modifiers,
  };
}

function drag(element, start, end) {
  element.dispatch('pointerdown', start);
  element.dispatch('pointermove', end);
  element.dispatch('pointerup', end);
}

function snapshot(camera, controls) {
  return {
    position: camera.position.clone(),
    target: controls.target.clone(),
    relative: camera.position.clone().sub(controls.target),
  };
}

function assertVectorClose(actual, expected, message) {
  assert.ok(actual.distanceTo(expected) < 1e-9, message);
}

test('Shift + left mouse drag pans camera and target together', () => {
  const { camera, controls, element, cleanup } = makeControls();
  const before = snapshot(camera, controls);
  drag(element, pointer('mouse', 0, 100, 100, { shiftKey: true }), pointer('mouse', 0, 180, 140, { shiftKey: true }));
  controls.update();
  const after = snapshot(camera, controls);
  assert.notDeepEqual(after.target.toArray(), before.target.toArray());
  assertVectorClose(after.relative, before.relative, 'panning preserves camera orientation and distance');
  assertVectorClose(after.position.clone().sub(before.position), after.target.clone().sub(before.target), 'camera and target pan together');
  cleanup();
  controls.dispose();
});

test('ordinary left drag rotates without panning target', () => {
  const { camera, controls, element, cleanup } = makeControls();
  const before = snapshot(camera, controls);
  drag(element, pointer('mouse', 0, 100, 100), pointer('mouse', 0, 180, 140));
  controls.update();
  const after = snapshot(camera, controls);
  assertVectorClose(after.target, before.target, 'ordinary rotation leaves target fixed');
  assert.notDeepEqual(after.relative.toArray(), before.relative.toArray());
  cleanup();
  controls.dispose();
});

for (const [name, modifiers] of [
  ['Ctrl', { ctrlKey: true }],
  ['Meta', { metaKey: true }],
]) {
  test(`${name} + left drag does not enable panning`, () => {
    const { camera, controls, element, cleanup } = makeControls();
    const before = snapshot(camera, controls);
    drag(element, pointer('mouse', 0, 100, 100, modifiers), pointer('mouse', 0, 180, 140, modifiers));
    controls.update();
    assertVectorClose(controls.target, before.target, `${name} drag leaves target fixed`);
    cleanup();
    controls.dispose();
  });
}

test('right mouse and two-touch dolly-pan do not enable panning', () => {
  {
    const { camera, controls, element, cleanup } = makeControls();
    const before = snapshot(camera, controls);
    drag(element, pointer('mouse', 2, 100, 100), pointer('mouse', 2, 180, 140));
    controls.update();
    assertVectorClose(controls.target, before.target, 'right mouse leaves target fixed');
    cleanup();
    controls.dispose();
  }

  const { camera, controls, element, cleanup } = makeControls();
  const before = snapshot(camera, controls);
  element.dispatch('pointerdown', { ...pointer('touch', 0, 100, 100), pointerId: 1 });
  element.dispatch('pointerdown', { ...pointer('touch', 0, 200, 100), pointerId: 2 });
  element.dispatch('pointermove', { ...pointer('touch', 0, 100, 140), pointerId: 1 });
  element.dispatch('pointermove', { ...pointer('touch', 0, 220, 140), pointerId: 2 });
  element.dispatch('pointerup', { ...pointer('touch', 0, 100, 140), pointerId: 1 });
  element.dispatch('pointerup', { ...pointer('touch', 0, 220, 140), pointerId: 2 });
  controls.update();
  assertVectorClose(controls.target, before.target, 'two-touch dolly-pan leaves target fixed');
  cleanup();
  controls.dispose();
});

test('cleanup disables future Shift + left panning', () => {
  const { camera, controls, element, cleanup } = makeControls();
  drag(element, pointer('mouse', 0, 100, 100, { shiftKey: true }), pointer('mouse', 0, 180, 140, { shiftKey: true }));
  controls.update();
  const panned = controls.target.clone();
  assert.notDeepEqual(panned.toArray(), [0, 0, 0]);
  cleanup();
  drag(element, pointer('mouse', 0, 100, 100, { shiftKey: true }), pointer('mouse', 0, 180, 140, { shiftKey: true }));
  controls.update();
  assertVectorClose(controls.target, panned, 'cleanup removes the gating listener');
  controls.dispose();
});

test('pan gesture is followed by normal rotation', () => {
  const { camera, controls, element, cleanup } = makeControls();
  drag(element, pointer('mouse', 0, 100, 100, { shiftKey: true }), pointer('mouse', 0, 180, 140, { shiftKey: true }));
  controls.update();
  const pannedTarget = controls.target.clone();
  drag(element, pointer('mouse', 0, 100, 100), pointer('mouse', 0, 180, 140));
  controls.update();
  assertVectorClose(controls.target, pannedTarget, 'rotation keeps the panned target');
  assert.notDeepEqual(camera.position.clone().sub(controls.target).toArray(), [0, 0, 10]);
  cleanup();
  controls.dispose();
});
