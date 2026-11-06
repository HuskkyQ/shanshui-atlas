import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { existsSync, readFileSync } from 'node:fs';
import metadata from '../src/data/xingping-dem.json' with { type: 'json' };
import water from '../src/data/xingping-water.json' with { type: 'json' };
import { buildXingpingModel } from '../src/xingping/model.js';
import { xingpingPOIs, getPOIView } from '../src/xingping/pois.js';

const model = { toWorld: (lon, lat) => new THREE.Vector3((lon - 110.5) * 10000, 4, (24.93 - lat) * 10000), getHeight: () => 0 };
const references = new URL('../docs/xingping-references/', import.meta.url);

test('all six coordinates exactly match their retained public map nodes', {
  skip: !existsSync(references) && 'Local Xingping research snapshots are unavailable',
}, () => {
  const xml = readFileSync(new URL('river-osm-map.xml', references), 'utf8');
  for (const poi of xingpingPOIs) {
    const id = poi.source.url.split('/').at(-1);
    const node = xml.match(new RegExp(`<node\\b[^>]*\\bid="${id}"[^>]*>`))?.[0];
    assert.ok(node, poi.name);
    assert.equal(poi.longitude, Number(node.match(/lon="([^"]+)"/)[1]));
    assert.equal(poi.latitude, Number(node.match(/lat="([^"]+)"/)[1]));
  }
});

test('all six real-terrain cameras have clear approaches and share marker coordinates', () => {
  const bytes = readFileSync(new URL('../src/data/xingping-dem.bin', import.meta.url));
  const terrain = buildXingpingModel({ metadata, water, elevations: Uint16Array.from({ length: bytes.length / 2 }, (_, i) => bytes.readUInt16LE(i * 2)), deferDetail: true });
  for (const poi of xingpingPOIs) {
    const view = getPOIView(terrain, poi);
    const source = terrain.toWorld(poi.longitude, poi.latitude);
    assert.equal(view.target.x, source.x);
    assert.equal(view.target.z, source.z);
    for (let step = 1; step <= 96; step++) {
      const point = new THREE.Vector3().lerpVectors(view.target, view.position, step / 96);
      assert.ok(point.y >= terrain.getHeight(point.x, point.z) + .1, `${poi.name} sight line at ${step}`);
    }
    assert.ok(view.position.equals(getPOIView(terrain, poi).position));
  }
  terrain.dispose();
});

test('Xingping POIs retain their sourced geographic coordinates and distinct meanings', () => {
  assert.equal(xingpingPOIs.length, 6);
  assert.equal(new Set(xingpingPOIs.map(p => p.id)).size, 6);
  for (const poi of xingpingPOIs) {
    assert.ok(poi.longitude >= 110.45 && poi.longitude <= 110.56);
    assert.ok(poi.latitude >= 24.90 && poi.latitude <= 24.96);
    assert.match(poi.source.url, /^https:\/\/www\.openstreetmap\.org\/node\/\d+$/);
  }
  assert.match(xingpingPOIs.find(p => p.id === 'huangbu').description, /观景位置/);
  assert.match(xingpingPOIs.find(p => p.id === 'xingping-town').description, /聚落/);
});

test('POI camera targets source point and remains above sampled terrain', () => {
  for (const poi of xingpingPOIs) {
    const view = getPOIView(model, poi);
    const source = model.toWorld(poi.longitude, poi.latitude);
    assert.equal(view.target.x, source.x); assert.equal(view.target.z, source.z);
    assert.ok(view.target.y > model.getHeight(source.x, source.z));
    for (let step = 1; step <= 48; step += 1) {
      const point = new THREE.Vector3().lerpVectors(view.target, view.position, step / 48);
      assert.ok(point.y >= model.getHeight(point.x, point.z) + .1);
    }
  }
});
