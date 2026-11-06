import { pointInPolygon, createWaterQuery, distanceToSegment } from './surfaces.js';

const STEP = 7.25;
const CELL = 18;

function footprintCorners(house, pad = 0) {
  const c = Math.cos(house.yaw), s = Math.sin(house.yaw);
  return [-1, 1].flatMap(x => [-1, 1].map(z => ({
    x: house.x + (x * (house.width / 2 + pad)) * c + (z * (house.depth / 2 + pad)) * s,
    z: house.z - (x * (house.width / 2 + pad)) * s + (z * (house.depth / 2 + pad)) * c,
  })));
}

function overlaps(a, b) {
  const axes = (h) => [{ x: Math.cos(h.yaw), z: -Math.sin(h.yaw) }, { x: Math.sin(h.yaw), z: Math.cos(h.yaw) }];
  const corners = (h) => footprintCorners(h, 0.18);
  const ac = corners(a), bc = corners(b);
  for (const axis of [...axes(a), ...axes(b)]) {
    const project = (p) => p.x * axis.x + p.z * axis.z;
    const ap = ac.map(project), bp = bc.map(project);
    if (Math.max(...ap) <= Math.min(...bp) || Math.max(...bp) <= Math.min(...ap)) return false;
  }
  return true;
}

function roadIntersectsHouse(house, road) {
  const c = Math.cos(house.yaw), s = Math.sin(house.yaw);
  const local = (p) => ({ x: (p.x - house.x) * c - (p.z - house.z) * s, z: (p.x - house.x) * s + (p.z - house.z) * c });
  const halfX = house.width / 2 + road.width / 2 + 0.35, halfZ = house.depth / 2 + road.width / 2 + 0.35;
  for (let i = 1; i < road.points.length; i += 1) {
    const a = local(road.points[i - 1]), b = local(road.points[i]);
    let low = 0, high = 1;
    for (const [axis, half] of [['x', halfX], ['z', halfZ]]) {
      const delta = b[axis] - a[axis];
      if (Math.abs(delta) < 1e-9) { if (Math.abs(a[axis]) > half) { low = 1; high = 0; } continue; }
      const t1 = (-half - a[axis]) / delta, t2 = (half - a[axis]) / delta;
      low = Math.max(low, Math.min(t1, t2)); high = Math.min(high, Math.max(t1, t2));
    }
    if (low <= high) return true;
  }
  return false;
}

function createHousingValidator(layout, { landUse = {} } = {}) {
  const water = createWaterQuery({ channels: layout.channels, waterAreas: layout.waterAreas, landPaths: layout.landPaths });
  const sourceAreas = [...(layout.buildingAreas || []), ...(layout.landmarks || [])];
  const protectedAreas = [...(landUse.protected || [])];
  const residentialAreas = [...(landUse.residential || [])].filter((area) => ['residential', 'retail'].includes(area.kind));
  const roads = layout.roads || [];
  const inBounds = (p) => p.x >= layout.bounds.minX && p.x <= layout.bounds.maxX && p.z >= layout.bounds.minZ && p.z <= layout.bounds.maxZ;
  const clearRoads = (house) => roads.every((road) => !roadIntersectsHouse(house, road));
  const fitsLand = (house) => {
    const c = Math.cos(house.yaw), s = Math.sin(house.yaw);
    const halfWidth = house.width / 2 + 0.25, halfDepth = house.depth / 2 + 0.25;
    const samples = [-1, 0, 1].flatMap(x => [-1, 0, 1].map(z => ({
      x: house.x + x * halfWidth * c + z * halfDepth * s,
      z: house.z - x * halfWidth * s + z * halfDepth * c,
    })));
    const residential = house.role !== 'interior' || (residentialAreas.length > 0 && samples.every((p) => residentialAreas.some((area) => pointInPolygon(p.x, p.z, area.points || []))));
    return samples.every(inBounds)
      && samples.every((p) => water.signedDistance(p.x, p.z) > 0.35)
      && !sourceAreas.some((area) => samples.some((p) => pointInPolygon(p.x, p.z, area.points || [])))
      && !protectedAreas.some((area) => samples.some((p) => pointInPolygon(p.x, p.z, area.points || [])))
      && residential
      && clearRoads(house);
  };
  return { fitsLand, overlaps };
}

function cellKey(x, z) { return `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`; }

export function generateHousingLayout(layout, { landUse = {}, accessLanes = [] } = {}) {
  const { fitsLand, overlaps } = createHousingValidator(layout, { landUse });
  const water = createWaterQuery({ channels: layout.channels, waterAreas: layout.waterAreas, landPaths: layout.landPaths });
  const houses = [], cells = new Map();
  const roads = (layout.roads || []).filter((road) => ['street', 'service', 'residential', 'footway', 'path', 'pedestrian', 'alley'].includes(road.kind) && road.kind !== 'bridge');
  const sourceAreas = [...(layout.buildingAreas || []), ...(layout.landmarks || [])];
  const plannedEntries = [];
  const residentialAt = (point) => (landUse.residential || []).some((area) =>
    ['residential', 'retail'].includes(area.kind) && pointInPolygon(point.x, point.z, area.points || []));
  const lanePointIsClear = (point) => point.x >= layout.bounds.minX + 0.25 && point.x <= layout.bounds.maxX - 0.25
    && point.z >= layout.bounds.minZ + 0.25 && point.z <= layout.bounds.maxZ - 0.25
    && water.signedDistance(point.x, point.z) > 0.35
    && !sourceAreas.some((area) => pointInPolygon(point.x, point.z, area.points || []))
    && !(landUse.protected || []).some((area) => pointInPolygon(point.x, point.z, area.points || []));
  for (const guide of accessLanes) {
    const points = [guide.points[0]];
    for (let i = 1; i < guide.points.length; i += 1) {
      const a = guide.points[i - 1], b = guide.points[i];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.ceil(length);
      for (let step = 1; step <= steps; step += 1) points.push({
        x: a.x + (b.x - a.x) * step / steps, z: a.z + (b.z - a.z) * step / steps, y: 2.03,
      });
    }
    const clear = points.every((point, i) => {
      const next = points[Math.min(i + 1, points.length - 1)], previous = points[Math.max(0, i - 1)];
      const dx = next.x - previous.x, dz = next.z - previous.z, length = Math.hypot(dx, dz) || 1;
      return [point, { x: point.x - dz / length, z: point.z + dx / length }, { x: point.x + dz / length, z: point.z - dx / length }]
        .every(sample => lanePointIsClear(sample) && residentialAt(sample));
    });
    if (clear) plannedEntries.push({ ...guide, width: 2, points, accuracy: 'artistic-approximation' });
  }
  // Reserve the full interior route before frontage houses can seal its entrance.
  if ((landUse.residential || []).length > 0) for (const road of roads) for (let i = 1; i < road.points.length; i += 1) {
    const a = road.points[i - 1], b = road.points[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 8) continue;
    const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
    for (const side of [-1, 1]) for (let t = Math.min(length / 2, 10); t < length - 2; t += 28) {
      const origin = { x: a.x + ux * t, z: a.z + uz * t, y: 2.03 };
      const dx = -uz * side, dz = ux * side;
      if (plannedEntries.some((entry) => {
        const p = entry.points[0], end = entry.points[1];
        const ex = end.x - p.x, ez = end.z - p.z;
        return Math.hypot(p.x - origin.x, p.z - origin.z) < 22
          && (ex * dx + ez * dz) / Math.hypot(ex, ez) > 0.7;
      })) continue;
      if (!residentialAt({ x: origin.x + dx * 10, z: origin.z + dz * 10 })) continue;
      const points = [origin];
      for (let distance = 1; distance <= 160; distance += 1) {
        const point = { x: origin.x + dx * distance, z: origin.z + dz * distance, y: 2.03 };
        if (![point, { x: point.x - dz, z: point.z + dx }, { x: point.x + dz, z: point.z - dx }]
          .every((sample) => lanePointIsClear(sample) && (distance < 4 || residentialAt(sample)))) break;
        points.push(point);
        if (distance > road.width / 2 + 4 && roads.some((other) => other.id !== road.id
          && other.points.some((end, index) => index > 0
            && distanceToSegment(point.x, point.z, other.points[index - 1], end) <= other.width / 2))) break;
      }
      if (points.length >= 12) plannedEntries.push({ id: `interior-lane-${road.id}-${i}-${side}-${Math.round(t)}`, width: 2,
        points, accuracy: 'artistic-approximation' });
    }
  }
  const placedNear = (house) => {
    const [cx, cz] = cellKey(house.x, house.z).split(',').map(Number);
    const result = [];
    for (let x = cx - 1; x <= cx + 1; x += 1) for (let z = cz - 1; z <= cz + 1; z += 1) result.push(...(cells.get(`${x},${z}`) || []));
    return result;
  };
  const add = (house) => {
    if (plannedEntries.some((entry) => roadIntersectsHouse(house, entry))
      || !fitsLand(house) || placedNear(house).some((other) => overlaps(house, other))) return false;
    houses.push(house);
    const key = cellKey(house.x, house.z);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(house);
    return true;
  };
  let serial = 0;
  const laneCandidates = [...plannedEntries];
  for (const road of roads) for (let i = 1; i < road.points.length; i += 1) {
    const a = road.points[i - 1], b = road.points[i];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 8) continue;
    const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
    for (const side of [-1, 1]) {
      const yaw = Math.atan2(side * uz, -side * ux);
      let frontageIndex = 0;
      for (let t = 3.6; t < length - 2.4; t += STEP) {
        const width = 6.1 + (serial % 3) * 0.3;
        const depth = 5.2 + (serial % 2) * 0.35;
        const offset = side * (road.width / 2 + depth / 2 + 0.38);
        const x = a.x + ux * t - uz * offset, z = a.z + uz * t + ux * offset;
        const plotId = `${road.id}:${i}:${side > 0 ? 'r' : 'l'}:${Math.floor(t / STEP)}`;
        if (add({ x, z, width, depth, yaw, storeys: serial++ % 5 === 0 ? 1 : 2, plotId, role: 'frontage' })) {
          // Rear rooms use a perpendicular offset only for occasional plots, leaving a legible courtyard/lane gap.
          if (frontageIndex % 3 === 2) {
            const rearOffset = side * (road.width / 2 + depth + 5.1);
            add({ x: a.x + ux * (t + 1.2) - uz * rearOffset, z: a.z + uz * (t + 1.2) + ux * rearOffset,
              width: 5.0, depth: 4.4, yaw, storeys: 1,
              plotId, role: 'rear' });
          }
          if (frontageIndex % 5 === 4 && plannedEntries.length === 0) {
            const laneT = t + STEP / 2 + 1.1;
            const laneOffset = (distance) => side * (road.width / 2 + distance);
            laneCandidates.push({ id: `lane-${plotId}`, width: 2, points: [
              { x: a.x + ux * laneT - uz * laneOffset(0), z: a.z + uz * laneT + ux * laneOffset(0), y: 2.03 },
              { x: a.x + ux * laneT - uz * laneOffset(depth / 2 + 1.2), z: a.z + uz * laneT + ux * laneOffset(depth / 2 + 1.2), y: 2.03 },
              { x: a.x + ux * laneT - uz * laneOffset(depth / 2 + 5.3), z: a.z + uz * laneT + ux * laneOffset(depth / 2 + 5.3), y: 2.03 },
            ] });
            // Reserve a wider bay between the fifth and sixth frontage plots.
            t += 2.2;
          }
          frontageIndex += 1;
        }
      }
    }
  }
  const lanes = laneCandidates.filter((lane) => {
    const laneRoad = { width: lane.width, points: lane.points };
    if (houses.some((house) => roadIntersectsHouse(house, laneRoad))) return false;
    for (let i = 1; i < lane.points.length; i += 1) {
      const from = lane.points[i - 1], to = lane.points[i];
      const length = Math.hypot(to.x - from.x, to.z - from.z);
      const ux = (to.x - from.x) / Math.max(length, 1e-6), uz = (to.z - from.z) / Math.max(length, 1e-6);
      const nx = -uz * lane.width / 2, nz = ux * lane.width / 2;
      // Match the walker step: a one-metre probe can miss a thin water gap.
      const steps = Math.ceil(length / 0.2);
      for (let step = 0; step <= steps; step += 1) {
        const distance = length * step / steps;
        const x = from.x + ux * distance, z = from.z + uz * distance;
        if (![ { x, z }, { x: x + nx, z: z + nz }, { x: x - nx, z: z - nz } ].every(lanePointIsClear)) return false;
      }
    }
    return true;
  }).map((lane) => ({ ...lane, accuracy: 'artistic-approximation' }));

  const allLanes = lanes;
  const interiorLanes = lanes.filter((lane) => lane.points.length >= 12);
  for (const lane of interiorLanes) {
    for (let i = 6; i < lane.points.length - 1; i += 6) {
      const a = lane.points[i], b = lane.points[i + 1];
      const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const ux = (b.x - a.x) / length, uz = (b.z - a.z) / length;
      for (const side of [-1, 1]) {
        const x = a.x - uz * side * 4.1, z = a.z + ux * side * 4.1;
        const house = { x, z, width: 5.2, depth: 4.5, yaw: Math.atan2(side * uz, -side * ux), storeys: 1, plotId: `${lane.id}:${i}:${side}`, role: 'interior' };
        if (fitsLand(house) && !allLanes.some((other) => roadIntersectsHouse(house, other)) && !placedNear(house).some((other) => overlaps(house, other))) {
          houses.push(house); const key = cellKey(house.x, house.z); if (!cells.has(key)) cells.set(key, []); cells.get(key).push(house);
        }
      }
    }
  }
  return { houses, lanes: allLanes.map((lane) => ({ ...lane, points: lane.points.filter((point, i, points) => {
    if (i === 0 || i === points.length - 1) return true;
    const a = points[i - 1], b = points[i + 1];
    return Math.abs((point.x - a.x) * (b.z - point.z) - (point.z - a.z) * (b.x - point.x)) > 1e-6;
  }) })) };
}

export { createHousingValidator, overlaps, footprintCorners, roadIntersectsHouse };
