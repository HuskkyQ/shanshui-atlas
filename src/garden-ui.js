export function createGardenUI({ document: doc, window: win, createScene, content }) {
  const get = (id) => doc.querySelector(id);
  const app = get('#garden-app');
  const container = get('#garden-canvas');
  const nav = get('#garden-hotspots');
  const enterImmersive = get('#garden-immersive');
  const exitImmersive = get('#garden-exit-immersive');
  const errorPanel = get('#garden-error');
  const loading = get('#garden-loading');
  const listeners = [];
  let scene = null, selectedId = null, immersive = false, revision = 0, disposed = false;
  const listen = (element, event, callback) => {
    element.addEventListener(event, callback);
    listeners.push(() => element.removeEventListener(event, callback));
  };
  const buttons = content.hotspots.map((item, index) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'garden-hotspot-item';
    button.dataset.hotspot = item.id;
    const number = doc.createElement('span');
    number.className = 'garden-index';
    number.textContent = String(index + 1).padStart(2, '0');
    const name = doc.createElement('span');
    name.textContent = item.name;
    button.append(number, name);
    listen(button, 'click', () => scene?.selectHotspot(item.id));
    return button;
  });
  nav.replaceChildren(...buttons);
  doc.title = `${content.name} · 山水志`;
  get('#garden-description').textContent = content.description;
  get('#garden-model-note').textContent = content.modelNote;

  function showDetail(id) {
    const item = content.hotspots.find((entry) => entry.id === id);
    selectedId = item?.id || null;
    app.classList.toggle('has-detail', Boolean(item));
    get('#garden-detail-name').textContent = item?.name || '中部园 · 池广林茂';
    get('#garden-detail-description').textContent = item?.description || content.description;
    const source = get('#garden-source');
    source.hidden = !item?.source;
    if (item?.source) {
      source.href = item.source.url;
      source.textContent = `${item.source.name} ↗`;
    } else {
      source.removeAttribute('href');
      source.textContent = '';
    }
    get('#garden-photo-empty').hidden = !item;
    get('#garden-detail').inert = immersive && !item;
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.hotspot === selectedId)));
  }

  function setImmersive(value) {
    immersive = value;
    app.classList.toggle('is-immersive', value);
    enterImmersive.hidden = value;
    exitImmersive.hidden = !value;
    enterImmersive.setAttribute('aria-pressed', String(value));
    for (const selector of ['.garden-brand', '.garden-intro', '.garden-explorer-head', '#garden-hotspots']) {
      get(selector).inert = value;
    }
    if (value) {
      app.classList.remove('has-detail');
      get('#garden-detail').inert = true;
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
      scene = createScene({ container, onHotspot: (id) => {
        if (!disposed && token === revision) showDetail(id);
      } });
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
      console.error('Failed to open garden scene', error);
      return false;
    }
  }

  listen(get('#garden-retry'), 'click', start);
  listen(get('#garden-reset'), 'click', () => scene?.resetView());
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
