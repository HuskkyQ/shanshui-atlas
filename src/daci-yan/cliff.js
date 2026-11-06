import * as THREE from 'three';
import {
  DACI_LAYOUT, cliffTopY, cliffFaceZ, cliffMeshFrontZ, cliffBackX, cliffBackZ,
} from './layout.js';

const MIN_X = DACI_LAYOUT.cliff.minX;
const MAX_X = DACI_LAYOUT.cliff.maxX;
const GRID_X = 200;
const GRID_Y = 106;

function hash(a, b) {
  const value = Math.sin(a * 127.1 + b * 311.7 + 19.3) * 43758.5453;
  return value - Math.floor(value);
}

function rockColor(x, y) {
  const color = new THREE.Color('#505955');
  const grain = hash(Math.floor(x / 2.6), Math.floor(y / 2.8));
  const warm = 0.09 + 0.13 * hash(Math.floor(x / 9), Math.floor(y / 11));
  color.lerp(new THREE.Color('#967252'), warm);
  color.lerp(new THREE.Color('#30383a'), 0.08 + (1 - grain) * 0.13);
  const highMass = Math.max(0, 1 - Math.abs(x - 17) / 34) * THREE.MathUtils.smoothstep(y, 36, 86);
  color.lerp(new THREE.Color('#8e765f'), highMass * .23);
  const paleFan = Math.max(0, 1 - Math.abs(y - 27) / 12)
    * Math.max(0, 1 - Math.abs(x + 4) / 27);
  color.lerp(new THREE.Color('#aaa795'), paleFan * .4);
  const gaussian = (value, center, radius) => Math.exp(-(((value - center) / radius) ** 2));
  const belowRidge = cliffTopY(x) - y;
  const ridgePatch = Math.max(
    gaussian(x, -55, 12),
    gaussian(x, -33, 6.5),
    gaussian(x, 39, 12),
  ) * gaussian(belowRidge, 6, 6);
  const gullyPatch = (gaussian(x - y * .018, 30, 6.5) + .65 * gaussian(x, 46, 9))
    * THREE.MathUtils.smoothstep(y, 28, 48) * (1 - THREE.MathUtils.smoothstep(y, 86, 98));
  color.lerp(new THREE.Color('#294033'), Math.min(.34, ridgePatch * .24 + gullyPatch * .18));
  color.multiplyScalar(.84 + grain * .24);
  return color;
}

function createRockGeometry() {
  const positions = [];
  const colors = [];
  const indices = [];
  const rowSize = GRID_X + 1;
  const layerSize = rowSize * (GRID_Y + 1);
  const vertex = (face, row, column) => face * layerSize + row * rowSize + column;

  for (let face = 0; face < 2; face += 1) {
    for (let row = 0; row <= GRID_Y; row += 1) {
      const t = row / GRID_Y;
      for (let column = 0; column <= GRID_X; column += 1) {
        const x = THREE.MathUtils.lerp(MIN_X, MAX_X, column / GRID_X);
        const top = cliffTopY(x);
        const y = t * top;
        const worldX = face === 0 ? x : cliffBackX(x, y);
        const z = face === 0 ? cliffMeshFrontZ(x, y) : cliffBackZ(x, y);
        positions.push(worldX, y, z);
        const color = rockColor(x, y);
        colors.push(color.r, color.g, color.b);
      }
    }
  }

  for (let row = 0; row < GRID_Y; row += 1) {
    for (let column = 0; column < GRID_X; column += 1) {
      const a = vertex(0, row, column);
      const b = vertex(0, row, column + 1);
      const c = vertex(0, row + 1, column + 1);
      const d = vertex(0, row + 1, column);
      const ab = vertex(1, row, column);
      const bb = vertex(1, row, column + 1);
      const cb = vertex(1, row + 1, column + 1);
      const db = vertex(1, row + 1, column);
      indices.push(a, b, c, a, c, d, ab, cb, bb, ab, db, cb);
    }
  }
  for (let column = 0; column < GRID_X; column += 1) {
    const f0 = vertex(0, 0, column), f1 = vertex(0, 0, column + 1);
    const b0 = vertex(1, 0, column), b1 = vertex(1, 0, column + 1);
    indices.push(f1, f0, b0, f1, b0, b1);
    const ft0 = vertex(0, GRID_Y, column), ft1 = vertex(0, GRID_Y, column + 1);
    const bt0 = vertex(1, GRID_Y, column), bt1 = vertex(1, GRID_Y, column + 1);
    indices.push(ft0, ft1, bt0, ft1, bt1, bt0);
  }
  for (let row = 0; row < GRID_Y; row += 1) {
    const fl0 = vertex(0, row, 0), fl1 = vertex(0, row + 1, 0);
    const bl0 = vertex(1, row, 0), bl1 = vertex(1, row + 1, 0);
    indices.push(fl0, fl1, bl0, fl1, bl1, bl0);
    const fr0 = vertex(0, row, GRID_X), fr1 = vertex(0, row + 1, GRID_X);
    const br0 = vertex(1, row, GRID_X), br1 = vertex(1, row + 1, GRID_X);
    indices.push(fr1, fr0, br0, fr1, br0, br1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = { closedSolid: true, profile: 'cliffMeshFrontZ', grid: [GRID_X, GRID_Y] };
  return geometry;
}

function createFissures() {
  const positions = [];
  const indices = [];
  const lines = [
    [-58, 8, 47, .7], [-44, 34, 62, .55], [-17, 45, 74, .65],
    [-5, 47, 86, .72], [8, 39, 96, .85], [22, 31, 102, .9],
    [35, 22, 92, .75], [44, 12, 75, .6],
  ];
  lines.forEach(([baseX, bottom, top, drift], lineIndex) => {
    const count = 10;
    for (let i = 0; i < count; i += 1) {
      const t = i / (count - 1);
      const y = THREE.MathUtils.lerp(bottom, Math.min(top, cliffTopY(baseX) - 0.2), t);
      const x = baseX + Math.sin(i * 1.7 + lineIndex) * drift * (0.2 + t * 0.8);
      const width = 0.035 + 0.025 * Math.sin(t * Math.PI);
      const start = positions.length / 3;
      positions.push(x - width, y, cliffMeshFrontZ(x - width, y) + 0.045,
        x + width, y, cliffMeshFrontZ(x + width, y) + 0.045);
      if (i) indices.push(start - 2, start, start + 1, start - 2, start + 1, start - 1);
    }
  });
  // Short, broken strata make the broad face read as layered rock without
  // adding another expensive surface or changing the shared profile sampler.
  const strata = [
    [-68, -48, 7], [-43, -22, 18], [-12, 10, 27], [22, 44, 36],
    [-62, -43, 42], [-27, -7, 56], [2, 24, 70], [20, 43, 86],
  ];
  strata.forEach(([fromX, toX, y], bandIndex) => {
    const count = 7;
    for (let i = 0; i < count - 1; i += 1) {
      const t0 = i / (count - 1);
      const t1 = (i + 1) / (count - 1);
      const x0 = THREE.MathUtils.lerp(fromX, toX, t0);
      const x1 = THREE.MathUtils.lerp(fromX, toX, t1);
      const y0 = y + Math.sin(i * 1.9 + bandIndex) * 0.22;
      const y1 = y + Math.sin((i + 1) * 1.9 + bandIndex) * 0.22;
      const width = 0.025 + 0.015 * Math.sin((i + 1) * 1.2) ** 2;
      const start = positions.length / 3;
      positions.push(x0, y0 - width, cliffMeshFrontZ(x0, y0 - width) + 0.048,
        x1, y1 - width, cliffMeshFrontZ(x1, y1 - width) + 0.048,
        x1, y1 + width, cliffMeshFrontZ(x1, y1 + width) + 0.048,
        x0, y0 + width, cliffMeshFrontZ(x0, y0 + width) + 0.048);
      indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: '#3f403b', roughness: 1, transparent: true, opacity: 0.4,
    depthWrite: false, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'cliff-fissures';
  mesh.userData = { decorative: true, approximation: 'vertical-fractured-ribs' };
  return mesh;
}

function createForest() {
  const group = new THREE.Group();
  group.name = 'daci-forest';
  const trees = [];
  const approach = [[-66, 31], [-61, 26], [-54, 22], [-46, 22.5], [-39, 26], [-35, 28.5]];
  const approachY = (x) => {
    if (x < approach[0][0] || x > approach.at(-1)[0]) return null;
    for (let i = 0; i < approach.length - 1; i += 1) {
      const [x0, y0] = approach[i], [x1, y1] = approach[i + 1];
      if (x > x1) continue;
      const t = (x - x0) / (x1 - x0);
      return THREE.MathUtils.lerp(y0, y1, t);
    }
    return null;
  };
  const addCluster = (count, minX, maxX, minY, maxY, seed) => {
    for (let i = 0; i < count; i += 1) {
      const x = THREE.MathUtils.lerp(minX, maxX, hash(seed, i * 1.31));
      let y = THREE.MathUtils.lerp(minY, maxY, hash(seed + 7.1, i * 2.17));
      // Keep the photographed low stone-railed approach legible as it bends
      // through the left valley towards the compound.
      const pathY = approachY(x);
      if (pathY !== null && y > pathY - 3 && y < pathY + 3.5) y = Math.max(1, pathY - 4.8);
      const height = 2.6 + hash(seed + 13.7, i * 2.93) * 3.4;
      trees.push([x, y, height]);
    }
  };
  const addRidgeShrubs = (count, minX, maxX, minDepth, maxDepth, seed) => {
    for (let i = 0; i < count; i += 1) {
      const x = THREE.MathUtils.lerp(minX, maxX, hash(seed, i * 1.43));
      const depth = THREE.MathUtils.lerp(minDepth, maxDepth, hash(seed + 5.2, i * 2.31));
      const y = Math.max(2, cliffTopY(x) - depth);
      const height = 1.2 + hash(seed + 10.4, i * 3.17) * 1.5;
      trees.push([x, y, height, true]);
    }
  };
  const addBackCluster = (count, minX, maxX, minHeight, maxHeight, seed) => {
    for (let i = 0; i < count; i += 1) {
      const x = THREE.MathUtils.lerp(minX, maxX, hash(seed, i * 1.37));
      const heightRatio = THREE.MathUtils.lerp(minHeight, maxHeight, hash(seed + 6.4, i * 2.19));
      const y = Math.max(1.5, cliffTopY(x) * heightRatio);
      const height = 1.7 + hash(seed + 11.8, i * 3.07) * 2.9;
      trees.push([x, y, height, heightRatio > .72, true]);
    }
  };
  // Dense, connected forest occupies the low foreground and the left valley.
  // The compound band (x=-50..-15, y=27..46) remains open for architecture.
  addCluster(18, -88, -76, 1, 12, .9);
  addCluster(24, -78, -68, 1, 15, 1.3);
  addCluster(62, -69, -48, 1, 9, 2.1);
  addCluster(86, -67, -47, 20, 40, 6.3);
  addCluster(50, -58, -43, 40, 54, 9.7);
  addCluster(80, -47, -22, 1, 18, 11.2);
  addCluster(98, -28, 17, 0, 13, 15.3);
  addCluster(36, 10, 42, 2, 18, 19.4);
  addCluster(24, 42, 59, 1, 17, 21.6);
  addCluster(18, 58, 74, 1, 14, 23.1);
  addCluster(20, 34, 48, 20, 43, 24.8);
  // Connected growth bands trace the right gullies without leaving isolated
  // crowns suspended on otherwise bare rock.
  addCluster(22, 27, 36, 36, 79, 32.1);
  addCluster(13, 42, 49, 39, 70, 36.5);
  addRidgeShrubs(14, -62, -49, 3, 10, 40.1);
  addRidgeShrubs(10, -39, -29, 3, 8, 43.7);
  addRidgeShrubs(18, 29, 47, 4, 12, 47.3);
  // The modelled visible section of the left approach disappears behind this
  // small rock-corner thicket. Keep it local so the preceding stone walk and
  // the compound facade remain readable.
  const approachEndShrubs = [
    [-41.55, 25.05, 2.55], [-41.2, 25.55, 2.8], [-40.85, 25.8, 2.65],
    [-40.5, 26.1, 2.9], [-40.15, 26.55, 2.5], [-39.85, 27, 2.7],
  ];
  approachEndShrubs.forEach(([x, y, height]) => trees.push([x, y, height, true, false, true]));
  const frontTreeCount = trees.length;
  // Sparse rear growth follows the generated slope. Keeping the left edge
  // light preserves the valley opening instead of masking it with foliage.
  addBackCluster(18, -63, -39, .18, .66, 52.1);
  addBackCluster(34, -35, 18, .12, .72, 57.7);
  addBackCluster(28, 14, 52, .16, .76, 63.2);
  addBackCluster(16, 48, 73, .12, .61, 68.8);
  const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.25, 2.2, 5);
  const foliageGeometry = new THREE.IcosahedronGeometry(1, 1);
  const crownVertices = foliageGeometry.getAttribute('position');
  for (let i = 0; i < crownVertices.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(crownVertices, i);
    const radius = .85 + hash(p.x * 13 + p.z * 7, p.y * 11) * .3;
    crownVertices.setXYZ(i, p.x * radius, p.y * radius, p.z * radius);
  }
  foliageGeometry.computeVertexNormals();
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: '#554331', roughness: 1 });
  const foliageMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, trees.length);
  const canopyInstances = [];
  trees.forEach(([x, y, height, shrub, back, approachEnd], index) => {
    const clusterSize = shrub ? 2 : 2 + (hash(index, 33) > 0.42 ? 1 : 0);
    for (let part = 0; part < clusterSize; part += 1) {
      canopyInstances.push({
        x: x + (hash(index + 4.2, part * 2.1) - 0.5) * 1.4,
        y: y + (hash(index + 8.4, part * 2.7) - 0.5) * 0.9,
        height,
        index,
        shrub,
        back,
        approachEnd,
      });
    }
  });
  const foliage = new THREE.InstancedMesh(foliageGeometry, foliageMaterial, canopyInstances.length);
  const matrix = new THREE.Matrix4();
  const scale = new THREE.Vector3();
  const green = new THREE.Color();
  trees.forEach(([x, rawY, height, , back], index) => {
    // Keep each root on the sampled mountain rather than above a shoulder's top line.
    const y = Math.min(rawY, cliffTopY(x) - 2);
    const worldX = back ? cliffBackX(x, y) : x;
    const ground = back ? cliffBackZ(x, y) - 0.22 : cliffMeshFrontZ(x, y) + 0.22;
    const trunkHeight = height * (0.12 + hash(index, 29) * 0.13);
    scale.set(0.78 + hash(index, 8) * 0.48, trunkHeight / 2.2, 0.78 + hash(index, 9) * 0.48);
    matrix.compose(new THREE.Vector3(worldX, y + trunkHeight / 2, ground), new THREE.Quaternion(), scale);
    trunks.setMatrixAt(index, matrix);
  });
  canopyInstances.forEach(({ x, y, height, index, shrub, back, approachEnd }, canopyIndex) => {
    const rootY = Math.min(y, cliffTopY(x) - .6);
    const worldX = back ? cliffBackX(x, rootY) : x;
    const ground = back ? cliffBackZ(x, rootY) - 0.22
      : cliffMeshFrontZ(x, rootY) + (approachEnd ? 0.62 : 0.22);
    const sway = (hash(index, 4) - 0.5) * 0.45;
    const crownScale = approachEnd ? .85 : shrub ? .55 : .82;
    scale.set((1.25 + hash(index + canopyIndex, 15) * 1.1) * crownScale,
      (0.72 + hash(index + canopyIndex, 16) * 0.7) * crownScale,
      (1.2 + hash(index + canopyIndex, 17) * 1.1) * crownScale);
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      hash(canopyIndex, 41) * .4, hash(canopyIndex, 42) * Math.PI, hash(canopyIndex, 43) * .35));
    matrix.compose(new THREE.Vector3(worldX + sway, rootY + height * 0.2, ground), rotation, scale);
    foliage.setMatrixAt(canopyIndex, matrix);
    green.setHSL(0.28 + hash(index, 22) * 0.07, 0.46 + hash(index, 23) * 0.2, 0.04 + hash(index, 24) * 0.05);
    foliage.setColorAt(canopyIndex, green);
  });
  trunks.instanceMatrix.needsUpdate = true;
  foliage.instanceMatrix.needsUpdate = true;
  foliage.instanceColor.needsUpdate = true;
  trunks.name = 'forest-trunks';
  foliage.name = 'forest-canopy';
  group.add(trunks, foliage);
  group.userData = {
    decorative: true,
    treeCount: trees.length,
    frontTreeCount,
    backTreeCount: trees.length - frontTreeCount,
    approachEndShrubCount: approachEndShrubs.length,
    rootProfiles: ['cliffMeshFrontZ', 'cliffBackZ'],
  };
  return group;
}

export function createDaciCliffModel() {
  const group = new THREE.Group();
  group.name = 'daci-cliff';
  group.userData = { kind: 'artistic-approximation', sourceBoundary: 'official-photo-guided' };
  const rock = new THREE.Mesh(createRockGeometry(), new THREE.MeshStandardMaterial({
    color: '#fff', vertexColors: true, roughness: 0.97, flatShading: true,
  }));
  rock.name = 'cliff-rock';
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.userData = { closedSolid: true, approx: true, profile: 'cliffMeshFrontZ' };
  const fissures = createFissures();
  const forest = createForest();
  group.add(rock, fissures, forest);
  const anchors = {
    cliff: new THREE.Vector3(0, 39, cliffFaceZ(0, 39) + 0.25),
    forest: new THREE.Vector3(-54, 30, cliffFaceZ(-54, 30) + 0.5),
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const geometries = new Set();
    const materials = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).filter(Boolean)
        .forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  };
  return { group, anchors, dispose };
}
