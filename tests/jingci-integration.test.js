import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { JINGCI_LAYOUT, JINGCI_COURTYARDS } from '../src/west-lake/jingci-temple/layout.js';
import { westLakePOIs } from '../src/west-lake/pois.js';
import { getScenicScene } from '../src/west-lake/scenic-scenes.js';
import { createJingciOverview } from '../src/west-lake/jingci-temple/overview.js';
import { createJingciCore } from '../src/west-lake/jingci-temple/model.js';
import { captureScenicEntryView, applyScenicEntryView } from '../src/shared/scenic-entry-view.js';

test('Jingci uses the temple representative point and enables its own scenic entry', () => {
  const poi = westLakePOIs.find(({ id }) => id === 'jingci-temple');
  assert.ok(poi);
  assert.equal(poi.longitude, 120.1443406);
  assert.equal(poi.latitude, 30.2311307);
  assert.equal(poi.sceneId, 'jingci-temple');
  assert.equal(poi.importance, 3);
  const scene = getScenicScene(poi.sceneId);
  assert.equal(scene.poiId, poi.id);
  assert.equal(scene.enabled, true);
  assert.deepEqual(scene.content.hotspots.map(({ id }) => id),
    ['gate', 'daxiong', 'bell', 'courtyard', 'rear-hall', 'rear-pavilion', 'side-courts']);
});

function slopingTerrain() {
  const rawHeight = (x, z) => 0.9 + 0.3 * x + 0.1 * z;
  return { toWorld: () => [2, -3], getHeight: rawHeight,
    adjustGround(adjustment) { this.getHeight = (x, z) => adjustment(x, z, rawHeight(x, z)); } };
}

test('overview keeps the entrance low and uses the shared stepped campus instead of a uniform high platform', () => {
  const terrain = slopingTerrain();
  const entranceHeight = terrain.getHeight(2, -3);
  const overview = createJingciOverview(terrain, {}, 0.0025);
  assert.equal(overview.core.position.y, entranceHeight);
  assert.equal(overview.group.getObjectByName('jingci-foundation-platform'), undefined);
  assert.equal(overview.group.getObjectByName('jingci-foundation-skirt'), undefined);
  const floors = ['gate', 'daxiong', 'rear-hall', 'rear-pavilion'].map((id) =>
    new THREE.Box3().setFromObject(overview.core.getObjectByName(`${id}-stone-foundation`)).max.y);
  for (let i = 1; i < floors.length; i++) assert.ok(floors[i] > floors[i - 1]);
  assert.ok(floors[0] - entranceHeight < 0.006, 'entry was raised to a rear hillside high point');
  assert.ok(overview.anchor.y > floors.at(-1));
  assert.equal(terrain.getHeight(8, 8), 0.9 + 0.3 * 8 + 0.1 * 8, 'remote terrain must remain untouched');
});

// Import the actual terrain implementation with only Vite asset imports replaced.
// The geometry, triangulation, grading and height queries all run unchanged.
async function realTerrain() {
  const data = (file) => readFileSync(new URL(`../src/data/${file}`, import.meta.url));
  let source = readFileSync(new URL('../src/west-lake/terrain.js', import.meta.url), 'utf8');
  source = source.replace("from 'three'", `from '${import.meta.resolve('three')}'`)
    .replace(/import terrainUrl[^;]+;/, "const terrainUrl = 'dem';")
    .replace(/import waterUrl[^;]+;/, "const waterUrl = 'water';")
    .replace(/import metadata[^;]+;/, `const metadata = ${data('west-lake-dem.json')};`)
    .replace(/import shoreline[^;]+;/, `const shoreline = ${data('west-lake-shore.json')};`);
  const assets = { dem: data('west-lake-dem.bin').toString('base64'), water: data('west-lake-water.bin').toString('base64') };
  source += `\nconst testAssets = ${JSON.stringify(assets)};\nconst fetch = async (url) => ({ok:true,arrayBuffer:async()=>{const b=Buffer.from(testAssets[url],'base64'); return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);}});`;
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  return module.createWestLakeTerrain();
}

test('actual DEM grading meets foundations and height queries match the displayed triangles', async () => {
  const terrain = await realTerrain();
  const poi = westLakePOIs.find(({ id }) => id === 'jingci-temple');
  const coordinate = terrain.toWorld(poi.longitude, poi.latitude);
  const entranceHeight = terrain.getHeight(...coordinate);
  const overview = createJingciOverview(terrain, poi, 0.0025);
  assert.equal(overview.core.position.y, entranceHeight);
  const surface = terrain.group.children[0];
  const raycaster = new THREE.Raycaster();
  const scale = overview.core.scale.x;
  // Keep actual displayed triangles near the campus for dense ray checks.
  const campus = new THREE.Box3().setFromObject(overview.core).expandByScalar(scale * 2);
  const positions = surface.geometry.getAttribute('position'), sourceIndices = surface.geometry.index;
  const campusIndices = [];
  for (let i = 0; i < sourceIndices.count; i += 3) {
    const vertices = [sourceIndices.getX(i), sourceIndices.getX(i + 1), sourceIndices.getX(i + 2)];
    const xs = vertices.map((v) => positions.getX(v)), zs = vertices.map((v) => positions.getZ(v));
    if (Math.max(...xs) >= campus.min.x && Math.min(...xs) <= campus.max.x
      && Math.max(...zs) >= campus.min.z && Math.min(...zs) <= campus.max.z) campusIndices.push(...vertices);
  }
  const campusGeometry = new THREE.BufferGeometry();
  campusGeometry.setAttribute('position', positions);
  campusGeometry.setIndex(campusIndices);
  const campusSurface = new THREE.Mesh(campusGeometry, surface.material);
  for (const spec of [...JINGCI_LAYOUT, ...JINGCI_COURTYARDS]) {
    const foundation = overview.core.getObjectByName(JINGCI_LAYOUT.includes(spec)
      ? `${spec.id}-stone-foundation` : `court-${spec.id}`);
    const floor = new THREE.Box3().setFromObject(foundation).max.y;
    const footprint = new THREE.Box3().setFromObject(foundation);
    for (const dx of [0.001, 0.25, 0.5, 0.75, 0.999]) for (const dz of [0.001, 0.25, 0.5, 0.75, 0.999]) {
      const x = THREE.MathUtils.lerp(footprint.min.x, footprint.max.x, dx);
      const z = THREE.MathUtils.lerp(footprint.min.z, footprint.max.z, dz);
      raycaster.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
      const hit = raycaster.intersectObject(campusSurface)[0];
      assert.ok(hit, `missing ground under ${spec.id}`);
      assert.ok(Math.abs(hit.point.y - terrain.getHeight(x, z)) < 2e-6, `${spec.id} height differs from visible triangle`);
      assert.ok(floor >= hit.point.y - 1e-6, `${spec.id} is penetrated by terrain`);
    }
  }
  for (const part of overview.core.getObjectByName('jingci-axis-terraces').children) {
    const footprint = new THREE.Box3().setFromObject(part);
    let samples = 0;
    for (const dx of [0.001, 0.25, 0.5, 0.75, 0.999]) for (let row = 0; row <= 32; row++) {
      const x = THREE.MathUtils.lerp(footprint.min.x, footprint.max.x, dx);
      const z = THREE.MathUtils.lerp(footprint.min.z, footprint.max.z, 0.001 + row / 32 * 0.998);
      raycaster.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
      const top = raycaster.intersectObject(part)[0];
      if (!top) continue;
      const hit = raycaster.intersectObject(campusSurface)[0];
      assert.ok(hit, `missing ground under ${part.name}`);
      assert.ok(Math.abs(hit.point.y - terrain.getHeight(x, z)) < 2e-6, `${part.name} height mismatch`);
      assert.ok(top.point.y >= hit.point.y - 1e-6, `${part.name} is penetrated by terrain`);
      samples++;
    }
    assert.ok(samples >= 100, `${part.name} needs interior and edge coverage`);
  }
  for (const [x, z] of [[coordinate[0] - 0.62,coordinate[1] - 0.12], [coordinate[0],coordinate[1] + 0.85], [0,0]]) {
    raycaster.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0,-1,0));
    const hit = raycaster.intersectObject(surface)[0];
    assert.ok(Math.abs(hit.point.y - terrain.getHeight(x,z)) < 2e-6, 'transition/remote sampling differs from rendered surface');
  }
});

test('Jingci miniature and first scenic frame preserve direction and geometry projection', () => {
  const overview = createJingciOverview(slopingTerrain(), {}, 0.0025);
  const world = new THREE.PerspectiveCamera(39, 1280 / 800, 0.001, 100);
  const target = new THREE.Box3().setFromObject(overview.core).getCenter(new THREE.Vector3());
  world.position.copy(target).add(new THREE.Vector3(0.65, 0.6, -0.9));
  world.lookAt(target);
  const entry = captureScenicEntryView(world, target, overview.core);
  const detailed = createJingciCore();
  const scenic = new THREE.PerspectiveCamera();
  const controls = { target: new THREE.Vector3(), maxDistance: 200, minPolarAngle: 0.1,
    update() { scenic.lookAt(this.target); scenic.updateMatrixWorld(true); } };
  scenic.aspect = world.aspect;
  applyScenicEntryView(scenic, controls, entry, new THREE.Box3().setFromObject(detailed.group), 1280, 800);
  for (const id of Object.keys(detailed.anchors)) {
    const point = new THREE.Vector3(...detailed.anchors[id].toArray());
    const expected = overview.core.localToWorld(point.clone()).project(world);
    const actual = point.project(scenic);
    assert.ok(Math.abs(expected.x - actual.x) < 1e-7);
    assert.ok(Math.abs(expected.y - actual.y) < 1e-7);
  }
});
