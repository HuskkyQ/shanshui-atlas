import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function world(toWorld, p) {
  const v = toWorld(p.lon, p.lat);
  return new THREE.Vector3(v.x, v.y || 0, v.z);
}
function ringOf(item, toWorld) {
  const ring = item.points.map((p) => world(toWorld, p));
  if (ring[0].distanceTo(ring.at(-1)) < 1e-8) ring.pop();
  return ring;
}
function colorFor(id) {
  let hash = 0;
  for (const c of id) hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  return hash / 4294967295;
}
function meshBuffer(name, buffer, material) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(buffer.colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
function addTriangle(buffer, a, b, c, color) {
  for (const p of [a, b, c]) {
    buffer.positions.push(p.x, p.y, p.z);
    buffer.colors.push(color.r, color.g, color.b);
  }
}
function addQuad(buffer, a, b, c, d, color) {
  addTriangle(buffer, a, b, c, color);
  addTriangle(buffer, a, c, d, color);
}
function top(buffer, ring, y, color) {
  for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(
    ring.map((p) => new THREE.Vector2(p.x, p.z)),
    [],
  )) {
    const pa = ring[a].clone().setY(y),
      pb = ring[b].clone().setY(y),
      pc = ring[c].clone().setY(y);
    if (new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa)).y < 0)
      addTriangle(buffer, pa, pc, pb, color);
    else addTriangle(buffer, pa, pb, pc, color);
  }
}
function addPitchedRoof(buffer, points, y, color) {
  const p = points.map((v) => v.clone().setY(y));
  if (p[0].distanceToSquared(p[1]) < p[1].distanceToSquared(p[2])) p.push(p.shift());
  const a = p[0].clone().add(p[3]).multiplyScalar(0.5),
    b = p[1].clone().add(p[2]).multiplyScalar(0.5);
  const rise = clamp(p[0].distanceTo(p[3]) * 0.28, 0.012, 0.035);
  a.y += rise;
  b.y += rise;
  addQuad(buffer, p[0], p[1], b, a, color);
  addQuad(buffer, a, b, p[2], p[3], color);
  addTriangle(buffer, p[0], a, p[3], color);
  addTriangle(buffer, p[1], p[2], b, color);
}

export function createXingpingSettlements({
  toWorld,
  getHeight = () => 0,
  isWater = () => false,
  waterLevel = 0,
  data,
}) {
  if (typeof toWorld !== 'function') throw new Error('Xingping settlements requires toWorld');
  if (!data?.buildings || !Array.isArray(data.roads))
    throw new Error('Xingping settlements data is required');
  const group = new THREE.Group();
  group.name = 'xingping-settlements';
  const wallBuffer = { positions: [], colors: [] },
    roofBuffer = { positions: [], colors: [] };
  const accepted = [],
    foundations = [],
    gates = [],
    footprints = [];
  for (const item of data.buildings) {
    const ring = ringOf(item, toWorld);
    if (ring.length < 3) continue;
    const samples = [
      ...ring,
      ...ring.map((p, i) => p.clone().lerp(ring[(i + 1) % ring.length], 0.5)),
    ];
    const center = ring
      .reduce((v, p) => v.add(p), new THREE.Vector3())
      .multiplyScalar(1 / ring.length);
    samples.push(center);
    if (samples.some((p) => isWater(p.x, p.z))) continue;
    const heights = samples.map((p) => getHeight(p.x, p.z));
    const low = Math.min(...heights),
      high = Math.max(...heights);
    if (item.sourceType === 'inferred' && high - low > 0.025 + 1e-7) continue;
    accepted.push(item);
    footprints.push({
      id: item.id,
      sourceType: item.sourceType,
      points: ring.map((p) => ({ x: p.x, z: p.z })),
    });
    const gate = item.ceremonial_gate === 'paifang' || item.man_made === 'ceremonial_gate';
    if (gate) {
      gates.push({ item, ring, low, high });
      continue;
    }
    const height =
      Number(item.levels) > 0
        ? clamp(Number(item.levels) * 0.032, 0.035, 0.18)
        : 0.047 + colorFor(item.id) * 0.018;
    const eave = high + height;
    const wallColor = new THREE.Color('#d3d1c0').lerp(
      new THREE.Color('#aaa994'),
      colorFor(item.id) * 0.3,
    );
    const roofColor = new THREE.Color('#34443c').lerp(
      new THREE.Color('#4b5148'),
      colorFor(item.id),
    );
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length];
      addQuad(
        wallBuffer,
        a.clone().setY(low - 0.02),
        b.clone().setY(low - 0.02),
        b.clone().setY(eave),
        a.clone().setY(eave),
        wallColor,
      );
    }
    foundations.push({
      id: item.id,
      groundMin: low,
      groundMax: high,
      eave,
      displayFoundation: true,
    });
    if (item.sourceType === 'inferred' && ring.length === 4)
      addPitchedRoof(roofBuffer, ring, eave, roofColor);
    else top(roofBuffer, ring, eave + 0.006, roofColor);
  }
  const wallMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.95,
  });
  const roofMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.95,
  });
  group.add(
    meshBuffer('xingping-building-walls', wallBuffer, wallMaterial),
    meshBuffer('xingping-building-roofs', roofBuffer, roofMaterial),
  );

  const gateMaterial = new THREE.MeshStandardMaterial({ color: '#b4b3a3', roughness: 1 });
  const gateGeometry = new THREE.BoxGeometry(1, 1, 1);
  for (const gate of gates) {
    const parent = new THREE.Group();
    parent.name = 'xingping-gate-' + gate.item.id;
    parent.userData = {
      sourceId: gate.item.id,
      shapeApproximation: 'open posts and lintel; dimensions illustrative',
    };
    const center = gate.ring
      .reduce((v, p) => v.add(p), new THREE.Vector3())
      .multiplyScalar(1 / gate.ring.length);
    let edge = new THREE.Vector3(),
      span = 0;
    for (let i = 0; i < gate.ring.length; i++) {
      const v = gate.ring[(i + 1) % gate.ring.length].clone().sub(gate.ring[i]);
      if (v.length() > span) {
        span = v.length();
        edge = v.normalize();
      }
    }
    const yaw = Math.atan2(-edge.z, edge.x);
    const beamY = gate.high + 0.07;
    for (const side of [-1, 1]) {
      const p = center.clone().addScaledVector(edge, span * 0.38 * side),
        bottom = getHeight(p.x, p.z);
      const post = new THREE.Mesh(gateGeometry, gateMaterial);
      post.position.set(p.x, (beamY + bottom) / 2, p.z);
      post.scale.set(0.01, beamY - bottom, 0.014);
      post.rotation.y = yaw;
      parent.add(post);
    }
    const beam = new THREE.Mesh(gateGeometry, gateMaterial);
    beam.position.set(center.x, beamY, center.z);
    beam.scale.set(span, 0.012, 0.022);
    beam.rotation.y = yaw;
    parent.add(beam);
    parent.userData.openingCenter = center
      .clone()
      .setY(gate.high + 0.03)
      .toArray();
    group.add(parent);
  }

  const segments = [];
  for (const road of data.roads)
    for (let i = 1; i < road.points.length; i++) {
      const a = world(toWorld, road.points[i - 1]),
        b = world(toWorld, road.points[i]);
      const count = Math.max(1, Math.ceil(a.distanceTo(b) / 0.1));
      for (let j = 0; j < count; j++) {
        const start = a.clone().lerp(b, j / count),
          end = a.clone().lerp(b, (j + 1) / count),
          mid = start.clone().lerp(end, 0.5);
        const wet = [start, mid, end].some((p) => isWater(p.x, p.z));
        if (wet && !road.bridge) continue;
        for (const p of [start, end])
          p.y = Math.max(getHeight(p.x, p.z), road.bridge ? waterLevel + 0.04 : -Infinity) + 0.0015;
        const direction = end.clone().sub(start).normalize(),
          side = new THREE.Vector3(-direction.z, 0, direction.x).normalize(),
          normal = side.clone().cross(direction).normalize();
        const matrix = new THREE.Matrix4().makeBasis(side, direction, normal);
        const trail = ['path', 'track', 'steps', 'footway'].includes(road.highway);
        const width = ['primary', 'secondary'].includes(road.highway)
          ? 0.055
          : road.highway === 'tertiary'
            ? 0.04
            : trail
              ? 0.01
              : 0.026;
        matrix
          .scale(new THREE.Vector3(width, start.distanceTo(end), 1))
          .setPosition(start.clone().lerp(end, 0.5));
        segments.push({
          matrix,
          start,
          end,
          id: road.id,
          bridge: road.bridge,
          color: new THREE.Color(trail ? '#73795e' : '#999987'),
        });
      }
    }
  const roadMaterial = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const roads = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    roadMaterial,
    segments.length,
  );
  roads.name = 'xingping-source-roads';
  segments.forEach((s, i) => {
    roads.setMatrixAt(i, s.matrix);
    roads.setColorAt(i, s.color);
  });
  roads.instanceMatrix.needsUpdate = true;
  if (roads.instanceColor) roads.instanceColor.needsUpdate = true;
  group.add(roads);
  group.userData = {
    sourceBuildings: accepted.filter((i) => i.sourceType === 'footprint').length,
    inferredBuildings: accepted.filter((i) => i.sourceType === 'inferred').length,
    sourceRoadSegments: segments.length,
    source: data.source,
    sourceData: data,
    footprints,
    foundations,
    worldExclusions: footprints.map((p) => p.points),
  };
  let disposed = false;
  return {
    group,
    update: () => false,
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set([gateGeometry]),
        materials = new Set([gateMaterial]);
      group.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) materials.add(object.material);
      });
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      group.clear();
    },
  };
}
