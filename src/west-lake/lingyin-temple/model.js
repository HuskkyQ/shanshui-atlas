import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import layout from '../../data/lingyin-layout.json' with { type: 'json' };

const AXIS_ROTATION = 0.322;
const ORIGIN_LON = layout.originWgs84[0];
const ORIGIN_LAT = layout.originWgs84[1];
const UNIT_SCALE = layout.sceneUnitsPerMeter;
const METERS_PER_LON = 111320 * Math.cos(ORIGIN_LAT * Math.PI / 180);
const METERS_PER_LAT = 110540;

function surface(color, roughness = 0.84, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...options });
}

function prepared(geometry) {
  geometry.deleteAttribute('uv');
  return geometry;
}

function transformed(geometry, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const result = prepared(geometry);
  result.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(...scale),
  ));
  return result;
}

function mergeMesh(name, geometries, material, userData = {}) {
  const geometry = mergeGeometries(geometries, false);
  if (!geometry) throw new Error(`Unable to assemble ${name}`);
  geometries.forEach((part) => part.dispose());
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.userData = { ...userData };
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function toScene([longitude, latitude]) {
  return new THREE.Vector2(
    (longitude - ORIGIN_LON) * METERS_PER_LON * UNIT_SCALE,
    -(latitude - ORIGIN_LAT) * METERS_PER_LAT * UNIT_SCALE,
  );
}

function footprintFrame(building) {
  const points = building.footprintWgs84.map(toScene);
  const first = points[0];
  const last = points.at(-1);
  const uniquePoints = first?.distanceTo(last) < 1e-7 ? points.slice(0, -1) : points;
  const cosine = Math.cos(AXIS_ROTATION);
  const sine = Math.sin(AXIS_ROTATION);
  const localAbsolute = uniquePoints.map((point) => {
    return new THREE.Vector2(cosine * point.x - sine * point.y, sine * point.x + cosine * point.y);
  });
  const xValues = localAbsolute.map((point) => point.x);
  const zValues = localAbsolute.map((point) => point.y);
  const localCenter = new THREE.Vector2(
    (Math.min(...xValues) + Math.max(...xValues)) / 2,
    (Math.min(...zValues) + Math.max(...zValues)) / 2,
  );
  const center = new THREE.Vector2(
    cosine * localCenter.x + sine * localCenter.y,
    -sine * localCenter.x + cosine * localCenter.y,
  );
  const local = localAbsolute.map((point) => point.clone().sub(localCenter));
  return {
    center,
    points,
    localPoints: local,
    width: Math.max(...xValues) - Math.min(...xValues),
    depth: Math.max(...zValues) - Math.min(...zValues),
  };
}

function footprintPrism(points, height) {
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, -point.y);
    else shape.lineTo(point.x, -point.y);
  });
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
  geometry.rotateX(-Math.PI / 2);
  return prepared(geometry);
}

function roofGeometry(width, depth, rise) {
  const positions = [];
  const widthSegments = 10;
  const slopeSegments = 4;
  const ridgeHalf = width * 0.31;
  const shoulderDepth = depth * 0.24;
  const lowerRise = rise * 0.48;
  const addTriangle = (a, b, c) => {
    const normalY = new THREE.Vector3().subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a)).y;
    const ordered = normalY >= 0 ? [a, b, c] : [a, c, b];
    ordered.forEach((point) => positions.push(point.x, point.y, point.z));
  };
  const addGrid = (rows, columns, pointAt) => {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const a = pointAt(row / rows, column / columns);
        const b = pointAt(row / rows, (column + 1) / columns);
        const c = pointAt((row + 1) / rows, column / columns);
        const d = pointAt((row + 1) / rows, (column + 1) / columns);
        addTriangle(a, b, c);
        addTriangle(b, d, c);
      }
    }
  };
  for (const side of [-1, 1]) {
    // The lower skirt is hipped on all four sides.
    addGrid(slopeSegments, widthSegments, (t, column) => {
      const u = column * 2 - 1;
      const halfWidth = width * 0.5 * (1 - t) + ridgeHalf * t;
      const cornerLift = rise * 0.16 * Math.pow(Math.abs(u), 5) * Math.pow(1 - t, 2);
      return new THREE.Vector3(
        u * halfWidth,
        lowerRise * Math.sin(t * Math.PI / 2) + cornerLift,
        side * (depth * 0.5 * (1 - t) + shoulderDepth * t),
      );
    });
    // Above the hipped skirt, only two long slopes reach the main ridge.
    addGrid(slopeSegments, widthSegments, (t, column) => {
      const u = column * 2 - 1;
      return new THREE.Vector3(
        u * ridgeHalf,
        lowerRise + (rise - lowerRise) * Math.sin(t * Math.PI / 2),
        side * shoulderDepth * (1 - t),
      );
    });
  }
  const endSegments = 6;
  for (const end of [-1, 1]) {
    addGrid(slopeSegments, endSegments, (t, column) => {
      const u = column * 2 - 1;
      const cornerLift = rise * 0.16 * Math.pow(Math.abs(u), 5) * Math.pow(1 - t, 2);
      return new THREE.Vector3(
        end * (width * 0.5 * (1 - t) + ridgeHalf * t),
        lowerRise * Math.sin(t * Math.PI / 2) + cornerLift,
        u * (depth * 0.5 * (1 - t) + shoulderDepth * t),
      );
    });
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function eaveRingGeometry(outerWidth, outerDepth, innerWidth, innerDepth, rise) {
  const positions = [];
  const addQuad = (points) => {
    const [a, b, c, d] = points;
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const ordered = normal.y >= 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c];
    ordered.forEach((point) => positions.push(point.x, point.y, point.z));
  };
  const ow = outerWidth / 2;
  const od = outerDepth / 2;
  const iw = innerWidth / 2;
  const id = innerDepth / 2;
  addQuad([
    new THREE.Vector3(-ow, 0, -od), new THREE.Vector3(ow, 0, -od),
    new THREE.Vector3(iw, rise, -id), new THREE.Vector3(-iw, rise, -id),
  ]);
  addQuad([
    new THREE.Vector3(ow, 0, -od), new THREE.Vector3(ow, 0, od),
    new THREE.Vector3(iw, rise, id), new THREE.Vector3(iw, rise, -id),
  ]);
  addQuad([
    new THREE.Vector3(ow, 0, od), new THREE.Vector3(-ow, 0, od),
    new THREE.Vector3(-iw, rise, id), new THREE.Vector3(iw, rise, id),
  ]);
  addQuad([
    new THREE.Vector3(-ow, 0, od), new THREE.Vector3(-ow, 0, -od),
    new THREE.Vector3(-iw, rise, -id), new THREE.Vector3(-iw, rise, id),
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function gableGeometry(width, depth, rise) {
  const ridgeHalf = width * 0.31;
  const shoulderDepth = depth * 0.24;
  const lowerRise = rise * 0.48;
  const positions = [];
  for (const end of [-1, 1]) {
    const triangle = [
      [end * ridgeHalf, lowerRise, -shoulderDepth],
      [end * ridgeHalf, lowerRise, shoulderDepth],
      [end * ridgeHalf, rise, 0],
    ];
    if (end > 0) triangle.reverse();
    triangle.forEach((point) => positions.push(...point));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function barBetween(start, end, radius, segments = 6) {
  const from = new THREE.Vector3(...start);
  const to = new THREE.Vector3(...end);
  const direction = to.clone().sub(from);
  const geometry = prepared(new THREE.CylinderGeometry(radius, radius, direction.length(), segments, 1));
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0), direction.clone().normalize(),
  ));
  geometry.translate(...from.clone().add(to).multiplyScalar(0.5).toArray());
  return geometry;
}

const HALL_PROFILES = {
  tianwang: { bodyHeight: 3.35, bays: 5, roofs: [[1, 0, 2.3]], form: 'entrance-hall' },
  daxiong: { bodyHeight: 4.05, bays: 7, roofs: [[1, 0, 3.1], [0.83, 1.75, 2.8], [0.64, 3.4, 2.45]], form: 'seven-by-four-triple-eave' },
  yaoshi: { bodyHeight: 3.7, bays: 7, roofs: [[1, 0, 2.7], [0.76, 1.72, 2.25]], form: 'seven-by-three-double-eave' },
  zhizhi: { bodyHeight: 6.2, bays: 5, roofs: [[1, 0, 2.7]], floors: 3, form: 'three-function-levels' },
  huayan: { bodyHeight: 4.1, bays: 5, roofs: [[1, 0, 2.85]], form: 'upper-axis-hall' },
  jigong: { bodyHeight: 2.9, bays: 3, roofs: [[1, 0, 1.9]], form: 'east-wing-hall' },
  dabei: { bodyHeight: 3.4, bays: 3, roofs: [[1, 0, 2.1]], floors: 2, form: 'wing-building' },
  liandeng: { bodyHeight: 3.25, bays: 3, roofs: [[1, 0, 2.0]], floors: 2, form: 'wing-building' },
  fangzhang: { bodyHeight: 3.45, bays: 3, roofs: [[1, 0, 2.0]], floors: 2, form: 'wing-building' },
  library: { bodyHeight: 2.8, bays: 3, roofs: [[1, 0, 1.7]], form: 'low-wing-hall' },
  yueheng: { bodyHeight: 2.7, bays: 3, roofs: [[1, 0, 1.65]], form: 'low-wing-hall' },
  chantang: { bodyHeight: 2.9, bays: 5, roofs: [[1, 0, 1.8]], form: 'low-wing-hall' },
  galan: { bodyHeight: 2.75, bays: 3, roofs: [[1, 0, 1.7]], form: 'low-wing-hall' },
  ketang: { bodyHeight: 2.7, bays: 3, roofs: [[1, 0, 1.65]], form: 'low-wing-hall' },
};

function createHall(building, materials) {
  const frame = footprintFrame(building);
  const profile = HALL_PROFILES[building.key];
  const wingTurn = building.key === 'yueheng' ? Math.PI / 2
    : ['galan', 'ketang'].includes(building.key) ? -Math.PI / 2 : 0;
  const width = Math.max(5.4, (wingTurn ? frame.depth : frame.width) * 0.87);
  const depth = Math.max(4.4, (wingTurn ? frame.width : frame.depth) * 0.76);
  const baseY = building.terraceY + 0.36;
  const wallTop = baseY + profile.bodyHeight;
  const group = new THREE.Group();
  group.name = `building-${building.key}`;
  group.position.set(frame.center.x, 0, frame.center.y);
  group.rotation.y = AXIS_ROTATION + wingTurn;
  group.userData = {
    buildingKey: building.key,
    displayName: building.name,
    osmId: building.osmId,
    footprintSource: 'OpenStreetMap',
    footprintAccuracy: 'approximate-not-surveyed',
    terraceHeightAccuracy: 'artistic-estimate',
    architecturalForm: profile.form,
    bays: profile.bays,
    roofStyle: 'xieshan-inspired-swept-roof',
    roofLayers: profile.roofs.length,
  };
  if (building.officialHeightMeters) {
    group.userData.officialHeightMeters = building.officialHeightMeters;
    group.userData.officialHeightSceneUnits = building.officialHeightMeters * UNIT_SCALE;
  }

  const wall = new THREE.Mesh(prepared(new THREE.BoxGeometry(width * 0.82, profile.bodyHeight, depth * 0.69)), materials.wall);
  wall.name = `${building.key}-hall-body`;
  wall.position.y = baseY + profile.bodyHeight / 2;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  const columns = [];
  const brackets = [];
  for (let index = 0; index <= profile.bays; index += 1) {
    const x = -width * 0.39 + width * 0.78 * index / profile.bays;
    for (const z of [-depth * 0.37, depth * 0.37]) {
      columns.push(transformed(new THREE.CylinderGeometry(0.13, 0.16, profile.bodyHeight + 0.2, 8), [x, baseY + profile.bodyHeight / 2, z]));
      brackets.push(transformed(new THREE.BoxGeometry(0.62, 0.18, 0.28), [x, wallTop - 0.12, z]));
      brackets.push(transformed(new THREE.BoxGeometry(0.3, 0.18, 0.62), [x, wallTop + 0.02, z]));
    }
  }
  group.add(
    mergeMesh(`${building.key}-vermilion-columns`, columns, materials.redWood, { bayCount: profile.bays }),
    mergeMesh(`${building.key}-dougong-approximation`, brackets, materials.bracket, { detail: 'artistic-approximation' }),
  );

  const door = new THREE.Mesh(prepared(new THREE.BoxGeometry(width * 0.69, profile.bodyHeight * 0.64, 0.08)), materials.door);
  door.name = `${building.key}-front-doors`;
  door.position.set(0, baseY + profile.bodyHeight * 0.4, depth * 0.348);
  group.add(door);
  const lattice = [];
  const latticeY = baseY + profile.bodyHeight * 0.42;
  for (let index = 0; index <= profile.bays * 2; index += 1) {
    const x = -width * 0.34 + width * 0.68 * index / (profile.bays * 2);
    lattice.push(transformed(new THREE.BoxGeometry(0.045, profile.bodyHeight * 0.58, 0.06), [x, latticeY, depth * 0.397]));
  }
  for (const offset of [-0.22, 0, 0.22]) {
    lattice.push(transformed(new THREE.BoxGeometry(width * 0.69, 0.045, 0.06), [0, latticeY + profile.bodyHeight * offset, depth * 0.397]));
  }
  group.add(mergeMesh(`${building.key}-door-lattice`, lattice, materials.lattice));

  if ((profile.floors ?? 1) > 1) {
    const belts = [];
    for (let floor = 1; floor < profile.floors; floor += 1) {
      const y = baseY + profile.bodyHeight * floor / profile.floors;
      belts.push(transformed(new THREE.BoxGeometry(width * 0.88, 0.18, depth * 0.77), [0, y, 0]));
    }
    group.add(mergeMesh(`${building.key}-floor-bands`, belts, materials.redWood, { functionalLevels: profile.floors }));
  }

  const roofs = [];
  const gables = [];
  const ridges = [];
  const eaveBands = [];
  profile.roofs.forEach(([scale, yOffset, rise], layerIndex) => {
    const roofWidth = width * (1.12 * scale);
    const roofDepth = depth * (1.18 * scale);
    const eaveY = wallTop + yOffset;
    const isTopRoof = yOffset === profile.roofs.at(-1)[1];
    const roofRise = isTopRoof ? rise : Math.min(rise, 0.7);
    if (isTopRoof) {
      roofs.push(transformed(roofGeometry(roofWidth, roofDepth, roofRise), [0, eaveY, 0]));
      gables.push(transformed(gableGeometry(roofWidth, roofDepth, roofRise), [0, eaveY, 0]));
    } else {
      roofs.push(transformed(eaveRingGeometry(
        roofWidth, roofDepth, width * 0.82 * scale, depth * 0.70 * scale, roofRise,
      ), [0, eaveY, 0]));
    }
    if (layerIndex > 0) {
      const previous = profile.roofs[layerIndex - 1];
      const previousY = wallTop + previous[1];
      const wallHeight = eaveY - previousY;
      if (wallHeight > 0.01) {
        eaveBands.push(transformed(
          new THREE.BoxGeometry(width * 0.80 * previous[0], wallHeight, depth * 0.68 * previous[0]),
          [0, previousY + wallHeight / 2, 0],
        ));
      }
    }
    const ridgeHalf = roofWidth * 0.31;
    const ridgeY = eaveY + roofRise + 0.03;
    ridges.push(barBetween([-ridgeHalf, ridgeY, 0], [ridgeHalf, ridgeY, 0], 0.085));
    for (const side of [-1, 1]) {
      for (let segment = 0; segment < 10; segment += 1) {
        const edgePoint = (u) => [u * roofWidth * 0.5, eaveY + roofRise * 0.16 * Math.pow(Math.abs(u), 5), side * roofDepth * 0.5];
        ridges.push(barBetween(edgePoint(segment / 5 - 1), edgePoint((segment + 1) / 5 - 1), 0.06));
      }
    }
    for (const x of [-ridgeHalf, ridgeHalf]) {
      for (const z of [-roofDepth * 0.5, roofDepth * 0.5]) {
        ridges.push(barBetween([x, ridgeY, 0], [Math.sign(x) * roofWidth * 0.5, eaveY + roofRise * 0.16, z], 0.055));
      }
    }
  });
  group.add(
    mergeMesh(`${building.key}-swept-xieshan-roofs`, roofs, materials.roof, {
      style: 'xieshan', layers: profile.roofs.length, upturnedCorners: true,
      lowerEavesAreRings: profile.roofs.length > 1, lowerHipUpperGable: true,
    }),
    mergeMesh(`${building.key}-roof-gables`, gables, materials.gable, { gableCount: gables.length * 2 }),
    mergeMesh(`${building.key}-roof-ridges`, ridges, materials.ridge),
  );
  if (eaveBands.length) {
    group.add(mergeMesh(`${building.key}-eave-wall-bands`, eaveBands, materials.wall, { betweenRoofLayers: true }));
  }
  return group;
}

function createLuohanHall(building, materials) {
  const frame = footprintFrame(building);
  const group = new THREE.Group();
  group.name = 'building-luohan';
  group.position.set(frame.center.x, 0, frame.center.y);
  group.rotation.y = AXIS_ROTATION;
  group.userData = {
    buildingKey: 'luohan',
    displayName: building.name,
    osmId: building.osmId,
    footprintSource: 'OpenStreetMap',
    footprintAccuracy: 'approximate-not-surveyed',
    terraceHeightAccuracy: 'artistic-estimate',
    architecturalForm: 'wan-plan-compound-hall',
    planSymbol: '卍',
    roofStyle: 'double-eave-qing-inspired',
    roofLayers: 2,
    interiorCopperHallModeled: false,
    sourceOutlinePointCount: frame.localPoints.length,
    centralVoidModeled: false,
  };
  const baseY = building.terraceY + 0.36;
  const bodyHeight = 3.5;
  const wall = new THREE.Mesh(footprintPrism(frame.localPoints, bodyHeight), materials.wall);
  wall.name = 'luohan-wan-plan-walls';
  wall.position.y = baseY;
  wall.castShadow = true;
  wall.receiveShadow = true;
  wall.userData = {
    sourceOutlinePointCount: frame.localPoints.length,
    centralVoidModeled: false,
    sectionCount: 'source-outline',
  };
  group.add(wall);

  // The OSM outline is concave but has no inner ring. Use its measured bounds to
  // place two crossing roofs and four outer turns without inventing a central courtyard.
  const wingRoofParts = [];
  const wingGables = [];
  const lowerEaves = [];
  const wallBands = [];
  const sourceRoofSegments = [
    // Two long crossing roofs through the measured outline.
    [-0.50, 0.50, -0.12, 0.12],
    [-0.11, 0.11, -0.50, 0.50],
    // Four outer turns follow the four concave notches in the source outline.
    [-0.50, -0.20, -0.50, -0.14],
    [0.11, 0.49, -0.48, -0.21],
    [0.22, 0.50, 0.11, 0.50],
    [-0.49, -0.11, 0.20, 0.49],
  ];
  sourceRoofSegments.forEach(([minX, maxX, minZ, maxZ]) => {
    const width = frame.width * (maxX - minX);
    const depth = frame.depth * (maxZ - minZ);
    const x = frame.width * (minX + maxX) / 2;
    const z = frame.depth * (minZ + maxZ) / 2;
    const lowerWidth = width * 1.10;
    const lowerDepth = depth * 1.10;
    const upperWidth = width * 0.80;
    const upperDepth = depth * 0.80;
    const roofTurn = depth > width ? Math.PI / 2 : 0;
    lowerEaves.push(transformed(
      eaveRingGeometry(lowerWidth, lowerDepth, width * 0.82, depth * 0.82, 0.68),
      [x, baseY + bodyHeight, z],
    ));
    wingRoofParts.push(transformed(
      roofGeometry(roofTurn ? upperDepth : upperWidth, roofTurn ? upperWidth : upperDepth, 1.18),
      [x, baseY + bodyHeight + 0.82, z], [0, roofTurn, 0],
    ));
    wingGables.push(transformed(
      gableGeometry(roofTurn ? upperDepth : upperWidth, roofTurn ? upperWidth : upperDepth, 1.18),
      [x, baseY + bodyHeight + 0.82, z], [0, roofTurn, 0],
    ));
    wallBands.push(transformed(
      new THREE.BoxGeometry(width * 0.80, 0.82, depth * 0.80),
      [x, baseY + bodyHeight + 0.41, z],
    ));
  });
  group.add(
    mergeMesh('luohan-lower-eaves', lowerEaves, materials.roof, { ringOnly: true }),
    mergeMesh('luohan-eave-wall-bands', wallBands, materials.wall, { betweenEaves: true }),
    mergeMesh('luohan-wing-roofs', wingRoofParts, materials.roof, {
      doubleEave: true,
      wingCount: sourceRoofSegments.length,
      sourceOutlinePointCount: frame.localPoints.length,
    }),
    mergeMesh('luohan-roof-gables', wingGables, materials.gable, { lowerHipUpperGable: true }),
  );
  return group;
}

function moundGeometry(radius, height, x, z) {
  const rings = 5;
  const segments = 18;
  const positions = [];
  const indices = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    const ringRadius = radius * t;
    const y = height * Math.pow(1 - t, 1.55);
    for (let segment = 0; segment < segments; segment += 1) {
      const angle = segment / segments * Math.PI * 2;
      positions.push(x + Math.sin(angle) * ringRadius, y, z + Math.cos(angle) * ringRadius);
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

function createEnvironment(materials) {
  const environment = new THREE.Group();
  environment.name = 'lingyin-temple-environment';
  environment.userData = { scope: 'artistic-local-setting', terrainAccuracy: 'not-surveyed' };
  const ground = new THREE.Mesh(prepared(new THREE.BoxGeometry(94, 0.4, 120)), materials.ground);
  ground.name = 'temple-ground';
  ground.position.set(-1, -0.2, -6);
  ground.receiveShadow = true;
  environment.add(ground);
  const backdropHills = [[29, 10, -33, -63], [34, 12, 18, -70], [25, 8, 43, -48]];
  environment.add(mergeMesh('north-peak-wooded-backdrop',
    backdropHills.map(([radius, height, x, z]) => moundGeometry(radius, height, x, z)),
    materials.hill, { scope: 'artistic-background' }));

  const plinths = layout.buildings.map((building) => footprintPrism(
    building.footprintWgs84.map(toScene), building.terraceY + 0.36,
  ));
  environment.add(mergeMesh('osm-building-plinths', plinths, materials.stone, {
    footprintSource: 'OpenStreetMap', count: layout.buildings.length,
  }));

  const courtyardParts = [];
  const courtyardWallParts = [];
  const galleryPosts = [];
  const galleryRoofs = [];
  const courtyardMeta = [];
  const pathParts = [];
  const stairFlights = [];
  const axis = ['tianwang', 'daxiong', 'yaoshi', 'zhizhi', 'huayan'].map((key) => layout.buildings.find((item) => item.key === key));
  const forward = new THREE.Vector2(Math.sin(AXIS_ROTATION), Math.cos(AXIS_ROTATION));
  const right = new THREE.Vector2(Math.cos(AXIS_ROTATION), -Math.sin(AXIS_ROTATION));
  axis.forEach((building, index) => {
    const frame = footprintFrame(building);
    const previous = index ? axis[index - 1] : null;
    const previousFrame = previous && footprintFrame(previous);
    const courtWidth = Math.max(16, frame.width + 5);
    const courtDepth = previous
      ? frame.center.distanceTo(previousFrame.center) - frame.depth / 2 - previousFrame.depth / 2 + 0.8
      : 8;
    const localOffset = frame.depth / 2 + courtDepth / 2 - 0.4;
    const courtCenter = frame.center.clone().addScaledVector(forward, localOffset);
    const courtY = (previous || building).terraceY + 0.36;
    courtyardParts.push(transformed(
      new THREE.BoxGeometry(courtWidth, courtY, courtDepth),
      [courtCenter.x, courtY / 2, courtCenter.y],
      [0, AXIS_ROTATION, 0],
    ));
    const wallHeight = 0.65;
    for (const side of [-1, 1]) {
      const sideCenter = courtCenter.clone().addScaledVector(right, side * (courtWidth / 2 - 0.22));
      courtyardWallParts.push(transformed(
        new THREE.BoxGeometry(0.42, wallHeight, courtDepth - 0.8),
        [sideCenter.x, courtY + wallHeight / 2, sideCenter.y],
        [0, AXIS_ROTATION, 0],
      ));
      if (previous) {
        const length = Math.max(2, courtDepth - 1.3);
        const eaveY = courtY + 2.25;
        galleryRoofs.push(transformed(roofGeometry(length, 2.65, 0.75),
          [sideCenter.x, eaveY, sideCenter.y], [0, AXIS_ROTATION + Math.PI / 2, 0]));
        const bays = Math.max(2, Math.ceil(length / 2.4));
        for (let bay = 0; bay <= bays; bay += 1) for (const edge of [-1, 1]) {
          const position = sideCenter.clone().addScaledVector(forward, length * (bay / bays - 0.5))
            .addScaledVector(right, edge * 1.05);
          galleryPosts.push(transformed(new THREE.CylinderGeometry(0.085, 0.10, 2.25, 6),
            [position.x, courtY + 1.125, position.y]));
        }
      }
    }
    courtyardMeta.push({
      building: building.key,
      center: [courtCenter.x, courtCenter.y],
      width: courtWidth,
      depth: courtDepth,
      height: courtY,
      purpose: building.key === 'daxiong' ? 'open-incense-court' : 'open-court',
      direction: [Math.sin(AXIS_ROTATION), Math.cos(AXIS_ROTATION)],
    });
  });
  for (let index = 0; index < axis.length - 1; index += 1) {
    const lower = axis[index];
    const upper = axis[index + 1];
    const lowerFrame = footprintFrame(lower);
    const upperFrame = footprintFrame(upper);
    const direction = upperFrame.center.clone().sub(lowerFrame.center).normalize();
    const start = lowerFrame.center.clone().addScaledVector(direction, lowerFrame.depth * 0.42);
    const end = upperFrame.center.clone().addScaledVector(direction, -upperFrame.depth * 0.42);
    const flightLength = start.distanceTo(end);
    const rotation = Math.atan2(direction.x, direction.y);
    const lowerTop = lower.terraceY + 0.36;
    const upperTop = upper.terraceY + 0.36;
    const stairLength = Math.min(flightLength * 0.48, Math.max(2, (upperTop - lowerTop) * 2.8));
    const stairStart = end.clone().addScaledVector(direction, -stairLength);
    const flatLength = start.distanceTo(stairStart);
    const flatCenter = start.clone().lerp(stairStart, 0.5);
    pathParts.push(transformed(new THREE.BoxGeometry(4.8, lowerTop, flatLength + 0.12),
      [flatCenter.x, lowerTop / 2, flatCenter.y], [0, rotation, 0]));
    const treadCount = Math.max(2, Math.ceil((upperTop - lowerTop) / 0.18));
    const treadRun = stairLength / treadCount;
    const treadDepth = treadRun + 0.12;
    for (let step = 0; step < treadCount; step += 1) {
      const positionT = (step + 0.5) / treadCount;
      const heightT = (step + 1) / treadCount;
      const height = THREE.MathUtils.lerp(lowerTop, upperTop, heightT);
      const center = stairStart.clone().lerp(end, positionT);
      pathParts.push(transformed(
        new THREE.BoxGeometry(4.8, height, treadDepth),
        [center.x, height / 2, center.y], [0, rotation, 0],
      ));
    }
    stairFlights.push({
      from: lower.key,
      to: upper.key,
      start: [start.x, start.y],
      end: [end.x, end.y],
      lowerTop,
      upperTop,
      treadCount,
      treadRun,
      treadDepth,
      stairStart: [stairStart.x, stairStart.y],
      stairLength,
      flatLength,
    });
  }
  environment.add(
    mergeMesh('stepped-axis-courtyards', courtyardParts, materials.courtyard, {
      heightAccuracy: 'artistic-estimate',
      layoutMode: 'axis-aligned-open-courtyards',
      courtyardInterpretation: 'artistic-open-front-courts-and-low-side-walls',
      courtyards: courtyardMeta,
    }),
    mergeMesh('axis-courtyard-walls', courtyardWallParts, materials.stone, {
      layoutMode: 'artistic-low-side-walls',
      openTowardAxis: true,
    }),
    mergeMesh('axis-covered-gallery-columns', galleryPosts, materials.redWood, {
      accuracy: 'aerial-guided-artistic-approximation',
    }),
    mergeMesh('axis-covered-gallery-roofs', galleryRoofs, materials.roof, {
      accuracy: 'aerial-guided-artistic-approximation',
    }),
    mergeMesh('continuous-axis-stairs', pathParts, materials.stoneLight, {
      connectsAllFiveAxisTerraces: true,
      flights: stairFlights,
    }),
  );

  const incenseCourt = courtyardMeta.find((court) => court.purpose === 'open-incense-court');
  const incenseCenter = new THREE.Vector3(incenseCourt.center[0], incenseCourt.height, incenseCourt.center[1]);
  const incense = [
    transformed(new THREE.CylinderGeometry(0.66, 0.72, 0.16, 12), incenseCenter.clone().add(new THREE.Vector3(0, 0.08, 0)).toArray()),
    transformed(new THREE.CylinderGeometry(0.58, 0.45, 0.68, 12), incenseCenter.clone().add(new THREE.Vector3(0, 0.56, 0)).toArray()),
    transformed(new THREE.TorusGeometry(0.57, 0.055, 6, 16), incenseCenter.clone().add(new THREE.Vector3(0, 0.90, 0)).toArray(), [Math.PI / 2, 0, 0]),
  ];
  environment.add(mergeMesh('front-court-incense-burner', incense, materials.bronze, { accuracy: 'artistic-approximation' }));

  const treePositions = [];
  for (let index = 0; index < 66; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const x = side * (32 + (index * 7 % 12));
    const z = 48 - (index * 17 % 108);
    const height = 2.8 + (index * 13 % 18) / 10;
    treePositions.push([x, 0, z, height]);
  }
  const buildingFrames = layout.buildings.map(footprintFrame);
  for (let index = 0; index < 230; index += 1) {
    const [radius, hillHeight, centerX, centerZ] = backdropHills[index % 3];
    const angle = index * 2.399963;
    const distance = radius * Math.sqrt(((index * 67) % 229 + 0.5) / 230) * 0.94;
    const x = centerX + Math.cos(angle) * distance;
    const z = centerZ + Math.sin(angle) * distance;
    if (buildingFrames.some((frame) => {
      const dx = x - frame.center.x;
      const dz = z - frame.center.y;
      return Math.abs(Math.cos(AXIS_ROTATION) * dx - Math.sin(AXIS_ROTATION) * dz) < frame.width / 2 + 3
        && Math.abs(Math.sin(AXIS_ROTATION) * dx + Math.cos(AXIS_ROTATION) * dz) < frame.depth / 2 + 3;
    })) continue;
    const t = distance / radius;
    const ring = Math.floor(t * 5);
    const y = THREE.MathUtils.lerp(hillHeight * Math.pow(1 - ring / 5, 1.55),
      hillHeight * Math.pow(1 - (ring + 1) / 5, 1.55), t * 5 - ring) - 0.15;
    treePositions.push([x, y, z, 2.6 + (index * 11 % 17) / 10]);
  }
  const trunkGeometry = prepared(new THREE.CylinderGeometry(0.11, 0.2, 1, 7));
  trunkGeometry.translate(0, 0.5, 0);
  const crownGeometries = [
    prepared(new THREE.IcosahedronGeometry(1, 1)),
    prepared(new THREE.ConeGeometry(0.85, 2.2, 8)),
    prepared(new THREE.DodecahedronGeometry(1, 0)),
  ];
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.trunk, treePositions.length);
  trunks.name = 'forest-trunks';
  trunks.castShadow = true;
  const crowns = crownGeometries.map((geometry, index) => {
    const count = treePositions.filter((_, itemIndex) => itemIndex % 3 === index).length;
    const mesh = new THREE.InstancedMesh(geometry, materials[`leaf${index + 1}`], count);
    mesh.name = `forest-crown-variant-${index + 1}`;
    mesh.castShadow = true;
    return mesh;
  });
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const crownCounts = [0, 0, 0];
  treePositions.forEach(([x, y, z, height], index) => {
    matrix.compose(new THREE.Vector3(x, y, z), quaternion, new THREE.Vector3(height, height, height));
    trunks.setMatrixAt(index, matrix);
    const type = index % 3;
    matrix.compose(
      new THREE.Vector3(x, y + height * 0.9, z), quaternion,
      new THREE.Vector3(height * 0.45, height * (type === 1 ? 0.58 : 0.48), height * 0.45),
    );
    crowns[type].setMatrixAt(crownCounts[type], matrix);
    crownCounts[type] += 1;
  });
  environment.add(trunks, ...crowns);
  return environment;
}

/**
 * Builds a close-range, original artistic interpretation of Lingyin Temple.
 * OSM WGS84 outlines guide relative placement; unknown heights, terraces and
 * exterior details are deliberately marked as estimates rather than survey data.
 */
export function createLingyinModel() {
  const materials = {
    ground: surface('#5a6847'), hill: surface('#40583e'), courtyard: surface('#aaa083'),
    stone: surface('#8e8777'), stoneLight: surface('#bbb19a'), wall: surface('#c8aa67'),
    redWood: surface('#813c32'), bracket: surface('#704139'), door: surface('#3a302b'),
    lattice: surface('#a3523e'), roof: surface('#414640', 0.88), gable: surface('#b98755'), ridge: surface('#55584f', 0.82),
    bronze: surface('#6c5b44', 0.7),
    trunk: surface('#49392e'), leaf1: surface('#294b35'), leaf2: surface('#365c3d'), leaf3: surface('#426a45'),
  };
  const group = new THREE.Group();
  group.name = 'lingyin-temple-model';
  group.userData = {
    kind: 'artistic-approximation',
    subject: 'Hangzhou Lingyin Temple exterior ensemble',
    orientation: 'north=-z',
    axisRotation: AXIS_ROTATION,
    entranceDirection: '+z',
    sceneUnitsPerMeter: UNIT_SCALE,
    layoutSource: 'OpenStreetMap selected WGS84 footprints',
    layoutAccuracy: 'approximate-not-surveyed',
    terraceHeightAccuracy: 'artistic-estimate',
    scope: 'exterior-only-no-interior-statues',
    axisOrder: ['tianwang', 'daxiong', 'yaoshi', 'zhizhi', 'huayan'],
  };
  group.add(createEnvironment(materials));
  layout.buildings.forEach((building) => {
    if (building.key === 'luohan') group.add(createLuohanHall(building, materials));
    else group.add(createHall(building, materials));
  });
  group.updateMatrixWorld(true);

  const anchors = {};
  for (const key of ['tianwang', 'daxiong', 'yaoshi', 'zhizhi', 'huayan', 'luohan', 'jigong']) {
    const bounds = new THREE.Box3().setFromObject(group.getObjectByName(`building-${key}`));
    anchors[key] = new THREE.Vector3(
      (bounds.min.x + bounds.max.x) / 2,
      bounds.max.y + 0.55,
      (bounds.min.z + bounds.max.z) / 2,
    );
  }
  return { group, anchors };
}
