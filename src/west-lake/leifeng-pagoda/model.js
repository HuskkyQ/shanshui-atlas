import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const OCTAGON = 8;
const FLOOR_COUNT = 5;
const BASE_ROOF_PROFILE = [[1, 0], [0.9, 0.05], [0.77, 0.24], [0.63, 0.60], [0.52, 1]];
const FLOOR_ROOF_PROFILE = [[1, 0], [0.91, 0.08], [0.8, 0.38], [0.69, 0.78], [0.62, 1]];
const CROWN_ROOF_PROFILE = [[1, 0], [0.85, 0.10], [0.67, 0.28], [0.49, 0.50], [0.31, 0.70], [0.16, 0.88], [0.065, 1]];

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

function roofPoint(radius, y, height, profilePoint, side, t) {
  const [radialScale, rise] = profilePoint;
  const angle = (side * 2 - 1) * Math.PI / OCTAGON;
  const nextAngle = angle + Math.PI * 2 / OCTAGON;
  const from = new THREE.Vector2(Math.sin(angle), Math.cos(angle)).multiplyScalar(radius * radialScale);
  const to = new THREE.Vector2(Math.sin(nextAngle), Math.cos(nextAngle)).multiplyScalar(radius * radialScale);
  const point = from.lerp(to, t);
  const cornerLift = height * 0.10 * Math.abs(t * 2 - 1) * radialScale ** 8;
  return [point.x, y + height * rise + cornerLift, point.y];
}

function octagonalRoof(radius, y, height, profile) {
  const positions = [];
  const indices = [];
  const samplesPerEdge = 4;
  const ringVertexCount = OCTAGON * samplesPerEdge;
  profile.forEach((profilePoint) => {
    for (let side = 0; side < OCTAGON; side += 1) {
      for (let sample = 0; sample < samplesPerEdge; sample += 1) {
        positions.push(...roofPoint(radius, y, height, profilePoint, side, sample / samplesPerEdge));
      }
    }
  });
  for (let ring = 0; ring < profile.length - 1; ring += 1) {
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

function archedWindow(width, height, detailed) {
  const shape = new THREE.Shape();
  const halfWidth = width / 2;
  shape.moveTo(-halfWidth, -height / 2);
  shape.lineTo(halfWidth, -height / 2);
  shape.lineTo(halfWidth, height / 2 - halfWidth);
  shape.absarc(0, height / 2 - halfWidth, halfWidth, 0, Math.PI, false);
  shape.closePath();
  return detailed
    ? new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false, curveSegments: 3 })
    : new THREE.ShapeGeometry(shape, 3);
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

function createTower(materials, detailed = true) {
  const group = new THREE.Group();
  group.name = 'leifeng-tower';
  const stoneParts = [
    transformed(new THREE.CylinderGeometry(9.5, 10.2, 1.15, OCTAGON), [0, 0.575, 0], [0, -Math.PI / OCTAGON, 0]),
    transformed(new THREE.CylinderGeometry(8.7, 9.25, 2.85, OCTAGON), [0, 2.575, 0], [0, -Math.PI / OCTAGON, 0]),
  ];
  group.add(mergeMesh('tower-base', stoneParts, materials.stone, { topY: 4 }));

  const stairParts = [];
  const treadCount = 12;
  for (let step = 0; step < treadCount; step += 1) {
    const height = (step + 1) / treadCount * 4;
    stairParts.push(transformed(new THREE.BoxGeometry(5.8, height, 0.56), [0, height / 2, 15.3 - step * 0.56]));
  }
  group.add(mergeMesh('entry-steps', stairParts, materials.stoneLight, {
    treadCount, groundY: 0, topY: 4, entranceDirection: '+z',
  }));

  const wallParts = [], columnParts = [], roofParts = [], ridgeParts = [], tileParts = [];
  const windowParts = [], latticeParts = [], railParts = [], bracketParts = [], balconyParts = [];
  const crownCorners = [];
  let crownY;
  for (let level = 0; level < FLOOR_COUNT; level += 1) {
    const radius = level === 0 ? 6.4 : 5.85 - (level - 1) * 0.27;
    const floorY = level === 0 ? 4.1 : 9.45 + (level - 1) * 3.8;
    const wallHeight = level === 0 ? 3.05 : 2.65;
    const roofY = floorY + wallHeight;
    const roofRadius = level === 0 ? 11.2 : radius + 1.7;
    const roofHeight = level === 0 ? 2.35 : level === 4 ? 4.5 : 1.3;
    const profile = level === 0 ? BASE_ROOF_PROFILE : level === 4 ? CROWN_ROOF_PROFILE : FLOOR_ROOF_PROFILE;
    const descriptor = new THREE.Group();
    descriptor.name = `tower-floor-${level + 1}`;
    descriptor.userData = { level: level + 1, sides: OCTAGON, footprintRadius: radius, baseY: floorY, roofY };
    group.add(descriptor);
    wallParts.push(transformed(new THREE.CylinderGeometry(radius, radius, wallHeight, OCTAGON),
      [0, floorY + wallHeight / 2, 0], [0, -Math.PI / OCTAGON, 0]));
    roofParts.push(octagonalRoof(roofRadius, roofY, roofHeight, profile));
    if (level === 4) {
      crownY = roofY + roofHeight;
      for (let side = 0; side < OCTAGON; side += 2) {
        crownCorners.push(roofPoint(roofRadius, roofY, roofHeight, profile[0], side, 0));
      }
    }

    for (let side = 0; side < OCTAGON; side += 1) {
      const angle = side * Math.PI * 2 / OCTAGON;
      const cornerAngle = angle - Math.PI / OCTAGON;
      const faceRadius = radius * Math.cos(Math.PI / OCTAGON);
      const facePoint = (offset, y, depth = 0) => [
        Math.sin(angle) * (faceRadius + depth) + Math.cos(angle) * offset,
        y,
        Math.cos(angle) * (faceRadius + depth) - Math.sin(angle) * offset,
      ];
      // Ridges and tile seams follow the same sampled roof as the roof mesh.
      for (let ring = 0; detailed && ring < profile.length - 1; ring += 1) {
        const start = roofPoint(roofRadius, roofY, roofHeight, profile[ring], side, 0);
        const end = roofPoint(roofRadius, roofY, roofHeight, profile[ring + 1], side, 0);
        start[1] += 0.025;
        end[1] += 0.025;
        ridgeParts.push(barBetween(start, end, 0.055, 4));
      }
      for (let sample = 0; sample < 4; sample += 1) {
        ridgeParts.push(barBetween(
          roofPoint(roofRadius, roofY - 0.035, roofHeight, profile[0], side, sample / 4),
          roofPoint(roofRadius, roofY - 0.035, roofHeight, profile[0], side, (sample + 1) / 4),
          0.09, 4,
        ));
      }
      if (detailed) {
        const tileCount = level === 0 ? 28 : 18;
        for (let tile = 1; tile < tileCount; tile += 1) {
          for (let ring = 0; ring < profile.length - 1; ring += 1) {
            const start = roofPoint(roofRadius, roofY + 0.018, roofHeight, profile[ring], side, tile / tileCount);
            const end = roofPoint(roofRadius, roofY + 0.018, roofHeight, profile[ring + 1], side, tile / tileCount);
            tileParts.push(barBetween(start, end, 0.014, 3));
          }
        }
      }

      const columnRadius = level === 0 ? 8.0 : radius;
      columnParts.push(transformed(new THREE.CylinderGeometry(0.12, 0.14, wallHeight, 6),
        [Math.sin(cornerAngle) * columnRadius, floorY + wallHeight / 2, Math.cos(cornerAngle) * columnRadius]));
      for (const offset of [-1.1, 0, 1.1]) {
        const isDoor = level === 0 && side === 0 && offset === 0;
        const width = isDoor ? 1.35 : 0.65;
        const height = isDoor ? 2.45 : 1.45;
        const centerY = floorY + (isDoor ? 1.3 : 1.6);
        windowParts.push(transformed(archedWindow(width, height, detailed), facePoint(offset, centerY, 0.035), [0, angle, 0]));
        if (detailed) {
          latticeParts.push(transformed(new THREE.BoxGeometry(0.035, height - 0.2, 0.04),
            facePoint(offset, centerY - 0.05, 0.09), [0, angle, 0]));
          latticeParts.push(transformed(new THREE.BoxGeometry(width, 0.035, 0.04),
            facePoint(offset, centerY - 0.12, 0.09), [0, angle, 0]));
        }
        for (const columnOffset of detailed ? [-0.46, 0.46] : []) {
          columnParts.push(transformed(new THREE.BoxGeometry(0.075, wallHeight, 0.09),
            facePoint(offset + columnOffset, floorY + wallHeight / 2, 0.08), [0, angle, 0]));
        }
      }

      const balconyRadius = level === 0 ? 8.5 : radius + 1.08;
      if (side === 0) balconyParts.push(transformed(
        new THREE.CylinderGeometry(balconyRadius, balconyRadius, 0.27, OCTAGON),
        [0, floorY + 0.08, 0], [0, -Math.PI / OCTAGON, 0],
      ));
      const from = new THREE.Vector3(Math.sin(cornerAngle) * balconyRadius, floorY + 0.26, Math.cos(cornerAngle) * balconyRadius);
      const to = new THREE.Vector3(Math.sin(cornerAngle + Math.PI * 2 / OCTAGON) * balconyRadius,
        floorY + 0.26, Math.cos(cornerAngle + Math.PI * 2 / OCTAGON) * balconyRadius);
      // Keep the ground-storey entrance open at the end of the approach steps.
      if (!(level === 0 && side === 0)) {
        for (const rise of [0.16, 0.73]) {
          const start = from.clone().add(new THREE.Vector3(0, rise, 0));
          const end = to.clone().add(new THREE.Vector3(0, rise, 0));
          railParts.push(barBetween(start.toArray(), end.toArray(), rise > 0.5 ? 0.065 : 0.045, 4));
        }
        const postCount = detailed ? 5 : 1;
        for (let post = 0; post < postCount; post += 1) {
          const point = from.clone().lerp(to, post / postCount);
          railParts.push(transformed(new THREE.BoxGeometry(0.10, 0.77, 0.10),
            [point.x, point.y + 0.4, point.z], [0, angle, 0]));
        }
      }
      for (const offset of detailed ? [-1.1, 0, 1.1] : []) {
        bracketParts.push(transformed(new THREE.BoxGeometry(0.42, 0.17, 0.64),
          facePoint(offset, roofY - 0.10, level === 0 ? 1.0 : 0.34), [0, angle, 0]));
        bracketParts.push(transformed(new THREE.BoxGeometry(0.66, 0.13, 0.36),
          facePoint(offset, roofY - 0.25, level === 0 ? 0.87 : 0.20), [0, angle, 0]));
        if (level) bracketParts.push(transformed(new THREE.BoxGeometry(0.22, 0.48, 0.65),
          facePoint(offset, floorY - 0.26, 0.45), [Math.PI / 6, angle, 0]));
      }
    }
  }
  group.add(
    mergeMesh('tower-walls', wallParts, materials.wall),
    mergeMesh('tower-columns', columnParts, materials.redWood),
    mergeMesh('tower-roofs', roofParts, materials.roof, { samplesPerEdge: 4 }),
    mergeMesh('tower-roof-ridges', ridgeParts, materials.ridge, { levelCount: FLOOR_COUNT, ridgesPerLevel: OCTAGON }),
    mergeMesh('tower-windows', windowParts, materials.window),
    mergeMesh('tower-railings', railParts, materials.rail),
    mergeMesh('tower-balconies', balconyParts, materials.stone),
  );
  if (detailed) group.add(
    mergeMesh('tower-roof-tiles', tileParts, materials.tile),
    mergeMesh('tower-window-lattice', latticeParts, materials.lattice),
    mergeMesh('tower-brackets', bracketParts, materials.eave),
  );

  const finial = new THREE.Group();
  finial.name = 'tower-finial';
  const baseProfile = [[0.44, -0.05], [0.66, 0.12], [0.66, 0.32], [0.52, 0.43],
    [0.52, 0.73], [0.65, 0.76], [0.61, 0.97], [0.40, 1.13]];
  finial.add(mergeMesh('tower-finial-base', [transformed(
    new THREE.LatheGeometry(baseProfile.map(([r, y]) => new THREE.Vector2(r, y)), detailed ? 16 : 8),
    [0, crownY, 0],
  )], materials.finial));
  const disks = [];
  for (let disk = 0; disk < 9; disk += 1) {
    const radius = 0.55 - disk * 0.027;
    const y = crownY + 1.25 + disk * 0.29;
    disks.push(transformed(new THREE.CylinderGeometry(radius * 0.72, radius, 0.10, detailed ? 16 : 8), [0, y, 0]));
    disks.push(transformed(new THREE.CylinderGeometry(0.16, 0.16, 0.20, 8), [0, y + 0.13, 0]));
  }
  finial.add(mergeMesh('tower-finial-disks', disks, materials.finial));
  finial.add(mergeMesh('tower-finial-mast', [
    transformed(new THREE.CylinderGeometry(0.045, 0.11, 6.6, 8), [0, crownY + 3.45, 0]),
    transformed(new THREE.SphereGeometry(0.12, 8, 5), [0, crownY + 6.55, 0]),
    transformed(new THREE.ConeGeometry(0.055, 0.52, 8), [0, crownY + 6.84, 0]),
  ], materials.finial));
  const ornamentY = crownY + 4.72;
  const ornament = [transformed(new THREE.TorusGeometry(0.34, 0.045, 4, 16), [0, ornamentY, 0])];
  for (let spoke = 0; spoke < 8; spoke += 1) {
    const angle = spoke / 8 * Math.PI * 2;
    ornament.push(barBetween([0, ornamentY, 0], [Math.sin(angle) * 0.32, ornamentY + Math.cos(angle) * 0.32, 0], 0.015, 3));
  }
  finial.add(mergeMesh('tower-finial-ornament', ornament, materials.finial));
  group.add(finial);
  if (detailed) {
    const cables = crownCorners.map((corner) => barBetween([0, crownY + 3.6, 0], corner, 0.013, 3));
    group.add(mergeMesh('tower-finial-cables', cables, materials.ridge));
  }
  return group;
}

function createTowerMaterials() {
  return {
    stone: material('#50595b'),
    stoneLight: material('#b5b4a7'),
    wall: material('#d4d0bd'),
    redWood: material('#632d29'),
    roof: material('#303d41', 0.64, 0.14),
    ridge: material('#344247', 0.60, 0.16),
    tile: material('#4b595d', 0.68, 0.12),
    eave: material('#394344'),
    window: material('#192a2b', 0.62),
    lattice: material('#967c61'),
    rail: material('#5c6565'),
    finial: material('#c7a14c', 0.38, 0.52),
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
      tower: [0, 16, 6.2],
      base: [0, 3.1, 9.7],
      eaves: [5.8, 23.8, 4.2],
      lakeView: [8.4, 5.2, -7.4],
    },
  };
}

/**
 * Creates the compact five-storey tower used at the Leifeng POI in the West
 * Lake overview. It reuses the close-range tower's five-floor geometry and
 * omits its landscape and fine facade/roof details while retaining the same
 * roof profiles, balconies, arched windows and finial silhouette.
 */
export function createLeifengOverviewTower(scale = 0.02) {
  const group = new THREE.Group();
  group.name = 'leifeng-overview-tower';
  group.userData = { kind: 'artistic-approximation', floorCount: FLOOR_COUNT, sides: OCTAGON, scale };
  const tower = createTower(createTowerMaterials(), false);
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
