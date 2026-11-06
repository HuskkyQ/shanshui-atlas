import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLand } from '../src/zhouzhuang/land.js';

const materials = { ground: new THREE.MeshBasicMaterial(), stone: new THREE.MeshBasicMaterial() };

test('land preserves a water opening and caches repeated lattice samples', () => {
  let queries = 0;
  const waterQuery = { signedDistance(x, z) { queries += 1; return Math.abs(x - 2) < 0.6 ? -1 : 1; } };
  const land = createLand(materials, waterQuery, { minX: 0, maxX: 4, minZ: 0, maxZ: 4 });
  const surface = land.getObjectByName('land-blocks');
  assert.ok(surface.geometry.getAttribute('position').count > 0);
  assert.ok(queries < 80, `expected cached samples, got ${queries}`);
  land.updateMatrixWorld(true);
  const ray = (x, z) => new THREE.Raycaster(
    new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0), 0, 10,
  ).intersectObject(surface, false);
  assert.equal(ray(2, 2).length, 0, 'water channel center must remain open');
  assert.ok(ray(1, 2).length > 0, 'land west of the channel must have a top surface');
  assert.ok(ray(3, 2).length > 0, 'land east of the channel must have a top surface');
  surface.geometry.dispose();
  land.getObjectByName('stone-embankments').geometry.dispose();
});

test('default land keeps finer nearshore sampling than coarse mode', () => {
  const query = { signedDistance: (x) => Math.abs(x - 8) < 1 ? -1 : 1 };
  const fine = createLand(materials, query, { minX: 0, maxX: 16, minZ: 0, maxZ: 16 });
  const coarse = createLand(materials, query, { minX: 0, maxX: 16, minZ: 0, maxZ: 16 }, { coarse: true });
  const fineCount = fine.getObjectByName('land-blocks').geometry.getAttribute('position').count;
  const coarseCount = coarse.getObjectByName('land-blocks').geometry.getAttribute('position').count;
  assert.ok(fineCount > coarseCount, `fine=${fineCount}, coarse=${coarseCount}`);
  fine.traverse((object) => object.geometry?.dispose());
  coarse.traverse((object) => object.geometry?.dispose());
});
