import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const references = path.join(root, 'docs/xingping-references');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'src/data/xingping-dem.json'), 'utf8'));
const water = JSON.parse(fs.readFileSync(path.join(root, 'src/data/xingping-water.json'), 'utf8'));

test('every original water-bank and island vertex matches the retained OSM members', {
  skip: !fs.existsSync(references) && 'Local Xingping research snapshots are unavailable',
}, () => {
  const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
  const nodes = new Map(), ways = new Map(), relations = new Map();
  for (const snapshot of water.source.snapshots) {
    const bytes = fs.readFileSync(path.join(references, snapshot.path));
    assert.equal(bytes.length, snapshot.bytes);
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), snapshot.sha256);
    const xml = bytes.toString();
    for (const match of xml.matchAll(/<node\b([^>]*)>/g)) {
      const node = attrs(match[1]); nodes.set(node.id, `${Number(node.lon)},${Number(node.lat)}`);
    }
    for (const match of xml.matchAll(/<way\b([^>]*)>([\s\S]*?)<\/way>/g)) ways.set(attrs(match[1]).id, [...match[2].matchAll(/<nd ref="(\d+)"/g)].map(m => m[1]));
    for (const match of xml.matchAll(/<relation\b([^>]*)>([\s\S]*?)<\/relation>/g)) relations.set(attrs(match[1]).id, [...match[2].matchAll(/<member\b([^>]*)\/>/g)].map(m => attrs(m[1])));
  }
  for (const polygon of water.polygons) {
    for (const role of ['outer', 'inner']) {
      const members = relations.get(polygon.relationId).filter(m => m.type === 'way' && m.role === role);
      const expected = new Set(members.flatMap(m => ways.get(m.ref)).map(id => nodes.get(id)));
      const points = role === 'outer' ? polygon.outer : polygon.holes.flat();
      const actual = new Set(points.map(p => `${p.lon},${p.lat}`));
      assert.deepEqual([...actual].sort(), [...expected].sort(), `${polygon.relationId} ${role}`);
    }
  }
});

test('Xingping DEM metadata and binary use the research window and decimetres', () => {
  assert.equal(metadata.width, 396);
  assert.equal(metadata.height, 216);
  assert.equal(metadata.encoding, 'uint16le-decimetres');
  assert.equal(metadata.source.dataset, 'Copernicus DEM GLO-30');
  assert.ok(metadata.west >= 110.45 && metadata.east <= 110.56);
  assert.ok(metadata.south >= 24.90 && metadata.north <= 24.96);
  const bytes = fs.statSync(path.join(root, 'src/data/xingping-dem.bin')).size;
  assert.equal(bytes, metadata.width * metadata.height * 2);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'src/data/xingping-dem.bin'))).digest('hex');
  assert.equal(hash, '524108431ca9ad42242a19d0b3bd59e2ba2636372827223fb7e0815f5cce21b4');
  const bin = fs.readFileSync(path.join(root, 'src/data/xingping-dem.bin'));
  const values = new Uint16Array(bin.buffer, bin.byteOffset, bin.byteLength / 2);
  assert.equal(Math.min(...values), 1120);
  assert.equal(Math.max(...values), 6257);
  assert.equal(metadata.minElevation, 112);
  assert.equal(metadata.maxElevation, 625.7);
  assert.ok(metadata.rawMaxElevation > metadata.maxElevation);
});

test('Xingping water keeps source polygons, holes, and centerline provenance separate', () => {
  assert.deepEqual(water.polygons.map(p => p.relationId).sort(), ['13773143', '14524060']);
  assert.ok(water.polygons.every(p => p.outer.length >= 4 && Array.isArray(p.holes)));
  assert.equal(water.centerlines[0].points.length, 129);
  assert.equal(water.centerlines[1].points.length, 130);
  assert.deepEqual(water.centerlines[0].points.at(-1), water.centerlines[1].points[0]);
  assert.equal(water.source.retrieved, '2026-10-31');
  assert.deepEqual(water.source.snapshots.map(s => s.retrieved), ['2026-10-23', '2026-10-31', '2026-10-31']);
  assert.equal(water.source.sha256.length, 3);
  assert.ok(water.source.license.includes('ODbL'));
  assert.equal(water.limitations.bathymetry, false);
  assert.equal(water.limitations.normalShoreline, false);
});

test('display water is clipped to the DEM research window and covers upstream/downstream checks', () => {
  const b = metadata;
  for (const polygon of water.displayPolygons) for (const point of [polygon.outer, ...polygon.holes]) for (const p of point) {
    assert.ok(p.lon >= b.west - 1e-9 && p.lon <= b.east + 1e-9);
    assert.ok(p.lat >= b.south - 1e-9 && p.lat <= b.north + 1e-9);
  }
  function inside(pt, ring) {
    let hit = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a.lat > pt.lat) !== (b.lat > pt.lat) && pt.lon < (b.lon-a.lon)*(pt.lat-a.lat)/(b.lat-a.lat)+a.lon) hit = !hit;
    }
    return hit;
  }
  for (const pt of [{ lon: 110.488, lat: 24.938 }, { lon: 110.488, lat: 24.9248 }, { lon: 110.520, lat: 24.920 }]) {
    assert.ok(water.displayPolygons.some(p => inside(pt, p.outer)), `missing water at ${pt.lon},${pt.lat}`);
  }
});
