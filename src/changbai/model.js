import * as THREE from 'three';
import metadata from '../data/changbai-dem.json' with { type: 'json' };
import lake from '../data/changbai-lake.json' with { type: 'json' };

const demUrl = new URL('../data/changbai-dem.bin', import.meta.url).href;
const HORIZONTAL_SCALE = 0.01;
const VERTICAL_SCALE = 0.0125;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };

function contains(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

export function buildChangbaiModel({ metadata: meta, elevations, lake: shore, deferDetail = false }) {
  if (elevations.length !== meta.width * meta.height) throw new Error('Changbai DEM dimensions do not match');
  const shoreBounds = {
    west: Math.min(...shore.points.map(p => p.lon)), east: Math.max(...shore.points.map(p => p.lon)),
    north: Math.max(...shore.points.map(p => p.lat)), south: Math.min(...shore.points.map(p => p.lat)),
  };
  const origin = { lon: (shoreBounds.west + shoreBounds.east) / 2, lat: (shoreBounds.north + shoreBounds.south) / 2 };
  const lonScale = 111320 * Math.cos(origin.lat * Math.PI / 180) * HORIZONTAL_SCALE;
  const latScale = 110540 * HORIZONTAL_SCALE;
  const baseElevation = meta.minElevation - 80;
  const elevationToWorld = elevation => (elevation - baseElevation) * VERTICAL_SCALE;
  const toWorld = (lon, lat) => new THREE.Vector3((lon - origin.lon) * lonScale, 0, (origin.lat - lat) * latScale);
  const nw = toWorld(meta.west, meta.north), se = toWorld(meta.east, meta.south);
  const bounds = { minX: nw.x, maxX: se.x, minZ: nw.z, maxZ: se.z, minY: -0.6, maxY: elevationToWorld(meta.maxElevation) };
  const cx = (nw.x + se.x) / 2, cz = (nw.z + se.z) / 2, rx = (se.x - nw.x) / 2, rz = (se.z - nw.z) / 2;
  const shoreline = shore.points.map(p => toWorld(p.lon, p.lat));
  const lakeBox = new THREE.Box3().setFromPoints(shoreline);
  const isLake = (x, z) => x >= lakeBox.min.x && x <= lakeBox.max.x && z >= lakeBox.min.z && z <= lakeBox.max.z
    && contains(x, z, shoreline);
  const radius = (x, z) => Math.hypot((x - cx) / rx, (z - cz) / rz);
  // Only the outermost display margin is tapered; the caldera and its flanks retain source heights.
  const peripheralFactor = (x, z) => smooth((1 - radius(x, z)) / 0.14);
  const sourceElevation = (x, z) => {
    const u = clamp((x - nw.x) / (se.x - nw.x)) * (meta.width - 1);
    const v = clamp((z - nw.z) / (se.z - nw.z)) * (meta.height - 1);
    const x0 = Math.floor(u), z0 = Math.floor(v), x1 = Math.min(x0 + 1, meta.width - 1), z1 = Math.min(z0 + 1, meta.height - 1);
    const tx = u - x0, tz = v - z0;
    const north = elevations[z0 * meta.width + x0] * (1 - tx) + elevations[z0 * meta.width + x1] * tx;
    const south = elevations[z1 * meta.width + x0] * (1 - tx) + elevations[z1 * meta.width + x1] * tx;
    return (north * (1 - tz) + south * tz) / 10;
  };
  const lakeLevel = elevationToWorld(meta.lakeElevation) + 0.008;
  const getHeight = (x, z) => {
    const raw = elevationToWorld(sourceElevation(x, z)) * peripheralFactor(x, z);
    // A hidden display bed prevents coplanar DEM water; it does not model measured lake depth.
    return isLake(x, z) ? Math.min(raw, lakeLevel - 0.16) : raw;
  };
  const lakeCenter = new THREE.Vector3((lakeBox.min.x + lakeBox.max.x) / 2, lakeLevel, (lakeBox.min.z + lakeBox.max.z) / 2);
  const lakeBounds = { minX: lakeBox.min.x, maxX: lakeBox.max.x, minZ: lakeBox.min.z, maxZ: lakeBox.max.z };
  const group = new THREE.Group();
  group.name = 'changbai-tianchi';
  group.userData = { horizontalScale: HORIZONTAL_SCALE, verticalExaggeration: VERTICAL_SCALE / HORIZONTAL_SCALE, sourceTerrain: true };
  const terrainGroup = new THREE.Group();
  terrainGroup.name = 'changbai-terrain';
  group.add(terrainGroup);
  // Material grain is decorative; it never displaces the measured terrain.
  const textureSize = 128, grain = new Float32Array(textureSize * textureSize);
  for (let i = 0; i < grain.length; i++) {
    const x = i % textureSize, z = Math.floor(i / textureSize);
    const value = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
    grain[i] = value - Math.floor(value);
  }
  const pixels = new Uint8Array(grain.length * 4);
  for (let i = 0; i < grain.length; i++) {
    const shade = Math.round(225 + grain[i] * 30);
    pixels.set([shade, shade, shade, 255], i * 4);
  }
  const grainTexture = new THREE.DataTexture(pixels, textureSize, textureSize, THREE.RGBAFormat);
  grainTexture.wrapS = grainTexture.wrapT = THREE.RepeatWrapping;
  grainTexture.colorSpace = THREE.SRGBColorSpace;
  grainTexture.needsUpdate = true;
  const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, map: grainTexture, flatShading: true, roughness: 0.96, metalness: 0 });
  const forest = new THREE.Color('#3f5740'), tundra = new THREE.Color('#818351');
  const paleTundra = new THREE.Color('#a3a078'), rock = new THREE.Color('#888177'), lightRock = new THREE.Color('#b5a18a');
  const rgb = new THREE.Color();

  function makeTerrain(step) {
    const axis = (length) => { const result = []; for (let i = 0; i < length - 1; i += step) result.push(i); result.push(length - 1); return result; };
    const cols = axis(meta.width), rows = axis(meta.height), width = cols.length;
    const positions = new Float32Array(width * rows.length * 3), colors = new Float32Array(positions.length), uvs = new Float32Array(width * rows.length * 2), indices = [];
    for (let row = 0; row < rows.length; row++) for (let col = 0; col < width; col++) {
      const x = nw.x + cols[col] / (meta.width - 1) * (se.x - nw.x);
      const z = nw.z + rows[row] / (meta.height - 1) * (se.z - nw.z);
      const elevation = elevations[rows[row] * meta.width + cols[col]] / 10;
      const sample = (c, r) => elevations[Math.max(0, Math.min(meta.height - 1, r)) * meta.width + Math.max(0, Math.min(meta.width - 1, c))] / 10;
      const slope = Math.hypot(sample(cols[col] + 1, rows[row]) - sample(cols[col] - 1, rows[row]),
        sample(cols[col], rows[row] + 1) - sample(cols[col], rows[row] - 1)) / 60;
      const patch = Math.sin(x * 0.39 + Math.sin(z * 0.27) * 2) * Math.cos(z * 0.47 - x * 0.11);
      rgb.copy(forest).lerp(tundra, smooth((elevation - 1900) / 330));
      rgb.lerp(paleTundra, clamp((elevation - 2220) / 750 + patch * 0.1));
      const bare = clamp((slope - 0.25) * 1.9 + Math.max(0, elevation - 2460) / 650);
      rgb.lerp(rock, bare * 0.85).lerp(lightRock, bare * clamp(patch * 0.22 + (elevation - 2100) / 1400));
      rgb.multiplyScalar(0.98 + patch * 0.045 + Math.sin(elevation * 0.047) * bare * 0.018);
      const index = (row * width + col) * 3;
      positions[index] = x; positions[index + 1] = getHeight(x, z); positions[index + 2] = z;
      colors[index] = rgb.r; colors[index + 1] = rgb.g; colors[index + 2] = rgb.b;
      uvs[(row * width + col) * 2] = x * 0.7; uvs[(row * width + col) * 2 + 1] = z * 0.7;
      if (row < rows.length - 1 && col < width - 1) {
        const nextX = nw.x + cols[col + 1] / (meta.width - 1) * (se.x - nw.x);
        const nextZ = nw.z + rows[row + 1] / (meta.height - 1) * (se.z - nw.z);
        if (radius((x + nextX) / 2, (z + nextZ) / 2) <= 1) {
          const a = row * width + col;
          indices.push(a, a + width, a + 1, a + 1, a + width, a + width + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, terrainMaterial);
    mesh.name = step === 1 ? 'changbai-terrain-source-detail' : 'changbai-terrain-overview';
    mesh.userData = { sourceSampleStep: step, peripheralDisplayTaper: true };
    mesh.castShadow = true; mesh.receiveShadow = true;
    terrainGroup.add(mesh);
    return mesh;
  }
  const coarse = makeTerrain(2);
  let detailed = null;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 128), new THREE.MeshStandardMaterial({ color: '#3c4b43', roughness: 1 }));
  base.name = 'changbai-display-base';
  base.scale.set(rx, 1, rz); base.position.set(cx, -0.25, cz); base.receiveShadow = true;
  group.add(base);

  const waterGeometry = new THREE.BufferGeometry();
  const waterPositions = Float32Array.from(shoreline.flatMap(p => [p.x, lakeLevel, p.z]));
  const waterIndices = [];
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(shoreline.map(p => new THREE.Vector2(p.x, p.z)), [])) {
    const cross = (shoreline[b].x - shoreline[a].x) * (shoreline[c].z - shoreline[a].z) - (shoreline[b].z - shoreline[a].z) * (shoreline[c].x - shoreline[a].x);
    waterIndices.push(...(cross > 0 ? [a, c, b] : [a, b, c]));
  }
  waterGeometry.setAttribute('position', new THREE.BufferAttribute(waterPositions, 3));
  waterGeometry.setIndex(waterIndices); waterGeometry.computeVertexNormals();
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, deepColor: { value: new THREE.Color('#0e4b75') }, skyColor: { value: new THREE.Color('#3a7e9b') } },
    vertexShader: `varying vec3 worldPoint;
      void main(){vec4 world=modelMatrix*vec4(position,1.0);worldPoint=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader: `uniform float time;uniform vec3 deepColor;uniform vec3 skyColor;varying vec3 worldPoint;
      void main(){
        float wave=sin(worldPoint.x*5.1+worldPoint.z*2.7+time*0.48+sin(worldPoint.x*0.67+worldPoint.z*0.53)*0.8)*0.7+sin(worldPoint.x*8.3+worldPoint.z*4.1-time*0.7)*0.3;
        vec3 normal=normalize(vec3(wave*0.008,1.0,wave*0.004));
        vec3 viewDirection=normalize(cameraPosition-worldPoint);
        float fresnel=pow(1.0-max(0.0,dot(normal,viewDirection)),3.0);
        vec3 color=mix(deepColor,skyColor,0.10+fresnel*0.48)+wave*0.002;
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: false,
  });
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.name = 'tianchi-lake'; water.userData = { source: shore.source, measuredBathymetry: false };
  group.add(water);
  let disposed = false;
  return {
    group, bounds, lakeCenter, lakeLevel, lakeBounds, toWorld, getHeight, sourceElevation, elevationToWorld, isLake, peripheralFactor,
    sourceData: { metadata: meta, elevations, lake: shore },
    setDetailGeometry(geometry) {
      if (disposed || detailed) { geometry.dispose(); return; }
      detailed = new THREE.Mesh(geometry, terrainMaterial);
      detailed.name = 'changbai-terrain-source-detail';
      detailed.userData = { sourceSampleStep: 1, peripheralDisplayTaper: true };
      detailed.castShadow = detailed.receiveShadow = true;
      detailed.visible = false;
      terrainGroup.add(detailed);
    },
    buildDetail() {
      if (!disposed && !detailed) { detailed = makeTerrain(1); detailed.visible = false; }
    },
    update(camera, time = 0) {
      if (disposed) return false;
      waterMaterial.uniforms.time.value = time;
      const distance = camera.position.distanceTo(lakeCenter);
      const near = distance < (detailed?.visible ? 110 : 90);
      if (near && !detailed && !deferDetail) detailed = makeTerrain(1);
      const useDetail = near && !!detailed;
      const changed = coarse.visible === useDetail;
      coarse.visible = !useDetail;
      if (detailed) detailed.visible = useDetail;
      return changed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set(), materials = new Set();
      group.traverse(object => { if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); grainTexture.dispose();
    },
  };
}

export async function createChangbaiModel({ signal } = {}) {
  const response = await fetch(demUrl, { signal });
  if (!response.ok) throw new Error(`Changbai DEM loading failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== metadata.width * metadata.height * 2) throw new Error('Changbai DEM dimensions do not match');
  const view = new DataView(buffer);
  const elevations = Uint16Array.from({ length: buffer.byteLength / 2 }, (_, index) => view.getUint16(index * 2, true));
  return buildChangbaiModel({ metadata, elevations, lake, deferDetail: true });
}
