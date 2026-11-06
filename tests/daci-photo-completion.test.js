import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDaciModel } from '../src/daci-yan/model.js';
import { cliffFaceZ } from '../src/daci-yan/layout.js';

function bounds(object) {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

function meshes(object) {
  const result = [];
  object.traverse((child) => { if (child.isMesh) result.push(child); });
  return result;
}

function namedChildren(object, expression) {
  return object.children.filter((child) => expression.test(child.name));
}

function namedDescendants(object, expression) {
  const result = [];
  object.traverse((child) => { if (child !== object && expression.test(child.name)) result.push(child); });
  return result;
}

function beamEndpoints(object) {
  const half = object.geometry.parameters.height / 2;
  return [-half, half].map((y) => object.localToWorld(new THREE.Vector3(0, y, 0)));
}

function endpointGap(first, second) {
  return Math.min(...beamEndpoints(first).flatMap((a) => beamEndpoints(second).map((b) => a.distanceTo(b))));
}

test('new stone paths clear the cliff at walking height and their supports enter rock', () => {
  const model = createDaciModel();
  try {
    model.group.updateMatrixWorld(true);
    for (const id of ['left-cliff-approach', 'gate-side-path']) {
      const path = model.group.getObjectByName(id);
      assert.ok(path);
      for (const deck of namedChildren(path, /^(?:approach-deck|gate-side-segment)-\d+$/)) {
        for (const fraction of [-.4, 0, .4]) {
          const p = deck.localToWorld(new THREE.Vector3(deck.geometry.parameters.width * fraction, .14, 0));
          assert.ok(p.z - cliffFaceZ(p.x, p.y + 1) > .5, `${deck.name} does not bury its walking center in rock`);
        }
      }
      for (const post of namedChildren(path, /support/)) {
        const endpoints = [-.5, .5].map((t) => post.localToWorld(new THREE.Vector3(0, post.geometry.parameters.height * t, 0))).sort((a, b) => a.y - b.y);
        const foot = endpoints[0];
        assert.ok(foot.z <= cliffFaceZ(foot.x, foot.y) + .05, `${post.name} has an actual rock mounting`);
      }
    }
  } finally { model.dispose(); }
});

test('photo-derived left cliff approach follows the visible valley curve without inventing the hidden upper link', () => {
  const model = createDaciModel();
  try {
    const architecture = model.group.getObjectByName('daci-architecture');
    const approach = architecture?.getObjectByName('left-cliff-approach');
    assert.ok(approach, 'architecture has a left-cliff-approach group');
    const decks = namedChildren(approach, /^approach-deck-\d+$/).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    assert.ok(decks.length >= 3, 'approach has multiple deck segments');
    const deckBounds = decks.reduce((box, deck) => box.union(bounds(deck)), new THREE.Box3());
    assert.ok(deckBounds.min.x <= -65 && deckBounds.max.x >= -40.5, 'approach spans the photographed lower-left valley up to the wooded shoulder');
    assert.ok(deckBounds.min.y <= 22.1 && deckBounds.max.y >= 30.5, 'approach descends into the valley and rises again');
    const centers = decks.map((deck) => bounds(deck).getCenter(new THREE.Vector3()));
    const valley = Math.min(...centers.map((center) => center.y));
    assert.ok(centers[0].y > valley + 6 && centers.at(-1).y > valley + 3, 'visible path has a concave valley profile');
    const court = architecture.getObjectByName('terrace-platform-floor');
    assert.ok(deckBounds.max.x < bounds(court).min.x - .5, 'path stops outside the compound instead of dangling under its floor');
    for (let i = 1; i < decks.length; i++) {
      const previous = bounds(decks[i - 1]);
      const current = bounds(decks[i]);
      assert.ok(previous.intersectsBox(current) || previous.max.distanceTo(current.min) < 0.4,
        `${decks[i - 1].name} joins ${decks[i].name}`);
    }
    const rails = namedChildren(approach, /^approach-handrail-\d+-(?:left|right)$/);
    assert.ok(rails.length >= decks.length * 2, 'each approach segment has two handrails');
    assert.ok(namedDescendants(approach, /approach-(?:stone-)?post/).length >= decks.length,
      'approach handrails have stone posts');
    assert.ok(namedDescendants(approach, /support/).length >= 2, 'approach deck is supported against the cliff');
    const terminal = decks.at(-1), terminalLength = terminal.geometry.parameters.width - .12;
    const exposedEnd = terminal.localToWorld(new THREE.Vector3(-terminalLength / 2, 0, 0));
    const hiddenEnd = terminal.localToWorld(new THREE.Vector3(terminalLength / 2, 0, 0));
    const exposedClearance = exposedEnd.z - cliffFaceZ(exposedEnd.x, exposedEnd.y);
    const hiddenClearance = hiddenEnd.z - cliffFaceZ(hiddenEnd.x, hiddenEnd.y);
    assert.ok(exposedClearance > 1.8 && hiddenClearance > .8 && hiddenClearance < 1.2,
      'last real deck turns from the exposed valley route toward the wooded rock shoulder');
  } finally { model.dispose(); }
});

test('left compound reproduces the photographed long gallery, polygon pavilion, stone court, central stair, rear hall and side room', () => {
  const model = createDaciModel();
  try {
    const terrace = model.group.getObjectByName('building-terrace');
    assert.ok(terrace);
    const hall = terrace.getObjectByName('left-compound-hall');
    const pavilion = terrace.getObjectByName('left-front-pavilion');
    const longGallery = terrace.getObjectByName('left-long-white-gallery');
    const sideRoom = terrace.getObjectByName('left-east-side-room');
    const court = terrace.getObjectByName('terrace-platform-floor');
    const centralStair = terrace.getObjectByName('left-court-central-stair');
    assert.ok(hall && pavilion && longGallery && sideRoom && court && centralStair);
    const floor = hall.getObjectByName('left-compound-floor');
    const fb = bounds(floor); const cb = bounds(court); const lb = bounds(longGallery); const pb = bounds(pavilion);
    assert.ok(cb.getSize(new THREE.Vector3()).x >= 20 && cb.getSize(new THREE.Vector3()).z >= 7, 'front stone court is broad and deep');
    assert.ok(fb.getSize(new THREE.Vector3()).x >= 11 && fb.min.y > cb.max.y + 2, 'rear hall is wider and raised above the court');
    assert.ok(lb.min.x <= -48 && lb.max.x >= cb.min.x, 'west gallery extends left and overlaps the court edge');
    assert.ok(pb.intersectsBox(cb), 'polygon pavilion floor overlaps the court rather than floating beside it');
    assert.ok(bounds(sideRoom).getSize(new THREE.Vector3()).x < fb.getSize(new THREE.Vector3()).x, 'east room is visibly smaller than the rear hall');
    assert.ok(bounds(pavilion).max.y > bounds(longGallery).max.y + .5, 'polygon pavilion has an independent roof tip above the long gallery');
    assert.ok(bounds(hall).max.y > bounds(sideRoom).max.y + 5, 'rear hall remains clearly taller than the east side room');
    const steps = namedChildren(centralStair, /^left-court-step-\d+$/).sort((a, b) => Number(a.name.split('-').at(-1)) - Number(b.name.split('-').at(-1)));
    assert.equal(steps.length, 10, 'central court stair has the photographed relative step count');
    for (let i = 1; i < steps.length; i++) assert.ok(bounds(steps[i - 1]).intersectsBox(bounds(steps[i])), `court step ${i} is continuous`);
    assert.ok(bounds(steps[0]).intersectsBox(bounds(centralStair.getObjectByName('left-court-bottom-landing-floor'))));
    assert.ok(bounds(steps.at(-1)).intersectsBox(bounds(centralStair.getObjectByName('left-court-upper-landing-floor'))));
    assert.ok(namedDescendants(terrace, /terrace-front-balustrade/).length > 3
      && namedDescendants(terrace, /left-court-stair-rail/).length > 3
      && namedDescendants(terrace, /left-court-upper-rail/).length > 3, 'front, stair-side, and upper white rails are separate geometry layers');
    const platformSupports = namedChildren(terrace, /^terrace-platform-support-/);
    assert.equal(platformSupports.length, 5, 'court front uses a small number of coarse supports');
    assert.ok(platformSupports.every((post) => post.material.color.getHex() === 0xc6c0a9 && post.geometry.parameters.width >= .58), 'court supports are thick stone columns');
    const landing = bounds(centralStair.getObjectByName('left-court-upper-landing-floor'));
    model.group.updateMatrixWorld(true);
    const entranceRay = new THREE.Raycaster(new THREE.Vector3(-30, 35.45, landing.max.z + .4), new THREE.Vector3(0, 0, -1));
    const entranceHits = entranceRay.intersectObjects(meshes(hall), false);
    assert.ok(entranceHits.length && entranceHits[0].distance > 3.5, 'central stair leads through a real open doorway into the recessed room');
  } finally { model.dispose(); }
});

test('main hall has one high deep roof with a projecting baxia and gallery has short flights with real platforms', () => {
  const model = createDaciModel();
  try {
    const hall = model.group.getObjectByName('building-main-hall');
    const grand = hall?.getObjectByName('main-hall-grand-roof');
    const baxia = hall?.getObjectByName('main-hall-front-baxia-roof');
    assert.ok(grand && baxia, 'main hall has a single grand roof and a front projecting roof');
    const gb = bounds(grand); const bb = bounds(baxia);
    assert.ok(gb.getSize(new THREE.Vector3()).x > 21 && gb.getSize(new THREE.Vector3()).y > 3, 'grand roof is wide and steep');
    assert.ok(gb.getSize(new THREE.Vector3()).z > 7, 'grand roof is deep enough to meet the cliff');
    assert.ok(bb.getSize(new THREE.Vector3()).x < gb.getSize(new THREE.Vector3()).x / 2 && bb.max.z > gb.max.z, 'baxia is a narrower forward projection');
    const windowHeight = bounds(hall.getObjectByName('main-hall-window-0-glass')).getSize(new THREE.Vector3()).y;
    assert.ok(gb.getSize(new THREE.Vector3()).y > windowHeight * 2, 'photographed main roof projects at more than twice the red window height');
    const gallery = model.group.getObjectByName('building-gallery');
    const wing = gallery?.getObjectByName('main-left-wing');
    assert.ok(wing && bounds(wing).min.x < -17 && bounds(wing).max.x >= bounds(gallery).min.x, 'main-left-wing extends beyond and meets gallery left edge');
    const wingFloor = namedChildren(wing, /floor/)[0];
    const galleryFloor = gallery.getObjectByName('gallery-floor');
    assert.ok(wingFloor && galleryFloor && bounds(wingFloor).intersectsBox(bounds(galleryFloor)), 'left wing floor meets gallery floor');
    for (const id of ['main-left-wing', 'left-front-pavilion']) {
      const normal = model.group.getObjectByName(`${id}-roof-surface`).geometry.getAttribute('normal');
      assert.ok(Array.from({ length: normal.count }, (_, i) => normal.getY(i)).every((y) => y > 0), 'polygon roof normals face upwards');
    }
    const stair = model.group.getObjectByName('building-stair');
    const landing = stair?.getObjectByName('right-wing-landing');
    assert.ok(landing, 'right flight has a landing at the first bend');
    const treadPrefixes = new Map();
    namedDescendants(stair, /^cliff-stair-\d+-tread-\d+$/).forEach((tread) => {
      const prefix = tread.name.match(/^(cliff-stair-\d+)-tread-/)[1];
      if (!treadPrefixes.has(prefix)) treadPrefixes.set(prefix, []);
      treadPrefixes.get(prefix).push(tread);
    });
    const segments = [...treadPrefixes.entries()].map(([prefix, treads]) => ({ prefix, box: treads.reduce((box, tread) => box.union(bounds(tread)), new THREE.Box3()) })).sort((a, b) => a.box.min.x - b.box.min.x);
    assert.equal(segments.length, 7, 'right covered route has seven short flight/platform segments');
    const expected = [[8, 10.5, 31.5, 30.8], [10.5, 12.5, 30.8, 30.8], [12.5, 14, 30.8, 30], [14, 16.5, 30, 30], [16.5, 18.5, 30, 27.7], [18.5, 20, 27.7, 27.7], [20, 25, 27.7, 20]];
    for (let i = 0; i < expected.length; i++) {
      const b = segments[i].box;
      assert.ok(b.min.x <= expected[i][0] + .5 && b.max.x >= expected[i][1] - .5, `${segments[i].name} spans expected x nodes`);
      assert.ok(b.min.y <= expected[i][3] + .5 && b.max.y >= expected[i][2] - .5, `${segments[i].name} spans expected y nodes`);
    }
    const landingBox = bounds(landing);
    assert.ok(landingBox.min.x <= 12.5 && landingBox.max.x >= 12.5 && landingBox.min.y <= 30.9 && landingBox.max.y >= 30.2,
      'right-wing-landing sits at the first platform bend');
    const platform = bounds(stair.getObjectByName('right-wing-platform'));
    assert.ok(platform.min.x <= 16.5 && platform.max.x >= 16.5 && platform.min.y <= 30.1 && platform.max.y >= 29.5,
      'right-wing-platform sits before the second descent');
  } finally { model.dispose(); }
});

test('central facade has two red bands, a white upper base and a steep roof rather than a third room row', () => {
  const model = createDaciModel();
  try {
    const hall = model.group.getObjectByName('building-main-hall');
    const gallery = model.group.getObjectByName('building-gallery');
    assert.ok(hall?.getObjectByName('main-hall-grand-roof'));
    assert.ok(hall?.getObjectByName('main-hall-front-baxia-gable'));
    assert.equal(hall?.getObjectByName('main-hall-upper-storey'), undefined, 'roof silhouette does not create a third full facade');
    const ridge = bounds(hall.getObjectByName('main-hall-front-baxia-roof-ridge')).getSize(new THREE.Vector3());
    assert.ok(ridge.z > ridge.x * 10, 'projecting front roof ridge runs into the cliff');
    const whiteRail = hall.getObjectByName('main-hall-white-balustrade-horizontal-1.05') || hall.getObjectByName('main-hall-white-balustrade-horizontal-0.85');
    assert.ok(whiteRail && whiteRail.material.color.getHex() === 0xd8d2c2, 'upper red facade stands on a visible white rail/base band');
    assert.ok(namedChildren(gallery, /^gallery-open-door-/).length > namedChildren(gallery, /^gallery-window-\d+-glass$/).length, 'lower gallery is mostly open dark bays');
    const redMeshes = meshes(hall).filter((mesh) => mesh.material?.color?.r > .35 && mesh.material.color.g < .35);
    const roofBase = bounds(hall.getObjectByName('main-hall-grand-roof')).min.y;
    assert.ok(redMeshes.every((mesh) => bounds(mesh).max.y <= roofBase + 1.5), 'main hall red facade stops below the high roof body');
  } finally { model.dispose(); }
});

test('left compound exposes the photographed white rear wall and narrower projecting upper facade', () => {
  const model = createDaciModel();
  try {
    const upper = model.group.getObjectByName('left-compound-upper');
    assert.ok(upper?.getObjectByName('left-compound-upper-white-wall'));
    assert.ok(upper?.getObjectByName('left-compound-upper-red-front'));
    assert.ok(upper?.getObjectByName('left-compound-upper-gable'));
    const upperWidth = bounds(upper.getObjectByName('left-compound-upper-red-front')).getSize(new THREE.Vector3()).x;
    const lowerWidth = bounds(model.group.getObjectByName('left-compound-floor')).getSize(new THREE.Vector3()).x;
    assert.ok(upperWidth > 8 && upperWidth < lowerWidth,
      'upper red facade remains narrower than the lower compound mass');
    const white = upper.getObjectByName('left-compound-upper-white-side-wall');
    const wb = bounds(white); const ray = new THREE.Raycaster(new THREE.Vector3(wb.max.x + 2, wb.getCenter(new THREE.Vector3()).y, wb.getCenter(new THREE.Vector3()).z), new THREE.Vector3(-1, 0, 0));
    assert.ok(ray.intersectObject(white, false).length, 'white side wall is visible from the valley side');
  } finally { model.dispose(); }
});

test('gate keeps a real open lower portal and a raised upper storey with a supported side path', () => {
  const model = createDaciModel();
  try {
    const gate = model.group.getObjectByName('building-gate');
    const upper = gate?.getObjectByName('gate-upper-storey');
    const canopy = gate?.getObjectByName('gate-lower-canopy');
    const sidePath = gate?.getObjectByName('gate-side-path');
    assert.ok(upper && canopy && sidePath, 'gate has explicit upper, lower canopy, and side path groups');
    const upperBox = bounds(upper); const canopyBox = bounds(canopy);
    const upperRoof = gate.getObjectByName('gate-upper-roof');
    assert.ok(upperRoof && bounds(upperRoof).min.y > canopyBox.max.y, 'upper storey roof is raised above lower canopy');
    const gateFloor = gate.getObjectByName('gate-floor');
    const floorBox = bounds(gateFloor); const lintelBox = bounds(gate.getObjectByName('gate-lintel'));
    const centerDoor = meshes(gate).filter((mesh) => {
      const b = bounds(mesh); return b.min.x < floorBox.getCenter(new THREE.Vector3()).x + .25 && b.max.x > floorBox.getCenter(new THREE.Vector3()).x - .25 && b.min.y < lintelBox.min.y && b.max.y > floorBox.max.y;
    });
    assert.equal(centerDoor.filter((mesh) => bounds(mesh).min.y < floorBox.max.y + .2 && bounds(mesh).max.y > floorBox.min.y + 2.7).length, 0,
      'ground-floor portal remains open through the doorway height');
    assert.equal(centerDoor.filter((mesh) => /post|column|pillar/i.test(mesh.name)).length, 0, 'gate doorway has no central blocking column');
    const pathBounds = bounds(sidePath);
    assert.ok(pathBounds.min.x <= 25 && pathBounds.max.x >= 36, 'side path exits to the right from x25 to x36');
    const pathSegments = namedDescendants(sidePath, /^gate-side-segment-\d+$/).sort((a, b) => bounds(a).min.x - bounds(b).min.x);
    assert.ok(pathSegments.length >= 3, 'side path has connected lower exit stairs');
    assert.ok(namedDescendants(sidePath, /handrail|rail/).length >= 2, 'side path has stone handrails');
    assert.ok(namedDescendants(sidePath, /support|post/).length >= 2, 'side path is supported');
    const treads = pathSegments;
    for (let i = 1; i < treads.length; i++) assert.ok(bounds(treads[i - 1]).intersectsBox(bounds(treads[i])) || bounds(treads[i - 1]).max.distanceTo(bounds(treads[i]).min) < .5, 'side path stairs remain connected');
    const exitTreads = namedChildren(gate, /^gate-exit-tread-\d+$/)
      .sort((a, b) => Number(a.name.split('-').at(-1)) - Number(b.name.split('-').at(-1)));
    const exitLanding = gate.getObjectByName('gate-exit-landing');
    assert.equal(exitTreads.length, 8, 'gate exit retains eight real treads');
    assert.ok(bounds(gateFloor).intersectsBox(bounds(exitTreads[0])), 'first exit tread overlaps the gate floor');
    for (let i = 1; i < exitTreads.length; i++) {
      assert.ok(bounds(exitTreads[i - 1]).intersectsBox(bounds(exitTreads[i])), `gate exit tread ${i} has no surface gap`);
    }
    assert.ok(bounds(exitTreads.at(-1)).intersectsBox(bounds(exitLanding)), 'last exit tread meets the turning landing');
    assert.ok(bounds(exitLanding).intersectsBox(bounds(pathSegments[0])), 'turning landing meets the side path deck');
    const postReceivers = [...exitTreads, exitLanding].map(bounds);
    const exitPosts = namedChildren(gate, /^gate-exit-rail-post-(?:left|right)-\d+$/);
    assert.equal(exitPosts.length, exitTreads.length * 2, 'both stair sides have posts at every tread');
    for (const post of exitPosts) {
      const bottom = post.localToWorld(new THREE.Vector3(0, -post.geometry.parameters.height / 2, 0));
      assert.ok(postReceivers.some((receiver) => receiver.clone().expandByScalar(.01).containsPoint(bottom)),
        `${post.name} stands on actual stair geometry`);
      const b = bounds(post);
      assert.ok(b.max.x < 24.3 || b.min.x > 25.7, `${post.name} stays outside the open passage`);
    }
    for (const [stairSide, pathSide] of [['left', 'right'], ['right', 'left']]) {
      for (const suffix of ['', '-lower']) {
        const stairRail = gate.getObjectByName(`gate-exit-handrail-${stairSide}${suffix}`);
        const cornerRail = gate.getObjectByName(`gate-exit-corner-${stairSide}${suffix}`);
        const pathRail = sidePath.getObjectByName(`gate-side-handrail-0-${pathSide}${suffix}`);
        assert.ok(stairRail && cornerRail && pathRail);
        assert.ok(endpointGap(stairRail, cornerRail) < 1e-5, `${stairSide}${suffix} stair rail meets its corner rail`);
        assert.ok(endpointGap(cornerRail, pathRail) < 1e-5, `${stairSide}${suffix} corner rail meets the side-path rail`);
      }
    }
  } finally { model.dispose(); }
});
