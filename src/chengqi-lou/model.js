import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHENGQI_LAYOUT } from './layout.js';

const TAU = Math.PI * 2;

function surface(color, roughness = 0.9, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...options });
}

function createMaterials() {
  return {
    rammedEarth: surface('#b98a52', 0.98),
    rammedEarthLight: surface('#d0a66c', 0.97),
    limeEarth: surface('#c6bca6', 0.98),
    courtyardWall: surface('#b9b5a6', 0.96),
    earthDark: surface('#7d5938', 1),
    timber: surface('#6b3023', 0.9),
    timberDark: surface('#3e241d', 0.92),
    door: surface('#553027', 0.92),
    tile: surface('#434743', 0.94, { side: THREE.DoubleSide }),
    tileEdge: surface('#303531', 0.92),
    stone: surface('#8f897b', 1),
    paving: surface('#aaa28d', 1),
    soil: surface('#6b6448', 1),
    grass: surface('#556b45', 1),
    road: surface('#817866', 1),
    trunk: surface('#493426', 1),
    leaves: surface('#386044', 1),
    bamboo: surface('#73824e', 0.88),
    bambooLeaves: surface('#294f38', 0.94),
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

function transformed(geometry, position = [0, 0, 0], quaternion = new THREE.Quaternion(), scale = [1, 1, 1]) {
  geometry.deleteAttribute('uv');
  geometry.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(...position), quaternion, new THREE.Vector3(...scale),
  ));
  return geometry;
}

function mergedMesh(name, geometries, material, userData = {}) {
  const geometry = mergeGeometries(geometries, false);
  if (!geometry) throw new Error(`Unable to assemble ${name}`);
  geometries.forEach((part) => part.dispose());
  return mesh(name, geometry, material, userData);
}

function angularDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function inDoorway(theta, radius, directions, width = CHENGQI_LAYOUT.entranceWidth) {
  const halfAngle = Math.asin(Math.min(0.95, width / 2 / radius));
  return directions.some((direction) => angularDistance(theta, direction) < halfAngle);
}

function annularSectorGeometry(innerRadius, outerRadius, bottom, top, start, end, segments = 1) {
  const positions = [];
  const indices = [];
  for (let index = 0; index <= segments; index += 1) {
    const theta = THREE.MathUtils.lerp(start, end, index / segments);
    const sine = Math.sin(theta), cosine = Math.cos(theta);
    positions.push(
      sine * innerRadius, bottom, cosine * innerRadius,
      sine * outerRadius, bottom, cosine * outerRadius,
      sine * innerRadius, top, cosine * innerRadius,
      sine * outerRadius, top, cosine * outerRadius,
    );
  }
  for (let index = 0; index < segments; index += 1) {
    const offset = index * 4;
    const next = offset + 4;
    indices.push(
      offset, next, offset + 1, offset + 1, next, next + 1,
      offset + 2, offset + 3, next + 2, offset + 3, next + 3, next + 2,
      offset, offset + 2, next, offset + 2, next + 2, next,
      offset + 1, next + 1, offset + 3, offset + 3, next + 1, next + 3,
    );
  }
  const last = segments * 4;
  indices.push(0, 1, 2, 1, 3, 2, last, last + 2, last + 1, last + 1, last + 2, last + 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const hardEdged = geometry.toNonIndexed();
  geometry.dispose();
  hardEdged.computeVertexNormals();
  return hardEdged;
}

function ringWallGeometry(spec, bottom, top, bayCount, doorwayDirections = []) {
  const parts = [];
  const step = TAU / bayCount;
  const middleRadius = (spec.outerRadius + spec.innerRadius) / 2;
  for (let bay = 0; bay < bayCount; bay += 1) {
    const theta = bay * step;
    if (inDoorway(theta, middleRadius, doorwayDirections, CHENGQI_LAYOUT.entranceWidth + middleRadius * step)) continue;
    parts.push(annularSectorGeometry(
      spec.innerRadius, spec.outerRadius, bottom, top,
      theta - step * 0.5, theta + step * 0.5, 1,
    ));
  }
  const geometry = mergeGeometries(parts, false);
  if (!geometry) throw new Error(`Unable to make ring wall ${spec.id}`);
  parts.forEach((part) => part.dispose());
  return geometry;
}

function solidRingGeometry(innerRadius, outerRadius, bottom, top, segments = 96) {
  return annularSectorGeometry(innerRadius, outerRadius, bottom, top, 0, TAU, segments);
}

function roofRingGeometry(innerRadius, outerRadius, eaveY, rise, segments = 96) {
  const ridgeRadius = (innerRadius + outerRadius) / 2;
  const profiles = [
    [outerRadius, eaveY], [ridgeRadius, eaveY + rise], [innerRadius, eaveY],
    [outerRadius, eaveY - 0.28], [ridgeRadius, eaveY + rise - 0.28], [innerRadius, eaveY - 0.28],
  ];
  const positions = [];
  const indices = [];
  for (let index = 0; index <= segments; index += 1) {
    const theta = index / segments * TAU;
    for (const [radius, y] of profiles) positions.push(Math.sin(theta) * radius, y, Math.cos(theta) * radius);
  }
  for (let index = 0; index < segments; index += 1) {
    const a = index * profiles.length;
    const b = (index + 1) * profiles.length;
    for (const [first, second] of [[0, 1], [1, 2]]) {
      indices.push(a + first, b + first, a + second, a + second, b + first, b + second);
    }
    for (const [first, second] of [[3, 4], [4, 5]]) {
      indices.push(a + first, a + second, b + first, a + second, b + second, b + first);
    }
    indices.push(a, a + 3, b, a + 3, b + 3, b);
    indices.push(a + 2, b + 2, a + 5, a + 5, b + 2, b + 5);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function instanced(name, geometry, material, transforms) {
  geometry.deleteAttribute('uv');
  const object = new THREE.InstancedMesh(geometry, material, transforms.length);
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  transforms.forEach((matrix, index) => object.setMatrixAt(index, matrix));
  object.instanceMatrix.needsUpdate = true;
  return object;
}

function radialMatrix(theta, radius, y, scale = [1, 1, 1]) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(Math.sin(theta) * radius, y, Math.cos(theta) * radius),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, theta, 0)),
    new THREE.Vector3(...scale),
  );
}

function createTileRibs(name, innerEave, outerEave, eaveY, rise, count, material) {
  const ridge = (innerEave + outerEave) / 2;
  const transforms = [];
  const source = new THREE.Vector3(0, 0, 1);
  for (let index = 0; index < count; index += 1) {
    const theta = index / count * TAU;
    for (const [fromRadius, toRadius] of [[outerEave - 0.15, ridge], [innerEave + 0.15, ridge]]) {
      const from = new THREE.Vector3(Math.sin(theta) * fromRadius, eaveY + 0.08, Math.cos(theta) * fromRadius);
      const to = new THREE.Vector3(Math.sin(theta) * toRadius, eaveY + rise + 0.08, Math.cos(theta) * toRadius);
      const direction = to.clone().sub(from);
      transforms.push(new THREE.Matrix4().compose(
        from.clone().add(to).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(source, direction.clone().normalize()),
        new THREE.Vector3(1, 1, direction.length()),
      ));
    }
  }
  return instanced(name, new THREE.BoxGeometry(0.075, 0.075, 1), material, transforms);
}

function torus(name, radius, tube, y, material, userData = {}) {
  const object = mesh(name, new THREE.TorusGeometry(radius, tube, 6, 96), material, userData);
  object.rotation.x = Math.PI / 2;
  object.position.y = y;
  return object;
}

function createWindowedFloors(spec, floorHeight, startFloor, endFloor, material, prefix) {
  const bayAngle = TAU / spec.roomCount;
  const bayWidth = spec.outerRadius * bayAngle;
  const openingWidth = Math.min(0.62, bayWidth * 0.24);
  const openingHalfAngle = openingWidth / (spec.outerRadius * 2);
  const openingHeight = 0.74;
  const openingCenter = floorHeight * 0.61;
  const parts = [];
  for (let floor = startFloor; floor < endFloor; floor += 1) {
    const floorBottom = floor * floorHeight;
    const floorTop = floorBottom + floorHeight;
    const openingBottom = floorBottom + openingCenter - openingHeight / 2;
    const openingTop = floorBottom + openingCenter + openingHeight / 2;
    for (let bay = 0; bay < spec.roomCount; bay += 1) {
      const theta = bay * bayAngle;
      const bayStart = theta - bayAngle / 2;
      const bayEnd = theta + bayAngle / 2;
      const openingStart = theta - openingHalfAngle;
      const openingEnd = theta + openingHalfAngle;
      parts.push(
        annularSectorGeometry(spec.innerRadius, spec.outerRadius, floorBottom, floorTop,
          bayStart, openingStart, 1),
        annularSectorGeometry(spec.innerRadius, spec.outerRadius, floorBottom, floorTop,
          openingEnd, bayEnd, 1),
        annularSectorGeometry(spec.innerRadius, spec.outerRadius, floorBottom, openingBottom,
          openingStart, openingEnd, 1),
        annularSectorGeometry(spec.innerRadius, spec.outerRadius, openingTop, floorTop,
          openingStart, openingEnd, 1),
      );
    }
  }
  return mergedMesh(`${prefix}-windowed-floors`, parts, material, {
    windowOpenings: spec.roomCount * (endFloor - startFloor),
    construction: 'non-overlapping-annular-sectors',
  });
}

function createOuterStairs(material) {
  const parts = [];
  const steps = 13;
  const radius = 28.75;
  const baseAngles = [2.48, -2.48, 2.48];
  for (let flight = 0; flight < 3; flight += 1) {
    const startY = flight * 4.1 + 0.12;
    const direction = flight % 2 ? -1 : 1;
    for (let step = 0; step < steps; step += 1) {
      const theta = baseAngles[flight] + direction * (step / steps - 0.5) * 0.16;
      const height = 0.19 + step / steps * 3.75;
      parts.push(transformed(
        new THREE.BoxGeometry(0.46, 0.18, 1.15),
        [Math.sin(theta) * radius, startY + height, Math.cos(theta) * radius],
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, theta, 0)),
      ));
    }
  }
  return mergedMesh('outer-ring-visible-stairs', parts, material, {
    flightCount: 3, accuracy: 'artistic-visible-gallery-circulation',
  });
}

function createOuterRing(materials) {
  const spec = CHENGQI_LAYOUT.rings[0];
  const floorHeight = spec.wallHeight / spec.floors;
  const group = new THREE.Group();
  group.name = 'building-outer-ring';
  group.userData = {
    radialEnvelope: { innerRadius: spec.innerRadius, outerRadius: spec.outerRadius },
    floorCount: spec.floors, roomCountPerFloor: spec.roomCount,
    wallHeightMetres: spec.wallHeight, wallHeightAccuracy: spec.heightAccuracy,
  };
  const doorwayDirections = [0, Math.PI / 2, -Math.PI / 2];
  group.add(mesh('outer-ring-ground-wall', ringWallGeometry(
    spec, 0.18, floorHeight, spec.roomCount, doorwayDirections,
  ), materials.rammedEarth, { blocksGroundPassage: true, actualDoorwayVoids: true }));
  group.add(
    mesh('outer-ring-second-floor-wall', solidRingGeometry(
      spec.innerRadius, spec.outerRadius, floorHeight, floorHeight * 2, 96,
    ), materials.rammedEarth),
    createWindowedFloors(spec, floorHeight, 2, spec.floors, materials.rammedEarth, 'outer-wall'),
  );

  const galleryInner = spec.innerRadius - 1.35;
  const galleryOuter = spec.innerRadius + 0.12;
  const slabs = [];
  for (let floor = 1; floor <= spec.floors; floor += 1) {
    slabs.push(solidRingGeometry(galleryInner, galleryOuter, floor * floorHeight - 0.18, floor * floorHeight, 96));
  }
  group.add(mergedMesh('outer-ring-gallery-slabs', slabs, materials.timberDark));

  const columnTransforms = [];
  const doorTransforms = [];
  const railTransforms = [];
  const bayAngle = TAU / spec.roomCount;
  for (let floor = 0; floor < spec.floors; floor += 1) {
    for (let bay = 0; bay < spec.roomCount; bay += 1) {
      const theta = bay * bayAngle;
      const groundDoorway = floor === 0 && inDoorway(theta, spec.innerRadius, doorwayDirections, 6.1);
      if (!groundDoorway) {
        columnTransforms.push(radialMatrix(theta, galleryInner + 0.08,
          floor * floorHeight + floorHeight / 2, [1, floorHeight / 3.5, 1]));
        doorTransforms.push(radialMatrix(theta, spec.innerRadius + 0.07,
          floor * floorHeight + 1.22));
      }
      if (floor > 0 && !groundDoorway) {
        for (const height of [0.48, 1.05]) {
          railTransforms.push(radialMatrix(theta, galleryInner - 0.02,
            floor * floorHeight + height));
        }
      }
    }
  }
  group.add(
    instanced('outer-ring-gallery-columns', new THREE.CylinderGeometry(0.13, 0.15, 3.5, 7),
      materials.timber, columnTransforms),
    instanced('outer-ring-room-doors', new THREE.BoxGeometry(1.45, 2.25, 0.12),
      materials.door, doorTransforms),
    instanced('outer-ring-gallery-rails', new THREE.BoxGeometry(bayAngle * galleryInner * 0.88, 0.09, 0.1),
      materials.timberDark, railTransforms),
  );
  const beams = new THREE.Group();
  beams.name = 'outer-ring-gallery-beams';
  for (let floor = 1; floor <= spec.floors; floor += 1) {
    beams.add(torus(`outer-gallery-beam-${floor}`, galleryInner, 0.10,
      floor * floorHeight - 0.10, materials.timberDark));
  }
  group.add(beams, createOuterStairs(materials.timber));

  const roofInner = spec.innerRadius - 1.15;
  const roofOuter = spec.outerRadius + 0.60;
  group.add(
    mesh('outer-ring-roof-surface', roofRingGeometry(roofInner, roofOuter, spec.wallHeight, spec.roofRise), materials.tile,
      { roofSurface: true, sourceAccuracy: 'artistic-profile' }),
    torus('outer-ring-outer-eave', roofOuter, 0.18, spec.wallHeight - 0.03, materials.tileEdge),
    torus('outer-ring-inner-eave', roofInner, 0.18, spec.wallHeight - 0.03, materials.tileEdge),
    torus('outer-ring-roof-ridge', (roofInner + roofOuter) / 2, 0.15,
      spec.wallHeight + spec.roofRise + 0.02, materials.tileEdge),
    createTileRibs('outer-ring-roof-tile-ribs', roofInner, roofOuter, spec.wallHeight,
      spec.roofRise, spec.roomCount, materials.tileEdge),
  );
  return group;
}

function createInnerRing(spec, materials, doorwayDirections) {
  const group = new THREE.Group();
  group.name = spec.id;
  group.userData = {
    radialEnvelope: { innerRadius: spec.innerRadius, outerRadius: spec.outerRadius },
    floorCount: spec.floors, roomCountPerFloor: spec.roomCount,
    wallHeightMetres: spec.wallHeight, wallHeightAccuracy: spec.heightAccuracy,
    passageCount: spec.passageCount ?? 1,
  };
  const floorHeight = spec.wallHeight / spec.floors;
  group.add(mesh(`${spec.id}-ground-wall`, ringWallGeometry(
    spec, 0.16, floorHeight, spec.roomCount, doorwayDirections,
  ), materials.rammedEarthLight, { blocksGroundPassage: true, actualDoorwayVoids: true }));
  if (spec.floors > 1) {
    group.add(createWindowedFloors(spec, floorHeight, 1, spec.floors, materials.rammedEarthLight, spec.id));
  }
  const doorTransforms = [];
  const columnTransforms = [];
  const step = TAU / spec.roomCount;
  for (let floor = 0; floor < spec.floors; floor += 1) {
    for (let bay = 0; bay < spec.roomCount; bay += 1) {
      const theta = bay * step;
      if (floor === 0 && inDoorway(theta, spec.innerRadius, doorwayDirections,
        CHENGQI_LAYOUT.entranceWidth + 1.2)) continue;
      doorTransforms.push(radialMatrix(theta, spec.innerRadius + 0.06, floor * floorHeight + 1.18));
      columnTransforms.push(radialMatrix(theta, spec.innerRadius - 0.45,
        floor * floorHeight + floorHeight / 2, [1, floorHeight / 3.2, 1]));
    }
  }
  group.add(
    instanced(`${spec.id}-room-doors`, new THREE.BoxGeometry(Math.min(1.35, step * spec.innerRadius * 0.56), 2.16, 0.10),
      materials.door, doorTransforms),
    instanced(`${spec.id}-gallery-columns`, new THREE.CylinderGeometry(0.10, 0.12, 3.2, 6),
      materials.timber, columnTransforms),
  );
  if (spec.floors > 1) {
    group.add(mesh(`${spec.id}-gallery-slab`, solidRingGeometry(
      spec.innerRadius - 0.8, spec.innerRadius + 0.1, floorHeight - 0.16, floorHeight, 64,
    ), materials.timberDark));
  }
  const roofInner = spec.innerRadius - 0.65;
  const roofOuter = spec.outerRadius + 0.68;
  group.add(
    mesh(`${spec.id}-roof-surface`, roofRingGeometry(roofInner, roofOuter, spec.wallHeight, spec.roofRise, 72), materials.tile,
      { roofSurface: true, sourceAccuracy: 'artistic-profile' }),
    torus(`${spec.id}-outer-eave`, roofOuter, 0.15, spec.wallHeight - 0.02, materials.tileEdge),
    torus(`${spec.id}-inner-eave`, roofInner, 0.15, spec.wallHeight - 0.02, materials.tileEdge),
    torus(`${spec.id}-roof-ridge`, (roofInner + roofOuter) / 2, 0.13,
      spec.wallHeight + spec.roofRise + 0.02, materials.tileEdge),
    createTileRibs(`${spec.id}-roof-tile-ribs`, roofInner, roofOuter, spec.wallHeight,
      spec.roofRise, spec.roomCount, materials.tileEdge),
  );
  return group;
}

function gableRoofGeometry(width, depth, rise) {
  const halfWidth = width / 2, halfDepth = depth / 2;
  const positions = [
    -halfWidth, 0, -halfDepth, halfWidth, 0, -halfDepth, 0, rise, -halfDepth,
    -halfWidth, 0, halfDepth, halfWidth, 0, halfDepth, 0, rise, halfDepth,
  ];
  const indices = [0, 1, 2, 5, 4, 3, 0, 3, 1, 1, 3, 4, 0, 2, 3, 2, 5, 3, 1, 4, 2, 2, 4, 5];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const hardEdged = geometry.toNonIndexed();
  geometry.dispose();
  hardEdged.computeVertexNormals();
  return hardEdged;
}

function createAncestralHall(materials) {
  const spec = CHENGQI_LAYOUT.ancestralHall;
  const group = new THREE.Group();
  group.name = 'building-ancestral-hall';
  group.userData = {
    documentedAreaSquareMetres: spec.documentedAreaSquareMetres,
    footprintAccuracy: spec.footprintAccuracy,
  };
  const body = box('ancestral-hall-body', [spec.width, spec.wallHeight, spec.depth],
    [spec.x, spec.wallHeight / 2 + 0.18, spec.z], materials.rammedEarthLight);
  const front = spec.z + spec.depth / 2;
  const columns = [];
  for (const x of [-3.7, -1.85, 0, 1.85, 3.7]) {
    columns.push(transformed(new THREE.CylinderGeometry(0.15, 0.18, 3.6, 8),
      [x, 2.0, front + 0.28]));
  }
  const courtDepth = CHENGQI_LAYOUT.rings[2].innerRadius - front - 0.7;
  group.add(
    box('ancestral-hall-plinth', [spec.width + 1.0, 0.36, spec.depth + 0.8],
      [spec.x, 0.18, spec.z], materials.stone),
    body,
    box('ancestral-hall-front-doors', [5.8, 2.8, 0.12], [0, 1.72, front + 0.065], materials.door),
    mergedMesh('ancestral-hall-front-columns', columns, materials.timber),
    box('ancestral-front-court', [9.8, 0.16, courtDepth],
      [0, 0.16, front + courtDepth / 2], materials.paving, { openCourt: true }),
  );
  const roof = mesh('ancestral-hall-roof', gableRoofGeometry(spec.width + 1.6, spec.depth + 1.5, 2.0), materials.tile,
    { roofSurface: true, sourceAccuracy: 'artistic-profile' });
  roof.position.set(spec.x, spec.wallHeight + 0.18, spec.z);
  group.add(roof);
  const ridge = box('ancestral-hall-ridge', [0.22, 0.22, spec.depth + 1.8],
    [spec.x, spec.wallHeight + 2.22, spec.z], materials.tileEdge);
  group.add(ridge);
  return group;
}

function createEntranceJambs(label, theta, materials) {
  const radius = CHENGQI_LAYOUT.rings[0].outerRadius + 0.15;
  const width = CHENGQI_LAYOUT.entranceWidth;
  const parts = [];
  for (const side of [-1, 1]) {
    parts.push(transformed(new THREE.BoxGeometry(0.65, 3.85, 1.05),
      [side * (width / 2 + 0.18), 2.08, 0], new THREE.Quaternion()));
  }
  parts.push(transformed(new THREE.BoxGeometry(width + 1.0, 0.58, 1.05), [0, 4.08, 0]));
  const object = mergedMesh(`entrance-${label}-stone-jambs`, parts, materials.stone, {
    structuralDoorway: true, facadePatch: false,
  });
  object.position.set(Math.sin(theta) * radius, 0, Math.cos(theta) * radius);
  object.rotation.y = theta;
  return object;
}

function createEntrances(materials) {
  const group = new THREE.Group();
  group.name = 'building-entrance';
  group.userData = { entranceDirections: ['south'], doorwayVoids: true, hotspotScope: 'south-main-gate' };
  group.add(
    createEntranceJambs('south', 0, materials),
    box('entrance-passage-floor', [4.25, 0.13, 31], [0, 0.14, 22.4], materials.paving,
      { blocksGroundPassage: false, connectsToCentralCourt: true }),
  );
  return group;
}

function createSideEntrances(materials) {
  const group = new THREE.Group();
  group.name = 'building-side-entrances';
  group.userData = { entranceDirections: ['east', 'west'], doorwayVoids: true, hotspotScope: 'none' };
  group.add(
    createEntranceJambs('east', Math.PI / 2, materials),
    createEntranceJambs('west', -Math.PI / 2, materials),
  );
  return group;
}

function createRoundNeighbor(spec, materials) {
  const group = new THREE.Group();
  group.name = `neighbor-${spec.id}`;
  group.position.set(spec.x, 0, spec.z);
  group.rotation.y = spec.rotationY ?? 0;
  group.userData = {
    label: spec.label,
    type: spec.type,
    placementAccuracy: spec.placementAccuracy,
    floorCount: spec.floors,
    documentedDimensions: spec.documentedDimensions,
    openCourtyard: true,
  };
  const floorHeight = spec.wallHeight / spec.floors;
  const doorwayDirections = [0];
  const galleryInner = spec.innerRadius - 1.05;
  const gallerySlabs = [];
  for (let floor = 1; floor < spec.floors; floor += 1) {
    gallerySlabs.push(solidRingGeometry(
      galleryInner, spec.innerRadius + 0.08,
      floor * floorHeight - 0.16, floor * floorHeight, 64,
    ));
  }
  const columnTransforms = [];
  const doorTransforms = [];
  const railTransforms = [];
  const windowTransforms = [];
  const bayAngle = TAU / spec.roomCount;
  for (let floor = 0; floor < spec.floors; floor += 1) {
    for (let bay = 0; bay < spec.roomCount; bay += 1) {
      const theta = bay * bayAngle;
      const doorway = floor === 0 && inDoorway(theta, spec.innerRadius, doorwayDirections, 5.4);
      if (!doorway) {
        columnTransforms.push(radialMatrix(theta, galleryInner + 0.08,
          floor * floorHeight + floorHeight / 2, [1, floorHeight / 3.2, 1]));
        doorTransforms.push(radialMatrix(theta, spec.innerRadius + 0.06,
          floor * floorHeight + 1.12));
      }
      if (floor > 0) {
        railTransforms.push(radialMatrix(theta, galleryInner,
          floor * floorHeight + 0.62));
        windowTransforms.push(radialMatrix(theta, spec.outerRadius + 0.035,
          floor * floorHeight + floorHeight * 0.58));
      }
    }
  }
  group.add(
    mesh(`${spec.id}-ground-wall`, ringWallGeometry(
      spec, 0.15, floorHeight, spec.roomCount, doorwayDirections,
    ), materials.limeEarth, { actualDoorwayVoids: true }),
    mesh(`${spec.id}-upper-wall`, solidRingGeometry(
      spec.innerRadius, spec.outerRadius, floorHeight, spec.wallHeight, 72,
    ), materials.limeEarth),
    mergedMesh(`${spec.id}-gallery-slabs`, gallerySlabs, materials.timberDark),
    instanced(`${spec.id}-gallery-columns`, new THREE.CylinderGeometry(0.11, 0.13, 3.2, 6),
      materials.timber, columnTransforms),
    instanced(`${spec.id}-room-doors`, new THREE.BoxGeometry(1.25, 2.08, 0.1),
      materials.door, doorTransforms),
    instanced(`${spec.id}-gallery-rails`, new THREE.BoxGeometry(bayAngle * galleryInner * 0.82, 0.09, 0.09),
      materials.timberDark, railTransforms),
    instanced(`${spec.id}-upper-windows`, new THREE.BoxGeometry(0.56, 0.58, 0.08),
      materials.earthDark, windowTransforms),
  );
  const roof = new THREE.Group();
  roof.name = `${spec.id}-roof`;
  const roofInner = galleryInner - 0.35;
  const roofOuter = spec.outerRadius + 0.52;
  roof.add(
    mesh(`${spec.id}-roof-surface`, roofRingGeometry(
      roofInner, roofOuter, spec.wallHeight, spec.roofRise, 72,
    ), materials.tile, { roofSurface: true, simplifiedNeighbor: true }),
    torus(`${spec.id}-outer-eave`, roofOuter, 0.13, spec.wallHeight - 0.02, materials.tileEdge),
    torus(`${spec.id}-inner-eave`, roofInner, 0.13, spec.wallHeight - 0.02, materials.tileEdge),
    torus(`${spec.id}-ridge`, (roofInner + roofOuter) / 2, 0.12,
      spec.wallHeight + spec.roofRise + 0.02, materials.tileEdge),
  );
  const entrance = new THREE.Group();
  entrance.name = `${spec.id}-entrance-hall`;
  const entranceZ = spec.outerRadius + 1.55;
  entrance.add(
    box(`${spec.id}-entrance-west-pier`, [0.6, 3.2, 2.5], [-2.25, 1.75, entranceZ], materials.limeEarth),
    box(`${spec.id}-entrance-east-pier`, [0.6, 3.2, 2.5], [2.25, 1.75, entranceZ], materials.limeEarth),
    box(`${spec.id}-entrance-lintel`, [5.1, 0.5, 2.5], [0, 3.35, entranceZ], materials.limeEarth),
  );
  const entranceRoof = mesh(`${spec.id}-entrance-roof`, gableRoofGeometry(5.9, 3.6, 1.15),
    materials.tile, { roofSurface: true });
  entranceRoof.position.set(0, 3.6, entranceZ);
  entrance.add(entranceRoof);
  group.add(roof, entrance);
  return group;
}

function createRectNeighbor(spec, materials) {
  const group = new THREE.Group();
  group.name = `neighbor-${spec.id}`;
  group.position.set(spec.x, 0, spec.z);
  group.rotation.y = spec.rotationY ?? 0;
  group.userData = {
    label: spec.label,
    type: spec.type,
    placementAccuracy: spec.placementAccuracy,
    floorCount: spec.floors,
    documentedDimensions: spec.documentedDimensions,
  };
  const floorHeight = spec.wallHeight / spec.floors;
  const wingDepth = Math.min(5.6, Math.min(spec.width, spec.depth) * 0.19);
  const sideLength = spec.depth - wingDepth * 2;
  const entranceWidth = Math.min(4.4, spec.width * 0.18);
  const southSegment = (spec.width - entranceWidth) / 2;
  group.add(
    box(`${spec.id}-north-wall`, [spec.width, spec.wallHeight, wingDepth],
      [0, spec.wallHeight / 2 + 0.15, -(spec.depth - wingDepth) / 2], materials.rammedEarth),
    box(`${spec.id}-south-west-wall`, [southSegment, spec.wallHeight, wingDepth],
      [-(spec.width + entranceWidth) / 4, spec.wallHeight / 2 + 0.15,
        (spec.depth - wingDepth) / 2], materials.rammedEarth),
    box(`${spec.id}-south-east-wall`, [southSegment, spec.wallHeight, wingDepth],
      [(spec.width + entranceWidth) / 4, spec.wallHeight / 2 + 0.15,
        (spec.depth - wingDepth) / 2], materials.rammedEarth),
    box(`${spec.id}-south-gate-upper-wall`, [entranceWidth, spec.wallHeight - floorHeight, wingDepth],
      [0, floorHeight + (spec.wallHeight - floorHeight) / 2 + 0.15,
        (spec.depth - wingDepth) / 2], materials.rammedEarth),
    box(`${spec.id}-east-wall`, [wingDepth, spec.wallHeight, sideLength],
      [(spec.width - wingDepth) / 2, spec.wallHeight / 2 + 0.15, 0], materials.rammedEarth),
    box(`${spec.id}-west-wall`, [wingDepth, spec.wallHeight, sideLength],
      [-(spec.width - wingDepth) / 2, spec.wallHeight / 2 + 0.15, 0], materials.rammedEarth),
  );
  const courtyardWidth = spec.width - wingDepth * 2;
  const courtyardDepth = spec.depth - wingDepth * 2;
  const galleryDepth = Math.min(1.15, wingDepth * 0.26);
  const slabParts = [];
  for (let floor = 1; floor < spec.floors; floor += 1) {
    const y = floor * floorHeight - 0.12;
    slabParts.push(
      transformed(new THREE.BoxGeometry(courtyardWidth + galleryDepth * 2, 0.12, galleryDepth),
        [0, y, -(courtyardDepth + galleryDepth) / 2]),
      transformed(new THREE.BoxGeometry(courtyardWidth + galleryDepth * 2, 0.12, galleryDepth),
        [0, y, (courtyardDepth + galleryDepth) / 2]),
      transformed(new THREE.BoxGeometry(galleryDepth, 0.12, courtyardDepth),
        [-(courtyardWidth + galleryDepth) / 2, y, 0]),
      transformed(new THREE.BoxGeometry(galleryDepth, 0.12, courtyardDepth),
        [(courtyardWidth + galleryDepth) / 2, y, 0]),
    );
  }
  const columnTransforms = [];
  const doorTransforms = [];
  const railTransforms = [];
  const xBays = Math.max(6, Math.round(courtyardWidth / 2.8));
  const zBays = Math.max(5, Math.round(courtyardDepth / 2.8));
  const compose = (x, y, z, rotationY = 0) => new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotationY, 0)),
    new THREE.Vector3(1, 1, 1),
  );
  for (let floor = 0; floor < spec.floors; floor += 1) {
    const centreY = floor * floorHeight + floorHeight / 2;
    const doorY = floor * floorHeight + 1.08;
    for (let bay = 0; bay < xBays; bay += 1) {
      const x = THREE.MathUtils.lerp(-courtyardWidth / 2, courtyardWidth / 2, bay / (xBays - 1));
      for (const z of [-courtyardDepth / 2, courtyardDepth / 2]) {
        const groundEntrance = floor === 0 && z > 0
          && Math.abs(x) <= entranceWidth / 2 + 0.25;
        if (!groundEntrance) {
          columnTransforms.push(compose(x, centreY, z));
          doorTransforms.push(compose(x, doorY, z));
        }
        if (floor > 0) railTransforms.push(compose(x, floor * floorHeight + 0.62, z));
      }
    }
    for (let bay = 1; bay < zBays - 1; bay += 1) {
      const z = THREE.MathUtils.lerp(-courtyardDepth / 2, courtyardDepth / 2, bay / (zBays - 1));
      for (const x of [-courtyardWidth / 2, courtyardWidth / 2]) {
        columnTransforms.push(compose(x, centreY, z));
        doorTransforms.push(compose(x, doorY, z, Math.PI / 2));
        if (floor > 0) railTransforms.push(compose(x, floor * floorHeight + 0.62, z, Math.PI / 2));
      }
    }
  }
  group.add(
    mergedMesh(`${spec.id}-gallery-slabs`, slabParts, materials.timberDark),
    instanced(`${spec.id}-gallery-columns`, new THREE.CylinderGeometry(0.1, 0.12, floorHeight * 0.84, 6),
      materials.timber, columnTransforms),
    instanced(`${spec.id}-room-doors`, new THREE.BoxGeometry(1.2, 2.05, 0.1),
      materials.courtyardWall, doorTransforms),
    instanced(`${spec.id}-gallery-rails`, new THREE.BoxGeometry(1.15, 0.09, 0.09),
      materials.timberDark, railTransforms),
  );
  const roofGroup = new THREE.Group();
  roofGroup.name = `${spec.id}-roof`;
  for (const side of [-1, 1]) {
    const roof = mesh(`${spec.id}-${side < 0 ? 'north' : 'south'}-roof`,
      gableRoofGeometry(wingDepth + 0.9, spec.width + 0.9, 1.35), materials.tile,
      { roofSurface: true, simplifiedNeighbor: true, openCourtyard: true });
    roof.position.set(0, spec.wallHeight + 0.15, side * (spec.depth - wingDepth) / 2);
    roof.rotation.y = Math.PI / 2;
    roofGroup.add(roof);
  }
  for (const side of [-1, 1]) {
    const roof = mesh(`${spec.id}-${side < 0 ? 'west' : 'east'}-roof`,
      gableRoofGeometry(wingDepth + 0.9, sideLength + 0.9, 1.35), materials.tile,
      { roofSurface: true, simplifiedNeighbor: true, openCourtyard: true });
    roof.position.set(side * (spec.width - wingDepth) / 2, spec.wallHeight + 0.15, 0);
    roofGroup.add(roof);
  }
  const entrance = new THREE.Group();
  entrance.name = `${spec.id}-entrance-hall`;
  const entranceZ = spec.depth / 2 + 1.35;
  entrance.add(
    box(`${spec.id}-entrance-west-pier`, [0.55, 3.0, 2.4],
      [-entranceWidth / 2, 1.65, entranceZ], materials.rammedEarthLight),
    box(`${spec.id}-entrance-east-pier`, [0.55, 3.0, 2.4],
      [entranceWidth / 2, 1.65, entranceZ], materials.rammedEarthLight),
    box(`${spec.id}-entrance-lintel`, [entranceWidth + 0.55, 0.45, 2.4],
      [0, 3.2, entranceZ], materials.rammedEarthLight),
  );
  const entranceRoof = mesh(`${spec.id}-entrance-roof`,
    gableRoofGeometry(entranceWidth + 1.5, 3.5, 1.0), materials.tile,
    { roofSurface: true, simplifiedNeighbor: true });
  entranceRoof.position.set(0, 3.45, entranceZ);
  entrance.add(entranceRoof);
  group.add(roofGroup, entrance);
  group.userData.courtyard = {
    width: courtyardWidth,
    depth: courtyardDepth,
    openToSky: true,
  };
  return group;
}

function createNeighbors(materials) {
  const group = new THREE.Group();
  group.name = 'building-neighbors';
  group.userData = { scope: 'named-simplified-massing', positions: 'OSM-centre-approximation' };
  for (const neighbor of CHENGQI_LAYOUT.neighbors) {
    group.add(neighbor.type === 'round'
      ? createRoundNeighbor(neighbor, materials)
      : createRectNeighbor(neighbor, materials));
  }
  return group;
}

function createTrees(materials) {
  const trunkTransforms = [];
  const crownTransforms = [];
  CHENGQI_LAYOUT.trees.forEach(([x, z, height], index) => {
    trunkTransforms.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, height * 0.34, z), new THREE.Quaternion(),
      new THREE.Vector3(height * 0.13, height * 0.68, height * 0.13),
    ));
    crownTransforms.push(new THREE.Matrix4().compose(
      new THREE.Vector3(x, height * 0.88, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, index * 0.77, 0)),
      new THREE.Vector3(height * 0.43, height * 0.48, height * 0.43),
    ));
  });
  const group = new THREE.Group();
  group.name = 'site-trees';
  group.add(
    instanced('site-tree-trunks', new THREE.CylinderGeometry(0.55, 0.75, 1, 7), materials.trunk, trunkTransforms),
    instanced('site-tree-crowns', new THREE.IcosahedronGeometry(1, 1), materials.leaves, crownTransforms),
  );
  return group;
}

function createBambooGroves(materials) {
  const stemTransforms = [];
  const crownTransforms = [];
  const understoryTransforms = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (const grove of CHENGQI_LAYOUT.bambooGroves) {
    const groundRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    understoryTransforms.push(new THREE.Matrix4().compose(
      new THREE.Vector3(grove.x, 0.065, grove.z), groundRotation,
      new THREE.Vector3(grove.radiusX * 1.08, grove.radiusZ * 1.08, 1),
    ));
    for (let index = 0; index < grove.count; index += 1) {
      const spread = Math.sqrt((index + 0.45) / grove.count);
      const theta = grove.seed + index * goldenAngle;
      const x = grove.x + Math.cos(theta) * grove.radiusX * spread;
      const z = grove.z + Math.sin(theta) * grove.radiusZ * spread;
      const height = 4.8 + ((index * 17 + Math.round(grove.seed * 10)) % 13) / 13 * 2.3;
      stemTransforms.push(new THREE.Matrix4().compose(
        new THREE.Vector3(x, height / 2, z), new THREE.Quaternion(),
        new THREE.Vector3(0.085, height, 0.085),
      ));
      crownTransforms.push(new THREE.Matrix4().compose(
        new THREE.Vector3(x, height * 0.82, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, theta, 0)),
        new THREE.Vector3(0.58, 1.35, 0.58),
      ));
    }
  }
  const group = new THREE.Group();
  group.name = 'site-bamboo-groves';
  group.userData = { arrangement: 'three-deterministic-clusters', artisticVegetation: true };
  group.add(
    instanced('site-bamboo-understory', new THREE.CircleGeometry(1, 32), materials.grass, understoryTransforms),
    instanced('site-bamboo-stems', new THREE.CylinderGeometry(1, 1, 1, 6), materials.bamboo, stemTransforms),
    instanced('site-bamboo-crowns', new THREE.ConeGeometry(1, 1.8, 6), materials.bambooLeaves, crownTransforms),
  );
  return group;
}

function createNeighborPaths(materials) {
  const group = new THREE.Group();
  group.name = 'site-neighbor-paths';
  const roadZ = 60;
  for (const spec of CHENGQI_LAYOUT.neighbors) {
    const localSouth = spec.type === 'round' ? spec.outerRadius : spec.depth / 2;
    const rotation = spec.rotationY ?? 0;
    const gateX = spec.x + Math.sin(rotation) * localSouth;
    const gateZ = spec.z + Math.cos(rotation) * localSouth;
    const length = roadZ - gateZ;
    group.add(box(`${spec.id}-entrance-path`, [4.2, 0.11, length + 0.8],
      [gateX, 0.12, gateZ + length / 2], materials.paving,
      { connectsSouthGate: spec.id, endpointAccuracy: 'artistic-site-connection' }));
  }
  return group;
}

function createSiteAnnexes(materials) {
  const group = new THREE.Group();
  group.name = 'site-low-annexes';
  for (const [index, x, z, width, depth] of [
    [1, 80, 8, 11, 7],
    [2, 105, 3, 10, 6.5],
  ]) {
    group.add(box(`site-annex-${index}-body`, [width, 3.4, depth],
      [x, 1.75, z], materials.rammedEarthLight,
      { simplifiedAnnex: true }));
    const roof = mesh(`site-annex-${index}-roof`, gableRoofGeometry(width + 1, depth + 1, 1.25),
      materials.tile, { roofSurface: true, simplifiedAnnex: true });
    roof.position.set(x, 3.45, z);
    group.add(roof);
  }
  return group;
}

function createVegetablePlots(materials) {
  const soilParts = [];
  const rowParts = [];
  for (const [plotX, plotZ] of [[-34, 50], [32, 51], [78, 46]]) {
    soilParts.push(transformed(new THREE.BoxGeometry(12, 0.08, 7), [plotX, 0.08, plotZ]));
    for (const offset of [-2.2, 0, 2.2]) {
      rowParts.push(transformed(new THREE.BoxGeometry(11.2, 0.08, 0.65),
        [plotX, 0.16, plotZ + offset]));
    }
  }
  const group = new THREE.Group();
  group.name = 'site-vegetable-plots';
  group.add(
    mergedMesh('site-vegetable-soil', soilParts, materials.earthDark,
      { artisticCultivation: true }),
    mergedMesh('site-vegetable-rows', rowParts, materials.grass,
      { artisticCultivation: true }),
  );
  return group;
}

function createSite(materials) {
  const { width, depth, bottomY } = CHENGQI_LAYOUT.site;
  const group = new THREE.Group();
  group.name = 'chengqi-site';
  group.add(
    box('chengqi-closed-soil', [width, 1, depth], [0, bottomY + 0.5, 0], materials.soil,
      { closedSolid: true, bottomY }),
    box('chengqi-forecourt', [28, 0.12, 18], [0, 0.07, 43.5], materials.paving),
    box('chengqi-front-road', [220, 0.16, 5.2], [0, 0.08, 60], materials.road),
    createNeighborPaths(materials),
    createSiteAnnexes(materials),
    createVegetablePlots(materials),
    createBambooGroves(materials),
    createTrees(materials),
  );
  return group;
}

function anchorAbove(object, extra = 0.7) {
  const bounds = new THREE.Box3().setFromObject(object);
  return new THREE.Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    bounds.max.y + extra,
    (bounds.min.z + bounds.max.z) / 2,
  );
}

/**
 * Builds a close-range artistic reconstruction of Chengqi Lou and three named
 * neighbors. Documented outer diameter, ring/storey counts, room counts and
 * entrance directions guide the massing; inner radii and heights are display
 * approximations rather than surveyed geometry.
 */
export function createChengqiLouModel() {
  const materials = createMaterials();
  const group = new THREE.Group();
  group.name = 'chengqi-lou-model';
  group.userData = {
    kind: 'artistic-approximation',
    subject: 'Chengqi Lou exterior and visible courtyard structure',
    orientation: CHENGQI_LAYOUT.orientation,
    entranceDirection: '+z',
    sourceBoundary: 'outer-diameter-and-ring-count-researched-inner-radii-and-heights-approximate',
    scope: 'visible-exterior-galleries-and-courts-no-deep-room-interiors',
  };
  const entrance = createEntrances(materials);
  const sideEntrances = createSideEntrances(materials);
  const outerRing = createOuterRing(materials);
  const innerRings = new THREE.Group();
  innerRings.name = 'building-inner-rings';
  innerRings.userData = { concentricLowRings: true, openAirLanes: true };
  innerRings.add(
    createInnerRing(CHENGQI_LAYOUT.rings[1], materials,
      Array.from({ length: 7 }, (_, index) => index / 7 * TAU)),
    createInnerRing(CHENGQI_LAYOUT.rings[2], materials, [0]),
  );
  const ancestralHall = createAncestralHall(materials);
  const neighbors = createNeighbors(materials);
  group.add(createSite(materials), entrance, sideEntrances, outerRing, innerRings, ancestralHall, neighbors);
  group.updateMatrixWorld(true);
  const anchors = {
    entrance: new THREE.Vector3(0, 5.1, 36.6),
    'outer-ring': new THREE.Vector3(0, 19.4, -31.5),
    'inner-rings': new THREE.Vector3(22.5, 10.2, 0),
    'ancestral-hall': anchorAbove(ancestralHall),
    neighbors: anchorAbove(neighbors),
  };
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const geometries = new Set();
    const ownedMaterials = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const materialList = Array.isArray(object.material) ? object.material : [object.material];
      materialList.filter(Boolean).forEach((material) => ownedMaterials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    ownedMaterials.forEach((material) => material.dispose());
  };
  return { group, anchors, dispose };
}
