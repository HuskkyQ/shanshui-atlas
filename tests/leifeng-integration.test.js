import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createLeifengOverview } from '../src/west-lake/leifeng-pagoda/overview.js';
import { createLeifengCore } from '../src/west-lake/leifeng-pagoda/model.js';
import { LEIFENG_SITE } from '../src/west-lake/leifeng-pagoda/site-layout.js';
import { createJingciOverview } from '../src/west-lake/jingci-temple/overview.js';
import { westLakePOIs } from '../src/west-lake/pois.js';
import { captureScenicEntryView, applyScenicEntryView } from '../src/shared/scenic-entry-view.js';

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

function localSurface(surface, bounds) {
  const positions = surface.geometry.getAttribute('position'), indices = surface.geometry.index, selected = [];
  for (let i = 0; i < indices.count; i += 3) {
    const v = [indices.getX(i), indices.getX(i+1), indices.getX(i+2)];
    const xs = v.map(i => positions.getX(i)), zs = v.map(i => positions.getZ(i));
    if (Math.max(...xs) >= bounds.min.x && Math.min(...xs) <= bounds.max.x
      && Math.max(...zs) >= bounds.min.z && Math.min(...zs) <= bounds.max.z) selected.push(...v);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', positions); geometry.setIndex(selected);
  return new THREE.Mesh(geometry, surface.material);
}

function assertRenderableGround(terrain) {
  const geometry = terrain.group.children[0].geometry;
  let maxIndex = 0;
  for (const index of geometry.index.array) maxIndex = Math.max(maxIndex, index);
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    assert.equal(attribute.count, geometry.getAttribute('position').count,
      `${name} buffer must cover the subdivided terrain vertices`);
    assert.ok(maxIndex < attribute.count, `${name} buffer cannot serve the ground draw indices`);
  }
}

test('World precinct keeps the mapped size and its shared first-frame projection', () => {
  const terrain = { toWorld:()=>[4, -3], getHeight:()=>0.6, adjustGround(){} };
  const worldModel = createLeifengOverview(terrain, {}, 0.0025);
  assert.equal(worldModel.core.scale.x, 0.005);
  assert.equal(worldModel.group.getObjectByName('leifeng-overview-slope'), undefined);
  assert.equal(worldModel.group.getObjectByName('leifeng-overview-platform'), undefined);
  const bounds = new THREE.Box3().setFromObject(worldModel.tower);
  assert.ok(bounds.max.y - bounds.min.y < 0.23, 'tower still uses the old oversized display scale');
  const camera = new THREE.PerspectiveCamera(39, 1.6, 0.001, 100);
  const target = bounds.getCenter(new THREE.Vector3());
  camera.position.copy(target).add(new THREE.Vector3(0.25,0.22,0.4)); camera.lookAt(target);
  const entry = captureScenicEntryView(camera, target, worldModel.core);
  const close = createLeifengCore(), scenic = new THREE.PerspectiveCamera(39, 1.6, 0.1, 2000);
  const controls = { target:new THREE.Vector3(), maxDistance:105,minPolarAngle:0.12,
    update(){ scenic.lookAt(this.target); scenic.updateMatrixWorld(true); } };
  applyScenicEntryView(scenic, controls, entry, new THREE.Box3().setFromObject(close.group),1280,800);
  const points = [...Object.values(close.anchors), ...LEIFENG_SITE.pond.filter((_,i)=>i%3===0).map(([x,z])=>[x,-60,z])];
  for (const point of points) {
    const expected = worldModel.core.localToWorld(new THREE.Vector3(...point)).project(camera);
    const actual = new THREE.Vector3(...point).project(scenic);
    assert.ok(Math.abs(expected.x-actual.x)<1e-7 && Math.abs(expected.y-actual.y)<1e-7);
  }
});

test('successive real terrain grades preserve Jingci and ground Leifeng paths and pond', async () => {
  const terrain = await realTerrain();
  const jingci = createJingciOverview(terrain, westLakePOIs.find(p=>p.id==='jingci-temple'),0.0025);
  assertRenderableGround(terrain);
  const jingciPoints = ['gate','daxiong','rear-pavilion'].map(id =>
    new THREE.Box3().setFromObject(jingci.core.getObjectByName(id+'-stone-foundation')).getCenter(new THREE.Vector3()));
  const before = jingciPoints.map(p=>terrain.getHeight(p.x,p.z));
  const leifeng = createLeifengOverview(terrain, westLakePOIs.find(p=>p.id==='leifeng'),0.0025);
  assertRenderableGround(terrain);
  assert.deepEqual(jingciPoints.map(p=>terrain.getHeight(p.x,p.z)),before);
  const area = new THREE.Box3().setFromObject(leifeng.core).union(new THREE.Box3().setFromObject(jingci.core)).expandByScalar(0.02);
  let surface = localSurface(terrain.group.children[0],area);
  const ray = new THREE.Raycaster();
  const groundAt = p => {
    ray.set(new THREE.Vector3(p.x,8,p.z),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(surface)[0];
    assert.ok(hit,'missing displayed terrain');
    assert.ok(Math.abs(hit.point.y-terrain.getHeight(p.x,p.z))<2e-6,'cached height differs from visible triangle');
    return hit.point.y;
  };
  for (const p of jingciPoints) groundAt(p);
  let checked=0;
  leifeng.core.traverse(object=>{
    if (!object.isMesh || !(object.name.startsWith('leifeng-path-') || ['release-pond','protection-terrace','leifeng-entry-link','leifeng-entrance-landing'].includes(object.name))) return;
    const positions=object.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i+=Math.max(1,Math.floor(positions.count/45))) {
      const p=object.localToWorld(new THREE.Vector3().fromBufferAttribute(positions,i));
      const y=groundAt(p);
      assert.ok(p.y>=y-0.001,object.name+' is buried at '+i+' by '+(y-p.y));
      checked++;
    }
  });
  assert.ok(checked>150);
  // A third overlapping correction must compose on existing refined triangles.
  const center=jingciPoints[1], old=terrain.getHeight(center.x,center.z);
  terrain.adjustGround((x,z,y)=>y+0.004,{minX:center.x-0.02,maxX:center.x+0.02,minZ:center.z-0.02,maxZ:center.z+0.02});
  assertRenderableGround(terrain);
  assert.ok(Math.abs(terrain.getHeight(center.x,center.z)-old-0.004)<1e-6);
  surface=localSurface(terrain.group.children[0],area);
  groundAt(center);
});
