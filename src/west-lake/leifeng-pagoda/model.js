import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LEIFENG_SITE } from './site-layout.js';

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

function groundHeight(x, z) {
  const { width, height, originX, originZ, stepX, stepZ, values } = LEIFENG_SITE.ground;
  const fx = THREE.MathUtils.clamp((x - originX) / stepX, 0, width - 1);
  const fz = THREE.MathUtils.clamp((z - originZ) / stepZ, 0, height - 1);
  const x0 = Math.min(width - 2, Math.floor(fx));
  const z0 = Math.min(height - 2, Math.floor(fz));
  const tx = fx - x0, tz = fz - z0;
  const sample = (ix, iz) => values[iz * width + ix];
  const a = sample(x0, z0), b = sample(x0 + 1, z0), c = sample(x0, z0 + 1), d = sample(x0 + 1, z0 + 1);
  if (tx + tz <= 1) return a * (1 - tx - tz) + b * tx + c * tz;
  return b * (1 - tz) + c * (1 - tx) + d * (tx + tz - 1);
}

export function getLeifengRawGroundHeight(x, z) {
  return groundHeight(x, z);
}

function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i], [xj, zj] = polygon[j];
    const intersects = ((zi > z) !== (zj > z)) && x < (xj - xi) * (z - zi) / (zj - zi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

const pondFloor = Math.min(...LEIFENG_SITE.pond.map(([x, z]) => groundHeight(x, z))) - 0.25;
const terrainStep = 2;
const terrainMinX = Math.min(...LEIFENG_SITE.boundary.map(([x]) => x)) - 2;
const terrainMinZ = Math.min(...LEIFENG_SITE.boundary.map(([, z]) => z)) - 2;

function polygonDistance(x, z, polygon) {
  let distance = Infinity;
  for (let i = 1; i < polygon.length; i++) {
    distance = Math.min(distance, distanceToSegment(x, z, ...polygon[i - 1], ...polygon[i]));
  }
  return distance;
}

export function getLeifengSiteBlend(x, z) {
  return pointInPolygon(x, z, LEIFENG_SITE.boundary) ? 1
    : 1 - THREE.MathUtils.smoothstep(polygonDistance(x, z, LEIFENG_SITE.boundary), 0, 10);
}

function gradedHeight(x, z) {
  let y = groundHeight(x, z);
  const pondDistance = polygonDistance(x, z, LEIFENG_SITE.pond);
  if (pointInPolygon(x, z, LEIFENG_SITE.pond) || pondDistance < 3) y = pondFloor;
  else if (pondDistance < 7) {
    y = THREE.MathUtils.lerp(pondFloor, y, THREE.MathUtils.smoothstep(pondDistance, 3, 7));
  }
  const radius = Math.hypot(x, z);
  // Grade only the immediate terrace: cut uphill and fill downhill so a
  // coarse, exaggerated DEM cannot turn its perimeter into a tall pedestal.
  if (radius < 15.5) y = -0.12;
  else if (radius < 30) y = THREE.MathUtils.lerp(-0.12, y,
    THREE.MathUtils.smoothstep(radius, 15.5, 30));
  // Short missing approach is an explicitly artistic link to the original
  // tower stairs. The long uphill segment retains its mapped footprint.
  const upper = LEIFENG_SITE.paths.find(({ kind }) => kind === 'ascending').points
    .reduce((a, b) => a[1] < b[1] ? a : b);
  const rampEnd = upper[1] + 12;
  if (Math.abs(x) < 5 && z >= 14 && z <= rampEnd) {
    const t = THREE.MathUtils.clamp((z - 17) / (rampEnd - 17), 0, 1);
    const height = THREE.MathUtils.lerp(0, groundHeight(upper[0], rampEnd), t);
    y = THREE.MathUtils.lerp(height, y, THREE.MathUtils.smoothstep(Math.abs(x), 3.5, 5));
  }
  return y;
}

// Queries use the very same triangles as the standalone mesh. This keeps
// paths and tree roots on the visible surface across DEM creases.
export function getLeifengGroundHeight(x, z) {
  const gx = (x - terrainMinX) / terrainStep, gz = (z - terrainMinZ) / terrainStep;
  const col = Math.floor(gx), row = Math.floor(gz);
  const px = terrainMinX + col * terrainStep, pz = terrainMinZ + row * terrainStep;
  const u = gx - col, v = gz - row;
  const a = gradedHeight(px, pz), b = gradedHeight(px + terrainStep, pz);
  const c = gradedHeight(px, pz + terrainStep), d = gradedHeight(px + terrainStep, pz + terrainStep);
  return u + v <= 1 ? a * (1 - u - v) + b * u + c * v
    : b * (1 - v) + c * (1 - u) + d * (u + v - 1);
}

function createClosedHillside(material) {
  const outline = LEIFENG_SITE.boundary;
  const columns = Math.ceil((Math.max(...outline.map(([x]) => x)) + 2 - terrainMinX) / terrainStep);
  const rows = Math.ceil((Math.max(...outline.map(([, z]) => z)) + 2 - terrainMinZ) / terrainStep);
  const positions = [], indices = [], vertices = new Map(), edges = new Map();
  const vertex = (col, row) => {
    const key = row * (columns + 1) + col;
    if (!vertices.has(key)) {
      const x = terrainMinX + col * terrainStep, z = terrainMinZ + row * terrainStep;
      vertices.set(key, positions.length / 3);
      positions.push(x, getLeifengGroundHeight(x, z), z);
    }
    return vertices.get(key);
  };
  const edge = (a, b) => {
    const key = Math.min(a, b) + '/' + Math.max(a, b);
    if (edges.has(key)) edges.delete(key);
    else edges.set(key, [a, b]);
  };
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const x = terrainMinX + (col + 0.5) * terrainStep, z = terrainMinZ + (row + 0.5) * terrainStep;
    if (!pointInPolygon(x, z, outline) && polygonDistance(x, z, outline) > 3) continue;
    const a = vertex(col, row), b = vertex(col + 1, row), c = vertex(col, row + 1), d = vertex(col + 1, row + 1);
    indices.push(a, c, b, b, c, d);
    [[a, c], [c, d], [d, b], [b, a]].forEach(([a, b]) => edge(a, b));
  }
  const topIndices = [...indices], topCount = positions.length / 3;
  let bottomY = Infinity;
  for (let i = 1; i < positions.length; i += 3) bottomY = Math.min(bottomY, positions[i] - 6);
  for (let i = 0; i < topCount; i++) positions.push(positions[i * 3], bottomY, positions[i * 3 + 2]);
  for (let i = 0; i < topIndices.length; i += 3) {
    indices.push(topCount + topIndices[i], topCount + topIndices[i + 2], topCount + topIndices[i + 1]);
  }
  edges.forEach(([a, b]) => indices.push(a, a + topCount, b, b, a + topCount, b + topCount));
  const colors = [], green = new THREE.Color('#56664a'), soil = new THREE.Color('#514936');
  for (let i = 0; i < topCount * 2; i++) colors.push(...(i < topCount ? green : soil).toArray());
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const surface = material;
  surface.color.set('#ffffff'); surface.vertexColors = true;
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.name = 'leifeng-closed-hillside';
  mesh.userData = { closedSolid: true, bottomY, terrainStep, sourceBoundary: 'OSM park outline with 6m display margin' };
  mesh.receiveShadow = true;
  return mesh;
}

function createSitePath(material, points, width, name) {
  const sampled = [];
  points.forEach((point, index) => {
    if (!index) sampled.push(point);
    else {
      const previous = points[index - 1];
      const distance = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
      const steps = Math.max(1, Math.ceil(distance));
      for (let step = 1; step <= steps; step += 1) {
        sampled.push([THREE.MathUtils.lerp(previous[0], point[0], step / steps),
          THREE.MathUtils.lerp(previous[1], point[1], step / steps)]);
      }
    }
  });
  const vertices = [];
  const indices = [];
  sampled.forEach(([x, z], index) => {
    const before = sampled[Math.max(0, index - 1)];
    const after = sampled[Math.min(sampled.length - 1, index + 1)];
    const dx = after[0] - before[0], dz = after[1] - before[1];
    const length = Math.hypot(dx, dz) || 1;
    for (const side of [-1, 1]) {
      const px = x + side * dz / length * width, pz = z - side * dx / length * width;
      vertices.push(px, getLeifengGroundHeight(px, pz) + 0.28, pz);
    }
    if (index) {
      const a = (index - 1) * 2, b = index * 2;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}

function createPond(material) {
  const shape = new THREE.Shape();
  LEIFENG_SITE.pond.forEach(([x, z], index) => {
    if (index) shape.lineTo(x, -z);
    else shape.moveTo(x, -z);
  });
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, pondFloor + 0.25, 0);
  const pond = new THREE.Mesh(geometry, material);
  pond.name = 'release-pond';
  pond.receiveShadow = true;
  return pond;
}

function createSiteDetails(materials) {
  const group = new THREE.Group();
  group.name = 'leifeng-site-details';
  LEIFENG_SITE.paths.forEach(({ id, kind, points }) => {
    group.add(createSitePath(materials.path, points, kind === 'ascending' ? 1.05 : 0.7, `leifeng-path-${id}`));
  });
  const pond = createPond(new THREE.MeshPhysicalMaterial({
    color: '#477b80', roughness: 0.34, metalness: 0.05, transparent: true, opacity: 0.88,
  }));
  group.add(pond);
  const upper = LEIFENG_SITE.paths.find(({ kind }) => kind === 'ascending').points
    .reduce((a, b) => a[1] < b[1] ? a : b);
  const link = createSitePath(materials.path, [upper, [0, 15.58]], 1.05, 'leifeng-entry-link');
  link.userData.artisticConnection = true;
  group.add(link);
  const [entryX, entryZ] = LEIFENG_SITE.entrance;
  const entry = createSitePath(materials.path,
    [[entryX, entryZ - 1.5], [entryX, entryZ + 1.5]], 2, 'leifeng-entrance-landing');
  group.add(entry);
  return group;
}

function distanceToSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

function createTreePositions() {
  const positions = [];
  const minX = Math.min(...LEIFENG_SITE.boundary.map(([x]) => x));
  const maxX = Math.max(...LEIFENG_SITE.boundary.map(([x]) => x));
  const minZ = Math.min(...LEIFENG_SITE.boundary.map(([, z]) => z));
  const maxZ = Math.max(...LEIFENG_SITE.boundary.map(([, z]) => z));
  for (let z = minZ + 8; z < maxZ; z += 16) {
    for (let x = minX + 8; x < maxX; x += 16) {
      const jitterX = Math.sin(x * 0.37 + z * 0.19) * 4;
      const jitterZ = Math.cos(x * 0.17 - z * 0.31) * 4;
      const px = x + jitterX, pz = z + jitterZ;
      if (!pointInPolygon(px, pz, LEIFENG_SITE.boundary) || Math.hypot(px, pz) < 18) continue;
      const nearPath = LEIFENG_SITE.paths.some(({ points }) => points.slice(1).some((point, index) =>
        distanceToSegment(px, pz, points[index][0], points[index][1], point[0], point[1]) < 5));
      const nearPond = pointInPolygon(px, pz, LEIFENG_SITE.pond);
      if (nearPath || nearPond) continue;
      const height = 2.4 + (Math.abs(Math.sin(px * 0.11 + pz * 0.08)) * 1.8);
      positions.push([px, getLeifengGroundHeight(px, pz), pz, height]);
    }
  }
  return positions;
}

function createLandscape(materials) {
  const group = new THREE.Group();
  group.name = 'leifeng-landscape';

  group.add(createClosedHillside(materials.hill));

  const treePositions = createTreePositions();
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
  treePositions.forEach(([x, , z, height], index) => {
    const y = getLeifengGroundHeight(x, z);
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
    const z = 15.3 - step * 0.56;
    const bottom = Math.min(0, ...[-2.9, 2.9].flatMap((x) => [-0.28, 0.28]
      .map((dz) => getLeifengGroundHeight(x, z + dz) - 0.15)));
    stairParts.push(transformed(new THREE.BoxGeometry(5.8, height - bottom, 0.56),
      [0, (height + bottom) / 2, z]));
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

function createProtectionBase(materials) {
  const group = new THREE.Group();
  group.name = 'leifeng-protection-base';
  const radius = 14.6, positions = [], indices = [];
  // A small octagonal retaining wall and platform supports the actual tower
  // footprint; its lower edge follows the hill instead of forming a huge disk.
  for (let side = 0; side < 8; side++) for (let sample = 0; sample < 8; sample++) {
    const angle = (side * 2 - 1) * Math.PI / 8, next = angle + Math.PI / 4;
    const t = sample / 8;
    const x = THREE.MathUtils.lerp(Math.sin(angle), Math.sin(next), t) * radius;
    const z = THREE.MathUtils.lerp(Math.cos(angle), Math.cos(next), t) * radius;
    positions.push(x, 0.04, z, x, getLeifengGroundHeight(x, z) - 0.2, z);
  }
  for (let i = 0; i < 64; i++) {
    const a = i * 2, b = (i + 1) % 64 * 2;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  group.add(mergeMesh('protection-retaining-wall', [geometry], materials.stone));
  group.add(mergeMesh('protection-terrace', [
    transformed(new THREE.CylinderGeometry(radius, radius, 0.16, 8), [0, -0.04, 0], [0, -Math.PI / 8, 0]),
  ], materials.stoneLight));
  const rails = [];
  for (let i = 1; i < 64; i++) {
    const offset = i * 6;
    const x = positions[offset], z = positions[offset + 2];
    if (z > 11 && Math.abs(x) < 4) continue;
    rails.push(transformed(new THREE.BoxGeometry(0.16, 0.7, 0.16), [x, 0.45, z]));
    const next = (i + 1) % 64 * 6;
    if (!(positions[next + 2] > 11 && Math.abs(positions[next]) < 4)) {
      rails.push(barBetween([x, 0.72, z], [positions[next], 0.72, positions[next + 2]], 0.07, 4));
    }
  }
  group.add(mergeMesh('protection-terrace-railings', rails, materials.stoneLight));
  return group;
}

/**
 * Shared tower precinct used by the overview and the close-range exhibition.
 * Coordinates use the same local convention as the tower: x east, z south.
 */
export function createLeifengCore({ detailed = true } = {}) {
  const towerMaterials = createTowerMaterials();
  const group = new THREE.Group();
  group.name = 'leifeng-site-core';
  group.userData = {
    kind: 'artistic-approximation',
    origin: 'tower-centre',
    coordinateSystem: 'x-east-z-south',
    floorCount: FLOOR_COUNT,
    sides: OCTAGON,
  };
  group.add(createProtectionBase(towerMaterials), createTower(towerMaterials, detailed), createSiteDetails({
    path: material('#a89679'),
  }));
  group.updateMatrixWorld(true);
  const anchors = {
    tower: [0, 16, 6.2],
    base: [0, 3.1, 9.7],
    eaves: [5.8, 23.8, 4.2],
    lakeView: [8.4, 5.2, -7.4],
  };
  return { group, anchors };
}

/**
 * Creates an original, stylised close-range impression of Leifeng Pagoda.
 * Dimensions are scene units chosen for composition, not a measured restoration.
 */
export function createLeifengModel() {
  const materials = {
    hill: material('#56664a'),
    trunk: material('#4a382e'),
    leafDark: material('#294837'),
    leafLight: material('#426448'),
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
  const core = createLeifengCore();
  group.add(createLandscape(materials), core.group);
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
