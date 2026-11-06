import { changbaiPOIs } from './pois.js';

export function createChangbaiUI({ document, window, createScene, loadScene = () => import('./scene.js'), pois = changbaiPOIs }) {
  const get = (selector) => document.querySelector(selector);
  const listeners = [];
  let scene = null;
  let pending = null;
  let generation = 0;
  let disposed = false;

  const poiList = get('#changbai-poi-list');
  const poiDescription = get('#changbai-poi-description');
  const createSpan = (className, text) => {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    return span;
  };
  const poiButtons = pois.map((poi, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'changbai-view-button';
    button.dataset.poiId = poi.id;
    button.setAttribute('aria-pressed', 'false');
    button.append(
      createSpan('changbai-view-no', String(index + 5).padStart(2, '0')),
      createSpan('', poi.name),
      createSpan('changbai-view-arrow', '↗'),
    );
    poiList.append(button);
    return { button, poi };
  });
  const viewButtons = [
    { button: get('#changbai-overview'), run: () => scene?.overview() },
    { button: get('#changbai-north'), run: () => scene?.northView() },
    { button: get('#changbai-east'), run: () => scene?.nearView('east') },
    { button: get('#changbai-west'), run: () => scene?.nearView('west') },
  ];

  function selectButton(active, description = '选择景点，查看其在当前地形中的位置。') {
    [...viewButtons.map(({ button }) => button), ...poiButtons.map(({ button }) => button)]
      .forEach((button) => {
        const selected = button === active;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    poiDescription.textContent = description;
  }

  function listen(element, type, handler) {
    element.addEventListener(type, handler);
    listeners.push(() => element.removeEventListener(type, handler));
  }

  function stopScene() {
    generation += 1;
    pending?.abort();
    pending = null;
    scene?.dispose();
    scene = null;
  }

  async function start() {
    if (disposed) return false;
    stopScene();
    const currentGeneration = generation;
    const controller = new AbortController();
    pending = controller;
    get('#changbai-loading').hidden = false;
    get('#changbai-error').hidden = true;
    try {
      const factory = createScene || (await loadScene()).createScene;
      if (disposed || controller.signal.aborted || currentGeneration !== generation) return false;
      const nextScene = await factory({
        container: get('#changbai-canvas'),
        signal: controller.signal,
      });
      if (disposed || controller.signal.aborted || currentGeneration !== generation) {
        nextScene?.dispose?.();
        return false;
      }
      scene = nextScene;
      pending = null;
      get('#changbai-loading').hidden = true;
      selectButton(get('#changbai-overview'));
      return true;
    } catch (error) {
      if (disposed || controller.signal.aborted || currentGeneration !== generation) return false;
      pending = null;
      get('#changbai-loading').hidden = true;
      get('#changbai-error').hidden = false;
      console.error('Failed to open Changbai Tianchi', error);
      return false;
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopScene();
    listeners.splice(0).forEach((remove) => remove());
  }

  viewButtons.forEach(({ button, run }) => listen(button, 'click', () => {
    run();
    selectButton(button);
  }));
  poiButtons.forEach(({ button, poi }) => listen(button, 'click', () => {
    scene?.focusPOI?.(poi.id);
    selectButton(button, poi.description);
  }));
  listen(get('#changbai-sights-toggle'), 'click', () => {
    const open = get('#changbai-view-nav').classList.toggle('is-open');
    get('#changbai-sights-toggle').setAttribute('aria-expanded', String(open));
  });
  listen(get('#changbai-retry'), 'click', () => start());
  listen(window, 'pagehide', (event) => {
    stopScene();
    if (!event.persisted) dispose();
  });
  listen(window, 'pageshow', (event) => { if (event.persisted) start(); });

  return { start, dispose };
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  document.title = '长白山 · 天池 · 山水志';
  const changbai = createChangbaiUI({ document, window });
  await changbai.start();
}
