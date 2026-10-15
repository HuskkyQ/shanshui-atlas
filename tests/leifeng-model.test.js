import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLeifengCore, createLeifengModel, getLeifengGroundHeight,
  getLeifengRawGroundHeight } from '../src/west-lake/leifeng-pagoda/model.js';
import { LEIFENG_SITE } from '../src/west-lake/leifeng-pagoda/site-layout.js';

function meshes(root) {
  const result = [];
  root.traverse((object) => { if (object.isMesh) result.push(object); });
  return result;
}

function triangleCount(mesh) {
  const positions = mesh.geometry.getAttribute('position');
  const base = mesh.geometry.index ? mesh.geometry.index.count / 3 : positions.count / 3;
  return base * (mesh.isInstancedMesh ? mesh.count : 1);
}

function indexedTriangles(mesh) {
  const positions = mesh.geometry.getAttribute('position');
  const index = mesh.geometry.index;
  const result = [];
  for (let offset = 0; offset < index.count; offset += 3) {
    result.push([index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)]
      .map((vertex) => new THREE.Vector3().fromBufferAttribute(positions, vertex)));
  }
  return result;
}

function assertAboveGround(mesh, terrain, name) {
  mesh.updateMatrixWorld(true);
  const raycaster = new THREE.Raycaster();
  const bounds = new THREE.Box3().setFromObject(mesh);
  const samples = [];
  indexedTriangles(mesh).forEach(([a, b, c]) => {
    samples.push(a, b, c, a.clone().lerp(b, 0.5), b.clone().lerp(c, 0.5), c.clone().lerp(a, 0.5),
      a.clone().add(b).add(c).multiplyScalar(1 / 3));
  });
  samples.filter((point, index) => index % 7 === 0).forEach((point) => {
    raycaster.set(new THREE.Vector3(point.x, bounds.max.y + 2, point.z), new THREE.Vector3(0, -1, 0));
    const hit = raycaster.intersectObject(terrain, false)[0];
    assert.ok(hit, `${name} has no rendered surface under (${point.x}, ${point.z})`);
    assert.ok(point.y >= hit.point.y - 0.08,
      `${name} penetrates the displayed ground at (${point.x.toFixed(2)}, ${point.z.toFixed(2)})`);
  });
}

function assertPathAgainstTerrain(path, terrain) {
  const position = path.geometry.getAttribute('position');
  const terrainBounds = new THREE.Box3().setFromObject(terrain);
  const raycaster = new THREE.Raycaster();
  for (let index = 0; index < position.count; index += 1) {
    const point = new THREE.Vector3().fromBufferAttribute(position, index);
    raycaster.set(new THREE.Vector3(point.x, terrainBounds.max.y + 4, point.z), new THREE.Vector3(0, -1, 0));
    const hit = raycaster.intersectObject(terrain, false)[0];
    assert.ok(hit, `${path.name} has no terrain below vertex ${index}`);
    assert.ok(point.y >= hit.point.y - 0.08, `${path.name} penetrates the displayed hillside`);
  }
}

function pointInPolygon(x, z, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i], [xj, zj] = polygon[j];
    if (((zi > z) !== (zj > z)) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

test('Leifeng model has finite bounded geometry for a close-range scene', () => {
  const { group } = createLeifengModel();
  group.updateMatrixWorld(true);
  const rendered = meshes(group);
  assert.ok(rendered.length > 0);
  assert.ok(rendered.length < 40, `model uses ${rendered.length} render objects`);
  assert.ok(rendered.reduce((sum, mesh) => sum + triangleCount(mesh), 0) < 180000);
  rendered.forEach((mesh) => {
    Object.values(mesh.geometry.attributes).forEach((attribute) => {
      for (const value of attribute.array) assert.ok(Number.isFinite(value), `${mesh.name} contains non-finite geometry`);
    });
  });
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(bounds.min.y < -70 && bounds.min.y > -100, 'model contains an invalidly deep site shell');
  assert.ok(bounds.max.y > 30 && bounds.max.y < 38, `unexpected tower height: ${bounds.max.y}`);
});

test('tower describes five octagonal floors with a narrowing silhouette', () => {
  const { group } = createLeifengModel();
  const floors = [];
  group.traverse((object) => {
    if (/^tower-floor-\d$/.test(object.name)) floors.push(object.userData);
  });
  floors.sort((a, b) => a.level - b.level);
  assert.equal(floors.length, 5);
  assert.deepEqual(floors.map(({ level }) => level), [1, 2, 3, 4, 5]);
  floors.forEach((floor, index) => {
    assert.equal(floor.sides, 8);
    assert.ok(floor.roofY > floor.baseY);
    if (index) assert.ok(floor.footprintRadius < floors[index - 1].footprintRadius);
  });
  const bounds = new THREE.Box3().setFromObject(group.getObjectByName('leifeng-tower'));
  assert.ok(bounds.max.x - bounds.min.x > 18, 'octagonal base is too narrow for the tower');
  const roof = group.getObjectByName('tower-roofs');
  const ridges = group.getObjectByName('tower-roof-ridges');
  assert.equal(roof.userData.samplesPerEdge, 4);
  assert.equal(ridges.userData.levelCount, 5);
  assert.equal(ridges.userData.ridgesPerLevel, 8);
  const normals = roof.geometry.getAttribute('normal');
  let upwardNormals = 0;
  for (let index = 0; index < normals.count; index += 1) {
    if (normals.getY(index) > 0.1) upwardNormals += 1;
  }
  assert.ok(upwardNormals > normals.count / 2, 'swept roof faces should be visible from the default elevated camera');
});

test('interaction anchors cover the facade, base, eaves and lakeward terrace', () => {
  const { anchors } = createLeifengModel();
  assert.deepEqual(Object.keys(anchors).sort(), ['base', 'eaves', 'lakeView', 'tower']);
  Object.entries(anchors).forEach(([name, anchor]) => {
    assert.equal(anchor.length, 3, `${name} is not a 3D anchor`);
    assert.ok(anchor.every(Number.isFinite), `${name} contains a non-finite coordinate`);
  });
  assert.ok(anchors.tower[1] > anchors.base[1]);
  assert.ok(anchors.eaves[1] > anchors.tower[1]);
  assert.ok(anchors.tower[2] > 0 && anchors.base[2] > 0, 'facade anchors should face the +z entrance');
  assert.ok(anchors.lakeView[2] < 0, 'lake-view anchor should sit on the -z side');
});

test('photo-based silhouette has a broad lower eave and a tall curved crown', () => {
  const { group } = createLeifengModel();
  const roof = group.getObjectByName('tower-roofs');
  const positions = roof.geometry.getAttribute('position');
  const floors = group.getObjectByName('leifeng-tower').children
    .filter((object) => /^tower-floor-\d$/.test(object.name));
  const roofBounds = (floor, nextFloor) => {
    const bounds = new THREE.Box3();
    for (let index = 0; index < positions.count; index += 1) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, index);
      if (point.y >= floor.userData.roofY - 1e-5
        && (!nextFloor || point.y < nextFloor.userData.roofY - 1e-5)) bounds.expandByPoint(point);
    }
    return bounds;
  };
  const lower = roofBounds(floors[0], floors[1]);
  const regular = roofBounds(floors[1], floors[2]);
  const crown = roofBounds(floors[4]);
  assert.ok(lower.max.x - lower.min.x > floors[0].userData.footprintRadius * 3.2,
    'lower eave should spread far beyond the first-storey facade');
  assert.ok(crown.max.y - crown.min.y > (regular.max.y - regular.min.y) * 2.5,
    'top roof should form a tall crown rather than another low umbrella');
  const crownRings = new Set();
  for (let index = 0; index < positions.count; index += 1) {
    if (positions.getY(index) >= floors[4].userData.roofY) crownRings.add(positions.getY(index).toFixed(4));
  }
  assert.ok(crownRings.size >= 7, 'crown needs intermediate curved roof samples');
});

test('narrow facade windows sit outside octagonal face planes and railings stay on the balconies', () => {
  const { group } = createLeifengModel();
  const windows = group.getObjectByName('tower-windows').geometry.getAttribute('position');
  const floors = group.getObjectByName('leifeng-tower').children
    .filter((object) => /^tower-floor-\d$/.test(object.name));
  const faceDirections = Array.from({ length: 8 }, (_, side) => side * Math.PI / 4);
  for (let index = 0; index < windows.count; index += 1) {
    const point = new THREE.Vector3().fromBufferAttribute(windows, index);
    const floor = floors.findLast((object) => point.y >= object.userData.baseY);
    assert.ok(floor, 'window drops below tower');
    const projection = Math.max(...faceDirections.map((angle) => point.x * Math.sin(angle) + point.z * Math.cos(angle)));
    assert.ok(projection >= floor.userData.footprintRadius * Math.cos(Math.PI / 8) - 0.01,
      'window is buried in the octagonal wall');
  }
  const balconies = group.getObjectByName('tower-balconies');
  assert.ok(balconies, 'upper railings need projecting balcony slabs');
  const bounds = new THREE.Box3().setFromObject(balconies);
  assert.ok(bounds.max.x > floors[1].userData.footprintRadius);
});

test('gold finial grows continuously from the crown with stacked disks and a slender mast', () => {
  const { group } = createLeifengModel();
  const crown = group.getObjectByName('tower-roofs');
  const finial = group.getObjectByName('tower-finial');
  const crownBounds = new THREE.Box3().setFromObject(crown);
  const finialBounds = new THREE.Box3().setFromObject(finial);
  assert.ok(finialBounds.min.y <= crownBounds.max.y + 0.01, 'finial floats above the crown');
  assert.ok(finialBounds.max.y - crownBounds.max.y > 5, 'finial is missing its tall mast');
  const disks = finial.getObjectByName('tower-finial-disks');
  const ornament = finial.getObjectByName('tower-finial-ornament');
  assert.ok(disks && ornament, 'finial needs stepped disks and the round mast ornament');
  const diskBounds = new THREE.Box3().setFromObject(disks);
  const ornamentBounds = new THREE.Box3().setFromObject(ornament);
  assert.ok(diskBounds.max.y - diskBounds.min.y > 2);
  assert.ok(ornamentBounds.min.y > diskBounds.max.y);
  const color = disks.material.color;
  assert.ok(color.r > color.g && color.g > color.b, 'finial should read as gold rather than green');
});

test('entrance steps and mapped ascending route share the same precinct', () => {
  const { group } = createLeifengModel();
  group.updateMatrixWorld(true);
  const steps = group.getObjectByName('entry-steps');
  const base = group.getObjectByName('tower-base');
  const ascending = LEIFENG_SITE.paths.filter(({ kind }) => kind === 'ascending');
  assert.ok(steps && base && ascending.length > 0);
  assert.equal(steps.userData.treadCount, 12);
  const stepBounds = new THREE.Box3().setFromObject(steps);
  const baseBounds = new THREE.Box3().setFromObject(base);
  assert.ok(stepBounds.min.y <= getLeifengGroundHeight(0, stepBounds.min.z) + 0.08,
    'stairs should meet or slightly embed into the displayed slope');
  assert.ok(Math.abs(stepBounds.max.y - base.userData.topY) < 1e-6, 'stairs miss the platform height');
  assert.ok(stepBounds.min.z <= baseBounds.max.z, 'top tread does not reach the tower platform');
  ascending.forEach(({ points }) => {
    points.forEach(([x, z]) => assert.ok(Number.isFinite(getLeifengGroundHeight(x, z))));
  });
});

test('model identifies itself as an artistic approximation', () => {
  const { group } = createLeifengModel();
  assert.equal(group.userData.kind, 'artistic-approximation');
  assert.equal(group.userData.floorCount, 5);
  assert.equal(group.userData.sides, 8);
  assert.equal(group.userData.entranceDirection, '+z');
  assert.equal(group.userData.lakeDirection, '-z');
});

test('site geometry is grounded, pond-contained, and topologically closed', () => {
  const { group } = createLeifengModel();
  group.updateMatrixWorld(true);
  const terrain = group.getObjectByName('leifeng-closed-hillside');
  assert.ok(terrain, 'missing displayed hillside for grounding checks');
  for (const name of ['tower-base', 'protection-terrace']) {
    const mesh = group.getObjectByName(name);
    assert.ok(mesh, `missing ${name}`);
    assertAboveGround(mesh, terrain, name);
  }

  const pond = group.getObjectByName('release-pond');
  assert.ok(pond, 'missing mapped release pond');
  indexedTriangles(pond).forEach(([a, b, c]) => {
    const center = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    assert.ok(pointInPolygon(center.x, center.z, LEIFENG_SITE.pond), 'pond triangle leaves mapped outline');
    assert.ok(Math.abs(a.y - b.y) < 0.001 && Math.abs(b.y - c.y) < 0.001,
      'pond surface is not flattened to a single pond-bed level');
    const raycaster = new THREE.Raycaster();
    const terrainBounds = new THREE.Box3().setFromObject(terrain);
    raycaster.set(new THREE.Vector3(center.x, terrainBounds.max.y + 4, center.z), new THREE.Vector3(0, -1, 0));
    const hit = raycaster.intersectObject(terrain, false)[0];
    assert.ok(hit, 'pond triangle has no displayed pond bed below it');
    assert.ok(center.y >= hit.point.y - 0.08 && center.y <= hit.point.y + 0.35,
      'pond water is detached from or buried in the displayed pond bed');
  });

  const pathMeshes = [];
  group.traverse((object) => { if (object.name.startsWith('leifeng-path-')) pathMeshes.push(object); });
  assert.equal(pathMeshes.length, LEIFENG_SITE.paths.length);
  pathMeshes.forEach((path) => {
    const position = path.geometry.getAttribute('position');
    for (let index = 0; index < position.count; index += 1) {
      const point = new THREE.Vector3().fromBufferAttribute(position, index);
      assert.ok(Number.isFinite(getLeifengRawGroundHeight(point.x, point.z)));
    }
    assertPathAgainstTerrain(path, terrain);
  });

  const hillside = group.getObjectByName('leifeng-closed-hillside');
  assert.ok(hillside, 'missing closed displayed hillside');
  const edgeUse = new Map();
  const index = hillside.geometry.index;
  for (let offset = 0; offset < index.count; offset += 3) {
    const triangle = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
    for (let edge = 0; edge < 3; edge += 1) {
      const a = triangle[edge], b = triangle[(edge + 1) % 3];
      const key = [a, b].sort((left, right) => left - right).join(':');
      edgeUse.set(key, (edgeUse.get(key) || 0) + 1);
    }
  }
  assert.ok(edgeUse.size > 100, 'displayed hillside is still a trivial surface');
  edgeUse.forEach((uses, edge) => assert.equal(uses, 2, `open or non-manifold hillside edge ${edge}`));
});

test('shared precinct has a closed hillside, narrow continuous branches and a lakeward pond', () => {
  const { group } = createLeifengCore({ detailed: false });
  group.updateMatrixWorld(true);
  assert.ok(group.getObjectByName('leifeng-protection-base'));
  assert.ok(group.getObjectByName('leifeng-site-details'));
  const paths = [];
  group.traverse((object) => { if (object.name.startsWith('leifeng-path-')) paths.push(object); });
  assert.equal(paths.length, LEIFENG_SITE.paths.length);
  const pond = group.getObjectByName('release-pond');
  const pondMeanZ = LEIFENG_SITE.pond.reduce((sum, [, z]) => sum + z, 0) / LEIFENG_SITE.pond.length;
  const pondBounds = new THREE.Box3().setFromObject(pond);
  assert.ok(pond && Math.abs(pondBounds.getCenter(new THREE.Vector3()).z - pondMeanZ) < 2,
    'release pond should follow the mapped outline');
  const { group: exhibition } = createLeifengModel();
  const hillside = exhibition.getObjectByName('leifeng-closed-hillside');
  assert.ok(hillside, 'standalone scene should include a closed hillside');
  const positions = hillside.geometry.getAttribute('position');
  let minimum = Infinity;
  for (let index = 0; index < positions.count; index += 1) minimum = Math.min(minimum, positions.getY(index));
  assert.ok(minimum < -3, 'hillside needs a visible underside closure');
  assert.equal(exhibition.getObjectByName('nearby-hills'), undefined);
  let ponds = 0;
  exhibition.traverse((object) => { if (object.name === 'release-pond') ponds += 1; });
  assert.equal(ponds, 1, 'single-scene precinct should not duplicate its pond');
});
