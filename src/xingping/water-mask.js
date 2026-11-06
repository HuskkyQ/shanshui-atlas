// Rasterize mapped water in geographic ground space, independent of terrain LOD.
// A scanline fill keeps this proportional to shoreline edges, not pixels × edges.
export function rasterizeWaterMask(polygons, bounds, width, height) {
  const pixels = new Uint8Array(width * height);
  const dx = (bounds.maxX - bounds.minX) / width;
  const dz = (bounds.maxZ - bounds.minZ) / height;
  for (const polygon of polygons) {
    const rings = [polygon.outer, ...(polygon.holes || [])];
    for (let row = 0; row < height; row++) {
      const z = bounds.minZ + (row + .5) * dz;
      const intersections = [];
      for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a.z > z) !== (b.z > z)) intersections.push(a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z));
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        const left = Math.max(0, Math.ceil((intersections[i] - bounds.minX) / dx - .5));
        const right = Math.min(width, Math.ceil((intersections[i + 1] - bounds.minX) / dx - .5));
        if (right > left) pixels.fill(255, row * width + left, row * width + right);
      }
    }
  }
  return pixels;
}
