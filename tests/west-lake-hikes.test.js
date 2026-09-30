import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'src/data/west-lake-hikes.json'), 'utf8'));
const bounds = JSON.parse(fs.readFileSync(path.join(root, 'src/data/west-lake-dem.json'), 'utf8'));
const mountainIds = new Set(['baoshi', 'ge', 'beigao', 'nangao', 'wuyun', 'yuhuang']);
const walking = new Set(['footway', 'path', 'pedestrian', 'steps', 'cycleway', 'track']);

const metres = (a, b) => {
  const lat = (a[1] + b[1]) / 2 * Math.PI / 180;
  return Math.hypot((a[1] - b[1]) * 111320, (a[0] - b[0]) * 111320 * Math.cos(lat));
};

test('includes five mountain routes and all six model peaks', () => {
  assert.equal(data.routes.length, 5);
  assert.deepEqual(new Set(data.routes.flatMap(route => route.mountainIds)), mountainIds);
  assert.equal(new Set(data.routes.map(route => route.id)).size, 5);
});

test('entries are snapped to named OSM ways and the ridge route is complete', () => {
  const byId = new Map(data.routes.map(route => [route.id, route]));
  assert.equal(byId.get('baoshi-ge').sourceEntryElement.wayName, '北山街');
  assert.equal(byId.get('beigao').sourceEntryElement.wayName, '北高峰登山道');
  assert.match(byId.get('nangao').sourceEntryElement.wayName, /西山游步道/);
  assert.match(byId.get('wuyun').sourceEntryElement.wayName, /十里琅珰/);
  assert.equal(byId.get('wuyun').sourceEndElement.wayName, '九溪路');
  assert.ok(byId.get('wuyun').mappedLengthMetres >= 4000);
  assert.ok(byId.get('wuyun').via.includes('十里琅珰山脊'));
  for (const name of ['十里琅珰', '万林背山', '五云山横路', '九溪路']) {
    assert.ok(byId.get('wuyun').sourceWayNames.includes(name), name);
  }
  assert.equal(byId.get('nangao').official, null);
  for (const route of data.routes) {
    assert.ok(route.sourceWayNames.length > 0, route.id);
    assert.ok(route.perEdgeWayIds.includes(route.sourceEndElement.wayId), route.id);
  }
});

test('the Jade Emperor line starts at the mapped northern trailhead', () => {
  const route = data.routes.find(candidate => candidate.id === 'yuhuang');
  assert.equal(route.name, '玉皇山登山线');
  assert.equal(route.sourceEntryElement.id, 5029726488);
  assert.equal(route.sourceEntryElement.wayId, '457498261');
  assert.equal(route.sourceEntryElement.wayName, '玉皇山登山道');
  assert.ok(route.perEdgeWayIds.includes('457498261'));
  assert.ok(route.sourceHighways.includes('steps'));
  assert.ok(!route.sourceWayNames.some(name => name.includes('隧道')));
  assert.ok(route.mappedLengthMetres > 1000);
});

test('route points stay inside the DEM bounds and use finite OSM coordinates', () => {
  for (const route of data.routes) {
    assert.ok(route.points.length > 10, route.id);
    for (const [longitude, latitude] of route.points) {
      assert.ok(Number.isFinite(longitude) && Number.isFinite(latitude));
      assert.ok(longitude >= bounds.west && longitude <= bounds.east, `${route.id} longitude`);
      assert.ok(latitude >= bounds.south && latitude <= bounds.north, `${route.id} latitude`);
    }
  }
});

test('provenance arrays describe every rendered edge without synthetic connectors', () => {
  for (const route of data.routes) {
    assert.equal(route.pointNodeIds.length, route.points.length, route.id);
    assert.equal(route.perEdgeWayIds.length, route.points.length - 1, route.id);
    assert.equal(route.sourceEntryElement.id, route.pointNodeIds[0], route.id);
    assert.deepEqual(route.sourceEntryElement.coordinate, route.points[0], route.id);
    assert.equal(route.sourceEndElement.id, route.pointNodeIds.at(-1), route.id);
    assert.equal(route.sourceEndElement.wayId, route.perEdgeWayIds.at(-1), route.id);
    assert.deepEqual(route.sourceEndElement.coordinate, route.points.at(-1), route.id);
    assert.ok(route.sourceWayIds.length > 0, route.id);
    for (const wayId of route.perEdgeWayIds) assert.ok(route.sourceWayIds.includes(wayId));
    assert.ok(route.sourceHighways.some(type => walking.has(type)), route.id);
    assert.ok(route.mixedRoadLengthMetres >= 0, route.id);
    for (const wayId of route.mixedRoadWayIds) assert.ok(route.sourceWayIds.includes(wayId));
  }
});

test('download metadata keeps OSM bounds and replayable API URLs', () => {
  assert.ok(data.source.inputFiles.length >= 10);
  for (const source of data.source.inputFiles) {
    assert.ok(source.bounds && source.url);
    assert.match(source.url, /api\.openstreetmap\.org\/api\/0\.6\/map\?bbox=/);
  }
});

test('mountain and entry snaps remain close enough to mapped public trails', () => {
  for (const [id, distance] of Object.entries(data.mountainSnapMetres)) assert.ok(distance <= 180, `${id}: ${distance}`);
  for (const route of data.routes) {
    assert.ok(route.startSnapMetres <= 220, route.id);
    for (const [id, distance] of Object.entries(route.poiSnapMetres)) assert.ok(distance <= 180, `${route.id}/${id}`);
  }
});

test('successive OSM nodes form connected trail geometry', () => {
  for (const route of data.routes) {
    for (let index = 1; index < route.points.length; index++) {
      assert.ok(metres(route.points[index - 1], route.points[index]) < 250, `${route.id} gap ${index}`);
    }
  }
});
