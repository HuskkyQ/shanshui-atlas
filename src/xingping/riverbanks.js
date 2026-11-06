import * as THREE from 'three';

// Shoreline polygons are 2D display masks, while the DSM may sample a high
// hillside exactly at the mapped waterline. Low rises can use a small closure;
// higher mismatches are rendered as a separate rock toe so they do not become
// an olive triangular wall or expose the display base.
export const MAX_CONNECTOR_RISE = 0.24;
const BANK_SAMPLE_STEP = 0.1;
const ROCK_ROW_STEP = 0.12;
const ROCK_RELIEF = 0.03;

function limestoneMaterial(waterLevel) {
  const material = new THREE.MeshStandardMaterial({ roughness: .96, side: THREE.DoubleSide });
  material.customProgramCacheKey = () => 'xingping-limestone-bank-v2';
  material.onBeforeCompile = shader => {
    shader.uniforms.bankWaterLevel = { value: waterLevel };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 bankPoint;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nbankPoint = transformed;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 bankPoint;
      uniform float bankWaterLevel;
      float bankHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float bankNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(bankHash(i), bankHash(i + vec2(1.,0.)), f.x), mix(bankHash(i + vec2(0.,1.)), bankHash(i + vec2(1.,1.)), f.x), f.y);
      }
      float bankFbm(vec2 p) { return .58 * bankNoise(p) + .28 * bankNoise(p * 2.07) + .14 * bankNoise(p * 4.11); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grain = bankFbm(bankPoint.xz * 18.0 + vec2(bankPoint.y * 2.0, bankPoint.y * -1.3));
        float weather = bankFbm(bankPoint.xz * 3.2 + vec2(bankPoint.y * .8, 0.0));
        float gully = smoothstep(.63, .86, bankFbm(vec2(bankPoint.x * 5.0, bankPoint.y * 2.8)));
        vec3 limestone = mix(vec3(.28,.29,.27), vec3(.63,.61,.53), weather);
        limestone *= .82 + grain * .28;
        limestone = mix(limestone, vec3(.12,.21,.15), gully * .18);
        limestone = mix(limestone, vec3(.035,.075,.040), (1.0 - smoothstep(bankWaterLevel + .04, bankWaterLevel + .25, bankPoint.y)) * .8);
        diffuseColor.rgb = limestone;`);
  };
  return material;
}

export function createRiverbanks({ shoals, toWorld, waterLevel, shorelines = [], terrainHeight, isWater, bounds }) {
  const group = new THREE.Group();
  group.name = 'xingping-shoals';
  const positions = [], indices = [], colors = [];
  const sand = new THREE.Color('#aca281'), gravel = new THREE.Color('#bcb399');
  for (const shoal of shoals) {
    const rings = [shoal.outer, ...(shoal.holes || [])].map(ring => ring.map(p => toWorld(p.lon, p.lat)));
    const points = rings.flat(), start = positions.length / 3;
    for (const p of points) {
      const color = sand.clone().lerp(gravel, .5 + .35 * Math.sin(p.x * 8.1 + p.z * 3.7));
      positions.push(p.x, waterLevel + .014, p.z);
      colors.push(color.r, color.g, color.b);
    }
    const triangles = THREE.ShapeUtils.triangulateShape(rings[0].map(p => new THREE.Vector2(p.x, p.z)), rings.slice(1).map(r => r.map(p => new THREE.Vector2(p.x, p.z))));
    for (const [a, b, c] of triangles) {
      const x = i => Math.fround(points[i].x), z = i => Math.fround(points[i].z);
      const cross = (x(b) - x(a)) * (z(c) - z(a)) - (z(b) - z(a)) * (x(c) - x(a));
      if (Math.abs(cross) < 1e-9) continue;
      indices.push(...(cross > 0 ? [a, c, b] : [a, b, c]).map(i => i + start));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.userData = { sourceWays: shoals.map(s => s.id), displayElevationMeasured: false };
  group.add(mesh);
  // Connect the mapped shoreline to the DSM display surface. These connecting
  // faces close sampling gaps; they are not surveyed river-bank cross sections.
  const bankPositions = [], bankIndices = [];
  const rockPositions = [], rockIndices = [];
  let highRiseSegments = 0;
  const sampleTerrain = (x, z) => {
    const sample = terrainHeight?.(x, z);
    return Number.isFinite(sample) ? sample : waterLevel;
  };
  const dryNormal = (p, q, ring) => {
    const tangent = q.clone().sub(p).setY(0).normalize();
    const left = new THREE.Vector3(-tangent.z, 0, tangent.x);
    const midpoint = p.clone().add(q).multiplyScalar(.5);
    if (isWater) {
      const plus = isWater(midpoint.x + left.x * .06, midpoint.z + left.z * .06);
      const minus = isWater(midpoint.x - left.x * .06, midpoint.z - left.z * .06);
      if (plus !== minus) return plus ? left.negate() : left;
    }
    let area = 0;
    for (let i = 0; i < ring.length; i++) area += ring[i].x * ring[(i + 1) % ring.length].z - ring[(i + 1) % ring.length].x * ring[i].z;
    return area < 0 ? left : left.negate();
  };
  const offsetDry = (point, normal, amount) => {
    const candidate = point.clone().addScaledVector(normal, amount);
    return isWater && isWater(candidate.x, candidate.z) ? point : candidate;
  };
  for (const polygon of shorelines) for (const ring of [polygon.outer, ...polygon.holes]) {
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      const atEdge = bounds && [
        [a.x - bounds.minX, b.x - bounds.minX], [a.x - bounds.maxX, b.x - bounds.maxX],
        [a.z - bounds.minZ, b.z - bounds.minZ], [a.z - bounds.maxZ, b.z - bounds.maxZ],
      ].some(([x, y]) => Math.abs(x) < 1e-7 && Math.abs(y) < 1e-7);
      if (atEdge) continue;
      const count = Math.max(1, Math.ceil(a.distanceTo(b) / BANK_SAMPLE_STEP));
      for (let j = 0; j < count; j++) {
        const p = a.clone().lerp(b, j / count), q = a.clone().lerp(b, (j + 1) / count);
        const py = Math.max(waterLevel, sampleTerrain(p.x, p.z)), qy = Math.max(waterLevel, sampleTerrain(q.x, q.z));
        if (py <= waterLevel && qy <= waterLevel) continue;
        if (py > waterLevel + MAX_CONNECTOR_RISE || qy > waterLevel + MAX_CONNECTOR_RISE) {
          highRiseSegments += 1;
          const rise = Math.max(py, qy) - waterLevel;
          const rows = Math.max(5, Math.ceil(rise / ROCK_ROW_STEP));
          const start = rockPositions.length / 3;
          const dry = dryNormal(p, q, ring);
          for (let row = 0; row <= rows; row++) {
            const t = row / rows;
            const wobble = row === 0 || row === rows ? 0 : Math.sin((j + 1) * 7.31 + row * 2.17) * .009 * Math.sin(Math.PI * t);
            const pY = THREE.MathUtils.lerp(waterLevel - .006, py + .004, t) + wobble;
            const qY = THREE.MathUtils.lerp(waterLevel - .006, qy + .004, t) - wobble;
            const relief = Math.sin((j + 1) * 5.7 + row * 1.91) * ROCK_RELIEF * Math.sin(Math.PI * t);
            const pPoint = offsetDry(p, dry, relief);
            const qPoint = offsetDry(q, dry, relief * .82);
            rockPositions.push(pPoint.x, pY, pPoint.z, qPoint.x, qY, qPoint.z);
          }
          for (let row = 0; row < rows; row++) {
            const a = start + row * 2, b = a + 2;
            rockIndices.push(a, b, a + 1, a + 1, b, b + 1);
          }
          continue;
        }
        const start = bankPositions.length / 3;
        bankPositions.push(p.x, py + .004, p.z, q.x, qy + .004, q.z, q.x, waterLevel - .006, q.z, p.x, waterLevel - .006, p.z);
        bankIndices.push(start, start + 1, start + 2, start, start + 2, start + 3);
      }
    }
  }
  const bankGeometry = new THREE.BufferGeometry();
  bankGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bankPositions, 3));
  bankGeometry.setIndex(bankIndices); bankGeometry.computeVertexNormals();
  const bankMaterial = new THREE.MeshStandardMaterial({ color: '#737c61', roughness: 1, side: THREE.DoubleSide });
  const banks = new THREE.Mesh(bankGeometry, bankMaterial);
  banks.name = 'xingping-shoreline-connectors';
  banks.userData = {
    displayOnly: true,
    maxConnectorRise: MAX_CONNECTOR_RISE,
    connectorSegmentCount: bankIndices.length / 6,
  };
  banks.receiveShadow = true;
  group.add(banks);
  const rockGeometry = new THREE.BufferGeometry();
  rockGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rockPositions, 3));
  rockGeometry.setIndex(rockIndices);
  rockGeometry.computeVertexNormals();
  const rockMaterial = limestoneMaterial(waterLevel);
  const rocks = new THREE.Mesh(rockGeometry, rockMaterial);
  rocks.name = 'xingping-shoreline-rock';
  rocks.userData = {
    displayOnly: true,
    materialRole: 'earthy-limestone-bank-closure',
    highRiseSegments,
    sampleStep: BANK_SAMPLE_STEP,
    minimumVerticalRows: 5,
  };
  rocks.receiveShadow = true;
  group.add(rocks);
  let disposed = false;
  return { group, dispose() { if (disposed) return; disposed = true; geometry.dispose(); material.dispose(); bankGeometry.dispose(); bankMaterial.dispose(); rockGeometry.dispose(); rockMaterial.dispose(); group.clear(); } };
}
