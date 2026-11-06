import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createWalkControls } from '../src/zhouzhuang/walk-controls.js';

class EventTargetStub {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    this.listeners.set(type, listeners.filter((candidate) => candidate !== listener));
  }

  dispatch(type, init = {}) {
    const event = {
      type,
      preventDefault() {},
      ...init,
    };
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
    return event;
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHarness({ lock = 'success', move } = {}) {
  const fakeDocument = new EventTargetStub();
  fakeDocument.pointerLockElement = null;
  fakeDocument.visibilityState = 'visible';
  fakeDocument.exitPointerLockCalls = 0;
  fakeDocument.exitPointerLock = () => {
    fakeDocument.exitPointerLockCalls += 1;
    fakeDocument.pointerLockElement = null;
    fakeDocument.dispatch('pointerlockchange');
  };

  const fakeWindow = new EventTargetStub();
  const element = new EventTargetStub();
  element.requestPointerLockCalls = 0;
  element.requestPointerLock = () => {
    element.requestPointerLockCalls += 1;
    if (lock === 'throw') throw new Error('pointer lock blocked');
    if (lock === 'reject') return Promise.reject(new Error('pointer lock blocked'));
    if (lock === 'resolve-without-lock') return Promise.resolve();
    if (lock?.promise) return lock.promise;
    fakeDocument.pointerLockElement = element;
    fakeDocument.dispatch('pointerlockchange');
    return Promise.resolve();
  };

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
  const moveCalls = [];
  const navigation = {
    locate(x, z, preferredRoadId) {
      return { x, y: 2.1, z, roadId: preferredRoadId || 'south-street' };
    },
    move(state, dx, dz, radius) {
      moveCalls.push({ state: { ...state }, dx, dz, radius });
      if (move) return move(state, dx, dz, radius);
      return { ...state, x: state.x + dx, z: state.z + dz };
    },
  };
  const changes = [];
  const controls = createWalkControls({
    camera,
    element,
    document: fakeDocument,
    window: fakeWindow,
    navigation,
    spawn: { x: 10, y: 2.1, z: 20, roadId: 'bridge-east', yaw: Math.PI / 2 },
    onChange(change) {
      changes.push(change);
    },
  });

  return {
    camera,
    changes,
    controls,
    document: fakeDocument,
    element,
    moveCalls,
    window: fakeWindow,
  };
}

function key(target, type, value) {
  target.dispatch(type, { key: value });
}

test('a browser without pointer lock can walk and drag to look without pretending to own a lock', async () => {
  const h = createHarness();
  delete h.element.requestPointerLock;
  assert.equal(await h.controls.enter(), true);
  assert.equal(h.controls.getState().mode, 'walking');
  assert.equal(h.controls.getState().locked, false);
  assert.equal(h.changes.at(-1).lookMode, 'drag');
  const before = h.camera.rotation.y;
  h.element.dispatch('pointerdown', { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
  h.document.dispatch('pointermove', { pointerId: 1, clientX: 70, clientY: 25 });
  h.document.dispatch('pointerup', { pointerId: 1 });
  assert.ok(h.camera.rotation.y < before);
  const after = h.camera.rotation.y;
  h.document.dispatch('pointermove', { pointerId: 1, clientX: 120, clientY: 25 });
  assert.equal(h.camera.rotation.y, after, 'released drag must stop changing the view');
  key(h.document, 'keydown', 'w');
  h.controls.update(0.1);
  assert.ok(h.moveCalls.length);
  h.window.dispatch('blur');
  assert.equal(h.controls.getState().mode, 'overview');
  h.controls.dispose();
});

test('enter places the camera at eye height and reports walking only after pointer lock succeeds', async () => {
  const pendingLock = deferred();
  const harness = createHarness({ lock: pendingLock });

  const entering = harness.controls.enter();

  assert.deepEqual(harness.changes, []);
  assert.deepEqual(harness.camera.position.toArray(), [10, 3.75, 20]);
  assert.equal(harness.camera.rotation.order, 'YXZ');
  assert.equal(harness.camera.rotation.y, Math.PI / 2);

  harness.document.pointerLockElement = harness.element;
  harness.document.dispatch('pointerlockchange');
  pendingLock.resolve();

  assert.equal(await entering, true);
  assert.deepEqual(harness.changes, [{ mode: 'walking', locked: true, message: '已进入行走模式。WASD移动，鼠标环视，Esc返回。' }]);
  assert.deepEqual(harness.controls.getState(), {
    x: 10,
    y: 2.1,
    z: 20,
    roadId: 'bridge-east',
    mode: 'walking',
    locked: true,
  });
});

test('W and ArrowUp move forward horizontally at the same speed', async () => {
  const harness = createHarness();
  await harness.controls.enter();
  harness.camera.rotation.y = 0;
  harness.camera.rotation.x = 1.2;

  key(harness.document, 'keydown', 'w');
  harness.controls.update(1);
  key(harness.document, 'keyup', 'w');
  const keyboardMove = harness.moveCalls.at(-1);

  harness.controls.reset();
  harness.camera.rotation.y = 0;
  key(harness.document, 'keydown', 'ArrowUp');
  harness.controls.update(1);
  key(harness.document, 'keyup', 'ArrowUp');
  const arrowMove = harness.moveCalls.at(-1);

  assert.ok(Math.abs(keyboardMove.dx) < 1e-12);
  assert.ok(Math.abs(keyboardMove.dz + 0.28) < 1e-12);
  assert.equal(Math.hypot(keyboardMove.dx, keyboardMove.dz), Math.hypot(arrowMove.dx, arrowMove.dz));
  assert.ok(Math.abs(arrowMove.dz + 0.28) < 1e-12);
  assert.equal(harness.camera.position.y, 3.75, 'pitch does not add vertical movement');
});

test('diagonal movement is normalized to the same speed as straight movement', async () => {
  const straight = createHarness();
  await straight.controls.enter();
  straight.camera.rotation.y = 0;
  key(straight.document, 'keydown', 'w');
  straight.controls.update(0.1);
  const straightMove = straight.moveCalls.at(-1);

  const diagonal = createHarness();
  await diagonal.controls.enter();
  diagonal.camera.rotation.y = 0;
  key(diagonal.document, 'keydown', 'w');
  key(diagonal.document, 'keydown', 'd');
  diagonal.controls.update(0.1);
  const diagonalMove = diagonal.moveCalls.at(-1);

  assert.ok(Math.abs(Math.hypot(straightMove.dx, straightMove.dz) - 0.28) < 1e-12);
  assert.ok(Math.abs(
    Math.hypot(diagonalMove.dx, diagonalMove.dz)
      - Math.hypot(straightMove.dx, straightMove.dz),
  ) < 1e-12);
});

test('movement agrees with the real Three camera direction at yaw 90 degrees', async () => {
  const forward = createHarness();
  await forward.controls.enter();
  key(forward.document, 'keydown', 'w');
  forward.controls.update(0.1);

  assert.ok(Math.abs(forward.moveCalls[0].dx + 0.28) < 1e-12);
  assert.ok(Math.abs(forward.moveCalls[0].dz) < 1e-12);

  const right = createHarness();
  await right.controls.enter();
  key(right.document, 'keydown', 'd');
  right.controls.update(0.1);

  assert.ok(Math.abs(right.moveCalls[0].dx) < 1e-12);
  assert.ok(Math.abs(right.moveCalls[0].dz + 0.28) < 1e-12);
});

test('forward movement stays aligned with camera direction after mouse yaw', async () => {
  const harness = createHarness();
  await harness.controls.enter();
  harness.document.dispatch('mousemove', { movementX: 100, movementY: 0 });
  const expectedDirection = new THREE.Vector3();
  harness.camera.getWorldDirection(expectedDirection);
  expectedDirection.y = 0;
  expectedDirection.normalize();

  key(harness.document, 'keydown', 'w');
  harness.controls.update(0.1);

  const actual = new THREE.Vector3(
    harness.moveCalls[0].dx,
    0,
    harness.moveCalls[0].dz,
  ).normalize();
  assert.ok(actual.distanceTo(expectedDirection) < 1e-12);
});

test('movement follows road height smoothly while reset lands immediately at spawn height', async () => {
  const harness = createHarness({
    move(state, dx, dz) {
      return { ...state, x: state.x + dx, y: 4.1, z: state.z + dz };
    },
  });
  await harness.controls.enter();
  key(harness.document, 'keydown', 'w');

  harness.controls.update(0.05);

  assert.ok(harness.camera.position.y > 3.75 && harness.camera.position.y < 5.75);
  harness.controls.reset();
  assert.equal(harness.camera.position.y, 3.75);
  assert.equal(harness.controls.getState().mode, 'walking');
});

test('eye height keeps converging to the current road height after movement stops', async () => {
  const harness = createHarness({
    move(state, dx, dz) {
      return { ...state, x: state.x + dx, y: 4.1, z: state.z + dz };
    },
  });
  await harness.controls.enter();
  key(harness.document, 'keydown', 'w');
  harness.controls.update(0.05);
  key(harness.document, 'keyup', 'w');
  const heightAfterStep = harness.camera.position.y;

  for (let index = 0; index < 20; index += 1) harness.controls.update(0.05);

  assert.ok(harness.camera.position.y > heightAfterStep);
  assert.ok(Math.abs(harness.camera.position.y - 5.75) < 0.001);
});

test('window blur clears held keys and exits walking mode', async () => {
  const harness = createHarness();
  await harness.controls.enter();
  key(harness.document, 'keydown', 'w');

  harness.window.dispatch('blur');
  harness.controls.update(0.1);

  assert.equal(harness.moveCalls.length, 0);
  assert.equal(harness.document.exitPointerLockCalls, 1);
  assert.equal(harness.controls.getState().mode, 'overview');
  assert.deepEqual(harness.changes.at(-1), { mode: 'overview', locked: false, message: '已退出行走模式。' });
});

for (const lock of ['reject', 'throw', 'resolve-without-lock']) {
  test(`pointer lock ${lock} falls back to keyboard walking and drag look`, async () => {
    const harness = createHarness({ lock });

    assert.equal(await harness.controls.enter(), true);

    assert.equal(harness.controls.getState().mode, 'walking');
    assert.equal(harness.controls.getState().locked, false);
    assert.equal(harness.changes.length, 1);
    assert.equal(harness.changes[0].mode, 'walking');
    assert.equal(harness.changes[0].lookMode, 'drag');
    assert.equal(harness.changes[0].locked, false);
    assert.match(harness.changes[0].message, /拖动/);
    harness.document.dispatch('pointerlockerror');
    assert.equal(harness.controls.getState().mode, 'walking', 'duplicate errors cannot cancel the active fallback');
    key(harness.document, 'keydown', 'w');
    harness.controls.update(0.1);
    assert.equal(harness.moveCalls.length, 1);
    key(harness.document, 'keydown', 'Escape');
    assert.equal(harness.controls.getState().mode, 'overview');
  });
}

test('pointer lock loss exits, while a lock owned by another element is never released', async () => {
  const harness = createHarness();
  await harness.controls.enter();

  harness.document.pointerLockElement = null;
  harness.document.dispatch('pointerlockchange');
  assert.equal(harness.controls.getState().mode, 'overview');

  harness.document.pointerLockElement = {};
  harness.controls.exit();
  assert.equal(harness.document.exitPointerLockCalls, 0);
});

test('repeated enter shares one pending request and cancellation wins over a late success', async () => {
  const pendingLock = deferred();
  const harness = createHarness({ lock: pendingLock });

  const first = harness.controls.enter();
  const second = harness.controls.enter();
  assert.equal(first, second);
  assert.equal(harness.element.requestPointerLockCalls, 1);

  harness.controls.exit();
  harness.document.pointerLockElement = harness.element;
  harness.document.dispatch('pointerlockchange');
  pendingLock.resolve();

  assert.equal(await first, false);
  assert.equal(harness.controls.getState().mode, 'overview');
  assert.equal(harness.changes.some((change) => change.mode === 'walking'), false);
});

test('dispose is idempotent, releases only its own lock, and prevents later movement', async () => {
  const harness = createHarness();
  await harness.controls.enter();

  harness.controls.dispose();
  harness.controls.dispose();
  key(harness.document, 'keydown', 'w');
  harness.controls.update(0.1);

  assert.equal(harness.document.exitPointerLockCalls, 1);
  assert.equal(harness.moveCalls.length, 0);
});
