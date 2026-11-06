import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createXuankongModel } from '../src/xuankong-si/model.js';
import { XUANKONG_LAYOUT, cliffFaceZ, cliffFootY } from '../src/xuankong-si/layout.js';

function meshes(root) {
  const result = [];
  root.traverse((object) => { if (object.isMesh) result.push(object); });
  return result;
}

function triangleCount(root) {
  return meshes(root).reduce((sum, object) => {
    const positions = object.geometry.getAttribute('position');
    const triangles = (object.geometry.index?.count ?? positions.count) / 3;
    return sum + triangles * (object.isInstancedMesh ? object.count : 1);
  }, 0);
}

function assertFiniteGeometry(root) {
  root.traverse((object) => {
    if (!object.geometry) return;
    Object.values(object.geometry.attributes).forEach((attribute) => {
      for (const value of attribute.array) {
        assert.ok(Number.isFinite(value), `${object.name} contains non-finite geometry`);
      }
    });
  });
}

test('Xuankong model exposes cliff-first composition and six finite targets', () => {
  const { group, anchors } = createXuankongModel();
  const cliff = group.getObjectByName('building-cliff');
  const architecture = group.getObjectByName('xuankong-architecture');
  assert.ok(cliff, 'combined model omits the cliff component');
  assert.ok(architecture, 'combined model omits the architecture component');
  assert.ok(group.children.indexOf(cliff) < group.children.indexOf(architecture),
    'architecture was not composed after the cliff');

  for (const id of ['cliff', 'courtyard', 'south-tower', 'bridge', 'north-tower', 'structure']) {
    assert.ok(group.getObjectByName(`building-${id}`), `missing building-${id}`);
    assert.ok(anchors[id] instanceof THREE.Vector3, `${id} anchor is not a Vector3`);
    assert.ok(anchors[id].toArray().every(Number.isFinite), `${id} anchor is not finite`);
  }
  assert.equal(group.userData.kind, 'artistic-approximation');
  assert.match(group.userData.sourceBoundary, /public-dimensions-photo-guided-detail/);
});

test('both timber towers have three real storeys, galleries, doors and pitched roofs', () => {
  const { group } = createXuankongModel();
  for (const id of ['south-tower', 'north-tower']) {
    const tower = group.getObjectByName(`building-${id}`);
    assert.equal(tower.userData.floorCount, 3);
    assert.equal(tower.userData.galleryLevels.length, 3);
    for (let floor = 1; floor <= 3; floor += 1) {
      const storey = tower.getObjectByName(`${id}-floor-${floor}`);
      assert.ok(storey, `${id} lacks floor ${floor}`);
      assert.ok(storey.getObjectByName(`${id}-floor-${floor}-slab`), `${id} floor ${floor} lacks a slab`);
      assert.ok(storey.getObjectByName(`${id}-floor-${floor}-columns`), `${id} floor ${floor} lacks columns`);
      assert.ok(storey.getObjectByName(`${id}-floor-${floor}-rails`), `${id} floor ${floor} lacks rails`);
      assert.ok(storey.getObjectByName(`${id}-floor-${floor}-doors`), `${id} floor ${floor} lacks doors`);
      const roof = storey.getObjectByName(`${id}-floor-${floor}-roof`);
      assert.equal(roof?.userData.roofProfile, 'hipped');
      assert.equal(roof.userData.silhouette, 'broken-slope-upturned-eaves');
      assert.ok(roof.getObjectByName(`${id}-floor-${floor}-roof-tile-ribs`)?.isMesh,
        `${id} floor ${floor} lacks visible roof tile ribs`);
      assert.ok(storey.getObjectByName(`${id}-floor-${floor}-door-lattice`)?.isMesh,
        `${id} floor ${floor} lacks timber door lattice`);
      assert.ok(storey.getObjectByName(`${id}-floor-${floor}-brackets`)?.isMesh,
        `${id} floor ${floor} lacks column-head brackets`);
    }
    const roofColors = [1, 2, 3].map((floor) => tower
      .getObjectByName(`${id}-floor-${floor}-roof-surface`).material.color.getHexString());
    assert.ok(new Set(roofColors).size >= 2, `${id} repeats one flat roof colour on every eave`);
  }
});

test('the narrow stepped bridge joins a south upper gallery to a north middle gallery', () => {
  const { group } = createXuankongModel();
  const bridge = group.getObjectByName('building-bridge');
  const south = group.getObjectByName('building-south-tower');
  const north = group.getObjectByName('building-north-tower');
  assert.deepEqual(bridge.userData.endpoints.map(({ x, y }) => [x, y]), [
    [XUANKONG_LAYOUT.bridge.fromX, XUANKONG_LAYOUT.bridge.fromY],
    [XUANKONG_LAYOUT.bridge.toX, XUANKONG_LAYOUT.bridge.toY],
  ]);
  assert.ok(south.userData.galleryLevels.includes(XUANKONG_LAYOUT.bridge.fromY));
  assert.ok(north.userData.galleryLevels.includes(XUANKONG_LAYOUT.bridge.toY));
  assert.ok(bridge.userData.width < 1, 'the documented sub-metre bridge became a wide platform');
  assert.ok(bridge.getObjectByName('bridge-walkway'));
  assert.ok(bridge.getObjectByName('bridge-rails'));
  const grotto = bridge.getObjectByName('bridge-grotto-pavilion');
  assert.ok(grotto);
  const midpoint = new THREE.Vector3(
    (XUANKONG_LAYOUT.bridge.fromX + XUANKONG_LAYOUT.bridge.toX) / 2,
    (XUANKONG_LAYOUT.bridge.fromY + XUANKONG_LAYOUT.bridge.toY) / 2,
    (bridge.userData.endpoints[0].z + bridge.userData.endpoints[1].z) / 2,
  );
  const grottoCentre = new THREE.Box3().setFromObject(grotto).getCenter(new THREE.Vector3());
  assert.ok(grottoCentre.distanceTo(midpoint) < 2.5,
    'bridge-side grotto pavilion was transformed away from the bridge');
});

test('the bridge includes two staggered enclosed annexes and a partly covered climb', () => {
  const { group } = createXuankongModel();
  const bridge = group.getObjectByName('building-bridge');
  const lower = bridge.getObjectByName('bridge-lower-attached-hall');
  const upper = bridge.getObjectByName('bridge-upper-attached-hall');
  const coveredStair = bridge.getObjectByName('bridge-covered-stair');

  for (const annex of [lower, upper]) {
    assert.equal(annex?.userData.enclosedVolume, true, `${annex?.name ?? 'bridge annex'} is only an open frame`);
    assert.ok(annex.getObjectByName(`${annex.name}-walls`), `${annex.name} lacks a wall body`);
    assert.ok(annex.getObjectByName(`${annex.name}-door`), `${annex.name} lacks a visible door`);
    assert.ok(annex.getObjectByName(`${annex.name}-windows`), `${annex.name} lacks visible window bays`);
    assert.equal(annex.getObjectByName(`${annex.name}-roof`)?.userData.roofProfile, 'hipped');
  }
  const lowerY = new THREE.Box3().setFromObject(lower).getCenter(new THREE.Vector3()).y;
  const upperY = new THREE.Box3().setFromObject(upper).getCenter(new THREE.Vector3()).y;
  assert.ok(upperY - lowerY > 0.7, 'bridge annexes do not preserve the photographed staggered levels');
  assert.equal(coveredStair?.userData.connectedPath, true);
  assert.ok(coveredStair.userData.stepCount >= 4);
  assert.ok(coveredStair.getObjectByName('bridge-covered-stair-roof'));
  assert.ok(bridge.userData.exposedStepCount >= 2, 'the entire narrow bridge was hidden under a roof');
});

test('cantilever beams enter sampled rock and visible posts terminate on that same cliff', () => {
  const { group } = createXuankongModel();
  const structure = group.getObjectByName('building-structure');
  const beams = structure.children.filter((child) => child.userData.kind === 'cantilever-beam');
  const posts = structure.children.filter((child) => child.userData.kind === 'vertical-post');
  assert.ok(beams.length >= 5, 'too few visible half-inserted beams');
  assert.ok(posts.length >= 4, 'too few visible cliff-supported posts');
  for (const beam of beams) {
    const { sampleX, sampleY, rearEndZ, frontEndZ } = beam.userData;
    const face = cliffFaceZ(sampleX, sampleY);
    assert.ok(rearEndZ <= face - 1.05, `${beam.name} does not enter the rock by about 1.1m`);
    assert.ok(frontEndZ > face + 0.8, `${beam.name} does not visibly project from the cliff`);
  }
  for (const post of posts) {
    const { sampleX, sampleZ, ceilingY, bottomY } = post.userData;
    const sampledBottom = cliffFootY(sampleX, sampleZ, ceilingY);
    assert.notEqual(sampledBottom, null, `${post.name} has no sampled rock below it`);
    assert.ok(Math.abs(bottomY - sampledBottom) < 0.02, `${post.name} floats above or cuts through the rock foot`);
    assert.ok(ceilingY - bottomY > 1, `${post.name} is not a visible support`);
  }
  const structureBounds = new THREE.Box3().setFromObject(structure);
  assert.ok(structureBounds.max.x - structureBounds.min.x < 28,
    'structure hotspot accidentally includes the whole cliff');
});

test('the courtyard keeps a passable south-side entrance and an open route to the tower stair', () => {
  const { group } = createXuankongModel();
  group.updateMatrixWorld(true);
  const court = group.getObjectByName('building-courtyard');
  assert.equal(court.userData.openToSky, true);
  assert.ok(court.getObjectByName('courtyard-stone-terrace'));
  assert.ok(court.getObjectByName('courtyard-gate'));
  assert.ok(court.getObjectByName('courtyard-bell-pavilion'));
  assert.ok(court.getObjectByName('courtyard-drum-pavilion'));
  assert.ok(court.getObjectByName('courtyard-cliffside-hall'));

  const spec = XUANKONG_LAYOUT.courtyard;
  const origin = new THREE.Vector3(
    spec.x - spec.width / 2 - court.userData.approachExtensionMetres - 0.4,
    spec.floorY + 1.1,
    court.userData.sideEntryZ,
  );
  const hits = new THREE.Raycaster(origin, new THREE.Vector3(1, 0, 0), 0,
    court.userData.approachExtensionMetres + spec.width - 1.1)
    .intersectObject(court, true)
    .filter((hit) => hit.object.userData.blocksGroundPassage !== false);
  assert.equal(hits.length, 0, `south-side entry is blocked by ${hits[0]?.object.name}`);
});

test('the left complex has a rock-backed masonry podium and continuous low roofline', () => {
  const { group } = createXuankongModel();
  group.updateMatrixWorld(true);
  const court = group.getObjectByName('building-courtyard');
  const podium = court.getObjectByName('courtyard-masonry-podium');
  const lower = court.getObjectByName('courtyard-bell-pavilion');
  const upper = court.getObjectByName('courtyard-drum-pavilion');
  const hall = court.getObjectByName('courtyard-cliffside-hall');
  const wall = court.getObjectByName('courtyard-enclosure-wall');
  const approach = court.getObjectByName('courtyard-approach-walk');
  const approachSupport = court.getObjectByName('courtyard-approach-support');

  assert.ok(podium && wall && approach && approachSupport,
    'left complex lacks its podium, enclosure, approach, or stone approach support');
  assert.ok(podium.children.length >= 3, 'masonry podium is still a single floating slab');
  for (const segment of podium.children) {
    const bounds = new THREE.Box3().setFromObject(segment);
    const topFace = cliffFaceZ(segment.userData.sampleX, segment.userData.topY);
    const bottomFace = cliffFaceZ(segment.userData.sampleX, segment.userData.bottomY);
    assert.ok(segment.userData.topBackZ <= topFace + 0.02,
      `${segment.name} does not meet the sampled cliff at its back`);
    assert.ok(segment.userData.bottomFrontZ <= bottomFace + 0.02,
      `${segment.name} does not taper back into the cliff at its foot`);
    assert.ok(bounds.max.y - bounds.min.y <= 5.5,
      `${segment.name} became an over-tall rectangular stone curtain`);
    assert.equal(segment.userData.kind, 'masonry-podium-segment');
  }
  const podiumBounds = new THREE.Box3().setFromObject(podium);
  assert.ok(podiumBounds.max.x >= XUANKONG_LAYOUT.courtyard.x + XUANKONG_LAYOUT.courtyard.width / 2 - 0.02,
    'masonry podium leaves the north end of the courtyard unsupported');
  for (const pavilion of [lower, upper]) {
    assert.equal(pavilion.userData.enclosedVolume, true, `${pavilion.name} is only columns and a roof`);
    assert.ok(pavilion.getObjectByName(`${pavilion.name}-walls`));
    assert.ok(pavilion.getObjectByName(`${pavilion.name}-door`));
    assert.equal(pavilion.getObjectByName(`${pavilion.name}-lower-eave`)?.userData.roofProfile, 'hipped');
    const base = pavilion.getObjectByName(`${pavilion.name}-red-base`);
    const baseBounds = new THREE.Box3().setFromObject(base);
    const pavilionBounds = new THREE.Box3().setFromObject(pavilion);
    assert.ok(baseBounds.max.y - baseBounds.min.y >= 1.2, `${pavilion.name} lacks a substantial red base`);
    assert.ok(pavilionBounds.max.y - baseBounds.min.y >= 3.5,
      `${pavilion.name} double-eave timber stage remains hidden behind the enclosure wall`);
  }
  assert.ok(hall.getObjectByName('courtyard-hall-body'));
  assert.ok(hall.getObjectByName('courtyard-hall-doors'));
  assert.equal(hall.getObjectByName('courtyard-hall-roof')?.userData.roofProfile, 'hipped');

  const roofBounds = [lower, hall, upper].map((part) => new THREE.Box3().setFromObject(part));
  assert.ok(roofBounds[0].max.x >= roofBounds[1].min.x - 0.35,
    'lower pavilion is detached from the long hall roofline');
  assert.ok(roofBounds[1].max.x >= roofBounds[2].min.x - 0.35,
    'upper pavilion is detached from the long hall roofline');
  assert.ok(court.userData.approachExtensionMetres >= 5.5 && court.userData.approachExtensionMetres <= 6.5,
    'left approach no longer represents the roughly six-metre auxiliary path');

  const approachSteps = approach.children.filter((child) => child.name.startsWith('courtyard-approach-step-'));
  assert.equal(approachSupport.children.length, approachSteps.length);
  for (const step of approachSteps) {
    const bounds = new THREE.Box3().setFromObject(step);
    const origin = new THREE.Vector3(
      (bounds.min.x + bounds.max.x) / 2,
      bounds.min.y + 0.06,
      (bounds.min.z + bounds.max.z) / 2,
    );
    const supportHit = new THREE.Raycaster(origin, new THREE.Vector3(0, -1, 0), 0, 0.1)
      .intersectObject(approachSupport, true)[0];
    assert.ok(supportHit && supportHit.distance <= 0.08,
      `${step.name} still floats above its stone support`);
  }
});

test('a visible stepped path climbs from the entrance court into the south tower', () => {
  const { group } = createXuankongModel();
  const stair = group.getObjectByName('courtyard-south-stair');
  assert.ok(stair, 'courtyard and south tower remain disconnected');
  assert.ok(stair.userData.stepCount >= 8);
  assert.equal(stair.userData.endpoints[0].y, XUANKONG_LAYOUT.courtyard.floorY);
  assert.equal(stair.userData.endpoints[1].y, XUANKONG_LAYOUT.southTower.floorY);
  assert.ok(stair.userData.endpoints[0].x >= XUANKONG_LAYOUT.courtyard.x - XUANKONG_LAYOUT.courtyard.width / 2);
  assert.ok(stair.userData.endpoints[1].x <= XUANKONG_LAYOUT.southTower.x - XUANKONG_LAYOUT.southTower.width / 2 + 0.15);
});

test('architecture stays finite, detailed and below the scene triangle budget', () => {
  const first = createXuankongModel();
  const second = createXuankongModel();
  const architecture = first.group.getObjectByName('xuankong-architecture');
  assertFiniteGeometry(first.group);
  const bounds = new THREE.Box3().setFromObject(architecture);
  assert.ok(bounds.max.x - bounds.min.x >= 38 && bounds.max.x - bounds.min.x < 41,
    `unexpected temple span ${bounds.max.x - bounds.min.x}`);
  assert.ok(bounds.max.y - bounds.min.y > 18, 'stepped towers and supports read as a flat row');
  assert.ok(meshes(architecture).length > 55, 'model lacks distinct architectural layers');
  assert.ok(triangleCount(architecture) < 120000,
    `architecture exceeds triangle budget: ${triangleCount(architecture)}`);

  const firstSlab = first.group.getObjectByName('south-tower-floor-1-slab');
  const secondSlab = second.group.getObjectByName('south-tower-floor-1-slab');
  assert.notEqual(firstSlab.geometry, secondSlab.geometry, 'instances share disposable geometry');
  assert.notEqual(firstSlab.material, secondSlab.material, 'instances share disposable material');
});

test('combined model disposal is idempotent across cliff and architecture resources', () => {
  const model = createXuankongModel();
  const cliffMesh = meshes(model.group.getObjectByName('building-cliff'))[0];
  const architectureMesh = model.group.getObjectByName('south-tower-floor-1-slab');
  const mergedRoofRibs = model.group.getObjectByName('south-tower-floor-1-roof-tile-ribs');
  let cliffDisposals = 0;
  let architectureDisposals = 0;
  let mergedRoofDisposals = 0;
  cliffMesh.geometry.addEventListener('dispose', () => { cliffDisposals += 1; });
  architectureMesh.geometry.addEventListener('dispose', () => { architectureDisposals += 1; });
  mergedRoofRibs.geometry.addEventListener('dispose', () => { mergedRoofDisposals += 1; });
  model.dispose();
  model.dispose();
  assert.equal(cliffDisposals, 1);
  assert.equal(architectureDisposals, 1);
  assert.equal(mergedRoofDisposals, 1);
});
