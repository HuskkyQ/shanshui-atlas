import test from 'node:test';
import assert from 'node:assert/strict';
import { generateHousingLayout } from '../src/zhouzhuang/housing-layout.js';
import sourceLayout from '../src/data/zhouzhuang-layout.json' with { type: 'json' };
import housing from '../src/data/zhouzhuang-housing.json' with { type: 'json' };
import { createHousingValidator, roadIntersectsHouse } from '../src/zhouzhuang/housing-layout.js';
import { pointInPolygon } from '../src/zhouzhuang/surfaces.js';
import landUse from '../src/data/zhouzhuang-landuse.json' with { type: 'json' };

const straight = {
  bounds: { minX: -40, maxX: 40, minZ: -30, maxZ: 30 }, channels: [], waterAreas: [], landPaths: [], buildingAreas: [], landmarks: [],
  roads: [{ id: 'r', kind: 'street', width: 4, points: [{ x: -35, z: 0 }, { x: 35, z: 0 }] }],
};

test('frontage homes form a continuous street edge and face the road', () => {
  const { houses } = generateHousingLayout(straight);
  const fronts = houses.filter((h) => h.role === 'frontage' && h.x < 30);
  assert.ok(fronts.length >= 8);
  assert.ok(fronts.every((h) => Math.abs(Math.cos(h.yaw)) > 0.9));
  const left = fronts.filter((h) => h.z < 0).sort((a, b) => a.x - b.x);
  assert.ok(left.length >= 4);
  assert.ok(left.slice(1).every((h, i) => h.x - left[i].x < 11), 'frontage should not skip multiple plots');
});

test('rear rooms leave a courtyard lane and never occupy the road', () => {
  const { houses, lanes } = generateHousingLayout(straight);
  const rear = houses.filter((h) => h.role === 'rear');
  assert.ok(rear.length > 0);
  assert.ok(rear.every((h) => Math.abs(h.z) > 7));
  assert.ok(houses.every((h) => Math.abs(h.z) > 3.1));
  assert.ok(lanes.length > 0);
});

test('water blocks are not populated', () => {
  const layout = { ...straight, channels: [{ width: 10, points: [{ x: -40, z: 0 }, { x: 40, z: 0 }] }] };
  assert.equal(generateHousingLayout(layout).houses.length, 0);
});

test('generated Zhouzhuang houses avoid sampled source roads and source water/buildings', () => {
  assert.ok(housing.houses.length > 1500);
  const validator = createHousingValidator(sourceLayout, { landUse });
  for (let i = 0; i < housing.houses.length; i += 17) assert.ok(validator.fitsLand(housing.houses[i]), `house ${i} overlaps source geometry`);
  for (let i = 0; i < housing.houses.length; i += 13) {
    assert.ok(sourceLayout.roads.every((road) => !roadIntersectsHouse(housing.houses[i], road)), `house ${i} crosses a source road`);
  }
});

test('residential land use admits deep interior houses only through extended lanes', () => {
  const fixture = { ...straight, roads: [{ ...straight.roads[0], points: [{ x: -35, z: 0 }, { x: 35, z: 0 }] }] };
  const use = { residential: [{ kind: 'residential', points: [{ x: -35, z: -30 }, { x: 35, z: -30 }, { x: 35, z: -3 }, { x: -35, z: -3 }] }], protected: [] };
  const result = generateHousingLayout(fixture, { landUse: use });
  assert.ok(result.lanes.length > 0);
  assert.ok(result.houses.some((house) => house.role === 'interior' && house.z < -20));
  assert.ok(result.houses.every((house) => house.role !== 'interior' || use.residential.every((area) => {
    const c = Math.cos(house.yaw), s = Math.sin(house.yaw);
    return [-1, 0, 1].every((x) => [-1, 0, 1].every((z) => pointInPolygon(house.x + (x * house.width / 2) * c + (z * house.depth / 2) * s, house.z - (x * house.width / 2) * s + (z * house.depth / 2) * c, area.points)));
  })));
});


test('full interior lanes are reserved before frontage houses are placed', () => {
  const fixture = { ...straight, bounds: { minX: -40, maxX: 40, minZ: -140, maxZ: 30 } };
  const use = { residential: [{ kind: 'residential', points: [
    { x: -40, z: -140 }, { x: 40, z: -140 }, { x: 40, z: -2 }, { x: -40, z: -2 },
  ] }], protected: [] };
  const result = generateHousingLayout(fixture, { landUse: use });
  assert.ok(result.lanes.some(lane => lane.points.at(-1).z < -100));
  assert.ok(result.houses.some(house => house.role === 'interior' && house.z < -100));
  assert.ok(result.houses.every(house => result.lanes.every(lane => !roadIntersectsHouse(house, lane))));
});
