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

function labelExtents(label, size) {
  const text = label.userData?.landmarkLabelSize;
  const textWidth = Number(text?.width);
  const textHeight = Number(text?.height);
  const half = size / 2;
  return {
    left: Math.max(half, Number.isFinite(textWidth) && textWidth > 0 ? textWidth / 2 : 0),
    right: Math.max(half, Number.isFinite(textWidth) && textWidth > 0 ? textWidth / 2 : 0),
    top: half + (Number.isFinite(textHeight) && textHeight > 0 ? textHeight : 0),
    bottom: half,
  };
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
    const extents = labelExtents(label, size);
    const anchorX = (_ndc.x + 1) * width / 2;
    const anchorY = (1 - _ndc.y) * height / 2;
    let selected = null;
    for (const candidate of _offsets) {
      const minX = extents.left - anchorX;
      const maxX = width - extents.right - anchorX;
      const minY = extents.top - anchorY;
      const maxY = height - extents.bottom - anchorY;
      const x = Math.min(maxX, Math.max(minX, candidate.x));
      const y = Math.min(maxY, Math.max(minY, candidate.y));
      const box = {
        left: anchorX + x - extents.left,
        right: anchorX + x + extents.right,
        top: anchorY + y - extents.top,
        bottom: anchorY + y + extents.bottom,
      };
      if (!placed.some((other) => overlaps(box, other))) {
        selected = { x, y, box };
        break;
      }
    }
    if (!selected) selected = {
      x: 0,
      y: 0,
      box: {
        left: anchorX - extents.left,
        right: anchorX + extents.right,
        top: anchorY - extents.top,
        bottom: anchorY + extents.bottom,
      },
    };
    label.center.set(0.5 - selected.x / size, 0.5 - selected.y / size);
    label.element.dataset.offsetX = String(Math.round(selected.x));
    label.element.dataset.offsetY = String(Math.round(selected.y));
    label.element.style.setProperty('--label-leader-length', `${Math.hypot(selected.x, selected.y)}px`);
    label.element.style.setProperty('--label-leader-angle', `${Math.atan2(-selected.y, -selected.x)}rad`);
    placed.push(selected.box);
  }
}
