import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createDaciCliffModel } from '../src/daci-yan/cliff.js';
import {
  DACI_LAYOUT, cliffBackX, cliffBackZ, cliffFaceZ, cliffFootY, cliffMeshFrontZ, cliffTopY,
} from '../src/daci-yan/layout.js';

function triangleCount(object) {
  let count = 0;
  object.traverse((child) => {
    if (!child.geometry) return;
    count += child.geometry.index ? child.geometry.index.count / 3
      : child.geometry.getAttribute('position').count / 3;
  });
  return count;
}

test('大慈岩崖体是有限封闭实体且森林独立', () => {
  const model = createDaciCliffModel();
  const rock = model.group.getObjectByName('cliff-rock');
  assert.equal(model.group.name, 'daci-cliff');
  assert.equal(rock.userData.closedSolid, true);
  const positions = rock.geometry.getAttribute('position').array;
  assert.ok([...positions].every(Number.isFinite));
  const index = rock.geometry.index.array;
  const [gridX, gridY] = rock.geometry.userData.grid;
  const layerSize = (gridX + 1) * (gridY + 1);
  const edges = new Map();
  let smallestArea = Infinity;
  for (let i = 0; i < index.length; i += 3) {
    const a3 = new THREE.Vector3().fromBufferAttribute(rock.geometry.getAttribute('position'), index[i]);
    const b3 = new THREE.Vector3().fromBufferAttribute(rock.geometry.getAttribute('position'), index[i + 1]);
    const c3 = new THREE.Vector3().fromBufferAttribute(rock.geometry.getAttribute('position'), index[i + 2]);
    const normal = new THREE.Vector3().subVectors(b3, a3)
      .cross(new THREE.Vector3().subVectors(c3, a3));
    smallestArea = Math.min(smallestArea, normal.lengthSq());
    if (index[i + 2] < layerSize) assert.ok(normal.z > 0, '正面网格法线不得翻转');
    if (index[i] >= layerSize) assert.ok(normal.z < 0, '后坡网格法线不得翻转');
    for (const [a, b] of [[index[i], index[i + 1]], [index[i + 1], index[i + 2]], [index[i + 2], index[i]]]) {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const edge = edges.get(key) ?? { count: 0, winding: 0 };
      edge.count += 1;
      edge.winding += a < b ? 1 : -1;
      edges.set(key, edge);
    }
  }
  assert.ok([...edges.values()].every(({ count, winding }) => count === 2 && winding === 0));
  assert.ok(smallestArea > 1e-8, '封闭山体不得含退化三角形');
  const bounds = new THREE.Box3().setFromObject(rock);
  assert.equal(bounds.min.y, 0);
  assert.ok(bounds.min.z < DACI_LAYOUT.cliff.backFootZ + 1);
  assert.equal(bounds.min.x, DACI_LAYOUT.cliff.minX);
  assert.ok(bounds.max.x > DACI_LAYOUT.cliff.maxX + 3.5, '右侧后山应展开成山肩');
  assert.ok(triangleCount(model.group) < 90000);
  const forest = model.group.getObjectByName('daci-forest');
  assert.ok(forest);
  assert.ok(forest.userData.treeCount > 400);
  assert.ok(forest.userData.backTreeCount >= 80, '后坡应有真实贴面的稀疏植被');
  assert.equal(forest.userData.approachEndShrubCount, 6);
  const canopy = forest.getObjectByName('forest-canopy');
  const matrix = new THREE.Matrix4();
  const center = new THREE.Vector3();
  let rightRidgeShrubs = 0;
  let approachEndCrowns = 0;
  for (let i = 0; i < canopy.count; i += 1) {
    canopy.getMatrixAt(i, matrix);
    center.setFromMatrixPosition(matrix);
    assert.ok(center.y <= cliffTopY(center.x) + 1, '林冠根部不得浮在峰脊上方');
    if (center.x >= 29 && center.x <= 47 && center.y > cliffTopY(center.x) - 13) rightRidgeShrubs += 1;
    if (center.x >= -43.5 && center.x <= -39.5 && center.y >= 23.5 && center.y <= 28.5
      && center.z > cliffFaceZ(center.x, center.y) - 1) approachEndCrowns += 1;
  }
  assert.ok(rightRidgeShrubs >= 24, '右侧裂隙和峰脊应有连续矮灌生长带');
  assert.ok(approachEndCrowns >= 8, '左院台外路线末端应由局部低矮灌丛收口');
  let brightest = 0;
  for (let i = 0; i < canopy.instanceColor.count; i += 1) {
    brightest = Math.max(brightest, canopy.instanceColor.getX(i), canopy.instanceColor.getY(i), canopy.instanceColor.getZ(i));
  }
  assert.ok(brightest < 0.18, '林冠应保持深绿而非浅色浮球');
  model.dispose();
});

test('后山由峰脊向后展开为二维曲面并由真实背面射线命中', () => {
  const model = createDaciCliffModel();
  const rock = model.group.getObjectByName('cliff-rock');
  const raycaster = new THREE.Raycaster();
  for (const [x, ratio] of [[-50, .28], [-18, .48], [18, .3], [44, .55], [65, .25]]) {
    const y = cliffTopY(x) * ratio;
    const worldX = cliffBackX(x, y);
    raycaster.set(new THREE.Vector3(worldX, y, -130), new THREE.Vector3(0, 0, 1));
    const hit = raycaster.intersectObject(rock, false)[0];
    assert.ok(hit, `后向射线应命中 x=${x}, y=${y}`);
    assert.ok(Math.abs(hit.point.z - cliffBackZ(x, y)) < .55,
      `后坡网格应贴合曲面 x=${x}, y=${y}`);
  }
  assert.ok(cliffBackZ(18, cliffTopY(18) * .9) - cliffBackZ(18, 3) > 40,
    '背坡应从山脚连续抬升至峰脊');
  const crossSlope = [-78, -35, 15, 55].map((x) => cliffBackZ(x, cliffTopY(x) * .35));
  assert.ok(Math.max(...crossSlope) - Math.min(...crossSlope) > 20,
    '背坡横向应有谷口、后脊和山肩变化');
  const y = cliffTopY(12) * .48;
  const secondDifference = cliffBackZ(12 - 8, y) - 2 * cliffBackZ(12, y) + cliffBackZ(12 + 8, y);
  assert.ok(Math.abs(secondDifference) > .5, '背坡不能退化成二维倾斜平面');
  assert.ok(cliffBackX(DACI_LAYOUT.cliff.minX, 0) > DACI_LAYOUT.cliff.minX + 6,
    '左侧山脚应内收形成谷口');
  assert.ok(cliffBackX(DACI_LAYOUT.cliff.maxX, 0) > DACI_LAYOUT.cliff.maxX + 3.5,
    '右侧山脚应绕回形成后肩');
  model.dispose();
});

test('正面射线贴合布局剖面且远轮廓形成左低肩、鞍部与右高圆峰', () => {
  const model = createDaciCliffModel();
  const rock = model.group.getObjectByName('cliff-rock');
  const raycaster = new THREE.Raycaster();
  for (const [x, y] of [[-60, 25], [-43, 50], [-30, 33], [-6, 48], [2, 62], [17, 76], [34, 62], [25, 18]]) {
    raycaster.set(new THREE.Vector3(x, y, 40), new THREE.Vector3(0, 0, -1));
    const hit = raycaster.intersectObject(rock, false)[0];
    assert.ok(hit);
    assert.ok(Math.abs(hit.point.z - cliffFaceZ(x, y)) < 0.18);
  }
  const [gridX, gridY] = rock.geometry.userData.grid;
  const rowSize = gridX + 1;
  const position = rock.geometry.getAttribute('position');
  for (let row = 0; row <= gridY; row += 1) {
    for (let column = 0; column <= gridX; column += 1) {
      const x = THREE.MathUtils.lerp(DACI_LAYOUT.cliff.minX, DACI_LAYOUT.cliff.maxX, column / gridX);
      const y = row / gridY * cliffTopY(x);
      const index = row * rowSize + column;
      assert.equal(position.getX(index), Math.fround(x));
      assert.equal(position.getY(index), Math.fround(y));
      assert.equal(position.getZ(index), Math.fround(cliffMeshFrontZ(x, y)));
      if (y <= 50) assert.equal(position.getZ(index), Math.fround(cliffFaceZ(x, y)));
    }
  }
  const top = Array.from({ length: rowSize }, (_, column) => position.getY(gridY * rowSize + column));
  const topZ = Array.from({ length: rowSize }, (_, column) => position.getZ(gridY * rowSize + column));
  const layerSize = rowSize * (gridY + 1);
  const rearTopZ = Array.from({ length: rowSize }, (_, column) => position.getZ(
    layerSize + gridY * rowSize + column,
  ));
  assert.ok(Math.max(...top) - Math.min(...top) > 60);
  assert.ok(Math.max(...topZ) - Math.min(...topZ) > 10,
    '高区前峰脊应形成明显进深弧线，不能继续落在近常数z平面');
  const highSide = top.map((y, index) => [y, topZ[index]]).filter(([y]) => y > 55);
  const meanY = highSide.reduce((sum, [y]) => sum + y, 0) / highSide.length;
  const meanZ = highSide.reduce((sum, [, z]) => sum + z, 0) / highSide.length;
  const slope = highSide.reduce((sum, [y, z]) => sum + (y - meanY) * (z - meanZ), 0)
    / highSide.reduce((sum, [y]) => sum + (y - meanY) ** 2, 0);
  const sideRms = Math.sqrt(highSide.reduce((sum, [y, z]) => (
    sum + (z - (meanZ + slope * (y - meanY))) ** 2
  ), 0) / highSide.length);
  assert.ok(sideRms > 1, '高区峰脊的侧投影应为非共线曲线');
  assert.ok(Math.max(...rearTopZ) - Math.min(...rearTopZ) > 10,
    '后侧峰肩应形成有弧度的退台轮廓，不能与正面顶行重叠成竖直切缝');
  const { minX, maxX } = DACI_LAYOUT.cliff;
  const sampledTop = Array.from({ length: rowSize }, (_, i) => cliffTopY(minX + i * (maxX - minX) / gridX));
  assert.ok(Math.abs(Math.max(...top) - Math.max(...sampledTop)) < 0.01);
  assert.ok(cliffTopY(20) - cliffTopY(-54) > 45, '右侧主峰应明显高于左侧林肩');
  assert.ok(cliffTopY(-31) < cliffTopY(-39) - 6, '左肩与中部山体之间应保留鞍部');
  assert.ok(cliffTopY(-31) < cliffTopY(-23) - 8, '鞍部右侧应重新抬升');
  assert.ok(cliffTopY(20) > cliffTopY(8) + 5 && cliffTopY(20) > cliffTopY(31) + 5,
    '主峰应是宽阔圆峰而非截平山顶');
  assert.ok(cliffFaceZ(20, 5) > 27, '低位林坡应明显向谷侧展开');
  assert.ok(cliffFaceZ(20, cliffTopY(20) - 20) - cliffFaceZ(20, cliffTopY(20) - 0.5) > 25,
    '主峰上部应随高度后收，形成有厚度的前坡和峰脊');
  model.dispose();
});

test('右侧主山真实网格包含多条竖向岩肋和深槽', () => {
  const sections = [62, 76];
  for (const y of sections) {
    const ribA = cliffFaceZ(2, y), cleftA = cliffFaceZ(10, y);
    const ribB = cliffFaceZ(17, y), cleftB = cliffFaceZ(27, y);
    const ribC = cliffFaceZ(34, y);
    assert.ok(ribA - cleftA > 3, `第一岩肋与槽差值不足 y=${y}`);
    assert.ok(ribB - cleftA > 4, `主岩肋与第一槽差值不足 y=${y}`);
    assert.ok(ribB - cleftB > 4, `主岩肋与第二槽差值不足 y=${y}`);
    assert.ok(ribC - cleftB > 3, `右岩肋与第二槽差值不足 y=${y}`);
  }
  const model = createDaciCliffModel();
  const rock = model.group.getObjectByName('cliff-rock');
  const raycaster = new THREE.Raycaster();
  const hitZ = (x, y) => {
    raycaster.set(new THREE.Vector3(x, y, 30), new THREE.Vector3(0, 0, -1));
    return raycaster.intersectObject(rock, false)[0]?.point.z;
  };
  const actual = [2, 10, 17, 27, 34].map((x) => hitZ(x, 62));
  assert.ok(actual.every(Number.isFinite));
  assert.ok(actual[0] - actual[1] > 3 && actual[2] - actual[1] > 4);
  assert.ok(actual[2] - actual[3] > 4 && actual[4] - actual[3] > 3);
  const normal = (x, y) => {
    const dx = 0.2, dy = 0.2;
    return new THREE.Vector3(
      -(cliffFaceZ(x + dx, y) - cliffFaceZ(x - dx, y)) / (2 * dx),
      -(cliffFaceZ(x, y + dy) - cliffFaceZ(x, y - dy)) / (2 * dy), 1,
    ).normalize();
  };
  const normalDots = sections.map((y) => normal(17, y).dot(normal(34, y)));
  assert.ok(normalDots.every((dot) => dot < 0.99));
  model.dispose();
});

test('扩大后的左院岩肩连续，中央斜岩台与门楼仍有独立接岩高度', () => {
  const leftXs = [-48, -42, -36, -30, -24, -18];
  const leftFaces = leftXs.map((x) => cliffFaceZ(x, 32));
  assert.ok(Math.max(...leftFaces) - Math.min(...leftFaces) < 2);
  const model = createDaciCliffModel();
  const rock = model.group.getObjectByName('cliff-rock');
  const raycaster = new THREE.Raycaster();
  const meshFaces = leftXs.map((x) => {
    raycaster.set(new THREE.Vector3(x, 32, 30), new THREE.Vector3(0, 0, -1));
    return raycaster.intersectObject(rock, false)[0]?.point.z;
  });
  assert.ok(meshFaces.every(Number.isFinite));
  assert.ok(meshFaces.every((z, index) => Math.abs(z - leftFaces[index]) < 0.12));
  const leftFeet = leftXs.map((x) => cliffFootY(x, cliffFaceZ(x, 33) + 0.1, 40));
  assert.ok(leftFeet.every((value) => Number.isFinite(value) && value > 31 && value < 34));
  const central = [[-14, 26], [-6, 27], [2, 26]]
    .map(([x, y]) => cliffFootY(x, cliffFaceZ(x, y) + 0.1, 40));
  const gate = cliffFootY(25, cliffFaceZ(25, 17) + 0.1, 30);
  assert.ok(central.every((value) => Number.isFinite(value) && value > 20 && value < 30));
  assert.ok(Number.isFinite(gate) && gate > 14 && gate < 20);
  assert.ok(Math.max(...central) - Math.min(...central) > 0.5);
  model.dispose();
});

test('多实例资源隔离且 dispose 幂等', () => {
  const first = createDaciCliffModel();
  const second = createDaciCliffModel();
  const firstRock = first.group.getObjectByName('cliff-rock');
  const secondRock = second.group.getObjectByName('cliff-rock');
  assert.notEqual(firstRock.geometry, secondRock.geometry);
  assert.notEqual(firstRock.material, secondRock.material);
  const counts = [];
  first.group.traverse((object) => {
    for (const resource of [object.geometry, object.material].flat().filter(Boolean)) {
      const entry = { count: 0 };
      resource.addEventListener('dispose', () => { entry.count += 1; });
      counts.push(entry);
    }
  });
  first.dispose();
  first.dispose();
  assert.ok(counts.length > 0 && counts.every(({ count }) => count === 1));
  second.dispose();
});
