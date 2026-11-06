import { MathUtils } from 'three';
import { createAutoRoam } from '../shared/auto-roam.js';

const FRONT_LIMIT = MathUtils.degToRad(24);
const ANGLE_EPSILON = 1e-8;

export function createDaciRoam({ controls, container, canRoam }) {
  const roam = createAutoRoam({
    controls,
    container,
    canRoam: () =>
      canRoam() && Math.abs(controls.getAzimuthalAngle()) <= FRONT_LIMIT + ANGLE_EPSILON,
  });

  return {
    update(time) {
      const delta = roam.update(time);
      if (!controls.autoRotate) {
        controls.update(delta);
        return;
      }

      const angle = controls.getAzimuthalAngle();
      const speed = Math.abs(controls.autoRotateSpeed);
      // OrbitControls subtracts its auto-rotation angle from the azimuth.
      if (angle <= -FRONT_LIMIT + ANGLE_EPSILON) controls.autoRotateSpeed = -speed;
      else if (angle >= FRONT_LIMIT - ANGLE_EPSILON) controls.autoRotateSpeed = speed;

      // Apply the limits only during this frame so manual input can inspect the back.
      controls.minAzimuthAngle = -FRONT_LIMIT;
      controls.maxAzimuthAngle = FRONT_LIMIT;
      controls.update(delta);
      controls.minAzimuthAngle = -Infinity;
      controls.maxAzimuthAngle = Infinity;
    },
    dispose: roam.dispose,
  };
}
