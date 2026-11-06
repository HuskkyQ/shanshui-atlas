function sceneUrl(window, sceneId) {
  if (!window?.location?.href) return null;
  const url = new URL(window.location.href);
  if (sceneId) url.searchParams.set('scene', sceneId);
  else url.searchParams.delete('scene');
  return `${url.pathname}${url.search}${url.hash}`;
}

export function createScenicHistory({ window, onEnter, onExit }) {
  const history = window?.history;
  const enabled = Boolean(history?.pushState && window?.addEventListener && window?.location?.href);
  let applying = false;
  let current = null;
  let ownedEntry = false;

  function readScene() {
    const stateId = history?.state?.scenicScene;
    if (typeof stateId === 'string' && stateId) return stateId;
    return window?.location?.href ? new URL(window.location.href).searchParams.get('scene') : null;
  }

  function onPopState() {
    const id = readScene();
    applying = true;
    Promise.resolve(id ? onEnter?.(id, { fromHistory: true }) : onExit?.({ fromHistory: true }))
      .catch(() => {})
      .finally(() => {
        applying = false;
        current = id || null;
        ownedEntry = Boolean(id && history?.state?.scenicScene);
      });
  }

  if (enabled) window.addEventListener('popstate', onPopState);

  return {
    get enabled() {
      return enabled;
    },
    get current() {
      return current || readScene();
    },
    enter(sceneId) {
      if (!enabled || applying || !sceneId) return;
      if (this.current === sceneId) return;
      current = sceneId;
      ownedEntry = true;
      history.pushState(
        { ...(history.state || {}), scenicScene: sceneId },
        '',
        sceneUrl(window, sceneId),
      );
    },
    shouldGoBack() {
      return enabled && !applying && ownedEntry && Boolean(this.current);
    },
    back() {
      if (this.shouldGoBack()) history.back();
    },
    clear() {
      if (!enabled || applying || !this.current) return;
      current = null;
      ownedEntry = false;
      const state = { ...(history.state || {}) };
      delete state.scenicScene;
      history.replaceState(state, '', sceneUrl(window, null));
    },
    syncInitial() {
      if (!enabled) return;
      const id = readScene();
      current = id || null;
      ownedEntry = Boolean(history.state?.scenicScene);
      if (id) Promise.resolve(onEnter?.(id, { fromHistory: true })).catch(() => {});
    },
    dispose() {
      if (enabled) window.removeEventListener('popstate', onPopState);
    },
  };
}
