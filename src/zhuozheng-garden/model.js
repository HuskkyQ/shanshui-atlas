import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import layout from '../data/zhuozheng-layout.json' with { type: 'json' };

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[j];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}
const inWater = (x, z) => layout.ponds.some((p) => pointInRing(x, z, p.outline)
  && !p.holes.some((hole) => pointInRing(x, z, hole)));

function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
const snow = layout.buildings.find((b) => b.key === 'xuexiang-pavilion');
function groundHeight(x, z) {
  const island = layout.islands.find((i) => pointInRing(x, z, i.outline));
  if (!island) return 0.32;
  const edge = Math.min(...island.outline.slice(1).map((b, i) => segmentDistance(x, z, island.outline[i], b)));
  const base = 0.32 + island.height * Math.min(1, edge / 4);
  if (island.key !== 'west-island') return base;
  const dx = x - snow.position[0], dz = z - snow.position[2];
  const c = Math.cos(snow.rotation), s = Math.sin(snow.rotation);
  const q = Math.max(Math.abs(c * dx - s * dz) - snow.width / 2 - 1,
    Math.abs(s * dx + c * dz) - snow.depth / 2 - 1, 0);
  const influence = Math.max(0, 1 - q / 7);
  return Math.max(base, base + (snow.position[1] - base) * influence * influence);
}
function shape(points, holes = []) {
  const make = (ring, path) => {
    ring.forEach(([x, z], i) => i ? path.lineTo(x, -z) : path.moveTo(x, -z));
    path.closePath();
    return path;
  };
  const result = make(points, new THREE.Shape());
  holes.forEach((ring) => result.holes.push(make(ring, new THREE.Path())));
  return result;
}
function mesh(geometry, material, name = '') {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}
function box(group, material, w, h, d, x = 0, y = 0, z = 0, name = '') {
  const object = mesh(new THREE.BoxGeometry(w, h, d), material, name);
  object.position.set(x, y, z);
  group.add(object);
  return object;
}
function bar(group, material, start, end, radius = 0.07) {
  const from = new THREE.Vector3(...start), to = new THREE.Vector3(...end);
  const delta = to.clone().sub(from);
  const object = mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 6), material);
  object.position.copy(from.add(to).multiplyScalar(0.5));
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  group.add(object);
}
function flat(points, holes, material, y, name) {
  const object = mesh(new THREE.ShapeGeometry(shape(points, holes)), material, name);
  object.rotation.x = -Math.PI / 2;
  object.position.y = y;
  object.castShadow = false;
  return object;
}

// Curved hipped roof: each patch uses matching edge samples, with outward normals.
function curvedRoof(group, materials, w, d, rise, y, name, gabled = false) {
  const positions = [];
  const add = (a, b, c) => {
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    (normal.y >= 0 ? [a, b, c] : [a, c, b]).forEach((p) => positions.push(...p.toArray()));
  };
  const ridgeHalf = gabled ? w / 2 : Math.max(0.3, w / 2 - d * 0.28);
  const sample = (t, u, side) => new THREE.Vector3(
    u * ((w / 2 + 0.42) * (1 - t) + ridgeHalf * t),
    rise * (0.65 * t + 0.35 * t * t) + 0.14 * (1 - t) ** 3 * u ** 4,
    side * (d / 2 + 0.48) * (1 - t),
  );
  for (const side of [-1, 1]) for (let i = 0; i < 10; i++) for (let j = 0; j < 14; j++) {
    const t = i / 10, next = (i + 1) / 10, u = j / 7 - 1, v = (j + 1) / 7 - 1;
    const a = sample(t, u, side), b = sample(t, v, side), c = sample(next, v, side), e = sample(next, u, side);
    add(a, b, c); add(a, c, e);
  }
  if (!gabled) {
    for (const end of [-1, 1]) for (let i = 0; i < 10; i++) {
      const a = sample(i / 10, end, -1), b = sample(i / 10, end, 1);
      const c = sample((i + 1) / 10, end, 1), e = sample((i + 1) / 10, end, -1);
      add(a, b, c); if (i < 9) add(a, c, e);
    }
  } else {
    // Vertical gables close the ends under the pitched roof.
    for (const end of [-1, 1]) {
      const vertices = [end * ridgeHalf, 0, -d / 2, end * ridgeHalf, 0, d / 2, end * ridgeHalf, rise, 0];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      geometry.computeVertexNormals();
      const gable = mesh(geometry, materials.wall, `${name}-gable`);
      gable.position.y = y;
      group.add(gable);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const roof = mesh(geometry, materials.roof, name);
  roof.position.y = y;
  roof.userData.keepMesh = true;
  group.add(roof);
  bar(group, materials.ridge, [-ridgeHalf, y + rise + 0.06, 0], [ridgeHalf, y + rise + 0.06, 0], 0.1);
  for (const side of [-1, 1]) {
    for (let i = 0; i <= Math.ceil(w / 0.48); i++) {
      const u = i / Math.ceil(w / 0.48) * 2 - 1;
      for (let j = 0; j < 5; j++) {
        const a = sample(j / 5, u, side).add(new THREE.Vector3(0, y + 0.035, 0));
        const b = sample((j + 1) / 5, u, side).add(new THREE.Vector3(0, y + 0.035, 0));
        bar(group, materials.tile, a.toArray(), b.toArray(), 0.024);
      }
    }
  }
}
function rail(group, m, w, y, z) {
  box(group, m.wood, w, 0.09, 0.1, 0, y + 0.7, z);
  box(group, m.wood, w, 0.09, 0.1, 0, y + 0.15, z);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += 0.55) box(group, m.wood, 0.06, 0.58, 0.07, x, y + 0.4, z);
}
function lattice(group, m, w, h, y, z) {
  box(group, m.wood, w, 0.11, 0.15, 0, y, z);
  box(group, m.wood, w, 0.11, 0.15, 0, y + h, z);
  for (let x = -w / 2; x <= w / 2 + 0.01; x += w / 10) box(group, m.wood, 0.065, h, 0.13, x, y + h / 2, z);
  for (let i = 1; i < 4; i++) box(group, m.wood, w, 0.055, 0.1, 0, y + h * i / 4, z);
}
function frame(group, m, w, d, height, y, bays = 3) {
  for (let i = 0; i <= bays; i++) for (const z of [-d / 2, d / 2]) {
    box(group, m.wood, 0.18, height, 0.18, w * (i / bays - 0.5), y + height / 2, z);
  }
  for (const z of [-d / 2, d / 2]) box(group, m.wood, w + 0.2, 0.18, 0.2, 0, y + height, z);
  for (const x of [-w / 2, w / 2]) box(group, m.wood, 0.18, 0.18, d + 0.2, x, y + height, 0);
}
function base(group, m, w, d, height = 0.4) {
  box(group, m.stone, w + 0.7, height, d + 0.7, 0, height / 2, 0);
  for (let i = 0; i < 3; i++) box(group, m.stone, Math.min(w * 0.5, 3.6), (i + 1) * height / 3, 0.38,
    0, (i + 1) * height / 6, d / 2 + 1.1 - i * 0.3);
}
function buildingRoot(building) {
  const group = new THREE.Group();
  group.name = `building-${building.key}`;
  group.position.set(...building.position);
  if (building.key !== 'xuexiang-pavilion') group.position.y = 0.32;
  group.rotation.y = building.rotation;
  group.userData = { buildingKey: building.key, source: building.source, dimensionsAccuracy: 'artistic-approximation' };
  return group;
}
function makeHall(b, m, twoFloors = false) {
  const group = buildingRoot(b), w = b.width, d = b.depth, floorHeight = 2.75;
  base(group, m, w, d);
  const floors = twoFloors ? 2 : 1;
  for (let f = 0; f < floors; f++) {
    const y = 0.4 + floorHeight * f;
    box(group, m.wall, w, 0.2, d, 0, y + 0.1, 0);
    frame(group, m, w, d, floorHeight, y, 3);
    for (const z of [-d * 0.39, d * 0.39]) lattice(group, m, w * 0.83, 1.9, y + 0.48, z);
    for (const side of [-1, 1]) {
      const wall = new THREE.Group();
      wall.position.x = side * w * 0.42;
      wall.rotation.y = Math.PI / 2;
      lattice(wall, m, d * 0.8, 1.9, y + 0.48, 0);
      group.add(wall);
    }
    if (f) for (const z of [-d / 2, d / 2]) rail(group, m, w, y, z);
  }
  curvedRoof(group, m, w + 0.65, d + 0.7, twoFloors ? 1.7 : 1.55, 0.4 + floorHeight * floors, `${b.key}-roof`);
  group.userData.floors = floors;
  return group;
}
function makeSnow(b, m) {
  const group = buildingRoot(b);
  base(group, m, b.width, b.depth, 0.32);
  frame(group, m, b.width, b.depth, 2.35, 0.32, 2);
  for (const z of [-b.depth / 2, b.depth / 2]) rail(group, m, b.width * 0.84, 0.32, z);
  curvedRoof(group, m, b.width + 0.35, b.depth + 0.3, 1.1, 2.8, 'xuexiang-roof', true);
  return group;
}
function makeHexagon(b, m) {
  const group = buildingRoot(b), radius = Math.max(1.65, b.width * 0.64), y = 2.75;
  const plinth = mesh(new THREE.CylinderGeometry(radius + 0.32, radius + 0.48, 0.4, 6), m.stone);
  plinth.position.y = 0.2; group.add(plinth);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    box(group, m.wood, 0.15, 2.4, 0.15, Math.cos(angle) * radius * 0.83, 1.6, Math.sin(angle) * radius * 0.83);
  }
  const positions = [];
  for (let k = 0; k < 6; k++) for (let i = 0; i < 8; i++) {
    const point = (t, a) => new THREE.Vector3(Math.cos(a) * (radius + 0.55) * (1 - t),
      y + t * t * 1.45 + 0.1 * (1 - t), Math.sin(a) * (radius + 0.55) * (1 - t));
    const a = point(i / 8, k * Math.PI / 3), bb = point(i / 8, (k + 1) * Math.PI / 3);
    const c = point((i + 1) / 8, (k + 1) * Math.PI / 3), d = point((i + 1) / 8, k * Math.PI / 3);
    [a, c, bb, a, d, c].forEach((p) => positions.push(...p.toArray()));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals();
  group.add(mesh(geometry, m.roof, 'hefeng-six-sided-roof'));
  box(group, m.ridge, 0.15, 0.35, 0.15, 0, y + 1.55, 0);
  return group;
}
function makeBoat(b, m) {
  const group = buildingRoot(b);
  base(group, m, b.width, b.depth * 0.85, 0.48);
  // The length axis follows the mapped footprint; heights and proportions are artistic.
  const sections = [{ x: -0.32, w: 0.34, h: 2.65 }, { x: 0, w: 0.3, h: 2.25 }, { x: 0.31, w: 0.31, h: 4.1 }];
  sections.forEach((part, i) => {
    const cabin = new THREE.Group(); cabin.position.x = b.width * part.x;
    const w = b.width * part.w, d = b.depth * 0.84;
    frame(cabin, m, w, d, part.h, 0.48, 2);
    if (i === 2) {
      box(cabin, m.wall, w, 0.18, d, 0, 2.7, 0);
      for (const z of [-d / 2, d / 2]) {
        box(cabin, m.wall, w, 0.9, 0.16, 0, 1.0, z);
        lattice(cabin, m, w * 0.8, 1.0, 2.95, z);
      }
    } else for (const z of [-d / 2, d / 2]) rail(cabin, m, w, 0.48, z);
    curvedRoof(cabin, m, w + 0.12, d, i === 2 ? 1.1 : 0.85, part.h + 0.48, `xiangzhou-section-${i}-roof`, true);
    group.add(cabin);
  });
  group.userData.sections = 3;
  return group;
}
function makeMoon(b, m) {
  const group = buildingRoot(b), height = 3.0;
  base(group, m, b.width, b.depth);
  const wall = (width, x, z, rotation) => {
    const outline = new THREE.Shape();
    outline.moveTo(-width / 2, 0); outline.lineTo(width / 2, 0);
    outline.lineTo(width / 2, height); outline.lineTo(-width / 2, height); outline.closePath();
    const hole = new THREE.Path(); hole.absarc(0, 1.42, 1.18, 0, Math.PI * 2, true);
    outline.holes.push(hole);
    const object = mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.18, bevelEnabled: false, curveSegments: 28 }), m.wall, 'wuzhu-moon-wall');
    object.position.set(x, 0.4, z); object.rotation.y = rotation;
    object.userData.keepMesh = true;
    group.add(object);
  };
  wall(b.width, 0, -b.depth / 2, 0); wall(b.width, 0, b.depth / 2, Math.PI);
  wall(b.depth, -b.width / 2, 0, Math.PI / 2); wall(b.depth, b.width / 2, 0, -Math.PI / 2);
  frame(group, m, b.width, b.depth, height, 0.4, 1);
  curvedRoof(group, m, b.width + 0.4, b.depth + 0.4, 1.4, 3.5, 'wuzhu-roof');
  return group;
}
function makeBridge(b, m) {
  const group = buildingRoot(b), length = b.width, width = b.depth;
  box(group, m.stone, length + 0.5, 0.3, width + 0.4, 0, 0.35, 0, 'xiaofeihong-deck');
  frame(group, m, length, width, 2.45, 0.5, 4);
  for (const z of [-width / 2, width / 2]) rail(group, m, length, 0.5, z);
  curvedRoof(group, m, length + 0.4, width + 0.25, 0.95, 3, 'xiaofeihong-grey-tile-roof', true);
  group.userData.endpoints = b.outline;
  return group;
}

function mergeParts(group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert(), buckets = new Map(), remove = [];
  group.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || object.userData.keepMesh) return;
    let geometry = object.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    if (geometry.index) { const expanded = geometry.toNonIndexed(); geometry.dispose(); geometry = expanded; }
    Object.keys(geometry.attributes).forEach((name) => { if (!['position', 'normal'].includes(name)) geometry.deleteAttribute(name); });
    if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
    if (!buckets.has(object.material)) buckets.set(object.material, []);
    buckets.get(object.material).push(geometry); remove.push(object);
  });
  remove.forEach((object) => { object.geometry.dispose(); object.removeFromParent(); });
  buckets.forEach((geometries, material) => {
    group.add(mesh(mergeGeometries(geometries), material, 'merged-architectural-detail'));
    geometries.forEach((geometry) => geometry.dispose());
  });
}
function islandMesh(island, material, index) {
  const source = new THREE.ShapeGeometry(shape(island.outline));
  const nonIndexed = source.toNonIndexed();
  const points = nonIndexed.attributes.position;
  const output = [];
  const add = (a, b, c, depth = 0) => {
    if (depth < 7 && Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) > 1.5) {
      const ab = a.clone().add(b).multiplyScalar(0.5), bc = b.clone().add(c).multiplyScalar(0.5), ca = c.clone().add(a).multiplyScalar(0.5);
      add(a, ab, ca, depth + 1); add(ab, b, bc, depth + 1); add(ca, bc, c, depth + 1); add(ab, bc, ca, depth + 1);
    } else [a, b, c].forEach((p) => output.push(p.x, groundHeight(p.x, -p.y), -p.y));
  };
  for (let i = 0; i < points.count; i += 3) add(new THREE.Vector3().fromBufferAttribute(points, i), new THREE.Vector3().fromBufferAttribute(points, i + 1), new THREE.Vector3().fromBufferAttribute(points, i + 2));
  source.dispose(); nonIndexed.dispose();
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(output, 3)); geometry.computeVertexNormals();
  return mesh(geometry, material, `island-${index + 1}`);
}
function scatterPlants(environment, materials) {
  let seed = 7421;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const nearBuilding = (x, z, padding) => layout.buildings.some((b) => {
    const dx = x - b.position[0], dz = z - b.position[2], c = Math.cos(b.rotation), s = Math.sin(b.rotation);
    return Math.abs(c * dx - s * dz) < b.width / 2 + padding && Math.abs(s * dx + c * dz) < b.depth / 2 + padding;
  });
  const nearPath = (x, z) => layout.paths.some((p) => p.points.slice(1).some((b, i) => segmentDistance(x, z, p.points[i], b) < 1.7));
  const trees = [];
  for (let attempt = 0; attempt < 5000 && trees.length < 60; attempt++) {
    const x = 12 + random() * 132, z = -75 + random() * 110;
    if (inWater(x, z) || nearBuilding(x, z, 4.5) || nearPath(x, z) || trees.some((t) => Math.hypot(x - t.x, z - t.z) < 5.8)) continue;
    trees.push({ x, z, h: 3.8 + random() * 3.2, y: groundHeight(x, z), type: trees.length % 3 });
  }
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion();
  const trunkGeometry = new THREE.CylinderGeometry(0.11, 0.25, 1, 7); trunkGeometry.translate(0, 0.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.wood, trees.length);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), materials.leaf, trees.length * 3);
  trees.forEach((tree, i) => {
    matrix.compose(new THREE.Vector3(tree.x, tree.y, tree.z), rotation, new THREE.Vector3(1, tree.h * 0.75, 1)); trunks.setMatrixAt(i, matrix);
    for (let j = 0; j < 3; j++) {
      const angle = j * 2.1 + i, scale = tree.type === 0 ? [1.5, 2, 1.5] : tree.type === 1 ? [2, 1.15, 1.7] : [1.4, 1.4, 1.4];
      matrix.compose(new THREE.Vector3(tree.x + Math.cos(angle) * 0.8, tree.y + tree.h * (0.65 + j * 0.10), tree.z + Math.sin(angle) * 0.8), rotation, new THREE.Vector3(...scale));
      crown.setMatrixAt(i * 3 + j, matrix);
    }
  });
  trunks.name = 'garden-tree-trunks'; crown.name = 'garden-varied-tree-crowns';
  trunks.castShadow = crown.castShadow = true; environment.add(trunks, crown);
  const shoots = [];
  for (const tree of trees.filter((_, i) => i % 4 === 0)) for (let j = 0; j < 7; j++) {
    const x = tree.x + 1 + Math.sin(j * 2.3) * 0.7, z = tree.z + Math.cos(j * 2.3) * 0.7;
    if (!inWater(x, z) && !nearBuilding(x, z, 2) && !nearPath(x, z)) shoots.push({ x, z, h: 2.1 + random() });
  }
  const bamboo = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.065, 1, 5), materials.bamboo, shoots.length);
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(0.4, 1.2, 5), materials.leafLight, shoots.length * 2);
  shoots.forEach((p, i) => {
    const y = groundHeight(p.x, p.z);
    matrix.compose(new THREE.Vector3(p.x, y + p.h / 2, p.z), rotation, new THREE.Vector3(1, p.h, 1)); bamboo.setMatrixAt(i, matrix);
    for (let j = 0; j < 2; j++) {
      matrix.compose(new THREE.Vector3(p.x + (j ? 0.23 : -0.23), y + p.h * (0.7 + j * 0.2), p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), j ? 0.65 : -0.65), new THREE.Vector3(1, 1, 1));
      leaves.setMatrixAt(i * 2 + j, matrix);
    }
  });
  bamboo.name = 'garden-bamboo'; environment.add(bamboo, leaves);
  const pads = [];
  for (let i = 0; i < 1500 && pads.length < 210; i++) {
    const x = 45 + random() * 85, z = -50 + random() * 55;
    if (!inWater(x, z) || nearBuilding(x, z, 1.6) || nearPath(x, z)) continue;
    if (Math.sin(x * 0.12) + Math.cos(z * 0.18) < 0.5) continue;
    pads.push([x, z]);
  }
  const leafGeometry = new THREE.CircleGeometry(0.55, 12, 0.12, Math.PI * 2 - 0.24); leafGeometry.rotateX(-Math.PI / 2);
  const lotus = new THREE.InstancedMesh(leafGeometry, materials.lotus, pads.length);
  const blossoms = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), materials.flower, Math.ceil(pads.length / 8));
  pads.forEach(([x, z], i) => {
    const scale = 0.7 + random() * 0.7;
    matrix.compose(new THREE.Vector3(x, 0.2 + random() * 0.06, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * 6), new THREE.Vector3(scale, 1, scale)); lotus.setMatrixAt(i, matrix);
    if (i % 8 === 0) { matrix.compose(new THREE.Vector3(x + 0.2, 0.42, z), rotation, new THREE.Vector3(1, 1.4, 1)); blossoms.setMatrixAt(i / 8, matrix); }
  });
  lotus.name = 'garden-lotus-leaves'; environment.add(lotus, blossoms);
}

export function createZhuozhengGardenModel() {
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.87, ...extra });
  const m = { water: material('#437c76', { roughness: 0.27, metalness: 0.15 }), soil: material('#789072'),
    stone: material('#a4a393'), wall: material('#e8e2cc', { side: THREE.DoubleSide }), wood: material('#654c36'),
    roof: material('#424d4b'), ridge: material('#39433f'), tile: material('#56615b'), path: material('#b8b29f'),
    leaf: material('#45643f'), leafLight: material('#637c47'), bamboo: material('#75894c'), lotus: material('#4f754c', { side: THREE.DoubleSide }), flower: material('#e4a1b4') };
  const group = new THREE.Group(); group.name = 'zhuozheng-garden-model';
  group.userData = { kind: 'artistic-approximation', metadata: layout.metadata, dimensionsAccuracy: 'artistic-estimate' };
  const environment = new THREE.Group(); environment.name = 'zhuozheng-environment';
  const b = layout.metadata.bounds;
  const rectangle = [[b.minX, b.minZ], [b.maxX, b.minZ], [b.maxX, b.maxZ], [b.minX, b.maxZ]];
  const ground = flat(rectangle, layout.ponds.map((p) => p.outline), m.soil, 0.32, 'central-garden-land-base');
  ground.userData.groundWithWaterHoles = true; environment.add(ground);
  box(environment, m.stone, b.maxX - b.minX, 1.2, b.maxZ - b.minZ, (b.minX + b.maxX) / 2, -0.65, (b.minZ + b.maxZ) / 2, 'garden-exhibit-base');
  layout.islands.forEach((island, i) => environment.add(islandMesh(island, m.soil, i)));
  layout.ponds.forEach((pond, i) => {
    const water = flat(pond.outline, pond.holes, m.water, 0.12, `pond-${i + 1}-surface`);
    water.userData = { waterSurface: true, holeCount: pond.holes.length }; environment.add(water);
  });
  const stones = [];
  layout.ponds.forEach((pond) => [pond.outline, ...pond.holes].forEach((ring) => {
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1], c = ring[i], n = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 1.0));
      for (let j = 0; j < n; j++) stones.push([a[0] + (c[0] - a[0]) * j / n, a[1] + (c[1] - a[1]) * j / n]);
    }
  }));
  const shore = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.46, 0), m.stone, stones.length);
  const matrix = new THREE.Matrix4();
  stones.forEach(([x, z], i) => {
    matrix.compose(new THREE.Vector3(x, 0.27, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(i * 0.1, i * 1.7, 0)), new THREE.Vector3(1.2, 0.8, 1)); shore.setMatrixAt(i, matrix);
  });
  shore.name = 'pond-natural-stone-shore-instances'; shore.castShadow = true; environment.add(shore);
  const paths = new THREE.Group(); paths.name = 'garden-walkways';
  layout.paths.forEach((path) => {
    if (path.key === 'osm-way-485084818') return;
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1], c = path.points[i], dx = c[0] - a[0], dz = c[1] - a[1];
      const length = Math.hypot(dx, dz);
      if (length < 0.03) continue;
      if (path.kind === 'bridge') {
        const slab = box(paths, m.stone, 1.35, 0.13, length + 0.05, (a[0] + c[0]) / 2, 0.58, (a[1] + c[1]) / 2);
        slab.rotation.y = Math.atan2(dx, dz);
        continue;
      }
      // Sample both edges so paths follow the island slope without floating slabs.
      const positions = [], steps = Math.ceil(length / 0.8);
      const point = (t, side) => {
        const x = a[0] + dx * t + side * dz / length * 0.8;
        const z = a[1] + dz * t - side * dx / length * 0.8;
        return [x, groundHeight(x, z) + 0.07, z];
      };
      for (let j = 0; j < steps; j++) {
        const left = point(j / steps, -1), right = point(j / steps, 1);
        const nextLeft = point((j + 1) / steps, -1), nextRight = point((j + 1) / steps, 1);
        positions.push(...left, ...nextRight, ...right, ...left, ...nextLeft, ...nextRight);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      paths.add(mesh(geometry, m.path));
    }
  });
  mergeParts(paths); environment.add(paths);
  scatterPlants(environment, m); group.add(environment);
  const builders = { 'yuanxiang-hall': makeHall, 'xuexiang-pavilion': makeSnow, 'hefeng-pavilion': makeHexagon,
    xiangzhou: makeBoat, xiaofeihong: makeBridge, 'wuzhu-pavilion': makeMoon, 'jianshan-lou': (data, materials) => makeHall(data, materials, true) };
  layout.buildings.forEach((building) => {
    const object = builders[building.key](building, m); mergeParts(object); group.add(object);
  });
  group.updateMatrixWorld(true);
  const anchors = {};
  layout.buildings.forEach(({ key }) => {
    const bounds = new THREE.Box3().setFromObject(group.getObjectByName(`building-${key}`));
    anchors[key] = bounds.getCenter(new THREE.Vector3()).setY(bounds.max.y + 0.45);
  });
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set(), materials = new Set(Object.values(m));
    group.traverse((object) => {
      if (object.isInstancedMesh) object.dispose();
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((item) => materials.add(item));
    });
    geometries.forEach((geometry) => geometry.dispose()); materials.forEach((item) => item.dispose());
  }
  return { group, anchors, dispose };
}
