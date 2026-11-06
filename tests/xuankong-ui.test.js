import test from 'node:test';
import assert from 'node:assert/strict';
import { createXuankongUI } from '../src/xuankong-si/ui.js';
import content from '../src/content/xuankong-si.json' with { type: 'json' };

class Element {
  constructor() {
    this.children = []; this.dataset = {}; this.attributes = new Map(); this.listeners = new Map();
    this.hidden = false; this.inert = false;
    const classes = new Set();
    this.classList = {
      add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name),
      toggle: (name, value) => value ? classes.add(name) : classes.delete(name),
    };
  }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  getAttribute(name) { return this.attributes.get(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  focus() { this.focused = true; }
  addEventListener(event, fn) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event).add(fn); }
  removeEventListener(event, fn) { this.listeners.get(event)?.delete(fn); }
  async emit(event, detail = {}) { await Promise.all([...this.listeners.get(event) || []].map((fn) => fn(detail))); }
}

function setup(t, { failOnce = false } = {}) {
  const elements = new Map(); const doc = new Element(); const win = new Element(); const scenes = [];
  doc.createElement = () => new Element();
  doc.querySelector = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  let live = 0;
  const ui = createXuankongUI({ document: doc, window: win, content, createScene: (context) => {
    let alive = false;
    const scene = {
      context, selection: null, disposeCalls: 0,
      mount() { alive = true; live += 1; if (failOnce) { failOnce = false; throw new Error('WebGL setup failed'); } },
      reveal: async () => true,
      setImmersive(value) { this.immersive = value; },
      selectHotspot(id) { this.selection = id; context.onHotspot(id); },
      resetView() { this.selection = null; context.onHotspot(null); },
      setSideView() { this.side = true; this.selection = null; context.onHotspot(null); },
      dispose() { this.disposeCalls += 1; if (alive) { live -= 1; alive = false; } },
    };
    scenes.push(scene);
    return scene;
  } });
  t.after(() => ui.dispose());
  return { ui, doc, win, get: doc.querySelector, scenes, live: () => live, elements };
}

test('selection, source references, side view, and immersive Escape keep the temple UI synchronized', async (t) => {
  const { ui, get, doc, scenes } = setup(t);
  assert.equal(await ui.start(), true);
  await get('#xuankong-hotspots').children[2].emit('click');
  assert.equal(scenes[0].selection, 'south-tower');
  assert.equal(get('#xuankong-detail-name').textContent, '南楼三层');
  assert.equal(get('#xuankong-source').href, content.source.url);
  await get('#xuankong-hotspots').children[5].emit('click');
  assert.equal(get('#xuankong-detail-name').textContent, '梁柱入岩');
  assert.equal(get('#xuankong-source').href, content.hotspots[5].source.url);
  await get('#xuankong-side').emit('click');
  assert.equal(scenes[0].side, true);
  assert.equal(get('#xuankong-source').hidden, true);
  await get('#xuankong-immersive').emit('click');
  assert.equal(get('#xuankong-hotspots').inert, true);
  scenes[0].context.onHotspot('north-tower');
  assert.equal(get('#xuankong-detail-name').textContent, '北楼三教');
  let prevented = false;
  await doc.emit('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(get('#xuankong-immersive').focused, true);
  assert.equal(get('#xuankong-hotspots').children[4].getAttribute('aria-pressed'), 'true');
});

test('BFCache and failed mount release temple scenes without stale callbacks', async (t) => {
  const { ui, win, get, scenes, live, doc, elements } = setup(t, { failOnce: true });
  const previous = console.error;
  console.error = () => {};
  try { assert.equal(await ui.start(), false); } finally { console.error = previous; }
  assert.equal(scenes[0].disposeCalls, 1);
  assert.equal(get('#xuankong-error').hidden, false);
  await get('#xuankong-retry').emit('click');
  scenes[1].selectHotspot('courtyard');
  await win.emit('pagehide', { persisted: true });
  assert.equal(live(), 0);
  await win.emit('pageshow', { persisted: true });
  assert.equal(live(), 1);
  assert.equal(scenes[2].selection, 'courtyard');
  scenes[1].context.onHotspot('structure');
  assert.equal(get('#xuankong-detail-name').textContent, '入口院落');
  await win.emit('pagehide', { persisted: false });
  for (const element of [doc, win, ...elements.values(), ...get('#xuankong-hotspots').children]) {
    assert.ok([...element.listeners.values()].every((handlers) => handlers.size === 0));
  }
});
