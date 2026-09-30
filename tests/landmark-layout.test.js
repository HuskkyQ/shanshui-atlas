import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { layoutLandmarkLabels } from '../src/landmark-layout.js';

const WIDTH = 200;
const HEIGHT = 100;

function label(position, className = 'is-hill-sight') {
  const object = new THREE.Object3D();
  object.position.copy(position);
  object.element = {
    classList: { contains: (name) => name === className },
    dataset: {},
    style: { setProperty(name, value) { this[name] = value; } },
  };
  object.center = new THREE.Vector2(0.5, 0.5);
  return object;
}

function camera() {
  const result = new THREE.OrthographicCamera(-100, 100, 50, -50, 0.1, 100);
  result.position.set(0, 0, 10);
  result.lookAt(0, 0, 0);
  result.updateProjectionMatrix();
  result.updateMatrixWorld(true);
  return result;
}

function boxFor(labelObject, cameraObject) {
  const anchor = labelObject.getWorldPosition(new THREE.Vector3()).project(cameraObject);
  const size = 29;
  const x = (anchor.x + 1) * WIDTH / 2;
  const y = (1 - anchor.y) * HEIGHT / 2;
  const offsetX = (0.5 - labelObject.center.x) * size;
  const offsetY = (0.5 - labelObject.center.y) * size;
  return { left: x + offsetX - size / 2, right: x + offsetX + size / 2, top: y + offsetY - size / 2, bottom: y + offsetY + size / 2 };
}

function overlaps(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test('labels use world positions when their parent group is translated', () => {
  const leftParent = new THREE.Group(), rightParent = new THREE.Group();
  leftParent.position.set(-45, 0, 0);
  rightParent.position.set(45, 0, 0);
  const left = label(new THREE.Vector3());
  const right = label(new THREE.Vector3());
  leftParent.add(left);
  rightParent.add(right);
  const view = camera();

  layoutLandmarkLabels([left, right], view, WIDTH, HEIGHT);

  assert.equal(left.center.x, 0.5);
  assert.equal(left.center.y, 0.5);
  assert.equal(right.center.x, 0.5);
  assert.equal(right.center.y, 0.5);
  assert.equal(left.element.dataset.offsetX, '0');
  assert.equal(right.element.dataset.offsetX, '0');
});

test('coincident visible labels are separated without changing world anchors and stay stable', () => {
  const parent = new THREE.Group();
  parent.position.set(8, 4, 0);
  const labels = [
    label(new THREE.Vector3(0, 0, 0)),
    label(new THREE.Vector3(0, 0, 0)),
    label(new THREE.Vector3(0, 0, 0)),
  ];
  parent.add(...labels);
  parent.updateMatrixWorld(true);
  const view = camera();
  const anchorsBefore = labels.map((item) => item.getWorldPosition(new THREE.Vector3()).clone());

  layoutLandmarkLabels(labels, view, WIDTH, HEIGHT);
  const firstCenters = labels.map((item) => item.center.clone());
  const firstBoxes = labels.map((item) => boxFor(item, view));
  assert.ok(firstBoxes.every((box, index) => firstBoxes.every((other, otherIndex) => index === otherIndex || !overlaps(box, other))));
  labels.forEach((item, index) => assert.deepEqual(item.getWorldPosition(new THREE.Vector3()), anchorsBefore[index]));

  layoutLandmarkLabels(labels, view, WIDTH, HEIGHT);
  labels.forEach((item, index) => assert.deepEqual(item.center, firstCenters[index], 'layout tie-break remains stable'));
});

test('invisible ancestors are skipped and edge labels remain inside the viewport', () => {
  const view = camera();
  const hiddenParent = new THREE.Group();
  hiddenParent.visible = false;
  const hidden = label(new THREE.Vector3(0, 0, 0));
  hidden.center.set(0.2, 0.8);
  hiddenParent.add(hidden);
  const edge = label(new THREE.Vector3(95, 45, 0));
  const visibleParent = new THREE.Group();
  visibleParent.add(edge);
  hiddenParent.updateMatrixWorld(true);
  visibleParent.updateMatrixWorld(true);

  layoutLandmarkLabels([hidden, edge], view, WIDTH, HEIGHT);

  assert.deepEqual(hidden.center, new THREE.Vector2(0.2, 0.8));
  const box = boxFor(edge, view);
  assert.ok(box.left >= 0 && box.right <= WIDTH);
  assert.ok(box.top >= 0 && box.bottom <= HEIGHT);
});
