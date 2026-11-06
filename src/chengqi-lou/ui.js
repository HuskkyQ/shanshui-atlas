export function createChengqiUI({ document: doc, window: win, createScene, content }) {
  const get = (selector) => doc.querySelector(selector);
  const app = get('#chengqi-app');
  const canvas = get('#chengqi-canvas');
  const nav = get('#chengqi-hotspots');
  const enterImmersive = get('#chengqi-immersive');
  const exitImmersive = get('#chengqi-exit-immersive');
  const errorPanel = get('#chengqi-error');
  const loading = get('#chengqi-loading');
  const listeners = [];
  let scene = null;
  let selectedId = null;
  let immersive = false;
  let revision = 0;
  let disposed = false;

  const listen = (element, event, callback) => {
    element.addEventListener(event, callback);
    listeners.push(() => element.removeEventListener(event, callback));
  };
  const buttons = content.hotspots.map((item, index) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'chengqi-hotspot-item';
    button.dataset.hotspot = item.id;
    const number = doc.createElement('span');
    number.className = 'chengqi-index';
    number.textContent = String(index + 1).padStart(2, '0');
    const name = doc.createElement('span');
    name.textContent = item.name;
    button.append(number, name);
    listen(button, 'click', () => scene?.selectHotspot(item.id));
    return button;
  });

  nav.replaceChildren(...buttons);
  doc.title = `${content.name} · 山水志`;
  function showDetail(id) {
    const item = content.hotspots.find((entry) => entry.id === id);
    selectedId = item?.id || null;
    app.classList.toggle('has-detail', Boolean(item));
    get('#chengqi-detail-name').textContent = item?.name || content.name;
    get('#chengqi-detail-description').textContent = item?.description || content.description;
    const source = get('#chengqi-source');
    source.hidden = !item;
    if (item) {
      const reference = item.source || content.source;
      source.href = reference.url;
      source.textContent = `${reference.name} ↗`;
    } else {
      source.removeAttribute('href');
      source.textContent = '';
    }
    get('#chengqi-detail').inert = immersive && !item;
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.hotspot === selectedId)));
  }

  function setImmersive(value) {
    immersive = value;
    app.classList.toggle('is-immersive', value);
    enterImmersive.hidden = value;
    exitImmersive.hidden = !value;
    enterImmersive.setAttribute('aria-pressed', String(value));
    for (const selector of ['.chengqi-brand', '.chengqi-intro', '.chengqi-explorer-head', '#chengqi-hotspots']) get(selector).inert = value;
    if (value) {
      app.classList.remove('has-detail');
      get('#chengqi-detail').inert = true;
    } else showDetail(selectedId);
    scene?.setImmersive(value);
    (value ? exitImmersive : enterImmersive).focus();
  }

  function stopScene() {
    revision += 1;
    scene?.dispose();
    scene = null;
  }

  async function start() {
    if (disposed) return false;
    stopScene();
    const token = revision;
    errorPanel.hidden = true;
    loading.hidden = false;
    try {
      scene = createScene({
        container: canvas,
        onHotspot: (id) => {
          if (!disposed && token === revision) showDetail(id);
        },
      });
      scene.mount();
      scene.setImmersive(immersive);
      if (selectedId) scene.selectHotspot(selectedId, { animate: false });
      await scene.reveal();
      if (disposed || token !== revision) return false;
      loading.hidden = true;
      return true;
    } catch (error) {
      if (disposed || token !== revision) return false;
      stopScene();
      loading.hidden = true;
      errorPanel.hidden = false;
      console.error('Failed to open Chengqi Lou scene', error);
      return false;
    }
  }

  listen(get('#chengqi-retry'), 'click', start);
  listen(get('#chengqi-reset'), 'click', () => scene?.resetView());
  listen(get('#chengqi-overhead'), 'click', () => scene?.setOverheadView());
  listen(enterImmersive, 'click', () => setImmersive(true));
  listen(exitImmersive, 'click', () => setImmersive(false));
  listen(doc, 'keydown', (event) => {
    if (event.key === 'Escape' && immersive) {
      event.preventDefault();
      setImmersive(false);
    }
  });
  listen(win, 'pagehide', (event) => {
    if (event.persisted) stopScene();
    else dispose();
  });
  listen(win, 'pageshow', (event) => { if (event.persisted) return start(); });

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopScene();
    listeners.forEach((remove) => remove());
  }

  showDetail(null);
  return { start, dispose };
}
