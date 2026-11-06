import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneShell, resizeSceneViewport } from '../src/shared/scene-shell.js';

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    const set = this.listeners.get(type) || new Set();
    set.add(handler);
    this.listeners.set(type, set);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  emit(type, event = {}) { this.listeners.get(type)?.forEach((handler) => handler(event)); }
}

class ResizeObserverStub {
  constructor(callback) { this.callback = callback; this.disconnected = false; }
  observe(target) { this.target = target; }
  disconnect() { this.disconnected = true; }
}

test('scene shell schedules one frame, observes resize, and removes listeners on dispose', () => {
  const target = new Target();
  const resizeTarget = {};
  const frames = [];
  const cancelled = [];
  const shell = createSceneShell({
    requestFrame(callback) { frames.push(callback); return 17; },
    cancelFrame(id) { cancelled.push(id); },
    ResizeObserverCtor: ResizeObserverStub,
  });
  let calls = 0;
  shell.listen(target, 'change', () => { calls += 1; });
  const observer = shell.observeResize(resizeTarget, () => { calls += 1; });
  shell.request(() => { calls += 1; });
  target.emit('change');
  observer.callback();
  assert.equal(frames.length, 1);
  assert.equal(calls, 2);
  shell.dispose();
  target.emit('change');
  frames[0]();
  assert.deepEqual(cancelled, [17]);
  assert.equal(observer.disconnected, true);
  assert.equal(calls, 2);
  assert.equal(shell.disposed, true);
  shell.dispose();
  assert.deepEqual(cancelled, [17]);
});

test('scene shell does not schedule work after disposal', () => {
  const shell = createSceneShell({
    requestFrame() { throw new Error('requestFrame should not run'); },
    cancelFrame() {},
  });
  shell.dispose();
  assert.equal(shell.request(() => {}), 0);
});

test('viewport resize updates projection only and preserves the user camera pose', () => {
  const camera = {
    position: { x: 4, y: 5, z: 6 },
    target: { x: 1, y: 2, z: 3 },
    setViewOffset() { this.offsetSet = true; },
    updateProjectionMatrix() { this.projectionUpdated = true; },
  };
  const renderer = { setSize(width, height, updateStyle) { this.size = [width, height, updateStyle]; } };
  const labels = { setSize(width, height) { this.size = [width, height]; } };
  const container = { clientWidth: 900, clientHeight: 600 };
  assert.equal(resizeSceneViewport({ container, camera, renderer, labels }), true);
  assert.deepEqual(camera.position, { x: 4, y: 5, z: 6 });
  assert.deepEqual(camera.target, { x: 1, y: 2, z: 3 });
  assert.equal(camera.aspect, 1.5);
  assert.equal(camera.fov, 40);
  assert.deepEqual(renderer.size, [900, 600, false]);
  assert.deepEqual(labels.size, [900, 600]);
});

test('scene shell runs DOM cleanups exactly once during disposal', () => {
  const node = { removed: 0, remove() { this.removed += 1; } };
  const shell = createSceneShell({ requestFrame() { return 1; }, cancelFrame() {} });
  shell.addCleanup(() => node.remove());
  shell.dispose();
  shell.dispose();
  assert.equal(node.removed, 1);
});
