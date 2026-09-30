import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { enableShiftPan } from './scene-controls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createWestLakeTerrain } from './west-lake-terrain.js';
import { createForest } from './forest.js';
import { createWestLakeBuiltModels } from './west-lake-built-models.js';
import { getWestLakeBuiltPOIs } from './west-lake-built-pois.js';
import { getLightingForDate, skyDirection } from './lighting.js';
import { createLandmarkIcon, getLandmarkIconKind } from './landmark-icons.js';
import { layoutLandmarkLabels } from './landmark-layout.js';
import mountainLandmarks from './data/west-lake-landmarks.json';
import originalAttractions from './data/west-lake-attractions.json';
import builtLandmarkData from './data/west-lake-built-landmarks.json';
import terrainMetadata from './data/west-lake-dem.json';
import trailheads from './data/west-lake-trailheads.json';
import hillSights from './data/west-lake-hill-sights.json';
import routeData from './data/west-lake-routes.json';
import hikeData from './data/west-lake-hikes.json';

const attractions = getWestLakeBuiltPOIs(builtLandmarkData, originalAttractions);
const landmarks = [...mountainLandmarks, ...attractions, ...trailheads, ...hillSights];

const VIEWS = {
  overview: { position: [31, 29, 38], target: [0, 0.8, 0] },
  lake: { position: [20, 13, 13], target: [6.5, 0.5, -4] },
  hills: { position: [16, 20, 25], target: [-5, 1.5, 0] },
  top: { position: [7, 27, -4.5], target: [7, 0.5, -5] },
  hiking: { position: [-1, 50, 0], target: [-1, 1, -0.5] },
};
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = THREE.MathUtils.clamp;

function addScenicRoutes(scene, terrain, routes, kind) {
  const group = new THREE.Group();
  group.name = `west-lake-${kind}-routes`;
  routes.forEach(({ id, color, points }) => {
    const path = [];
    points.forEach(([longitude, latitude]) => {
      const [x, z] = terrain.toWorld(longitude, latitude);
      const last = path.at(-1);
      const steps = last ? Math.max(1, Math.ceil(Math.hypot(x - last.x, z - last.z) / 0.06)) : 1;
      for (let step = 1; step <= steps; step++) {
        path.push({ x: last ? THREE.MathUtils.lerp(last.x, x, step / steps) : x,
          z: last ? THREE.MathUtils.lerp(last.z, z, step / steps) : z });
      }
    });
    const vertices = [], triangles = [];
    path.forEach((point, index) => {
      const before = path[Math.max(0, index - 1)], after = path[Math.min(path.length - 1, index + 1)];
      const dx = after.x - before.x, dz = after.z - before.z, length = Math.hypot(dx, dz) || 1;
      [-1, 1].forEach((side) => {
        const x = point.x - side * dz / length * 0.028, z = point.z + side * dx / length * 0.028;
        // Causeways are narrower than the DEM cells; keep their traces above the lake plane.
        vertices.push(x, Math.max(terrain.getHeight(x, z), terrain.waterHeight) + (kind === 'hiking' ? 0.075 : 0.045), z);
      });
      if (index > 0) {
        const a = (index - 1) * 2, b = index * 2;
        triangles.push(a, a + 1, b, a + 1, b + 1, b);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(triangles);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide,
      toneMapped: false, fog: false }));
    mesh.name = `west-lake-${kind}-${id}`;
    group.add(mesh);
  });
  scene.add(group);
  return group;
}

function addHikingNetwork(group, terrain, network) {
  const vertices = [];
  function position(x, z) {
    return [x, Math.max(terrain.getHeight(x, z), terrain.waterHeight) + 0.065, z];
  }
  network.segments.forEach(({ points }) => {
    let previous = null;
    points.forEach(([longitude, latitude]) => {
      const [x, z] = terrain.toWorld(longitude, latitude);
      if (previous) {
        const steps = Math.max(1, Math.ceil(Math.hypot(x - previous.x, z - previous.z) / 0.06));
        for (let step = 0; step < steps; step++) {
          vertices.push(...position(THREE.MathUtils.lerp(previous.x, x, step / steps), THREE.MathUtils.lerp(previous.z, z, step / steps)),
            ...position(THREE.MathUtils.lerp(previous.x, x, (step + 1) / steps), THREE.MathUtils.lerp(previous.z, z, (step + 1) / steps)));
        }
      }
      previous = { x, z };
    });
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: '#b5c3b0', transparent: true,
    opacity: 0.65, toneMapped: false, fog: false }));
  lines.name = 'west-lake-hiking-network';
  group.add(lines);

  const nodePositions = [], nodeColors = [];
  network.nodes.filter(({ degree, kind }) => degree >= 3 || degree === 1 || kind === 'road-access').forEach(({ coordinate, kind }) => {
    const [x, z] = terrain.toWorld(...coordinate);
    nodePositions.push(...position(x, z));
    const color = new THREE.Color(kind === 'road-access' ? '#e2bc78' : kind === 'junction' ? '#e8e7d1' : '#708d8a');
    nodeColors.push(color.r, color.g, color.b);
  });
  const nodesGeometry = new THREE.BufferGeometry();
  nodesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
  nodesGeometry.setAttribute('color', new THREE.Float32BufferAttribute(nodeColors, 3));
  const nodes = new THREE.Points(nodesGeometry, new THREE.PointsMaterial({ size: 0.09, vertexColors: true,
    toneMapped: false, fog: false }));
  nodes.name = 'west-lake-hiking-junctions';
  group.add(nodes);
}

function addLandmarks(scene, terrain, builtModels) {
  const group = new THREE.Group();
  const points = new Map();
  const labels = [];
  landmarks.forEach(({ id, name, category, longitude, latitude }) => {
    const [x, z] = terrain.toWorld(longitude, latitude);
    const marker = new THREE.Group();
    const isTrailhead = category === '上山口', isHillSight = category === '山间名胜';
    marker.name = `west-lake-point-${id}`;
    const anchor = builtModels.anchors.get(id);
    marker.position.set(anchor?.x ?? x, anchor ? anchor.y + 0.01 : terrain.getHeight(x, z) + (isTrailhead ? 0.035 : 0.25), anchor?.z ?? z);
    const hotspot = document.createElement('button');
    const isAttraction = attractions.some((item) => item.id === id);
    const kind = isTrailhead ? 'trailhead' : isHillSight ? 'hill-sight' : isAttraction ? 'attraction' : 'mountain';
    hotspot.className = `scenic-hotspot is-${kind}${['pinghu', 'quyuan', 'baoshi'].includes(id) ? ' label-below' : ''}`;
    hotspot.type = 'button';
    hotspot.dataset.landmarkId = id;
    hotspot.setAttribute('aria-label', `探索${name}`);
    const nameLabel = document.createElement('span');
    nameLabel.textContent = name;
    hotspot.append(createLandmarkIcon(getLandmarkIconKind({ name, category })), nameLabel);
    hotspot.addEventListener('click', () => document.querySelector(`[data-view="${id}"]`)?.click());
    const label = new CSS2DObject(hotspot);
    label.position.y = anchor ? 0.04 : isTrailhead ? 0.45 : 0.15;
    marker.add(label);
    group.add(marker);
    points.set(id, { marker, hotspot, kind, category });
    labels.push(label);
  });
  scene.add(group);
  return { group, labels, setCategory(category) {
    points.forEach((point) => { point.marker.visible = category === 'all' || point.kind === 'mountain' || point.category === category; });
  }, setActive(id) {
    points.forEach(({ hotspot }, key) => {
      hotspot.classList.toggle('is-active', key === id);
    });
  } };
}

export async function createWestLakeScene(container, onMotionChange, onLightingChange) {
  const terrain = await createWestLakeTerrain();
  const scene = new THREE.Scene();
  scene.add(terrain.group);
  scene.background = new THREE.Color('#344d51');
  const fog = new THREE.FogExp2('#405c5d', 0.009);
  scene.fog = fog;
  const builtModels = createWestLakeBuiltModels(terrain, builtLandmarkData, terrainMetadata.horizontalScale);
  scene.add(builtModels.group);
  const routes = addScenicRoutes(scene, terrain, routeData.routes, 'walking');
  const hikes = addScenicRoutes(scene, terrain, hikeData.routes, 'hiking');
  addHikingNetwork(hikes, terrain, hikeData.network);
  const forest = createForest(terrain, { kind: 'west-lake', paths: [...routeData.routes, ...hikeData.routes].map(({ points }) =>
    points.map(([longitude, latitude]) => terrain.toWorld(longitude, latitude))), clearings: landmarks.map(({ category, longitude, latitude }) => {
    const [x, z] = terrain.toWorld(longitude, latitude);
    return { x, z, radius: category === '上山口' || category === '山间名胜' ? 0.25 : 0.55 };
  }).concat(builtModels.clearings) });
  scene.add(forest.group);
  const sights = addLandmarks(scene, terrain, builtModels);
  const scenicViews = Object.fromEntries(landmarks.map(({ id, longitude, latitude, viewOffset }) => {
    const coordinate = terrain.toWorld(longitude, latitude);
    const anchor = builtModels.anchors.get(id);
    const { x, y, z } = anchor || { x: coordinate[0], y: terrain.getHeight(...coordinate), z: coordinate[1] };
    return [id, { position: [x + viewOffset[0], y + viewOffset[1], z + viewOffset[2]], target: [x, y + (anchor ? 0 : 0.4), z] }];
  }));
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 200);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = 'trailhead-overlay';
  container.appendChild(labels.domElement);

  const ambient = new THREE.HemisphereLight('#e9e9d9', '#294b46', 2.1);
  const sunlight = new THREE.DirectionalLight('#fff1dc', 3.5);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = sunlight.shadow.camera.bottom = -25;
  sunlight.shadow.camera.right = sunlight.shadow.camera.top = 25;
  sunlight.shadow.normalBias = 0.025;
  const moonlight = new THREE.DirectionalLight('#a9c5e5', 0);
  scene.add(ambient, sunlight, moonlight);
  const colors = Object.fromEntries(Object.entries({
    nightSky: '#0b1925', daySky: '#344d51', duskSky: '#72554b', nightFog: '#152935', dayFog: '#405c5d',
    nightAmbient: '#7899bc', dayAmbient: '#e9e9d9', nightGround: '#142b35', dayGround: '#294b46', lowSun: '#ffc17b', noonSun: '#fff1dc',
  }).map(([key, color]) => [key, new THREE.Color(color)]));
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  const disposeShiftPan = enableShiftPan(controls);
  controls.minDistance = 0.8;
  controls.maxDistance = 110;
  controls.minPolarAngle = 0.05;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.autoRotateSpeed = 0.3;
  const compass = document.querySelector('#compass-dial');
  const clock = new THREE.Clock();
  let motion = !reducedMotion, cleanMode = false, immersiveMode = false, activeView = 'overview';
  let tween = null, savedView = null, frameId;
  let mobileLayout = container.clientWidth < 650;

  function positionFor(view) {
    const target = new THREE.Vector3(...view.target);
    const scale = container.clientWidth < 650 && view !== VIEWS.top && view !== VIEWS.hiking ? 1.5 : 1;
    return new THREE.Vector3(...view.position).sub(target).multiplyScalar(scale).add(target);
  }
  camera.position.copy(positionFor(VIEWS.overview));
  controls.target.set(...VIEWS.overview.target);
  controls.update();
  controls.addEventListener('start', () => { tween = null; });

  function updateLighting() {
    if (cleanMode) return;
    const state = getLightingForDate(new Date(), 30.241, 120.14);
    const { daylight, twilight, moonlight: moonStrength, sun, moon, time, period } = state;
    sunlight.position.fromArray(skyDirection(sun)).multiplyScalar(45);
    sunlight.intensity = 3.5 * clamp(sun.altitude / 16, 0, 1);
    sunlight.color.copy(colors.noonSun).lerp(colors.lowSun, twilight * 0.8);
    moonlight.position.fromArray(skyDirection(moon)).multiplyScalar(45);
    moonlight.intensity = moonStrength * 1.6;
    ambient.color.copy(colors.nightAmbient).lerp(colors.dayAmbient, daylight);
    ambient.groundColor.copy(colors.nightGround).lerp(colors.dayGround, daylight);
    ambient.intensity = 1.05 + 1.05 * daylight;
    scene.background.copy(colors.nightSky).lerp(colors.daySky, daylight).lerp(colors.duskSky, twilight * 0.35);
    scene.fog = fog;
    fog.color.copy(colors.nightFog).lerp(colors.dayFog, daylight);
    terrain.waterMaterial.uniforms.light.value = 0.3 + 0.7 * daylight;
    renderer.toneMappingExposure = 1.55 - 0.15 * daylight;
    onLightingChange({ time, period });
  }
  updateLighting();
  const lightingInterval = window.setInterval(updateLighting, 60_000);
  document.addEventListener('visibilitychange', updateLighting);

  function resize() {
    const width = container.clientWidth, height = container.clientHeight;
    if (!width || !height) return;
    const mobile = width < 650;
    if (mobile !== mobileLayout) {
      const scale = mobile ? 1.5 : 1 / 1.5;
      const mapView = activeView === 'top' || activeView === 'hiking';
      camera.position.sub(controls.target).multiplyScalar(mapView && !cleanMode ? 1 : scale).add(controls.target);
      if (savedView) savedView.position.sub(savedView.target).multiplyScalar(mapView ? 1 : scale).add(savedView.target);
      tween = null;
      mobileLayout = mobile;
    }
    camera.aspect = width / height;
    camera.fov = mobile ? 60 : 39;
    if (mobile && !cleanMode && activeView !== 'top' && activeView !== 'hiking') camera.setViewOffset(width, height, 0, -height * 0.1, width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    labels.setSize(width, height);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  function animate() {
    frameId = requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    if (tween) {
      const t = clamp((elapsed - tween.start) / 1.25, 0, 1), smooth = t * t * (3 - 2 * t);
      camera.position.copy(tween.position).lerp(tween.toPosition, smooth);
      controls.target.copy(tween.target).lerp(tween.toTarget, smooth);
      if (t === 1) tween = null;
    }
    controls.autoRotate = motion && !cleanMode && !immersiveMode && !tween && activeView !== 'top' && activeView !== 'hiking'
      && !builtModels.anchors.has(activeView);
    controls.update();
    forest.update(camera, container.clientHeight, elapsed);
    builtModels.update(camera, container.clientHeight, elapsed);
    compass.style.transform = `rotate(${Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z)}rad)`;
    if (motion && !cleanMode) terrain.waterMaterial.uniforms.time.value = elapsed;
    renderer.render(scene, camera);
    layoutLandmarkLabels(sights.labels, camera, container.clientWidth, container.clientHeight);
    labels.render(scene, camera);
  }
  animate();

  return {
    setImmersiveMode(value) { immersiveMode = value; },
    setPointCategory(category) { sights.setCategory(category); },
    setView(name) {
      const view = VIEWS[name] || scenicViews[name];
      if (!view) return;
      activeView = name;
      routes.visible = !cleanMode && !builtModels.anchors.has(name);
      hikes.visible = !cleanMode && !builtModels.anchors.has(name);
      sights.setActive(name);
      labels.domElement.classList.toggle('is-route-view', name === 'top');
      labels.domElement.classList.toggle('is-hiking-view', name === 'hiking');
      resize();
      tween = { start: clock.getElapsedTime(), position: camera.position.clone(), target: controls.target.clone(),
        toPosition: positionFor(view), toTarget: new THREE.Vector3(...view.target) };
    },
    toggleMotion() { motion = !motion; onMotionChange(motion); return motion; },
    isMotionOn: () => motion,
    isCleanMode: () => cleanMode,
    toggleCleanMode() {
      cleanMode = !cleanMode;
      renderer.shadowMap.enabled = !cleanMode;
      terrain.waterMaterial.uniforms.glintStrength.value = cleanMode ? 0 : 1;
      tween = null;
      sights.group.visible = !cleanMode;
      routes.visible = !cleanMode && !builtModels.anchors.has(activeView);
      hikes.visible = !cleanMode && !builtModels.anchors.has(activeView);
      if (cleanMode) {
        savedView = { position: camera.position.clone(), target: controls.target.clone() };
        camera.position.copy(positionFor(VIEWS.overview));
        controls.target.set(...VIEWS.overview.target);
        scene.background.set('#65787a');
        scene.fog = null;
        ambient.color.set('#ffffff');
        ambient.groundColor.set('#ffffff');
        ambient.intensity = 3;
        sunlight.intensity = 0;
        moonlight.intensity = 0;
        terrain.waterMaterial.uniforms.light.value = 1;
        renderer.toneMappingExposure = 1.25;
      } else {
        camera.position.copy(savedView.position);
        controls.target.copy(savedView.target);
        moonlight.color.set('#a9c5e5');
        savedView = null;
        updateLighting();
      }
      resize();
      controls.update();
      return cleanMode;
    },
    dispose() {
      cancelAnimationFrame(frameId);
      window.clearInterval(lightingInterval);
      document.removeEventListener('visibilitychange', updateLighting);
      observer.disconnect();
      disposeShiftPan();
      controls.dispose();
      const geometries = new Set(), materials = new Set();
      scene.traverse((object) => {
        if (object.isInstancedMesh) object.dispose();
        if (object.geometry) geometries.add(object.geometry);
        if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}
