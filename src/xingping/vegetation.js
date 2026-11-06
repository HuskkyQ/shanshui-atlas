import * as THREE from 'three';

const DEFAULT_SEED = 'xingping-vegetation-v1';
const TREE_HEIGHT_WORLD = [0.06, 0.12];
const WATER_CLEARANCE = 0.08;

function hashSeed(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function random(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0; i < ring.length; i += 1) {
    const j = (i + ring.length - 1) % ring.length;
    const a = ring[i],
      b = ring[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function distanceToSegment(x, z, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const length = dx * dx + dz * dz;
  const t = length ? clamp(((x - a.x) * dx + (z - a.z) * dz) / length, 0, 1) : 0;
  return Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
}

function isExcluded(x, z, exclusions, polygonIndex, lineIndex, clearance = WATER_CLEARANCE) {
  if (exclusions.some((zone) => Math.hypot(x - zone.x, z - zone.z) < (zone.radius || 0)))
    return true;
  if (polygonIndex.query(x, z).some((ring) => pointInRing(x, z, ring))) return true;
  return lineIndex
    .query(x, z)
    .some((segment) => distanceToSegment(x, z, segment.a, segment.b) <= clearance);
}

function ringBounds(ring, padding = 0) {
  const xs = ring.map((point) => point.x),
    zs = ring.map((point) => point.z);
  return {
    minX: Math.min(...xs) - padding,
    maxX: Math.max(...xs) + padding,
    minZ: Math.min(...zs) - padding,
    maxZ: Math.max(...zs) + padding,
  };
}

function makeSpatialIndex(items, getBounds, cellSize = 2) {
  const cells = new Map();
  const key = (column, row) => `${column}:${row}`;
  const put = (column, row, item) => {
    const cell = key(column, row);
    const values = cells.get(cell);
    if (values) values.push(item);
    else cells.set(cell, [item]);
  };
  for (const item of items) {
    const bbox = getBounds(item);
    const minColumn = Math.floor(bbox.minX / cellSize),
      maxColumn = Math.floor(bbox.maxX / cellSize);
    const minRow = Math.floor(bbox.minZ / cellSize),
      maxRow = Math.floor(bbox.maxZ / cellSize);
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) put(column, row, item);
    }
  }
  return {
    query(x, z) {
      return cells.get(key(Math.floor(x / cellSize), Math.floor(z / cellSize))) || [];
    },
    cellCount: cells.size,
  };
}

function touchesWater(x, z, isWater) {
  if (typeof isWater !== 'function') return false;
  const samples = [
    [0, 0],
    [WATER_CLEARANCE, 0],
    [-WATER_CLEARANCE, 0],
    [0, WATER_CLEARANCE],
    [0, -WATER_CLEARANCE],
  ];
  return samples.some(([dx, dz]) => isWater(x + dx, z + dz));
}

function slopeAt(x, z, getHeight) {
  if (typeof getHeight !== 'function') return 0;
  const step = 0.05;
  const dx = getHeight(x + step, z) - getHeight(x - step, z);
  const dz = getHeight(x, z + step) - getHeight(x, z - step);
  return Math.hypot(dx, dz) / (step * 2);
}

function clusterValue(x, z) {
  return 0.5 + 0.5 * Math.sin(x * 1.7 + Math.sin(z * 0.43) * 1.8) * Math.cos(z * 1.25 - x * 0.31);
}

function normalisePoints(points, toWorld) {
  return (points || [])
    .map((point) => {
      if (Number.isFinite(point.x) && Number.isFinite(point.z)) return { x: point.x, z: point.z };
      if (
        typeof toWorld === 'function' &&
        Number.isFinite(point.lon) &&
        Number.isFinite(point.lat)
      ) {
        const world = toWorld(point.lon, point.lat);
        return { x: world.x, z: world.z };
      }
      return null;
    })
    .filter(Boolean);
}

function* buildVegetation(options = {}) {
  const {
    bounds,
    toWorld,
    getHeight,
    sourceElevation,
    isWater,
    exclusions = [],
    woodland,
    exclusionPolygons = [],
    exclusionLines = [],
    buildings = [],
    roads = [],
    shoals = [],
    seed = DEFAULT_SEED,
    maxTrees = 5000,
    metadata = {},
  } = options;
  const lowX = Math.min(bounds.minX, bounds.maxX),
    highX = Math.max(bounds.minX, bounds.maxX);
  const lowZ = Math.min(bounds.minZ, bounds.maxZ),
    highZ = Math.max(bounds.minZ, bounds.maxZ);
  const target = clamp(Math.floor(maxTrees), 0, 8000);
  const sourcePolygons = (woodland?.polygons || [])
    .map((polygon) => ({
      outer: normalisePoints(sourcePoints(polygon), toWorld),
      holes: (polygon.holes || [])
        .map((hole) => normalisePoints(hole, toWorld))
        .filter((ring) => ring.length >= 3),
    }))
    .filter((polygon) => polygon.outer.length >= 3);
  const blockedPolygons = [...exclusionPolygons, ...buildings, ...shoals]
    .map((polygon) => normalisePoints(sourcePoints(polygon), toWorld))
    .filter((ring) => ring.length >= 3);
  const blockedLines = [...exclusionLines, ...roads]
    .map((line) => normalisePoints(sourcePoints(line), toWorld))
    .filter((points) => points.length >= 2);
  const sourceIndex = makeSpatialIndex(sourcePolygons, (polygon) => ringBounds(polygon.outer));
  const blockedPolygonIndex = makeSpatialIndex(blockedPolygons, (ring) => ringBounds(ring));
  const blockedSegments = blockedLines.flatMap((line) =>
    line.slice(1).map((point, index) => ({ a: line[index], b: point })),
  );
  const blockedLineIndex = makeSpatialIndex(blockedSegments, (segment) => ({
    minX: Math.min(segment.a.x, segment.b.x) - WATER_CLEARANCE,
    maxX: Math.max(segment.a.x, segment.b.x) + WATER_CLEARANCE,
    minZ: Math.min(segment.a.z, segment.b.z) - WATER_CLEARANCE,
    maxZ: Math.max(segment.a.z, segment.b.z) + WATER_CLEARANCE,
  }));
  const rng = random(seed),
    positions = [],
    maxAttempts = Math.max(500, target * 14);
  for (let attempt = 0; attempt < maxAttempts && positions.length < target; attempt += 1) {
    if (attempt > 0 && attempt % 500 === 0)
      yield { type: 'progress', attempt, accepted: positions.length };
    const x = lowX + (highX - lowX) * rng(),
      z = lowZ + (highZ - lowZ) * rng();
    if (
      !sourceIndex
        .query(x, z)
        .some(
          (polygon) =>
            pointInRing(x, z, polygon.outer) &&
            !polygon.holes.some((hole) => pointInRing(x, z, hole)),
        )
    )
      continue;
    if (
      touchesWater(x, z, isWater) ||
      isExcluded(x, z, exclusions, blockedPolygonIndex, blockedLineIndex)
    )
      continue;
    const slope = slopeAt(x, z, getHeight);
    if (slope > 1.5) continue;
    const source = typeof sourceElevation === 'function' ? sourceElevation(x, z) : null;
    const minElevation = Number.isFinite(metadata.minElevation) ? metadata.minElevation : null,
      maxElevation = Number.isFinite(metadata.maxElevation) ? metadata.maxElevation : null;
    const elevationMix =
      Number.isFinite(source) && minElevation !== null && maxElevation !== null
        ? clamp((source - minElevation) / Math.max(1, maxElevation - minElevation))
        : 0.5;
    const lowlandPenalty = elevationMix < 0.18 ? 0.28 : 1;
    const clusterDensity =
      clamp(0.14 + slope * 0.65 + clusterValue(x, z) * 0.28, 0.12, 0.82) * lowlandPenalty;
    if (rng() > clusterDensity) continue;
    const y = typeof getHeight === 'function' ? getHeight(x, z) : 0;
    if (!Number.isFinite(y)) continue;
    const desiredHeight =
      TREE_HEIGHT_WORLD[0] + rng() * (TREE_HEIGHT_WORLD[1] - TREE_HEIGHT_WORLD[0]);
    positions.push({ x, y, z, height: desiredHeight, rotation: rng() * Math.PI * 2 });
  }
  return positions;
}

function sourcePoints(polygon) {
  return polygon?.points || polygon?.outer || polygon;
}

/**
 * Adds a compact, deterministic vegetation layer to the Xingping terrain.
 * Tree locations are an artistic expression of OSM woodland/forest hints and
 * reference-photo morphology; individual trees are not surveyed positions.
 */
export function createXingpingVegetation({
  bounds,
  toWorld,
  getHeight,
  sourceElevation,
  isWater,
  exclusions = [],
  woodland,
  exclusionPolygons = [],
  exclusionLines = [],
  buildings = [],
  roads = [],
  shoals = [],
  seed = DEFAULT_SEED,
  maxTrees = 5000,
  metadata = {},
  positionsOverride,
} = {}) {
  if (!bounds) throw new Error('Xingping vegetation bounds are required');
  if (!woodland?.polygons) throw new Error('Xingping vegetation woodland data is required');
  const lowX = Math.min(bounds.minX, bounds.maxX),
    highX = Math.max(bounds.minX, bounds.maxX);
  const lowZ = Math.min(bounds.minZ, bounds.maxZ),
    highZ = Math.max(bounds.minZ, bounds.maxZ);
  const target = clamp(Math.floor(maxTrees), 0, 8000);
  const sourcePolygons = (woodland?.polygons || [])
    .map((polygon) => ({
      outer: normalisePoints(sourcePoints(polygon), toWorld),
      holes: (polygon.holes || [])
        .map((hole) => normalisePoints(hole, toWorld))
        .filter((ring) => ring.length >= 3),
    }))
    .filter((polygon) => polygon.outer.length >= 3);
  const blockedPolygons = [...exclusionPolygons, ...buildings, ...shoals]
    .map((polygon) => normalisePoints(sourcePoints(polygon), toWorld))
    .filter((ring) => ring.length >= 3);
  const blockedLines = [...exclusionLines, ...roads]
    .map((line) => normalisePoints(sourcePoints(line), toWorld))
    .filter((points) => points.length >= 2);
  const sourceIndex = makeSpatialIndex(sourcePolygons, (polygon) => ringBounds(polygon.outer));
  const blockedPolygonIndex = makeSpatialIndex(blockedPolygons, (ring) => ringBounds(ring));
  const blockedSegments = blockedLines.flatMap((line) =>
    line.slice(1).map((point, index) => ({ a: line[index], b: point })),
  );
  const blockedLineIndex = makeSpatialIndex(blockedSegments, (segment) => ({
    minX: Math.min(segment.a.x, segment.b.x) - WATER_CLEARANCE,
    maxX: Math.max(segment.a.x, segment.b.x) + WATER_CLEARANCE,
    minZ: Math.min(segment.a.z, segment.b.z) - WATER_CLEARANCE,
    maxZ: Math.max(segment.a.z, segment.b.z) + WATER_CLEARANCE,
  }));
  const rng = random(seed);
  const positions = positionsOverride || [];
  const maxAttempts = Math.max(500, target * 14);
  for (
    let attempt = 0;
    !positionsOverride && attempt < maxAttempts && positions.length < target;
    attempt += 1
  ) {
    const x = lowX + (highX - lowX) * rng();
    const z = lowZ + (highZ - lowZ) * rng();
    if (
      !sourceIndex
        .query(x, z)
        .some(
          (polygon) =>
            pointInRing(x, z, polygon.outer) &&
            !polygon.holes.some((hole) => pointInRing(x, z, hole)),
        )
    )
      continue;
    if (
      touchesWater(x, z, isWater) ||
      isExcluded(x, z, exclusions, blockedPolygonIndex, blockedLineIndex)
    )
      continue;
    const slope = slopeAt(x, z, getHeight);
    // Keep cliff faces and bare exposed cuts readable, while favouring hillsides.
    if (slope > 1.5) continue;
    const source = typeof sourceElevation === 'function' ? sourceElevation(x, z) : null;
    const minElevation = Number.isFinite(metadata.minElevation) ? metadata.minElevation : null;
    const maxElevation = Number.isFinite(metadata.maxElevation) ? metadata.maxElevation : null;
    const elevationMix =
      Number.isFinite(source) && minElevation !== null && maxElevation !== null
        ? clamp((source - minElevation) / Math.max(1, maxElevation - minElevation))
        : 0.5;
    const lowlandPenalty = elevationMix < 0.18 ? 0.28 : 1;
    const clusterDensity =
      clamp(0.14 + slope * 0.65 + clusterValue(x, z) * 0.28, 0.12, 0.82) * lowlandPenalty;
    if (rng() > clusterDensity) continue;
    const y = typeof getHeight === 'function' ? getHeight(x, z) : 0;
    if (!Number.isFinite(y)) continue;
    const desiredHeight =
      TREE_HEIGHT_WORLD[0] + rng() * (TREE_HEIGHT_WORLD[1] - TREE_HEIGHT_WORLD[0]);
    // Desired full height is preserved when choosing the compact canopy geometry.
    positions.push({ x, y, z, height: desiredHeight, rotation: rng() * Math.PI * 2 });
  }

  const group = new THREE.Group();
  group.name = 'xingping-vegetation';
  group.userData = {
    artistic: true,
    source:
      'OSM woodland/forest landuse hints + Xingping reference photos; individual tree locations are not measured',
    sourceMetadata: { ...metadata, woodland: woodland?.source },
    sourcePolygons: woodland?.polygons?.map((polygon) => polygon.id) || [],
    seed,
    maxTrees: target,
    treeHeightMeters: [6, 12],
    treeHeightWorld: TREE_HEIGHT_WORLD.slice(),
    worldScaleMeters: 100,
    generatedTrees: positions.length,
    waterClearance: WATER_CLEARANCE,
  };
  if (!positions.length) return { group, update: () => false, dispose: () => {} };

  const trunkGeometry = new THREE.CylinderGeometry(0.006, 0.01, 1, 5);
  const canopyGeometry = new THREE.IcosahedronGeometry(1, 0);
  canopyGeometry.computeBoundingBox();
  const crownTop = 0.76 + 0.18 * canopyGeometry.boundingBox.max.y;
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#554437', roughness: 1 });
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: '#416545',
    roughness: 1,
    flatShading: true,
  });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, positions.length);
  const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, positions.length);
  trunks.name = 'xingping-tree-trunks';
  canopies.name = 'xingping-tree-canopies';
  trunks.castShadow = canopies.castShadow = true;
  canopies.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Matrix4();
  positions.forEach((tree, index) => {
    rotation.makeRotationY(tree.rotation);
    const visibleScale = tree.height / crownTop;
    const trunkHeight = visibleScale * 0.76;
    matrix.compose(
      new THREE.Vector3(tree.x, tree.y + trunkHeight / 2, tree.z),
      new THREE.Quaternion().setFromRotationMatrix(rotation),
      new THREE.Vector3(0.8, trunkHeight, 0.8),
    );
    trunks.setMatrixAt(index, matrix);
    const canopyRadius = visibleScale * 0.18;
    matrix.compose(
      new THREE.Vector3(tree.x, tree.y + visibleScale * 0.76, tree.z),
      new THREE.Quaternion().setFromRotationMatrix(rotation),
      new THREE.Vector3(canopyRadius, canopyRadius, canopyRadius),
    );
    canopies.setMatrixAt(index, matrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  group.add(trunks, canopies);

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    trunks.dispose();
    canopies.dispose();
    trunkGeometry.dispose();
    canopyGeometry.dispose();
    trunkMaterial.dispose();
    canopyMaterial.dispose();
    group.clear();
  };
  const center = new THREE.Vector3((lowX + highX) / 2, 0, (lowZ + highZ) / 2);
  const nearDistance = Math.max(highX - lowX, highZ - lowZ) * 0.65;
  let lastVisible = true;
  const update = (camera) => {
    if (disposed || !camera?.position) return false;
    const visible = camera.position.distanceTo(center) <= nearDistance * (lastVisible ? 1.15 : 1);
    if (visible === lastVisible) return false;
    lastVisible = visible;
    group.visible = visible;
    return true;
  };
  return { group, update, dispose };
}

export async function createXingpingVegetationAsync(
  options = {},
  { signal, yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0)) } = {},
) {
  const sampler = buildVegetation(options);
  let step = sampler.next();
  while (!step.done) {
    if (signal?.aborted)
      throw new DOMException('Xingping vegetation load was aborted', 'AbortError');
    await yieldTask();
    step = sampler.next();
  }
  if (signal?.aborted) throw new DOMException('Xingping vegetation load was aborted', 'AbortError');
  return createXingpingVegetation({ ...options, positionsOverride: step.value });
}
