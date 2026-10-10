export function createSceneSession({ world, scenes }) {
  let revision = 0;
  let active = null;
  let snapshot;
  let hasSnapshot = false;
  let disposed = false;
  let status = 'world';
  let sceneId = null;
  let entryTransition = null;
  let returning = null;

  function restoreWorld() {
    if (!hasSnapshot) return;
    const saved = snapshot;
    snapshot = undefined;
    hasSnapshot = false;
    try {
      world.restoreState(saved);
    } finally {
      world.setPaused(false);
    }
  }

  function leave() {
    revision += 1;
    entryTransition?.abort();
    entryTransition = null;
    returning = null;
    const instance = active;
    active = null;
    status = 'world';
    sceneId = null;
    try {
      instance?.dispose?.();
    } finally {
      restoreWorld();
    }
  }

  async function enter(id, context = {}) {
    if (disposed) return false;
    const entry = scenes(id);
    if (!entry || entry.enabled !== true || typeof entry.loader !== 'function') return false;

    leave();
    const token = ++revision;
    status = 'loading';
    sceneId = id;

    let instance;
    let mounted = false;
    try {
      snapshot = world.captureState();
      hasSnapshot = true;
      entryTransition = new AbortController();
      const loaded = Promise.resolve(entry.loader(context)).then((result) => {
        if (token !== revision || disposed) { result?.dispose?.(); return; }
        instance = result;
      });
      const flight = world.flyToScenic?.(entry.poiId, { signal: entryTransition.signal });
      const [, arrived] = await Promise.all([loaded, flight]);
      if (token !== revision || disposed) { instance?.dispose?.(); return false; }
      if (arrived === false) { instance?.dispose?.(); leave(); return false; }
      world.setPaused(true, { keepVisible: typeof instance.reveal === 'function' });
      instance.mount?.(context);
      mounted = true;
      active = instance;
      if (instance.reveal) {
        const revealed = await instance.reveal({ signal: entryTransition.signal });
        if (token !== revision || disposed) return false;
        if (revealed === false) { leave(); return false; }
        world.setPaused(true);
      }
      entryTransition = null;
    } catch (error) {
      if (token !== revision || disposed) {
        if (!mounted) instance?.dispose?.();
        return false;
      }
      revision += 1;
      entryTransition?.abort();
      entryTransition = null;
      active = null;
      try {
        instance?.dispose?.();
      } finally {
        restoreWorld();
        status = 'world';
        sceneId = null;
      }
      throw error;
    }

    active = instance;
    status = 'scenic';
    return true;
  }

  function exit({ animate = false } = {}) {
    if (disposed) return;
    if (animate && status === 'returning') return returning;
    if (!animate || status !== 'scenic' || typeof active?.conceal !== 'function') {
      leave();
      return;
    }
    const token = ++revision;
    const instance = active;
    status = 'returning';
    entryTransition = new AbortController();
    returning = (async () => {
      try {
        // Render the restored World once, then keep it frozen beneath the fading scenic canvas.
        world.restoreState(snapshot);
        world.setPaused(false);
        world.setPaused(true, { keepVisible: true });
        const hidden = await instance.conceal({ signal: entryTransition.signal });
        if (token !== revision || disposed) return false;
        leave();
        return hidden !== false;
      } catch (error) {
        if (token !== revision || disposed) return false;
        leave();
        throw error;
      }
    })();
    return returning;
  }

  function dispose() {
    if (disposed) return;
    try {
      leave();
    } finally {
      disposed = true;
      status = 'disposed';
      sceneId = null;
    }
  }

  return {
    enter,
    exit,
    dispose,
    get activeScene() { return active; },
    get state() { return { status, sceneId }; },
  };
}
