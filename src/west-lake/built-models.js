import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSantanOverviewTower } from './santanyinyue/model.js';

// Lightweight, source-path-driven landmarks for the West Lake scene.  The source
// geometry is deliberately kept in WGS84; this module only turns it into scene
// objects and does not invent a second map projection.
function mat(color, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function linePoints(terrain, points) {
  return points.map(([lon, lat]) => {
    const [x, z] = terrain.toWorld(lon, lat);
    return new THREE.Vector3(x, 0, z);
  });
}

function ribbon(points, width, y, material) {
  const positions = [];
  const indices = [];
  points.forEach((point, index) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const dx = after.x - before.x, dz = after.z - before.z;
    const length = Math.hypot(dx, dz) || 1;
    positions.push(point.x - dz / length * width / 2, y, point.z + dx / length * width / 2,
      point.x + dz / length * width / 2, y, point.z - dx / length * width / 2);
    if (index) indices.push((index - 1) * 2, index * 2, (index - 1) * 2 + 1,
      index * 2, index * 2 + 1, (index - 1) * 2 + 1);
  });
  // Very short mapped segments at a bend can invert one wide-strip triangle.
  // Keep every top face facing upward even at those joins.
  for (let index = 0; index < indices.length; index += 3) {
    const [a, b, c] = indices.slice(index, index + 3).map((vertex) => vertex * 3);
    const normalY = (positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a])
      - (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]);
    if (normalY < 0) [indices[index + 1], indices[index + 2]] = [indices[index + 2], indices[index + 1]];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.surface = 'causeway';
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function boxBetween(a, b, width, height, y, material) {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, width), material);
  mesh.position.set((a.x + b.x) / 2, y + height / 2, (a.z + b.z) / 2);
  mesh.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function createArchBridge(a, b, width, scale, materials, detailed) {
  const group = new THREE.Group();
  const dx = b.x - a.x, dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 1;
  const angle = -Math.atan2(dz, dx);
  const y = a.y - 0.075;
  const span = length;
  const deckHeight = 0.10 * scale;
  const wallHeight = 0.095 - deckHeight;
  const rise = 0.40 * scale;
  const deckY = (x) => wallHeight + rise * Math.cos(x / span * Math.PI);
  const openingWidth = Math.min(span * 0.62, 2.2 * scale);
  const openingHeight = Math.min(wallHeight * 0.7, openingWidth * 0.7);
  const stone = materials.stone;
  group.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
  group.rotation.y = angle;
  const deckPoints = Array.from({ length: 13 }, (_, index) => {
    const x = -span / 2 + span * index / 12;
    return new THREE.Vector3(x, deckY(x), 0);
  });
  // The curved bridge deck reaches the same elevation as the adjoining dyke.
  const deck = ribbon(deckPoints, width, 0, stone);
  const deckPositions = deck.geometry.getAttribute('position');
  for (let index = 0; index < deckPositions.count; index++) {
    deckPositions.setY(index, deckY(deckPositions.getX(index)) + deckHeight);
  }
  deck.geometry.computeVertexNormals();
  delete deck.userData.surface;
  group.add(deck);

  // Two low-poly side walls with a closed arch-shaped hole. The tiny sill makes
  // ExtrudeGeometry robust across Three.js releases while keeping the opening
  // visually open at water level.
  const side = new THREE.Shape();
  side.moveTo(-span / 2, 0); side.lineTo(span / 2, 0);
  for (let index = 12; index >= 0; index--) {
    const x = -span / 2 + span * index / 12;
    side.lineTo(x, deckY(x) + deckHeight);
  }
  side.closePath();
  const hole = new THREE.Path();
  const r = openingWidth / 2;
  hole.moveTo(r, 0.035 * scale);
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12 * Math.PI;
    hole.lineTo(Math.cos(t) * r, 0.035 * scale + Math.sin(t) * openingHeight);
  }
  hole.lineTo(-r, 0.035 * scale);
  hole.closePath(); side.holes.push(hole);
  const wallGeometry = new THREE.ExtrudeGeometry(side, { depth: 0.11 * scale, bevelEnabled: false, curveSegments: 6 });
  for (const z of [-width / 2, width / 2 - 0.11 * scale]) {
    const wall = new THREE.Mesh(wallGeometry, stone);
    wall.position.z = z;
    wall.castShadow = wall.receiveShadow = true;
    group.add(wall);
  }
  if (detailed) {
    const rail = materials.rail;
    const railHeight = 0.27 * scale;
    for (const sideZ of [-width / 2 + 0.03 * scale, width / 2 - 0.03 * scale]) {
      for (let index = 0; index < deckPoints.length - 1; index++) {
        const from = deckPoints[index], to = deckPoints[index + 1];
        const segment = new THREE.Mesh(new THREE.BoxGeometry(to.x - from.x, 0.055 * scale, 0.08 * scale), rail);
        segment.position.set((from.x + to.x) / 2, (from.y + to.y) / 2 + deckHeight + railHeight, sideZ);
        segment.rotation.z = Math.atan2(to.y - from.y, to.x - from.x);
        segment.userData.detail = true; group.add(segment);
      }
      const postGeometry = new THREE.CylinderGeometry(0.025 * scale, 0.025 * scale, railHeight, 5);
      const count = Math.max(2, Math.ceil(span / (0.35 * scale)));
      for (let i = 0; i <= count; i += 1) {
        const post = new THREE.Mesh(postGeometry, rail);
        const x = -span / 2 + span * i / count;
        post.position.set(x, deckY(x) + deckHeight + railHeight / 2, sideZ);
        post.userData.detail = true;
        post.castShadow = post.receiveShadow = true;
        group.add(post);
      }
    }
  }
  group.traverse((child) => { if (child.isMesh) child.castShadow = child.receiveShadow = true; });
  return group;
}

function createWillow(materials, scale) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * scale, 0.045 * scale, 0.6 * scale, 6), materials.trunk);
  trunk.position.y = 0.3 * scale; group.add(trunk);
  const branchGeometry = new THREE.CylinderGeometry(0.008 * scale, 0.014 * scale, 0.36 * scale, 4);
  const leafGeometry = new THREE.IcosahedronGeometry(0.12 * scale, 0);
  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI / 2;
    const start = new THREE.Vector3(0, 0.52 * scale, 0);
    const end = new THREE.Vector3(Math.cos(angle) * 0.22 * scale, 0.72 * scale, Math.sin(angle) * 0.22 * scale);
    const branch = new THREE.Mesh(branchGeometry, materials.trunk);
    branch.position.copy(start).add(end).multiplyScalar(0.5);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    branch.scale.y = start.distanceTo(end) / (0.36 * scale);
    group.add(branch);
    const leaf = new THREE.Mesh(leafGeometry, i % 2 ? materials.leafLight : materials.leaf);
    leaf.position.copy(end); leaf.position.y -= 0.17 * scale;
    leaf.scale.set(0.8, 2.1, 0.8); group.add(leaf);
  }
  group.traverse((child) => { if (child.isMesh) child.castShadow = child.receiveShadow = true; });
  return group;
}

function createPeach(materials, scale) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.022 * scale, 0.038 * scale, 0.55 * scale, 6), materials.trunk);
  trunk.position.y = 0.275 * scale; group.add(trunk);
  const branchGeometry = new THREE.CylinderGeometry(0.007 * scale, 0.012 * scale, 0.28 * scale, 4);
  const blossomGeometry = new THREE.IcosahedronGeometry(0.105 * scale, 0);
  for (let i = 0; i < 4; i += 1) {
    const angle = i * Math.PI / 2;
    const start = new THREE.Vector3(0, 0.40 * scale, 0);
    const end = new THREE.Vector3(Math.cos(angle) * 0.22 * scale, (0.60 + Math.sin(i * 2) * 0.04) * scale, Math.sin(angle) * 0.22 * scale);
    const branch = new THREE.Mesh(branchGeometry, materials.trunk);
    branch.position.copy(start).add(end).multiplyScalar(0.5);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
    branch.scale.y = start.distanceTo(end) / (0.28 * scale); group.add(branch);
    const blossom = new THREE.Mesh(blossomGeometry, i % 2 ? materials.blossom : materials.blossomLight);
    blossom.position.copy(end); blossom.position.y += 0.05 * scale;
    blossom.scale.set(1, 1.1, 1); group.add(blossom);
  }
  group.traverse((child) => { if (child.isMesh) child.castShadow = child.receiveShadow = true; });
  return group;
}

function pavilionRoof(scale, material) {
  const positions = [], indices = [];
  const outline = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  [[0.67, 0], [0.48, 0.055], [0.22, 0.21], [0.035, 0.30]].forEach(([radius, height], ring) => {
    outline.forEach(([x, z], index) => {
      // Raised corners and a concave profile suggest the swept Jiangnan eaves.
      positions.push(x * radius * scale, (height + (ring === 0 && index % 2 === 0 ? 0.07 : 0)) * scale, z * radius * scale * 0.78);
      if (ring) {
        const a = (ring - 1) * 8 + index, b = (ring - 1) * 8 + (index + 1) % 8;
        const c = ring * 8 + index, d = ring * 8 + (index + 1) % 8;
        indices.push(a, c, b, b, c, d);
      }
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

function createPavilion(scale, materials, detailed) {
  const group = new THREE.Group();
  const s = scale;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(1.0 * s, 0.09 * s, 0.72 * s), materials.stone);
  floor.position.y = 0.05 * s; group.add(floor);
  const postGeometry = new THREE.CylinderGeometry(0.035 * s, 0.045 * s, 0.65 * s, 6);
  [[-0.4, -0.27], [0.4, -0.27], [-0.4, 0.27], [0.4, 0.27]].forEach(([x, z]) => {
    const post = new THREE.Mesh(postGeometry, materials.wood); post.position.set(x * s, 0.39 * s, z * s); group.add(post);
  });
  const roof = pavilionRoof(s, materials.roof);
  roof.position.y = 0.71 * s; group.add(roof);
  const upperRoof = pavilionRoof(s * 0.65, materials.roof);
  upperRoof.position.y = 0.93 * s; group.add(upperRoof);
  if (detailed) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.95 * s, 0.035 * s, 0.035 * s), materials.roof);
    ridge.position.y = 1.0 * s; ridge.userData.detail = true; group.add(ridge);
  }
  group.traverse((child) => { if (child.isMesh) child.castShadow = child.receiveShadow = true; });
  return group;
}

function mergeStaticMeshes(container, include = () => true, detail = false) {
  container.updateMatrixWorld(true);
  const inverse = container.matrixWorld.clone().invert();
  const buckets = new Map();
  const sources = [];
  container.traverse((child) => {
    if (!child.isMesh || child.userData.merged || !include(child)) return;
    const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geometry.deleteAttribute('uv');
    geometry.deleteAttribute('normal');
    geometry.applyMatrix4(inverse.clone().multiply(child.matrixWorld));
    const bucket = buckets.get(child.material) || { geometries: [], surface: child.userData.surface };
    if (bucket.surface !== child.userData.surface) bucket.surface = undefined;
    bucket.geometries.push(geometry); buckets.set(child.material, bucket);
    sources.push(child); child.userData.merged = true;
  });
  for (const [material, { geometries, surface }] of buckets) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) continue;
    merged.computeVertexNormals();
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, material);
    mesh.userData.detail = detail;
    if (surface) mesh.userData.surface = surface;
    mesh.castShadow = mesh.receiveShadow = true;
    container.add(mesh);
  }
  const disposed = new Set();
  sources.forEach((source) => {
    source.parent?.remove(source);
    if (!disposed.has(source.geometry)) { source.geometry.dispose(); disposed.add(source.geometry); }
  });
}

export function createWestLakeBuiltModels(terrain, data = {}, horizontalScale = 0.003) {
  const materials = {
    grass: mat('#5b795c'), path: mat('#bdad86'), stone: mat('#9f9b83'), rail: mat('#786e5b'),
    trunk: mat('#5b4432'), leaf: mat('#547659'), leafLight: mat('#78936e'), blossom: mat('#bd766d'), blossomLight: mat('#e1a18e'),
    wood: mat('#6d5238'), roof: mat('#8f5c46'),
  };
  const group = new THREE.Group(); group.name = 'west-lake-built-models';
  materials.roof.side = THREE.DoubleSide;
  const anchors = new Map(); const clearings = [];
  const low = new THREE.Group(); const high = new THREE.Group(); group.add(low, high);
  // Island outlines are separate from landmark POIs in the extracted source.
  // Keep them as low stone edges so the lake geometry remains the authority for
  // water/land fill and no interior paths are invented.
  for (const islandData of data.islands || []) {
    if (!islandData.outer?.length) continue;
    const ring = linePoints(terrain, islandData.outer);
    const island = new THREE.Group(); island.name = `island-${islandData.id}`;
    for (let i = 0; i < ring.length - 1; i += 1) {
      island.add(boxBetween(ring[i], ring[i + 1], horizontalScale * 2.2, horizontalScale * 3.8,
        terrain.waterHeight - 0.005, materials.stone));
    }
    low.add(island);
    const center = ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
    anchors.set(islandData.id, { x: center.x, y: terrain.waterHeight + 0.08, z: center.z });
    clearings.push({ x: center.x, z: center.z, radius: horizontalScale * 55 });
  }
  const paths = data.causeways || [];
  for (const causeway of paths) {
    const points = linePoints(terrain, causeway.points || []); if (points.length < 2) continue;
    points.forEach((p) => { p.y = terrain.waterHeight + 0.07; });
    const width = (causeway.widthMetres || 7) * horizontalScale;
    const bridgeEnds = (data.bridges || []).flatMap((bridge) => (bridge.points || []).map(([lon, lat]) => terrain.toWorld(lon, lat)));
    const bridgeEdges = new Set(data.bridges.map(({ nodeIds }) => [...nodeIds].sort().join('/')));
    const chunks = [[]];
    chunks[0].push(points[0]);
    for (let index = 1; index < points.length; index++) {
      const edge = [causeway.nodeIds[index - 1], causeway.nodeIds[index]].sort().join('/');
      if (bridgeEdges.has(edge)) chunks.push([points[index]]);
      else chunks.at(-1).push(points[index]);
    }
    chunks.filter((chunk) => chunk.length > 1).forEach((chunk, index) => {
      for (let index = 1; index < chunk.length; index++) {
        low.add(boxBetween(chunk[index - 1], chunk[index], width, 0.092, terrain.waterHeight - 0.005, materials.stone));
      }
      const strip = ribbon(chunk, width, terrain.waterHeight + 0.09, materials.grass); strip.name = `causeway-${causeway.id}-${index}`; low.add(strip);
      const walk = ribbon(chunk, width * 0.32, terrain.waterHeight + 0.093, materials.path); low.add(walk);
    });
    const trees = new THREE.Group();
    // Resample in metres so sparse OSM bends do not make the trees sparse too.
    let seed = 0;
    for (let i = 0; i < points.length - 1; i += 1) {
      const from = points[i], to = points[i + 1];
      const distance = Math.hypot(to.x - from.x, to.z - from.z);
      const count = Math.max(1, Math.ceil(distance / (horizontalScale * 26)));
      for (let sample = 0; sample < count; sample += 1) {
        const t = (sample + 0.5) / count;
        const p = from.clone().lerp(to, t); const next = to;
        if (bridgeEnds.some(([bx, bz]) => Math.hypot(p.x - bx, p.z - bz) < width * 1.8)) continue;
        const angle = Math.atan2(next.z - from.z, next.x - from.x); const side = seed++ % 2 ? 1 : -1;
        // 白堤传统上间株杨柳、间株桃；苏堤也保留少量桃树变化。
        const tree = (causeway.id === 'baidi' && seed % 2 === 0) || (causeway.id === 'sudi' && seed % 5 === 0)
          ? createPeach(materials, horizontalScale * 48) : createWillow(materials, horizontalScale * 48);
        tree.position.set(p.x - Math.sin(angle) * width * 0.33 * side, terrain.waterHeight + 0.09, p.z + Math.cos(angle) * width * 0.33 * side);
        tree.rotation.y = angle + Math.sin(seed * 12.7) * 0.5;
        tree.scale.setScalar(0.88 + (Math.sin(seed * 7.3) + 1) * 0.12);
        trees.add(tree);
      }
    }
    low.add(trees);
    const middle = points[Math.floor(points.length / 2)];
    anchors.set(causeway.id, { x: middle.x, y: terrain.waterHeight + 0.13, z: middle.z });
  }
  for (const bridge of data.bridges || []) {
    const points = linePoints(terrain, bridge.points || []); if (points.length < 2) continue;
    points.forEach((p) => { p.y = terrain.waterHeight + 0.07; });
    const width = (bridge.widthMetres || 5) * horizontalScale;
    const model = createArchBridge(points[0], points[1], width, horizontalScale * 28, materials, true);
    model.name = `bridge-${bridge.id}`; high.add(model);
    const mid = points[0].clone().add(points[1]).multiplyScalar(0.5);
    anchors.set(bridge.id, { x: mid.x, y: terrain.waterHeight + 0.09 + horizontalScale * 28 * 0.4, z: mid.z });
    clearings.push({ x: mid.x, z: mid.z, radius: width * 1.8 });
  }
  for (const landmark of data.landmarks || []) {
    const coordinate = [landmark.longitude, landmark.latitude];
    const [x, z] = terrain.toWorld(...coordinate); const y = terrain.getHeight(x, z);
    const isPagoda = landmark.kind === 'stone-pagodas' || landmark.id === 'santan';
    if (!isPagoda) {
      const model = createPavilion(horizontalScale * 48, materials, true);
      model.position.set(x, Math.max(y, terrain.waterHeight) + 0.002, z); model.name = `landmark-${landmark.id}`; high.add(model);
      anchors.set(landmark.id, { x, y: model.position.y + horizontalScale * 48 * 0.6, z });
      clearings.push({ x, z, radius: horizontalScale * 90 });
      continue;
    }
    clearings.push({ x, z, radius: horizontalScale * 90 });
    if (isPagoda) {
      const towerPoints = (landmark.points || []).map((tower) => Array.isArray(tower) ? tower : [tower.longitude, tower.latitude]);
      // OSM currently supplies one mapped tower. The other two are positioned
      // as clearly artistic equidistant companions around the source point.
      while (towerPoints.length < 3) {
        const mapped = towerPoints[0] || coordinate;
        // Keep the mapped southern tower fixed and distribute the two artistic
        // companions around it toward the water, away from the island edge.
        const offset = towerPoints.length === 1 ? [0.00048, -0.00008] : [0.00020, -0.00046];
        let candidate = [mapped[0] + offset[0], mapped[1] + offset[1]];
        if (terrain.isWater) {
          const [cx, cz] = terrain.toWorld(...candidate);
          if (!terrain.isWater(cx, cz)) candidate = [mapped[0] + offset[0] * 0.6, mapped[1] + offset[1] * 1.5];
        }
        towerPoints.push(candidate);
      }
      towerPoints.slice(0, 3).forEach((tower, index) => {
        const [tx, tz] = terrain.toWorld(...tower);
        const towerModel = createSantanOverviewTower(horizontalScale * 3.6);
        towerModel.position.set(tx, terrain.waterHeight - 0.005, tz); towerModel.name = `santan-tower-${index + 1}`; high.add(towerModel);
        towerModel.userData.coordinate = tower;
        if (index === 0) {
          towerModel.updateMatrixWorld(true);
          const maxY = new THREE.Box3().setFromObject(towerModel).max.y;
          anchors.set(landmark.id, { x: tx, y: maxY + 0.012, z: tz });
        }
      });
    }
  }
  // Rail posts, roof pieces and the small trees share only a handful of
  // materials. Merge them after placement so this whole landmark layer stays
  // inexpensive when it is finally attached to the scene.
  mergeStaticMeshes(low);
  const levels = high.children.map((model) => {
    mergeStaticMeshes(model, (child) => !child.userData.detail);
    mergeStaticMeshes(model, (child) => child.userData.detail, true);
    return { model, sphere: new THREE.Box3().setFromObject(model).getBoundingSphere(new THREE.Sphere()),
      details: model.children.filter((child) => child.userData.detail), detailed: false };
  });
  // Empty tree containers are no longer needed after static geometry batching.
  low.children.filter((child) => child.isGroup).forEach((child) => low.remove(child));
  const point = new THREE.Vector3();
  let last = -Infinity;
  function update(camera, viewportHeight = 800, elapsed = performance.now() / 1000) {
    if (elapsed - last < 0.12) return;
    last = elapsed;
    camera.updateMatrixWorld();
    const pixelsPerUnit = viewportHeight * camera.projectionMatrix.elements[5] / 2;
    for (const level of levels) {
      point.copy(level.sphere.center).applyMatrix4(camera.matrixWorldInverse);
      const pixels = point.z < 0 ? level.sphere.radius * 2 * pixelsPerUnit / -point.z : 0;
      level.detailed = pixels > (level.detailed ? 30 : 35);
      level.details.forEach((mesh) => { mesh.visible = level.detailed; });
    }
  }
  return { group, update, anchors, clearings };
}
