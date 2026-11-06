export function distanceToSegment(x, z, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / length)) : 0;
  return Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
}

export function pointInPolygon(x, z, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

const CELL = 32;
const DISTANCE_CAP = 32;

/** The same shoreline field clips visible land and constrains the walker. */
export function createWaterQuery({ channels = [], waterAreas = [], landPaths = [] } = {}) {
  const cells = new Map();
  const add = (segment, padding) => {
    const { a, b } = segment;
    for (let x = Math.floor((Math.min(a.x,b.x)-padding)/CELL); x <= Math.floor((Math.max(a.x,b.x)+padding)/CELL); x++) {
      for (let z = Math.floor((Math.min(a.z,b.z)-padding)/CELL); z <= Math.floor((Math.max(a.z,b.z)+padding)/CELL); z++) {
        const key = `${x},${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(segment);
      }
    }
  };
  for (const channel of channels) for (let i = 1; i < channel.points.length; i++) {
    add({ a:channel.points[i-1], b:channel.points[i], half:channel.width/2 }, channel.width/2+DISTANCE_CAP);
  }
  const areas = waterAreas.map((area, id) => {
    const rings = [area.points, ...(area.holes || [])];
    rings.forEach((ring, ringId) => ring.forEach((a,i) => add({a,b:ring[(i+1)%ring.length],areaId:id,ringId},DISTANCE_CAP)));
    return { ...area, minX:Math.min(...area.points.map(p=>p.x)), maxX:Math.max(...area.points.map(p=>p.x)),
      minZ:Math.min(...area.points.map(p=>p.z)), maxZ:Math.max(...area.points.map(p=>p.z)) };
  });
  for (const path of landPaths) for (let i=1;i<path.points.length;i++) {
    add({a:path.points[i-1],b:path.points[i],bankHalf:path.width/2},path.width/2+DISTANCE_CAP);
  }

  function signedDistance(x, z) {
    let result = DISTANCE_CAP;
    let bankDistance = -DISTANCE_CAP;
    const ringDistances = new Map();
    for (const segment of cells.get(`${Math.floor(x/CELL)},${Math.floor(z/CELL)}`) || []) {
      const distance = distanceToSegment(x,z,segment.a,segment.b);
      if (segment.bankHalf !== undefined) bankDistance=Math.max(bankDistance,segment.bankHalf-distance);
      else if (segment.areaId === undefined) result = Math.min(result,distance-segment.half);
      else {
        const key = `${segment.areaId},${segment.ringId}`;
        ringDistances.set(key,Math.min(ringDistances.get(key) ?? DISTANCE_CAP,distance));
      }
    }
    areas.forEach((area,id) => {
      if (x<area.minX-DISTANCE_CAP || x>area.maxX+DISTANCE_CAP || z<area.minZ-DISTANCE_CAP || z>area.maxZ+DISTANCE_CAP) return;
      let distance = (pointInPolygon(x,z,area.points) ? -1 : 1) * (ringDistances.get(`${id},0`) ?? DISTANCE_CAP);
      (area.holes || []).forEach((ring,i) => {
        const hole = (pointInPolygon(x,z,ring) ? 1 : -1) * (ringDistances.get(`${id},${i+1}`) ?? DISTANCE_CAP);
        distance = Math.max(distance,hole);
      });
      result = Math.min(result,distance);
    });
    return Math.max(result,bankDistance);
  }
  return { signedDistance, contains:(x,z,margin=0) => signedDistance(x,z) <= margin };
}
