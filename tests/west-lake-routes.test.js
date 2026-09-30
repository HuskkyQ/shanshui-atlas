import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const routes = JSON.parse(fs.readFileSync(path.join(root, 'src/data/west-lake-routes.json'), 'utf8'));
const attractions = JSON.parse(fs.readFileSync(path.join(root, 'src/data/west-lake-attractions.json'), 'utf8'));
const dem = JSON.parse(fs.readFileSync(path.join(root, 'src/data/west-lake-dem.json'), 'utf8'));

const stops = ['duanqiao', 'pinghu', 'gushan', 'yuemiao', 'quyuan', 'huagang', 'leifeng', 'liulang'];
const attractionById = new Map(attractions.map((item) => [item.id, item]));
const distance = (a, b) => Math.hypot(
  (a[0] - b[0]) * 111320 * Math.cos((a[1] + b[1]) * Math.PI / 360),
  (a[1] - b[1]) * 111320,
);

test('two OSM routes close at Quyuan and Duanqiao', () => {
  assert.deepEqual(routes.routes.map((route) => route.id), ['north', 'south']);
  const [north, south] = routes.routes;
  assert.deepEqual(north.stops, ['duanqiao', 'pinghu', 'gushan', 'yuemiao', 'quyuan']);
  assert.deepEqual(south.stops, ['quyuan', 'huagang', 'leifeng', 'liulang', 'duanqiao']);
  assert.deepEqual(north.points[0], south.points.at(-1));
  assert.deepEqual(north.points.at(-1), south.points[0]);
  for (const route of routes.routes) {
    assert.ok(route.points.length > 20);
    assert.ok(route.mappedLengthMetres > 2_000);
    assert.ok(route.sourceWayIds.length > 10);
    assert.equal(route.pointNodeIds.length, route.points.length);
    assert.equal(route.perEdgeWayIds.length, route.points.length - 1);
    assert.equal(route.mixedRoadLengthMetres <= route.mappedLengthMetres, true);
    assert.ok(route.points.every(([lon, lat]) => lon >= dem.west && lon <= dem.east && lat >= dem.south && lat <= dem.north));
    assert.ok(route.points.slice(1).every((point, index) => distance(route.points[index], point) < 500), `${route.id} has an oversized geometry gap`);
  }
});

test('route geometry contains real White Causeway and Su Causeway ways', () => {
  const [north, south] = routes.routes;
  assert.ok(north.sourceWayIds.includes('28538286'), 'north route must include OSM White Causeway way');
  assert.ok(south.sourceWayIds.includes('30072131'), 'south route must include OSM Su Causeway way');
  assert.equal(routes.source.geometry, 'OSM walkable ways from the public map API');
  assert.equal(routes.source.provider, 'OpenStreetMap contributors');
  assert.equal(routes.source.tiles.every((tile) => tile.url.includes('api/0.6/map?bbox=')), true);
  assert.ok(!routes.routes.some((route) => route.sourceWayIds.includes('1060403263')), 'ferry relation must not be used');
});

test('eight attractions have unique OSM elements and stay inside the terrain tile', () => {
  assert.deepEqual(attractions.map((item) => item.id), stops);
  assert.equal(new Set(attractions.map((item) => item.osmElement)).size, attractions.length);
  for (const item of attractions) {
    assert.match(item.osm, /^https:\/\/www\.openstreetmap\.org\/(node|way)\/\d+$/);
    assert.ok(item.longitude >= dem.west && item.longitude <= dem.east);
    assert.ok(item.latitude >= dem.south && item.latitude <= dem.north);
    assert.deepEqual(routes.poiSnaps[item.id] !== undefined, true);
    assert.ok(routes.poiSnaps[item.id] <= 130, `${item.id} snap is too far from OSM walking geometry`);
  }
  assert.equal(attractionById.get('leifeng').note.includes('湖岸步道入口'), true);
});
