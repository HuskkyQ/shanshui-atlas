import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createZhouzhuangModel } from '../src/zhouzhuang/model.js';
import { createNavigation } from '../src/zhouzhuang/navigation.js';
import { createWaterQuery, distanceToSegment } from '../src/zhouzhuang/surfaces.js';
import layout from '../src/data/zhouzhuang-layout.json' with { type: 'json' };
import housing from '../src/data/zhouzhuang-housing.json' with { type: 'json' };

const model = createZhouzhuangModel();
const nav = createNavigation(layout.roads, { ...layout, obstacles: model.obstacles });
const water = createWaterQuery(layout);
after(() => model.dispose());

for (const id of ['west-water-access', 'interior-lane-1302689265-1--1-10']) {
  test(`${id} can be walked from its source street to its end`, () => {
    const lane = housing.lanes.find(lane => lane.id === id);
    assert.ok(lane);
    const start = lane.points[0];
    let position = nav.locate(start.x, start.z);
    assert.ok(position && position.roadId !== 'open-ground', 'the entrance must meet a source street');
    for (const target of lane.points.slice(1)) {
      position = nav.move(position, target.x - position.x, target.z - position.z);
      assert.ok(Math.hypot(position.x - target.x, position.z - target.z) < 0.01, 'the walking body must clear the whole route');
    }
  });
}

test('all rendered interior lanes meet a source street and remain dry and unobstructed', () => {
  for (const lane of housing.lanes) {
    const start = lane.points[0];
    assert.ok(layout.roads.some(road => road.points.some((b, i) => i > 0
      && distanceToSegment(start.x, start.z, road.points[i - 1], b) <= road.width / 2 + 0.01)), lane.id);
    for (let i = 1; i < lane.points.length; i++) {
      const a = lane.points[i - 1], b = lane.points[i];
      const length = Math.hypot(b.x - a.x, b.z - a.z), steps = Math.ceil(length);
      const nx = -(b.z - a.z) / length * lane.width / 2, nz = (b.x - a.x) / length * lane.width / 2;
      for (let step = 0; step <= steps; step++) {
        const x = a.x + (b.x - a.x) * step / steps, z = a.z + (b.z - a.z) * step / steps;
        assert.ok([water.signedDistance(x, z), water.signedDistance(x + nx, z + nz), water.signedDistance(x - nx, z - nz)]
          .every(distance => distance > 0.35), `${lane.id} crosses water`);
        assert.ok(nav.locate(x, z), `${lane.id} is obstructed by model geometry`);
      }
    }
  }
});

test('the full walking body can traverse every generated lane', () => {
  for (const lane of housing.lanes) {
    const start = lane.points[0];
    let position = nav.locate(start.x, start.z);
    assert.ok(position, lane.id);
    for (const target of lane.points.slice(1)) {
      position = nav.move(position, target.x - position.x, target.z - position.z, 0.25);
      assert.ok(Math.hypot(position.x - target.x, position.z - target.z) < 0.01,
        `${lane.id} stops before its endpoint`);
    }
  }
});
