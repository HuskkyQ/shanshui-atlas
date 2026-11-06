import test from 'node:test';
import assert from 'node:assert/strict';
import { createXingpingUI } from '../src/xingping/index.js';
import { createChangbaiUI } from '../src/changbai/index.js';

class Element {
  hidden = false;
  listeners = new Map();
  classList = { toggle() {} };
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type) { this.listeners.delete(type); }
  append() {}
  setAttribute() {}
  emit(type, event) { return this.listeners.get(type)?.(event); }
}

for (const [name, createUI] of [['xingping', createXingpingUI], ['changbai', createChangbaiUI]]) {
  test(`${name} captures module-download failures and retries through its existing error UI`, async t => {
    const elements = new Map();
    const get = selector => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    };
    let downloads = 0, creations = 0, disposals = 0;
    const ui = createUI({
      document: { querySelector: get, createElement: () => new Element() },
      window: new Element(), pois: [],
      loadScene: async () => {
        downloads++;
        if (downloads === 1) throw new TypeError('Failed to fetch dynamically imported module');
        return { createScene: async () => {
          creations++;
          return { dispose() { disposals++; } };
        } };
      },
    });
    t.after(() => ui.dispose());
    t.mock.method(console, 'error', () => {});
    assert.equal(await ui.start(), false);
    assert.equal(get(`#${name}-loading`).hidden, true);
    assert.equal(get(`#${name}-error`).hidden, false);
    assert.equal(creations, 0);
    await get(`#${name}-retry`).emit('click');
    assert.equal(downloads, 2);
    assert.equal(creations, 1);
    assert.equal(get(`#${name}-loading`).hidden, true);
    assert.equal(get(`#${name}-error`).hidden, true);
    ui.dispose();
    assert.equal(disposals, 1);
  });

  test(`${name} does not create a scene when page leaves during module download`, async t => {
    const elements = new Map();
    const get = selector => {
      if (!elements.has(selector)) elements.set(selector, new Element());
      return elements.get(selector);
    };
    let resolve, creations = 0;
    const download = new Promise(done => { resolve = done; });
    const window = new Element();
    const ui = createUI({
      document: { querySelector: get, createElement: () => new Element() },
      window, pois: [], loadScene: () => download,
    });
    t.after(() => ui.dispose());
    const opening = ui.start();
    window.emit('pagehide', { persisted: false });
    resolve({ createScene() { creations++; } });
    assert.equal(await opening, false);
    assert.equal(creations, 0);
  });
}
