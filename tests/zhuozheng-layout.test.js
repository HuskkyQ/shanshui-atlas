import test from 'node:test';
import assert from 'node:assert/strict';
import layout from '../src/data/zhuozheng-layout.json' with { type: 'json' };

const expectedContext = {
  'daishuang-pavilion': '485084799',
  'yiyu-hall': '508113066',
  xiaocanglang: '485084763',
  'lvyi-pavilion': '485084752',
  'linglong-hall': '508113051',
  'xiuqi-pavilion': '508113052',
  'jiashi-pavilion': '508113045',
  'dezhen-pavilion': '508113041',
};
const expectedRoofs = ['508113054', '508113063', '508113048', '508113037'];
const expectedGround = ['508112874', '508112958', '508112961', '508112963', '508139034', '508112892', '508112959', '508139023'];
const expectedWoods = ['508112875', '508112876', '508112877', '508112878', '508112879', '508112880', '508112943', '508112944', '508139018', '508139020', '508139021', '508138988', '508138989', '508138990', '508112947', '508139012',
  '508112887', '508112888', '508112899', '508112900', '508112901', '508112930', '508112941', '508112942', '508112945', '508112946', '508112949', '508112950', '508112951', '508112952', '508112953', '508112962', '508138991', '508138992', '508138993', '508139015', '508139024', '508139025', '508139032', '508139033', '508139035', '508142250'];
const { minX, maxX, minZ, maxZ } = layout.metadata.bounds;

function assertSourcedArea(area) {
  assert.ok(area.outline.length >= 3, `${area.key}: a polygon is required`);
  assert.deepEqual(area.outline[0], area.outline.at(-1), `${area.key}: perimeter is closed`);
  assert.ok(area.source.wgs84.length >= 3, `${area.key}: WGS84 footprint is required`);
  assert.match(area.source.osmId, /^\d+$/, `${area.key}: way id is required`);
  assert.match(area.source.sourceURL, /^https:\/\/api\.openstreetmap\.org\//, `${area.key}: source URL is required`);
  for (const [x, z] of area.outline) {
    assert.ok(x >= minX && x <= maxX && z >= minZ && z <= maxZ, `${area.key}: point escapes crop`);
  }
}

test('retains eight sourced context buildings without adding hotspots', () => {
  assert.deepEqual(Object.fromEntries(layout.contextBuildings.map(({ key, source }) => [key, source.osmId])), expectedContext);
  assert.equal(layout.buildings.length, 7);
  for (const building of layout.contextBuildings) {
    assertSourcedArea(building);
    assert.ok(['pavilion', 'hall'].includes(building.type), building.key);
    assert.equal(building.dimensionsAccuracy, 'artistic-approximation');
    assert.equal(building.position.length, 3);
    assert.ok(building.width > 0 && building.depth > 0);
  }
});

test('keeps every selected roof and ground footprint as its own clipped polygon', () => {
  assert.deepEqual(layout.coveredAreas.map((area) => area.source.osmId), expectedRoofs);
  assert.deepEqual(layout.groundAreas.map((area) => area.source.osmId), expectedGround);
  for (const area of [...layout.coveredAreas, ...layout.groundAreas]) assertSourcedArea(area);
  assert.ok(layout.coveredAreas.some((area) => area.outline.length > 12), 'large concave roof must retain its footprint');
});

test('keeps selected wood clusters separate and sourced', () => {
  assert.deepEqual(layout.vegetationClusters.map((area) => area.source.osmId), expectedWoods);
  for (const cluster of layout.vegetationClusters) assertSourcedArea(cluster);
  assert.equal(new Set(layout.vegetationClusters.map((area) => area.source.osmId)).size, expectedWoods.length);
});
