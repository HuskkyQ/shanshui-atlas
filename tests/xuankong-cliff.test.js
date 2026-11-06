import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCliffModel } from '../src/xuankong-si/cliff.js';
import { XUANKONG_LAYOUT, cliffFaceZ, cliffFootY } from '../src/xuankong-si/layout.js';

function triangleCount(object) {
  let count = 0;
  object.traverse((child) => {
    const geometry = child.geometry;
    if (!geometry) return;
    count += geometry.index
      ? geometry.index.count / 3
      : geometry.getAttribute('position').count / 3;
  });
  return count;
}

test('悬空寺共享布局固定一院两楼与长线桥的首版比例', () => {
  assert.deepEqual(XUANKONG_LAYOUT.cliff, { width: 70, height: 65, backZ: -22 });
  assert.deepEqual(XUANKONG_LAYOUT.courtyard, { x: -13.5, width: 10, depth: 3, floorY: 28.5 });
  assert.deepEqual(XUANKONG_LAYOUT.southTower,
    { x: -3, width: 8, depth: 4, floorY: 31.5, floors: 3, storeyHeight: 3 });
  assert.deepEqual(XUANKONG_LAYOUT.northTower,
    { x: 12, width: 7, depth: 4, floorY: 36, floors: 3, storeyHeight: 3 });
  assert.deepEqual(XUANKONG_LAYOUT.bridge,
    { fromX: 1, toX: 9, fromY: 37.5, toY: 39, width: 0.9 });

  const mountingSamples = [
    cliffFaceZ(-7, 31.5), cliffFaceZ(-3, 40), cliffFaceZ(12, 36), cliffFaceZ(15.5, 48),
  ];
  assert.ok(mountingSamples.every((z) => z >= -3 && z <= 0),
    `building mounting face leaves the intended shallow niche: ${mountingSamples}`);
  assert.ok(Math.max(...mountingSamples) - Math.min(...mountingSamples) < 1,
    'worked mounting band changes too abruptly for the rear walls');
});

test('主崖体是有限、封闭且低于预算的实体网格', () => {
  const model = createCliffModel();
  const rock = model.group.getObjectByName('cliff-rock');
  assert.ok(rock?.isMesh);
  assert.equal(rock.userData.closedSolid, true);
  assert.equal(rock.userData.approx, true);
  assert.ok(rock.geometry.index, 'closed cliff should retain indexed shared boundary vertices');

  const position = rock.geometry.getAttribute('position');
  for (const value of position.array) assert.ok(Number.isFinite(value), 'cliff vertex must be finite');
  const index = rock.geometry.index.array;
  const edgeUse = new Map();
  for (let offset = 0; offset < index.length; offset += 3) {
    for (const [from, to] of [
      [index[offset], index[offset + 1]],
      [index[offset + 1], index[offset + 2]],
      [index[offset + 2], index[offset]],
    ]) {
      const key = from < to ? `${from}:${to}` : `${to}:${from}`;
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
    }
  }
  assert.ok([...edgeUse.values()].every((uses) => uses === 2),
    'every cliff-solid edge must belong to exactly two triangles');

  const bounds = new THREE.Box3().setFromObject(rock);
  assert.equal(bounds.min.y, 0);
  assert.equal(bounds.max.y, XUANKONG_LAYOUT.cliff.height);
  assert.equal(bounds.min.z, XUANKONG_LAYOUT.cliff.backZ);
  assert.ok(bounds.max.x - bounds.min.x > 65, 'cliff lost its broad natural silhouette');
  assert.ok(bounds.max.z - bounds.min.z > 20, 'cliff became a suspended thin sheet');
  assert.ok(triangleCount(model.group) < 60000,
    `cliff exceeds its 60k triangle budget: ${triangleCount(model.group)}`);
  model.dispose();
});

test('内凹龛、崖脚和上部挑檐与正面射线采样一致', () => {
  const model = createCliffModel();
  const rock = model.group.getObjectByName('cliff-rock');
  assert.ok(cliffFaceZ(0, 39) < cliffFaceZ(-30, 39) - 2,
    'temple niche should be visibly recessed from the side shoulder');
  assert.ok(cliffFaceZ(0, 0) > 5, 'lower cliff foot should project east under the temple');
  assert.ok(cliffFaceZ(0, 60) > cliffFaceZ(0, 50) + 1,
    'upper rock should form a restrained protective overhang');

  const raycaster = new THREE.Raycaster();
  for (const [x, y] of [[0, 39], [-20, 30], [20, 50], [-8, 44]]) {
    raycaster.set(new THREE.Vector3(x, y, 20), new THREE.Vector3(0, 0, -1));
    const hit = raycaster.intersectObject(rock, false)[0];
    assert.ok(hit, `front ray at ${x},${y} missed the cliff`);
    assert.ok(Math.abs(hit.point.z - cliffFaceZ(x, y)) < 0.2,
      `mesh/profile mismatch at ${x},${y}: ${hit.point.z} vs ${cliffFaceZ(x, y)}`);
  }
  model.dispose();
});

test('岩面层理、顶部轮廓与淡化裂隙保持自然不规整', () => {
  const model = createCliffModel();
  const rock = model.group.getObjectByName('cliff-rock');
  const [gridX, gridY] = rock.geometry.userData.grid;
  const rowSize = gridX + 1;
  const position = rock.geometry.getAttribute('position');
  const middleRowY = Array.from({ length: rowSize }, (_, column) =>
    position.getY(Math.floor(gridY * 0.58) * rowSize + column));
  assert.ok(Math.max(...middleRowY) - Math.min(...middleRowY) > 0.45,
    'rock strata fell back to perfectly level mesh rows');

  const topY = Array.from({ length: rowSize }, (_, column) =>
    position.getY(gridY * rowSize + column));
  assert.equal(Math.max(...topY), XUANKONG_LAYOUT.cliff.height);
  assert.ok(Math.max(...topY) - Math.min(...topY) > 0.65,
    'top shoulder should retain visible chips and height changes');

  const color = rock.geometry.getAttribute('color');
  const frontCount = rowSize * (gridY + 1);
  const brightness = Array.from({ length: frontCount }, (_, index) =>
    color.getX(index) + color.getY(index) + color.getZ(index));
  assert.ok(Math.max(...brightness) - Math.min(...brightness) > 0.1,
    'gray-yellow rock lost its block-weathering color variation');

  const fissures = model.group.getObjectByName('cliff-fissures');
  assert.equal(fissures.children.length, 7);
  assert.ok(fissures.children.every((fissure) => fissure.material.opacity <= 0.42));
  assert.equal(fissures.getObjectByName('cliff-fissure-south-branch').userData.approximation,
    'short-fissure-branch');
  assert.equal(fissures.getObjectByName('cliff-fissure-north-branch').userData.approximation,
    'short-fissure-branch');
  model.dispose();
});

test('前排支柱沿同一岩面函数下探并落在实际崖脚', () => {
  const model = createCliffModel();
  const rock = model.group.getObjectByName('cliff-rock');
  const raycaster = new THREE.Raycaster();
  for (const spec of [XUANKONG_LAYOUT.southTower, XUANKONG_LAYOUT.northTower]) {
    for (const x of [spec.x - spec.width * 0.35, spec.x + spec.width * 0.35]) {
      const z = cliffFaceZ(x, spec.floorY) + spec.depth;
      const footY = cliffFootY(x, z, spec.floorY);
      assert.ok(Number.isFinite(footY), `support at ${x},${z} found no rock`);
      assert.ok(footY < spec.floorY - 10, 'front support should visibly descend below its floor');
      assert.ok(cliffFaceZ(x, footY) >= z - 0.002, 'support foot is still outside the rock');
      assert.ok(cliffFaceZ(x, footY + 0.03) < z + 0.015, 'support extends materially into open air');

      raycaster.set(new THREE.Vector3(x, spec.floorY, z), new THREE.Vector3(0, -1, 0));
      const hit = raycaster.intersectObject(rock, false)
        .find((entry) => entry.point.y < spec.floorY - 0.01);
      assert.ok(hit, `vertical support ray at ${x},${z} missed actual cliff geometry`);
      assert.ok(Math.abs(hit.point.y - footY) < 0.25,
        `support/profile mismatch: mesh ${hit.point.y}, helper ${footY}`);
    }
  }
  model.dispose();
});

test('多实例资源隔离且 dispose 幂等', () => {
  const first = createCliffModel();
  const second = createCliffModel();
  const firstRock = first.group.getObjectByName('cliff-rock');
  const secondRock = second.group.getObjectByName('cliff-rock');
  assert.notEqual(firstRock.geometry, secondRock.geometry);
  assert.notEqual(firstRock.material, secondRock.material);

  const tracked = [];
  first.group.traverse((object) => {
    for (const resource of [object.geometry, ...(Array.isArray(object.material)
      ? object.material : [object.material])]) {
      if (!resource || tracked.some((entry) => entry.resource === resource)) continue;
      let count = 0;
      resource.addEventListener('dispose', () => { count += 1; });
      tracked.push({ resource, count: () => count });
    }
  });
  first.dispose();
  first.dispose();
  assert.ok(tracked.length > 0);
  assert.ok(tracked.every((entry) => entry.count() === 1), 'each owned resource should dispose once');

  assert.ok(secondRock.geometry.getAttribute('position').count > 0,
    'disposing one model must leave the other instance intact');
  second.dispose();
});
