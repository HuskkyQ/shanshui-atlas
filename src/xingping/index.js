import { xingpingPOIs } from './pois.js';

export function createXingpingUI({ document, window, createScene, loadScene = () => import('./scene.js'), pois = xingpingPOIs }) {
  const get = (selector) => document.querySelector(selector);
  const listeners = [];
  let scene = null; let pending = null; let generation = 0; let disposed = false;
  const list = get('#xingping-poi-list');
  const description = get('#xingping-poi-description');
  const span = (className, text) => { const node = document.createElement('span'); node.className = className; node.textContent = text; return node; };
  const poiButtons = pois.map((poi, index) => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'xingping-view-button'; button.dataset.poiId = poi.id; button.setAttribute('aria-pressed', 'false');
    button.append(span('xingping-view-no', String(index + 3).padStart(2, '0')), span('', poi.name), span('xingping-view-arrow', '↗')); list.append(button); return { button, poi };
  });
  const viewButtons = [
    { button: get('#xingping-overview'), run: () => scene?.overview() },
    { button: get('#xingping-north'), run: () => scene?.northView() },
  ];
  function select(active, text = '选择景点，沿河湾探索两岸山水。') {
    [...viewButtons.map(v => v.button), ...poiButtons.map(v => v.button)].forEach(button => { const selected = button === active; button.classList.toggle('is-active', selected); button.setAttribute('aria-pressed', String(selected)); });
    description.textContent = text;
  }
  function listen(element, type, handler) { element.addEventListener(type, handler); listeners.push(() => element.removeEventListener(type, handler)); }
  function stopScene() { generation += 1; pending?.abort(); pending = null; scene?.dispose(); scene = null; }
  async function start() {
    if (disposed) return false; stopScene(); const current = generation; const controller = new AbortController(); pending = controller;
    get('#xingping-loading').hidden = false; get('#xingping-error').hidden = true;
    try { const factory = createScene || (await loadScene()).createScene; if (disposed || controller.signal.aborted || current !== generation) return false; const next = await factory({ container: get('#xingping-canvas'), signal: controller.signal }); if (disposed || controller.signal.aborted || current !== generation) { next?.dispose?.(); return false; } scene = next; pending = null; get('#xingping-loading').hidden = true; select(get('#xingping-overview')); return true; }
    catch (error) { if (disposed || controller.signal.aborted || current !== generation) return false; pending = null; get('#xingping-loading').hidden = true; get('#xingping-error').hidden = false; console.error('Failed to open Xingping scene', error); return false; }
  }
  function dispose() { if (disposed) return; disposed = true; stopScene(); listeners.splice(0).forEach(remove => remove()); }
  viewButtons.forEach(({ button, run }) => listen(button, 'click', () => { run(); select(button); }));
  poiButtons.forEach(({ button, poi }) => listen(button, 'click', () => { scene?.focusPOI?.(poi.id); select(button, poi.description); }));
  listen(get('#xingping-sights-toggle'), 'click', () => { const open = get('#xingping-view-nav').classList.toggle('is-open'); get('#xingping-sights-toggle').setAttribute('aria-expanded', String(open)); });
  listen(get('#xingping-retry'), 'click', () => start());
  listen(window, 'pagehide', event => { stopScene(); if (!event.persisted) dispose(); });
  listen(window, 'pageshow', event => { if (event.persisted) start(); });
  return { start, dispose };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.title = '漓江 · 兴坪 · 山水志';
  const xingping = createXingpingUI({ document, window }); await xingping.start();
}
