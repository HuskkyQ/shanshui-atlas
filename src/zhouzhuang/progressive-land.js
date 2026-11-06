import { createLand, applyLandGeometry } from './land.js';

export function createProgressiveLand(materials, waterQuery, bounds, { workerFactory } = {}) {
  const group = createLand(materials, waterQuery, bounds, { coarse: true });
  let disposed = false;
  let worker;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  const finish = (value) => { resolveReady?.(value); resolveReady = null; };
  const fallback = () => {
    const full = createLand(materials, waterQuery, bounds);
    const oldSurface = group.getObjectByName('land-blocks');
    const oldBanks = group.getObjectByName('stone-embankments');
    oldSurface.geometry.dispose();
    oldBanks.geometry.dispose();
    group.remove(oldSurface, oldBanks);
    group.add(full.getObjectByName('land-blocks'), full.getObjectByName('stone-embankments'));
  };
  const recover = (error) => {
    if (disposed || !resolveReady) return;
    console.warn('Progressive Zhouzhuang land unavailable; using full terrain', error);
    worker?.terminate();
    worker = null;
    fallback();
    finish(true);
  };
  try {
    worker = workerFactory
      ? workerFactory()
      : new Worker(new URL('./land-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      if (disposed || !resolveReady) return;
      if (event.data?.type === 'land-error') { recover(event.data.message); return; }
      if (event.data?.type !== 'land-geometry') return;
      const { position, bankPosition } = event.data;
      if (!(position instanceof Float32Array) || !(bankPosition instanceof Float32Array)
        || position.length % 9 || bankPosition.length % 9) {
        recover('Invalid land geometry buffers');
        return;
      }
      applyLandGeometry(group, position, bankPosition);
      worker.terminate();
      worker = null;
      finish(true);
    };
    worker.onerror = recover;
    worker.postMessage({ type: 'build-land', bounds });
  } catch (error) {
    recover(error);
  }
  return {
    group,
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      worker?.terminate();
      worker = null;
      finish(false);
    },
  };
}
