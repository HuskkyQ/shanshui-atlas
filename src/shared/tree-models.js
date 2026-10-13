import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// These are deliberately low-poly, but each silhouette is assembled from several
// parts so forests still read as varied miniature trees at close range.
const TRUNK = new THREE.Color('#514036');
const LEAF_DARK = new THREE.Color('#234437');
const LEAF = new THREE.Color('#2d5442');
const LEAF_LIGHT = new THREE.Color('#486d4e');

function colorGeometry(geometry, color) {
  geometry.deleteAttribute('uv');
  const indexed = geometry.index ? geometry.toNonIndexed() : geometry;
  if (indexed !== geometry) geometry.dispose();
  const count = indexed.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) color.toArray(colors, i * 3);
  indexed.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return indexed;
}

function part(geometry, color) {
  return colorGeometry(geometry, color);
}

function cylinderBetween(start, end, radius, segments, color) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const geometry = new THREE.CylinderGeometry(radius * 0.82, radius, direction.length(), segments, 1);
  geometry.translate(0, direction.length() / 2, 0);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  geometry.applyQuaternion(rotation);
  geometry.translate(a.x, a.y, a.z);
  return part(geometry, color);
}

function join(parts) {
  const geometry = mergeGeometries(parts, false);
  if (!geometry) throw new Error('Unable to merge tree model geometries');
  for (const source of parts) source.dispose();
  geometry.computeVertexNormals();
  return geometry;
}

function cluster(x, y, z, scale, color, detail = 1, rotation = 0) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  geometry.scale(scale[0], scale[1], scale[2]);
  geometry.rotateY(rotation);
  geometry.translate(x, y, z);
  return part(geometry, color);
}

function needleCluster(x, y, z, width, depth, color, detail = 1, rotation = 0) {
  return cluster(x, y, z, [width, 0.045, depth], color, detail, rotation);
}

function trunk(height, topRadius, bottomRadius, segments) {
  const geometry = new THREE.CylinderGeometry(topRadius, bottomRadius, height, segments);
  geometry.translate(0, height / 2, 0);
  return part(geometry, TRUNK);
}

function layeredPine(near) {
  const parts = [trunk(0.96, 0.014, 0.052, near ? 7 : 5)];
  if (near) {
    parts.push(
      cylinderBetween([-0.01, 0.28, 0], [-0.22, 0.50, 0.01], 0.018, 5, TRUNK),
      cylinderBetween([0.01, 0.38, 0], [0.20, 0.58, -0.01], 0.016, 5, TRUNK),
      cylinderBetween([-0.01, 0.51, 0], [-0.15, 0.70, 0.02], 0.014, 5, TRUNK),
      cylinderBetween([0.01, 0.61, 0], [0.14, 0.77, -0.02], 0.012, 5, TRUNK),
      needleCluster(-0.10, 0.49, 0.00, 0.27, 0.17, LEAF_DARK, 1, -0.22),
      needleCluster(0.13, 0.53, -0.01, 0.23, 0.15, LEAF, 1, 0.18),
      needleCluster(-0.07, 0.67, 0.01, 0.23, 0.15, LEAF_DARK, 1, 0.12),
      needleCluster(0.10, 0.71, -0.01, 0.19, 0.13, LEAF_LIGHT, 1, -0.16),
      needleCluster(-0.20, 0.57, 0.02, 0.15, 0.11, LEAF, 1, 0.28),
      needleCluster(0.21, 0.76, -0.01, 0.14, 0.10, LEAF_DARK, 1, -0.30),
      needleCluster(0.00, 0.86, 0.00, 0.17, 0.11, LEAF, 1, 0.10),
      needleCluster(-0.04, 0.96, 0.00, 0.11, 0.08, LEAF_LIGHT, 1, -0.12),
    );
  } else {
    parts.push(
      cylinderBetween([0, 0.30, 0], [-0.19, 0.50, 0], 0.016, 4, TRUNK),
      cylinderBetween([0, 0.48, 0], [0.14, 0.65, 0], 0.013, 4, TRUNK),
      needleCluster(-0.08, 0.53, 0, 0.28, 0.18, LEAF_DARK, 0, -0.18),
      needleCluster(0.08, 0.68, 0, 0.22, 0.15, LEAF, 0, 0.12),
      needleCluster(-0.01, 0.94, 0, 0.15, 0.11, LEAF_LIGHT, 0, -0.10),
    );
  }
  return join(parts);
}

function windsweptPine(near) {
  const parts = [trunk(0.055, 0.052, 0.055, near ? 7 : 5)];
  if (near) {
    parts.push(
      cylinderBetween([0, 0.055, 0], [0.04, 0.27, 0], 0.052, 7, TRUNK),
      cylinderBetween([0.04, 0.25, 0], [0.13, 0.48, 0.01], 0.045, 7, TRUNK),
      cylinderBetween([0.13, 0.46, 0.01], [0.24, 0.69, -0.01], 0.037, 7, TRUNK),
      cylinderBetween([0.24, 0.67, -0.01], [0.33, 0.83, -0.02], 0.025, 6, TRUNK),
      cylinderBetween([0.33, 0.81, -0.02], [0.17, 1.03, -0.02], 0.016, 5, TRUNK),
      cylinderBetween([0.08, 0.43, 0], [-0.32, 0.62, 0.02], 0.021, 6, TRUNK),
      cylinderBetween([0.18, 0.58, 0], [-0.31, 0.74, -0.03], 0.018, 6, TRUNK),
      cylinderBetween([0.24, 0.68, 0], [0.50, 0.80, -0.02], 0.015, 5, TRUNK),
      needleCluster(-0.23, 0.63, 0.02, 0.31, 0.16, LEAF_DARK, 1, -0.28),
      needleCluster(-0.13, 0.76, -0.03, 0.27, 0.14, LEAF, 1, 0.16),
      needleCluster(0.22, 0.74, -0.01, 0.27, 0.15, LEAF_DARK, 1, -0.12),
      needleCluster(0.38, 0.84, -0.02, 0.22, 0.12, LEAF_LIGHT, 1, 0.20),
      needleCluster(-0.39, 0.66, 0.02, 0.13, 0.09, LEAF, 1, 0.24),
      needleCluster(0.46, 0.80, -0.02, 0.13, 0.08, LEAF_DARK, 1, -0.22),
      needleCluster(0.25, 0.95, -0.02, 0.18, 0.10, LEAF, 1, -0.18),
      needleCluster(0.15, 1.05, -0.02, 0.10, 0.07, LEAF_LIGHT, 1, 0.10),
    );
  } else {
    parts.push(
      cylinderBetween([0, 0.055, 0], [0.08, 0.34, 0], 0.05, 4, TRUNK),
      cylinderBetween([0.08, 0.32, 0], [0.18, 0.94, 0], 0.035, 4, TRUNK),
      cylinderBetween([0.14, 0.46, 0], [-0.34, 0.68, 0], 0.015, 3, TRUNK),
      cylinderBetween([0.14, 0.59, 0], [0.48, 0.76, 0], 0.013, 3, TRUNK),
      needleCluster(-0.22, 0.69, 0, 0.34, 0.18, LEAF_DARK, 0, -0.25),
      needleCluster(0.28, 0.76, 0, 0.28, 0.16, LEAF, 0, 0.16),
      needleCluster(0.18, 0.94, 0, 0.18, 0.11, LEAF_LIGHT, 0, -0.14),
    );
  }
  return join(parts);
}

function broadleaf(near) {
  const parts = [
    trunk(0.46, 0.042, 0.065, near ? 7 : 5),
    cylinderBetween([0, 0.34, 0], [-0.16, 0.59, 0.02], 0.022, near ? 6 : 4, TRUNK),
    cylinderBetween([0, 0.40, 0], [0.18, 0.67, -0.02], 0.020, near ? 6 : 4, TRUNK),
  ];
  const detail = near ? 1 : 0;
  const clusters = near
    ? [
      [-0.16, 0.65, 0.02, [0.19, 0.14, 0.16], LEAF_DARK],
      [0.13, 0.67, -0.02, [0.21, 0.16, 0.18], LEAF],
      [-0.05, 0.79, 0.03, [0.22, 0.18, 0.19], LEAF_LIGHT],
      [0.17, 0.84, 0.03, [0.16, 0.14, 0.15], LEAF_DARK],
      [-0.18, 0.83, -0.06, [0.15, 0.13, 0.16], LEAF],
      [0.00, 0.96, 0.00, [0.16, 0.14, 0.15], LEAF_LIGHT],
      [0.26, 0.79, -0.04, [0.12, 0.11, 0.13], LEAF_DARK],
      [-0.29, 0.72, 0.04, [0.12, 0.11, 0.12], LEAF_LIGHT],
      [0.02, 0.70, 0.10, [0.13, 0.11, 0.12], LEAF],
      [-0.10, 1.07, 0.03, [0.10, 0.09, 0.10], LEAF_DARK],
    ]
    : [
      [-0.12, 0.67, 0, [0.22, 0.17, 0.19], LEAF_DARK],
      [0.13, 0.72, 0, [0.22, 0.18, 0.19], LEAF],
      [0, 0.88, 0, [0.23, 0.20, 0.20], LEAF_LIGHT],
    ];
  for (const [x, y, z, scale, color] of clusters) parts.push(cluster(x, y, z, scale, color, detail, x * 4));
  return join(parts);
}

function slenderBroadleaf(near) {
  const parts = [
    trunk(0.52, 0.032, 0.052, near ? 7 : 5),
    cylinderBetween([0, 0.34, 0], [-0.14, 0.63, -0.01], 0.018, near ? 6 : 4, TRUNK),
    cylinderBetween([0, 0.43, 0], [0.13, 0.75, 0.02], 0.016, near ? 6 : 4, TRUNK),
  ];
  const detail = near ? 1 : 0;
  const clusters = near
    ? [
      [-0.13, 0.65, 0, [0.14, 0.21, 0.13], LEAF_DARK],
      [0.13, 0.74, 0.02, [0.15, 0.22, 0.14], LEAF],
      [-0.06, 0.82, -0.02, [0.15, 0.20, 0.14], LEAF_LIGHT],
      [0.11, 0.91, 0, [0.14, 0.20, 0.13], LEAF_DARK],
      [-0.04, 1.04, 0, [0.13, 0.16, 0.12], LEAF],
      [0.22, 0.84, -0.03, [0.10, 0.13, 0.09], LEAF_DARK],
      [-0.20, 0.78, 0.03, [0.10, 0.13, 0.09], LEAF_LIGHT],
      [0.08, 1.08, 0.02, [0.09, 0.11, 0.08], LEAF],
      [-0.16, 0.96, -0.02, [0.09, 0.12, 0.08], LEAF_DARK],
      [0.02, 0.58, 0.08, [0.08, 0.10, 0.08], LEAF_LIGHT],
    ]
    : [
      [-0.10, 0.68, 0, [0.15, 0.25, 0.14], LEAF_DARK],
      [0.11, 0.79, 0, [0.16, 0.27, 0.15], LEAF],
      [0, 0.96, 0, [0.15, 0.24, 0.14], LEAF_LIGHT],
    ];
  for (const [x, y, z, scale, color] of clusters) parts.push(cluster(x, y, z, scale, color, detail, y * 3));
  return join(parts);
}

export function createTreeModels() {
  return [
    { id: 'layered-pine', near: layeredPine(true), far: layeredPine(false) },
    { id: 'windswept-pine', near: windsweptPine(true), far: windsweptPine(false) },
    { id: 'broadleaf', near: broadleaf(true), far: broadleaf(false) },
    { id: 'slender-broadleaf', near: slenderBroadleaf(true), far: slenderBroadleaf(false) },
  ];
}
