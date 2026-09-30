import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const trailheads = JSON.parse(fs.readFileSync(path.join(root, 'src/data/west-lake-trailheads.json'), 'utf8'));
const sights = JSON.parse(fs.readFileSync(path.join(root, 'src/data/west-lake-hill-sights.json'), 'utf8'));
const routes = JSON.parse(fs.readFileSync(path.join(root, 'src/data/west-lake-hikes.json'), 'utf8')).routes;
const dem = JSON.parse(fs.readFileSync(path.join(root, 'src/data/west-lake-dem.json'), 'utf8'));
const water = fs.readFileSync(path.join(root, 'src/data/west-lake-water.bin'));

const distance = (a, b) => {
  const lat = (a.latitude + b.latitude) / 2 * Math.PI / 180;
  return Math.hypot((a.latitude - b.latitude) * 111320, (a.longitude - b.longitude) * 111320 * Math.cos(lat));
};

function landPoint(item) {
  const x = Math.round((item.longitude - dem.west) / (dem.east - dem.west) * (dem.width - 1));
  const y = Math.round((dem.north - item.latitude) / (dem.north - dem.south) * (dem.height - 1));
  return water[y * dem.width + x] === 0;
}

test('has six trailhead elements and nine distinct hill sights', () => {
  assert.equal(trailheads.length, 6);
  assert.ok(sights.length >= 8 && sights.length <= 10);
  assert.equal(new Set(trailheads.map(item => item.id)).size, trailheads.length);
  assert.equal(new Set(sights.map(item => item.id)).size, sights.length);
});

test('all POIs have stable OSM provenance and remain on DEM land', () => {
  for (const item of [...trailheads, ...sights]) {
    assert.match(item.osmElement, /^(node|way)\/\d+$/, item.id);
    assert.equal(item.osm, `https://www.openstreetmap.org/${item.osmElement}`, item.id);
    assert.ok(item.sourceName, item.id);
    assert.ok(Number.isFinite(item.longitude) && Number.isFinite(item.latitude), item.id);
    assert.ok(item.longitude >= dem.west && item.longitude <= dem.east, item.id);
    assert.ok(item.latitude >= dem.south && item.latitude <= dem.north, item.id);
    assert.ok(landPoint(item), `${item.id} fell on the water mask`);
  }
});

test('trailheads are attached to routes and source ways are readable', () => {
  const yuhuang = trailheads.find(item => item.id === 'yuhuang-steps');
  assert.equal(yuhuang.osmElement, 'node/5029726488');
  assert.equal(yuhuang.sourceWayId, '457498261');
  assert.deepEqual([yuhuang.longitude, yuhuang.latitude], routes.find(item => item.id === 'yuhuang').points[0]);
  for (const item of trailheads) {
    assert.ok(item.sourceWayId, item.id);
    assert.ok(item.note, item.id);
    for (const routeId of item.routeIds) {
      const route = routes.find(candidate => candidate.id === routeId);
      assert.ok(route, `${item.id}/${routeId}`);
      const nearest = Math.min(...route.points.map(([longitude, latitude]) => distance(item, { longitude, latitude })));
      assert.ok(nearest < 260, `${item.id} is ${nearest.toFixed(0)}m from ${routeId}`);
    }
  }
});

test('selected sights include distinct named OSM elements and mountain associations', () => {
  const names = new Set(sights.map(item => item.name));
  for (const expected of ['保俶塔', '抱朴道院', '灵隐寺', '龙井泉', '九溪烟树', '烟霞洞', '紫来洞', '福星观', '灵顺寺']) assert.ok(names.has(expected), expected);
  for (const item of sights) {
    assert.equal(item.category, '山间名胜', item.id);
    assert.ok(item.mountainIds.length > 0, item.id);
    assert.ok(item.routeIds.length > 0, item.id);
  }
});
