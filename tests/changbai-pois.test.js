import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import metadata from '../src/data/changbai-dem.json' with { type: 'json' };
import lake from '../src/data/changbai-lake.json' with { type: 'json' };
import { buildChangbaiModel } from '../src/changbai/model.js';
import { changbaiPOIs, getPOIView } from '../src/changbai/pois.js';

const references = new URL('../docs/changbai-references/', import.meta.url);
const bytes = await readFile(new URL('../src/data/changbai-dem.bin', import.meta.url));
const model = buildChangbaiModel({ metadata, lake, elevations: Uint16Array.from({ length: bytes.length / 2 }, (_, i) => bytes.readUInt16LE(i * 2)), deferDetail: true });
test.after(() => model.dispose());

test('every listed sight has source coordinates inside the unmodified terrain', () => {
  assert.ok(changbaiPOIs.length >= 4 && changbaiPOIs.length <= 8);
  assert.equal(new Set(changbaiPOIs.map(p => p.id)).size, changbaiPOIs.length);
  for (const poi of changbaiPOIs) {
    assert.ok(poi.longitude >= metadata.west && poi.longitude <= metadata.east, poi.name);
    assert.ok(poi.latitude >= metadata.south && poi.latitude <= metadata.north, poi.name);
    assert.match(poi.source.url, /^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/);
    const point = model.toWorld(poi.longitude, poi.latitude);
    assert.ok(model.peripheralFactor(point.x, point.z) > .999, `${poi.name} must not be moved into the display taper`);
  }
});

test('listed coordinates match the retained public map objects', {
  skip: !existsSync(references) && 'Local Changbai research snapshots are unavailable',
}, async () => {
  const snapshot = JSON.parse(await readFile(new URL('poi-osm-snapshot.json', references), 'utf8'));
  for (const poi of changbaiPOIs) {
    const source = snapshot.points.find(point => point.id === poi.id);
    assert.equal(poi.source.url, source.sourceUrl);
    assert.equal(poi.longitude, source.lon);
    assert.equal(poi.latitude, source.lat);
    if (source.osmType === 'way') {
      const xml = await readFile(new URL(`poi-way-${source.osmId}.xml`, references), 'utf8');
      assert.ok(xml.includes(`<way id="${source.osmId}"`));
      assert.ok(xml.includes(`k="name" v="${poi.name}"`));
      const nodes = [...xml.matchAll(/<node\b([^>]+)>/g)].map(([, attributes]) => ({
        lon: Number(attributes.match(/lon="([^"]+)"/)[1]),
        lat: Number(attributes.match(/lat="([^"]+)"/)[1]),
      }));
      assert.ok(poi.longitude >= Math.min(...nodes.map(p => p.lon)) && poi.longitude <= Math.max(...nodes.map(p => p.lon)), poi.name);
      assert.ok(poi.latitude >= Math.min(...nodes.map(p => p.lat)) && poi.latitude <= Math.max(...nodes.map(p => p.lat)), poi.name);
    } else {
      assert.ok(Math.abs(poi.longitude - lake.points.reduce((sum, p) => sum + p.lon, 0) / lake.points.length) < 1e-12);
      assert.ok(Math.abs(poi.latitude - lake.points.reduce((sum, p) => sum + p.lat, 0) / lake.points.length) < 1e-12);
    }
  }
});

test('sight cameras target their sourced point and keep the terrain below their line of sight', () => {
  for (const poi of changbaiPOIs) {
    const view = getPOIView(model, poi);
    const source = model.toWorld(poi.longitude, poi.latitude);
    assert.ok(Math.abs(view.target.x - source.x) < 1e-9 && Math.abs(view.target.z - source.z) < 1e-9, poi.name);
    assert.ok(view.target.y > model.getHeight(source.x, source.z), poi.name);
    for (let step = 1; step <= 48; step += 1) {
      const point = new THREE.Vector3().lerpVectors(view.target, view.position, step / 48);
      assert.ok(point.y >= model.getHeight(point.x, point.z) + .1, `${poi.name}: sight line enters terrain at ${step}`);
    }
    const viewAgain = getPOIView(model, poi);
    assert.ok(view.position.equals(viewAgain.position), 'view must not accumulate mutable offsets');
  }
});
