import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createChangbaiUI } from '../src/changbai/index.js';

test('Changbai scene entry points exist', () => {
  assert.equal(existsSync(new URL('../src/changbai/index.js', import.meta.url)), true);
  assert.equal(existsSync(new URL('../src/changbai/scene.js', import.meta.url)), true);
  assert.equal(existsSync(new URL('../src/changbai/view.html', import.meta.url)), true);
  assert.equal(existsSync(new URL('../src/changbai/style.css', import.meta.url)), true);
});

class Element {
  constructor() {
    this.hidden = false;
    this.listeners = new Map();
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.textContent = '';
    this.classList = {
      toggle: (name, force) => {
        const names = new Set(this.className.split(/\s+/).filter(Boolean));
        const enabled = force === undefined ? !names.has(name) : force;
        if (enabled) names.add(name); else names.delete(name);
        this.className = [...names].join(' ');
        return enabled;
      },
      contains: (name) => this.className.split(/\s+/).includes(name),
    };
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  async emit(type, detail = {}) {
    await Promise.all([...this.listeners.get(type) || []].map((handler) => handler(detail)));
  }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(createScene) {
  const elements = new Map();
  const document = new Element();
  const window = new Element();
  document.createElement = () => new Element();
  document.querySelector = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  const pois = [
    { id: 'north-outlet', name: '天池北侧出水口', description: '观察来源地形中的出水口位置。' },
    { id: 'changbai-falls', name: '长白瀑布', description: '观察来源地形中的瀑布位置；当前未精细塑形。' },
  ];
  const ui = createChangbaiUI({ document, window, createScene, pois });
  return { ui, document, window, get: document.querySelector, elements };
}

test('view controls select the four requested Changbai camera positions', async (t) => {
  const calls = [];
  const scene = {
    overview: () => calls.push('overview'),
    northView: () => calls.push('north'),
    nearView: (direction) => calls.push(direction),
    dispose() {},
  };
  const { ui, get } = setup(async () => scene);
  t.after(() => ui.dispose());
  assert.equal(await ui.start(), true);
  await get('#changbai-overview').emit('click');
  await get('#changbai-north').emit('click');
  await get('#changbai-east').emit('click');
  await get('#changbai-west').emit('click');
  assert.deepEqual(calls, ['overview', 'north', 'east', 'west']);
  assert.equal(get('#changbai-loading').hidden, true);
  assert.equal(get('#changbai-error').hidden, true);
});

test('right-side sight controls focus sourced terrain positions and keep one active item', async (t) => {
  const calls = [];
  const scene = {
    overview: () => calls.push('overview'),
    northView: () => calls.push('north'),
    nearView: (direction) => calls.push(direction),
    focusPOI: (id) => calls.push(`poi:${id}`),
    dispose() {},
  };
  const { ui, get } = setup(async () => scene);
  t.after(() => ui.dispose());
  assert.equal(await ui.start(), true);
  const [outlet, waterfall] = get('#changbai-poi-list').children;
  await outlet.emit('click');
  assert.deepEqual(calls, ['poi:north-outlet']);
  assert.equal(outlet.getAttribute('aria-pressed'), 'true');
  assert.equal(get('#changbai-overview').getAttribute('aria-pressed'), 'false');
  assert.equal(get('#changbai-poi-description').textContent, '观察来源地形中的出水口位置。');
  await get('#changbai-west').emit('click');
  assert.deepEqual(calls, ['poi:north-outlet', 'west']);
  assert.equal(outlet.getAttribute('aria-pressed'), 'false');
  assert.equal(get('#changbai-west').getAttribute('aria-pressed'), 'true');
  await waterfall.emit('click');
  assert.equal(waterfall.classList.contains('is-active'), true);
});

test('mobile sight list exposes an accessible expandable panel', async (t) => {
  const { ui, get } = setup(async () => ({ dispose() {} }));
  t.after(() => ui.dispose());
  const toggle = get('#changbai-sights-toggle');
  assert.equal(toggle.getAttribute('aria-expanded'), null);
  await toggle.emit('click');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(get('#changbai-view-nav').classList.contains('is-open'), true);
  await toggle.emit('click');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

test('page lifecycle aborts pending loads and disposes late scenes', async () => {
  const pending = deferred();
  const lateScene = { disposeCalls: 0, dispose() { this.disposeCalls += 1; } };
  let receivedSignal;
  const { ui, window } = setup(({ signal }) => {
    receivedSignal = signal;
    return pending.promise;
  });
  const starting = ui.start();
  await window.emit('pagehide', { persisted: false });
  assert.equal(receivedSignal.aborted, true);
  pending.resolve(lateScene);
  assert.equal(await starting, false);
  assert.equal(lateScene.disposeCalls, 1);
});

test('failed loads reveal retry state and retry creates a fresh scene', async (t) => {
  let attempts = 0;
  const scene = { dispose() {} };
  const { ui, get } = setup(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('WebGL failed');
    return scene;
  });
  t.after(() => ui.dispose());
  const previous = console.error;
  console.error = () => {};
  try { assert.equal(await ui.start(), false); } finally { console.error = previous; }
  assert.equal(get('#changbai-loading').hidden, true);
  assert.equal(get('#changbai-error').hidden, false);
  await get('#changbai-retry').emit('click');
  assert.equal(attempts, 2);
  assert.equal(get('#changbai-error').hidden, true);
});

test('page and scene keep the requested non-walking, source-free interaction boundary', () => {
  const html = readFileSync(new URL('../src/changbai/view.html', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('../src/changbai/scene.js', import.meta.url), 'utf8');
  const title = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]+>/g, '');
  assert.equal(title, '长白山·天池');
  assert.match(html, /JILIN, CHINA/);
  assert.match(html, /42°N · 128°E/);
  assert.match(html, /总览/);
  assert.match(html, /北向俯看/);
  assert.match(html, /东侧湖岸/);
  assert.match(html, /西侧湖岸/);
  assert.match(html, /长白山景点与观察视角/);
  assert.match(html, /id="changbai-poi-list"/);
  assert.match(html, /aria-controls="changbai-view-panel"/);
  assert.doesNotMatch(html, /来源|source|第一人称|瀑布/i);
  assert.match(scene, /setPixelRatio\(Math\.min\(window\.devicePixelRatio[^,]*,\s*1\.5\)\)/);
  assert.match(scene, /autoRotate\s*=\s*false/);
  assert.match(scene, /createCompass\(container,\s*\{\s*reference:\s*'geographic'/);
});

test('scene cancellation, LOD shadows, and first-frame diagnostics follow the runtime contract', () => {
  const scene = readFileSync(new URL('../src/changbai/scene.js', import.meta.url), 'utf8');
  assert.match(scene, /createChangbaiModel\(\{\s*signal\s*\}\)/);
  assert.match(scene, /if \(model\.update\?\.\(camera, time \/ 1000\)\) renderer\.shadowMap\.needsUpdate = true;/);
  assert.match(scene, /function onAbort\(\) \{ dispose\(\); \}/);
  assert.match(scene, /cleanupComplete/);
  const start = scene.indexOf('sceneStartedAt = performance.now()');
  const load = scene.indexOf('await createChangbaiModel');
  const render = scene.indexOf('renderer.render(world, camera)');
  const firstFrame = scene.indexOf('container.dataset.firstFrameMs =');
  assert.ok(start >= 0 && start < load, 'first-frame timing must include model loading');
  assert.ok(render >= 0 && render < firstFrame, 'diagnostics must be written after the first real render');
  assert.match(scene, /container\.dataset\.terrainTriangles\s*=\s*String\(renderer\.info\.render\.triangles\)/);
});
