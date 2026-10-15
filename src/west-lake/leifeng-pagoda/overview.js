import * as THREE from 'three';
import { createLeifengCore, getLeifengGroundHeight, getLeifengSiteBlend } from './model.js';
import { LEIFENG_SITE } from './site-layout.js';

export function createLeifengOverview(terrain, poi, horizontalScale) {
  const { group: core } = createLeifengCore({ detailed: false });
  const scale = horizontalScale / LEIFENG_SITE.unitsPerMetre;
  const [x, z] = terrain.toWorld(poi.longitude, poi.latitude);
  const baseY = terrain.getHeight(x, z);
  const boundary = LEIFENG_SITE.boundary;
  const gradingBounds = {
    minX: x + (Math.min(...boundary.map(([x]) => x)) - 10) * scale,
    maxX: x + (Math.max(...boundary.map(([x]) => x)) + 10) * scale,
    minZ: z + (Math.min(...boundary.map(([, z]) => z)) - 10) * scale,
    maxZ: z + (Math.max(...boundary.map(([, z]) => z)) + 10) * scale,
  };
  // Join the shared park surface to the surrounding DEM over 20 metres.
  // Jingci's architecture lies outside this patch; retain its graded cells.
  terrain.adjustGround((worldX, worldZ, originalY) => {
    const localX = (worldX - x) / scale, localZ = (worldZ - z) / scale;
    return THREE.MathUtils.lerp(originalY, baseY + getLeifengGroundHeight(localX, localZ) * scale,
      getLeifengSiteBlend(localX, localZ));
  }, gradingBounds);
  core.scale.setScalar(scale);
  core.position.set(x, baseY, z);
  const group = new THREE.Group();
  group.name = 'leifeng-overview';
  group.add(core);
  group.updateMatrixWorld(true);
  const tower = core.getObjectByName('leifeng-tower');
  const bounds = new THREE.Box3().setFromObject(tower);
  const clearing = { x, z, radius: horizontalScale * 42 };
  const clearings = [clearing];
  const pondBox = new THREE.Box2().setFromPoints(LEIFENG_SITE.pond.map(p => new THREE.Vector2(...p)));
  const pondCenter = pondBox.getCenter(new THREE.Vector2());
  clearings.push({ x: x + pondCenter.x * scale, z: z + pondCenter.y * scale,
    radius: pondBox.getSize(new THREE.Vector2()).length() / 2 * scale + horizontalScale * 8 });
  for (const path of LEIFENG_SITE.paths) for (let i = 1; i < path.points.length; i++) {
    const a = new THREE.Vector2(...path.points[i - 1]), b = new THREE.Vector2(...path.points[i]);
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 8));
    for (let step = 0; step <= steps; step++) {
      const p = a.clone().lerp(b, step / steps);
      clearings.push({ x: x + p.x * scale, z: z + p.y * scale, radius: horizontalScale * 10 });
    }
  }
  return { group, core, tower, baseY, gradingBounds,
    anchor: { x, y: bounds.max.y + 0.025, z },
    clearing, clearings };
}
