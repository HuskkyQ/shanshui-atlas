import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const OCTAGON = 8;
const FLOOR_COUNT = 5;

function material(color, roughness = 0.82, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function transformed(geometry, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const result = geometry.clone();
  result.deleteAttribute('uv');
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  );
  result.applyMatrix4(matrix);
  return result;
}

function mergeMesh(name, geometries, surfaceMaterial, userData = {}) {
  const geometry = mergeGeometries(geometries, false);
  if (!geometry) throw new Error(`Unable to assemble ${name}`);
  geometries.forEach((source) => source.dispose());
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, surfaceMaterial);
  mesh.name = name;
  mesh.userData = { ...userData };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function octagonalRoof(radius, y, height) {
  const positions = [];
  const indices = [];
  const samplesPerEdge = 4;
  const ringVertexCount = OCTAGON * samplesPerEdge;
  const rings = [
    { radius, y: 0 },
    { radius: radius * 0.82, y: height * 0.20 },
    { radius: radius * 0.42, y: height },
  ];
  rings.forEach((ring, ringIndex) => {
    for (let side = 0; side < OCTAGON; side += 1) {
      const angle = side / OCTAGON * Math.PI * 2;
      const nextAngle = (side + 1) / OCTAGON * Math.PI * 2;
      const from = new THREE.Vector2(Math.sin(angle), Math.cos(angle)).multiplyScalar(ring.radius);
      const to = new THREE.Vector2(Math.sin(nextAngle), Math.cos(nextAngle)).multiplyScalar(ring.radius);
      for (let sample = 0; sample < samplesPerEdge; sample += 1) {
        const t = sample / samplesPerEdge;
        // The modern copper eaves rise at each octagonal corner and relax at
        // the middle of every edge, producing a readable swept silhouette.
        const cornerLift = ringIndex === 0
          ? height * 0.22 * (Math.cos(t * Math.PI * 2) + 1) / 2
          : 0;
        const point = from.clone().lerp(to, t);
        positions.push(point.x, y + ring.y + cornerLift, point.y);
      }
    }
  });
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let vertex = 0; vertex < ringVertexCount; vertex += 1) {
      const next = (vertex + 1) % ringVertexCount;
      const a = ring * ringVertexCount + vertex;
      const b = ring * ringVertexCount + next;
      const c = (ring + 1) * ringVertexCount + vertex;
      const d = (ring + 1) * ringVertexCount + next;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function barBetween(start, end, radius, segments = 6) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), segments, 1);
  geometry.deleteAttribute('uv');
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.clone().normalize(),
  ));
  geometry.translate(...from.clone().add(to).multiplyScalar(0.5).toArray());
  return geometry;
}

function moundGeometry(radius, height, x, z) {
  const rings = 4;
  const segments = 12;
  const positions = [];
  const indices = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const ringRadius = radius * t;
    const ringY = height * Math.pow(1 - t, 1.65);
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      positions.push(x + Math.sin(angle) * ringRadius, ringY, z + Math.cos(angle) * ringRadius);
    }
  }
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const next = (segment + 1) % segments;
      const a = ring * segments + segment;
      const b = ring * segments + next;
      const c = (ring + 1) * segments + segment;
      const d = (ring + 1) * segments + next;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createLandscape(materials) {
  const group = new THREE.Group();
  group.name = 'leifeng-landscape';

  const ground = new THREE.Mesh(new THREE.CircleGeometry(34, 48), materials.ground);
  ground.name = 'ground';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const mounds = [
    moundGeometry(15, 5.2, -23, -8),
    moundGeometry(12, 3.8, 22, 2),
    moundGeometry(10, 3.1, -18, 17),
  ];
  group.add(mergeMesh('nearby-hills', mounds, materials.hill));

  const path = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.12, 19), materials.path);
  path.name = 'approach-path';
  path.position.set(0, 0.06, 23.5);
  path.receiveShadow = true;
  group.add(path);

  const treePositions = [
    [-20, 0.4, -3, 3.4], [-17, 0.5, 7, 3.1], [-13, 0.25, 18, 2.8],
    [-23, 0.4, 14, 3.7], [-12, 0.25, -16, 3.2], [-20, 0.35, -18, 3.5],
    [19, 0.3, -5, 3.1], [22, 0.45, 8, 3.7], [16, 0.25, 17, 2.8],
    [25, 0.25, 18, 3.2], [15, 0.2, -17, 3.4], [24, 0.25, -14, 3.0],
    [-10, 0.15, 25, 2.5], [11, 0.15, 26, 2.7], [-28, 0.25, 3, 3.2],
    [28, 0.2, 1, 3.0], [-7, 0.15, -24, 2.8], [8, 0.15, -25, 3.1],
  ];
  const trunkGeometry = new THREE.CylinderGeometry(0.13, 0.22, 1, 7);
  trunkGeometry.translate(0, 0.5, 0);
  const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.trunk, treePositions.length);
  const crowns = [
    new THREE.InstancedMesh(crownGeometry, materials.leafDark, Math.ceil(treePositions.length / 2)),
    new THREE.InstancedMesh(crownGeometry, materials.leafLight, Math.floor(treePositions.length / 2)),
  ];
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const crownCounts = [0, 0];
  treePositions.forEach(([x, y, z, height], index) => {
    matrix.compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(height, height, height));
    trunks.setMatrixAt(index, matrix);
    const batch = index % 2;
    matrix.compose(
      new THREE.Vector3(x + Math.sin(index * 2.7) * 0.28, y + height * 0.82, z),
      quaternion,
      new THREE.Vector3(height * 0.42, height * 0.55, height * 0.42),
    );
    crowns[batch].setMatrixAt(crownCounts[batch], matrix);
    crownCounts[batch] += 1;
  });
  trunks.name = 'tree-trunks';
  trunks.castShadow = true;
  crowns.forEach((mesh, index) => {
    mesh.name = `tree-crowns-${index + 1}`;
    mesh.castShadow = true;
  });
  group.add(trunks, ...crowns);
  return group;
}

function createTower(materials) {
  const group = new THREE.Group();
  group.name = 'leifeng-tower';
  const stoneParts = [];
  stoneParts.push(transformed(new THREE.CylinderGeometry(9.5, 10.2, 1.15, OCTAGON), [0, 0.575, 0]));
  stoneParts.push(transformed(new THREE.CylinderGeometry(8.7, 9.25, 2.85, OCTAGON), [0, 2.575, 0]));
  group.add(mergeMesh('tower-base', stoneParts, materials.stone, { topY: 4 }));

  const stairParts = [];
  const treadCount = 12;
  for (let step = 0; step < treadCount; step += 1) {
    const progress = (step + 1) / treadCount;
    const height = progress * 4;
    const depth = 0.56;
    const z = 15.3 - step * 0.56;
    stairParts.push(transformed(new THREE.BoxGeometry(5.8, height, depth), [0, height / 2, z]));
  }
  group.add(mergeMesh('entry-steps', stairParts, materials.stoneLight, {
    treadCount,
    groundY: 0,
    topY: 4,
    entranceDirection: '+z',
  }));

  const wallParts = [];
  const columnParts = [];
  const roofParts = [];
  const ridgeParts = [];
  const windowParts = [];
  const latticeParts = [];
  const railParts = [];
  const bracketParts = [];
  const bodyBase = 4.15;
  const floorPitch = 4.75;

  for (let level = 0; level < FLOOR_COUNT; level += 1) {
    const radius = 5.65 - level * 0.46;
    const floorY = bodyBase + level * floorPitch;
    const wallHeight = 3.45;
    const roofY = floorY + wallHeight;
    const descriptor = new THREE.Group();
    descriptor.name = `tower-floor-${level + 1}`;
    descriptor.userData = {
      level: level + 1,
      sides: OCTAGON,
      footprintRadius: radius,
      baseY: floorY,
      roofY,
    };
    group.add(descriptor);

    wallParts.push(transformed(
      new THREE.CylinderGeometry(radius * 0.94, radius, wallHeight, OCTAGON),
      [0, floorY + wallHeight / 2, 0],
    ));
    const roofRadius = radius + 1.35;
    const roofHeight = 1.18;
    roofParts.push(octagonalRoof(roofRadius, roofY, roofHeight));
    for (let corner = 0; corner < OCTAGON; corner += 1) {
      const angle = corner / OCTAGON * Math.PI * 2;
      ridgeParts.push(barBetween(
        [
          Math.sin(angle) * roofRadius * 0.42,
          roofY + roofHeight + 0.025,
          Math.cos(angle) * roofRadius * 0.42,
        ],
        [
          Math.sin(angle) * roofRadius,
          roofY + roofHeight * 0.22 + 0.025,
          Math.cos(angle) * roofRadius,
        ],
        0.075,
      ));
    }

    for (let side = 0; side < OCTAGON; side += 1) {
      const angle = side / OCTAGON * Math.PI * 2;
      const cornerAngle = angle + Math.PI / OCTAGON;
      const columnRadius = radius * 0.99;
      columnParts.push(transformed(
        new THREE.CylinderGeometry(0.16, 0.19, wallHeight + 0.12, 7),
        [Math.sin(cornerAngle) * columnRadius, floorY + wallHeight / 2, Math.cos(cornerAngle) * columnRadius],
      ));

      const facadeRadius = radius * 0.955 + 0.04;
      const facadePosition = [Math.sin(angle) * facadeRadius, floorY + 1.9, Math.cos(angle) * facadeRadius];
      const facadeRotation = [0, angle, 0];
      const isDoor = level === 0 && side === 0;
      windowParts.push(transformed(
        new THREE.BoxGeometry(isDoor ? 1.55 : 1.3, isDoor ? 2.55 : 1.75, 0.10),
        facadePosition,
        facadeRotation,
      ));
      const gridHeight = isDoor ? 2.4 : 1.62;
      for (const offset of [-0.38, 0, 0.38]) {
        latticeParts.push(transformed(
          new THREE.BoxGeometry(0.055, gridHeight, 0.08),
          [
            facadePosition[0] + Math.cos(angle) * offset,
            facadePosition[1],
            facadePosition[2] - Math.sin(angle) * offset,
          ],
          facadeRotation,
        ));
      }
      for (const offset of [-0.45, 0, 0.45]) {
        latticeParts.push(transformed(
          new THREE.BoxGeometry(isDoor ? 1.42 : 1.18, 0.05, 0.08),
          [facadePosition[0], facadePosition[1] + offset, facadePosition[2]],
          facadeRotation,
        ));
      }

      const railRadius = radius + 0.44;
      const sideLength = 2 * railRadius * Math.sin(Math.PI / OCTAGON) * 0.86;
      const railPosition = [Math.sin(angle) * railRadius, floorY + 0.88, Math.cos(angle) * railRadius];
      for (const offsetY of [0, 0.48]) {
        railParts.push(transformed(
          new THREE.BoxGeometry(sideLength, 0.10, 0.10),
          [railPosition[0], railPosition[1] + offsetY, railPosition[2]],
          [0, angle, 0],
        ));
      }
      railParts.push(transformed(
        new THREE.BoxGeometry(0.11, 0.62, 0.11),
        [Math.sin(cornerAngle) * railRadius, floorY + 1.12, Math.cos(cornerAngle) * railRadius],
      ));
      bracketParts.push(transformed(
        new THREE.BoxGeometry(0.62, 0.20, 0.35),
        [Math.sin(angle) * (radius + 0.35), roofY - 0.12, Math.cos(angle) * (radius + 0.35)],
        [0, angle, 0],
      ));
    }
  }

  group.add(
    mergeMesh('tower-walls', wallParts, materials.wall),
    mergeMesh('tower-columns', columnParts, materials.redWood),
    mergeMesh('tower-roofs', roofParts, materials.roof, { samplesPerEdge: 4 }),
    mergeMesh('tower-roof-ridges', ridgeParts, materials.ridge, {
      levelCount: FLOOR_COUNT,
      ridgesPerLevel: OCTAGON,
    }),
    mergeMesh('tower-windows', windowParts, materials.window),
    mergeMesh('tower-window-lattice', latticeParts, materials.lattice),
    mergeMesh('tower-railings', railParts, materials.rail),
    mergeMesh('tower-brackets', bracketParts, materials.redWood),
  );

  const topY = bodyBase + (FLOOR_COUNT - 1) * floorPitch + 4.65;
  const finialParts = [
    transformed(new THREE.CylinderGeometry(0.44, 0.66, 0.6, OCTAGON), [0, topY + 0.3, 0]),
    transformed(new THREE.SphereGeometry(0.48, 10, 6), [0, topY + 0.95, 0], [0, 0, 0], [1, 0.55, 1]),
    transformed(new THREE.CylinderGeometry(0.12, 0.22, 3.2, OCTAGON), [0, topY + 2.6, 0]),
    transformed(new THREE.SphereGeometry(0.28, 10, 6), [0, topY + 4.15, 0]),
  ];
  group.add(mergeMesh('tower-finial', finialParts, materials.finial));
  return group;
}

function createTowerMaterials() {
  return {
    stone: material('#7b756b'),
    stoneLight: material('#a9a093'),
    wall: material('#9a7457'),
    redWood: material('#71362d'),
    roof: material('#526d67', 0.58, 0.08),
    ridge: material('#8a674d', 0.52, 0.22),
    window: material('#252c2c', 0.72),
    lattice: material('#9a5a43'),
    rail: material('#6d4033'),
    finial: material('#65786f', 0.48, 0.18),
  };
}

/**
 * Creates an original, stylised close-range impression of Leifeng Pagoda.
 * Dimensions are scene units chosen for composition, not a measured restoration.
 */
export function createLeifengModel() {
  const materials = {
    ground: material('#6c7454'),
    hill: material('#56664a'),
    path: material('#a89679'),
    trunk: material('#4a382e'),
    leafDark: material('#294837'),
    leafLight: material('#426448'),
    ...createTowerMaterials(),
  };
  const group = new THREE.Group();
  group.name = 'leifeng-pagoda-model';
  group.userData = {
    kind: 'artistic-approximation',
    floorCount: FLOOR_COUNT,
    sides: OCTAGON,
    entranceDirection: '+z',
    lakeDirection: '-z',
  };
  group.add(createLandscape(materials), createTower(materials));
  group.updateMatrixWorld(true);

  return {
    group,
    anchors: {
      tower: [0, 16, 6.1],
      base: [0, 3.1, 9.7],
      eaves: [5.8, 23.5, 4.2],
      lakeView: [8.4, 5.2, -7.4],
    },
  };
}

/**
 * Creates the compact five-storey tower used at the Leifeng POI in the West
 * Lake overview. It reuses the close-range tower's five-floor geometry and
 * omits only its surrounding landscape.
 */
export function createLeifengOverviewTower(scale = 0.02) {
  const group = new THREE.Group();
  group.name = 'leifeng-overview-tower';
  group.userData = { kind: 'artistic-approximation', floorCount: FLOOR_COUNT, sides: OCTAGON, scale };
  const tower = createTower(createTowerMaterials());
  tower.scale.setScalar(scale);
  group.add(tower);
  group.updateMatrixWorld(true);
  return group;
}

/**
 * Forms the small level base that lets the overview tower meet uneven DEM
 * terrain without replacing the terrain itself. The outer slope is sampled
 * densely so its rim follows the local ground while the tower and stairs stay
 * supported on a compact horizontal platform.
 */
export function createLeifengOverviewFoundation({ x, z, getHeight }) {
  const platformRadius = 0.34;
  const outerRadius = 0.48;
  const segments = 64;
  const sampleStep = 0.04;
  const samples = [getHeight(x, z)];
  for (let dx = -outerRadius; dx <= outerRadius + 1e-6; dx += sampleStep) {
    for (let dz = -outerRadius; dz <= outerRadius + 1e-6; dz += sampleStep) {
      if (Math.hypot(dx, dz) <= outerRadius) samples.push(getHeight(x + dx, z + dz));
    }
  }
  // The existing stair run reaches past the octagonal tower base toward +z.
  for (let dx = -0.14; dx <= 0.14 + 1e-6; dx += sampleStep) {
    for (let dz = platformRadius; dz <= outerRadius + 0.10 + 1e-6; dz += sampleStep) samples.push(getHeight(x + dx, z + dz));
  }
  const baseY = Math.max(...samples) + 0.004;
  const material = new THREE.MeshStandardMaterial({ color: '#69775d', roughness: 1 });
  const stone = new THREE.MeshStandardMaterial({ color: '#827c70', roughness: 0.92 });
  const pathMaterial = new THREE.MeshStandardMaterial({ color: '#a89679', roughness: 1 });
  const group = new THREE.Group();
  group.name = 'leifeng-overview-foundation';
  group.userData = { baseY, platformRadius, outerRadius, sampleCount: samples.length };

  const ringStep = 0.005;
  const radii = Array.from({ length: Math.round((outerRadius - platformRadius) / ringStep) + 1 }, (_, index) =>
    Math.min(outerRadius, platformRadius + index * ringStep));
  const positions = [], indices = [];
  function surfaceHeight(px, pz) {
    const dx = px - x, dz = pz - z;
    const radius = Math.hypot(dx, dz);
    if (radius <= platformRadius) return baseY;
    if (radius >= outerRadius) return getHeight(px, pz) + 0.004;
    const angle = Math.atan2(dx, dz);
    const outerHeight = getHeight(x + Math.sin(angle) * outerRadius, z + Math.cos(angle) * outerRadius) + 0.004;
    const desired = THREE.MathUtils.lerp(baseY, outerHeight, (radius - platformRadius) / (outerRadius - platformRadius));
    // The final 0.015 world-unit blend removes the safety margin at the rim,
    // keeping the outer edge on the measured terrain rather than floating.
    const safety = 0.012 * THREE.MathUtils.clamp((outerRadius - radius) / 0.015, 0, 1);
    return Math.max(getHeight(px, pz) + 0.004 + safety, desired + safety);
  }
  radii.forEach((radius, ring) => {
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      const px = x + Math.sin(angle) * radius;
      const pz = z + Math.cos(angle) * radius;
      positions.push(px, ring === 0 ? baseY : surfaceHeight(px, pz), pz);
    }
  });
  for (let ring = 0; ring < radii.length - 1; ring += 1) {
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const inner = ring * segments + index;
      const innerNext = ring * segments + next;
      const outer = (ring + 1) * segments + index;
      const outerNext = (ring + 1) * segments + next;
      // sin/cos rings advance counter-clockwise in x/z; this winding points up.
      indices.push(inner, outer, innerNext, innerNext, outer, outerNext);
    }
  }
  const slopeGeometry = new THREE.BufferGeometry();
  slopeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  slopeGeometry.setIndex(indices);
  slopeGeometry.computeVertexNormals();
  const slope = new THREE.Mesh(slopeGeometry, material);
  slope.name = 'leifeng-overview-slope';
  slope.receiveShadow = true;

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(platformRadius, platformRadius, 0.018, segments), stone);
  platform.name = 'leifeng-overview-platform';
  platform.position.set(x, baseY - 0.009, z);
  platform.receiveShadow = true;

  const approachRows = 28, approachColumns = 16;
  const approach = new THREE.BufferGeometry();
  const approachPositions = [], approachIndices = [];
  for (let row = 0; row <= approachRows; row += 1) {
    const offset = THREE.MathUtils.lerp(0.30, outerRadius + 0.10, row / approachRows);
    const halfWidth = THREE.MathUtils.lerp(0.13, 0.11, row / approachRows);
    for (let column = 0; column <= approachColumns; column += 1) {
      const dx = THREE.MathUtils.lerp(-halfWidth, halfWidth, column / approachColumns);
      const px = x + dx, pz = z + offset;
      approachPositions.push(px, surfaceHeight(px, pz) + 0.006, pz);
    }
    if (row) {
      for (let column = 0; column < approachColumns; column += 1) {
        const previous = (row - 1) * (approachColumns + 1) + column, current = row * (approachColumns + 1) + column;
        approachIndices.push(previous, current, previous + 1, previous + 1, current, current + 1);
      }
    }
  }
  approach.setAttribute('position', new THREE.Float32BufferAttribute(approachPositions, 3));
  approach.setIndex(approachIndices);
  approach.computeVertexNormals();
  const path = new THREE.Mesh(approach, pathMaterial);
  path.name = 'leifeng-overview-approach';
  path.receiveShadow = true;
  group.add(slope, platform, path);
  return { group, baseY };
}
