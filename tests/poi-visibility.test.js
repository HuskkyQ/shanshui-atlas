import test from 'node:test';
import assert from 'node:assert/strict';
import mountainLandmarks from '../src/data/west-lake-landmarks.json' with { type: 'json' };
import originalAttractions from '../src/data/west-lake-attractions.json' with { type: 'json' };
import builtLandmarkData from '../src/data/west-lake-built-landmarks.json' with { type: 'json' };
import trailheads from '../src/data/west-lake-trailheads.json' with { type: 'json' };
import hillSights from '../src/data/west-lake-hill-sights.json' with { type: 'json' };
import { getWestLakeBuiltPOIs } from '../src/west-lake-built-pois.js';
import { isPOIVisible } from '../src/poi-visibility.js';
import { westLakePOIGroups, westLakePOIs } from '../src/west-lake-pois.js';

test('core POIs remain visible at every distance', () => {
  for (const id of ['leifeng', 'lingyin-temple', 'santan']) {
    const poi = westLakePOIs.find((item) => item.id === id);
    assert.equal(poi.importance, 3);
    assert.equal(isPOIVisible({ ...poi, distance: 1_000 }), true);
  }
});

test('regular and detail POIs use their distance limits', () => {
  assert.equal(isPOIVisible({ importance: 2, distance: 45 }), true);
  assert.equal(isPOIVisible({ importance: 2, distance: 45.1 }), false);
  assert.equal(isPOIVisible({ importance: 1, distance: 20 }), true);
  assert.equal(isPOIVisible({ importance: 1, distance: 20.1 }), false);
});

test('previous visibility adds ten percent hysteresis before hiding a POI', () => {
  assert.equal(isPOIVisible({ importance: 2, distance: 49, previousVisible: true }), true);
  assert.equal(isPOIVisible({ importance: 2, distance: 49, previousVisible: false }), false);
  assert.equal(isPOIVisible({ importance: 1, distance: 22.1, previousVisible: true }), false);
});

test('selected and focused POIs remain visible regardless of distance', () => {
  assert.equal(isPOIVisible({ importance: 1, distance: Infinity, selected: true }), true);
  assert.equal(isPOIVisible({ importance: 1, distance: Infinity, focused: true }), true);
});

test('unified POIs keep source locations, unique IDs, and core future-scene links', () => {
  const sourceGroups = {
    mountains: mountainLandmarks,
    attractions: getWestLakeBuiltPOIs(builtLandmarkData, originalAttractions),
    trailheads,
    hillSights,
  };
  for (const [group, source] of Object.entries(sourceGroups)) {
    assert.equal(westLakePOIGroups[group].length, source.length);
    for (const sourcePOI of source) {
      const poi = westLakePOIGroups[group].find((item) => item.id === sourcePOI.id);
      assert.ok(poi);
      assert.equal(poi.longitude, sourcePOI.longitude);
      assert.equal(poi.latitude, sourcePOI.latitude);
    }
  }
  assert.equal(new Set(westLakePOIs.map(({ id }) => id)).size, westLakePOIs.length);
  assert.deepEqual(
    Object.fromEntries(['leifeng', 'lingyin-temple', 'santan'].map((id) => [id, westLakePOIs.find((item) => item.id === id).sceneId])),
    { leifeng: 'leifeng-pagoda', 'lingyin-temple': 'lingyin-temple', santan: 'santanyinyue' },
  );
});
