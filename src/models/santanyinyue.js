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
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData = { ...userData };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createOpeningPanel(towerIndex, holeIndex, angle, materials) {
  const depth = 0.28;
  const outerApothem = 2.05 + depth / 2;
  const panelHalfWidth = outerApothem * Math.tan(Math.PI / HOLE_COUNT);
  const panelHalfHeight = 1.92;
  const shape = new THREE.Shape();
  shape.moveTo(-panelHalfWidth, -panelHalfHeight);
  shape.lineTo(panelHalfWidth, -panelHalfHeight);
  shape.lineTo(panelHalfWidth, panelHalfHeight);
  shape.lineTo(-panelHalfWidth, panelHalfHeight);
  shape.closePath();

  const openingCenterY = 0.08;
  const opening = new THREE.Path();
  opening.absarc(0, openingCenterY, 0.55, 0, Math.PI * 2, false);
  shape.holes.push(opening);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  const panel = new THREE.Mesh(geometry, [materials.stone, materials.holeInterior]);
  panel.name = `tower-${towerIndex}-through-hole-${holeIndex}`;
  panel.userData = {
    openingType: 'through-hole',
    towerIndex,
    holeIndex,
    localOpeningCenter: [0, openingCenterY, 0],
    openingRadius: 0.55,
  };
  panel.position.set(Math.sin(angle) * 2.05, 3.45, Math.cos(angle) * 2.05);
  panel.rotation.y = angle;
  panel.castShadow = true;
  panel.receiveShadow = true;
  return panel;
}

function createTower(towerIndex, position, rotation, materials) {
  const tower = new THREE.Group();
  tower.name = `santan-stone-tower-${towerIndex}`;
  tower.userData = {
    kind: 'bottle-shaped-stone-tower',
    holeCount: HOLE_COUNT,
    artisticLayout: true,
  };
  tower.position.set(...position);
  tower.rotation.y = rotation;

  const plinth = mergedMesh(`tower-${towerIndex}-plinth`, [
    transformed(new THREE.CylinderGeometry(2.85, 3.05, 0.48, 20), [0, 0.24, 0]),
    transformed(new THREE.CylinderGeometry(2.48, 2.72, 0.48, 20), [0, 0.72, 0]),
    transformed(new THREE.CylinderGeometry(2.18, 2.42, 0.42, 20), [0, 1.17, 0]),
  ], materials.stoneDark);
  tower.add(plinth);

  const lowerBody = mergedMesh(`tower-${towerIndex}-lower-body`, [
    transformed(new THREE.CylinderGeometry(2.22, 2.08, 0.66, 20), [0, 1.66, 0]),
    transformed(new THREE.TorusGeometry(2.16, 0.18, 7, 20), [0, 1.36, 0], [Math.PI / 2, 0, 0]),
  ], materials.stone);
  tower.add(lowerBody);

  for (let hole = 0; hole < HOLE_COUNT; hole += 1) {
    const angle = hole / HOLE_COUNT * Math.PI * 2;
    tower.add(createOpeningPanel(towerIndex, hole + 1, angle, materials));
  }

  const shoulder = mergedMesh(`tower-${towerIndex}-shoulder`, [
    transformed(new THREE.CylinderGeometry(1.13, 2.10, 0.78, 20), [0, 5.73, 0]),
    transformed(new THREE.TorusGeometry(1.12, 0.15, 7, 20), [0, 6.12, 0], [Math.PI / 2, 0, 0]),
    transformed(new THREE.CylinderGeometry(0.92, 1.05, 0.78, 16), [0, 6.47, 0]),
  ], materials.stone);
  tower.add(shoulder);

  const eaves = mergedMesh(`tower-${towerIndex}-eaves`, [
    transformed(new THREE.CylinderGeometry(2.42, 2.54, 0.26, 20), [0, 6.94, 0]),
    transformed(new THREE.ConeGeometry(2.32, 0.74, 20), [0, 7.40, 0]),
    transformed(new THREE.TorusGeometry(2.30, 0.15, 7, 20), [0, 7.06, 0], [Math.PI / 2, 0, 0]),
  ], materials.stoneDark);
  tower.add(eaves);

  const finial = mergedMesh(`tower-${towerIndex}-gourd-finial`, [
    transformed(new THREE.CylinderGeometry(0.34, 0.48, 0.58, 12), [0, 7.93, 0]),
    transformed(new THREE.SphereGeometry(0.56, 14, 9), [0, 8.48, 0], [0, 0, 0], [1, 0.85, 1]),
    transformed(new THREE.SphereGeometry(0.38, 12, 8), [0, 9.11, 0], [0, 0, 0], [1, 1.08, 1]),
    transformed(new THREE.ConeGeometry(0.18, 0.62, 10), [0, 9.58, 0]),
  ], materials.stoneLight);
  tower.add(finial);
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
    stone: surface('#aaa28f'),
    stoneLight: surface('#c8c0aa', 0.82),
    stoneDark: surface('#777469', 0.94),
    holeInterior: surface('#353b39', 1, { side: THREE.DoubleSide }),
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
    createTower(1, [0, 0.02, 8], 0, materials),
    createTower(2, [-11, 0.02, -3.5], 0.34, materials),
    createTower(3, [11, 0.02, -3.5], -0.34, materials),
  );
  group.updateMatrixWorld(true);

  return {
    group,
    anchors: {
      towers: new THREE.Vector3(0, 3.7, 0.5),
      towerDetail: new THREE.Vector3(0, 4.35, 10.15),
      island: new THREE.Vector3(-17, 3.5, -22),
      moonView: new THREE.Vector3(13, 0.18, 10),
    },
  };
}
