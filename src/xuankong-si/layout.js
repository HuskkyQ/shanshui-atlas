/**
 * Shared placement contract for the Xuankong Temple reconstruction.
 *
 * Coordinates are metres in an artistic reconstruction: +x runs from the
 * south to the north end of the cliff, +z points east/out from the rock, and
 * +y points up. The public dimensions come from the cited scenic-area
 * introduction; floor heights and cliff geometry are visual approximations.
 */
export const XUANKONG_LAYOUT = Object.freeze({
  orientation: Object.freeze({ alongCliff: '+x south-to-north', front: '+z east', up: '+y' }),
  cliff: Object.freeze({ width: 70, height: 65, backZ: -22 }),
  courtyard: Object.freeze({ x: -13.5, width: 10, depth: 3, floorY: 28.5 }),
  southTower: Object.freeze({ x: -3, width: 8, depth: 4, floorY: 31.5, floors: 3, storeyHeight: 3 }),
  northTower: Object.freeze({ x: 12, width: 7, depth: 4, floorY: 36, floors: 3, storeyHeight: 3 }),
  bridge: Object.freeze({ fromX: 1, toX: 9, fromY: 37.5, toY: 39, width: 0.9 }),
});

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smoothstep = (from, to, value) => {
  const t = clamp01((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};
const gaussian = (value, center, radius) => Math.exp(-(((value - center) / radius) ** 2));

/**
 * Returns the east/front surface of the closed cliff solid at x/y.
 *
 * The broad negative depression is the sheltered cliff niche visible behind
 * the temple. A restrained blended patch over the building band represents
 * the worked mounting face while retaining the surrounding natural profile.
 */
export function cliffFaceZ(x, y) {
  const halfWidth = XUANKONG_LAYOUT.cliff.width / 2;
  const clampedX = Math.max(-halfWidth, Math.min(halfWidth, x));
  const clampedY = Math.max(0, Math.min(XUANKONG_LAYOUT.cliff.height, y));
  const edgeShoulder = 1.55 * (Math.abs(clampedX) / halfWidth) ** 2.15;
  const niche = -2.75 * gaussian(clampedX, 3, 27) * gaussian(clampedY, 39, 19);
  const verticalFold = 0.42 * Math.sin(clampedX * 0.17 + 0.7)
    * gaussian(clampedY, 35, 34);
  const strata = 0.16 * Math.sin(clampedX * 0.29 + clampedY * 0.23)
    + 0.12 * Math.sin(clampedX * 0.11 - clampedY * 0.49 + 0.8)
    + 0.07 * Math.sin(clampedX * 0.47 + clampedY * 0.71);
  const blockWeathering = 0.24
    * Math.sin(clampedX * 0.23 + clampedY * 0.12 + 0.3)
    * Math.sin(clampedY * 0.34 - clampedX * 0.08);
  const foot = 7.6 * (1 - smoothstep(2, 20, clampedY))
    * (0.91 + 0.09 * Math.cos(clampedX * 0.19));
  const canopy = 2.05 * smoothstep(53, 62, clampedY) * gaussian(clampedX, 2, 30);

  const naturalFace = -0.12 + edgeShoulder + niche + verticalFold
    + strata + blockWeathering + foot + canopy;
  const mountX = gaussian(clampedX, 4, 19);
  const mountY = smoothstep(27, 33, clampedY) * (1 - smoothstep(48, 53, clampedY));
  const mountingBlend = 0.68 * mountX * mountY;
  const mountingFace = -2.46 + clampedX * 0.012 + (clampedY - 39) * 0.014;
  return naturalFace * (1 - mountingBlend) + mountingFace * mountingBlend;
}

/**
 * Finds the highest point of the same cliff solid below a vertical support.
 * Returns null when x/z never intersects the modeled rock volume.
 */
export function cliffFootY(x, z, ceilingY) {
  const { width, height, backZ } = XUANKONG_LAYOUT.cliff;
  if (![x, z, ceilingY].every(Number.isFinite)
    || Math.abs(x) > width / 2 || z < backZ) return null;

  const top = Math.max(0, Math.min(height, ceilingY));
  const inside = (y) => z <= cliffFaceZ(x, y);
  if (inside(top)) return top;

  const step = 0.125;
  let outsideY = top;
  for (let y = top - step; y >= 0; y -= step) {
    const sampleY = Math.max(0, y);
    if (inside(sampleY)) {
      let lowerInside = sampleY;
      let upperOutside = outsideY;
      for (let iteration = 0; iteration < 14; iteration += 1) {
        const middle = (lowerInside + upperOutside) / 2;
        if (inside(middle)) lowerInside = middle;
        else upperOutside = middle;
      }
      return lowerInside;
    }
    outsideY = sampleY;
  }
  return inside(0) ? 0 : null;
}
