import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TOWER_COUNT = 3;
const HOLE_COUNT = 5;

function surface(color, roughness = 0.88, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...options });
}

function transformed(geometry, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const result = geometry;
  result.deleteAttribute('uv');
  result.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  ));
  return result;
}

function mergedMesh(name, parts, material, userData = {}) {
  const geometry = mergeGeometries(parts, false);
  if (!geometry) throw new Error(`Unable to assemble ${name}`);
  parts.forEach((part) => part.dispose());
  geometry.computeVertexNormals();
  if (material.vertexColors) weatherStone(geometry);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData = { ...userData };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const BELLY_BOTTOM = 1.6;
const BELLY_TOP = 4.6;
const HOLE_Y = 3.1;
const HOLE_RADIUS = 0.45;
const WALL_DEPTH = 0.23;

function bellyRadius(y) {
  return 2.1 * Math.sqrt(1 - ((y - HOLE_Y) / 1.9) ** 2);
}

function weatherStone(geometry, heightOffset = 0) {
  const position = geometry.getAttribute('position');
  const colors = geometry.getAttribute('color');
  const values = [];
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index), y = position.getY(index) + heightOffset, z = position.getZ(index);
    const grain = 0.94 + 0.06 * Math.sin(x * x * 79 + y * 53 + z * 97);
    const patches = 0.88 + 0.12 * Math.sin(x * x * 2.3 + Math.sin(z * 3.1)) * Math.cos(y * 4.1 + z);
    const damp = 0.18 * Math.max(0, 1 - y / 1.4);
    const shade = grain * patches * (1 - damp);
    values.push(shade * (colors?.getX(index) ?? 1),
      shade * (1 + damp * 0.22) * (colors?.getY(index) ?? 1),
      shade * (1 - damp * 0.35) * (colors?.getZ(index) ?? 1));
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(values, 3));
  return geometry;
}

function stoneLathe(profile, detailed) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), detailed ? 64 : 20);
}

function createOpeningPanel(towerIndex, holeIndex, angle, materials, detailed) {
  const edgeSamples = detailed ? 12 : 5;
  const bands = detailed ? 10 : 4;
  const halfWidth = 2.1 * Math.PI / HOLE_COUNT;
  const corners = [[-halfWidth, BELLY_BOTTOM], [halfWidth, BELLY_BOTTOM],
    [halfWidth, BELLY_TOP], [-halfWidth, BELLY_TOP]];
  const border = [];
  for (let side = 0; side < 4; side += 1) {
    const from = new THREE.Vector2(...corners[side]);
    const to = new THREE.Vector2(...corners[(side + 1) % 4]);
    for (let sample = 0; sample < edgeSamples; sample += 1) {
      border.push(from.clone().lerp(to, sample / edgeSamples));
    }
  }
  const count = border.length;
  const positions = [], colors = [], indices = [];
  const pointOnWall = (u, y, depth) => {
    const phi = u / 2.1;
    const radius = bellyRadius(y) - depth;
    return [Math.sin(phi) * radius, y - HOLE_Y, Math.cos(phi) * radius - 2.1];
  };
  // Each curved sector is an annulus from the circular aperture to the
  // sector's rectangular parameter boundary. Adjacent sectors meet on the
  // same spherical profile; both inner and outer sheets leave the hole open.
  for (let sheet = 0; sheet < 2; sheet += 1) {
    for (let band = 0; band <= bands; band += 1) {
      border.forEach((outer) => {
        const direction = outer.clone().sub(new THREE.Vector2(0, HOLE_Y)).normalize();
        const inner = direction.multiplyScalar(HOLE_RADIUS).add(new THREE.Vector2(0, HOLE_Y));
        const point = inner.lerp(outer, band / bands);
        positions.push(...pointOnWall(point.x, point.y, sheet * WALL_DEPTH));
        colors.push(...(sheet ? [0.43, 0.43, 0.43] : [1, 1, 1]));
      });
    }
    const offset = sheet * (bands + 1) * count;
    for (let band = 0; band < bands; band += 1) {
      for (let sample = 0; sample < count; sample += 1) {
        const next = (sample + 1) % count;
        const a = offset + band * count + sample, b = offset + band * count + next;
        const c = a + count, d = b + count;
        indices.push(...(sheet ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
      }
    }
  }
  const boreOffset = positions.length / 3;
  for (let sheet = 0; sheet < 2; sheet += 1) {
    border.forEach((outer) => {
      const direction = outer.clone().sub(new THREE.Vector2(0, HOLE_Y)).normalize();
      positions.push(...pointOnWall(direction.x * HOLE_RADIUS, HOLE_Y + direction.y * HOLE_RADIUS, sheet * WALL_DEPTH));
      colors.push(0.58, 0.58, 0.58);
    });
  }
  for (let sample = 0; sample < count; sample += 1) {
    const next = (sample + 1) % count;
    const a = boreOffset + sample, b = boreOffset + next;
    indices.push(a, b, a + count, b, b + count, a + count);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  weatherStone(geometry, HOLE_Y);
  const panel = new THREE.Mesh(geometry, materials.stone);
  panel.name = `tower-${towerIndex}-through-hole-${holeIndex}`;
  panel.userData = { openingType: 'through-hole', towerIndex, holeIndex,
    localOpeningCenter: [0, 0, 0], openingRadius: HOLE_RADIUS };
  panel.position.set(Math.sin(angle) * 2.1, HOLE_Y, Math.cos(angle) * 2.1);
  panel.rotation.y = angle;
  panel.castShadow = panel.receiveShadow = true;
  return panel;
}

function carvedOpeningRim(angle, detailed) {
  const rim = new THREE.TorusGeometry(0.53, 0.055, detailed ? 6 : 3, detailed ? 48 : 16);
  const position = rim.getAttribute('position');
  for (let index = 0; index < position.count; index += 1) {
    const u = position.getX(index), v = position.getY(index);
    const phi = u / 2.1;
    const radius = bellyRadius(HOLE_Y + v);
    const relief = 0.012 * Math.cos(Math.atan2(v, u) * 12);
    position.setXYZ(index, Math.sin(phi) * radius, HOLE_Y + v,
      Math.cos(phi) * radius + position.getZ(index) + 0.015 + relief);
  }
  rim.rotateY(angle);
  return rim;
}

function createTower(towerIndex, position, rotation, materials, detailed = true) {
  const tower = new THREE.Group();
  tower.name = `santan-stone-tower-${towerIndex}`;
  tower.userData = { kind: 'bottle-shaped-stone-tower', holeCount: HOLE_COUNT, artisticLayout: true };
  tower.position.set(...position);
  tower.rotation.y = rotation;

  tower.add(mergedMesh(`tower-${towerIndex}-plinth`, [stoneLathe([
    [0, 0], [2.13, 0], [2.15, 0.20], [2.10, 0.38], [2.08, 0.74],
    [1.95, 0.87], [1.94, 0.98], [1.65, 1.20], [1.33, 1.32], [1.31, 1.65],
  ], detailed)], materials.stoneDark));
  const rims = [];
  for (let hole = 0; hole < HOLE_COUNT; hole += 1) {
    const angle = hole / HOLE_COUNT * Math.PI * 2;
    tower.add(createOpeningPanel(towerIndex, hole + 1, angle, materials, detailed));
    rims.push(carvedOpeningRim(angle, detailed));
  }
  tower.add(mergedMesh(`tower-${towerIndex}-opening-rims`, rims, materials.stone));

  const eaves = new THREE.Group();
  eaves.name = `tower-${towerIndex}-eaves`;
  eaves.add(
    mergedMesh(`tower-${towerIndex}-lower-eave`, [stoneLathe([
      [1.22, 4.48], [2.12, 4.55], [2.18, 4.70], [2.16, 4.83], [1.83, 4.95], [1.31, 5.07], [1.03, 5.12],
    ], detailed)], materials.stoneDark),
    mergedMesh(`tower-${towerIndex}-upper-eave`, [stoneLathe([
      [1.10, 6.04], [1.80, 6.13], [1.85, 6.28], [1.80, 6.42], [1.45, 6.53], [0.90, 6.66], [0.61, 6.72],
    ], detailed)], materials.stoneDark),
  );
  tower.add(eaves);
  tower.add(mergedMesh(`tower-${towerIndex}-neck`, [stoneLathe([
    [1.01, 5.06], [1.14, 5.11], [1.17, 5.38], [0.97, 5.48], [0.75, 5.52],
    [0.75, 6.02], [0.93, 6.10], [1.18, 6.14],
  ], detailed)], materials.stone));
  tower.add(mergedMesh(`tower-${towerIndex}-gourd-finial`, [stoneLathe([
    [0.57, 6.65], [0.59, 6.79], [0.47, 6.91], [0.51, 7.05], [0.65, 7.20],
    [0.74, 7.52], [0.71, 7.83], [0.55, 8.05], [0.42, 8.12], [0.41, 8.21],
    [0.61, 8.44], [0.63, 8.70], [0.52, 8.93], [0.36, 9.16], [0.22, 9.39],
    [0.12, 9.67], [0.06, 9.84], [0, 10.0],
  ], detailed)], materials.stone));
  if (detailed) {
    const relief = [];
    for (const [radius, y] of [[1.96, 0.90], [1.38, 1.25], [1.14, 5.28]]) {
      relief.push(transformed(new THREE.TorusGeometry(radius, 0.04, 5, 64), [0, y, 0], [Math.PI / 2, 0, 0]));
    }
    for (let flute = 0; flute < 8; flute += 1) {
      const angle = flute / 8 * Math.PI * 2;
      relief.push(transformed(new THREE.BoxGeometry(0.10, 0.45, 0.09),
        [Math.sin(angle) * 0.77, 5.78, Math.cos(angle) * 0.77], [0, angle, 0]));
    }
    tower.add(mergedMesh(`tower-${towerIndex}-carved-bands`, relief, materials.stone));
  }
  return tower;
}

function createTowerMaterials() {
  return {
    stone: surface('#807565', 0.96, { vertexColors: true }),
    stoneDark: surface('#635d50', 1, { vertexColors: true }),
  };
}

/** Uses the same rounded, perforated stone-tower form at the overview scale. */
export function createSantanOverviewTower(scale = 0.0108) {
  const tower = createTower(1, [0, 0, 0], 0, createTowerMaterials(), false);
  tower.scale.setScalar(scale);
  tower.updateMatrixWorld(true);
  return tower;
}

function createPavilion(materials) {
  const pavilion = new THREE.Group();
  pavilion.name = 'xiaoyingzhou-shore-pavilion';
  pavilion.position.set(-17, 0.16, -23);

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.35, 0.42, 8), materials.pavilionStone);
  platform.position.y = 0.21;
  platform.receiveShadow = true;
  const posts = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2;
    posts.push(transformed(
      new THREE.CylinderGeometry(0.13, 0.17, 3.7, 8),
      [Math.sin(angle) * 2.8, 2.25, Math.cos(angle) * 2.8],
    ));
  }
  const columns = mergedMesh('pavilion-columns', posts, materials.pavilionRed);
  const roof = mergedMesh('pavilion-roof', [
    transformed(new THREE.CylinderGeometry(4.45, 4.75, 0.24, 8), [0, 4.08, 0]),
    transformed(new THREE.ConeGeometry(4.42, 1.32, 8), [0, 4.80, 0]),
    transformed(new THREE.SphereGeometry(0.23, 10, 6), [0, 5.54, 0]),
  ], materials.pavilionRoof);
  pavilion.add(platform, columns, roof);
  return pavilion;
}

function createEnvironment(materials) {
  const environment = new THREE.Group();
  environment.name = 'santan-lake-and-shore';

  const lake = new THREE.Mesh(new THREE.PlaneGeometry(88, 72), materials.water);
  lake.name = 'santan-lake-surface';
  lake.rotation.x = -Math.PI / 2;
  lake.receiveShadow = true;
  environment.add(lake);

  const islandShape = new THREE.Shape();
  islandShape.moveTo(-36, 34);
  islandShape.lineTo(36, 34);
  islandShape.lineTo(36, 18);
  islandShape.bezierCurveTo(21, 11.5, -21, 11.5, -36, 18);
  islandShape.closePath();
  const island = new THREE.Mesh(new THREE.ShapeGeometry(islandShape, 24), materials.island);
  island.name = 'xiaoyingzhou-partial-island';
  island.userData = { scope: 'partial-shoreline' };
  island.rotation.x = -Math.PI / 2;
  island.position.y = 0.09;
  island.receiveShadow = true;
  environment.add(island);

  const shorePoints = [
    [-36, 0.20, -18], [-26, 0.20, -14.5], [-14, 0.20, -12.2],
    [0, 0.20, -11.5], [14, 0.20, -12.2], [26, 0.20, -14.5], [36, 0.20, -18],
  ].map((point) => new THREE.Vector3(...point));
  const shore = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(shorePoints), 64, 0.38, 7, false),
    materials.shoreStone,
  );
  shore.name = 'xiaoyingzhou-curved-shore';
  shore.userData = { arcPoints: shorePoints.length };
  shore.castShadow = true;
  shore.receiveShadow = true;
  environment.add(shore, createPavilion(materials));

  const trees = [
    [-30, 0.18, -22, 3.8], [-24, 0.16, -27, 3.2], [-8, 0.15, -19, 3.5],
    [4, 0.15, -22, 3.9], [15, 0.16, -18, 3.2], [25, 0.18, -25, 3.7], [31, 0.16, -20, 3.1],
  ];
  const trunkGeometry = new THREE.CylinderGeometry(0.13, 0.22, 1, 7);
  trunkGeometry.translate(0, 0.5, 0);
  const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.trunk, trees.length);
  trunks.name = 'shore-tree-trunks';
  const crowns = new THREE.InstancedMesh(crownGeometry, materials.leaves, trees.length);
  crowns.name = 'shore-tree-crowns';
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  trees.forEach(([x, y, z, height], index) => {
    matrix.compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(height, height, height));
    trunks.setMatrixAt(index, matrix);
    matrix.compose(
      new THREE.Vector3(x, y + height * 0.88, z),
      quaternion,
      new THREE.Vector3(height * 0.48, height * 0.60, height * 0.48),
    );
    crowns.setMatrixAt(index, matrix);
  });
  trunks.castShadow = true;
  crowns.castShadow = true;
  environment.add(trunks, crowns);

  return environment;
}

/**
 * Creates a lightweight artistic composition of the Three Pools Mirroring the
 * Moon stone towers and one local arc of Xiaoyingzhou's shore. Scene units and
 * the relative positions of the three towers are compositional, not surveyed.
 */
export function createSantanModel() {
  const materials = {
    ...createTowerMaterials(),
    water: new THREE.MeshPhysicalMaterial({
      color: '#356f76', roughness: 0.28, metalness: 0.03, transparent: true, opacity: 0.91,
    }),
    island: surface('#667752', 1),
    shoreStone: surface('#938a76', 0.94),
    pavilionStone: surface('#999080', 0.93),
    pavilionRed: surface('#783e34', 0.82),
    pavilionRoof: surface('#3f625d', 0.7, { metalness: 0.06 }),
    trunk: surface('#514033', 1),
    leaves: surface('#36563d', 1),
  };

  const group = new THREE.Group();
  group.name = 'santanyinyue-model';
  group.userData = {
    kind: 'artistic-approximation',
    towerCount: TOWER_COUNT,
    holesPerTower: HOLE_COUNT,
    layoutAccuracy: 'compositional-not-surveyed',
    islandScope: 'partial-shoreline',
  };
  group.add(
    createEnvironment(materials),
    createTower(1, [0, -0.03, 8], 0, materials),
    createTower(2, [-11, -0.03, -3.5], 0.34, materials),
    createTower(3, [11, -0.03, -3.5], -0.34, materials),
  );
  group.updateMatrixWorld(true);

  return {
    group,
    anchors: {
      towers: new THREE.Vector3(0, 3.7, 0.5),
      towerDetail: new THREE.Vector3(0, 4.05, 10.1),
      island: new THREE.Vector3(-17, 3.5, -22),
      moonView: new THREE.Vector3(13, 0.18, 10),
    },
  };
}
