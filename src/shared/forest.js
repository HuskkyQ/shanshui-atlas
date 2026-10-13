import * as THREE from 'three';
import { createTreeModels } from './tree-models.js';

const random = (seed) => THREE.MathUtils.euclideanModulo(Math.sin(seed * 127.1 + 78.233) * 43758.5453, 1);
const clamp = THREE.MathUtils.clamp;

function exclusionGrid(clearings, paths) {
  const cells = new Map();
  function add(point) {
    for (let z = Math.floor(point.z - point.radius); z <= Math.floor(point.z + point.radius); z++) {
      for (let x = Math.floor(point.x - point.radius); x <= Math.floor(point.x + point.radius); x++) {
        const key = `${x},${z}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(point);
      }
    }
  }
  clearings.forEach(add);
  paths.forEach((path) => path.forEach(([x, z], index) => {
    const [px, pz] = path[Math.max(0, index - 1)];
    const steps = Math.max(1, Math.ceil(Math.hypot(x - px, z - pz) / 0.2));
    for (let step = 0; step <= steps; step++) {
      add({ x: THREE.MathUtils.lerp(px, x, step / steps), z: THREE.MathUtils.lerp(pz, z, step / steps), radius: 0.36 });
    }
  }));
  return (x, z) => (cells.get(`${Math.floor(x)},${Math.floor(z)}`) || [])
    .some((point) => (x - point.x) ** 2 + (z - point.z) ** 2 < point.radius ** 2);
}

export function createForest(terrain, { kind, clearings = [], paths = [] }) {
  const isHuangshan = kind === 'huangshan';
  const spacing = isHuangshan ? 0.34 : 0.24;
  const { minX, maxX, minZ, maxZ } = terrain.bounds;
  const excluded = exclusionGrid(clearings, paths);
  const models = createTreeModels();
  models.forEach(({ near, far }) => { near.computeBoundingBox(); far.computeBoundingBox(); });
  const trees = [];
  const transform = new THREE.Object3D();
  let seed = 0;

  // Keep the same jittered positions while zooming; only their representation changes.
  for (let gz = minZ + 0.3; gz < maxZ - 0.3; gz += spacing) {
    for (let gx = minX + 0.3; gx < maxX - 0.3; gx += spacing) {
      seed++;
      const x = gx + (random(seed * 2.3) - 0.5) * spacing * 0.9;
      const z = gz + (random(seed * 7.1 + 4) - 0.5) * spacing * 0.9;
      if (excluded(x, z)) continue;
      const y = terrain.getHeight(x, z);
      if (isHuangshan ? y < 0.05 : y < 0.7) continue;
      if (terrain.isWater && [[0, 0], [-0.35, 0], [0.35, 0], [0, -0.35], [0, 0.35]]
        .some(([dx, dz]) => terrain.isWater(x + dx, z + dz))) continue;
      const slope = Math.hypot(terrain.getHeight(x + 0.18, z) - terrain.getHeight(x - 0.18, z),
        terrain.getHeight(x, z + 0.18) - terrain.getHeight(x, z - 0.18)) / 0.36;
      if (slope > (isHuangshan ? 1.9 : 3.3)) continue;
      const patch = 0.78 + 0.22 * Math.sin(x * 0.9 + Math.sin(z * 0.7));
      const altitude = isHuangshan ? 1 - clamp((y - 7) / 5, 0, 0.8) : 1;
      if (random(seed * 5.9) > patch * altitude) continue;
      const choice = random(seed * 11.3);
      const variant = isHuangshan
        ? (y > 7 ? (choice < 0.6 ? 0 : 1) : choice < 0.43 ? 0 : choice < 0.76 ? 1 : choice < 0.92 ? 2 : 3)
        : choice < 0.12 ? 0 : choice < 0.26 ? 1 : choice < 0.8 ? 2 : 3;
      const size = isHuangshan ? 0.44 + random(seed * 1.7) * 0.26 : 0.35 + random(seed * 1.7) * 0.18;
      transform.position.set(x, y - 0.015, z);
      transform.rotation.set((random(seed * 4.1) - 0.5) * 0.08, random(seed * 3.1) * Math.PI * 2, (random(seed * 9.1) - 0.5) * 0.08);
      transform.scale.set(size * (0.85 + random(seed * 6.7) * 0.3), size, size);
      transform.updateMatrix();
      trees.push({ position: transform.position.clone(), matrix: transform.matrix.clone(), variant,
        height: size * models[variant].near.boundingBox.max.y, rank: random(seed * 13.7),
        shade: 0.8 + random(seed * 8.3) * 0.35, detailed: false });
    }
  }

  const group = new THREE.Group();
  group.name = `${kind}-forest`;
  group.userData.candidateCount = trees.length;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const minY = trees.reduce((min, tree) => Math.min(min, tree.position.y), 0);
  const maxY = trees.reduce((max, tree) => Math.max(max, tree.position.y + tree.height), 1);
  const bounds = new THREE.Box3(new THREE.Vector3(minX - 1, minY - 1, minZ - 1), new THREE.Vector3(maxX + 1, maxY + 1, maxZ + 1));
  const batches = models.map(({ id, near, far }, variant) => {
    const capacity = trees.filter((tree) => tree.variant === variant).length;
    return Object.fromEntries([['near', near], ['far', far]].map(([detail, geometry]) => {
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = `${id}-${detail}`;
      mesh.userData = { variant: id, detail };
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // Instance matrices are compacted each update. A fixed forest bound avoids stale culling bounds.
      mesh.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.count = 0;
      group.add(mesh);
      return [detail, mesh];
    }));
  });
  const matrix = new THREE.Matrix4(), projection = new THREE.Matrix4();
  const point = new THREE.Vector3(), scale = new THREE.Vector3(), color = new THREE.Color();
  const sphere = new THREE.Sphere(), frustum = new THREE.Frustum();
  const lastPosition = new THREE.Vector3(), lastQuaternion = new THREE.Quaternion(), lastProjection = new THREE.Matrix4();
  let lastUpdate = -Infinity, lastHeight = 0;

  function update(camera, viewportHeight, elapsed) {
    if (elapsed - lastUpdate < 0.12) return;
    if (lastHeight === viewportHeight && lastPosition.distanceToSquared(camera.position) < 0.0025
      && lastQuaternion.angleTo(camera.quaternion) < 0.003 && lastProjection.equals(camera.projectionMatrix)) return;
    camera.updateMatrixWorld();
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projection);
    const pixelsPerUnit = viewportHeight * camera.projectionMatrix.elements[5] / 2;
    const detailed = [], simplified = [];
    for (const tree of trees) {
      sphere.center.copy(tree.position);
      sphere.center.y += tree.height * 0.55;
      sphere.radius = tree.height * 0.8;
      if (!frustum.intersectsSphere(sphere)) continue;
      point.copy(sphere.center).applyMatrix4(camera.matrixWorldInverse);
      if (point.z >= 0) continue;
      const pixels = tree.height * pixelsPerUnit / -point.z;
      const density = THREE.MathUtils.lerp(0.1, 1, THREE.MathUtils.smoothstep(pixels, 4, 30));
      const reveal = clamp((density * 1.08 - tree.rank) / 0.08, 0, 1);
      if (reveal <= 0) continue;
      tree.reveal = THREE.MathUtils.smoothstep(reveal, 0, 1);
      tree.distance = camera.position.distanceToSquared(tree.position);
      tree.detailed = pixels * tree.reveal > (tree.detailed ? 21 : 24);
      (tree.detailed ? detailed : simplified).push(tree);
    }
    // Bound the expensive near geometry; overflow keeps its tree with the simpler geometry.
    detailed.sort((a, b) => a.distance - b.distance);
    simplified.push(...detailed.splice(1400));
    batches.forEach((batch) => { batch.near.count = batch.far.count = 0; });
    function write(tree, detail) {
      const mesh = batches[tree.variant][detail];
      matrix.copy(tree.matrix).scale(scale.setScalar(tree.reveal));
      mesh.setMatrixAt(mesh.count, matrix);
      mesh.setColorAt(mesh.count, color.setRGB(tree.shade, tree.shade, tree.shade));
      mesh.count++;
    }
    simplified.forEach((tree) => write(tree, 'far'));
    detailed.forEach((tree) => write(tree, 'near'));
    group.children.forEach((mesh) => {
      mesh.visible = mesh.count > 0;
      if (mesh.visible) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
      }
    });
    lastPosition.copy(camera.position);
    lastQuaternion.copy(camera.quaternion);
    lastProjection.copy(camera.projectionMatrix);
    lastHeight = viewportHeight;
    lastUpdate = elapsed;
  }
  return { group, update };
}
