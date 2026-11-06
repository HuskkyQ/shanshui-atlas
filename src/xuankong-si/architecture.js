import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { XUANKONG_LAYOUT, cliffFaceZ, cliffFootY } from './layout.js';

function surface(color, roughness = 0.88, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...options });
}

function createMaterials() {
  return {
    stone: surface('#8b8170', 1),
    paleStone: surface('#b9aa8c', 0.96),
    plaster: surface('#b89269', 0.96),
    redWall: surface('#8c3a2d', 0.9),
    timber: surface('#6a3022', 0.84),
    darkTimber: surface('#34221d', 0.9),
    door: surface('#241c19', 0.92),
    tile: surface('#77713d', 0.86, { side: THREE.DoubleSide }),
    towerTiles: [
      surface('#81763b', 0.86, { side: THREE.DoubleSide }),
      surface('#6f7540', 0.87, { side: THREE.DoubleSide }),
      surface('#8b7d3f', 0.84, { side: THREE.DoubleSide }),
    ],
    tileEdge: surface('#454b31', 0.9),
    brass: surface('#b29a4a', 0.7),
  };
}

function mesh(name, geometry, material, userData = {}) {
  geometry.deleteAttribute('uv');
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.userData = { ...userData };
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function box(name, size, position, material, userData = {}) {
  const object = mesh(name, new THREE.BoxGeometry(...size), material, userData);
  object.position.set(...position);
  return object;
}

function cylinderBetween(name, start, end, radius, material, userData = {}) {
  const direction = end.clone().sub(start);
  const object = mesh(name, new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material, userData);
  object.position.copy(start).add(end).multiplyScalar(0.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return object;
}

function transformedBox(size, position, quaternion = new THREE.Quaternion()) {
  const geometry = new THREE.BoxGeometry(...size);
  geometry.deleteAttribute('uv');
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(...position), quaternion, new THREE.Vector3(1, 1, 1),
  ));
  return geometry;
}

function boxBetweenGeometry(start, end, thickness) {
  const direction = end.clone().sub(start);
  const geometry = new THREE.BoxGeometry(thickness, thickness, direction.length());
  geometry.deleteAttribute('uv');
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    start.clone().add(end).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize()),
    new THREE.Vector3(1, 1, 1),
  ));
  return geometry;
}

function mergedMesh(name, geometries, material, userData = {}) {
  const geometry = mergeGeometries(geometries, false);
  if (!geometry) throw new Error(`Unable to assemble ${name}`);
  geometries.forEach((part) => part.dispose());
  return mesh(name, geometry, material, userData);
}

function hippedRoofGeometry(width, depth, rise) {
  const halfW = width / 2;
  const halfD = depth / 2;
  const ridgeHalf = Math.max(0.3, halfW - halfD * 0.78);
  const cornerLift = Math.min(0.22, rise * 0.3);
  const positions = [
    -halfW, cornerLift, -halfD,
    0, 0, -halfD,
    halfW, cornerLift, -halfD,
    halfW, cornerLift, halfD,
    0, 0, halfD,
    -halfW, cornerLift, halfD,
    -ridgeHalf, rise, 0,
    ridgeHalf, rise, 0,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex([
    0, 1, 6, 1, 7, 6, 1, 2, 7,
    5, 6, 4, 4, 6, 7, 4, 7, 3,
    0, 6, 5,
    2, 3, 7,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function createHippedRoof(name, width, depth, eaveY, centreX, centreZ, materials, rise = 0.72,
  tileMaterial = materials.tile) {
  const group = new THREE.Group();
  group.name = name;
  group.userData = {
    roofProfile: 'hipped',
    silhouette: 'broken-slope-upturned-eaves',
    visiblePitchedSurface: true,
  };
  const roof = mesh(`${name}-surface`, hippedRoofGeometry(width, depth, rise), tileMaterial,
    { roofProfile: 'hipped', brokenSlope: true, upturnedCorners: true });
  roof.position.set(centreX, eaveY, centreZ);
  group.add(roof);
  group.add(box(`${name}-ridge`, [Math.max(0.75, width - depth * 0.75), 0.14, 0.14],
    [centreX, eaveY + rise + 0.04, centreZ], materials.tileEdge));
  for (const [corner, x, z] of [
    ['sw', centreX - width / 2, centreZ - depth / 2],
    ['se', centreX + width / 2, centreZ - depth / 2],
    ['nw', centreX - width / 2, centreZ + depth / 2],
    ['ne', centreX + width / 2, centreZ + depth / 2],
  ]) {
    const tip = box(`${name}-${corner}-upturned-tip`, [0.42, 0.12, 0.26],
      [x, eaveY + Math.min(0.22, rise * 0.3) + 0.07, z], materials.tileEdge,
      { artisticUpturnedEave: true });
    tip.rotation.y = Math.PI / 4;
    tip.rotation.z = x < centreX ? -0.18 : 0.18;
    tip.rotation.x = z < centreZ ? 0.12 : -0.12;
    group.add(tip);
  }
  const halfW = width / 2;
  const halfD = depth / 2;
  const ridgeHalf = Math.max(0.3, halfW - halfD * 0.78);
  const ribs = [];
  for (let index = 0; index < 7; index += 1) {
    const t = index / 6;
    const x = THREE.MathUtils.lerp(-halfW + 0.28, halfW - 0.28, t);
    const ridgeX = THREE.MathUtils.clamp(x, -ridgeHalf, ridgeHalf);
    for (const side of [-1, 1]) {
      ribs.push(boxBetweenGeometry(
        new THREE.Vector3(centreX + x, eaveY + 0.07, centreZ + side * (halfD - 0.08)),
        new THREE.Vector3(centreX + ridgeX, eaveY + rise + 0.08, centreZ),
        0.055,
      ));
    }
  }
  group.add(mergedMesh(`${name}-tile-ribs`, ribs, materials.tileEdge,
    { mergedRoofRibs: true, count: ribs.length }));
  return group;
}

function mountingFace(spec, sampleY) {
  const half = spec.width / 2;
  return Math.max(
    cliffFaceZ(spec.x - half, sampleY),
    cliffFaceZ(spec.x, sampleY),
    cliffFaceZ(spec.x + half, sampleY),
  ) + 0.08;
}

function createRailSet(prefix, spec, levelY, rearZ, materials) {
  const group = new THREE.Group();
  group.name = `${prefix}-rails`;
  const frontZ = rearZ + spec.depth - 0.17;
  for (const y of [levelY + 0.5, levelY + 1.05]) {
    group.add(box(`${prefix}-front-rail-${y}`, [spec.width - 0.55, 0.11, 0.11],
      [spec.x, y, frontZ], materials.darkTimber));
  }
  for (let index = 0; index <= 8; index += 1) {
    const x = spec.x - spec.width / 2 + 0.28 + index * (spec.width - 0.56) / 8;
    group.add(box(`${prefix}-front-baluster-${index}`, [0.09, 1.02, 0.09],
      [x, levelY + 0.55, frontZ], materials.darkTimber));
  }
  for (const side of [-1, 1]) {
    const x = spec.x + side * (spec.width / 2 - 0.16);
    group.add(box(`${prefix}-side-rail-${side}`, [0.11, 0.11, spec.depth - 0.7],
      [x, levelY + 1.02, rearZ + spec.depth / 2 + 0.14], materials.darkTimber));
  }
  return group;
}

function createTower(id, spec, materials) {
  const group = new THREE.Group();
  group.name = `building-${id}`;
  const galleryLevels = Array.from({ length: spec.floors }, (_, floor) => spec.floorY + floor * spec.storeyHeight);
  const rearZ = mountingFace(spec, spec.floorY + spec.storeyHeight * 1.5);
  group.userData = {
    floorCount: spec.floors,
    galleryLevels,
    rearZ,
    frontZ: rearZ + spec.depth,
    dimensionsMetres: { width: spec.width, depth: spec.depth },
    dimensionAccuracy: 'public-approximation',
  };

  for (let floor = 0; floor < spec.floors; floor += 1) {
    const floorNumber = floor + 1;
    const levelY = galleryLevels[floor];
    const prefix = `${id}-floor-${floorNumber}`;
    const storey = new THREE.Group();
    storey.name = prefix;
    storey.userData = { levelY, openGallery: true };
    storey.add(box(`${prefix}-slab`, [spec.width, 0.2, spec.depth],
      [spec.x, levelY - 0.1, rearZ + spec.depth / 2], materials.timber,
      { solidFloor: true }));
    storey.add(box(`${prefix}-back-wall`, [spec.width - 0.45, 2.28, 0.28],
      [spec.x, levelY + 1.24, rearZ + 0.22], materials.redWall));
    for (const side of [-1, 1]) {
      storey.add(box(`${prefix}-side-wall-${side}`, [0.28, 2.18, spec.depth * 0.48],
        [spec.x + side * (spec.width / 2 - 0.2), levelY + 1.22, rearZ + spec.depth * 0.27], materials.plaster));
    }

    const doors = new THREE.Group();
    doors.name = `${prefix}-doors`;
    const doorWidth = spec.width * 0.2;
    const latticeParts = [];
    for (const offset of [-0.28, 0, 0.28]) {
      const doorX = spec.x + spec.width * offset;
      doors.add(box(`${prefix}-door-${offset}`, [doorWidth, 1.64, 0.1],
        [doorX, levelY + 0.91, rearZ + 0.39], materials.door,
        { visibleDoorBay: true }));
      for (const division of [-0.27, 0, 0.27]) {
        latticeParts.push(transformedBox([0.055, 1.48, 0.045],
          [doorX + doorWidth * division, levelY + 0.91, rearZ + 0.46]));
      }
      for (const barY of [levelY + 0.54, levelY + 0.91, levelY + 1.28]) {
        latticeParts.push(transformedBox([doorWidth * 0.86, 0.055, 0.045],
          [doorX, barY, rearZ + 0.46]));
      }
    }
    doors.add(mergedMesh(`${prefix}-door-lattice`, latticeParts, materials.timber,
      { mergedLattice: true, bayCount: 3 }));
    storey.add(doors);

    const columns = new THREE.Group();
    columns.name = `${prefix}-columns`;
    const bracketParts = [];
    for (let index = 0; index < 5; index += 1) {
      const x = spec.x - spec.width / 2 + 0.25 + index * (spec.width - 0.5) / 4;
      columns.add(box(`${prefix}-column-${index}`, [0.2, 2.56, 0.2],
        [x, levelY + 1.28, rearZ + spec.depth - 0.35], materials.timber));
      bracketParts.push(
        transformedBox([0.72, 0.13, 0.24], [x, levelY + 2.34, rearZ + spec.depth - 0.35]),
        transformedBox([0.24, 0.13, 0.72], [x, levelY + 2.25, rearZ + spec.depth - 0.52]),
      );
    }
    storey.add(columns, createRailSet(prefix, spec, levelY, rearZ, materials));
    storey.add(mergedMesh(`${prefix}-brackets`, bracketParts, materials.darkTimber,
      { mergedColumnHeadBrackets: true, columnCount: 5 }));
    storey.add(box(`${prefix}-lintel`, [spec.width, 0.2, 0.22],
      [spec.x, levelY + 2.44, rearZ + spec.depth - 0.35], materials.darkTimber));
    storey.add(createHippedRoof(`${prefix}-roof`, spec.width + 0.9, spec.depth + 0.85,
      levelY + 2.5, spec.x, rearZ + spec.depth / 2, materials, 0.63,
      materials.towerTiles[floor % materials.towerTiles.length]));
    group.add(storey);
  }
  return group;
}

function createEnclosedPavilion(name, x, floorY, z, width, depth, materials, doubleEave = false) {
  const group = new THREE.Group();
  group.name = name;
  group.userData = { enclosedVolume: true, photoGuidedRole: 'low-end-pavilion' };
  group.add(box(`${name}-platform`, [width, 0.14, depth], [x, floorY + 0.07, z], materials.stone));
  const baseHeight = doubleEave ? 1.3 : 0.68;
  const upperHeight = doubleEave ? 1.7 : 1.45;
  const upperCentreY = floorY + baseHeight + upperHeight / 2;
  const upperTopY = floorY + baseHeight + upperHeight;

  const walls = new THREE.Group();
  walls.name = `${name}-walls`;
  walls.add(
    box(`${name}-red-base`, [width - 0.24, baseHeight, depth - 0.2],
      [x, floorY + 0.07 + baseHeight / 2, z], materials.redWall),
    box(`${name}-rear-wall`, [width - 0.34, upperHeight, 0.2],
      [x, upperCentreY, z - depth / 2 + 0.16], materials.plaster),
    box(`${name}-left-wall`, [0.32, upperHeight, depth - 0.38],
      [x - width / 2 + 0.24, upperCentreY, z], materials.plaster),
    box(`${name}-right-wall`, [0.32, upperHeight, depth - 0.38],
      [x + width / 2 - 0.24, upperCentreY, z], materials.plaster),
    box(`${name}-front-lintel-wall`, [width - 0.55, 0.36, 0.18],
      [x, upperTopY - 0.17, z + depth / 2 - 0.12], materials.redWall),
  );
  group.add(walls);
  group.add(box(`${name}-door`, [Math.min(0.74, width * 0.34), 1.36, 0.12],
    [x, floorY + (doubleEave ? 1.02 : 1.26), z + depth / 2 + 0.01], materials.door,
    { visibleDoorBay: true }));
  const windows = new THREE.Group();
  windows.name = `${name}-windows`;
  const windowY = doubleEave ? floorY + baseHeight + 0.78 : floorY + 1.45;
  for (const side of [-1, 1]) {
    const windowX = x + side * width * 0.31;
    const windowWidth = Math.min(0.42, width * 0.2);
    windows.add(
      box(`${name}-window-${side}`, [windowWidth, 0.62, 0.1],
        [windowX, windowY, z + depth / 2 + 0.015], materials.door,
        { visibleWindowBay: true }),
      box(`${name}-window-${side}-vertical-bar`, [0.045, 0.58, 0.045],
        [windowX, windowY, z + depth / 2 + 0.08], materials.timber),
      box(`${name}-window-${side}-horizontal-bar`, [windowWidth * 0.88, 0.045, 0.045],
        [windowX, windowY, z + depth / 2 + 0.08], materials.timber),
    );
  }
  group.add(windows);

  const timberFrame = new THREE.Group();
  timberFrame.name = `${name}-timber-frame`;
  const columnHeight = doubleEave ? 1.7 : 1.72;
  const columnCentreY = doubleEave ? floorY + baseHeight + columnHeight / 2 : floorY + 1.36;
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      timberFrame.add(box(`${name}-column-${sideX}-${sideZ}`, [0.17, columnHeight, 0.17],
        [x + sideX * (width / 2 - 0.18), columnCentreY,
          z + sideZ * (depth / 2 - 0.18)], materials.timber));
    }
  }
  const lintelY = doubleEave ? upperTopY - 0.04 : floorY + 2.18;
  timberFrame.add(
    box(`${name}-front-lintel`, [width - 0.2, 0.16, 0.2],
      [x, lintelY, z + depth / 2 - 0.18], materials.darkTimber),
    box(`${name}-rear-lintel`, [width - 0.2, 0.16, 0.2],
      [x, lintelY, z - depth / 2 + 0.18], materials.darkTimber),
  );
  group.add(timberFrame);
  if (doubleEave) {
    const gallery = new THREE.Group();
    gallery.name = `${name}-upper-gallery-rail`;
    for (const y of [floorY + baseHeight + 0.28, floorY + baseHeight + 0.66]) {
      gallery.add(box(`${name}-gallery-rail-${y}`, [width - 0.38, 0.08, 0.08],
        [x, y, z + depth / 2 + 0.1], materials.darkTimber));
    }
    for (let index = 0; index <= 4; index += 1) {
      const railX = x - width / 2 + 0.24 + index * (width - 0.48) / 4;
      gallery.add(box(`${name}-gallery-baluster-${index}`, [0.065, 0.65, 0.065],
        [railX, floorY + baseHeight + 0.34, z + depth / 2 + 0.1], materials.timber));
    }
    group.add(gallery);
    group.add(createHippedRoof(`${name}-lower-eave`, width + 0.38, depth + 0.34,
      floorY + baseHeight - 0.04, x, z, materials, 0.3));
  }
  group.add(createHippedRoof(`${name}-roof`, width + 0.72, depth + 0.58,
    doubleEave ? floorY + 3.02 : floorY + 2.18, x, z, materials, 0.54));
  return group;
}

function taperedPodiumGeometry(width, topY, bottomY, topBackZ, topFrontZ, bottomBackZ, bottomFrontZ) {
  const half = width / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -half, bottomY, bottomBackZ,
    half, bottomY, bottomBackZ,
    half, bottomY, bottomFrontZ,
    -half, bottomY, bottomFrontZ,
    -half, topY, topBackZ,
    half, topY, topBackZ,
    half, topY, topFrontZ,
    -half, topY, topFrontZ,
  ], 3));
  geometry.setIndex([
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 5, 1, 0, 4, 5,
    3, 6, 7, 3, 2, 6,
    0, 7, 4, 0, 3, 7,
    1, 6, 2, 1, 5, 6,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function createMasonryPodium(spec, rearZ, frontZ, materials) {
  const group = new THREE.Group();
  group.name = 'courtyard-masonry-podium';
  const coreStartX = spec.x - spec.width / 2;
  const podiumStartX = coreStartX - 6;
  const podiumEndX = spec.x + spec.width / 2;
  const segmentWidth = (podiumEndX - podiumStartX) / 6;
  const centres = Array.from({ length: 6 }, (_, index) => podiumStartX + segmentWidth * (index + 0.5));
  centres.forEach((x, index) => {
    const approachDrop = Math.max(0, coreStartX - x) * 0.3;
    const topY = spec.floorY - 0.45 - approachDrop;
    const bottomY = topY - 4.4;
    const topBackZ = Math.min(rearZ - 0.08, cliffFaceZ(x, topY) - 0.18);
    const bottomFrontZ = cliffFaceZ(x, bottomY) - 0.04;
    const bottomBackZ = bottomFrontZ - 0.34;
    const segment = new THREE.Group();
    segment.name = `courtyard-masonry-podium-segment-${index}`;
    segment.userData = {
      kind: 'masonry-podium-segment', sampleX: x, topY, bottomY,
      topBackZ, bottomFrontZ, bottomBackZ,
    };
    const body = mesh(`${segment.name}-body`, taperedPodiumGeometry(
      segmentWidth + 0.04, topY, bottomY, topBackZ, frontZ, bottomBackZ, bottomFrontZ,
    ), materials.stone, { taperedIntoCliff: true });
    body.position.x = x;
    segment.add(body);
    for (let seam = 1; seam <= 4; seam += 1) {
      const t = seam / 5;
      const seamY = THREE.MathUtils.lerp(bottomY, topY, t);
      const seamZ = THREE.MathUtils.lerp(bottomFrontZ, frontZ, t);
      segment.add(box(`${segment.name}-course-${seam}`, [segmentWidth - 0.1, 0.045, 0.05],
        [x, seamY, seamZ + 0.025], materials.paleStone,
        { proceduralMasonrySeam: true }));
    }
    group.add(segment);
  });
  return group;
}

function createCourtyard(materials) {
  const spec = XUANKONG_LAYOUT.courtyard;
  const rearZ = mountingFace(spec, spec.floorY + 1.7);
  const frontZ = rearZ + spec.depth;
  const group = new THREE.Group();
  group.name = 'building-courtyard';
  group.userData = {
    openToSky: true,
    rearZ,
    frontZ,
    approachExtensionMetres: 6,
    sideEntryZ: frontZ - 0.68,
    dimensionsMetres: { width: spec.width, depth: spec.depth },
    dimensionAccuracy: 'public-approximation',
  };
  group.add(createMasonryPodium(spec, rearZ, frontZ, materials));
  group.add(box('courtyard-stone-terrace', [spec.width, 0.45, spec.depth],
    [spec.x, spec.floorY - 0.23, rearZ + spec.depth / 2], materials.stone,
    { openCourtSurface: true, blocksGroundPassage: false }));

  const approach = new THREE.Group();
  approach.name = 'courtyard-approach-walk';
  const approachStartX = spec.x - spec.width / 2 - group.userData.approachExtensionMetres;
  const approachEndX = spec.x - spec.width / 2;
  const approachSteps = 12;
  const approachSupport = new THREE.Group();
  approachSupport.name = 'courtyard-approach-support';
  for (let index = 0; index < approachSteps; index += 1) {
    const a = index / approachSteps;
    const b = (index + 1) / approachSteps;
    const fromX = THREE.MathUtils.lerp(approachStartX, approachEndX, a);
    const toX = THREE.MathUtils.lerp(approachStartX, approachEndX, b);
    const stepY = THREE.MathUtils.lerp(spec.floorY - 1.42, spec.floorY, b);
    approach.add(box(`courtyard-approach-step-${index}`, [toX - fromX + 0.04, 0.16, 0.92],
      [(fromX + toX) / 2, stepY - 0.08, group.userData.sideEntryZ], materials.paleStone,
      { connectedWalkway: true, blocksGroundPassage: false }));
    const supportHeight = 1.12;
    const supportTopY = stepY - 0.14;
    approachSupport.add(box(`courtyard-approach-support-${index}`,
      [toX - fromX + 0.04, supportHeight, 0.82],
      [(fromX + toX) / 2, supportTopY - supportHeight / 2, group.userData.sideEntryZ],
      materials.stone, { supportsApproachStep: index }));
  }
  group.add(approachSupport, approach);

  const enclosure = new THREE.Group();
  enclosure.name = 'courtyard-enclosure-wall';
  enclosure.add(
    box('courtyard-front-red-wall', [spec.width - 0.3, 1.18, 0.24],
      [spec.x, spec.floorY + 0.59, frontZ - 0.05], materials.redWall),
    box('courtyard-front-wall-cap', [spec.width, 0.14, 0.34],
      [spec.x, spec.floorY + 1.2, frontZ - 0.05], materials.darkTimber),
  );
  for (const sideZ of [-1, 1]) {
    for (let index = 0; index < 6; index += 1) {
      const fromX = THREE.MathUtils.lerp(approachStartX, approachEndX, index / 6);
      const toX = THREE.MathUtils.lerp(approachStartX, approachEndX, (index + 1) / 6);
      const baseY = THREE.MathUtils.lerp(spec.floorY - 1.42, spec.floorY, (index + 1) / 6);
      enclosure.add(box(`courtyard-approach-wall-${sideZ}-${index}`,
        [toX - fromX + 0.05, 0.9, 0.2],
        [(fromX + toX) / 2, baseY + 0.37, group.userData.sideEntryZ + sideZ * 0.57],
        materials.redWall));
    }
  }
  group.add(enclosure);

  const gate = new THREE.Group();
  gate.name = 'courtyard-gate';
  const gateX = approachEndX - 0.38;
  for (const sideZ of [-1, 1]) {
    gate.add(box(`courtyard-gate-jamb-${sideZ}`, [0.28, 2.05, 0.34],
      [gateX, spec.floorY + 1.02, group.userData.sideEntryZ + sideZ * 0.56], materials.redWall));
  }
  gate.add(box('courtyard-gate-lintel', [0.34, 0.2, 1.48],
    [gateX, spec.floorY + 1.98, group.userData.sideEntryZ], materials.darkTimber));
  gate.add(createHippedRoof('courtyard-gate-roof', 1.3, 2.05, spec.floorY + 2.02,
    gateX, group.userData.sideEntryZ, materials, 0.5));
  group.add(gate);

  group.add(
    createEnclosedPavilion('courtyard-bell-pavilion', spec.x - 3.7, spec.floorY,
      rearZ + 1.05, 2.45, 1.65, materials, true),
    createEnclosedPavilion('courtyard-drum-pavilion', spec.x + 3.7, spec.floorY + 0.28,
      rearZ + 1.05, 2.45, 1.65, materials, true),
  );

  const hall = new THREE.Group();
  hall.name = 'courtyard-cliffside-hall';
  const hallBody = new THREE.Group();
  hallBody.name = 'courtyard-hall-body';
  hallBody.add(box('courtyard-hall-rear-wall', [6.3, 2.25, 0.3],
    [spec.x, spec.floorY + 1.13, rearZ + 0.23], materials.redWall));
  for (const x of [spec.x - 2.55, spec.x - 1.28, spec.x, spec.x + 1.28, spec.x + 2.55]) {
    hallBody.add(box(`courtyard-hall-column-${x}`, [0.18, 2.28, 0.18],
      [x, spec.floorY + 1.14, rearZ + 1.02], materials.timber));
  }
  hallBody.add(box('courtyard-hall-front-lintel', [6.4, 0.18, 0.2],
    [spec.x, spec.floorY + 2.18, rearZ + 1.02], materials.darkTimber));
  const hallDoors = new THREE.Group();
  hallDoors.name = 'courtyard-hall-doors';
  hallDoors.add(
    box('courtyard-hall-door-left', [0.82, 1.72, 0.1],
      [spec.x - 1.82, spec.floorY + 0.92, rearZ + 1.13], materials.door),
    box('courtyard-hall-door-centre', [0.82, 1.72, 0.1],
      [spec.x, spec.floorY + 0.92, rearZ + 1.13], materials.door),
    box('courtyard-hall-door-right', [0.82, 1.72, 0.1],
      [spec.x + 1.82, spec.floorY + 0.92, rearZ + 1.13], materials.door),
  );
  hall.add(hallBody, hallDoors);
  hall.add(createHippedRoof('courtyard-hall-roof', 6.6, 1.72, spec.floorY + 2.24,
    spec.x, rearZ + 0.62, materials, 0.52));
  const upperStorey = new THREE.Group();
  upperStorey.name = 'courtyard-hall-upper-storey';
  upperStorey.add(
    box('courtyard-hall-upper-back-wall', [4.75, 0.92, 0.22],
      [spec.x, spec.floorY + 2.76, rearZ + 0.18], materials.redWall),
    box('courtyard-hall-upper-lintel', [4.85, 0.15, 0.18],
      [spec.x, spec.floorY + 3.16, rearZ + 0.62], materials.darkTimber),
  );
  for (const x of [spec.x - 2.2, spec.x - 0.73, spec.x + 0.73, spec.x + 2.2]) {
    upperStorey.add(box(`courtyard-hall-upper-column-${x}`, [0.15, 0.96, 0.15],
      [x, spec.floorY + 2.72, rearZ + 0.62], materials.timber));
  }
  upperStorey.add(createHippedRoof('courtyard-hall-upper-roof', 5.45, 1.35,
    spec.floorY + 3.18, spec.x, rearZ + 0.42, materials, 0.46));
  hall.add(upperStorey);
  group.add(hall);
  return group;
}

function createBridge(southTower, northTower, materials) {
  const spec = XUANKONG_LAYOUT.bridge;
  const start = new THREE.Vector3(spec.fromX, spec.fromY, southTower.userData.rearZ + 1.2);
  const end = new THREE.Vector3(spec.toX, spec.toY, northTower.userData.rearZ + 1.2);
  const group = new THREE.Group();
  group.name = 'building-bridge';
  group.userData = {
    width: spec.width,
    endpoints: [start.toArray(), end.toArray()].map(([x, y, z]) => ({ x, y, z })),
    documentedLengthMetres: 'about 10',
    geometryLengthMetres: start.distanceTo(end),
    widthAccuracy: 'public-less-than-one-metre',
  };

  const walkway = new THREE.Group();
  walkway.name = 'bridge-walkway';
  const steps = 12;
  for (let index = 0; index < steps; index += 1) {
    const fromT = index / steps;
    const toT = (index + 1) / steps;
    const a = start.clone().lerp(end, fromT);
    const b = start.clone().lerp(end, toT);
    const centre = a.clone().add(b).multiplyScalar(0.5);
    walkway.add(box(`bridge-step-${index}`, [b.x - a.x + 0.05, 0.16, spec.width],
      [centre.x, b.y - 0.08, centre.z], materials.timber,
      { connectedWalkway: true }));
  }
  group.add(walkway);

  const rails = new THREE.Group();
  rails.name = 'bridge-rails';
  for (const side of [-1, 1]) {
    let previousTop = null;
    for (let index = 0; index <= 8; index += 1) {
      const point = start.clone().lerp(end, index / 8);
      point.z += side * spec.width * 0.42;
      rails.add(box(`bridge-rail-post-${side}-${index}`, [0.09, 0.92, 0.09],
        [point.x, point.y + 0.46, point.z], materials.darkTimber));
      const top = point.clone().add(new THREE.Vector3(0, 0.92, 0));
      if (previousTop) rails.add(cylinderBetween(`bridge-top-rail-${side}-${index}`, previousTop, top, 0.055, materials.darkTimber));
      previousTop = top;
    }
  }
  group.add(rails);

  const lowerPoint = start.clone().lerp(end, 0.3);
  const upperPoint = start.clone().lerp(end, 0.82);
  const lowerHall = createEnclosedPavilion('bridge-lower-attached-hall', lowerPoint.x,
    lowerPoint.y - 0.08, lowerPoint.z - 0.92, 1.85, 1.42, materials);
  lowerHall.userData.photoGuidedRole = 'lower-bridge-annex';
  const upperHall = createEnclosedPavilion('bridge-upper-attached-hall', upperPoint.x,
    upperPoint.y - 0.08, upperPoint.z - 0.92, 1.72, 1.34, materials);
  upperHall.userData.photoGuidedRole = 'upper-bridge-annex';
  const grotto = new THREE.Group();
  grotto.name = 'bridge-grotto-pavilion';
  grotto.userData = { photoGuidedRole: 'bridge-side-enclosed-annex' };
  grotto.add(lowerHall);
  group.add(grotto, upperHall);

  const coveredStart = start.clone().lerp(end, 0.43);
  const coveredEnd = start.clone().lerp(end, 0.72);
  const coveredStair = new THREE.Group();
  coveredStair.name = 'bridge-covered-stair';
  const coveredSteps = 5;
  coveredStair.userData = {
    connectedPath: true,
    stepCount: coveredSteps,
    endpoints: [coveredStart, coveredEnd].map((point) => ({ x: point.x, y: point.y, z: point.z })),
  };
  for (let index = 0; index < coveredSteps; index += 1) {
    const a = coveredStart.clone().lerp(coveredEnd, index / coveredSteps);
    const b = coveredStart.clone().lerp(coveredEnd, (index + 1) / coveredSteps);
    const centre = a.clone().add(b).multiplyScalar(0.5);
    coveredStair.add(box(`bridge-covered-step-${index}`, [b.x - a.x + 0.05, 0.13, spec.width - 0.08],
      [centre.x, b.y + 0.005, centre.z], materials.paleStone,
      { connectedWalkway: true, blocksGroundPassage: false }));
  }
  for (const point of [coveredStart, coveredEnd]) {
    for (const side of [-1, 1]) {
      coveredStair.add(box(`bridge-covered-stair-post-${point.x}-${side}`, [0.13, 1.86, 0.13],
        [point.x, point.y + 0.93, point.z + side * 0.48], materials.timber));
    }
  }
  const coverCentre = coveredStart.clone().add(coveredEnd).multiplyScalar(0.5);
  coveredStair.add(createHippedRoof('bridge-covered-stair-roof',
    coveredEnd.x - coveredStart.x + 0.75, 1.55, coveredEnd.y + 1.82,
    coverCentre.x, coverCentre.z, materials, 0.44));
  group.add(coveredStair);
  group.userData.exposedStepCount = steps - coveredSteps;
  return group;
}

function createEntryStair(courtyard, southTower, materials) {
  const court = XUANKONG_LAYOUT.courtyard;
  const south = XUANKONG_LAYOUT.southTower;
  const start = new THREE.Vector3(court.x + court.width / 2 - 1.3, court.floorY, courtyard.userData.rearZ + 2.15);
  const end = new THREE.Vector3(south.x - south.width / 2, south.floorY, southTower.userData.rearZ + 1.2);
  const group = new THREE.Group();
  group.name = 'courtyard-south-stair';
  const stepCount = 10;
  group.userData = {
    connectedPath: true,
    stepCount,
    endpoints: [start.toArray(), end.toArray()].map(([x, y, z]) => ({ x, y, z })),
  };
  for (let index = 0; index < stepCount; index += 1) {
    const a = start.clone().lerp(end, index / stepCount);
    const b = start.clone().lerp(end, (index + 1) / stepCount);
    const centre = a.clone().add(b).multiplyScalar(0.5);
    group.add(box(`courtyard-south-step-${index}`, [Math.abs(b.x - a.x) + 0.08, 0.17, 0.9],
      [centre.x, b.y - 0.085, centre.z], materials.paleStone,
      { connectedWalkway: true, blocksGroundPassage: false }));
  }
  for (const side of [-1, 1]) {
    let previousTop = null;
    for (let index = 0; index <= 5; index += 1) {
      const point = start.clone().lerp(end, index / 5);
      point.z += side * 0.38;
      group.add(box(`courtyard-south-stair-post-${side}-${index}`, [0.09, 0.78, 0.09],
        [point.x, point.y + 0.39, point.z], materials.darkTimber));
      const top = point.clone().add(new THREE.Vector3(0, 0.78, 0));
      if (previousTop) group.add(cylinderBetween(
        `courtyard-south-stair-rail-${side}-${index}`, previousTop, top, 0.05, materials.darkTimber,
      ));
      previousTop = top;
    }
  }
  return group;
}

function createStructure(southTower, bridge, northTower, materials) {
  const group = new THREE.Group();
  group.name = 'building-structure';
  group.userData = { focus: 'visible-cantilever-beams-posts-and-braces', insertionDepthMetres: 1.1 };
  const bridgeEnds = bridge.userData.endpoints;
  const supports = [
    [-6, XUANKONG_LAYOUT.southTower.floorY - 0.2, southTower.userData.frontZ - 0.45],
    [-3, XUANKONG_LAYOUT.southTower.floorY - 0.2, southTower.userData.frontZ - 0.45],
    [0, XUANKONG_LAYOUT.southTower.floorY - 0.2, southTower.userData.frontZ - 0.45],
    [4, THREE.MathUtils.lerp(bridgeEnds[0].y, bridgeEnds[1].y, 3 / 8) - 0.18,
      THREE.MathUtils.lerp(bridgeEnds[0].z, bridgeEnds[1].z, 3 / 8)],
    [7, THREE.MathUtils.lerp(bridgeEnds[0].y, bridgeEnds[1].y, 6 / 8) - 0.18,
      THREE.MathUtils.lerp(bridgeEnds[0].z, bridgeEnds[1].z, 6 / 8)],
    [9.5, XUANKONG_LAYOUT.northTower.floorY - 0.2, northTower.userData.frontZ - 0.45],
    [12, XUANKONG_LAYOUT.northTower.floorY - 0.2, northTower.userData.frontZ - 0.45],
    [14.5, XUANKONG_LAYOUT.northTower.floorY - 0.2, northTower.userData.frontZ - 0.45],
  ];

  supports.forEach(([x, ceilingY, frontEndZ], index) => {
    const face = cliffFaceZ(x, ceilingY);
    const rearEndZ = face - 1.1;
    group.add(box(`cantilever-beam-${index}`, [0.28, 0.3, frontEndZ - rearEndZ],
      [x, ceilingY, (rearEndZ + frontEndZ) / 2], materials.darkTimber,
      { kind: 'cantilever-beam', sampleX: x, sampleY: ceilingY, rearEndZ, frontEndZ }));
    const postZ = Math.min(frontEndZ - 0.25, face + 2.15);
    const bottomY = cliffFootY(x, postZ, ceilingY);
    if (bottomY === null || ceilingY - bottomY <= 1) return;
    group.add(box(`vertical-post-${index}`, [0.22, ceilingY - bottomY, 0.22],
      [x, (ceilingY + bottomY) / 2, postZ], materials.timber,
      { kind: 'vertical-post', sampleX: x, sampleZ: postZ, ceilingY, bottomY }));
    const braceStart = new THREE.Vector3(x, Math.min(ceilingY - 0.7, bottomY + 1.2), postZ);
    const braceEnd = new THREE.Vector3(x, ceilingY - 0.16, frontEndZ - 0.08);
    group.add(cylinderBetween(`diagonal-brace-${index}`, braceStart, braceEnd, 0.08, materials.timber,
      { kind: 'diagonal-brace' }));
  });
  return group;
}

function anchorAbove(object, extra = 0.55) {
  const bounds = new THREE.Box3().setFromObject(object);
  return new THREE.Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    bounds.max.y + extra,
    (bounds.min.z + bounds.max.z) / 2,
  );
}

/**
 * Builds the temple against the shared sampled cliff face. Published overall
 * dimensions guide the massing; storey details and hidden construction remain
 * an image-guided artistic reconstruction.
 */
export function createXuankongArchitecture() {
  const materials = createMaterials();
  const group = new THREE.Group();
  group.name = 'xuankong-architecture';
  group.userData = {
    kind: 'artistic-approximation',
    orientation: XUANKONG_LAYOUT.orientation,
    sourceBoundary: 'public-dimensions-photo-guided-detail-no-survey-drawings',
  };
  const courtyard = createCourtyard(materials);
  const southTower = createTower('south-tower', XUANKONG_LAYOUT.southTower, materials);
  const northTower = createTower('north-tower', XUANKONG_LAYOUT.northTower, materials);
  courtyard.add(createEntryStair(courtyard, southTower, materials));
  const bridge = createBridge(southTower, northTower, materials);
  const structure = createStructure(southTower, bridge, northTower, materials);
  group.add(courtyard, southTower, bridge, northTower, structure);
  group.updateMatrixWorld(true);
  const anchors = {
    courtyard: anchorAbove(courtyard),
    'south-tower': anchorAbove(southTower),
    bridge: anchorAbove(bridge, 0.35),
    'north-tower': anchorAbove(northTower),
    structure: anchorAbove(structure, 0.3),
  };

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const geometries = new Set();
    const ownedMaterials = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.filter(Boolean).forEach((material) => ownedMaterials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    ownedMaterials.forEach((material) => material.dispose());
  };
  return { group, anchors, dispose };
}
