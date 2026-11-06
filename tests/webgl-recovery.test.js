import test from 'node:test';
import assert from 'node:assert/strict';
import { attachWebGLRecovery } from '../src/shared/webgl-recovery.js';

class Node {
  constructor() { this.listeners = new Map(); this.children = []; }
  addEventListener(type, handler) { const set = this.listeners.get(type) || new Set(); set.add(handler); this.listeners.set(type, set); }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  append(child) { this.children.push(child); child.parentNode = this; }
  dispatch(type, event = {}) { this.listeners.get(type)?.forEach((handler) => handler({ type, preventDefault() { this.prevented = true; }, ...event })); }
}

test('webgl recovery prevents loss, shows a local notice, and clears it on restore', () => {
  const parent = new Node();
  const canvas = new Node();
  parent.append(canvas);
  const document = { createElement() {
    const node = new Node();
    node.remove = () => { node.removed = true; };
    node.setAttribute = () => {};
    return node;
  } };
  const events = [];
  let reloads = 0;
  const detach = attachWebGLRecovery(canvas, { document, reload: () => reloads++, onLost: () => events.push('lost'), onRestored: () => events.push('restored') });
  let lossEvent;
  canvas.listeners.get('webglcontextlost').forEach((handler) => { lossEvent = { preventDefault() { this.prevented = true; } }; handler(lossEvent); });
  assert.equal(lossEvent.prevented, true);
  assert.equal(parent.children.length, 2);
  parent.children[1].children[0].dispatch('click');
  assert.equal(reloads, 1);
  assert.deepEqual(events, ['lost']);
  canvas.dispatch('webglcontextrestored');
  assert.equal(parent.children[1].removed, true);
  assert.deepEqual(events, ['lost', 'restored']);
  detach();
  assert.equal(canvas.listeners.get('webglcontextlost').size, 0);
  assert.equal(canvas.listeners.get('webglcontextrestored').size, 0);
});
