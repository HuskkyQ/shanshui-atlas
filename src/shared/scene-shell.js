/**
 * Small lifecycle helper for mounted Three.js scenes.
 * It owns only browser resources; scene-specific camera/model logic stays local.
 */
export function createSceneShell({
  requestFrame = globalThis.requestAnimationFrame,
  cancelFrame = globalThis.cancelAnimationFrame,
  ResizeObserverCtor = globalThis.ResizeObserver,
} = {}) {
  let disposed = false;
  let frameId = 0;
  let resizeObserver = null;
  const cleanups = new Set();

  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    const cleanup = () => target.removeEventListener(type, handler, options);
    cleanups.add(cleanup);
    return cleanup;
  }

  function request(callback) {
    if (disposed) return 0;
    frameId = requestFrame((time) => {
      if (!disposed) callback(time);
    });
    return frameId;
  }

  function addCleanup(cleanup) {
    if (disposed) {
      cleanup();
      return () => {};
    }
    cleanups.add(cleanup);
    return () => cleanups.delete(cleanup);
  }

  function observeResize(target, callback) {
    if (!ResizeObserverCtor) return null;
    resizeObserver = new ResizeObserverCtor(callback);
    resizeObserver.observe(target);
    return resizeObserver;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (frameId) cancelFrame(frameId);
    resizeObserver?.disconnect();
    resizeObserver = null;
    cleanups.forEach((cleanup) => cleanup());
    cleanups.clear();
  }

  return {
    listen,
    addCleanup,
    request,
    observeResize,
    dispose,
    get disposed() {
      return disposed;
    },
  };
}

/** Update projection and renderer dimensions without changing camera position/target. */
export function resizeSceneViewport({ container, camera, renderer, labels, immersive = false }) {
  if (!container?.clientWidth || !container?.clientHeight) return false;
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera.aspect = width / height;
  camera.fov = width < 650 ? 52 : 40;
  camera.setViewOffset(
    width,
    height,
    0,
    height * (immersive ? 0 : width < 650 ? 0.1 : 0.015),
    width,
    height,
  );
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  labels?.setSize(width, height);
  return true;
}
