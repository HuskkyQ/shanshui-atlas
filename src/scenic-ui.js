import { getScenicScene } from './scenic-scenes.js';
import { createPOIPhoto } from './poi-photo.js';

export function createScenicUI({ session, container, entryButton }) {
  const app = document.querySelector('#app');
  const panel = document.querySelector('#scenic-ui');
  const back = document.querySelector('#scenic-back');
  const reset = document.querySelector('#scenic-reset');
  const retry = document.querySelector('#scenic-retry');
  const loading = document.querySelector('#scenic-loading');
  const status = document.querySelector('#scenic-status');
  const card = document.querySelector('#scenic-content');
  const navigation = document.querySelector('#scenic-hotspots');
  const source = document.querySelector('#scenic-source');
  const showPhoto = createPOIPhoto(document.querySelector('#scenic-photo'));
  const worldPanels = [...document.querySelectorAll('.site-header, main, .site-footer, .compass')];
  let savedInert = [], revision = 0, isOpen = false, sceneId = null, returning = false;
  let content = null, hotspotButtons = [];

  function setContent(definition) {
    content = definition.content;
    document.querySelector('#scenic-title').textContent = content.name;
    document.querySelector('#scenic-note').textContent = content.modelNote;
    navigation.setAttribute('aria-label', `${content.name}探索点`);
    hotspotButtons = content.hotspots.map((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.name;
      button.dataset.scenicHotspot = item.id;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => session.activeScene?.selectHotspot(item.id));
      return button;
    });
    navigation.replaceChildren(...hotspotButtons);
    showPhoto(definition.poiId, content.name);
    showHotspot(null);
  }

  function showHotspot(id) {
    const item = content.hotspots.find((hotspot) => hotspot.id === id);
    document.querySelector('#scenic-kicker').textContent = item ? '湖山与人文 · EXPLORE' : content.englishName;
    document.querySelector('#scenic-hotspot-name').textContent = item?.name || content.name;
    document.querySelector('#scenic-description').textContent = item?.description || content.description;
    source.hidden = !item?.source;
    if (item?.source) { source.href = item.source.url; source.textContent = `${item.source.name} ↗`; }
    else { source.removeAttribute('href'); source.textContent = ''; }
    hotspotButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.scenicHotspot === id)));
  }

  async function enter(id) {
    if (!id || session.state.status === 'loading' || returning) return;
    const definition = getScenicScene(id);
    if (!definition?.enabled || !definition.content) return;
    const token = ++revision;
    sceneId = id;
    setContent(definition);
    if (!isOpen) {
      savedInert = worldPanels.map((element) => element.inert);
      worldPanels.forEach((element) => { element.inert = true; });
      isOpen = true;
    }
    app.classList.add('is-scenic', 'is-entering-scenic');
    container.inert = true;
    panel.hidden = false;
    loading.hidden = false;
    card.hidden = true;
    reset.hidden = true;
    retry.hidden = true;
    status.textContent = `正在飞向${content.name}…`;
    back.focus();
    try {
      const entered = await session.enter(id, { container, onHotspot: (hotspotId) => {
        if (token === revision) showHotspot(hotspotId);
      } });
      if (token !== revision) return;
      if (!entered) { exit(); return; }
      app.classList.remove('is-entering-scenic');
      container.inert = false;
      loading.hidden = true;
      card.hidden = false;
      reset.hidden = false;
      showHotspot(null);
    } catch (error) {
      if (token !== revision) return;
      app.classList.remove('is-entering-scenic');
      container.inert = false;
      console.error('Failed to enter scenic scene', error);
      status.textContent = '景点暂时无法打开，可以重试或返回西湖。';
      retry.hidden = false;
    }
  }

  function finishExit() {
    if (!isOpen) return;
    isOpen = false;
    panel.hidden = true;
    app.classList.remove('is-scenic', 'is-entering-scenic', 'is-leaving-scenic');
    container.inert = false;
    card.inert = false;
    back.disabled = false;
    reset.disabled = false;
    worldPanels.forEach((element, index) => { element.inert = savedInert[index]; });
    entryButton.focus();
  }

  function exit() {
    if (returning) return;
    revision += 1;
    if (session.state.status !== 'scenic') {
      session.exit();
      finishExit();
      return;
    }
    returning = true;
    const token = revision;
    app.classList.add('is-leaving-scenic');
    container.inert = true;
    card.inert = true;
    back.disabled = true;
    reset.disabled = true;
    Promise.resolve(session.exit({ animate: true })).catch((error) => {
      console.error('Failed to animate scenic return', error);
    }).finally(() => {
      if (token !== revision) return;
      returning = false;
      finishExit();
    });
  }

  const onEntry = () => enter(entryButton.dataset.sceneId);
  const onRetry = () => enter(sceneId);
  const onReset = () => session.activeScene?.resetView();
  const onKey = (event) => {
    if (isOpen && event.key === 'Escape') { event.preventDefault(); exit(); }
  };
  entryButton.addEventListener('click', onEntry);
  back.addEventListener('click', exit);
  retry.addEventListener('click', onRetry);
  reset.addEventListener('click', onReset);
  document.addEventListener('keydown', onKey);

  return {
    get isOpen() { return isOpen; },
    dispose() {
      revision += 1;
      session.exit();
      returning = false;
      finishExit();
      entryButton.removeEventListener('click', onEntry);
      back.removeEventListener('click', exit);
      retry.removeEventListener('click', onRetry);
      reset.removeEventListener('click', onReset);
      document.removeEventListener('keydown', onKey);
    },
  };
}
