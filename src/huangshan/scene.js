import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { enableShiftPan } from '../shared/scene-controls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createTerrain } from './terrain.js';
import { createForest } from '../shared/forest.js';
import { getLightingForDate, skyDirection } from '../shared/lighting.js';
import { createLandmarkIcon, getLandmarkIconKind } from '../shared/landmark-icons.js';
import { layoutLandmarkLabels } from '../shared/landmark-layout.js';
import { createLandmarkIconScaler } from '../shared/landmark-scale.js';
import routeData from '../data/huangshan-routes.json';
import landmarks from '../data/huangshan-landmarks.json';

const VIEWS = {
  overview: { position: [23, 17, 25], target: [-1.5, 4.1, 0] },
  pine: { position: [8, 12.5, 11], target: [3.1, 9.3, 1.9] },
  cloud: { position: [-22, 14, 18], target: [-3, 5.2, -2] },
  trailheads: { position: [5, 70, 17], target: [-2.5, 4, -6] },
};

// WGS84 locations from OpenStreetMap; see README for the source objects.
const TRAILHEADS = [
  { name: '慈光阁', direction: '南门 · 前山', longitude: 118.1674646, latitude: 30.1077943 },
  { name: '云谷寺', direction: '南门 · 后山', longitude: 118.1875481, latitude: 30.1222091 },
  { name: '松谷庵', direction: '北门', longitude: 118.1557829, latitude: 30.1750765 },
  { name: '钓桥庵', direction: '西门', longitude: 118.1255818, latitude: 30.1333944 },
];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp;

function random(seed) {
  const value = Math.sin(seed * 127.1 + 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function addGroundDetails(scene, terrain) {
  const stoneGeometry = new THREE.DodecahedronGeometry(1, 0);
  const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true });
  const stones = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, 78);
  const marker = new THREE.Object3D();
  const shades = ['#3e5a53', '#536961', '#65746d', '#334f48'];

  for (let i = 0; i < 78; i++) {
    const angle = random(i * 9.3 + 2) * Math.PI * 2;
    const distance = 5.4 + random(i * 7.1 + 9) * 6.3;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance * 0.77;
    const size = 0.1 + random(i * 4.3 + 4) * 0.27;
    marker.position.set(x, terrain.getHeight(x, z), z);
    marker.rotation.set(random(i * 5.2) * 0.5, random(i * 2.3) * Math.PI, random(i * 8.4) * 0.35);
    marker.scale.set(size * 1.3, size * 0.62, size);
    marker.updateMatrix();
    stones.setMatrixAt(i, marker.matrix);
    stones.setColorAt(i, new THREE.Color(shades[i % shades.length]));
  }
  stones.castShadow = true;
  stones.receiveShadow = true;
  scene.add(stones);
}

function addTrailheads(scene, terrain) {
  const group = new THREE.Group();
  const hotspots = [];
  const labels = [];

  TRAILHEADS.forEach(({ name, direction, longitude, latitude }, index) => {
    const [x, z] = terrain.toWorld(longitude, latitude);
    const marker = new THREE.Group();
    marker.name = `trailhead-${index + 1}`;
    marker.position.set(x, terrain.getHeight(x, z) + 0.05, z);

    const hotspot = document.createElement('button');
    hotspot.type = 'button';
    hotspot.className = 'trailhead-hotspot';
    hotspot.dataset.landmarkName = name;
    hotspot.dataset.landmarkDescription = `${direction}登山点。标记表示公开地图中的地名位置，不保证与检票闸机精确重合。`;
    hotspot.setAttribute('aria-label', `${name}，${direction}`);
    const label = document.createElement('span');
    label.className = 'trailhead-label';
    const number = document.createElement('span');
    number.className = 'trailhead-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const text = document.createElement('span');
    text.className = 'trailhead-text';
    text.textContent = name;
    const detail = document.createElement('small');
    detail.textContent = direction;
    text.appendChild(detail);
    label.append(number, text);
    hotspot.append(createLandmarkIcon('trailhead'), label);
    hotspot.addEventListener('click', () => {
      const isOpen = !hotspot.classList.contains('is-open');
      hotspots.forEach((item) => item.classList.remove('is-open'));
      if (isOpen) hotspot.classList.add('is-open');
    });
    const tag = new CSS2DObject(hotspot);
    tag.position.y = 0.45;
    marker.add(tag);
    group.add(marker);
    hotspots.push(hotspot);
    labels.push(tag);
  });

  scene.add(group);
  return { group, hotspots, labels };
}

function addAscentRoutes(scene, terrain) {
  const group = new THREE.Group();
  routeData.routes.forEach((route) => {
    const path = [];
    route.points.forEach(([longitude, latitude]) => {
      const [x, z] = terrain.toWorld(longitude, latitude);
      const last = path.at(-1);
      const steps = last ? Math.ceil(Math.hypot(x - last.x, z - last.z) / 0.1) : 1;
      for (let step = 1; step <= steps; step++) {
        const px = last ? THREE.MathUtils.lerp(last.x, x, step / steps) : x;
        const pz = last ? THREE.MathUtils.lerp(last.z, z, step / steps) : z;
        path.push({ x: px, z: pz });
      }
    });

    const vertices = [];
    const triangles = [];
    path.forEach((point, index) => {
      const before = path[Math.max(0, index - 1)];
      const after = path[Math.min(path.length - 1, index + 1)];
      const dx = after.x - before.x;
      const dz = after.z - before.z;
      const length = Math.hypot(dx, dz) || 1;
      [-1, 1].forEach((side) => {
        const x = point.x + side * -dz / length * 0.1;
        const z = point.z + side * dx / length * 0.1;
        vertices.push(x, terrain.getHeight(x, z) + 0.06, z);
      });
      if (index > 0) {
        const previous = (index - 1) * 2;
        const current = index * 2;
        triangles.push(previous, previous + 1, current, previous + 1, current + 1, current);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(triangles);
    geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({ color: route.color, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false, fog: false });
    const line = new THREE.Mesh(geometry, material);
    line.name = `ascent-route-${route.id}`;
    line.renderOrder = 1;
    group.add(line);

    const treadSpacing = 0.15;
    const treads = [];
    let nextTread = treadSpacing / 2;
    for (let index = 1; index < path.length; index++) {
      const from = path[index - 1];
      const to = path[index];
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const length = Math.hypot(dx, dz);
      if (length < 0.001) continue;
      while (nextTread <= length) {
        const fraction = nextTread / length;
        treads.push({ x: THREE.MathUtils.lerp(from.x, to.x, fraction), z: THREE.MathUtils.lerp(from.z, to.z, fraction), angle: Math.atan2(dx, dz) });
        nextTread += treadSpacing;
      }
      nextTread -= length;
    }

    const steps = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.2, 0.06, 0.13),
      new THREE.MeshStandardMaterial({ color: route.color, roughness: 1, emissive: route.color, emissiveIntensity: 0.18 }),
      treads.length,
    );
    const transform = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    treads.forEach(({ x, z, angle }, index) => {
      rotation.setFromAxisAngle(up, angle);
      transform.compose(new THREE.Vector3(x, terrain.getHeight(x, z) + 0.065, z), rotation, new THREE.Vector3(1, 1, 1));
      steps.setMatrixAt(index, transform);
    });
    steps.instanceMatrix.needsUpdate = true;
    steps.name = `ascent-steps-${route.id}`;
    group.add(steps);
  });
  scene.add(group);
  return group;
}

function addScenicPoints(scene, terrain) {
  const group = new THREE.Group();
  const markers = new Map();
  const labels = [];

  landmarks.forEach(({ id, name, longitude, latitude }) => {
    const [x, z] = terrain.toWorld(longitude, latitude);
    const marker = new THREE.Group();
    marker.position.set(x, terrain.getHeight(x, z) + 0.05, z);
    const hotspot = document.createElement('button');
    hotspot.type = 'button';
    hotspot.className = 'scenic-hotspot';
    hotspot.dataset.landmarkId = id;
    hotspot.setAttribute('aria-label', `探索${name}`);
    const label = document.createElement('span');
    label.textContent = name;
    hotspot.append(createLandmarkIcon(getLandmarkIconKind({ name })), label);
    hotspot.addEventListener('click', () => document.querySelector(`[data-view="${id}"]`)?.click());
    const tag = new CSS2DObject(hotspot);
    tag.position.y = 0.52;
    marker.add(tag);
    group.add(marker);
    markers.set(id, hotspot);
    labels.push(tag);
  });

  scene.add(group);
  return {
    group,
    labels,
    setActive(id) {
      markers.forEach((hotspot, key) => {
        hotspot.classList.toggle('is-active', key === id);
      });
    },
  };
}

function addPine(scene, position, scale = 1) {
  const pine = new THREE.Group();
  pine.position.set(...position);
  pine.scale.setScalar(scale);

  const parts = [];
  function addPart(source, shade) {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    geometry.deleteAttribute('uv');
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    const color = new THREE.Color(shade);
    for (let i = 0; i < geometry.attributes.position.count; i++) color.toArray(colors, i * 3);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(geometry);
  }

  function branch(points, thickness) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    addPart(new THREE.TubeGeometry(curve, 24, thickness, 7, false), '#514036');
  }

  branch([[0, 0, 0], [0.02, 0.6, 0], [0.24, 1.2, 0.02], [0.3, 1.9, 0.02], [0.51, 2.65, -0.1], [0.38, 3.3, -0.08]], 0.11);
  branch([[0.31, 1.85, 0], [0.95, 2.13, 0.06], [1.72, 2.29, 0.09], [2.32, 2.25, 0.02]], 0.072);
  branch([[0.49, 2.57, -0.06], [-0.11, 2.75, -0.01], [-0.87, 2.78, 0.04]], 0.06);
  branch([[0.43, 2.87, -0.07], [1.05, 3.06, -0.06], [1.48, 3.01, -0.07]], 0.052);

  [
    [2.32, 2.34, 0.02, 0.91, 0.2, 0.48],
    [1.65, 2.47, 0.11, 0.83, 0.22, 0.46],
    [0.94, 2.39, 0.1, 0.65, 0.19, 0.41],
    [-0.75, 2.92, 0.04, 0.63, 0.19, 0.39],
    [0.47, 3.48, -0.08, 0.68, 0.24, 0.45],
    [1.45, 3.16, -0.05, 0.62, 0.18, 0.37],
  ].forEach(([x, y, z, sx, sy, sz], i) => {
    for (let leaf = 0; leaf < 7; leaf++) {
      const angle = leaf / 6 * Math.PI * 2;
      const geometry = new THREE.IcosahedronGeometry(1, 1);
      const factor = leaf === 0 ? 0.85 : 0.38 + random(i * 9 + leaf) * 0.15;
      geometry.scale(sx * factor, sy * (leaf === 0 ? 0.85 : 0.7), sz * factor);
      geometry.rotateY(angle);
      geometry.translate(x + (leaf ? Math.cos(angle) * sx * 0.58 : 0), y + (leaf ? random(i * 11 + leaf) * sy * 0.7 : 0),
        z + (leaf ? Math.sin(angle) * sz * 0.55 : 0));
      addPart(geometry, ['#24483b', '#355e45', '#4a6b4e'][(i + leaf) % 3]);
    }
  });
  const geometry = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.castShadow = mesh.receiveShadow = true;
  pine.add(mesh);

  scene.add(pine);
  return pine;
}

function makeSoftTexture(inner, outer) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 3, 64, 64, 64);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.38, inner);
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

function addAtmosphere(scene, terrain) {
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeSoftTexture('rgba(255,216,155,0.8)', 'rgba(255,216,155,0)'), transparent: true, depthWrite: false }));
  sun.position.set(-17, 16, -23);
  sun.scale.set(17, 17, 1);
  scene.add(sun);

  const cloudTexture = makeSoftTexture('rgba(235,239,225,0.78)', 'rgba(235,239,225,0)');
  const clouds = [];
  for (let i = 0; i < 58; i++) {
    const angle = random(i * 4.8 + 12) * Math.PI * 2;
    const distance = Math.sqrt(random(i * 7.2 + 11)) * 13;
    const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture, transparent: true, opacity: 0.3 + random(i * 3.2) * 0.25, depthWrite: false }));
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    cloud.position.set(x, clamp(terrain.getHeight(x, z) + 0.7, 3.1, 5.8), z);
    const width = 3.8 + random(i * 1.9) * 4.8;
    cloud.scale.set(width, width * (0.33 + random(i * 0.66) * 0.18), 1);
    cloud.userData = { originX: cloud.position.x, phase: i * 0.7, speed: 0.08 + random(i * 8.3) * 0.11 };
    scene.add(cloud);
    clouds.push(cloud);
  }
  return { clouds, sun };
}

export async function createHuangshanScene(container, onMotionChange, onLightingChange) {
  const terrain = await createTerrain();
  const scenicViews = Object.fromEntries(landmarks.map(({ id, longitude, latitude, viewOffset }) => {
    const [x, z] = terrain.toWorld(longitude, latitude);
    const y = terrain.getHeight(x, z);
    return [id, {
      position: [x + viewOffset[0], y + viewOffset[1], z + viewOffset[2]],
      target: [x, y + 0.6, z],
    }];
  }));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#182b31');
  scene.fog = new THREE.FogExp2('#20353a', 0.014);
  const atmosphereFog = scene.fog;

  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 150);
  camera.position.set(...VIEWS.overview.position);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'trailhead-overlay';
  container.appendChild(labelRenderer.domElement);

  const ambient = new THREE.HemisphereLight('#e8e8d8', '#123036', 2.1);
  scene.add(ambient);
  const sunlight = new THREE.DirectionalLight('#f4d8ac', 3.5);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = sunlight.shadow.camera.bottom = -27;
  sunlight.shadow.camera.right = sunlight.shadow.camera.top = 27;
  sunlight.shadow.normalBias = 0.03;
  scene.add(sunlight);
  const moonLight = new THREE.DirectionalLight('#a9c5e5', 0);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  moonLight.shadow.camera.left = moonLight.shadow.camera.bottom = -27;
  moonLight.shadow.camera.right = moonLight.shadow.camera.top = 27;
  moonLight.shadow.normalBias = 0.03;
  scene.add(moonLight);

  scene.add(terrain.group);
  const ascentRoutes = addAscentRoutes(scene, terrain);
  const trailheads = addTrailheads(scene, terrain);
  const scenicPoints = addScenicPoints(scene, terrain);
  const landmarkLabels = [...trailheads.labels, ...scenicPoints.labels];
  const clearTrailheadSelection = () => trailheads.hotspots.forEach((item) => item.classList.remove('is-open'));
  renderer.domElement.addEventListener('pointerdown', clearTrailheadSelection);
  addPine(scene, [3.1, terrain.getHeight(3.1, 1.9), 1.9], 0.48);
  addPine(scene, [-5.2, terrain.getHeight(-5.2, -6), -6], 0.26);
  addGroundDetails(scene, terrain);
  const forest = createForest(terrain, { kind: 'huangshan',
    clearings: [
      { x: 3.1, z: 1.9, radius: 1.35 }, { x: -5.2, z: -6, radius: 0.8 },
      ...[...TRAILHEADS, ...landmarks].map(({ longitude, latitude }) => {
        const [x, z] = terrain.toWorld(longitude, latitude);
        return { x, z, radius: 0.65 };
      }),
    ],
    paths: routeData.routes.map(({ points }) => points.map(([longitude, latitude]) => terrain.toWorld(longitude, latitude))),
  });
  scene.add(forest.group);
  const { clouds, sun } = addAtmosphere(scene, terrain);
  const colors = {
    nightSky: new THREE.Color('#0b1925'), daySky: new THREE.Color('#344d51'), duskSky: new THREE.Color('#72554b'),
    nightFog: new THREE.Color('#152935'), dayFog: new THREE.Color('#405c5d'),
    nightAmbient: new THREE.Color('#7899bc'), dayAmbient: new THREE.Color('#e9e9d9'),
    nightGround: new THREE.Color('#142b35'), dayGround: new THREE.Color('#294b46'),
    noonSun: new THREE.Color('#fff1dc'), lowSun: new THREE.Color('#ffc17b'),
    nightCloud: new THREE.Color('#7390a2'), dayCloud: new THREE.Color('#ffffff'),
  };
  let cleanMode = false;
  let immersiveMode = false;
  let savedView = null;

  function updateLighting() {
    if (cleanMode || immersiveMode) {
      renderer.shadowMap.enabled = false;
      scene.background.set('#65787a');
      scene.fog = null;
      ambient.color.set('#ffffff');
      ambient.groundColor.set('#ffffff');
      ambient.intensity = 3;
      sunlight.intensity = 0;
      sunlight.visible = false;
      sunlight.castShadow = false;
      moonLight.intensity = 0;
      moonLight.visible = false;
      moonLight.castShadow = false;
      renderer.toneMappingExposure = 1.25;
      sun.visible = false;
      clouds.forEach((cloud) => { cloud.visible = false; });
      return;
    }
    renderer.shadowMap.enabled = true;
    const lighting = getLightingForDate(new Date());
    const { daylight, twilight, moonlight, sun: sunPosition, moon, period, time } = lighting;
    const [sunX, sunY, sunZ] = skyDirection(sunPosition);
    const [moonX, moonY, moonZ] = skyDirection(moon);
    sunlight.position.set(sunX * 35, sunY * 35, sunZ * 35);
    sunlight.intensity = 3.5 * clamp(sunPosition.altitude / 16, 0, 1);
    sunlight.color.copy(colors.noonSun).lerp(colors.lowSun, twilight * 0.8);
    sunlight.castShadow = true;
    moonLight.position.set(moonX * 35, moonY * 35, moonZ * 35);
    moonLight.color.set('#a9c5e5');
    moonLight.intensity = 1.6 * moonlight;
    moonLight.castShadow = true;
    sunlight.visible = true;
    moonLight.visible = true;
    ambient.color.copy(colors.nightAmbient).lerp(colors.dayAmbient, daylight);
    ambient.groundColor.copy(colors.nightGround).lerp(colors.dayGround, daylight);
    ambient.intensity = 1.05 + 1.05 * daylight;
    scene.background.copy(colors.nightSky).lerp(colors.daySky, daylight).lerp(colors.duskSky, twilight * 0.35);
    scene.fog = atmosphereFog;
    scene.fog.color.copy(colors.nightFog).lerp(colors.dayFog, daylight).lerp(colors.duskSky, twilight * 0.2);
    renderer.toneMappingExposure = 1.55 - 0.15 * daylight;
    sun.visible = sunPosition.altitude > -1;
    sun.position.set(sunX * 46, 5 + sunY * 46, sunZ * 46);
    sun.material.opacity = daylight;
    clouds.forEach((cloud) => {
      cloud.visible = true;
      cloud.material.opacity = cloud.userData.baseOpacity * (0.45 + 0.55 * daylight);
      cloud.material.color.copy(colors.nightCloud).lerp(colors.dayCloud, daylight);
    });
    onLightingChange({ time, period });
  }

  function setCleanMode(enabled) {
    cleanMode = enabled;
    ascentRoutes.visible = !enabled && (activeView === 'overview' || activeView === 'trailheads');
    trailheads.group.visible = !enabled;
    scenicPoints.group.visible = !enabled;
    clearTrailheadSelection();
    if (!cleanMode) {
      camera.position.copy(savedView.position);
      controls.target.copy(savedView.target);
      controls.maxDistance = activeView === 'trailheads' ? 90 : 49;
      savedView = null;
      resize();
      controls.update();
      updateLighting();
      return;
    }
    savedView = { position: camera.position.clone(), target: controls.target.clone() };
    viewTween = null;
    controls.target.set(...VIEWS.overview.target);
    const cleanPosition = container.clientWidth < 360 ? [55, 40, 59]
      : container.clientWidth < 650 ? [50, 37, 53] : [32, 23, 34];
    camera.position.set(...cleanPosition);
    controls.maxDistance = 90;
    resize();
    controls.update();
    updateLighting();
  }
  clouds.forEach((cloud) => { cloud.userData.baseOpacity = cloud.material.opacity; });
  updateLighting();
  const lightingInterval = window.setInterval(updateLighting, 60_000);
  document.addEventListener('visibilitychange', updateLighting);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...VIEWS.overview.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  const disposeShiftPan = enableShiftPan(controls);
  controls.minDistance = 6;
  controls.maxDistance = 49;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = Math.PI * 0.52;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.35;
  controls.update();
  const compassDial = document.querySelector('#compass-dial');

  let motion = !reducedMotion;
  let activeView = 'overview';
  let viewTween = null;
  let frameId;
  const clock = new THREE.Clock();

  controls.addEventListener('start', () => { viewTween = null; });

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.fov = width < 650 ? (cleanMode ? 68 : 50) : 39;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    labelRenderer.setSize(width, height);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  const landmarkIconScaler = createLandmarkIconScaler(landmarkLabels, camera, controls.target);

  function animate() {
    frameId = requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    if (viewTween) {
      const t = clamp((elapsed - viewTween.start) / 1.35, 0, 1);
      const smooth = t * t * (3 - 2 * t);
      camera.position.copy(viewTween.fromPosition).lerp(viewTween.toPosition, smooth);
      controls.target.copy(viewTween.fromTarget).lerp(viewTween.toTarget, smooth);
      if (t === 1) viewTween = null;
    }
    controls.autoRotate = motion && !cleanMode && !immersiveMode && !viewTween && activeView !== 'trailheads';
    controls.update();
    landmarkIconScaler();
    compassDial.style.transform = `rotate(${Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z)}rad)`;
    forest.update(camera, container.clientHeight, elapsed);
    if (motion && !cleanMode && !immersiveMode) clouds.forEach((cloud) => {
      cloud.position.x = cloud.userData.originX + Math.sin(elapsed * cloud.userData.speed + cloud.userData.phase) * 0.55;
    });
    renderer.render(scene, camera);
    layoutLandmarkLabels(landmarkLabels, camera, container.clientWidth, container.clientHeight);
    labelRenderer.render(scene, camera);
  }
  animate();

  return {
    setImmersiveMode(value) {
      immersiveMode = value;
      updateLighting();
    },
    setView(name) {
      const view = VIEWS[name] || scenicViews[name];
      if (!view) return;
      clearTrailheadSelection();
      scenicPoints.setActive(name);
      activeView = name;
      ascentRoutes.visible = !cleanMode && (name === 'overview' || name === 'trailheads');
      controls.maxDistance = name === 'trailheads' ? 90 : 49;
      viewTween = {
        start: clock.getElapsedTime(),
        fromPosition: camera.position.clone(),
        toPosition: new THREE.Vector3(...view.position),
        fromTarget: controls.target.clone(),
        toTarget: new THREE.Vector3(...view.target),
      };
    },
    toggleMotion() {
      motion = !motion;
      onMotionChange(motion);
      return motion;
    },
    isMotionOn: () => motion,
    toggleCleanMode() {
      setCleanMode(!cleanMode);
      return cleanMode;
    },
    isCleanMode: () => cleanMode,
    dispose() {
      cancelAnimationFrame(frameId);
      window.clearInterval(lightingInterval);
      document.removeEventListener('visibilitychange', updateLighting);
      renderer.domElement.removeEventListener('pointerdown', clearTrailheadSelection);
      resizeObserver.disconnect();
      disposeShiftPan();
      controls.dispose();
      scene.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
        object.geometry?.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => { material.map?.dispose(); material.dispose(); });
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      labelRenderer.domElement.remove();
    },
  };
}
