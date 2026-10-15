import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createJingciCore,
  createJingciModel,
  JINGCI_UNITS_PER_METRE,
  jingciTreeClearings,
} from '../src/west-lake/jingci-temple/model.js';
import { JINGCI_COURTYARDS, JINGCI_LAYOUT, JINGCI_ZONES } from '../src/west-lake/jingci-temple/layout.js';

function meshes(root) {
  const result = [];
  root.traverse((object) => { if (object.isMesh) result.push(object); });
  return result;
}

function triangleCount(root) {
  return meshes(root).reduce((sum, mesh) => {
    const position = mesh.geometry.getAttribute('position');
    return sum + (mesh.geometry.index ? mesh.geometry.index.count : position.count) / 3;
  }, 0);
}

function assertFinite(root) {
  root.traverse((object) => {
    if (!object.geometry) return;
    Object.values(object.geometry.attributes).forEach((attribute) => {
      for (const value of attribute.array) assert.ok(Number.isFinite(value), `${object.name} has non-finite geometry`);
    });
  });
}

test('Jingci proposal core exposes seven stable scene anchors without rotating the local frame', () => {
  assert.equal(JINGCI_UNITS_PER_METRE, 0.30);
  const { group, anchors } = createJingciCore();
  for (const key of ['gate', 'daxiong', 'bell', 'courtyard', 'rear-hall', 'rear-pavilion', 'side-courts']) {
    assert.ok(group.getObjectByName(`building-${key}`), `missing building-${key}`);
    assert.ok(anchors[key] instanceof THREE.Vector3, `${key} anchor is not a Vector3`);
  }
  assert.equal(group.rotation.y, 0);
  assert.equal(group.userData.orientation, 'north=-z');
  assert.match(group.userData.sourceBoundary, /proposal-massing-not-surveyed/);
  const sideCourt = JINGCI_COURTYARDS.find((court) => court.id === 'west-court');
  assert.equal(anchors['side-courts'].x, sideCourt.x);
  assert.equal(anchors['side-courts'].z, sideCourt.z);
  assert.ok(anchors['side-courts'].y > sideCourt.level);
});

test('central axis progresses from entrance to a raised three-eave rear pavilion', () => {
  const { group } = createJingciCore();
  const items = JINGCI_ZONES.central.map((id) => JINGCI_LAYOUT.find((item) => item.id === id));
  for (let index = 1; index < items.length; index += 1) {
    assert.ok(items[index].z > items[index - 1].z, 'central buildings are not ordered toward the hillside');
    assert.ok(items[index].level > items[index - 1].level, 'central buildings do not climb the hillside');
  }
  const rearPavilion = group.getObjectByName('building-rear-pavilion');
  assert.equal(rearPavilion.userData.floors, 3);
  assert.equal(rearPavilion.userData.eaveCount, 3);
  assert.equal(rearPavilion.userData.formalNameStatus, 'unverified');
  assert.ok(group.getObjectByName('rear-pavilion-eave-1-surface'));
  assert.ok(group.getObjectByName('rear-pavilion-eave-2-surface'));
  assert.ok(group.getObjectByName('rear-pavilion-eave-3-surface'));
});

test('layout reconstructs dense wings and at least three U-shaped side enclosures', () => {
  assert.ok(JINGCI_LAYOUT.length >= 35, `expected dense campus massing, got ${JINGCI_LAYOUT.length}`);
  assert.ok(JINGCI_COURTYARDS.length >= 8);
  for (const ids of [JINGCI_ZONES.westEnclosure, JINGCI_ZONES.eastEnclosure]) {
    const [north, sideA, sideB] = ids.map((id) => JINGCI_LAYOUT.find((item) => item.id === id));
    assert.ok(Math.min(sideA.x, sideB.x) < north.x && north.x < Math.max(sideA.x, sideB.x));
    assert.ok(north.z > sideA.z && north.z > sideB.z);
    assert.ok(sideA.depth > sideA.width && sideB.depth > sideB.width);
  }
  const eastRear = JINGCI_ZONES.eastRearEnclosure.map((id) => JINGCI_LAYOUT.find((item) => item.id === id));
  assert.equal(eastRear.length, 4);
  assert.ok(eastRear.some((item) => item.z < 60) && eastRear.some((item) => item.z > 65));
  assert.ok(eastRear.filter((item) => item.depth > item.width).length >= 2);

  const { group } = createJingciCore();
  group.updateMatrixWorld(true);
  const independentLeft = ['building-west-row-house-c', 'building-west-court-east'];
  const mainWing = new THREE.Box3().setFromObject(group.getObjectByName('building-main-east-wing'));
  for (const name of independentLeft) {
    const overlap = mainWing.clone().intersect(new THREE.Box3().setFromObject(group.getObjectByName(name)));
    assert.ok(overlap.isEmpty(), `${name} overlaps the central east wing`);
  }
});

test('courtyard platforms remain visible above the locally lowered hillside mesh', () => {
  const { group } = createJingciModel();
  group.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  for (const court of JINGCI_COURTYARDS) {
    raycaster.set(new THREE.Vector3(court.x, 30, court.z), new THREE.Vector3(0, -1, 0));
    const firstHit = raycaster.intersectObject(group, true)[0];
    assert.equal(firstHit?.object.name, `court-${court.id}`, `${court.id} is obscured by terrain`);
  }
});

test('terrain stays below every building, courtyard, axis terrace, and stair including their edges', () => {
  const { group } = createJingciModel();
  group.updateMatrixWorld(true);
  const slope = group.getObjectByName('jingci-south-slope');
  const terraceNames = ['main-axis-terrace', 'middle-axis-terrace', 'rear-axis-terrace', 'high-axis-terrace'];
  const stairNames = ['main-axis-stairs', 'middle-axis-stairs', 'rear-axis-stairs', 'high-axis-stairs'];
  const targets = [
    ...JINGCI_LAYOUT.map(({ id }) => [`building ${id}`, group.getObjectByName(`${id}-stone-foundation`)]),
    ...JINGCI_COURTYARDS.map(({ id }) => [`courtyard ${id}`, group.getObjectByName(`court-${id}`)]),
    ...terraceNames.map((name) => [`terrace ${name}`, group.getObjectByName(name)]),
    ...stairNames.map((name) => [`stairs ${name}`, group.getObjectByName(name)]),
  ];
  assert.equal(JINGCI_LAYOUT.length, 36);
  assert.equal(JINGCI_COURTYARDS.length, 8);

  const raycaster = new THREE.Raycaster();
  let sampleCount = 0;
  let terrainHitCount = 0;
  for (const [label, target] of targets) {
    assert.ok(target, `missing ${label}`);
    const bounds = new THREE.Box3().setFromObject(target);
    const xSamples = [bounds.min.x + 0.08, (bounds.min.x + bounds.max.x) / 2, bounds.max.x - 0.08];
    const zSamples = [bounds.min.z + 0.08, (bounds.min.z + bounds.max.z) / 2, bounds.max.z - 0.08];
    for (const x of xSamples) for (const z of zSamples) {
      raycaster.set(new THREE.Vector3(x, 30, z), new THREE.Vector3(0, -1, 0));
      const supportHit = raycaster.intersectObject(target, true)[0];
      const terrainHit = raycaster.intersectObject(slope, false)[0];
      assert.ok(supportHit, `${label} has no support surface at ${x},${z}`);
      if (terrainHit) {
        assert.ok(terrainHit.point.y <= supportHit.point.y + 1e-3,
          `terrain ${terrainHit.point.y} penetrates ${label} top ${supportHit.point.y} at ${x},${z}`);
        terrainHitCount += 1;
      }
      sampleCount += 1;
    }
  }
  assert.equal(sampleCount, (36 + 8 + 4 + 4) * 9);
  assert.equal(terrainHitCount, sampleCount,
    `terrain footprint misses support probes: ${terrainHitCount}/${sampleCount}`);
});

test('irregular hillside is a closed solid with outward sides and a downward base', () => {
  const { group } = createJingciModel();
  const slope = group.getObjectByName('jingci-south-slope');
  assert.ok(slope, 'missing hillside mesh');
  assert.ok(slope.geometry.index, 'hillside must use indexed shared edges');

  const edgeUses = new Map();
  const indices = slope.geometry.index.array;
  for (let offset = 0; offset < indices.length; offset += 3) {
    for (const [a, b] of [[indices[offset], indices[offset + 1]],
      [indices[offset + 1], indices[offset + 2]], [indices[offset + 2], indices[offset]]]) {
      const key = a < b ? `${a}/${b}` : `${b}/${a}`;
      edgeUses.set(key, (edgeUses.get(key) ?? 0) + 1);
    }
  }
  const openEdges = [...edgeUses].filter(([, count]) => count !== 2);
  assert.deepEqual(openEdges, [], `hillside has ${openEdges.length} open or non-manifold edges`);

  const raycaster = new THREE.Raycaster();
  const sideRays = [
    [new THREE.Vector3(0, -0.5, -25), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)],
    [new THREE.Vector3(0, -0.5, 120), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1)],
    [new THREE.Vector3(-80, -0.5, 40), new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0)],
    [new THREE.Vector3(80, -0.5, 40), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)],
  ];
  for (const [origin, direction, outward] of sideRays) {
    raycaster.set(origin, direction);
    const hit = raycaster.intersectObject(slope, false)[0];
    assert.ok(hit, `side ray from ${origin.toArray()} passed through the hillside`);
    assert.ok(hit.face.normal.dot(outward) > 0.8, `side normal points inward at ${hit.point.toArray()}`);
  }

  raycaster.set(new THREE.Vector3(0, -5, 40), new THREE.Vector3(0, 1, 0));
  const underside = raycaster.intersectObject(slope, false)[0];
  assert.ok(underside, 'ray from below passed through the hillside');
  assert.ok(Math.abs(underside.point.y + 1.2) < 1e-6, `unexpected base height: ${underside.point.y}`);
  assert.ok(underside.face.normal.y < -0.99, `base normal points upward: ${underside.face.normal.y}`);

  assert.ok(indices.length / 3 < 80000, `hillside geometry budget exceeded: ${indices.length / 3}`);
  assert.ok(meshes(group).length < 200, `closed hillside exceeded the scene mesh budget: ${meshes(group).length}`);
});

test('all proposal roofs use finite upward-facing gray-tile geometry', () => {
  const { group } = createJingciCore();
  const roofs = meshes(group).filter((mesh) => mesh.userData.roofSurface);
  assert.ok(roofs.length >= JINGCI_LAYOUT.length);
  for (const roof of roofs) {
    const normals = roof.geometry.getAttribute('normal');
    const positions = roof.geometry.getAttribute('position');
    let upward = 0;
    for (let index = 0; index < normals.count; index += 1) if (normals.getY(index) > 0.02) upward += 1;
    assert.ok(upward > normals.count * 0.78, `${roof.name} has too many downward faces`);
    assert.equal(roof.material.color.getHexString(), '303634');
    const { roofWidth, roofDepth, roofRise, roofSegments } = roof.userData;
    const rows = Math.max(2, roofSegments * 2);
    for (const end of [-1, 1]) for (const side of [-1, 1]) for (let row = 0; row <= rows; row += 1) {
      const t = row / rows;
      const expectedX = end * (roofWidth / 2 * (1 - t) + roofWidth * 0.27 * t);
      const expectedZ = side * (roofDepth / 2 * (1 - t) + roofDepth * 0.20 * t);
      const expectedY = roofRise * 0.5 * Math.sin(t * Math.PI / 2)
        + roofRise * 0.13 * (1 - t) ** 2;
      const seamHeights = [];
      for (let index = 0; index < positions.count; index += 1) {
        if (Math.abs(positions.getX(index) - expectedX) < 1e-6
          && Math.abs(positions.getZ(index) - expectedZ) < 1e-6) seamHeights.push(positions.getY(index));
      }
      assert.ok(seamHeights.length >= 2, `${roof.name} is missing a side/end seam vertex`);
      for (const y of seamHeights) assert.ok(Math.abs(y - expectedY) < 1e-6, `${roof.name} has a split side/end roof seam`);
    }
  }
  group.updateMatrixWorld(true);
  const gateRoof = group.getObjectByName('gate-eave-1-surface');
  const raycaster = new THREE.Raycaster();
  for (const side of [-1, 1]) {
    raycaster.set(new THREE.Vector3(side * 10, 3.72, 0), new THREE.Vector3(-side, 0, 0));
    const hits = raycaster.intersectObject(gateRoof, false);
    assert.ok(hits.length > 0, `gate gable is invisible from ${side > 0 ? '+x' : '-x'}`);
    assert.equal(Math.sign(hits[0].point.x), side, 'ray reached the opposite gable before the near cap');
    for (const roofSide of [-1, 1]) {
      raycaster.set(new THREE.Vector3(side * 10, 3.78, roofSide * 0.685), new THREE.Vector3(-side, 0, 0));
      const curvedCapHits = raycaster.intersectObject(gateRoof, false);
      assert.ok(curvedCapHits.length > 0, `gate curved gable is open from ${side > 0 ? '+x' : '-x'}`);
      assert.equal(Math.sign(curvedCapHits[0].point.x), side, 'ray passed through the near curved gable cap');
    }
  }
  assertFinite(group);
});

test('axis stairs rise toward each progressively higher terrace', () => {
  const { group } = createJingciCore();
  for (const name of ['main-axis-stairs', 'middle-axis-stairs', 'rear-axis-stairs', 'high-axis-stairs']) {
    const stairs = group.getObjectByName(name);
    assert.ok(stairs, `missing ${name}`);
    assert.ok(stairs.userData.endY > stairs.userData.startY, `${name} does not rise toward the rear`);
    const positions = stairs.geometry.getAttribute('position');
    let minY = Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < positions.count; index += 1) {
      minY = Math.min(minY, positions.getY(index));
      maxY = Math.max(maxY, positions.getY(index));
    }
    assert.ok(minY >= -1e-6 && maxY >= stairs.userData.endY - 0.05);
  }
});

test('overview and detailed cores preserve identical campus bounds while detail changes', () => {
  const detailed = createJingciCore({ detailed: true }).group;
  const overview = createJingciCore({ detailed: false }).group;
  detailed.updateMatrixWorld(true);
  overview.updateMatrixWorld(true);
  const detailedBounds = new THREE.Box3().setFromObject(detailed);
  const overviewBounds = new THREE.Box3().setFromObject(overview);
  assert.ok(detailedBounds.min.distanceTo(overviewBounds.min) < 1e-6);
  assert.ok(detailedBounds.max.distanceTo(overviewBounds.max) < 1e-6);
  assert.ok(meshes(detailed).length > meshes(overview).length);
  assert.ok(triangleCount(detailed) > triangleCount(overview));
});

test('dense instanced forest keeps roots and crowns clear of buildings, courts, and paths', () => {
  const { group } = createJingciModel();
  group.updateMatrixWorld(true);
  const roots = jingciTreeClearings(0);
  const canopies = jingciTreeClearings(1.9);
  const matrix = new THREE.Matrix4();
  const inside = (position, rectangles) => rectangles.some((rect) => position.x >= rect.minX && position.x <= rect.maxX
    && position.z >= rect.minZ && position.z <= rect.maxZ);
  const trunks = group.getObjectByName('jingci-tree-trunks');
  const slope = group.getObjectByName('jingci-south-slope');
  const groundRaycaster = new THREE.Raycaster();
  assert.ok(trunks.count >= 500, `forest is not dense enough: ${trunks.count}`);
  let rearForestCount = 0;
  let roadTreeCount = 0;
  let outerRootCount = 0;
  for (let index = 0; index < trunks.count; index += 1) {
    trunks.getMatrixAt(index, matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    if (position.z > 85) rearForestCount += 1;
    if (Math.abs(position.x) <= 64 && position.z >= -15 && position.z <= -10) roadTreeCount += 1;
    assert.ok(!inside(position, roots), `tree root ${index} enters a clearing`);
    if (Math.abs(position.x) >= 62) {
      groundRaycaster.set(new THREE.Vector3(position.x, 30, position.z), new THREE.Vector3(0, -1, 0));
      assert.ok(groundRaycaster.intersectObject(slope, false)[0], `outer tree root ${index} lacks terrain support`);
      outerRootCount += 1;
    }
  }
  assert.ok(rearForestCount >= 50, `rear hillside lacks continuous forest: ${rearForestCount}`);
  assert.equal(roadTreeCount, 0, 'trees intersect the rendered entrance road');
  assert.ok(outerRootCount >= 100, `outer forest coverage is too sparse: ${outerRootCount}`);
  for (const name of ['jingci-tree-crowns-broad', 'jingci-tree-crowns-round', 'jingci-tree-crowns-conifer']) {
    const crowns = group.getObjectByName(name);
    for (let index = 0; index < crowns.count; index += 1) {
      crowns.getMatrixAt(index, matrix);
      assert.ok(!inside(new THREE.Vector3().setFromMatrixPosition(matrix), canopies), `${name} ${index} enters a clearing`);
    }
  }
});

test('complete campus remains finite and inside the render budget', () => {
  const { group } = createJingciModel();
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(bounds.min.y >= -1.21, `landscape drops below its closed base: ${bounds.min.y}`);
  assert.ok(bounds.max.y < 30, `landscape is too tall: ${bounds.max.y}`);
  assert.ok(bounds.max.z - bounds.min.z > 110);
  assert.ok(meshes(group).length < 200, `mesh budget exceeded: ${meshes(group).length}`);
  assert.ok(triangleCount(group) < 180000, `triangle budget exceeded: ${triangleCount(group)}`);
  assertFinite(group);
});

test('Jingci resources remain disposable through ordinary scene traversal', () => {
  const { group } = createJingciModel();
  const resources = meshes(group).flatMap((mesh) => [mesh.geometry, mesh.material]);
  for (const resource of resources) assert.equal(typeof resource.dispose, 'function');
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((surface) => surface.dispose());
  });
});
