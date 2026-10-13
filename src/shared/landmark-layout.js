import * as THREE from 'three';

const _ndc = new THREE.Vector3();
const _offsets = [{ x: 0, y: 0 }];
for (const radius of [32, 64, 96]) {
  for (const [x, y] of [
    [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
  ]) _offsets.push({ x: x * radius, y: y * radius });
}

function isVisible(object) {
  for (let current = object; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function iconSize(label) {
  const element = label.element;
  const measured = Number(label.userData?.landmarkHitSize);
  if (Number.isFinite(measured) && measured > 0) return measured;
  return element.classList.contains('is-trailhead') || element.classList.contains('is-hill-sight') ? 29 : 30;
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * Move CSS2D landmark icons in screen space when projected anchors collide.
 * The input order is the tie-breaker, so repeated frames do not reshuffle POIs.
 */
export function layoutLandmarkLabels(labels, camera, width, height) {
  const placed = [];
  for (const label of labels) {
    if (!isVisible(label)) continue;
    label.center.set(0.5, 0.5);
    label.getWorldPosition(_ndc).project(camera);
    if (_ndc.z < -1 || _ndc.z > 1 || _ndc.x < -1 || _ndc.x > 1 || _ndc.y < -1 || _ndc.y > 1) continue;

    const size = iconSize(label);
    const half = size / 2;
    const anchorX = (_ndc.x + 1) * width / 2;
    const anchorY = (1 - _ndc.y) * height / 2;
    let selected = null;
    for (const candidate of _offsets) {
      const minX = half - anchorX;
      const maxX = width - half - anchorX;
      const minY = half - anchorY;
      const maxY = height - half - anchorY;
      const x = Math.min(maxX, Math.max(minX, candidate.x));
      const y = Math.min(maxY, Math.max(minY, candidate.y));
      const box = { left: anchorX + x - half, right: anchorX + x + half, top: anchorY + y - half, bottom: anchorY + y + half };
      if (!placed.some((other) => overlaps(box, other))) {
        selected = { x, y, box };
        break;
      }
    }
    if (!selected) selected = { x: 0, y: 0, box: { left: anchorX - half, right: anchorX + half, top: anchorY - half, bottom: anchorY + half } };
    label.center.set(0.5 - selected.x / size, 0.5 - selected.y / size);
    label.element.dataset.offsetX = String(Math.round(selected.x));
    label.element.dataset.offsetY = String(Math.round(selected.y));
    label.element.style.setProperty('--label-leader-length', `${Math.hypot(selected.x, selected.y)}px`);
    label.element.style.setProperty('--label-leader-angle', `${Math.atan2(-selected.y, -selected.x)}rad`);
    placed.push(selected.box);
  }
}
