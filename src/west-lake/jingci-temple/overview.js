import * as THREE from 'three';
import { createJingciCore, getJingciGroundHeight, JINGCI_UNITS_PER_METRE } from './model.js';

export function createJingciOverview(terrain, poi, horizontalScale) {
  const group = new THREE.Group();
  group.name = 'jingci-overview';
  const { group: core } = createJingciCore({ detailed: false });
  core.name = 'jingci-overview-core';
  const scale = horizontalScale / JINGCI_UNITS_PER_METRE;
  const [x, z] = terrain.toWorld(poi.longitude, poi.latitude);
  const baseY = terrain.getHeight(x, z);
  const campus = new THREE.Box3().setFromObject(core);
  const margin = horizontalScale * 100;
  const grade = (worldX, worldZ, originalY) => {
    const localX = (worldX - x) / scale, localZ = (worldZ - z) / scale;
    const distance = Math.max(0, campus.min.x - localX, localX - campus.max.x,
      campus.min.z - localZ, localZ - campus.max.z) * scale;
    const blend = 1 - THREE.MathUtils.smoothstep(distance, 0, margin);
    return THREE.MathUtils.lerp(originalY, baseY + getJingciGroundHeight(localX, localZ) * scale, blend);
  };
  // A local exhibition slope joins the proposal's stepped terraces to the DEM.
  // Source elevation data and relief outside the transition band remain intact.
  const gradingBounds = { minX: x + campus.min.x * scale - margin, maxX: x + campus.max.x * scale + margin,
    minZ: z + campus.min.z * scale - margin, maxZ: z + campus.max.z * scale + margin };
  terrain.adjustGround(grade, gradingBounds);
  core.scale.setScalar(scale);
  core.position.set(x, baseY, z);
  group.add(core);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(core);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  return { group, core, gradingBounds,
    anchor: { x: center.x, y: bounds.max.y + 0.025, z: center.z },
    clearing: { x: center.x, z: center.z, radius: Math.hypot(size.x, size.z) / 2 + horizontalScale * 8 } };
}
