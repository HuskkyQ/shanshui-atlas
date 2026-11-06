import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const data = JSON.parse(readFileSync(new URL('../src/data/xingping-details.json', import.meta.url)));
const references = new URL('../docs/xingping-references/', import.meta.url);
const cliff = data.cliffs.find(c => c.id === '1087179283');

test('mapped cliff and shoal details retain source metadata and research bounds', () => {
  assert.match(data.source.sha256, /^[a-f0-9]{64}$/);
  assert.equal(data.source.retrieved, '2026-10-23');
  assert.equal(cliff.points.length, 12);
  assert.ok(data.shoals.some(s => s.id === '1316142632' && s.name === '黄布滩'));
  for (const polygon of data.shoals) for (const p of polygon.outer) {
    assert.ok(p.lon >= data.bounds.west && p.lon <= data.bounds.east);
    assert.ok(p.lat >= data.bounds.south && p.lat <= data.bounds.north);
  }
});

test('mapped cliff coordinates match the local OSM snapshot', {
  skip: !existsSync(references) && 'Local Xingping research snapshots are unavailable',
}, () => {
  const xml = readFileSync(new URL('river-osm-map.xml', references));
  assert.equal(data.source.sha256, createHash('sha256').update(xml).digest('hex'));
  for (const point of cliff.points) {
    const node = xml.toString().match(new RegExp(`<node\\b[^>]*id="${point.nodeId}"[^>]*>`))?.[0];
    assert.ok(node);
    assert.equal(Number(node.match(/lon="([^"]+)"/)[1]), point.lon);
    assert.equal(Number(node.match(/lat="([^"]+)"/)[1]), point.lat);
  }
});
