/** Local display coordinates only: x along cliff, y up, z towards the valley. */
export const DACI_LAYOUT = Object.freeze({
  cliff: Object.freeze({ minX: -90, maxX: 80, width: 170, backZ: -24, backFootZ: -118 }),
  mainHall: Object.freeze({ x: -6, floorY: 36, width: 20, depth: 6, wallHeight: 4.5 }),
  gallery: Object.freeze({ fromX: -17, toX: 8, floorY: 31.5, depth: 3 }),
  terrace: Object.freeze({ x: -29, floorY: 31.8, width: 38, depth: 7 }),
  gate: Object.freeze({ x: 25, floorY: 20, width: 5.2, depth: 4.6 }),
  stair: Object.freeze([{x:8,y:31.5},{x:13,y:30},{x:18,y:27.7},{x:25,y:20}].map(Object.freeze)),
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const g = (value, center, radius) => Math.exp(-(((value - center) / radius) ** 2));
const smooth = (a, b, value) => {
  const t = clamp01((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const band = (value, from, to, feather = 2) => smooth(from - feather, from, value)
  * (1 - smooth(to, to + feather, value));

// Smoothly interpolate the distant-photo skyline without turning every control
// point into a sharp geometric peak.
function ridgeLine(x) {
  const points = [
    [-90, 8], [-84, 18], [-76, 33], [-68, 43], [-62, 49], [-54, 57], [-46, 61], [-39, 68], [-31, 62],
    [-23, 70], [-14, 78], [-4, 90], [8, 102], [20, 108], [31, 104],
    [41, 94], [50, 80], [58, 64], [66, 46], [73, 28], [80, 10],
  ];
  if (x <= points[0][0]) return points[0][1];
  if (x >= points.at(-1)[0]) return points.at(-1)[1];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1];
    if (x > x1) continue;
    const t = smooth(x0, x1, x);
    return y0 + (y1 - y0) * t;
  }
  return points.at(-1)[1];
}

// Low-frequency triangular facets break the large planes. Their scale is
// intentionally broad so the wall does not acquire a regular noise grid.
function facet(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), u = x - ix, v = y - iy;
  const noise = (a, b) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return (n - Math.floor(n)) * 2 - 1;
  };
  const a = noise(ix, iy), b = noise(ix + 1, iy);
  const c = noise(ix, iy + 1), d = noise(ix + 1, iy + 1);
  return u + v < 1
    ? a + (b - a) * u + (c - a) * v
    : d + (c - d) * (1 - u) + (b - d) * (1 - v);
}

export function cliffTopY(x) {
  return ridgeLine(x)
    + 1.2 * g(x, -42, 4.8)
    + 1.6 * g(x, 16, 10)
    - 1.4 * g(x, -31, 5.5);
}

export function cliffFaceZ(x, y) {
  const upper = smooth(46, 68, y);
  const base = 0.35 + 0.55 * smooth(-90, 80, x);
  const broadPlane = 0.7 * facet(x / 9 + y * 0.012, y / 10.5)
    + 0.22 * facet(x / 3.8 - y * 0.008, y / 5.5);

  // The high right massif is split into several broad, drifting buttresses.
  // Their relief strengthens above the temple roofs, leaving the occupied
  // ledges stable while making the upper wall read as a rounded rock mountain.
  const relief = 0.28 + 0.72 * upper;
  const ribA = 3.5 * g(x, -12 + 0.025 * y, 7.8) * relief;
  const ribB = 6.6 * g(x, 2 + 0.035 * y, 6.5) * relief;
  const ribC = 8.3 * g(x, 17 + 0.022 * y, 7.2) * relief;
  const ribD = 5.7 * g(x, 34 + 0.018 * y, 7.8) * relief;
  const cleftA = -2.7 * g(x, -4 + 0.018 * y, 3.7) * (0.45 + 0.55 * upper);
  const cleftB = -4.5 * g(x, 10 + 0.03 * y, 4.1) * (0.4 + 0.6 * upper);
  const cleftC = -3.8 * g(x, 27 + 0.012 * y, 4.5) * (0.45 + 0.55 * upper);

  // A lower left shoulder and two narrow stone spurs frame the forested valley
  // shown at the left of the distant view. They stay behind the enlarged
  // compound rather than forming another forward wall through it.
  const leftMass = 2.1 * g(x, -57 + 0.018 * y, 10) * (0.55 + 0.45 * smooth(20, 55, y));
  const leftSpur = 3.7 * g(x, -43 + 0.02 * y, 3.9) * smooth(34, 52, y);
  const leftSlot = -2.2 * g(x, -35 + 0.012 * y, 4.2) * smooth(36, 58, y);
  const highAlcove = -2.3 * g(x, -8, 14) * g(y, 48, 10);
  const rawWall = base + broadPlane + leftMass + leftSpur + leftSlot + highAlcove
    + ribA + ribB + ribC + ribD + cleftA + cleftB + cleftC;
  const top = cliffTopY(x);
  const summitMask = smooth(top - 18, top - 1.5, y);
  const summitZ = DACI_LAYOUT.cliff.backZ + 1.5 + 1.1 * g(x, 18, 22);
  const wall = rawWall + (summitZ - rawWall) * summitMask;

  // Wide, planted lower slopes give the mountain a real foot instead of a
  // rectangular facade. The slope falls into a valley at the left approach.
  const lowerEdge = 1 - smooth(26, 40, y);
  const lowerAcross = band(x, -87, 77, 7);
  const lowerSlope = 31.5 - 0.4 * Math.min(y, 18) - 1.25 * Math.max(0, y - 18)
    - 0.055 * Math.abs(x + 8) + broadPlane * 0.22;
  const lowerMask = lowerEdge * lowerAcross;

  // The left compound spans x=-48..-17. Keep one continuous, modest ledge at
  // its floor levels so local placement probes do not inherit an isolated rib.
  const compoundSpread = 10 * (1 - smooth(26, 32, y));
  const compoundMask = band(x, -51 - compoundSpread, -15 + compoundSpread, 3.5 + compoundSpread * .15)
    * (1 - smooth(36.5, 40, y));
  const compoundShelf = 8.4 - 0.035 * (x + 34) - 0.12 * (y - 31.8) + broadPlane * 0.12;

  const mainSpread = 12 * (1 - smooth(24, 32, y));
  const mainMask = band(x, -20 - mainSpread, 11 + mainSpread, 3.5 + mainSpread * .16)
    * (1 - smooth(32, 37, y));
  const mainApron = 10.8 - 0.2 * (y - 27) - 0.045 * Math.abs(x + 5) + broadPlane * 0.14;

  const gateMask = band(x, 19, 31, 2.5)
    * smooth(11, 15, y) * (1 - smooth(22, 26, y));
  const gateShoulder = 11.7 - 0.24 * (y - 16) - 0.08 * Math.abs(x - 25) + broadPlane * 0.12;

  const face = Math.max(
    wall,
    wall + (lowerSlope - wall) * lowerMask,
    wall + (compoundShelf - wall) * compoundMask,
    wall + (mainApron - wall) * mainMask,
    wall + (gateShoulder - wall) * gateMask,
  );
  return face + (summitZ - face) * summitMask;
}

// Keep the photographed/building-bearing face exact through y=50. Above it,
// bend the rendered crest in depth so the skyline has a natural side profile
// instead of collapsing onto cliffFaceZ's near-constant summit plane.
export function cliffMeshFrontZ(x, y) {
  const top = cliffTopY(x);
  const crestMask = smooth(50, 55, y) * smooth(top - 18, top - 4, y);
  const crestBend = 10 * g(x, 18, 30) - 3.4 * g(x, -31, 10);
  return cliffFaceZ(x, y) + crestMask * crestBend;
}

// The photographed face remains the authoritative part of the terrain. The
// unseen rear is an artistic completion: a broad mountain slope that descends
// from the same ridge instead of the former constant-z display backboard.
export function cliffBackZ(x, y) {
  const top = Math.max(0.001, cliffTopY(x));
  const height = clamp01(y / top);
  const ridgeHeight = clamp01((top - 8) / 102);
  const ridgeRetreat = 1.45 + 13 * (1 - ridgeHeight) ** 1.45 + 2 * g(x, -31, 8);
  const ridgeZ = cliffMeshFrontZ(x, top) - ridgeRetreat;
  const leftValley = g(x, -83, 18);
  const centralMass = g(x, 10, 58);
  const rightShoulder = g(x, 55, 29);
  const footZ = DACI_LAYOUT.cliff.backFootZ
    + 48 * leftValley
    + 12 * (1 - centralMass)
    - 5 * rightShoulder
    + 2.2 * Math.sin((x + 18) * 0.055);
  // A half-ellipse side profile rounds both the ridge and the rear foot. In
  // contrast, smoothstep leaves the lowest rows reading as a near-vertical cut.
  const rise = 0.5 + Math.asin(2 * height - 1) / Math.PI;
  const middle = Math.sin(Math.PI * height) ** 1.35;
  const branchingRidges = -5.2 * g(x, 12 + y * 0.08, 19)
    - 3.1 * g(x, -35 + y * 0.045, 16)
    + 3.8 * g(x, -70 + y * 0.025, 13)
    + 2.3 * g(x, 52 - y * 0.035, 15);
  const broadFacets = 2.5 * facet(x / 19 + y * 0.006, y / 18)
    + 0.8 * facet(x / 8 - y * 0.009, y / 9.5);
  const shaped = footZ + (ridgeZ - footZ) * rise
    + middle * (branchingRidges + broadFacets);
  return Math.min(shaped, cliffMeshFrontZ(x, y) - ridgeRetreat);
}

// Curve the rear perimeter as well as its depth. The left foot pulls inward
// to leave the photographed valley open; the right foot spreads into a broad
// shoulder. Both offsets taper into the original summit line.
export function cliffBackX(x, y) {
  const top = Math.max(0.001, cliffTopY(x));
  const footInfluence = (1 - clamp01(y / top)) ** 1.25;
  const leftOpening = 7.5 * g(x, DACI_LAYOUT.cliff.minX, 18);
  const rightShoulder = 4.5 * g(x, DACI_LAYOUT.cliff.maxX, 24);
  return x + footInfluence * (leftOpening + rightShoulder);
}

export function cliffFootY(x, z, ceilingY) {
  const { minX, maxX, backZ } = DACI_LAYOUT.cliff;
  if (![x, z, ceilingY].every(Number.isFinite) || x < minX || x > maxX || z < backZ) return null;
  const top = Math.max(0, Math.min(cliffTopY(x), ceilingY));
  if (z <= cliffFaceZ(x, top)) return top;
  let above = top;
  for (let y = top - 0.15; y >= -0.15; y -= 0.15) {
    const below = Math.max(0, y);
    if (z <= cliffFaceZ(x, below)) {
      let lo = below, hi = above;
      for (let i = 0; i < 15; i += 1) {
        const mid = (lo + hi) / 2;
        if (z <= cliffFaceZ(x, mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    }
    above = below;
  }
  return null;
}
