import * as THREE from 'three';

const CHUNK_SIZE = 96;

function chunkKey(house) {
  return `${Math.floor(house.x / CHUNK_SIZE)},${Math.floor(house.z / CHUNK_SIZE)}`;
}

function distanceToChunk(camera, chunk) {
  const x = Math.max(chunk.minX, Math.min(chunk.maxX, camera.position.x));
  const z = Math.max(chunk.minZ, Math.min(chunk.maxZ, camera.position.z));
  const y = Math.max(chunk.minY, Math.min(chunk.maxY, camera.position.y));
  return Math.hypot(camera.position.x - x, camera.position.y - y, camera.position.z - z);
}

/**
 * Keeps the fixed housing footprints and collision data outside of the LOD.
 * Only the visible render batches are created and swapped as the camera moves.
 */
export function createHousingLOD({ houses = [], createBatch }) {
  if (typeof createBatch !== 'function') throw new TypeError('createBatch is required');
  const group = new THREE.Group();
  group.name = 'housing-lod';
  const chunks = new Map();
  let disposed = false;
  let spatial = null;
  const stats = { visibleHouseCount: 0, detailedHouseCount: 0, builtChunks: 0, spatialRefreshes: 0 };

  for (const house of houses) {
    const key = chunkKey(house);
    if (!chunks.has(key)) chunks.set(key, { key, houses: [], coarse: null, shell: null, detail: null, active: null });
    chunks.get(key).houses.push(house);
  }
  for (const chunk of chunks.values()) {
    chunk.houses.sort((a, b) => a.z - b.z || a.x - b.x);
    chunk.minX = Math.min(...chunk.houses.map((h) => h.x - h.width / 2));
    chunk.maxX = Math.max(...chunk.houses.map((h) => h.x + h.width / 2));
    chunk.minZ = Math.min(...chunk.houses.map((h) => h.z - h.depth / 2));
    chunk.maxZ = Math.max(...chunk.houses.map((h) => h.z + h.depth / 2));
    chunk.minY = 0;
    chunk.maxY = 8;
  }

  function setVisible(chunk, level) {
    if (chunk.active === level) return false;
    for (const name of ['coarse', 'shell', 'detail']) if (chunk[name]) {
      chunk[name].visible = name === level || (level === 'detail' && name === 'shell');
    }
    chunk.active = level;
    return true;
  }

  function build(chunk, level) {
    if (disposed || chunk[level]) return;
    // Coarse is deliberately geometry-light, but it must retain every house
    // footprint so the distant map never develops artificial empty patches.
    const source = chunk.houses;
    const rendered = createBatch(source, level, chunk.key);
    if (!rendered) return;
    rendered.visible = false;
    rendered.userData = { ...(rendered.userData || {}), lodLevel: level, houseCount: source.length, chunkKey: chunk.key };
    chunk[level] = rendered;
    group.add(rendered);
  }

  function refreshStats() {
    let detailedHouseCount = 0, builtChunks = 0;
    for (const chunk of chunks.values()) {
      if (chunk.coarse || chunk.shell || chunk.detail) builtChunks += 1;
      if (chunk.active === 'detail') detailedHouseCount += chunk.houses.length;
    }
    // This is the complete model footprint, independent of the active LOD
    // and separate from any future camera-frustum draw statistic.
    const visibleHouseCount = houses.length;
    const changed = stats.visibleHouseCount !== visibleHouseCount
      || stats.detailedHouseCount !== detailedHouseCount || stats.builtChunks !== builtChunks;
    stats.visibleHouseCount = visibleHouseCount;
    stats.detailedHouseCount = detailedHouseCount;
    stats.builtChunks = builtChunks;
    return changed;
  }

  function update(camera, { walking = false, immediate = false } = {}) {
    if (disposed || !camera) return false;
    let changed = false;
    const moved = !spatial || spatial.position.distanceToSquared(camera.position) >= 0.25
      || spatial.walking !== walking;
    if (moved || immediate) {
      const ranked = [...chunks.values()]
        .map((chunk) => ({ chunk, distance: distanceToChunk(camera, chunk) }))
        .sort((a, b) => a.distance - b.distance);
      spatial = {
        position: camera.position.clone(),
        ranked,
        rankedChunks: ranked.map(({ chunk }) => chunk),
        distanceByChunk: new Map(ranked.map((entry) => [entry.chunk, entry.distance])),
        walking,
      };
      stats.spatialRefreshes += 1;
      spatial.shellQueue = ranked.filter(({ distance, chunk }) => distance <= 300 && !chunk.shell).map(({ chunk }) => chunk);
      spatial.detailQueue = ranked.filter(({ distance, chunk }) => distance <= 100 && !chunk.detail).map(({ chunk }) => chunk);
      spatial.shellNow = ranked.filter(({ distance }) => distance <= 60).map(({ chunk }) => chunk);
    }
    if (!moved && !immediate && spatial.shellQueue.length === 0 && spatial.detailQueue.length === 0) return false;
    const ranked = spatial.rankedChunks;
    // The coarse overview is cheap and is the only level built for the first frame.
    for (const chunk of ranked) {
      build(chunk, 'coarse');
      if (!chunk.active) changed = setVisible(chunk, 'coarse') || changed;
    }
    const shellQueue = spatial.shellQueue;
    // A newly opened page stops at coarse + one shell batch. Detail work starts
    // on the next camera update, after its shell is already cached.
    const detailQueue = spatial.detailQueue;
    const shellNow = walking ? spatial.shellNow : [];
    for (const chunk of shellNow) {
      const before = chunk.shell;
      build(chunk, 'shell');
      if (!before && chunk.shell) spatial.shellQueue = spatial.shellQueue.filter((candidate) => candidate !== chunk);
      changed = changed || !before && !!chunk.shell;
    }
    if (immediate) {
      for (const chunk of [...shellQueue]) { const before = chunk.shell; build(chunk, 'shell'); if (!before && chunk.shell) spatial.shellQueue = spatial.shellQueue.filter((candidate) => candidate !== chunk); changed = changed || !before && !!chunk.shell; }
      for (const chunk of [...detailQueue]) { const before = chunk.detail; build(chunk, 'detail'); if (!before && chunk.detail) spatial.detailQueue = spatial.detailQueue.filter((candidate) => candidate !== chunk); changed = changed || !before && !!chunk.detail; }
    } else {
      const shell = shellQueue.find((chunk) => !shellNow.includes(chunk));
      const detail = detailQueue.find((chunk) => chunk.shell && chunk !== shell);
      if (shell) { const before = shell.shell; build(shell, 'shell'); if (!before && shell.shell) spatial.shellQueue = spatial.shellQueue.filter((candidate) => candidate !== shell); changed = changed || !before && !!shell.shell; }
      if (detail) { const before = detail.detail; build(detail, 'detail'); if (!before && detail.detail) spatial.detailQueue = spatial.detailQueue.filter((candidate) => candidate !== detail); changed = changed || !before && !!detail.detail; }
    }
    for (const chunk of ranked) {
      const distance = spatial.distanceByChunk.get(chunk) ?? Infinity;
      if (distance <= (chunk.active === 'detail' ? 120 : 100) && chunk.detail) changed = setVisible(chunk, 'detail') || changed;
      else if (distance <= (chunk.active === 'coarse' ? 300 : 330) && chunk.shell) changed = setVisible(chunk, 'shell') || changed;
      else changed = setVisible(chunk, 'coarse') || changed;
    }
    changed = refreshStats() || changed;
    return changed;
  }

  return {
    group,
    update,
    stats,
    get chunkCount() { return chunks.size; },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const chunk of chunks.values()) {
        for (const name of ['coarse', 'shell', 'detail']) if (chunk[name]) chunk[name].visible = false;
        chunk.active = null;
      }
      stats.visibleHouseCount = 0;
      stats.detailedHouseCount = 0;
      stats.builtChunks = 0;
      stats.spatialRefreshes = 0;
    },
  };
}

export { CHUNK_SIZE };
