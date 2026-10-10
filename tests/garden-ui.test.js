import test from 'node:test';
import assert from 'node:assert/strict';
import { createGardenUI } from '../src/garden-ui.js';
import content from '../src/content/zhuozheng-garden.json' with { type: 'json' };

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
  addEventListener(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
  }
  removeEventListener(event, fn) { this.listeners.get(event)?.delete(fn); }
  async emit(event, detail = {}) { await Promise.all([...this.listeners.get(event) || []].map((fn) => fn(detail))); }
}

function setup(t, { failOnce = false } = {}) {
  const elements = new Map(), doc = new Element(), win = new Element(), scenes = [];
  doc.createElement = () => new Element();
  doc.querySelector = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  let live = 0;
  const ui = createGardenUI({ document: doc, window: win, content, createScene: (context) => {
    let alive = false;
    const scene = {
      context, selection: null, disposeCalls: 0,
      mount() { alive = true; live += 1; if (failOnce) { failOnce = false; throw new Error('WebGL setup failed'); } },
      reveal: async () => true,
      setImmersive(value) { this.immersive = value; },
      selectHotspot(id) { this.selection = id; context.onHotspot(id); },
      resetView() { this.selection = null; context.onHotspot(null); },
      dispose() { this.disposeCalls += 1; if (alive) { live -= 1; alive = false; } },
    };
    scenes.push(scene);
    return scene;
  } });
  t.after(() => ui.dispose());
  return { ui, doc, win, get: doc.querySelector, scenes, live: () => live, elements };
}

test('garden selection stays synchronized through immersion and Escape restores a visible focus target', async (t) => {
  const { ui, get, doc, scenes } = setup(t);
  assert.equal(await ui.start(), true);
  await get('#garden-hotspots').children[3].emit('click');
  assert.equal(scenes[0].selection, 'xiangzhou');
  assert.equal(get('#garden-detail-name').textContent, '香洲');
  await get('#garden-immersive').emit('click');
  assert.equal(get('#garden-app').classList.contains('has-detail'), false);
  assert.equal(get('#garden-hotspots').inert, true);
  assert.equal(get('#garden-detail').inert, true);
  scenes[0].context.onHotspot('yuanxiang-hall');
  assert.equal(get('#garden-app').classList.contains('has-detail'), true);
  assert.equal(get('#garden-detail').inert, false);
  let prevented = false;
  await doc.emit('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(get('#garden-immersive').hidden, false);
  assert.equal(get('#garden-immersive').focused, true);
  assert.equal(get('#garden-hotspots').children[0].getAttribute('aria-pressed'), 'true');
  assert.equal(get('#garden-detail-name').textContent, '远香堂');
});

test('BFCache suspends resources and restores selection; released scene callbacks are ignored', async (t) => {
  const { ui, win, get, scenes, live } = setup(t);
  await ui.start();
  scenes[0].selectHotspot('xiaofeihong');
  await win.emit('pagehide', { persisted: true });
  assert.equal(live(), 0);
  await win.emit('pageshow', { persisted: true });
  assert.equal(live(), 1);
  assert.equal(scenes[1].selection, 'xiaofeihong');
  scenes[0].context.onHotspot('xiangzhou');
  assert.equal(get('#garden-detail-name').textContent, '小飞虹');
  await get('#garden-reset').emit('click');
  assert.equal(get('#garden-source').hidden, true);
  assert.equal(scenes[1].selection, null);
  await win.emit('pagehide', { persisted: false });
  assert.equal(live(), 0);
  assert.equal(win.listeners.get('pageshow').size, 0);
  await win.emit('pageshow', { persisted: true });
  assert.equal(live(), 0);
});

test('a failed mount releases its renderer before retrying and disposal removes all listeners', async (t) => {
  const { ui, get, scenes, live, doc, win, elements } = setup(t, { failOnce: true });
  const previous = console.error;
  console.error = () => {};
  try { assert.equal(await ui.start(), false); } finally { console.error = previous; }
  assert.equal(scenes[0].disposeCalls, 1);
  assert.equal(live(), 0);
  assert.equal(get('#garden-error').hidden, false);
  await get('#garden-retry').emit('click');
  assert.equal(live(), 1);
  assert.equal(get('#garden-error').hidden, true);
  ui.dispose(); ui.dispose();
  assert.equal(live(), 0);
  for (const element of [doc, win, ...elements.values(), ...get('#garden-hotspots').children]) {
    assert.ok([...element.listeners.values()].every((listeners) => listeners.size === 0));
  }
});
