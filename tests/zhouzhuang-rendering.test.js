import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { createHash } from 'node:crypto';
import { createZhouzhuangModel } from '../src/zhouzhuang/model.js';
import housing from '../src/data/zhouzhuang-housing.json' with { type: 'json' };
import { layout } from '../src/zhouzhuang/layout.js';
import landUse from '../src/data/zhouzhuang-landuse.json' with { type: 'json' };

test('generated housing matches the current source layout and retains explicit side lanes', () => {
  assert.equal(housing.sourceLayoutHash, createHash('sha256').update(JSON.stringify(layout)).digest('hex'));
  assert.equal(housing.sourceLandUseHash, createHash('sha256').update(JSON.stringify(landUse)).digest('hex'));
  assert.ok(housing.lanes.length > 0);
  assert.ok(housing.houses.some(house => house.role === 'rear'));
});

test('overview retains housing coverage while close housing gains deferred details', () => {
  const model = createZhouzhuangModel();
  const camera = new PerspectiveCamera();
  const obstacles = model.obstacles;
  camera.position.set(0, 2000, 0);
  model.update(camera);
  const overviewCount = model.housingStats.visibleHouseCount;
  assert.equal(overviewCount, housing.houses.length, 'far views must preserve every building footprint');
  assert.equal(model.housingStats.detailedHouseCount, 0);
  const instanceCount = () => {
    let count = 0;
    model.group.getObjectByName('housing-lod').traverseVisible(object => { if (object.isInstancedMesh) count += object.count; });
    return count;
  };
  const overviewInstances = instanceCount();
  assert.ok(model.group.getObjectByName('courtyard-side-lanes'));
  camera.position.set(layout.spawn.x, 4, layout.spawn.z);
  for (let frame = 0; frame < 20; frame++) model.update(camera, { walking: true });
  assert.equal(model.housingStats.visibleHouseCount, overviewCount);
  assert.ok(instanceCount() > overviewInstances, 'zooming in should add geometric detail rather than restore omitted buildings');
  assert.ok(model.housingStats.detailedHouseCount > 0);
  const lod = model.group.getObjectByName('housing-lod');
  const detail = lod.children.find(child => child.visible && child.userData.lodLevel === 'detail');
  const shell = lod.children.find(child => child.visible && child.userData.chunkKey === detail.userData.chunkKey
    && child.userData.lodLevel === 'shell');
  assert.ok(shell?.getObjectByName('house-white-walls'), 'detail must keep its visible solid shell');
  assert.ok(detail.getObjectByName('house-wood-doors'), 'near buildings need their entrances');
  camera.position.set(0, 2000, 0);
  model.update(camera);
  assert.equal(model.housingStats.visibleHouseCount, overviewCount);
  assert.equal(model.housingStats.detailedHouseCount, 0);
  assert.equal(model.obstacles, obstacles, 'level changes must preserve physical footprints');
  const geometries = new Set();
  model.group.traverse(object => { if (object.geometry) geometries.add(object.geometry); });
  let released = 0;
  geometries.forEach(geometry => geometry.addEventListener('dispose', () => released++));
  model.dispose();
  assert.equal(released, geometries.size, 'cached hidden batches must also be released');
  model.dispose();
  assert.equal(released, geometries.size);
});

test('prevalidated flat courtyard lanes render without metre-by-metre subdivision', () => {
  const model = createZhouzhuangModel();
  const segments = housing.lanes.reduce((count, lane) => count + lane.points.length - 1, 0);
  assert.equal(model.group.getObjectByName('courtyard-side-lanes').geometry.attributes.position.count, segments * 12);
  model.dispose();
});
