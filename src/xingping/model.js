import * as THREE from 'three';
import defaultMetadata from '../data/xingping-dem.json' with { type: 'json' };
import defaultWater from '../data/xingping-water.json' with { type: 'json' };
import { rasterizeWaterMask } from './water-mask.js';
import details from '../data/xingping-details.json' with { type: 'json' };
import { createSurfaceMaterial, createSurfaceDepthMaterial } from './surface.js';
import { createRiverbanks } from './riverbanks.js';
import { createWaterSurface } from './water-surface.js';
import { createJiumaCliff } from './jiuma-cliff.js';

const demUrl = new URL('../data/xingping-dem.bin', import.meta.url).href;
const HORIZONTAL_SCALE = 0.01;
const VERTICAL_SCALE = 0.0135;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function waterContains(x, z, polygons) {
  return polygons.some(({ outer, holes }) => pointInRing(x, z, outer) && !(holes || []).some(hole => pointInRing(x, z, hole)));
}

function axis(length, step) {
  const values = [];
  for (let i = 0; i < length - 1; i += step) values.push(i);
  values.push(length - 1);
  return values;
}

function clipRing(ring, meta) {
  const edges = [
    { inside: p => p.lon >= meta.west, intersect: (a, b) => ({ lon: meta.west, lat: a.lat + (b.lat - a.lat) * (meta.west - a.lon) / (b.lon - a.lon) }) },
    { inside: p => p.lon <= meta.east, intersect: (a, b) => ({ lon: meta.east, lat: a.lat + (b.lat - a.lat) * (meta.east - a.lon) / (b.lon - a.lon) }) },
    { inside: p => p.lat >= meta.south, intersect: (a, b) => ({ lon: a.lon + (b.lon - a.lon) * (meta.south - a.lat) / (b.lat - a.lat), lat: meta.south }) },
    { inside: p => p.lat <= meta.north, intersect: (a, b) => ({ lon: a.lon + (b.lon - a.lon) * (meta.north - a.lat) / (b.lat - a.lat), lat: meta.north }) },
  ];
  let output = ring.slice();
  for (const edge of edges) {
    const input = output; output = [];
    for (let i = 0; i < input.length; i += 1) {
      const current = input[i], previous = input[(i + input.length - 1) % input.length];
      const currentInside = edge.inside(current), previousInside = edge.inside(previous);
      if (currentInside !== previousInside) output.push(edge.intersect(previous, current));
      if (currentInside) output.push(current);
    }
  }
  return output;
}

export function buildXingpingModel({ metadata: meta, elevations, water = {}, deferDetail = false, includeContext = false }) {
  if (!meta || elevations.length !== meta.width * meta.height) throw new Error('Xingping DEM dimensions do not match');
  const origin = { lon: (meta.west + meta.east) / 2, lat: (meta.north + meta.south) / 2 };
  const lonScale = 111320 * Math.cos(origin.lat * Math.PI / 180) * HORIZONTAL_SCALE;
  const latScale = 110540 * HORIZONTAL_SCALE;
  const baseElevation = Number.isFinite(meta.minElevation) ? meta.minElevation - 20 : Math.min(...elevations) / 10 - 20;
  const elevationToWorld = elevation => (elevation - baseElevation) * VERTICAL_SCALE;
  const toWorld = (lon, lat) => new THREE.Vector3((lon - origin.lon) * lonScale, 0, (origin.lat - lat) * latScale);
  const nw = toWorld(meta.west, meta.north), se = toWorld(meta.east, meta.south);
  const cx = (nw.x + se.x) / 2, cz = (nw.z + se.z) / 2;
  const sourceElevation = (x, z) => {
    const u = clamp((x - nw.x) / (se.x - nw.x)) * (meta.width - 1);
    const v = clamp((z - nw.z) / (se.z - nw.z)) * (meta.height - 1);
    const x0 = Math.floor(u), z0 = Math.floor(v), x1 = Math.min(x0 + 1, meta.width - 1), z1 = Math.min(z0 + 1, meta.height - 1);
    const tx = u - x0, tz = v - z0;
    const a = elevations[z0 * meta.width + x0] * (1 - tx) + elevations[z0 * meta.width + x1] * tx;
    const b = elevations[z1 * meta.width + x0] * (1 - tx) + elevations[z1 * meta.width + x1] * tx;
    return (a * (1 - tz) + b * tz) / 10;
  };
  // Sample the same two triangles used by the rendered source grid. Bilinear
  // sampling differs at a steep cell and can leave gaps along an overlay edge.
  const renderedElevation = (x, z) => {
    const u = clamp((x - nw.x) / (se.x - nw.x)) * (meta.width - 1);
    const v = clamp((z - nw.z) / (se.z - nw.z)) * (meta.height - 1);
    const col = Math.min(Math.floor(u), meta.width - 2), row = Math.min(Math.floor(v), meta.height - 2);
    const tx = u - col, tz = v - row;
    const a = elevations[row * meta.width + col], b = elevations[(row + 1) * meta.width + col];
    const c = elevations[row * meta.width + col + 1], d = elevations[(row + 1) * meta.width + col + 1];
    return (tx + tz <= 1 ? a + (c - a) * tx + (b - a) * tz : d + (b - d) * (1 - tx) + (c - d) * (1 - tz)) / 10;
  };

  const toRing = ring => ring.map(point => toWorld(point.lon, point.lat));
  const polygons = (water.displayPolygons || water.polygons || []).map(polygon => ({
    outer: toRing(clipRing(polygon.outer, meta)),
    holes: (polygon.holes || []).map(hole => toRing(clipRing(hole, meta))),
    source: polygon.source, id: polygon.id,
  })).filter(polygon => polygon.outer.length >= 3);
  const waterVertices = polygons.flatMap(polygon => [polygon.outer, ...(polygon.holes || [])]).flat();
  const recordedWaterElevation = typeof meta.waterElevation === 'object' ? meta.waterElevation.value : meta.waterElevation;
  const waterSamples = [];
  if (!Number.isFinite(recordedWaterElevation)) {
    for (let row = 0; row < meta.height; row++) for (let col = 0; col < meta.width; col++) {
      const x = nw.x + col / (meta.width - 1) * (se.x - nw.x);
      const z = nw.z + row / (meta.height - 1) * (se.z - nw.z);
      if (waterContains(x, z, polygons)) waterSamples.push(elevations[row * meta.width + col] / 10);
    }
    waterSamples.sort((a, b) => a - b);
  }
  const middle = Math.floor(waterSamples.length / 2);
  const median = waterSamples.length % 2 ? waterSamples[middle] : (waterSamples[middle - 1] + waterSamples[middle]) / 2;
  const waterElevation = Number.isFinite(recordedWaterElevation) ? recordedWaterElevation : (median || meta.minElevation);
  const waterLevel = elevationToWorld(waterElevation) + 0.012;
  const waterBounds = waterVertices.length ? new THREE.Box3().setFromPoints(waterVertices) : new THREE.Box3();
  const isWater = (x, z) => waterContains(x, z, polygons);
  let jiumaCliff = null;
  const getHeight = (x, z) => {
    // Keep the complete source rectangle at source heights. The display base, rather than
    // an artificial terrain taper, handles the cut edge so river water cannot float above it.
    const raw = elevationToWorld(sourceElevation(x, z));
    return isWater(x, z) ? Math.min(raw, waterLevel - 0.11) : (jiumaCliff?.getHeight(x, z) ?? raw);
  };
  const bounds = { minX: nw.x, maxX: se.x, minZ: nw.z, maxZ: se.z, minY: -0.7, maxY: elevationToWorld(meta.maxElevation) };
  const group = new THREE.Group();
  group.name = 'xingping-landscape';
  group.userData = { horizontalScale: HORIZONTAL_SCALE, verticalExaggeration: VERTICAL_SCALE / HORIZONTAL_SCALE, sourceTerrain: true, waterElevationMeasured: false };
  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'xingping-terrain';
  group.add(terrainGroup);

  const cliffLines = details.cliffs.filter(c => c.id === '1087179283').map(c => c.points.map(p => toWorld(p.lon, p.lat)));
  if (includeContext) jiumaCliff = createJiumaCliff({
    line: cliffLines[0], terrainHeight: (x, z) => elevationToWorld(renderedElevation(x, z)),
    isWater, waterLevel, bounds,
  });
  if (jiumaCliff) group.add(jiumaCliff.group);

  // Keep narrow mapped channels open even when a coarse triangle spans both banks.
  // This is a display mask of the same polygons, not new shoreline measurements.
  const maskWidth = 2048;
  const maskHeight = Math.max(1, Math.round(maskWidth * (se.z - nw.z) / (se.x - nw.x)));
  const maskPixels = rasterizeWaterMask(jiumaCliff ? [...polygons, jiumaCliff.footprint] : polygons, bounds, maskWidth, maskHeight);
  const mask = new THREE.DataTexture(maskPixels, maskWidth, maskHeight, THREE.RedFormat);
  mask.needsUpdate = true;
  const terrainMaterial = createSurfaceMaterial({ mask, bounds, cliffLines });
  const terrainDepthMaterial = createSurfaceDepthMaterial({ mask, bounds });
  const forest = new THREE.Color('#35563c'), forestLight = new THREE.Color('#506b43'), lowland = new THREE.Color('#71774d');
  function makeTerrain(step) {
    const cols = axis(meta.width, step), rows = axis(meta.height, step), width = cols.length;
    const positions = new Float32Array(width * rows.length * 3), colors = new Float32Array(positions.length), indices = [];
    const color = new THREE.Color();
    for (let row = 0; row < rows.length; row++) for (let col = 0; col < width; col++) {
      const sourceCol = cols[col], sourceRow = rows[row];
      const x = nw.x + sourceCol / (meta.width - 1) * (se.x - nw.x), z = nw.z + sourceRow / (meta.height - 1) * (se.z - nw.z);
      const elevation = elevations[sourceRow * meta.width + sourceCol] / 10;
      const sample = (c, r) => elevations[Math.max(0, Math.min(meta.height - 1, r)) * meta.width + Math.max(0, Math.min(meta.width - 1, c))] / 10;
      const slope = Math.hypot(sample(sourceCol + 1, sourceRow) - sample(sourceCol - 1, sourceRow), sample(sourceCol, sourceRow + 1) - sample(sourceCol, sourceRow - 1)) / 60;
      const patch = .5 + .5 * Math.sin(x * 1.3 + Math.cos(z * .73) * 2) * Math.cos(z * 1.1 - x * .3);
      color.copy(forest).lerp(forestLight, patch * .65);
      color.lerp(lowland, (1 - clamp(slope * 3.5)) * clamp((160 - elevation) / 45) * .75);
      const index = (row * width + col) * 3;
      positions[index] = x; positions[index + 1] = elevationToWorld(elevation); positions[index + 2] = z;
      colors[index] = color.r; colors[index + 1] = color.g; colors[index + 2] = color.b;
      if (row < rows.length - 1 && col < width - 1) {
        const a = row * width + col;
        indices.push(a, a + width, a + 1, a + 1, a + width, a + width + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, terrainMaterial);
    mesh.customDepthMaterial = terrainDepthMaterial;
    mesh.name = step === 1 ? 'xingping-terrain-source-detail' : 'xingping-terrain-overview';
    mesh.userData = { sourceSampleStep: step, peripheralDisplayTaper: false };
    mesh.castShadow = mesh.receiveShadow = true;
    terrainGroup.add(mesh);
    return mesh;
  }
  const coarse = makeTerrain(3);
  let detailed = null;

  const edge = [];
  for (let col = 0; col < meta.width; col++) edge.push([col, 0]);
  for (let row = 1; row < meta.height; row++) edge.push([meta.width - 1, row]);
  for (let col = meta.width - 2; col >= 0; col--) edge.push([col, meta.height - 1]);
  for (let row = meta.height - 2; row > 0; row--) edge.push([0, row]);
  const skirtPositions = [], skirtIndices = [];
  edge.forEach(([col, row], i) => {
    const x = nw.x + col / (meta.width - 1) * (se.x - nw.x);
    const z = nw.z + row / (meta.height - 1) * (se.z - nw.z);
    skirtPositions.push(x, getHeight(x, z), z, x, -.25, z);
    const next = (i + 1) % edge.length * 2;
    skirtIndices.push(i * 2, next, next + 1, i * 2, next + 1, i * 2 + 1);
  });
  const skirtGeometry = new THREE.BufferGeometry();
  skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
  skirtGeometry.setIndex(skirtIndices);
  skirtGeometry.computeVertexNormals();
  const baseMaterial = new THREE.MeshStandardMaterial({ color: '#3c5047', roughness: 1 });
  const skirt = new THREE.Mesh(skirtGeometry, baseMaterial);
  skirt.name = 'xingping-display-edge';
  skirt.userData.displayOnly = true;
  const base = new THREE.Mesh(new THREE.BoxGeometry(se.x - nw.x, .45, se.z - nw.z), baseMaterial);
  base.name = 'xingping-display-base';
  base.position.set(cx, -.475, cz);
  base.userData.displayOnly = true;
  group.add(skirt, base);

  const waterSurface = createWaterSurface({ polygons, waterLevel, reflection: includeContext });
  group.add(waterSurface.group);

  const context = [waterSurface, ...(jiumaCliff ? [jiumaCliff] : [])];
  if (includeContext) {
    const banks = createRiverbanks({ shoals: details.shoals, toWorld, waterLevel, shorelines: polygons, bounds, isWater, terrainHeight: (x, z) => jiumaCliff?.getBankHeight(x, z) ?? getHeight(x, z) });
    group.add(banks.group);
    context.push(banks);
  }

  let disposed = false;
  return {
    group, bounds, waterLevel, waterBounds, waterElevation, waterPolygons: polygons, toWorld, sourceElevation, elevationToWorld, isWater, getHeight,
    jiumaCliff,
    sourceData: { metadata: meta, elevations, water },
    setDetailGeometry(geometry) { if (disposed || detailed) { geometry.dispose(); return; } detailed = new THREE.Mesh(geometry, terrainMaterial); detailed.customDepthMaterial = terrainDepthMaterial; detailed.name = 'xingping-terrain-source-detail'; detailed.userData = { sourceSampleStep: 1, peripheralDisplayTaper: false }; detailed.visible = false; detailed.castShadow = detailed.receiveShadow = true; terrainGroup.add(detailed); },
    buildDetail() { if (!disposed && !detailed) detailed = makeTerrain(1); },
    update(camera, time = 0) {
      if (disposed) return false;
      let changed = false;
      for (const module of context) changed = !!module.update?.(camera, time) || changed;
      const near = camera.position.distanceTo(new THREE.Vector3(cx, waterLevel, cz)) < (detailed?.visible ? 90 : 75);
      if (near && !detailed && !deferDetail) detailed = makeTerrain(1);
      const useDetail = near && !!detailed;
      changed = coarse.visible === useDetail || changed;
      coarse.visible = !useDetail;
      if (detailed) detailed.visible = useDetail;
      return changed;
    },
    dispose() { if (disposed) return; disposed = true; context.forEach(module => { group.remove(module.group); module.dispose(); }); const geometries = new Set(), materials = new Set(); group.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); if (object.customDepthMaterial) materials.add(object.customDepthMaterial); }); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); mask.dispose(); },
  };
}

export async function createXingpingModel({ signal } = {}) {
  const response = await fetch(demUrl, { signal });
  if (!response.ok) throw new Error(`Xingping DEM loading failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== defaultMetadata.width * defaultMetadata.height * 2) throw new Error('Xingping DEM dimensions do not match');
  const view = new DataView(buffer); const elevations = Uint16Array.from({ length: buffer.byteLength / 2 }, (_, index) => view.getUint16(index * 2, true));
  return buildXingpingModel({ metadata: defaultMetadata, elevations, water: defaultWater, deferDetail: true, includeContext: true });
}
