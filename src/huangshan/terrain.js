import * as THREE from 'three';
import terrainUrl from '../data/huangshan-dem.bin?url';
import metadata from '../data/huangshan-dem.json';

// Preserve the original scene coordinates while extending the DEM westward.
const ORIGIN_LON = 118.16291666666666;
const ORIGIN_LAT = 30.12847222222222;
const LON_SCALE = 24 / (118.19180555555556 - 118.13402777777777);
const LAT_SCALE = 23.4 / (30.152916666666666 - 30.104027777777777);
const WEST_X = (metadata.west - ORIGIN_LON) * LON_SCALE;
const NORTH_Z = (ORIGIN_LAT - metadata.north) * LAT_SCALE;
const WIDTH = (metadata.east - metadata.west) * LON_SCALE;
const DEPTH = (metadata.north - metadata.south) * LAT_SCALE;
const BASE_ELEVATION = 585;
const HEIGHT_SCALE = 0.0083;
const BASE_Y = -0.3;
const clamp = THREE.MathUtils.clamp;

export async function createTerrain() {
  const response = await fetch(terrainUrl);
  if (!response.ok) throw new Error(`DEM loading failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const { width, height } = metadata;
  if (buffer.byteLength !== width * height * 2) throw new Error('DEM dimensions do not match metadata');

  const view = new DataView(buffer);
  const elevation = (x, z) => view.getUint16((z * width + x) * 2, true) / 10;
  const worldY = (metres) => 0.16 + (metres - BASE_ELEVATION) * HEIGHT_SCALE;

  function getHeight(x, z) {
    const u = clamp((x - WEST_X) / WIDTH * (width - 1), 0, width - 1);
    const v = clamp((z - NORTH_Z) / DEPTH * (height - 1), 0, height - 1);
    const x0 = Math.floor(u);
    const z0 = Math.floor(v);
    const x1 = Math.min(x0 + 1, width - 1);
    const z1 = Math.min(z0 + 1, height - 1);
    const tx = u - x0;
    const tz = v - z0;
    const north = THREE.MathUtils.lerp(elevation(x0, z0), elevation(x1, z0), tx);
    const south = THREE.MathUtils.lerp(elevation(x0, z1), elevation(x1, z1), tx);
    return worldY(THREE.MathUtils.lerp(north, south, tz));
  }

  const positions = [];
  const colors = [];
  const indices = [];
  const forest = new THREE.Color('#29473e');
  const brightForest = new THREE.Color('#4c695b');
  const granite = new THREE.Color('#3e5557');
  const paleGranite = new THREE.Color('#81958e');

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const metres = elevation(x, z);
      const slope = Math.hypot(
        elevation(Math.min(x + 1, width - 1), z) - elevation(Math.max(x - 1, 0), z),
        elevation(x, Math.min(z + 1, height - 1)) - elevation(x, Math.max(z - 1, 0)),
      ) / 60;
      const high = clamp((metres - 850) / 1000, 0, 1);
      const bareRock = clamp((metres - 1370) / 430 + slope * 0.62, 0, 1);
      const color = forest.clone().lerp(brightForest, high * 0.9)
        .lerp(granite.clone().lerp(paleGranite, high * 0.72), bareRock);
      const shade = 0.94 + Math.sin(x * 2.7 + z * 4.1) * 0.035;
      color.multiplyScalar(shade);

      positions.push(WEST_X + x / (width - 1) * WIDTH, worldY(metres), NORTH_Z + z / (height - 1) * DEPTH);
      colors.push(color.r, color.g, color.b);
      if (x < width - 1 && z < height - 1) {
        const a = z * width + x;
        indices.push(a, a + width, a + 1, a + 1, a + width, a + width + 1);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  surface.castShadow = true;
  surface.receiveShadow = true;

  const group = new THREE.Group();
  group.add(surface);

  const edge = [];
  for (let x = 0; x < width; x++) edge.push([x, 0]);
  for (let z = 1; z < height; z++) edge.push([width - 1, z]);
  for (let x = width - 2; x >= 0; x--) edge.push([x, height - 1]);
  for (let z = height - 2; z > 0; z--) edge.push([0, z]);
  const skirtPositions = [];
  const skirtIndices = [];
  edge.forEach(([x, z], i) => {
    const px = WEST_X + x / (width - 1) * WIDTH;
    const pz = NORTH_Z + z / (height - 1) * DEPTH;
    skirtPositions.push(px, worldY(elevation(x, z)), pz, px, BASE_Y, pz);
    const next = (i + 1) % edge.length;
    skirtIndices.push(i * 2, next * 2, i * 2 + 1, next * 2, next * 2 + 1, i * 2 + 1);
  });
  const skirtGeometry = new THREE.BufferGeometry();
  skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
  skirtGeometry.setIndex(skirtIndices);
  skirtGeometry.computeVertexNormals();
  group.add(new THREE.Mesh(skirtGeometry, new THREE.MeshStandardMaterial({ color: '#263d3e', roughness: 1, side: THREE.DoubleSide })));

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(WIDTH + 0.35, 0.62, DEPTH + 0.35),
    new THREE.MeshStandardMaterial({ color: '#203638', roughness: 1 }),
  );
  base.position.set(WEST_X + WIDTH / 2, BASE_Y - 0.31, NORTH_Z + DEPTH / 2);
  base.receiveShadow = true;
  group.add(base);

  return {
    group,
    getHeight,
    bounds: { minX: WEST_X, maxX: WEST_X + WIDTH, minZ: NORTH_Z, maxZ: NORTH_Z + DEPTH },
    toWorld(longitude, latitude) {
      return [(longitude - ORIGIN_LON) * LON_SCALE, (ORIGIN_LAT - latitude) * LAT_SCALE];
    },
  };
}
