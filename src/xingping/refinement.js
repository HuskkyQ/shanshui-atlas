import * as THREE from 'three';

function typed(value) { return ArrayBuffer.isView(value) && !(value instanceof DataView); }
function fromPayload(payload) {
  const { position, normal, color, index } = payload || {};
  if (!typed(position) || !position.length || position.length % 3 || !typed(normal) || normal.length !== position.length
    || !typed(color) || color.length !== position.length || !typed(index) || !index.length || index.length % 3) throw new Error('Invalid Xingping detail geometry buffers');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}

export function createTerrainRefinement({ source, onGeometry, onFailure, workerFactory = () => new Worker(new URL('./detail-worker.js', import.meta.url), { type: 'module' }) }) {
  let active = true, worker = null;
  const terminate = () => { const current = worker; worker = null; current?.terminate?.(); };
  const fail = error => { if (!active) return; active = false; terminate(); onFailure?.(error); };
  try {
    worker = workerFactory();
    if (!worker?.postMessage || !worker?.terminate) throw new Error('Xingping detail worker is unavailable');
    worker.onmessage = event => { if (!active) return; try { const geometry = fromPayload(event.data); active = false; terminate(); onGeometry?.(geometry); } catch (error) { fail(error); } };
    worker.onerror = fail;
    worker.postMessage(source);
  } catch (error) { fail(error); }
  return { dispose() { if (!active) return; active = false; terminate(); } };
}
