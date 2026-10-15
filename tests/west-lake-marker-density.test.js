import test from 'node:test';
import assert from 'node:assert/strict';
import { selectMapPoints } from '../src/west-lake/marker-density.js';

const points = Array.from({ length: 48 }, (_, index) => ({
  id: `p-${index}`,
  x: (index % 8) * 44,
  y: Math.floor(index / 8) * 44,
  importance: index % 7 === 0 ? 3 : index % 3 === 0 ? 2 : 1,
  previousVisible: index % 5 === 0,
}));

test('zoom tiers reveal progressively more markers within their budgets', () => {
  const far = selectMapPoints(points, 16);
  const mid = selectMapPoints(points, 9);
  const near = selectMapPoints(points, 3);

  assert.equal(far.tier, 'far');
  assert.equal(mid.tier, 'mid');
  assert.equal(near.tier, 'near');
  assert.ok(far.points.length <= 8 && far.points.length < mid.points.length);
  assert.ok(mid.points.length <= 16 && mid.points.length < near.points.length);
  assert.ok(near.points.length <= 36);
  assert.ok(far.points.every(({ importance }) => importance > 1));
});

test('each tier keeps its requested minimum screen spacing', () => {
  for (const [framing, spacing] of [[16, 110], [9, 72], [3, 36]]) {
    const visible = selectMapPoints(points, framing).points;
    for (const point of visible) for (const other of visible) {
      if (point === other) continue;
      const required = spacing * (point.previousVisible || other.previousVisible ? 0.85 : 1);
      assert.ok(Math.hypot(point.x - other.x, point.y - other.y) >= required);
    }
  }
});

test('tier hysteresis avoids flicker around its exit boundaries', () => {
  assert.equal(selectMapPoints(points, 13, 'mid').tier, 'mid');
  assert.equal(selectMapPoints(points, 14.5, 'mid').tier, 'far');
  assert.equal(selectMapPoints(points, 5.5, 'near').tier, 'near');
  assert.equal(selectMapPoints(points, 6.1, 'near').tier, 'mid');
});

test('priority, prior visibility, and source records remain stable', () => {
  const tied = [
    { id: 'late', x: 0, y: 0, importance: 2 },
    { id: 'kept', x: 200, y: 0, importance: 2, previousVisible: true },
    { id: 'early', x: 400, y: 0, importance: 2 },
  ];
  const before = structuredClone(tied);
  assert.deepEqual(selectMapPoints(tied, 16).points.map(({ id }) => id), ['kept', 'late', 'early']);
  assert.deepEqual(tied, before);
});
