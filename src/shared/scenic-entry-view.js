import * as THREE from 'three';

export function captureScenicEntryView(camera, target, miniature) {
  camera.updateMatrixWorld(true);
  miniature?.updateWorldMatrix(true, false);
  const position = camera.position.clone();
  const focus = target.clone();
  if (miniature) { miniature.worldToLocal(position); miniature.worldToLocal(focus); }
  const view = camera.view;
  return {
    direction: position.clone().sub(focus).normalize().toArray(),
    fov: camera.getEffectiveFOV(),
    projection: view?.enabled ? { x: view.offsetX / view.fullWidth, y: view.offsetY / view.fullHeight } : { x: 0, y: 0 },
    ...(miniature ? { position: position.toArray(), target: focus.toArray() } : {}),
  };
}

export function applyScenicEntryProjection(camera, entry, width, height) {
  camera.fov = entry.fov;
  camera.zoom = 1;
  const { x, y } = entry.projection;
  camera.setViewOffset(width, height, x * width, y * height, width, height);
  camera.updateProjectionMatrix();
}

// Keep the incoming view direction. Only its distance and composition change
// when the miniature's camera moves into the independently scaled exhibit.
export function fitScenicEntryView(entry, bounds, width, height) {
  const direction = new THREE.Vector3(...entry.direction).normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right);
  const mobile = width < 650;
  const desired = new THREE.Vector2(mobile ? 0 : -0.18, mobile ? 0.4 : 0);
  const deltaX = desired.x + 2 * entry.projection.x;
  const deltaY = desired.y - 2 * entry.projection.y;
  const tanV = Math.tan(THREE.MathUtils.degToRad(entry.fov / 2));
  const tanH = tanV * width / height;
  const fractionX = mobile ? 0.84 : 0.60;
  const fractionY = mobile ? 0.34 : 0.70;
  const size = bounds.getSize(new THREE.Vector3());
  let distance = 0;
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const corner = new THREE.Vector3(x * size.x / 2, y * size.y / 2, z * size.z / 2);
    const depth = corner.dot(direction);
    distance = Math.max(distance,
      depth + Math.abs(corner.dot(right) + deltaX * tanH * depth) / (tanH * fractionX),
      depth + Math.abs(corner.dot(up) + deltaY * tanV * depth) / (tanV * fractionY));
  }
  distance = Math.max(12, distance * 1.08);
  const target = bounds.getCenter(new THREE.Vector3())
    .addScaledVector(right, -deltaX * distance * tanH)
    .addScaledVector(up, -deltaY * distance * tanV);
  return { position: target.clone().addScaledVector(direction, distance), target };
}

export function applyScenicEntryView(camera, controls, entry, bounds, width, height, origin = new THREE.Vector3()) {
  applyScenicEntryProjection(camera, entry, width, height);
  const settled = fitScenicEntryView(entry, bounds, width, height);
  const initial = entry.position ? {
    position: new THREE.Vector3(...entry.position).add(origin),
    target: new THREE.Vector3(...entry.target).add(origin),
  } : settled;
  const maxDistance = Math.max(
    settled.position.distanceTo(settled.target),
    initial.position.distanceTo(initial.target),
  );
  controls.maxDistance = Math.max(controls.maxDistance, maxDistance * 1.05);
  controls.minPolarAngle = Math.min(controls.minPolarAngle, 0.05);
  camera.far = Math.max(camera.far, maxDistance + bounds.getSize(new THREE.Vector3()).length() * 2);
  camera.updateProjectionMatrix();
  camera.position.copy(initial.position);
  controls.target.copy(initial.target);
  controls.update();
  return entry.position ? settled : null;
}
