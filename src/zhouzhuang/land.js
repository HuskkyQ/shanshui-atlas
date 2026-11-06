import * as THREE from 'three';

function clipLandPolygon(points) {
  const polygon = [];
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (a.f >= 0) polygon.push(a);
    if ((a.f >= 0) !== (b.f >= 0)) {
      const t = a.f / (a.f - b.f);
      polygon.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t, f: 0 });
    }
  }
  return polygon;
}

function makeGeometry(positions) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function generateLandArrays(waterQuery, bounds, { coarse = false } = {}) {
  const top = [], sides = [];
  const { minX, maxX, minZ, maxZ } = bounds;
  const samples = new Map();
  const vertex = (x, z) => {
    const key = `${x},${z}`;
    let sample = samples.get(key);
    if (!sample) {
      sample = { x, y: 2, z, f: waterQuery.signedDistance(x, z) };
      samples.set(key, sample);
    }
    return sample;
  };
  const wall = (a, b) => sides.push(a.x, 2, a.z, b.x, 2, b.z, b.x, -0.5, b.z,
    a.x, 2, a.z, b.x, -0.5, b.z, a.x, -0.5, a.z);
  const clipTriangle = (points) => {
    const polygon = clipLandPolygon(points);
    if (polygon.length < 3) return;
    for (let i = 1; i + 1 < polygon.length; i += 1) {
      const a = polygon[0], b = polygon[i], c = polygon[i + 1];
      const upward = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) > 0;
      for (const p of upward ? [a, b, c] : [a, c, b]) top.push(p.x, 2, p.z);
    }
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const outer = (Math.abs(a.x - minX) < 1e-5 && Math.abs(b.x - minX) < 1e-5)
        || (Math.abs(a.x - maxX) < 1e-5 && Math.abs(b.x - maxX) < 1e-5)
        || (Math.abs(a.z - minZ) < 1e-5 && Math.abs(b.z - minZ) < 1e-5)
        || (Math.abs(a.z - maxZ) < 1e-5 && Math.abs(b.z - maxZ) < 1e-5);
      if ((a.f === 0 && b.f === 0) || outer) wall(a, b);
    }
  };
  const baseStep = coarse ? 16 : (maxX - minX > 500 ? 4 : 2);
  for (let x = minX; x < maxX; x += baseStep) for (let z = minZ; z < maxZ; z += baseStep) {
    const xEnd = Math.min(x + baseStep, maxX), zEnd = Math.min(z + baseStep, maxZ);
    const cornerSamples = [vertex(x, z), vertex(xEnd, z), vertex(xEnd, zEnd), vertex(x, zEnd),
      vertex((x + xEnd) / 2, (z + zEnd) / 2)];
    const step = cornerSamples.some((sample) => Math.abs(sample.f) < 8) ? (coarse ? 4 : 1) : baseStep;
    for (let sx = x; sx < xEnd; sx += step) for (let sz = z; sz < zEnd; sz += step) {
      const a = vertex(sx, sz), b = vertex(Math.min(sx + step, xEnd), sz);
      const c = vertex(Math.min(sx + step, xEnd), Math.min(sz + step, zEnd));
      const d = vertex(sx, Math.min(sz + step, zEnd));
      clipTriangle([a, b, c]);
      clipTriangle([a, c, d]);
    }
  }
  return { top, sides };
}

export function applyLandGeometry(land, top, sides) {
  const surface = land.getObjectByName('land-blocks');
  const banks = land.getObjectByName('stone-embankments');
  const surfaceGeometry = makeGeometry(top);
  const banksGeometry = makeGeometry(sides);
  surface.geometry.dispose();
  banks.geometry.dispose();
  surface.geometry = surfaceGeometry;
  banks.geometry = banksGeometry;
}

/** Build the walkable land mesh while caching shoreline samples for this build. */
export function createLand(materials, waterQuery, bounds, options = {}) {
  const { top, sides } = generateLandArrays(waterQuery, bounds, options);
  const land = new THREE.Group();
  land.name = 'district-land';
  const surface = new THREE.Mesh(makeGeometry(top), materials.ground);
  surface.name = 'land-blocks';
  surface.castShadow = false;
  surface.receiveShadow = true;
  const banks = new THREE.Mesh(makeGeometry(sides), materials.stone);
  banks.name = 'stone-embankments';
  banks.castShadow = true;
  banks.receiveShadow = true;
  banks.material.side = THREE.DoubleSide;
  land.add(surface, banks);
  return land;
}
