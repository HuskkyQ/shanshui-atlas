import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { JINGCI_COURTYARDS, JINGCI_LAYOUT, JINGCI_PATHS } from './layout.js';

export const JINGCI_UNITS_PER_METRE = 0.30;

const AXIS_TERRACES = [
  { id: 'main-axis-terrace', x: 0, z: 25, width: 34, depth: 17, level: 1.25 },
  { id: 'middle-axis-terrace', x: 0, z: 43, width: 30, depth: 14, level: 4.0 },
  { id: 'rear-axis-terrace', x: 0, z: 54, width: 27, depth: 14, level: 6.45 },
  { id: 'high-axis-terrace', x: 0, z: 66, width: 25, depth: 18, level: 9.05 },
];
const AXIS_STAIRS = [
  { id: 'main-axis-stairs', width: 6.5, startZ: 15.2, endZ: 19.0, startY: 0.18, endY: 1.25, steps: 7 },
  { id: 'middle-axis-stairs', width: 6.0, startZ: 35.8, endZ: 40.0, startY: 1.25, endY: 4.0, steps: 10 },
  { id: 'rear-axis-stairs', width: 5.6, startZ: 48.5, endZ: 52.0, startY: 4.0, endY: 6.45, steps: 9 },
  { id: 'high-axis-stairs', width: 5.6, startZ: 56.8, endZ: 60.2, startY: 6.45, endY: 9.05, steps: 10 },
];

function material(color, roughness = 0.88, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...options });
}

function makeMesh(name, geometry, surface, userData = {}) {
  geometry.deleteAttribute('uv');
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.name = name;
  mesh.userData = { ...userData };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function mergeMesh(name, geometries, surface, userData = {}) {
  const geometry = mergeGeometries(geometries, false);
  if (!geometry) throw new Error(`Unable to assemble ${name}`);
  geometries.forEach((part) => part.dispose());
  return makeMesh(name, geometry, surface, userData);
}

function transformed(geometry, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  geometry.deleteAttribute('uv');
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  ));
  return geometry;
}

function placedBox(name, size, position, surface, userData = {}) {
  const mesh = makeMesh(name, new THREE.BoxGeometry(...size), surface, userData);
  mesh.position.set(...position);
  return mesh;
}

function barBetween(start, end, radius, segments = 5) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), segments, 1);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), direction.clone().normalize(),
  ));
  geometry.translate(...from.clone().add(to).multiplyScalar(0.5).toArray());
  return geometry;
}

function roofGeometry(width, depth, rise, segments = 1) {
  const positions = [];
  const addTriangle = (a, b, c) => {
    const normal = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a)));
    positions.push(...(normal.y >= 0 ? [a, b, c] : [a, c, b]).flat());
  };
  const addOutwardTriangle = (a, b, c, outwardX) => {
    const normal = new THREE.Vector3().subVectors(new THREE.Vector3(...b), new THREE.Vector3(...a))
      .cross(new THREE.Vector3().subVectors(new THREE.Vector3(...c), new THREE.Vector3(...a)));
    positions.push(...(normal.x * outwardX >= 0 ? [a, b, c] : [a, c, b]).flat());
  };
  const addGrid = (rows, columns, pointAt) => {
    for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
      const a = pointAt(row / rows, column / columns);
      const b = pointAt(row / rows, (column + 1) / columns);
      const c = pointAt((row + 1) / rows, column / columns);
      const d = pointAt((row + 1) / rows, (column + 1) / columns);
      addTriangle(a, b, c);
      addTriangle(b, d, c);
    }
  };
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const ridgeHalf = width * 0.27;
  const shoulderDepth = depth * 0.20;
  const lowerRise = rise * 0.50;
  const rows = Math.max(2, segments * 2);
  const columns = Math.max(6, segments * 4);
  for (const side of [-1, 1]) {
    addGrid(rows, columns, (t, column) => {
      const u = column * 2 - 1;
      const edgeLift = rise * 0.13 * Math.abs(u) ** 5 * (1 - t) ** 2;
      return [u * (halfWidth * (1 - t) + ridgeHalf * t),
        lowerRise * Math.sin(t * Math.PI / 2) + edgeLift,
        side * (halfDepth * (1 - t) + shoulderDepth * t)];
    });
    addGrid(rows, columns, (t, column) => {
      const u = column * 2 - 1;
      return [u * ridgeHalf, lowerRise + (rise - lowerRise) * Math.sin(t * Math.PI / 2),
        side * shoulderDepth * (1 - t)];
    });
  }
  for (const end of [-1, 1]) {
    addGrid(rows, Math.max(4, segments * 3), (t, column) => {
      const u = column * 2 - 1;
      const edgeLift = rise * 0.13 * Math.abs(u) ** 5 * (1 - t) ** 2;
      return [end * (halfWidth * (1 - t) + ridgeHalf * t),
        lowerRise * Math.sin(t * Math.PI / 2) + edgeLift,
        u * (halfDepth * (1 - t) + shoulderDepth * t)];
    });
    for (const side of [-1, 1]) {
      for (let row = 0; row < rows; row += 1) {
        const t0 = row / rows;
        const t1 = (row + 1) / rows;
        const z0 = side * shoulderDepth * (1 - t0);
        const z1 = side * shoulderDepth * (1 - t1);
        const top0 = [end * ridgeHalf, lowerRise + (rise - lowerRise) * Math.sin(t0 * Math.PI / 2), z0];
        const top1 = [end * ridgeHalf, lowerRise + (rise - lowerRise) * Math.sin(t1 * Math.PI / 2), z1];
        const bottom0 = [end * ridgeHalf, lowerRise, z0];
        const bottom1 = [end * ridgeHalf, lowerRise, z1];
        if (row > 0) addOutwardTriangle(bottom0, top0, top1, end);
        addOutwardTriangle(bottom0, top1, bottom1, end);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function createMaterials() {
  return {
    timber: material('#7b3629', 0.83),
    timberDark: material('#422622', 0.91),
    wall: material('#c7b991', 0.95),
    wallLight: material('#ddd4b8', 0.95),
    tile: material('#303634', 0.94),
    tileEdge: material('#1f2726', 0.92),
    stone: material('#86877f', 0.98),
    stoneDark: material('#666860', 0.98),
    paving: material('#a7a69b', 1),
    road: material('#787b76', 1),
    earth: material('#ffffff', 1, { vertexColors: true }),
    earthDark: material('#31533a', 1),
    trunk: material('#493426', 1),
    leafA: material('#2d5a36', 1),
    leafB: material('#3f7040', 1),
    leafC: material('#557c45', 1),
  };
}

function createRoof(name, width, depth, y, rise, surfaces, detailed) {
  const group = new THREE.Group();
  group.name = name;
  const roofSegments = detailed ? 3 : 1;
  const surface = makeMesh(`${name}-surface`, roofGeometry(width, depth, rise, roofSegments), surfaces.tile,
    { roofSurface: true, upwardFinite: true, roofWidth: width, roofDepth: depth, roofRise: rise, roofSegments });
  surface.position.y = y;
  group.add(surface);
  if (detailed) {
    group.add(mergeMesh(`${name}-fascia`, [
      transformed(new THREE.BoxGeometry(width, 0.14, 0.15), [0, y - 0.01, -depth / 2 + 0.075]),
      transformed(new THREE.BoxGeometry(width, 0.14, 0.15), [0, y - 0.01, depth / 2 - 0.075]),
    ], surfaces.tileEdge));
    const ridges = [];
    const count = Math.max(5, Math.min(16, Math.round(width / 1.25)));
    for (let index = 0; index < count; index += 1) {
      const x = -width * 0.42 + index * width * 0.84 / (count - 1);
      for (const side of [-1, 1]) {
        ridges.push(barBetween([x, y + 0.12, side * (depth / 2 - 0.08)],
          [x * 0.27, y + rise - 0.05, 0], 0.028));
      }
    }
    group.add(mergeMesh(`${name}-tile-ridges`, ridges, surfaces.tileEdge));
  }
  return group;
}

function addFacade(group, spec, floorY, wallHeight, surfaces, detailed, suffix = '', includeFrame = true) {
  const insetWidth = spec.width * 0.82;
  const insetDepth = spec.depth * 0.70;
  const centralTimber = spec.zone === 'central-axis' || spec.type === 'grand-pavilion';
  group.add(placedBox(`${spec.id}-walls${suffix}`, [insetWidth, wallHeight, insetDepth],
    [0, floorY + wallHeight / 2, 0], centralTimber
      ? surfaces.timber
      : (spec.type === 'residence' || spec.type === 'wing' ? surfaces.wallLight : surfaces.wall)));
  if (!includeFrame) return;
  const columns = [];
  const frontCount = detailed ? Math.max(4, Math.min(9, Math.round(spec.width / 2.2))) : 4;
  for (let index = 0; index < frontCount; index += 1) {
    const x = -insetWidth / 2 + insetWidth * index / (frontCount - 1);
    columns.push(transformed(new THREE.BoxGeometry(0.25, wallHeight, 0.22), [x, floorY + wallHeight / 2, -insetDepth / 2 - 0.06]));
    columns.push(transformed(new THREE.BoxGeometry(0.25, wallHeight, 0.22), [x, floorY + wallHeight / 2, insetDepth / 2 + 0.06]));
  }
  columns.push(
    transformed(new THREE.BoxGeometry(insetWidth, 0.22, 0.22), [0, floorY + wallHeight * 0.28, -insetDepth / 2 - 0.06]),
    transformed(new THREE.BoxGeometry(insetWidth, 0.22, 0.22), [0, floorY + wallHeight * 0.72, -insetDepth / 2 - 0.06]),
    transformed(new THREE.BoxGeometry(insetWidth, 0.22, 0.22), [0, floorY + wallHeight * 0.28, insetDepth / 2 + 0.06]),
    transformed(new THREE.BoxGeometry(insetWidth, 0.22, 0.22), [0, floorY + wallHeight * 0.72, insetDepth / 2 + 0.06]),
  );
  group.add(mergeMesh(`${spec.id}-columns${suffix}`, columns, surfaces.timberDark));
  if (detailed) {
    const panels = [];
    for (let index = 0; index < frontCount - 1; index += 1) {
      const x = -insetWidth / 2 + insetWidth * (index + 0.5) / (frontCount - 1);
      const bayWidth = insetWidth / (frontCount - 1);
      panels.push(transformed(new THREE.BoxGeometry(bayWidth * 0.58, wallHeight * 0.45, 0.08),
        [x, floorY + wallHeight * 0.52, -insetDepth / 2 - 0.11]));
      panels.push(transformed(new THREE.BoxGeometry(bayWidth * 0.58, wallHeight * 0.45, 0.08),
        [x, floorY + wallHeight * 0.52, insetDepth / 2 + 0.11]));
    }
    group.add(mergeMesh(`${spec.id}-lattice${suffix}`, panels, surfaces.timberDark));
  }
}

function createHall(spec, surfaces, detailed) {
  const group = new THREE.Group();
  group.name = `building-${spec.id}`;
  group.position.set(spec.x, 0, spec.z);
  group.userData = {
    role: spec.type, proposalZone: spec.zone, referenceLabel: spec.label,
    floors: spec.floors, eaveCount: spec.eaves, frontDirection: '-z', artisticApproximation: true,
    formalNameStatus: ['gate', 'daxiong', 'bell'].includes(spec.id) ? 'separately-researched' : 'unverified',
  };
  const foundationBottom = spec.level > 4 ? Math.max(0, naturalSlopeHeight(spec.x, spec.z) - 0.75) : 0;
  const foundationHeight = spec.level + 0.48 - foundationBottom;
  const architecturalDetail = detailed && ['central-axis', 'front-court', 'rear-terrace'].includes(spec.zone);
  group.add(placedBox(`${spec.id}-stone-foundation`, [spec.width + 1.2, foundationHeight, spec.depth + 1.1],
    [0, foundationBottom + foundationHeight / 2, 0], surfaces.stone));

  if (spec.type === 'grand-pavilion') {
    const floorHeight = 2.35;
    for (let floor = 0; floor < 3; floor += 1) {
      const shrink = floor * 1.45;
      const floorSpec = { ...spec, width: spec.width - shrink, depth: spec.depth - shrink * 0.55 };
      const floorY = spec.level + 0.48 + floor * 2.62;
      addFacade(group, floorSpec, floorY, floorHeight, surfaces, architecturalDetail, `-${floor + 1}`, architecturalDetail);
      group.add(createRoof(`${spec.id}-eave-${floor + 1}`, floorSpec.width + 1.7, floorSpec.depth + 1.5,
        floorY + floorHeight - 0.05, 1.0, surfaces, architecturalDetail));
    }
  } else if (spec.type === 'tower') {
    const floorHeight = 2.15;
    for (let floor = 0; floor < spec.floors; floor += 1) {
      const shrink = floor * 0.55;
      const floorSpec = { ...spec, width: spec.width - shrink, depth: spec.depth - shrink * 0.45 };
      const floorY = spec.level + 0.48 + floor * 2.35;
      addFacade(group, floorSpec, floorY, floorHeight, surfaces, architecturalDetail, `-${floor + 1}`, architecturalDetail);
      group.add(createRoof(`${spec.id}-eave-${floor + 1}`, floorSpec.width + 1.35, floorSpec.depth + 1.2,
        floorY + floorHeight - 0.05, 0.72, surfaces, architecturalDetail));
    }
    if (spec.eaves > spec.floors) {
      const topY = spec.level + 0.48 + spec.floors * 2.35;
      group.add(createRoof(`${spec.id}-eave-${spec.eaves}`, spec.width, spec.depth * 0.88, topY, 0.65, surfaces, architecturalDetail));
    }
  } else {
    const floorHeight = spec.floors > 1 ? 4.0 : (spec.type === 'gallery' ? 2.2 : 2.7);
    addFacade(group, spec, spec.level + 0.48, floorHeight, surfaces, architecturalDetail, '', architecturalDetail);
    const lowerY = spec.level + 0.48 + floorHeight - 0.05;
    group.add(createRoof(`${spec.id}-eave-1`, spec.width + 1.45, spec.depth + 1.35,
      lowerY, spec.type === 'main-hall' ? 1.25 : 0.82, surfaces, architecturalDetail));
    if (spec.eaves === 2) {
      const upperY = lowerY + 1.18;
      group.add(placedBox(`${spec.id}-upper-wall`, [spec.width * 0.72, 1.25, spec.depth * 0.62],
        [0, upperY + 0.50, 0], surfaces.timber));
      group.add(createRoof(`${spec.id}-eave-2`, spec.width * 0.84, spec.depth * 0.82,
        upperY + 1.05, 1.38, surfaces, architecturalDetail));
    }
  }
  return group;
}

function createAuxiliaryTrim(surfaces) {
  const parts = [];
  for (const spec of JINGCI_LAYOUT) {
    if (['central-axis', 'front-court', 'rear-terrace'].includes(spec.zone)) continue;
    const facadeZ = spec.depth * 0.35 + 0.08;
    const centerY = spec.level + 1.82;
    const bandWidth = spec.width * 0.64;
    for (const side of [-1, 1]) {
      parts.push(transformed(new THREE.BoxGeometry(bandWidth, 0.72, 0.09),
        [spec.x, centerY, spec.z + side * facadeZ]));
      for (const offset of [-0.36, 0, 0.36]) {
        parts.push(transformed(new THREE.BoxGeometry(0.16, 1.9, 0.14),
          [spec.x + spec.width * offset, spec.level + 1.45, spec.z + side * facadeZ]));
      }
    }
  }
  return mergeMesh('jingci-auxiliary-red-window-bands', parts, surfaces.timber,
    { role: 'batched-auxiliary-facade-trim', sourceBoundary: 'proposal-rendering-visual-language' });
}

function createCourtyardGroups(surfaces) {
  const regular = [];
  const side = new THREE.Group();
  side.name = 'building-side-courts';
  side.userData = { role: 'side-courtyard-collection', formalNameStatus: 'unverified', artisticApproximation: true };
  for (const court of JINGCI_COURTYARDS) {
    const supportBottom = court.level > 1 ? Math.max(0, naturalSlopeHeight(court.x, court.z) - 0.45) : 0;
    const supportHeight = court.level + 0.16 - supportBottom;
    const mesh = placedBox(`court-${court.id}`, [court.width, supportHeight, court.depth],
      [court.x, supportBottom + supportHeight / 2, court.z], surfaces.paving,
      { openSpace: true, proposalZone: court.zone, referenceLabel: court.label });
    if (court.id === 'courtyard') {
      const group = new THREE.Group();
      group.name = 'building-courtyard';
      group.position.set(court.x, 0, court.z);
      mesh.position.set(0, supportBottom + supportHeight / 2, 0);
      group.userData = { role: 'stone-courtyard', openSpace: true, artisticApproximation: true };
      group.add(mesh);
      regular.push(group);
    } else if (court.zone.includes('east') || court.zone.includes('west')) side.add(mesh);
    else regular.push(mesh);
  }
  regular.push(side);
  return regular;
}

function stairFlight(name, width, startZ, endZ, startY, endY, surfaces, steps = 7) {
  const parts = [];
  for (let index = 0; index < steps; index += 1) {
    const t = index / (steps - 1);
    const nextT = (index + 1) / steps;
    const height = THREE.MathUtils.lerp(startY, endY, t);
    const z = THREE.MathUtils.lerp(startZ, endZ, (t + nextT) / 2);
    parts.push(transformed(new THREE.BoxGeometry(width, Math.max(0.12, height), Math.abs(endZ - startZ) / steps + 0.08),
      [0, height / 2, z]));
  }
  return mergeMesh(name, parts, surfaces.stoneDark,
    { role: 'ascending-stair', startY, endY, frontDirection: '-z' });
}

function createAxisTerraces(surfaces) {
  const group = new THREE.Group();
  group.name = 'jingci-axis-terraces';
  group.add(
    ...AXIS_TERRACES.map((terrace) => placedBox(terrace.id,
      [terrace.width, terrace.level, terrace.depth], [0, terrace.level / 2, terrace.z], surfaces.stone)),
    ...AXIS_STAIRS.map((stair) => stairFlight(stair.id, stair.width, stair.startZ, stair.endZ,
      stair.startY, stair.endY, surfaces, stair.steps)),
  );
  return group;
}

export function createJingciCore({ detailed = true } = {}) {
  const surfaces = createMaterials();
  const group = new THREE.Group();
  group.name = 'jingci-core';
  group.userData = {
    orientation: 'north=-z',
    axisRotation: Math.PI - 0.24,
    coordinateFrame: '+x=image-left-when-facing-from-entrance,+z=rearward',
    artisticLayout: true,
    sourceBoundary: 'Mu-tect-reconstruction-proposal-massing-not-surveyed-footprints',
    groupRotation: 0,
  };
  for (const spec of JINGCI_LAYOUT) group.add(createHall(spec, surfaces, detailed));
  if (detailed) group.add(createAuxiliaryTrim(surfaces));
  group.add(...createCourtyardGroups(surfaces), createAxisTerraces(surfaces));

  const byId = (id) => JINGCI_LAYOUT.find((item) => item.id === id);
  const sideCourt = JINGCI_COURTYARDS.find((court) => court.id === 'west-court');
  const anchorFor = (id, height = 4) => {
    const item = byId(id);
    return new THREE.Vector3(item.x, item.level + height, item.z);
  };
  const anchors = {
    gate: anchorFor('gate', 4.2),
    daxiong: anchorFor('daxiong', 6.4),
    bell: anchorFor('bell', 6.7),
    courtyard: new THREE.Vector3(0, 1.15, 10.5),
    'rear-hall': anchorFor('rear-hall', 4.4),
    'rear-pavilion': anchorFor('rear-pavilion', 9.2),
    'side-courts': new THREE.Vector3(sideCourt.x, sideCourt.level + 1.4, sideCourt.z),
  };
  return { group, anchors };
}

function naturalSlopeHeight(x, z) {
  const t = THREE.MathUtils.clamp((z + 15) / 125, 0, 1);
  const centralDip = 1 - 0.22 * Math.exp(-(x * x) / 520);
  return Math.max(0.02, 0.06 + 12.5 * t ** 1.62 * centralDip + 0.22 * Math.sin(x * 0.16 + z * 0.11));
}

function slopeHeight(x, z) {
  let height = naturalSlopeHeight(x, z);
  for (const building of JINGCI_LAYOUT) {
    if (isInsideRectangle(x, z, rectangle(building, 1.5))) height = Math.min(height, Math.max(0.02, building.level - 0.04));
  }
  for (const court of JINGCI_COURTYARDS) {
    if (isInsideRectangle(x, z, rectangle(court, 1.5))) height = Math.min(height, Math.max(0.02, court.level - 0.04));
  }
  for (const terrace of AXIS_TERRACES) {
    if (isInsideRectangle(x, z, rectangle(terrace, 1.5))) height = Math.min(height, terrace.level - 0.04);
  }
  for (const stair of AXIS_STAIRS) {
    if (Math.abs(x) <= stair.width / 2 + 1.5 && z >= stair.startZ - 1.5 && z <= stair.endZ + 1.5) {
      height = Math.min(height, stair.startY - 0.04);
    }
  }
  if (Math.abs(x) <= 64.5 && z >= -15.4 && z <= -9.6) height = 0.02;
  return height;
}

export { slopeHeight as getJingciGroundHeight };

function createSlope(surfaces) {
  const columns = 144;
  const rows = 136;
  const bottomY = -1.2;
  const positions = [];
  const colors = [];
  const indices = [];
  const topColor = new THREE.Color('#456744');
  const bottomColor = new THREE.Color('#4b4034');
  for (let row = 0; row <= rows; row += 1) {
    const ratio = row / rows;
    const z = -18 + ratio * 130;
    const halfWidth = 76 - 5 * Math.sin(ratio * Math.PI) + 2 * Math.sin(ratio * Math.PI * 3);
    for (let column = 0; column <= columns; column += 1) {
      const x = -halfWidth + column / columns * halfWidth * 2;
      positions.push(x, slopeHeight(x, z), z);
      colors.push(topColor.r, topColor.g, topColor.b);
    }
  }
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const a = row * (columns + 1) + column;
    const b = a + 1;
    const c = a + columns + 1;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const topVertexCount = positions.length / 3;
  for (let vertex = 0; vertex < topVertexCount; vertex += 1) {
    positions.push(positions[vertex * 3], bottomY, positions[vertex * 3 + 2]);
    colors.push(bottomColor.r, bottomColor.g, bottomColor.b);
  }
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const a = topVertexCount + row * (columns + 1) + column;
    const b = a + 1;
    const c = a + columns + 1;
    const d = c + 1;
    indices.push(a, b, c, b, d, c);
  }
  const boundary = [];
  for (let column = columns; column >= 0; column -= 1) boundary.push(column);
  for (let row = 1; row <= rows; row += 1) boundary.push(row * (columns + 1));
  for (let column = 1; column <= columns; column += 1) boundary.push(rows * (columns + 1) + column);
  for (let row = rows - 1; row > 0; row -= 1) boundary.push(row * (columns + 1) + columns);
  for (let index = 0; index < boundary.length; index += 1) {
    const top = boundary[index];
    const nextTop = boundary[(index + 1) % boundary.length];
    const bottom = topVertexCount + top;
    const nextBottom = topVertexCount + nextTop;
    indices.push(top, bottom, nextTop, nextTop, bottom, nextBottom);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  return makeMesh('jingci-south-slope', geometry, surfaces.earth,
    { environment: 'wooded-nanping-slope', sampledSurface: true, irregularBoundary: true,
      closedSolid: true, bottomY });
}

function rectangle(spec, margin) {
  return {
    minX: spec.x - spec.width / 2 - margin,
    maxX: spec.x + spec.width / 2 + margin,
    minZ: spec.z - spec.depth / 2 - margin,
    maxZ: spec.z + spec.depth / 2 + margin,
  };
}

function isInsideRectangle(x, z, rect) {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

export function jingciTreeClearings(canopyMargin = 0) {
  return [
    ...JINGCI_LAYOUT.map((item) => rectangle(item, 2.1 + canopyMargin)),
    ...JINGCI_COURTYARDS.map((item) => rectangle(item, 1.2 + canopyMargin)),
    ...JINGCI_PATHS.map((item) => rectangle(item, 0.75 + canopyMargin)),
    rectangle({ x: 0, z: -12.5, width: 128, depth: 5 }, 0.75 + canopyMargin),
  ];
}

function createTrees(surfaces) {
  const group = new THREE.Group();
  group.name = 'jingci-trees';
  const rootClearings = jingciTreeClearings(0);
  const canopyClearings = jingciTreeClearings(1.9);
  const candidates = [];
  for (let row = 0; row < 42; row += 1) for (let column = 0; column < 46; column += 1) {
    const index = row * 46 + column;
    const x = -68 + column * 3.0 + Math.sin(index * 1.73) * 0.62;
    const z = -15 + row * 3.0 + Math.cos(index * 0.91) * 0.58;
    if (rootClearings.some((clearing) => isInsideRectangle(x, z, clearing))) continue;
    if (canopyClearings.some((clearing) => isInsideRectangle(x, z, clearing))) continue;
    const score = Math.abs(Math.sin(index * 12.9898 + 78.233) * 43758.5453) % 1;
    candidates.push({ position: [x, slopeHeight(x, z), z], score });
  }
  candidates.sort((a, b) => a.score - b.score);
  const positions = candidates.slice(0, 620).map((candidate) => candidate.position);

  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 2.2, 6), surfaces.trunk, positions.length);
  const variants = [
    new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.15, 1), surfaces.leafA, Math.ceil(positions.length / 3)),
    new THREE.InstancedMesh(new THREE.SphereGeometry(1.12, 7, 5), surfaces.leafB, Math.ceil((positions.length - 1) / 3)),
    new THREE.InstancedMesh(new THREE.ConeGeometry(1.2, 2.5, 7), surfaces.leafC, Math.floor(positions.length / 3)),
  ];
  const variantCounts = [0, 0, 0];
  const matrix = new THREE.Matrix4();
  positions.forEach(([x, y, z], index) => {
    const scale = 0.86 + (index % 7) * 0.045;
    matrix.compose(new THREE.Vector3(x, y + 1.1 * scale, z), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
    trunks.setMatrixAt(index, matrix);
    const variant = index % 3;
    const yOffset = variant === 2 ? 3.25 : 3.05;
    matrix.compose(new THREE.Vector3(x, y + yOffset * scale, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, index * 0.73, 0)),
      new THREE.Vector3(scale * (variant === 0 ? 1.18 : 1), scale * (variant === 1 ? 1.18 : 1), scale));
    variants[variant].setMatrixAt(variantCounts[variant]++, matrix);
  });
  trunks.name = 'jingci-tree-trunks';
  variants[0].name = 'jingci-tree-crowns-broad';
  variants[1].name = 'jingci-tree-crowns-round';
  variants[2].name = 'jingci-tree-crowns-conifer';
  trunks.castShadow = true;
  variants.forEach((variant) => { variant.castShadow = true; });
  group.add(trunks, ...variants);
  group.userData = { instanceCount: positions.length, variantCount: 3, clearingsIncludeCourtyardsAndPaths: true };
  return group;
}

export function createJingciModel() {
  const { group: core, anchors } = createJingciCore({ detailed: true });
  const surfaces = createMaterials();
  const environment = new THREE.Group();
  environment.name = 'jingci-landscape';
  environment.add(
    createSlope(surfaces),
    placedBox('jingci-courtyard-ground', [116, 0.12, 18], [0, 0.06, -6], surfaces.earthDark),
    placedBox('jingci-front-road', [128, 0.14, 5], [0, 0.12, -12.5], surfaces.road),
    createTrees(surfaces),
  );
  const group = new THREE.Group();
  group.name = 'jingci-model';
  group.add(core, environment);
  group.userData = { ...core.userData, fullModel: true, environment: 'dense-nanping-forest-slope' };
  return { group, anchors };
}
