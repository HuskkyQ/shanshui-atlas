import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDaciModel } from '../src/daci-yan/model.js';
import { DACI_LAYOUT, cliffFaceZ } from '../src/daci-yan/layout.js';

function triangles(object) { let n = 0; object.traverse((o) => { if (o.geometry) n += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.getAttribute('position').count / 3; }); return n; }
test('大慈岩模型按崖体优先组合且六处锚点为真实向量', () => {
  const model = createDaciModel();
  assert.equal(model.group.children[0].name, 'building-cliff');
  for (const key of ['cliff', 'main-hall', 'gallery', 'stair', 'gate', 'terrace']) {
    assert.ok(model.anchors[key]);
    const anchor = model.anchors[key];
    assert.ok(anchor.isVector3 && [anchor.x, anchor.y, anchor.z].every(Number.isFinite));
  }
  assert.ok(triangles(model.group) < 140000);
  model.dispose();
});
test('主殿、连续廊道、转折楼梯和下门楼均有几何连接', () => {
  const model = createDaciModel(); const hall = model.group.getObjectByName('building-main-hall'); const gallery = model.group.getObjectByName('building-gallery'); const stair = model.group.getObjectByName('building-stair');
  const hb = new THREE.Box3().setFromObject(hall); const gb = new THREE.Box3().setFromObject(gallery); const sb = new THREE.Box3().setFromObject(stair);
  assert.ok(hb.max.x >= DACI_LAYOUT.gallery.toX - 4 && gb.min.x <= DACI_LAYOUT.gallery.fromX + 1);
  assert.ok(Math.abs(gb.max.x - sb.min.x) < 3.5);
  assert.ok(gb.max.y > sb.max.y && sb.min.y <= DACI_LAYOUT.stair[2].y + 1.5);
  model.dispose();
});
test('主要 flight 的踏步是连续实心水平面且端部有 landing', () => {
  const model = createDaciModel();
  const prefixes = [
    ['hall-access', 'building-gallery'],
    ['terrace-access', 'building-terrace'],
    ...Array.from({ length: 7 }, (_, i) => [`cliff-stair-${i}`, 'building-stair']),
  ];
  for (const [prefix, partName] of prefixes) {
    const part = model.group.getObjectByName(partName);
    const treads = part.children.filter((object) => object.name.startsWith(`${prefix}-tread-`));
    const landings = part.children.filter((object) => object.name.startsWith(`${prefix}-landing-`));
    assert.ok(treads.length >= 2, `${prefix} has enough treads`);
    assert.equal(landings.length, 2, `${prefix} has two endpoint landings`);
    for (const tread of treads) {
      assert.ok(tread.userData.walkingTop !== undefined, `${tread.name} exposes walking top`);
      const bounds = new THREE.Box3().setFromObject(tread);
      assert.ok(Math.abs(bounds.max.y - tread.userData.walkingTop) < 1e-5, `${tread.name} reaches walking top`);
      assert.ok(tread.geometry.parameters.height >= .22, `${tread.name} has a solid tread or riser body`);
    }
    for (let i = 1; i < treads.length; i++) {
      assert.ok(new THREE.Box3().setFromObject(treads[i - 1]).intersectsBox(new THREE.Box3().setFromObject(treads[i])), `${prefix} has no gap at tread ${i}`);
    }
    const first = new THREE.Box3().setFromObject(treads[0]);
    const last = new THREE.Box3().setFromObject(treads.at(-1));
    for (const landing of landings) {
      const bounds = new THREE.Box3().setFromObject(landing);
      assert.ok(bounds.intersectsBox(first) || bounds.intersectsBox(last), `${landing.name} meets a tread`);
    }
  }
  model.dispose();
});
test('覆顶梯廊步行中心不穿崖且每一级上方都有连续屋面', () => {
  const model = createDaciModel();
  const stair = model.group.getObjectByName('building-stair');
  model.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const object of stair.children.filter((o) => /cliff-stair-\d-tread-/.test(o.name))) {
    const top = object.userData.walkingTop;
    const center = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
    assert.ok(center.z - cliffFaceZ(center.x, top + 1) > .9, `${object.name} clears the cliff`);
    ray.set(new THREE.Vector3(center.x, top + 6, center.z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObjects(stair.children.filter((o) => o.name.endsWith('-continuous-cover')), false);
    assert.ok(hits.length && hits[0].point.y - top > 2.5, `${object.name} has overhead clearance and roof coverage`);
  }
  for (const part of model.group.children[1].children) for (const post of part.children.filter((o) => o.name.includes('-support-'))) {
    const half = post.geometry.parameters.height / 2;
    const endpoints = [-half, half].map((y) => post.localToWorld(new THREE.Vector3(0, y, 0))).sort((a, b) => a.y - b.y);
    const foot = endpoints[0];
    assert.ok(foot.z <= cliffFaceZ(foot.x, foot.y) + .05, `${post.name} mounts inside the rock`);
  }
  model.dispose();
});
test('廊道、楼梯、门楼支撑采样存在且下门楼没有中央堵门柱', () => {
  const model = createDaciModel();
  const gallery = model.group.getObjectByName('building-gallery');
  const stair = model.group.getObjectByName('building-stair');
  const gate = model.group.getObjectByName('building-gate');
  assert.ok(gallery.children.filter((object) => object.name.startsWith('gallery-support-')).length >= 5);
  assert.ok(stair.children.some((object) => object.name.startsWith('cliff-stair-0-support-')));
  for (let i = 0; i < 7; i++) assert.ok(stair.children.some((object) => object.name.startsWith(`cliff-stair-${i}-support-`)));
  assert.equal(gate.getObjectByName('gate-post-0'), undefined);
  assert.ok(gate.getObjectByName('gate-exit-landing'));
  assert.ok(gate.children.some((object) => object.name.startsWith('gate-exit-handrail-')));
  model.dispose();
});
test('每根承托的上端实际进入接收楼板或踏步', () => {
  const model = createDaciModel();
  try {
    model.group.updateMatrixWorld(true);
    const receivers = [], supports = [];
    model.group.getObjectByName('daci-architecture').traverse((object) => {
      if (!object.isMesh) return;
      if (/-support-/.test(object.name)) supports.push(object);
      if (/-floor$|-tread-\d+$|^approach-deck-|^gate-side-segment-/.test(object.name)) {
        object.geometry.computeBoundingBox(); receivers.push(object);
      }
    });
    assert.ok(supports.length > 40);
    for (const support of supports) {
      const height = support.geometry.parameters.height;
      const top = [-.5, .5].map((t) => support.localToWorld(new THREE.Vector3(0, height * t, 0))).sort((a, b) => b.y - a.y)[0];
      assert.ok(receivers.some((receiver) => receiver.geometry.boundingBox.clone().expandByScalar(.005)
        .containsPoint(receiver.worldToLocal(top.clone()))), `${support.name} must contact actual deck geometry`);
    }
  } finally { model.dispose(); }
});
test('模型实例资源独立且释放幂等', () => {
  const first = createDaciModel(); const second = createDaciModel();
  assert.notEqual(first.group.getObjectByName('main-hall-floor').geometry, second.group.getObjectByName('main-hall-floor').geometry);
  const events = []; const resources = new Set(); first.group.traverse((o) => { for (const r of [o.geometry, o.material].filter(Boolean)) resources.add(r); });
  resources.forEach((r) => { const e = { n: 0 }; r.addEventListener('dispose', () => { e.n += 1; }); events.push(e); });
  first.dispose(); first.dispose(); assert.ok(events.length > 0 && events.every((e) => e.n === 1)); second.dispose();
});
