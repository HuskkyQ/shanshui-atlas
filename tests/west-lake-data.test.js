import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

const readData = (name) => readFileSync(new URL(`../src/data/${name}`, import.meta.url));
const metadata = JSON.parse(readData('west-lake-dem.json'));
const shoreline = JSON.parse(readData('west-lake-shore.json'));
const landmarks = JSON.parse(readData('west-lake-landmarks.json'));

test('DEM and lake mask have the documented dimensions and signed elevations', () => {
  const dem = readData('west-lake-dem.bin');
  const mask = readData('west-lake-water.bin');
  assert.equal(dem.length, metadata.width * metadata.height * 2);
  assert.equal(mask.length, metadata.width * metadata.height);
  const elevations = Array.from({ length: metadata.width * metadata.height }, (_, index) => dem.readInt16LE(index * 2) / 10);
  assert.ok(elevations.every(Number.isFinite));
  assert.equal(elevations.reduce((min, value) => Math.min(min, value), Infinity), metadata.minElevation);
  assert.equal(elevations.reduce((max, value) => Math.max(max, value), -Infinity), metadata.maxElevation);
});

test('lake water and six mountain points stay in their geographic regions', () => {
  const mask = readData('west-lake-water.bin');
  const wet = (longitude, latitude) => {
    const x = Math.round((longitude - metadata.west) / (metadata.east - metadata.west) * (metadata.width - 1));
    const z = Math.round((metadata.north - latitude) / (metadata.north - metadata.south) * (metadata.height - 1));
    return mask[z * metadata.width + x];
  };
  assert.equal(wet(120.146, 30.241), 1, 'West Lake water sample');
  assert.equal(wet(120.165, 30.242), 0, 'city sample east of the lake');
  assert.equal(landmarks.length, 6);
  assert.equal(new Set(landmarks.map(({ id }) => id)).size, 6);
  landmarks.forEach(({ longitude, latitude, name }) => {
    assert.ok(longitude > metadata.west && longitude < metadata.east, name);
    assert.ok(latitude > metadata.south && latitude < metadata.north, name);
    assert.equal(wet(longitude, latitude), 0, `${name} must stay on land`);
  });
});

test('lake triangles preserve shoreline area and all island holes', () => {
  const area = (ring) => Math.abs(ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
  shoreline.polygons.forEach(({ outer, holes }) => {
    [outer, ...holes].forEach((ring) => assert.deepEqual(ring[0], ring.at(-1), 'shoreline must close'));
    const points = (ring) => ring.slice(0, -1).map(([lon, lat]) => new THREE.Vector2((lon - 120.1) * 96000, (lat - 30.24) * 111320));
    const contour = points(outer), islands = holes.map(points);
    const shape = new THREE.Shape(contour);
    shape.holes = islands.map((ring) => new THREE.Path(ring));
    const geometry = new THREE.ShapeGeometry(shape);
    const vertices = geometry.getAttribute('position'), indices = geometry.getIndex();
    let actual = 0;
    for (let index = 0; index < indices.count; index += 3) {
      const [a, b, c] = [0, 1, 2].map((offset) => indices.getX(index + offset));
      actual += Math.abs((vertices.getX(b) - vertices.getX(a)) * (vertices.getY(c) - vertices.getY(a))
        - (vertices.getY(b) - vertices.getY(a)) * (vertices.getX(c) - vertices.getX(a))) / 2;
    }
    const expected = area(contour) - islands.reduce((sum, ring) => sum + area(ring), 0);
    assert.ok(Math.abs(actual - expected) / expected < 0.00001, 'triangulation must not fill islands or create extra water');
    geometry.dispose();
  });
});
