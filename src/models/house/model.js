import * as THREE from 'three';

const WIDTH = 10;
const DEPTH = 7;
const EAVE_Y = 4.4;
const RIDGE_Y = 5.6;
const ROOF_RISE = RIDGE_Y - EAVE_Y;
const ROOF_HALF_SPAN = 3.5;
const ROOF_ANGLE = Math.atan(ROOF_RISE / ROOF_HALF_SPAN);
const ROOF_RUN = Math.hypot(ROOF_HALF_SPAN, ROOF_RISE);
const ROOF_CENTER_Y = (EAVE_Y + RIDGE_Y) / 2;
const ROOF_THICKNESS = 0.18;
const TILE_OFFSET = ROOF_THICKNESS / 2 + 0.0225 + 0.003;

export function createHouseModel() {
  const group = new THREE.Group();
  group.name = 'house-model';
  group.userData = {
    kind: 'artistic-approximation',
    dimensions: { width: WIDTH, depth: DEPTH, height: 5.8 },
    entranceDirection: '+z',
  };
  const geometries = new Set();
  const materials = new Set();
  const wall = material(0xf1eee5);
  const stone = material(0x8a8174);
  const roof = material(0x5d6261);
  const roofEdge = material(0x434848);
  const wood = material(0x4a2e20);
  const woodLight = material(0x704936);

  addBox('stone-base', 10.2, 0.6, 7.2, 0, 0.3, 0, stone);
  addBox('front-wall', 9.6, 3.8, 0.28, 0, 2.5, 3.35, wall);
  addBox('back-wall', 9.6, 3.8, 0.28, 0, 2.5, -3.35, wall);
  addBox('left-wall', 0.28, 3.8, 6.45, -4.65, 2.5, 0, wall);
  addBox('right-wall', 0.28, 3.8, 6.45, 4.65, 2.5, 0, wall);
  addBox('front-door-left', 0.82, 2.45, 0.11, -0.43, 1.85, 3.53, wood);
  addBox('front-door-right', 0.82, 2.45, 0.11, 0.43, 1.85, 3.53, wood);
  addBox('door-lintel', 1.9, 0.18, 0.14, 0, 3.12, 3.53, woodLight);
  addBox('door-step', 2.25, 0.18, 0.42, 0, 0.69, 3.67, stone);

  // Two front windows, each framed with simple vertical and horizontal lattice.
  for (const x of [-3.0, 3.0]) {
    addBox(`window-${x}-frame`, 1.65, 1.55, 0.1, x, 2.45, 3.51, woodLight);
    addBox(`window-${x}-glass`, 1.25, 1.15, 0.11, x, 2.43, 3.57, material(0xb7c4c0));
    addBox(`window-${x}-vertical`, 0.09, 1.35, 0.15, x, 2.43, 3.66, wood);
    addBox(`window-${x}-horizontal`, 1.45, 0.09, 0.15, x, 2.43, 3.66, wood);
  }

  // Low, solid steps make the +Z entrance readable when the model is reused.
  addBox('entry-step-low', 2.7, 0.2, 0.55, 0, 0.1, 4.0, stone);
  addBox('entry-step-high', 2.45, 0.4, 0.42, 0, 0.4, 3.68, stone);

  addGable('gable-left', -4.65);
  addGable('gable-right', 4.65);
  for (const side of [-1, 1]) {
    const facade = side > 0 ? 'front' : 'back';
    const slab = addBox(`roof-slab-${facade}`, 10.2, ROOF_THICKNESS, ROOF_RUN, 0, ROOF_CENTER_Y, side * 1.75, roof);
    slab.rotation.x = side * ROOF_ANGLE;
    addRoofTiles(`roof-tiles-${facade}`, side);
  }
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 7.65, 12), roofEdge);
  ridge.name = 'roof-ridge';
  ridge.rotation.z = Math.PI / 2;
  ridge.position.y = RIDGE_Y;
  register(ridge.geometry, ridge.material);
  group.add(ridge);
  group.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });

  return {
    group,
    anchors: {
      base: [0, 0.6, 0],
      entrance: [0, 1.85, 3.6],
      roof: [0, RIDGE_Y, 0],
    },
    // The footprint includes the stone base and front steps, but excludes roof overhang.
    footprint: { width: 10.2, depth: 7.875 },
    dispose() {
      if (group.userData.disposed) return;
      group.userData.disposed = true;
      group.removeFromParent();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((entry) => entry.dispose());
      group.clear();
    },
  };

  function addBox(name, width, height, depth, x, y, z, materialInstance) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materialInstance);
    mesh.name = name;
    mesh.position.set(x, y, z);
    register(mesh.geometry, materialInstance);
    group.add(mesh);
    return mesh;
  }

  function addGable(name, x) {
    const half = 0.15;
    const vertices = [
      x - half, 0, -3.35, x - half, ROOF_RISE - ROOF_THICKNESS / (2 * Math.cos(ROOF_ANGLE)), 0, x - half, 0, 3.35,
      x + half, 0, -3.35, x + half, ROOF_RISE - ROOF_THICKNESS / (2 * Math.cos(ROOF_ANGLE)), 0, x + half, 0, 3.35,
    ];
    const indices = [0, 1, 2, 5, 4, 3, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, wall);
    mesh.name = name;
    mesh.position.y = EAVE_Y;
    register(geometry, wall);
    group.add(mesh);
    return mesh;
  }

  function addRoofTiles(name, side) {
    const geometry = new THREE.BoxGeometry(0.07, 0.045, ROOF_RUN + 0.08);
    const tiles = new THREE.InstancedMesh(geometry, roofEdge, 9);
    tiles.name = name;
    const transform = new THREE.Object3D();
    for (let index = 0; index < 9; index += 1) {
      transform.position.set(-4.35 + index * 1.0875, ROOF_CENTER_Y + TILE_OFFSET * Math.cos(ROOF_ANGLE), side * 1.75 + side * TILE_OFFSET * Math.sin(ROOF_ANGLE));
      transform.rotation.x = side * ROOF_ANGLE;
      transform.updateMatrix();
      tiles.setMatrixAt(index, transform.matrix);
    }
    tiles.instanceMatrix.needsUpdate = true;
    register(geometry, roofEdge);
    group.add(tiles);
  }

  function register(geometry, materialInstance) {
    geometries.add(geometry);
    if (Array.isArray(materialInstance)) materialInstance.forEach((entry) => materials.add(entry));
    else materials.add(materialInstance);
  }

  function material(color) {
    const instance = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0 });
    materials.add(instance);
    return instance;
  }
}
