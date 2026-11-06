import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pointInPolygon, createWaterQuery, distanceToSegment } from '../src/zhouzhuang/surfaces.js';
import layout from '../src/data/zhouzhuang-layout.json' with { type: 'json' };
import housing from '../src/data/zhouzhuang-housing.json' with { type: 'json' };
import landUse from '../src/data/zhouzhuang-landuse.json' with { type: 'json' };

const AREAS = [
  { id: 'A', minX: -100, maxX: 0, minZ: -300, maxZ: -200 },
  { id: 'B', minX: -400, maxX: -300, minZ: -100, maxZ: 0 },
  { id: 'C', minX: 0, maxX: 100, minZ: -100, maxZ: 0 },
];

export function measureInteriorCoverage(data = housing) {
  const water = createWaterQuery(layout);
  return AREAS.map(area => {
    let eligible = 0, covered = 0, maxGap = 0;
    for (let x = area.minX + 5; x < area.maxX; x += 10) for (let z = area.minZ + 5; z < area.maxZ; z += 10) {
      if (!landUse.residential.some(p => pointInPolygon(x, z, p.points))
        || landUse.protected.some(p => pointInPolygon(x, z, p.points))
        || layout.buildingAreas.some(p => pointInPolygon(x, z, p.points)) || water.signedDistance(x, z) < 3) continue;
      let roadDistance = Infinity;
      for (const road of layout.roads) for (let i = 1; i < road.points.length; i++) {
        roadDistance = Math.min(roadDistance, distanceToSegment(x, z, road.points[i - 1], road.points[i]));
      }
      if (roadDistance < 18) continue;
      eligible++;
      let gap = Infinity;
      for (const house of data.houses) gap = Math.min(gap, Math.hypot(house.x - x, house.z - z));
      if (gap <= 14) covered++;
      maxGap = Math.max(maxGap, gap);
    }
    const houses = data.houses.filter(p => p.x >= area.minX && p.x < area.maxX && p.z >= area.minZ && p.z < area.maxZ).length;
    return { ...area, houses, eligible, covered, coverage: eligible ? covered / eligible : 1, maxGap };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = { total: housing.houses.length, lanes: housing.lanes.length, report: measureInteriorCoverage() };
  await writeFile(new URL('../outputs/zhouzhuang-interior-coverage-after.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
