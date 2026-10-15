import * as THREE from 'three';
import terrainUrl from '../data/west-lake-dem.bin?url';
import waterUrl from '../data/west-lake-water.bin?url';
import metadata from '../data/west-lake-dem.json';
import shoreline from '../data/west-lake-shore.json';

const ORIGIN_LON = (metadata.west + metadata.east) / 2;
const ORIGIN_LAT = (metadata.north + metadata.south) / 2;
const LON_SCALE = 111320 * Math.cos(ORIGIN_LAT * Math.PI / 180) * metadata.horizontalScale;
const LAT_SCALE = 111320 * metadata.horizontalScale;
const WIDTH = (metadata.east - metadata.west) * LON_SCALE;
const DEPTH = (metadata.north - metadata.south) * LAT_SCALE;
const HEIGHT_SCALE = metadata.horizontalScale * metadata.verticalExaggeration;
const BASE_Y = -0.65;
const clamp = THREE.MathUtils.clamp;
const worldY = (metres) => 0.15 + metres * HEIGHT_SCALE;
const toWorld = (longitude, latitude) => [(longitude - ORIGIN_LON) * LON_SCALE, (ORIGIN_LAT - latitude) * LAT_SCALE];

export async function createWestLakeTerrain() {
  const responses = await Promise.all([fetch(terrainUrl), fetch(waterUrl)]);
  if (responses.some((response) => !response.ok)) throw new Error('West Lake terrain data loading failed');
  const [buffer, maskBuffer] = await Promise.all(responses.map((response) => response.arrayBuffer()));
  const { width, height, lakeElevation } = metadata;
  if (buffer.byteLength !== width * height * 2 || maskBuffer.byteLength !== width * height) {
    throw new Error('West Lake terrain dimensions do not match metadata');
  }
  const values = new DataView(buffer);
  const waterMask = new Uint8Array(maskBuffer);
  const displayedCells = new Map();
  const elevation = (x, z) => values.getInt16((z * width + x) * 2, true) / 10;
  // Only the rendered lake bed is lowered; the saved DEM stays unmodified.
  const ground = (x, z) => waterMask[z * width + x] ? lakeElevation - 3 : elevation(x, z);
  function gridPoint(x, z) {
    return [clamp((x / WIDTH + 0.5) * (width - 1), 0, width - 1), clamp((z / DEPTH + 0.5) * (height - 1), 0, height - 1)];
  }
  function getHeight(x, z) {
    const [u, v] = gridPoint(x, z);
    const x0 = Math.floor(u), z0 = Math.floor(v);
    const x1 = Math.min(x0 + 1, width - 1), z1 = Math.min(z0 + 1, height - 1);
    const cell = displayedCells.get(z0 * width + x0);
    if (cell) {
      const u = clamp((x - cell.left) / (cell.right - cell.left) * 8, 0, 8);
      const v = clamp((z - cell.front) / (cell.back - cell.front) * 8, 0, 8);
      const col = Math.max(0, Math.min(7, Math.floor(u))), row = Math.max(0, Math.min(7, Math.floor(v)));
      const a = row * 9 + col;
      return triangleHeight(cell.heights[a], cell.heights[a + 1], cell.heights[a + 9], cell.heights[a + 10], u - col, v - row);
    }
    return triangleHeight(worldY(ground(x0, z0)), worldY(ground(x1, z0)),
      worldY(ground(x0, z1)), worldY(ground(x1, z1)), u - x0, v - z0);
  }
  const isWater = (x, z) => {
    const [u, v] = gridPoint(x, z);
    return Boolean(waterMask[Math.round(v) * width + Math.round(u)]);
  };

  const positions = new Float32Array(width * height * 3);
  const colors = new Float32Array(positions.length);
  const indices = new Uint32Array((width - 1) * (height - 1) * 6);
  const lowland = new THREE.Color('#76867a');
  const forest = new THREE.Color('#31584a');
  const ridge = new THREE.Color('#638574');
  let triangle = 0;
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const index = z * width + x;
      const metres = elevation(x, z);
      positions.set([-WIDTH / 2 + x / (width - 1) * WIDTH, worldY(ground(x, z)), -DEPTH / 2 + z / (height - 1) * DEPTH], index * 3);
      const shade = 0.96 + Math.sin(x * 2.7 + z * 4.1) * 0.025;
      const color = lowland.clone().lerp(forest, clamp((metres - 15) / 65, 0, 1))
        .lerp(ridge, clamp((metres - 180) / 360, 0, 0.65)).multiplyScalar(shade);
      colors.set([color.r, color.g, color.b], index * 3);
      if (x < width - 1 && z < height - 1) {
        indices.set([index, index + width, index + 1, index + 1, index + width, index + width + 1], triangle);
        triangle += 6;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  const surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  surface.castShadow = surface.receiveShadow = true;
  const group = new THREE.Group();
  group.add(surface);

  const edge = [];
  for (let x = 0; x < width; x++) edge.push([x, 0]);
  for (let z = 1; z < height; z++) edge.push([width - 1, z]);
  for (let x = width - 2; x >= 0; x--) edge.push([x, height - 1]);
  for (let z = height - 2; z > 0; z--) edge.push([0, z]);
  const skirtPositions = [], skirtIndices = [];
  edge.forEach(([x, z], index) => {
    const px = -WIDTH / 2 + x / (width - 1) * WIDTH, pz = -DEPTH / 2 + z / (height - 1) * DEPTH;
    skirtPositions.push(px, worldY(ground(x, z)), pz, px, BASE_Y, pz);
    const next = (index + 1) % edge.length;
    skirtIndices.push(index * 2, next * 2, index * 2 + 1, next * 2, next * 2 + 1, index * 2 + 1);
  });
  const skirtGeometry = new THREE.BufferGeometry();
  skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
  skirtGeometry.setIndex(skirtIndices);
  skirtGeometry.computeVertexNormals();
  group.add(new THREE.Mesh(skirtGeometry, new THREE.MeshStandardMaterial({ color: '#2c4842', roughness: 1, side: THREE.DoubleSide })));
  const base = new THREE.Mesh(new THREE.BoxGeometry(WIDTH + 0.2, 0.45, DEPTH + 0.2), new THREE.MeshStandardMaterial({ color: '#203a37', roughness: 1 }));
  base.position.y = BASE_Y - 0.225;
  group.add(base);

  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, light: { value: 1 }, glintStrength: { value: 1 }, deep: { value: new THREE.Color('#285b63') }, pale: { value: new THREE.Color('#83b4ad') } },
    vertexShader: `varying vec2 lakePosition;
      void main() { lakePosition = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float time; uniform float light; uniform float glintStrength; uniform vec3 deep; uniform vec3 pale; varying vec2 lakePosition;
      void main() {
        float ripple = sin(lakePosition.x * 40.0 + lakePosition.y * 26.0 + time * 0.7)
          * sin(lakePosition.x * 9.0 - lakePosition.y * 17.0 + time * 0.3);
        float glint = pow(max(ripple, 0.0), 16.0);
        gl_FragColor = vec4(mix(deep, pale, 0.16 + glint * 0.35 * glintStrength) * light, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const waterY = worldY(lakeElevation) + 0.015;
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#9cbbae', transparent: true, opacity: 0.4 });
  shoreline.polygons.forEach(({ outer, holes }) => {
    const ringPoints = (ring) => ring.map(([longitude, latitude]) => {
      const [x, z] = toWorld(longitude, latitude);
      return new THREE.Vector2(x, -z);
    });
    const shape = new THREE.Shape(ringPoints(outer));
    shape.holes = holes.map((ring) => new THREE.Path(ringPoints(ring)));
    const lakeGeometry = new THREE.ShapeGeometry(shape);
    lakeGeometry.rotateX(-Math.PI / 2);
    const lake = new THREE.Mesh(lakeGeometry, waterMaterial);
    lake.name = 'west-lake-water';
    lake.position.y = waterY;
    group.add(lake);
    [outer, ...holes].forEach((ring) => {
      const points = ring.map(([longitude, latitude]) => {
        const [x, z] = toWorld(longitude, latitude);
        return new THREE.Vector3(x, waterY + 0.01, z);
      });
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), lineMaterial));
    });
  });
  function triangleHeight(a, b, c, d, x, z) {
    return x + z <= 1 ? a * (1 - x - z) + b * x + c * z
      : b * (1 - z) + c * (1 - x) + d * (x + z - 1);
  }

  function adjustGround(adjustment, bounds) {
    const vertices = geometry.getAttribute('position');
    const colors = geometry.getAttribute('color');
    const nextPositions = Array.from(vertices.array), nextColors = Array.from(colors.array), nextIndices = [];
    for (let row = 0; row < height - 1; row++) for (let col = 0; col < width - 1; col++) {
      const a = row * width + col, b = a + 1, c = a + width, d = c + 1;
      const left = vertices.getX(a), right = vertices.getX(b), front = vertices.getZ(a), back = vertices.getZ(c);
      const previous = displayedCells.get(a);
      if (right < bounds.minX || left > bounds.maxX || back < bounds.minZ || front > bounds.maxZ) {
        if (previous) {
          for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
            const p = previous.start + z * 9 + x;
            nextIndices.push(p, p + 9, p + 1, p + 1, p + 9, p + 10);
          }
        } else nextIndices.push(a, c, b, b, c, d);
        continue;
      }
      const start = nextPositions.length / 3;
      const heights = new Float32Array(81);
      for (let z = 0; z <= 8; z++) for (let x = 0; x <= 8; x++) {
        const worldX = THREE.MathUtils.lerp(left, right, x / 8), worldZ = THREE.MathUtils.lerp(front, back, z / 8);
        const y = previous ? previous.heights[z * 9 + x]
          : triangleHeight(vertices.getY(a), vertices.getY(b), vertices.getY(c), vertices.getY(d), x / 8, z / 8);
        const adjusted = adjustment(worldX, worldZ, y);
        heights[z * 9 + x] = adjusted;
        nextPositions.push(worldX, adjusted, worldZ);
        for (let channel = 0; channel < 3; channel++) nextColors.push(triangleHeight(
          colors.array[a * 3 + channel], colors.array[b * 3 + channel],
          colors.array[c * 3 + channel], colors.array[d * 3 + channel], x / 8, z / 8));
      }
      for (let z = 0; z < 8; z++) for (let x = 0; x < 8; x++) {
        const p = start + z * 9 + x;
        nextIndices.push(p, p + 9, p + 1, p + 1, p + 9, p + 10);
      }
      displayedCells.set(a, { left, right, front, back, heights, start });
    }
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(nextPositions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(nextColors, 3));
    geometry.setIndex(nextIndices);
    geometry.deleteAttribute('normal');
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }
  return { group, getHeight, adjustGround, toWorld, isWater, waterMaterial, waterHeight: waterY, width: WIDTH, depth: DEPTH,
    bounds: { minX: -WIDTH / 2, maxX: WIDTH / 2, minZ: -DEPTH / 2, maxZ: DEPTH / 2 } };
}
