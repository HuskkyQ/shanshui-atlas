import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const dataUrl = (name) => new URL(`../src/data/${name}`, import.meta.url);
const referenceUrl = (name) => new URL(`../docs/changbai-references/${name}`, import.meta.url);
const metadata = JSON.parse(readFileSync(dataUrl('changbai-dem.json')));
const lake = JSON.parse(readFileSync(dataUrl('changbai-lake.json')));
const skipSourceCheck = !existsSync(referenceUrl('')) && 'Local Changbai research snapshots are unavailable';

const EXPECTED_TILE_IDS = [
  'N41_00_E127_00',
  'N41_00_E128_00',
  'N42_00_E127_00',
  'N42_00_E128_00',
];

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const attributes = (tag) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1], match[2]]));

function parseLakeRing(xml) {
  const nodes = new Map([...xml.matchAll(/<node\b[^>]*\/>/g)].map((match) => {
    const node = attributes(match[0]);
    return [node.id, { lon: Number(node.lon), lat: Number(node.lat) }];
  }));
  const ways = new Map([...xml.matchAll(/<way\b[^>]*>[\s\S]*?<\/way>/g)].map((match) => {
    const way = attributes(match[0]);
    return [way.id, [...match[0].matchAll(/<nd ref="(\d+)"\/>/g)].map((nodeMatch) => nodeMatch[1])];
  }));
  const relation = xml.match(/<relation\b[^>]*id="11650508"[^>]*>[\s\S]*?<\/relation>/)?.[0];
  assert.ok(relation, 'OSM snapshot must contain relation 11650508');
  const memberIds = [...relation.matchAll(/<member type="way" ref="(\d+)" role="outer"\/>/g)].map((match) => match[1]);
  assert.deepEqual(memberIds.map(Number), [849712562, 30769571]);

  const remaining = memberIds.map((id) => ways.get(id));
  assert.ok(remaining.every(Boolean), 'snapshot must contain both outer ways');
  const ring = [...remaining.shift()];
  while (remaining.length) {
    const end = ring.at(-1);
    const index = remaining.findIndex((way) => way[0] === end || way.at(-1) === end);
    assert.notEqual(index, -1, `outer ways do not join at node ${end}`);
    const way = remaining.splice(index, 1)[0];
    ring.push(...(way[0] === end ? way.slice(1) : way.toReversed().slice(1)));
  }
  assert.equal(ring[0], ring.at(-1), 'source outer ways must form a closed ring');
  return ring.slice(0, -1).map((id) => nodes.get(id));
}

function pointInPolygon(lon, lat, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index++) {
    const a = points[index];
    const b = points[previous];
    if ((a.lat > lat) !== (b.lat > lat)
      && lon < ((b.lon - a.lon) * (lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
  }
  return inside;
}

test('Changbai DEM is the exact four-tile GLO-30 crop with no nodata samples', () => {
  const dem = readFileSync(dataUrl('changbai-dem.bin'));
  assert.equal(metadata.width, 576);
  assert.equal(metadata.height, 540);
  assert.equal(metadata.unit, 'decimetres, unsigned 16-bit little-endian');
  assert.equal(dem.length, metadata.width * metadata.height * 2);
  assert.ok(Math.abs(metadata.west - 127.9901388888889) < 1e-12);
  assert.ok(Math.abs(metadata.east - 128.1498611111111) < 1e-12);
  assert.ok(Math.abs(metadata.north - 42.08986111111111) < 1e-12);
  assert.ok(Math.abs(metadata.south - 41.94013888888889) < 1e-12);

  const elevations = Array.from({ length: metadata.width * metadata.height }, (_, index) => dem.readUInt16LE(index * 2) / 10);
  assert.ok(elevations.every((value) => Number.isFinite(value) && value > 0 && value < 9000));
  assert.equal(elevations.reduce((minimum, value) => Math.min(minimum, value), Infinity), metadata.minElevation);
  assert.equal(elevations.reduce((maximum, value) => Math.max(maximum, value), -Infinity), metadata.maxElevation);
  assert.deepEqual(metadata.source.tiles.map(({ id }) => id), EXPECTED_TILE_IDS);
  metadata.source.tiles.forEach(({ url, sha256: digest }) => {
    assert.match(url, /^https:\/\/copernicus-dem-30m\.s3\.amazonaws\.com\//);
    assert.match(digest, /^[a-f0-9]{64}$/);
  });
});

test('lake shoreline records OSM relation 11650508 and stays within the DEM bounds', () => {
  assert.equal(lake.source.osmType, 'relation');
  assert.equal(lake.source.osmId, 11650508);
  assert.equal(lake.source.url, 'https://www.openstreetmap.org/relation/11650508');
  assert.equal(lake.source.snapshotUrl, 'https://api.openstreetmap.org/api/0.6/relation/11650508/full');
  assert.match(lake.source.snapshotSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(lake.source.memberWayIds, [849712562, 30769571]);
  assert.ok(lake.points.length > 100, 'shoreline must retain source detail');
  assert.notDeepEqual(lake.points[0], lake.points.at(-1), 'JSON ring closes implicitly and must not repeat its first point');
  lake.points.forEach(({ lon, lat }) => {
    assert.ok(lon >= metadata.west && lon <= metadata.east);
    assert.ok(lat >= metadata.south && lat <= metadata.north);
  });
});

test('Changbai DEM tile manifest and shoreline match the local snapshots', { skip: skipSourceCheck }, () => {
  const manifest = JSON.parse(readFileSync(referenceUrl('manifest.json')));
  const snapshot = readFileSync(referenceUrl('osm-relation-11650508.xml'));
  assert.deepEqual(metadata.source.tiles, manifest.dem.tiles);
  assert.equal(lake.source.snapshotSha256, sha256(snapshot));
  assert.deepEqual(lake.points, parseLakeRing(snapshot.toString('utf8')));
});

test('documented lake elevation is the median of valid DEM samples inside the real shoreline', () => {
  const dem = readFileSync(dataUrl('changbai-dem.bin'));
  const samples = [];
  for (let row = 0; row < metadata.height; row += 1) {
    const lat = metadata.north - row * (metadata.north - metadata.south) / (metadata.height - 1);
    for (let column = 0; column < metadata.width; column += 1) {
      const lon = metadata.west + column * (metadata.east - metadata.west) / (metadata.width - 1);
      if (pointInPolygon(lon, lat, lake.points)) samples.push(dem.readUInt16LE((row * metadata.width + column) * 2) / 10);
    }
  }
  assert.ok(samples.length > 1000, 'lake must contain a meaningful set of 30 m samples');
  samples.sort((a, b) => a - b);
  const middle = Math.floor(samples.length / 2);
  const median = samples.length % 2 ? samples[middle] : (samples[middle - 1] + samples[middle]) / 2;
  assert.equal(metadata.lakeElevation, median);
  assert.ok(metadata.maxElevation - metadata.lakeElevation > 400, 'crop must retain the surrounding crater ridge');
});
