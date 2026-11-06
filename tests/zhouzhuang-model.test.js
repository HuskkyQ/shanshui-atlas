import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { layout } from '../src/zhouzhuang/layout.js';
import { createZhouzhuangModel } from '../src/zhouzhuang/model.js';
import { createWaterQuery } from '../src/zhouzhuang/surfaces.js';
import { createNavigation } from '../src/zhouzhuang/navigation.js';
import housing from '../src/data/zhouzhuang-housing.json' with { type: 'json' };

const BRIDGES = new Map([
  ['287819684', 'arch'],
  ['608391000', 'beam'],
  ['608673062', 'arch'],
]);

function worldVertices(object) {
  object.updateMatrixWorld(true);
  const positions = object.geometry.getAttribute('position');
  const point = new THREE.Vector3();
  const result = [];
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
    result.push(point.clone());
  }
  return result;
}

function roadForBridge(bridge) {
  return layout.roads.find((road) => String(road.id) === String(bridge.roadId));
}

function segmentMidpoint(a, b) {
  return new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

test('three mapped bridges retain their source type and exact layout endpoints', () => {
  const { group } = createZhouzhuangModel();
  group.updateMatrixWorld(true);
  for (const [id, type] of BRIDGES) {
    const bridge = layout.bridges.find((entry) => String(entry.roadId) === id);
    assert.ok(bridge, `layout is missing bridge ${id}`);
    assert.equal(bridge.type, type, `${id} has the wrong researched bridge type`);
    const structure = group.getObjectByName(`bridge-${id}`);
    assert.ok(structure, `model is missing bridge ${id}`);
    assert.equal(structure.userData.bridgeType, type);

    const road = roadForBridge(bridge);
    assert.ok(road?.points.length >= 2, `${id} has no bridge road`);
    const surface = group.getObjectByName(`road-surface-${road.id}`);
    assert.ok(surface?.isMesh, `${id} has no visible walking surface`);
    const vertices = worldVertices(surface);
    for (const endpoint of [road.points[0], road.points.at(-1)]) {
      assert.ok(vertices.some((vertex) => Math.hypot(vertex.x - endpoint.x, vertex.z - endpoint.z) < 1e-5),
        `${id} visible deck moved its source endpoint (${endpoint.x}, ${endpoint.z})`);
    }
  }
});

test('visible road surface follows the same sampled top elevation as navigation', () => {
  const { group } = createZhouzhuangModel();
  const water=createWaterQuery(layout);
  group.updateMatrixWorld(true);
  for (const road of layout.roads) {
    const surface = group.getObjectByName(`road-surface-${road.id}`);
    assert.ok(surface?.isMesh, `missing visible surface for ${road.id}`);
    const vertices = worldVertices(surface);
    for (const sample of road.points) {
      if (road.kind!=='bridge' && water.contains(sample.x,sample.z)) continue;
      assert.ok(vertices.some((vertex) => Math.hypot(vertex.x - sample.x, vertex.z - sample.z) < 2e-4
        && Math.abs(vertex.y - sample.y) < 1e-5),
      `road ${road.id} does not expose navigation sample (${sample.x}, ${sample.y}, ${sample.z})`);
    }
    for (let index = 1; index < road.points.length; index += 1) {
      const midpoint = segmentMidpoint(road.points[index - 1], road.points[index]);
      const hits = new THREE.Raycaster(
        new THREE.Vector3(midpoint.x, midpoint.y + 4, midpoint.z),
        new THREE.Vector3(0, -1, 0), 0, 8,
      ).intersectObject(surface, false);
      if (road.kind!=='bridge' && water.contains(midpoint.x,midpoint.z)) {
        if (water.signedDistance(midpoint.x,midpoint.z)<-0.5) assert.equal(hits.length,0,'a street must not float across unconfirmed water');
        continue;
      }
      assert.ok(hits.length > 0, `road ${road.id} has a gap between samples ${index - 1} and ${index}`);
      assert.ok(Math.abs(hits[0].point.y - midpoint.y) < 1e-4,
        `road ${road.id} visible top diverges from navigation height`);
    }
  }
});

test('arch and beam structures leave a real open water passage', () => {
  const { group } = createZhouzhuangModel();
  group.updateMatrixWorld(true);
  for (const [id] of BRIDGES) {
    const bridge = layout.bridges.find((entry) => String(entry.roadId) === id);
    const road = roadForBridge(bridge);
    const first = road.points[0];
    const last = road.points.at(-1);
    const centre = segmentMidpoint(first, last);
    const tangent = new THREE.Vector2(last.x - first.x, last.z - first.z).normalize();
    const normal = new THREE.Vector3(-tangent.y, 0, tangent.x);
    const structure = group.getObjectByName(`bridge-${id}`);
    const ray = new THREE.Raycaster(
      new THREE.Vector3(centre.x, 0.82, centre.z).addScaledVector(normal, -bridge.width),
      normal, 0, bridge.width * 2,
    );
    const blocked = ray.intersectObject(structure, true)
      .filter((hit) => hit.object.userData.blocksUnderpass !== false);
    assert.equal(blocked.length, 0, `${id} seals its water opening with solid geometry`);

    const waterHits = new THREE.Raycaster(
      new THREE.Vector3(centre.x, 1, centre.z), new THREE.Vector3(0, -1, 0), 0, 2,
    ).intersectObjects(group.getObjectByName('waterways').children, true);
    assert.ok(waterHits.length > 0, `${id} interrupts the water surface below its opening`);
  }
});

test('district has finite close-range architecture within a bounded footprint', () => {
  const { group } = createZhouzhuangModel();
  group.updateMatrixWorld(true);
  let houseCount = 0;
  group.traverse((object) => {
    if (object.userData.kind === 'street-house') houseCount += 1;
    if (!object.geometry) return;
    for (const attribute of Object.values(object.geometry.attributes)) {
      for (const value of attribute.array) assert.ok(Number.isFinite(value), `${object.name} has non-finite geometry`);
    }
  });
  assert.equal(houseCount, housing.houses.length, 'the model must preserve all generated house footprints');
  assert.ok(group.getObjectByName('stone-embankments'), 'district needs continuous stone embankments');
  assert.ok(group.getObjectByName('courtyard-blocks'), 'district needs blocks and courtyards around the routes');
  const bounds = new THREE.Box3().setFromObject(group);
  assert.ok(bounds.max.x - bounds.min.x <= (layout.bounds.maxX - layout.bounds.minX) + 8
    && bounds.max.z - bounds.min.z <= (layout.bounds.maxZ - layout.bounds.minZ) + 8,
    `district footprint is unbounded: ${bounds.getSize(new THREE.Vector3()).toArray()}`);
  assert.ok(bounds.min.y > -2 && bounds.max.y < 18, `district height is unbounded: ${bounds.min.y}..${bounds.max.y}`);
});

test('land supports the streets but leaves the canal water open', () => {
  const model = createZhouzhuangModel();
  const land = model.group.getObjectByName('district-land');
  assert.ok(land, 'street houses must belong to connected land blocks, not isolated floating plots');
  model.group.updateMatrixWorld(true);
  const road = layout.roads.find((item) => item.id === layout.spawn.roadId);
  const p = road.points[1];
  const down = (x,z) => new THREE.Raycaster(new THREE.Vector3(x,3,z),new THREE.Vector3(0,-1,0),0,6).intersectObject(land,true);
  assert.ok(down(p.x,p.z).length, 'street should have a continuous land foundation');
  const canal = layout.channels.find((item) => item.id === 'main-canal-north');
  const mid = canal.points[1];
  assert.equal(down(mid.x,mid.z).filter(hit => hit.point.y > 0).length,0,'land must not fill canal');
  model.dispose();
});

test('dense district exposes real wall obstacles and visible road edges', () => {
  const model = createZhouzhuangModel();
  assert.ok(model.obstacles.length >= 200, `expected house wall obstacles, got ${model.obstacles.length}`);
  assert.ok(model.walkSurfaces.length >= layout.roads.length);
  for (const road of layout.roads) {
    const edge = model.group.getObjectByName(`road-edge-${road.id}`);
    if (road.kind !== 'bridge') assert.ok(edge?.isMesh, `road ${road.id} lacks a visible stone edge`);
  }
  for (const obstacle of model.obstacles) {
    assert.ok(['box', 'polygon', 'circle'].includes(obstacle.type));
    if (obstacle.type === 'box') {
      assert.ok(obstacle.width > 0 && obstacle.depth > 0);
      assert.ok(Number.isFinite(obstacle.x) && Number.isFinite(obstacle.z));
    }
  }
  const sourceHalls=[];
  model.group.traverse(object=>{if(object.userData.kind==='source-building-hall') sourceHalls.push(object);});
  for (const id of ['608673063','608673064']) assert.ok(sourceHalls.some(hall=>hall.userData.sourceWayId===id),`missing source-positioned halls for ${id}`);
  const nav=createNavigation(layout.roads,{...layout,obstacles:model.obstacles});
  const openSide=nav.move(nav.locate(layout.spawn.x,layout.spawn.z),-5,0);
  assert.ok(Math.abs(openSide.x-(layout.spawn.x-5))<1e-5,'visible open ground beside the spawn must allow walking beyond the road centre corridor');
  for (const hall of sourceHalls) {
    const footprint=hall.userData.footprint;
    const obstacle=model.obstacles.find(o=>o.type==='box' && Math.hypot(o.x-footprint.x,o.z-footprint.z)<1e-5);
    assert.ok(obstacle,'a visible source hall must have a wall obstacle');
    assert.equal(obstacle.yaw,hall.rotation.y,'visible and collision footprints must rotate together');
    assert.equal(nav.locate(footprint.x,footprint.z),null,'cannot walk through a visible source hall');
  }
  const knownCrossing=layout.roads.find(road=>road.id==='608669702');
  for (const p of knownCrossing.points) assert.ok(nav.locate(p.x,p.z,knownCrossing.id),'source buildings must leave the mapped bridge unobstructed');
  for (const road of layout.roads) {
    if (road.waterCrossings?.length) continue;
    for (let i=1;i<road.points.length;i++) {
      const a=road.points[i-1],b=road.points[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/2));
      for (let step=0;step<=steps;step++) {
        const t=step/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
        assert.ok(nav.locate(x,z,road.id),`visible source road ${road.id} must remain free of invisible walls at ${x},${z}`);
      }
    }
  }
  model.dispose();
});

test('model disposer releases each shared resource once', () => {
  const model = createZhouzhuangModel();
  const geometries = new Set();
  const materials = new Set();
  model.group.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.filter(Boolean).forEach((material) => materials.add(material));
  });
  const events = [];
  geometries.forEach((resource) => resource.addEventListener('dispose', () => events.push(resource.uuid)));
  materials.forEach((resource) => resource.addEventListener('dispose', () => events.push(resource.uuid)));
  model.dispose();
  model.dispose();
  assert.equal(events.length, geometries.size + materials.size);
  assert.equal(new Set(events).size, events.length, 'a shared geometry or material was disposed more than once');
});
