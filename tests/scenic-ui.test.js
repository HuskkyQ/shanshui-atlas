import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenicUI } from '../src/scenic-ui.js';

// Only the DOM operations used by the UI are needed; rendering is checked in-browser.
class Element {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.inert = false;
    this.textContent = '';
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
    };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name); }
  addEventListener(name, listener) {
    const listeners = this.listeners.get(name) || new Set();
    listeners.add(listener);
    this.listeners.set(name, listeners);
  }
  removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
  async emit(name, event = {}) {
    await Promise.all([...this.listeners.get(name) || []].map((listener) => listener(event)));
  }
  focus() { this.focused = true; }
}

function setup(t) {
  const originalDocument = globalThis.document;
  const elements = new Map();
  const worldPanels = [new Element(), new Element()];
  worldPanels[1].inert = true;
  const document = new Element();
  document.querySelector = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  document.querySelectorAll = () => worldPanels;
  document.createElement = (tag) => new Element(tag);
  globalThis.document = document;
  const callbacks = [];
  const session = {
    state: { status: 'world' },
    activeScene: null,
    async enter(id, context) {
      callbacks.push(context.onHotspot);
      this.state = { status: 'scenic', sceneId: id };
      this.activeScene = { selectHotspot: context.onHotspot, resetView: () => context.onHotspot(null) };
      return true;
    },
    exit() { this.state = { status: 'world' }; this.activeScene = null; },
  };
  const container = new Element();
  const entryButton = new Element('button');
  const ui = createScenicUI({ session, container, entryButton });
  t.after(() => { ui.dispose(); globalThis.document = originalDocument; });
  return { get: document.querySelector, document, ui, callbacks, session, worldPanels, entryButton };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('entering different scenes replaces title, photo, navigation, and hotspot content', async (t) => {
  const { get, callbacks, worldPanels, entryButton } = setup(t);
  entryButton.dataset.sceneId = 'santanyinyue';
  await entryButton.emit('click');
  assert.equal(get('#scenic-title').textContent, '三潭印月');
  assert.equal(get('#scenic-status').textContent, '正在飞向三潭印月…');
  assert.equal(get('#scenic-hotspots').getAttribute('aria-label'), '三潭印月探索点');
  assert.equal(get('#scenic-photo').children[0].children[0].children[0].src, '/images/pois/santan.jpg');
  assert.equal(get('#scenic-hotspots').children.length, 4);
  await get('#scenic-hotspots').children[1].emit('click');
  assert.equal(get('#scenic-hotspot-name').textContent, '五孔石塔');
  assert.equal(get('#scenic-hotspots').children[1].getAttribute('aria-pressed'), 'true');
  assert.equal(get('#scenic-source').hidden, false);

  await get('#scenic-back').emit('click');
  await settle();
  assert.deepEqual(worldPanels.map((element) => element.inert), [false, true]);
  entryButton.dataset.sceneId = 'leifeng-pagoda';
  await entryButton.emit('click');
  assert.equal(get('#scenic-title').textContent, '雷峰塔');
  assert.equal(get('#scenic-photo').children[0].children[0].children[0].src, '/images/pois/leifeng.jpg');
  assert.equal(get('#scenic-hotspots').children.length, 4);
  assert.equal(get('#scenic-hotspots').children[0].dataset.scenicHotspot, 'tower');
  assert.equal(get('#scenic-source').hidden, true);
  assert.equal(get('#scenic-source').getAttribute('href'), undefined);

  // A late callback from the released scene must not modify the current panel.
  callbacks[0]('tower-detail');
  assert.equal(get('#scenic-hotspot-name').textContent, '雷峰塔');
  await get('#scenic-hotspots').children[2].emit('click');
  assert.equal(get('#scenic-hotspot-name').textContent, '铜檐与斗拱');
  await get('#scenic-reset').emit('click');
  assert.equal(get('#scenic-hotspot-name').textContent, '雷峰塔');

  await get('#scenic-back').emit('click');
  await settle();
  entryButton.dataset.sceneId = 'lingyin-temple';
  await entryButton.emit('click');
  assert.equal(get('#scenic-title').textContent, '灵隐寺');
  assert.equal(get('#scenic-photo').children[0].children[0].children[0].src, '/images/pois/lingyin.jpg');
  assert.equal(get('#scenic-hotspots').children.length, 7);
  assert.equal(get('#scenic-hotspots').children[0].dataset.scenicHotspot, 'tianwang');
  await get('#scenic-hotspots').children[1].emit('click');
  assert.equal(get('#scenic-hotspot-name').textContent, '大雄宝殿');
  callbacks[1]('tower');
  assert.equal(get('#scenic-hotspot-name').textContent, '大雄宝殿');
  await get('#scenic-reset').emit('click');
  assert.equal(get('#scenic-hotspot-name').textContent, '灵隐寺');
});

test('unknown scene cannot open the panel and Escape restores the World', async (t) => {
  const { get, document, ui, worldPanels, entryButton } = setup(t);
  entryButton.dataset.sceneId = 'unknown';
  await entryButton.emit('click');
  assert.equal(ui.isOpen, false);
  assert.equal(get('#app').classList.contains('is-scenic'), false);
  entryButton.dataset.sceneId = 'santanyinyue';
  await entryButton.emit('click');
  let prevented = false;
  await document.emit('keydown', { key: 'Escape', preventDefault() { prevented = true; } });
  await settle();
  assert.equal(prevented, true);
  assert.equal(ui.isOpen, false);
  assert.equal(get('#scenic-ui').hidden, true);
  assert.deepEqual(worldPanels.map((element) => element.inert), [false, true]);
  assert.equal(entryButton.focused, true);
});
