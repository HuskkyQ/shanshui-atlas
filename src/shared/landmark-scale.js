import * as THREE from 'three';

export function createLandmarkIconScaler(labels, camera, target) {
  const framing = () => camera.position.distanceTo(target)
    * Math.tan(THREE.MathUtils.degToRad(camera.getEffectiveFOV() / 2));
  const referenceFraming = framing();

  return () => {
    const zoomSize = THREE.MathUtils.clamp(22 * Math.sqrt(referenceFraming / framing()), 14, 30);
    for (const label of labels) {
      const element = label.element;
      const emphasized = ['is-active', 'is-open', 'is-pinned'].some((name) => element.classList.contains(name))
        || element.matches(':hover, :focus-visible');
      const size = Math.round(Math.max(zoomSize, emphasized ? 22 : 14) * 10) / 10;
      const baseHitSize = element.classList.contains('garden-hotspot') ? 31
        : element.classList.contains('is-trailhead') || element.classList.contains('is-hill-sight') ? 29 : 30;
      const hitSize = Math.max(baseHitSize, size + 4);
      if (label.userData.landmarkIconSize === size && label.userData.landmarkHitSize === hitSize) continue;
      label.userData.landmarkIconSize = size;
      label.userData.landmarkHitSize = hitSize;
      element.style.setProperty('--landmark-icon-size', `${size}px`);
      element.style.setProperty('--landmark-hit-size', `${hitSize}px`);
    }
  };
}
