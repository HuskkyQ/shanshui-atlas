const WALK_SPEED = 2.8;
const EYE_HEIGHT = 1.65;
const MAX_FRAME_SECONDS = 0.1;
const HEIGHT_FOLLOW_RATE = 12;
const LOOK_SENSITIVITY = 0.002;
const MAX_PITCH = Math.PI / 2 - 0.05;
const LOCK_FAILURE_MESSAGE = '鼠标锁定已退出，请再次点击进入街区。';
const DRAG_MESSAGE = '按住鼠标拖动环视，WASD移动，Esc返回。';

const MOVEMENT_KEYS = new Set([
  'w', 'a', 's', 'd',
  'arrowup', 'arrowleft', 'arrowdown', 'arrowright',
]);

function normalizeKey(event) {
  return String(event.key || '').toLowerCase();
}

export function createWalkControls({
  camera,
  element,
  document,
  window,
  navigation,
  spawn,
  onChange = () => {},
}) {
  let disposed = false;
  let mode = 'overview';
  let locked = false;
  let dragMode = false;
  let drag = null;
  let requestGeneration = 0;
  let pending = null;
  let state = locateSpawn();
  const pressed = new Set();

  function locateSpawn() {
    return navigation.locate(spawn.x, spawn.z, spawn.roadId) || {
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      roadId: spawn.roadId,
    };
  }

  function emit(message = '') {
    onChange({ mode, locked, message, ...(dragMode ? { lookMode: 'drag' } : {}) });
  }

  function clearKeys() {
    pressed.clear();
    if (drag && element.hasPointerCapture?.(drag.id)) element.releasePointerCapture(drag.id);
    drag = null;
  }

  function placeAtSpawn() {
    state = locateSpawn();
    camera.position.set(state.x, state.y + EYE_HEIGHT, state.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(0, spawn.yaw || 0, 0, 'YXZ');
    camera.updateMatrixWorld?.();
  }

  function resolvePending(value, generation = pending?.generation) {
    if (!pending || pending.generation !== generation) return;
    const { resolve } = pending;
    pending = null;
    resolve(value);
  }

  function confirmLock(generation = pending?.generation) {
    if (
      disposed
      || !pending
      || pending.generation !== generation
      || generation !== requestGeneration
      || document.pointerLockElement !== element
    ) return false;

    mode = 'walking';
    locked = true;
    resolvePending(true, generation);
    emit('已进入行走模式。WASD移动，鼠标环视，Esc返回。');
    return true;
  }

  function useDragLook(generation) {
    if (disposed || !pending || pending.generation !== generation) return;
    clearKeys();
    dragMode = true;
    mode = 'walking';
    locked = false;
    resolvePending(true, generation);
    emit(`已进入行走模式。${DRAG_MESSAGE}`);
  }

  function failLock(generation) {
    useDragLook(generation);
  }

  function enter() {
    if (disposed) return Promise.resolve(false);
    if (mode === 'walking' && (dragMode || (locked && document.pointerLockElement === element))) {
      return Promise.resolve(true);
    }
    if (pending) return pending.promise;

    clearKeys();
    placeAtSpawn();
    const generation = ++requestGeneration;
    let resolve;
    const promise = new Promise((resolvePromise) => {
      resolve = resolvePromise;
    });
    pending = { generation, promise, resolve };

    if (typeof element.requestPointerLock !== 'function') {
      useDragLook(generation);
      return promise;
    }

    try {
      const result = element.requestPointerLock();
      if (document.pointerLockElement === element) confirmLock(generation);
      if (result && typeof result.then === 'function') {
        Promise.resolve(result).then(() => {
          if (disposed || generation !== requestGeneration || !pending) return;
          if (document.pointerLockElement === element) confirmLock(generation);
          else failLock(generation);
        }, () => failLock(generation));
      }
    } catch {
      failLock(generation);
    }

    return promise;
  }

  function exit(message = '已退出行走模式。') {
    if (disposed) return;
    const wasActive = mode === 'walking' || locked || Boolean(pending);
    const pendingGeneration = pending?.generation;
    requestGeneration += 1;
    clearKeys();
    mode = 'overview';
    locked = false;
    dragMode = false;
    if (pendingGeneration !== undefined) resolvePending(false, pendingGeneration);

    if (document.pointerLockElement === element && typeof document.exitPointerLock === 'function') {
      try {
        document.exitPointerLock();
      } catch {
        // The browser may have already released the lock.
      }
    }
    if (wasActive) emit(message);
  }

  function reset() {
    if (disposed) return getState();
    clearKeys();
    placeAtSpawn();
    return getState();
  }

  function update(dt) {
    if (disposed || mode !== 'walking' || (!dragMode && (!locked || document.pointerLockElement !== element))) return;
    const frameSeconds = Math.min(Math.max(Number(dt) || 0, 0), MAX_FRAME_SECONDS);
    if (frameSeconds === 0) return;

    const forward = Number(pressed.has('w') || pressed.has('arrowup'))
      - Number(pressed.has('s') || pressed.has('arrowdown'));
    const right = Number(pressed.has('d') || pressed.has('arrowright'))
      - Number(pressed.has('a') || pressed.has('arrowleft'));
    const inputLength = Math.hypot(forward, right);
    if (inputLength > 0) {
      const normalizedForward = forward / inputLength;
      const normalizedRight = right / inputLength;
      const yaw = camera.rotation.y;
      const distance = WALK_SPEED * frameSeconds;
      const dx = (
        -normalizedForward * Math.sin(yaw)
        + normalizedRight * Math.cos(yaw)
      ) * distance;
      const dz = (
        -normalizedForward * Math.cos(yaw)
        - normalizedRight * Math.sin(yaw)
      ) * distance;
      const next = navigation.move(state, dx, dz, 0.25);
      if (next) state = next;
      camera.position.x = state.x;
      camera.position.z = state.z;
    }

    const targetY = state.y + EYE_HEIGHT;
    const heightBlend = 1 - Math.exp(-HEIGHT_FOLLOW_RATE * frameSeconds);
    camera.position.y += (targetY - camera.position.y) * heightBlend;
    camera.updateMatrixWorld?.();
  }

  function getState() {
    return {
      x: state.x,
      y: state.y,
      z: state.z,
      roadId: state.roadId,
      mode,
      locked,
    };
  }

  function onKeyDown(event) {
    const key = normalizeKey(event);
    if (key === 'escape') {
      if (mode === 'walking' || pending) event.preventDefault?.();
      exit();
      return;
    }
    if (!MOVEMENT_KEYS.has(key) || mode !== 'walking' || (!dragMode && !locked)) return;
    event.preventDefault?.();
    pressed.add(key);
  }

  function onKeyUp(event) {
    const key = normalizeKey(event);
    if (!MOVEMENT_KEYS.has(key)) return;
    event.preventDefault?.();
    pressed.delete(key);
  }

  function onMouseMove(event) {
    if (disposed || mode !== 'walking' || !locked || document.pointerLockElement !== element) return;
    const movementX = Number(event.movementX) || 0;
    const movementY = Number(event.movementY) || 0;
    camera.rotation.order = 'YXZ';
    camera.rotation.y -= movementX * LOOK_SENSITIVITY;
    camera.rotation.x = Math.max(
      -MAX_PITCH,
      Math.min(MAX_PITCH, camera.rotation.x - movementY * LOOK_SENSITIVITY),
    );
    camera.rotation.z = 0;
  }

  function onDragStart(event) {
    if (mode !== 'walking' || !dragMode || event.button !== 0) return;
    event.preventDefault?.();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    element.setPointerCapture?.(event.pointerId);
  }

  function onDragMove(event) {
    if (!drag || mode !== 'walking' || !dragMode || event.pointerId !== drag.id) return;
    camera.rotation.y -= (event.clientX - drag.x) * LOOK_SENSITIVITY;
    camera.rotation.x = Math.max(-MAX_PITCH, Math.min(MAX_PITCH,
      camera.rotation.x - (event.clientY - drag.y) * LOOK_SENSITIVITY));
    drag.x = event.clientX;
    drag.y = event.clientY;
  }

  function onDragEnd(event) {
    if (!drag || event.pointerId !== drag.id) return;
    if (element.hasPointerCapture?.(drag.id)) element.releasePointerCapture(drag.id);
    drag = null;
  }

  function onPointerLockChange() {
    if (disposed) return;
    if (document.pointerLockElement === element) {
      if (pending) confirmLock(pending.generation);
      else if ((dragMode || mode !== 'walking') && typeof document.exitPointerLock === 'function') {
        try {
          document.exitPointerLock();
        } catch {
          // A canceled request can finish after the browser already released it.
        }
      }
      return;
    }

    if (pending) {
      failLock(pending.generation);
      return;
    }
    if (locked) {
      clearKeys();
      mode = 'overview';
      locked = false;
      emit('已退出行走模式。');
    }
  }

  function onPointerLockError() {
    if (pending) failLock(pending.generation);
    else if (locked) exit(LOCK_FAILURE_MESSAGE);
  }

  function onBlur() {
    clearKeys();
    if (mode === 'walking' || pending) exit();
  }

  function onVisibilityChange() {
    if (document.hidden || document.visibilityState === 'hidden') onBlur();
  }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('pointerlockchange', onPointerLockChange);
  document.addEventListener('pointerlockerror', onPointerLockError);
  document.addEventListener('visibilitychange', onVisibilityChange);
  element.addEventListener('pointerdown', onDragStart);
  document.addEventListener('pointermove', onDragMove);
  document.addEventListener('pointerup', onDragEnd);
  document.addEventListener('pointercancel', onDragEnd);
  window.addEventListener('blur', onBlur);

  function dispose() {
    if (disposed) return;
    disposed = true;
    dragMode = false;
    requestGeneration += 1;
    clearKeys();
    mode = 'overview';
    locked = false;
    if (pending) resolvePending(false, pending.generation);

    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('pointerlockchange', onPointerLockChange);
    document.removeEventListener('pointerlockerror', onPointerLockError);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    element.removeEventListener('pointerdown', onDragStart);
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
    document.removeEventListener('pointercancel', onDragEnd);
    window.removeEventListener('blur', onBlur);

    if (document.pointerLockElement === element && typeof document.exitPointerLock === 'function') {
      try {
        document.exitPointerLock();
      } catch {
        // Disposing must remain idempotent if the browser races lock release.
      }
    }
  }

  return { enter, exit, reset, update, dispose, getState };
}
