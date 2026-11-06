import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import layout from '../src/data/zhouzhuang-layout.json' with { type: 'json' };
import landUse from '../src/data/zhouzhuang-landuse.json' with { type: 'json' };
import { generateHousingLayout } from '../src/zhouzhuang/housing-layout.js';

// This unmeasured access lane follows dry land around the western water channels.
// It connects to source street 1058424492; it is not claimed as a mapped street.
const westStreet = layout.roads.find(road => road.id === '1058424492');
const a = westStreet.points[1], b = westStreet.points[2];
const x = -456, t = (x - a.x) / (b.x - a.x);
const accessLanes = [{ id: 'west-water-access', sourceRoadId: westStreet.id, points: [
  { x, z: a.z + (b.z - a.z) * t, y: 2.03 }, { x, z: -84, y: 2.03 }, { x: -344, z: -84, y: 2.03 },
] }];
const result = generateHousingLayout(layout, { landUse, accessLanes });
const output = {
  version: 1,
  accuracy: 'artistic-approximation',
  source: 'OSM-derived Zhouzhuang road, water and source-building layout',
  sourceLayoutHash: createHash('sha256').update(JSON.stringify(layout)).digest('hex'),
  sourceLandUseHash: createHash('sha256').update(JSON.stringify(landUse)).digest('hex'),
  houses: result.houses,
  lanes: result.lanes,
};
await writeFile(new URL('../src/data/zhouzhuang-housing.json', import.meta.url), `${JSON.stringify(output)}\n`);
console.log(JSON.stringify({ houses: output.houses.length, sourceLayoutHash: output.sourceLayoutHash }));
