import * as THREE from 'three';


function isTypedArray(value) {
  return ArrayBuffer.isView(value) && !(value instanceof DataView);
}

function geometryFromPayload(payload) {
  const { position, normal, color, uv, index } = payload || {};
  if (!isTypedArray(position) || position.length === 0 || position.length % 3
    || !isTypedArray(normal) || normal.length !== position.length
    || !isTypedArray(color) || color.length !== position.length
    || !isTypedArray(uv) || uv.length !== position.length / 3 * 2
    || !isTypedArray(index) || index.length === 0 || index.length % 3) {
    throw new Error('Invalid Changbai detail geometry buffers');
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}

export function createTerrainRefinement({
  source,
  onGeometry,
  onFailure,
  workerFactory = () => new Worker(new URL('./detail-worker.js', import.meta.url), { type: 'module' }),
}) {
  let worker = null;
  let active = true;

  const terminate = () => {
    if (!worker) return;
    const current = worker;
    worker = null;
    if (typeof current.terminate === 'function') current.terminate();
  };
  const fail = (error) => {
    if (!active) return;
    active = false;
    terminate();
    onFailure(error);
  };

  try {
    worker = workerFactory();
    if (!worker || typeof worker.postMessage !== 'function' || typeof worker.terminate !== 'function') {
      throw new Error('Changbai detail worker is unavailable');
    }
    worker.onmessage = (event) => {
      if (!active) return;
      let geometry;
      try {
        geometry = geometryFromPayload(event.data);
      } catch (error) {
        fail(error);
        return;
      }
      active = false;
      terminate();
      onGeometry(geometry);
    };
    worker.onerror = fail;
    worker.postMessage(source);
  } catch (error) {
    fail(error);
  }

  return {
    dispose() {
      if (!active) return;
      active = false;
      terminate();
    },
  };
}
