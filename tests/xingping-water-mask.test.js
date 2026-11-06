import test from 'node:test';
import assert from 'node:assert/strict';
import { rasterizeWaterMask } from '../src/xingping/water-mask.js';

const ring = (left, top, right, bottom) => [{ x: left, z: top }, { x: right, z: top }, { x: right, z: bottom }, { x: left, z: bottom }];
const bounds = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
test('a narrow river stays continuous independently of the terrain vertex spacing', () => {
  const mask = rasterizeWaterMask([{ outer: ring(4, 0, 6, 10), holes: [] }], bounds, 100, 100);
  for (let row = 0; row < 100; row++) {
    assert.equal(mask[row * 100 + 50], 255);
    assert.equal(mask[row * 100 + 30], 0);
    assert.equal(mask[row * 100 + 70], 0);
  }
});
test('islands remain solid while overlapping mapped water uses union semantics', () => {
  const mask = rasterizeWaterMask([
    { outer: ring(2, 0, 8, 10), holes: [ring(4, 4, 6, 6)] },
    { outer: ring(7, 0, 9, 10), holes: [] },
  ], bounds, 100, 100);
  assert.equal(mask[50 * 100 + 50], 0);
  assert.equal(mask[50 * 100 + 30], 255);
  assert.equal(mask[50 * 100 + 75], 255);
  assert.equal(mask[50 * 100 + 85], 255);
  assert.equal(mask[50 * 100 + 95], 0);
});
