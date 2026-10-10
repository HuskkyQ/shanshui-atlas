import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import layout from '../src/data/zhuozheng-layout.json' with { type: 'json' };
import { createZhuozhengGardenModel, pointInRing } from '../src/models/zhuozheng-garden.js';

const keys = ['yuanxiang-hall', 'xuexiang-pavilion', 'hefeng-pavilion', 'xiangzhou', 'xiaofeihong', 'wuzhu-pavilion', 'jianshan-lou'];

test('拙政园模型的七个建筑和锚点可独立定位', () => {
  const model = createZhuozhengGardenModel();
  assert.deepEqual(Object.keys(model.anchors).sort(), [...keys].sort());
  model.group.updateMatrixWorld(true);
  for (const key of keys) {
    const object = model.group.getObjectByName(`building-${key}`);
    assert.ok(object, `${key} has a building group`);
    assert.ok(model.anchors[key].isVector3 && model.anchors[key].toArray().every(Number.isFinite));
    const bounds = new THREE.Box3().setFromObject(object);
    assert.ok(bounds.containsPoint(model.anchors[key].clone().setY(bounds.max.y - 0.4)), `${key} anchor follows its bounds`);
  }
  model.dispose();
});

test('水面使用真实孔洞，土地底座不覆盖池水', () => {
  const model = createZhuozhengGardenModel();
  model.group.updateMatrixWorld(true);
  const water = [];
  model.group.traverse((o) => { if (o.userData?.waterSurface) water.push(o); });
  assert.equal(water.length, layout.ponds.length);
  water.forEach((mesh, i) => {
    assert.equal(mesh.userData.holeCount, layout.ponds[i].holes?.length || 0);
    assert.ok(mesh.geometry.getAttribute('position').count > 0);
  });
  const base = model.group.getObjectByName('central-garden-land-base');
  assert.equal(base.userData.groundWithWaterHoles, true);
  const raycaster = new THREE.Raycaster();
  const interiorPoints = (pond) => {
    const xs = pond.outline.map(([x]) => x), zs = pond.outline.map(([, z]) => z);
    const points = [];
    for (let x = Math.min(...xs); x <= Math.max(...xs) && points.length < 4; x += 2) {
      for (let z = Math.min(...zs); z <= Math.max(...zs) && points.length < 4; z += 2) {
        if (pointInRing(x, z, pond.outline) && !pond.holes.some((hole) => pointInRing(x, z, hole))) points.push([x, z]);
      }
    }
    return points;
  };
  const baseHits = [];
  for (const island of layout.islands) {
    const [cx, cz] = island.outline.reduce(([x, z], [px, pz]) => [x + px, z + pz], [0, 0]).map((v) => v / island.outline.length);
    const points = [[cx, cz], ...island.outline.filter((_, i) => i % 30 === 0).map(([x, z]) => [cx * 0.65 + x * 0.35, cz * 0.65 + z * 0.35])]
      .filter(([x, z]) => pointInRing(x, z, island.outline));
    assert.ok(points.length >= 2, `${island.key} has multiple interior samples`);
    points.forEach(([x, z]) => {
      raycaster.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
      assert.equal(raycaster.intersectObjects(water, false).length, 0, `${island.key} remains a water hole at ${x},${z}`);
      baseHits.push(raycaster.intersectObject(base, false).length);
    });
    assert.ok(baseHits.every((hits) => hits === 0), `${island.key} is absent from the land base`);
  }
  for (const pond of layout.ponds) {
    const samples = interiorPoints(pond);
    assert.ok(samples.length >= 2, `${pond.key} has multiple water samples`);
    for (const [x, z] of samples) {
    const pondMesh = model.group.getObjectByName(`pond-${layout.ponds.indexOf(pond) + 1}-surface`);
    raycaster.set(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0));
    assert.ok(raycaster.intersectObject(pondMesh, false).length > 0, `pond ${pond.key ?? layout.ponds.indexOf(pond)} has water at ${x},${z}`);
    assert.equal(raycaster.intersectObject(base, false).length, 0, `pond ${pond.key ?? layout.ponds.indexOf(pond)} is absent from the land base`);
    }
  }
  model.dispose();
});

test('小飞虹沿数据桥端点方向建立并保留两端', () => {
  const model = createZhuozhengGardenModel();
  const bridge = model.group.getObjectByName('building-xiaofeihong');
  const path = layout.paths.find((p) => p.kind === 'bridge' && p.points.length === 2);
  assert.deepEqual(bridge.userData.endpoints, path.points);
  assert.ok(Number.isFinite(bridge.rotation.y));
  assert.ok(bridge.getObjectByName('xiaofeihong-grey-tile-roof'));
  model.group.updateMatrixWorld(true);
  const halfLength = layout.buildings.find((b) => b.key === 'xiaofeihong').width / 2;
  const worldEnds = [-halfLength, halfLength].map((x) => new THREE.Vector3(x, 0.35, 0).applyMatrix4(bridge.matrixWorld));
  worldEnds.forEach((point, i) => {
    assert.ok(Math.hypot(point.x - path.points[i][0], point.z - path.points[i][1]) < 0.02, `bridge endpoint ${i} follows source geometry`);
  });
  model.dispose();
});

test('屋顶法线朝上，梧竹幽居的月洞保持可穿透', () => {
  const model = createZhuozhengGardenModel();
  model.group.updateMatrixWorld(true);
  model.group.traverse((object) => {
    if (!object.isMesh || !object.name.includes('roof')) return;
    const normals = object.geometry.getAttribute('normal');
    for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) >= -1e-6, `${object.name} has a downward roof normal`);
  });
  const moonWalls = [];
  const moon = model.group.getObjectByName('building-wuzhu-pavilion');
  moon.traverse((object) => { if (object.isMesh && object.name === 'wuzhu-moon-wall') moonWalls.push(object); });
  assert.equal(moonWalls.length, 4);
  const raycaster = new THREE.Raycaster();
  for (const wall of moonWalls) {
    const direction = new THREE.Vector3(0, 0, -1).transformDirection(wall.matrixWorld);
    const center = new THREE.Vector3(0, 1.42, 2).applyMatrix4(wall.matrixWorld);
    raycaster.set(center, direction);
    assert.equal(raycaster.intersectObject(wall, false).length, 0, 'moon opening is clear');
    const solid = new THREE.Vector3(0, 2.8, 2).applyMatrix4(wall.matrixWorld);
    raycaster.set(solid, direction);
    assert.ok(raycaster.intersectObject(wall, false).length > 0, 'wall above opening remains solid');
  }
  model.dispose();
});

test('多实例资源互不共享且 dispose 幂等', () => {
  const a = createZhuozhengGardenModel();
  const b = createZhuozhengGardenModel();
  const aWater = a.group.getObjectByName('pond-1-surface');
  const bWater = b.group.getObjectByName('pond-1-surface');
  assert.notEqual(aWater.geometry, bWater.geometry);
  assert.notEqual(aWater.material, bWater.material);
  const disposeCounts = (model) => {
    const resources = new Set();
    model.group.traverse((object) => {
      if (object.geometry) resources.add(object.geometry);
      for (const material of (Array.isArray(object.material) ? object.material : [object.material])) if (material) resources.add(material);
    });
    return [...resources].map((resource) => {
      let count = 0;
      const dispose = resource.dispose.bind(resource);
      resource.dispose = () => { count += 1; return dispose(); };
      return { resource, get count() { return count; } };
    });
  };
  const aResources = disposeCounts(a), bResources = disposeCounts(b);
  a.dispose(); a.dispose();
  assert.ok(bResources.every(({ count }) => count === 0), 'disposing the first model leaves the second intact');
  b.dispose(); b.dispose();
  assert.ok(aResources.length > 0 && bResources.length > 0);
  assert.ok(aResources.every(({ count }) => count === 1), 'each first model resource is released once');
  assert.ok(bResources.every(({ count }) => count === 1), 'each second model resource is released once');
});

test('所有模型顶点均为有限数', () => {
  const model = createZhuozhengGardenModel();
  model.group.traverse((object) => {
    const position = object.geometry?.getAttribute('position');
    if (!position) return;
    for (const value of position.array) assert.ok(Number.isFinite(value), `${object.name} contains finite geometry`);
  });
  model.dispose();
});
