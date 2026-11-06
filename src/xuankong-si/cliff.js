import * as THREE from 'three';
import { XUANKONG_LAYOUT, cliffFaceZ } from './layout.js';

const GRID_X = 56;
const GRID_Y = 52;

function rowHalfWidth(y) {
  const normalized = y / XUANKONG_LAYOUT.cliff.height;
  const middleMass = Math.exp(-(((y - 37) / 24) ** 2));
  const irregularity = 0.018 * Math.sin(normalized * Math.PI * 5.2)
    + 0.012 * Math.sin(normalized * Math.PI * 11.7 + 0.4)
    + 0.008 * Math.sin(normalized * Math.PI * 19.7
      + Math.sin(normalized * Math.PI * 7.1) * 1.2);
  return XUANKONG_LAYOUT.cliff.width * 0.5
    * Math.min(1, 0.86 + 0.12 * middleMass + irregularity);
}

function rockColor(x, y, isFront) {
  const base = new THREE.Color('#777265');
  const warm = new THREE.Color('#aa8f64');
  const cool = new THREE.Color('#545b58');
  const grain = 0.5 + 0.25 * Math.sin(x * 0.38 + y * 0.31)
    + 0.25 * Math.sin(x * 0.13 - y * 0.67 + 1.1);
  const broadBand = 0.5 + 0.5 * Math.sin(y * 0.24 - x * 0.075 + Math.sin(x * 0.19));
  const weatheredPatch = 0.5 + 0.5
    * Math.sin(x * 0.21 + Math.sin(y * 0.17))
    * Math.sin(y * 0.33 - x * 0.06);
  base.lerp(warm, 0.08 + grain * 0.26)
    .lerp(cool, 0.04 + (1 - broadBand) * 0.18 + weatheredPatch * 0.06);
  if (!isFront) base.multiplyScalar(0.78);
  return base;
}

function gridNoise(row, column) {
  const value = Math.sin(row * 91.733 + column * 47.211 + 3.17) * 43758.5453;
  return value - Math.floor(value);
}

function createCliffGeometry() {
  const { height, backZ } = XUANKONG_LAYOUT.cliff;
  const positions = [];
  const colors = [];
  const indices = [];
  const rowSize = GRID_X + 1;
  const layerSize = rowSize * (GRID_Y + 1);

  for (let face = 0; face < 2; face += 1) {
    for (let row = 0; row <= GRID_Y; row += 1) {
      for (let column = 0; column <= GRID_X; column += 1) {
        const rowFade = Math.sin(row / GRID_Y * Math.PI);
        const columnFade = Math.sin(column / GRID_X * Math.PI);
        const topDrop = row === GRID_Y
          ? 0.85 * (0.5 + 0.5 * Math.sin(column * 0.83 + 0.4))
            * Math.sin(column / GRID_X * Math.PI)
          : 0;
        const y = row / GRID_Y * height - topDrop
          + (gridNoise(row, column) - 0.5) * 0.84 * rowFade;
        const halfWidth = rowHalfWidth(y);
        const x = THREE.MathUtils.lerp(-halfWidth, halfWidth, column / GRID_X)
          + (gridNoise(column + 61, row + 17) - 0.5) * 0.48 * columnFade;
        const z = face === 0 ? cliffFaceZ(x, y) : backZ;
        positions.push(x, y, z);
        const color = rockColor(x, y, face === 0);
        colors.push(color.r, color.g, color.b);
      }
    }
  }

  const front = (row, column) => row * rowSize + column;
  const back = (row, column) => layerSize + row * rowSize + column;
  for (let row = 0; row < GRID_Y; row += 1) {
    for (let column = 0; column < GRID_X; column += 1) {
      const a = front(row, column);
      const b = front(row, column + 1);
      const c = front(row + 1, column + 1);
      const d = front(row + 1, column);
      const ab = back(row, column);
      const bb = back(row, column + 1);
      const cb = back(row + 1, column + 1);
      const db = back(row + 1, column);
      if ((row + column) % 2 === 0) {
        indices.push(a, b, c, a, c, d);
        indices.push(ab, cb, bb, ab, db, cb);
      } else {
        indices.push(a, b, d, b, c, d);
        indices.push(ab, db, bb, bb, db, cb);
      }
    }
  }

  for (let column = 0; column < GRID_X; column += 1) {
    const f0 = front(0, column), f1 = front(0, column + 1);
    const b0 = back(0, column), b1 = back(0, column + 1);
    indices.push(f1, f0, b0, f1, b0, b1);

    const ft0 = front(GRID_Y, column), ft1 = front(GRID_Y, column + 1);
    const bt0 = back(GRID_Y, column), bt1 = back(GRID_Y, column + 1);
    indices.push(ft0, ft1, bt0, ft1, bt1, bt0);
  }

  for (let row = 0; row < GRID_Y; row += 1) {
    const fl0 = front(row, 0), fl1 = front(row + 1, 0);
    const bl0 = back(row, 0), bl1 = back(row + 1, 0);
    indices.push(fl0, fl1, bl0, fl1, bl1, bl0);

    const fr0 = front(row, GRID_X), fr1 = front(row + 1, GRID_X);
    const br0 = back(row, GRID_X), br1 = back(row + 1, GRID_X);
    indices.push(fr1, fr0, br0, fr1, br0, br1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    closedSolid: true,
    profile: 'cliffFaceZ',
    grid: [GRID_X, GRID_Y],
  };
  return geometry;
}

function createCrack(name, x, bottomY, topY, drift, material) {
  const points = 9;
  const positions = [];
  const indices = [];
  for (let index = 0; index < points; index += 1) {
    const t = index / (points - 1);
    const y = THREE.MathUtils.lerp(bottomY, topY, t);
    const centerX = x + Math.sin(index * 1.73 + x) * drift * (0.35 + t * 0.65);
    const width = 0.045 + 0.04 * Math.sin((index + 1) * 0.91) ** 2;
    const z = cliffFaceZ(centerX, y) + 0.035;
    positions.push(centerX - width, y, z, centerX + width, y, z);
    if (index < points - 1) {
      const offset = index * 2;
      indices.push(offset, offset + 1, offset + 3, offset, offset + 3, offset + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const crack = new THREE.Mesh(geometry, material);
  crack.name = name;
  crack.userData = { decorative: true, approximation: 'merged-rock-fissure' };
  crack.renderOrder = 1;
  return crack;
}

function createCrackBranch(name, from, to, material) {
  const points = 6;
  const positions = [];
  const indices = [];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  const perpendicular = [-dy / length, dx / length];
  for (let index = 0; index < points; index += 1) {
    const t = index / (points - 1);
    const bend = Math.sin(t * Math.PI) * 0.16;
    const centerX = THREE.MathUtils.lerp(from[0], to[0], t) + perpendicular[0] * bend;
    const centerY = THREE.MathUtils.lerp(from[1], to[1], t) + perpendicular[1] * bend;
    const width = 0.028 + Math.sin(t * Math.PI) * 0.018;
    for (const side of [-1, 1]) {
      const x = centerX + perpendicular[0] * width * side;
      const y = centerY + perpendicular[1] * width * side;
      positions.push(x, y, cliffFaceZ(x, y) + 0.036);
    }
    if (index < points - 1) {
      const offset = index * 2;
      indices.push(offset, offset + 1, offset + 3, offset, offset + 3, offset + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const branch = new THREE.Mesh(geometry, material);
  branch.name = name;
  branch.userData = { decorative: true, approximation: 'short-fissure-branch' };
  branch.renderOrder = 1;
  return branch;
}

/**
 * Builds one closed, west-backed cliff for the temple scene. This is a
 * photo-guided artistic surface, not surveyed terrain or a DEM reconstruction.
 */
export function createCliffModel() {
  const group = new THREE.Group();
  group.name = 'xuankong-cliff';
  group.userData = {
    kind: 'artistic-approximation',
    scope: 'single-west-cliff-only',
    sourceBoundary: 'photo-guided-profile-no-survey-or-dem',
    coordinateSystem: '+x-south-to-north +z-east-front +y-up',
  };

  const rockMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const rock = new THREE.Mesh(createCliffGeometry(), rockMaterial);
  rock.name = 'cliff-rock';
  rock.castShadow = true;
  rock.receiveShadow = true;
  rock.userData = {
    closedSolid: true,
    closeSolid: true,
    approx: true,
    profile: 'cliffFaceZ',
  };

  const crackMaterial = new THREE.MeshStandardMaterial({
    color: '#55534b',
    roughness: 1,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
    side: THREE.DoubleSide,
  });
  const cracks = new THREE.Group();
  cracks.name = 'cliff-fissures';
  cracks.userData = { decorative: true, mergedCount: 7 };
  cracks.add(
    createCrack('cliff-fissure-south-high', -22, 34, 56, 1.05, crackMaterial),
    createCrackBranch('cliff-fissure-south-branch', [-22.7, 46], [-18.5, 49], crackMaterial),
    createCrack('cliff-fissure-south-low', -13, 8, 25, 0.72, crackMaterial),
    createCrack('cliff-fissure-niche', 3, 19, 29, 0.44, crackMaterial),
    createCrack('cliff-fissure-north-mid', 20, 25, 48, 0.88, crackMaterial),
    createCrackBranch('cliff-fissure-north-branch', [20.5, 37], [23.8, 40], crackMaterial),
    createCrack('cliff-fissure-north-edge', 29, 7, 31, 0.94, crackMaterial),
  );
  group.add(rock, cracks);

  const anchors = {
    cliff: new THREE.Vector3(0, 39, cliffFaceZ(0, 39) + 0.25),
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const geometries = new Set();
    const materials = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const entries = Array.isArray(object.material) ? object.material : [object.material];
      entries.filter(Boolean).forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  };

  return { group, anchors, dispose };
}
