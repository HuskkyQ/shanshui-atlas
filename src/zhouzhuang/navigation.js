const EPSILON = 1e-6;
const MAX_STEP = 0.2;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function pointForNode(road, nodeIndex) {
  if (road.nodePoints) return road.nodePoints[nodeIndex];
  if (road.nodeIds.length === road.points.length) return road.points[nodeIndex];
  if (nodeIndex === 0) return road.points[0];
  if (nodeIndex === road.nodeIds.length - 1) return road.points.at(-1);
  const pointIndex = Math.round((nodeIndex / (road.nodeIds.length - 1)) * (road.points.length - 1));
  return road.points[pointIndex];
}

function closestSurfacePoint(road, x, z, radius = 0) {
  const usableHalfWidth = road.width / 2 - radius;
  if (usableHalfWidth < -EPSILON || road.points.length < 2) return null;

  let closest = null;
  for (let index = 0; index < road.points.length - 1; index += 1) {
    const start = road.points[index];
    const end = road.points[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared > EPSILON
      ? clamp(((x - start.x) * dx + (z - start.z) * dz) / lengthSquared, 0, 1)
      : 0;
    const centerX = start.x + dx * t;
    const centerZ = start.z + dz * t;
    const offsetX = x - centerX;
    const offsetZ = z - centerZ;
    const distanceSquared = offsetX * offsetX + offsetZ * offsetZ;
    if (!closest || distanceSquared < closest.distanceSquared) {
      closest = {
        distanceSquared,
        y: start.y + (end.y - start.y) * t,
      };
    }
  }

  if (!closest || closest.distanceSquared > (usableHalfWidth + EPSILON) ** 2) return null;
  return { x, y: closest.y, z, roadId: road.id, distanceSquared: closest.distanceSquared };
}

function buildConnections(roads) {
  const occurrences = new Map();
  for (const road of roads) {
    road.nodeIds.forEach((nodeId, index) => {
      if (!occurrences.has(nodeId)) occurrences.set(nodeId, []);
      occurrences.get(nodeId).push({ roadId: road.id, point: pointForNode(road, index) });
    });
  }

  const connections = new Map(roads.map((road) => [road.id, new Map()]));
  for (const entries of occurrences.values()) {
    if (entries.length < 2) continue;
    for (const entry of entries) {
      for (const other of entries) {
        if (other.roadId === entry.roadId) continue;
        const connected = connections.get(entry.roadId);
        if (!connected.has(other.roadId)) connected.set(other.roadId, []);
        connected.get(other.roadId).push(entry.point);
      }
    }
  }
  return connections;
}

function createGroundSampler(roads, { bounds, channels, waterAreas, landPaths, obstacles = [], groundY = 2 }) {
  const water = createWaterQuery({ channels, waterAreas, landPaths });
  const cells = new Map();
  for (const obstacle of obstacles) {
    const span = obstacle.type === 'circle' ? obstacle.radius : obstacle.type === 'polygon'
      ? Math.max(...obstacle.points.map(p=>Math.hypot(p.x-obstacle.points[0].x,p.z-obstacle.points[0].z)))
      : Math.hypot(obstacle.width,obstacle.depth)/2;
    const x = obstacle.x ?? obstacle.points[0].x, z = obstacle.z ?? obstacle.points[0].z;
    for (let ix=Math.floor((x-span-1)/16);ix<=Math.floor((x+span+1)/16);ix++) {
      for (let iz=Math.floor((z-span-1)/16);iz<=Math.floor((z+span+1)/16);iz++) {
        const key=`${ix},${iz}`;
        if (!cells.has(key)) cells.set(key,[]);
        cells.get(key).push(obstacle);
      }
    }
  }

  function blocked(x,z,radius) {
    return (cells.get(`${Math.floor(x/16)},${Math.floor(z/16)}`) || []).some(obstacle => {
      if (obstacle.type === 'circle') return Math.hypot(x-obstacle.x,z-obstacle.z) < obstacle.radius+radius;
      if (obstacle.type === 'polygon') {
        if (pointInPolygon(x,z,obstacle.points)) return true;
        return obstacle.points.some((p,i)=>distanceToSegment(x,z,p,obstacle.points[(i+1)%obstacle.points.length])<radius);
      }
      const c=Math.cos(obstacle.yaw || 0),s=Math.sin(obstacle.yaw || 0);
      const lx=(x-obstacle.x)*c-(z-obstacle.z)*s, lz=(x-obstacle.x)*s+(z-obstacle.z)*c;
      const dx=Math.abs(lx)-obstacle.width/2, dz=Math.abs(lz)-obstacle.depth/2;
      return Math.hypot(Math.max(0,dx),Math.max(0,dz))+Math.min(Math.max(dx,dz),0)<radius;
    });
  }

  return (x,z,radius=0,preferredRoadId) => {
    if (x<bounds.minX+radius || x>bounds.maxX-radius || z<bounds.minZ+radius || z>bounds.maxZ-radius || blocked(x,z,radius)) return null;
    let roadSurface = null;
    const inWater = water.contains(x,z,radius);
    for (const road of roads) {
      if (inWater && road.kind !== 'bridge') continue;
      const point=closestSurfacePoint(road,x,z,radius);
      if (!point) continue;
      if (road.id===preferredRoadId) { roadSurface=point; break; }
      if (!roadSurface || point.distanceSquared<roadSurface.distanceSquared) roadSurface=point;
    }
    if (roadSurface) { delete roadSurface.distanceSquared; return roadSurface; }
    if (inWater) return null;
    return {x,z,y:groundY,roadId:'open-ground'};
  };
}

export function createNavigation(roads, surfaces) {
  const roadList = [...roads];
  const roadsById = new Map(roadList.map((road) => [road.id, road]));
  const connections = buildConnections(roadList);
  const sampleGround = surfaces?.bounds ? createGroundSampler(roadList,surfaces) : null;

  function locate(x, z, preferredRoadId) {
    if (sampleGround) return sampleGround(x,z,0,preferredRoadId);
    if (preferredRoadId && roadsById.has(preferredRoadId)) {
      const preferred = closestSurfacePoint(roadsById.get(preferredRoadId), x, z);
      if (preferred) {
        delete preferred.distanceSquared;
        return preferred;
      }
    }

    let best = null;
    for (const road of roadList) {
      const candidate = closestSurfacePoint(road, x, z);
      if (candidate && (!best || candidate.distanceSquared < best.distanceSquared)) best = candidate;
    }
    if (!best) return null;
    delete best.distanceSquared;
    return best;
  }

  function candidateForMove(current, x, z, radius, stepLength) {
    if (sampleGround) {
      const next=sampleGround(x,z,radius,current.roadId);
      return next && Math.abs(next.y-current.y)<=0.38 ? next : null;
    }
    const currentRoad = roadsById.get(current.roadId);
    if (!currentRoad) return null;

    const sameRoad = closestSurfacePoint(currentRoad, x, z, radius);
    if (sameRoad) return sameRoad;

    let best = null;
    for (const [connectedRoadId, sharedPoints] of connections.get(currentRoad.id) ?? []) {
      const connectedRoad = roadsById.get(connectedRoadId);
      const transitionReach = Math.max(currentRoad.width, connectedRoad.width) / 2 + radius + stepLength;
      const nearConnection = sharedPoints.some((point) => (
        Math.hypot(current.x - point.x, current.z - point.z) <= transitionReach
        || Math.hypot(x - point.x, z - point.z) <= transitionReach
      ));
      if (!nearConnection) continue;
      const candidate = closestSurfacePoint(connectedRoad, x, z, radius);
      if (candidate && (!best || candidate.distanceSquared < best.distanceSquared)) best = candidate;
    }
    return best;
  }

  function move(state, dx, dz, radius = 0.25) {
    if (!state || !Number.isFinite(dx) || !Number.isFinite(dz) || radius < 0) return state;
    const distance = Math.hypot(dx, dz);
    if (distance < EPSILON) return { ...state };

    const startingRoad = roadsById.get(state.roadId);
    if (!sampleGround && !startingRoad) return { ...state };
    let current = sampleGround ? sampleGround(state.x,state.z,radius,state.roadId)
      : closestSurfacePoint(startingRoad, state.x, state.z, radius);
    if (!current) return { ...state };
    const steps = Math.ceil(distance / MAX_STEP);
    const stepX = dx / steps;
    const stepZ = dz / steps;
    const stepLength = distance / steps;

    for (let index = 0; index < steps; index += 1) {
      const direct = candidateForMove(current, current.x + stepX, current.z + stepZ, radius, stepLength);
      if (direct) {
        current = direct;
        continue;
      }

      const slideX = candidateForMove(current, current.x + stepX, current.z, radius, Math.abs(stepX));
      const slideZ = candidateForMove(current, current.x, current.z + stepZ, radius, Math.abs(stepZ));
      if (slideX && slideZ) {
        current = Math.abs(stepX) >= Math.abs(stepZ) ? slideX : slideZ;
      } else if (slideX || slideZ) {
        current = slideX ?? slideZ;
      }
    }

    delete current.distanceSquared;
    return current;
  }

  return { locate, move };
}
import { createWaterQuery, distanceToSegment, pointInPolygon } from './surfaces.js';
