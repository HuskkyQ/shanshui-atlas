import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { enableShiftPan } from '../shared/scene-controls.js';
import { layout } from './layout.js';
import { createNavigation } from './navigation.js';
import { createZhouzhuangModel } from './model.js';
import { createWalkControls } from './walk-controls.js';
import { createCompass } from '../shared/compass.js';
import { createAutoRoam } from '../shared/auto-roam.js';
import { createExhibitControls } from '../shared/exhibit-controls.js';
import { SCENE_COLORS } from '../shared/scene-palette.js';

export function createScene({ container, onMode = () => {} }) {
  let renderer, camera, world, model, orbit, walk, light, observer, removeShiftPan, compass, roam, exhibitUI;
  let frame = 0;
  let lastTime = 0;
  let disposed = false;
  let mounted = false;
  let mode = 'overview';
  let entering = false;
  let savedView = null;
  let savedRoamEligible = true;
  let overviewView;
  let districtExtent = 250;
  let startedAt = 0;
  let walkRequest = 0;
  let roamEligible = true;
  let immersiveMode = false;
  let shadowRefreshPending = false;
  let lastShadowRefresh = -Infinity;

  function setImmersive(value) {
    immersiveMode = Boolean(value);
    exhibitUI?.setImmersive(immersiveMode);
  }

  function updateHousing() {
    if (!model.update(camera, { walking: mode === 'walking' })) return;
    shadowRefreshPending = true;
    container.dataset.renderedHouses = model.housingStats.visibleHouseCount;
    container.dataset.detailedHouses = model.housingStats.detailedHouseCount;
  }

  function updateDepthRange() {
    const distance = camera.position.distanceTo(orbit.target);
    const near = mode === 'walking' ? 0.08 : Math.max(0.5, distance / 80);
    const far = mode === 'walking' ? Math.max(1200, districtExtent * 2) : distance + districtExtent * 1.5 + 50;
    if (Math.abs(camera.near-near)>0.01 || Math.abs(camera.far-far)>0.1) {
      camera.near=near;
      camera.far=far;
      camera.updateProjectionMatrix();
    }
  }

  function setView(position, target) {
    orbit.autoRotate = false;
    const damping=orbit.enableDamping;
    orbit.enableDamping=false;
    orbit.update();
    camera.position.copy(position);
    orbit.target.copy(target);
    orbit.update();
    orbit.enableDamping=damping;
    updateDepthRange();
  }

  function handleMode(state) {
    if (disposed) return;
    entering = false;
    mode = state.mode;
    roamEligible = mode === 'overview';
    orbit.enabled = mode !== 'walking';
    camera.fov = mode === 'walking' ? 65 : 43;
    camera.updateProjectionMatrix();
    if (mode === 'overview' && savedView) {
      setView(savedView.position, savedView.target);
      roamEligible = savedRoamEligible;
      savedView = null;
    }
    renderer.domElement.setAttribute('aria-label', mode === 'walking'
      ? '周庄第一人称行走：WASD或方向键移动，鼠标环视，Esc返回整体观察'
      : '周庄三维街区：拖动旋转、滚轮缩放、Shift加拖动平移');
    exhibitUI?.update({ walking: mode === 'walking' });
    onMode(state);
  }

  function resize() {
    if (!mounted || disposed || !container.clientWidth || !container.clientHeight) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight, false);
  }

  function animate(time) {
    if (disposed || !mounted) return;
    frame = requestAnimationFrame(animate);
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    const roamDelta = roam?.update(time) ?? dt;
    if (mode === 'walking') walk.update(dt);
    else if (!entering) orbit.update(roamDelta);
    updateDepthRange();
    updateHousing();
    if (shadowRefreshPending && time - lastShadowRefresh >= 100) {
      renderer.shadowMap.needsUpdate = true;
      shadowRefreshPending = false;
      lastShadowRefresh = time;
    }
    exhibitUI?.update({ walking: mode === 'walking' || entering });
    compass?.update(camera);
    renderer.render(world, camera);
    if (!container.dataset.firstFrameMs) container.dataset.firstFrameMs = (performance.now() - startedAt).toFixed(1);
    container.dataset.renderedTriangles = renderer.info.render.triangles;
  }

  function mount() {
    if (mounted || disposed) return;
    startedAt = performance.now();
    delete container.dataset.firstFrameMs;
    try {
      world = new THREE.Scene();
      world.background = new THREE.Color(SCENE_COLORS.paper);
      world.fog = new THREE.Fog(SCENE_COLORS.dayFog, 700, 1500);
      camera = new THREE.PerspectiveCamera(43, container.clientWidth/container.clientHeight, 1, 5000);
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.96;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.className = 'zhou-canvas';
      renderer.domElement.setAttribute('aria-label', '周庄三维街区：拖动旋转、滚轮缩放、Shift加拖动平移');
      container.append(renderer.domElement);
      compass = createCompass(container, { reference: 'geographic' });
      const buildStart = performance.now();
      model = createZhouzhuangModel({ progressiveLand: true });
      container.dataset.modelBuildMs = (performance.now() - buildStart).toFixed(1);
      container.dataset.terrainReady = 'false';
      model.ready.then((ready) => {
        if (disposed || !ready) return;
        container.dataset.terrainReady = 'true';
        shadowRefreshPending = true;
      });
      world.add(model.group);
      const bounds = new THREE.Box3().setFromObject(model.group);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const extent = Math.max(size.x, size.z);
      districtExtent=extent;
      world.fog = new THREE.Fog(SCENE_COLORS.dayFog, extent * 2, extent * 5);
      world.add(new THREE.HemisphereLight('#f1f3e9', '#77745e', 1.8));
      light = new THREE.DirectionalLight('#fff1ce', 2.4);
      light.position.copy(center).add(new THREE.Vector3(-extent*0.5,extent*0.85,extent*0.45));
      light.target.position.copy(center);
      light.castShadow = true;
      light.shadow.mapSize.set(2048, 2048);
      light.shadow.camera.left = light.shadow.camera.bottom = -extent * 0.7;
      light.shadow.camera.right = light.shadow.camera.top = extent * 0.7;
      light.shadow.camera.near = 0.5;
      light.shadow.camera.far = extent*3;
      light.shadow.normalBias = 0.25;
      light.shadow.bias = -0.0004;
      world.add(light, light.target);
      renderer.shadowMap.autoUpdate=false;
      renderer.shadowMap.needsUpdate=true;
      lastShadowRefresh = performance.now();
      const fill = new THREE.DirectionalLight('#d4e5df', 0.6);
      fill.position.set(80, 55, -70);
      world.add(fill);
      orbit = new OrbitControls(camera, renderer.domElement);
      orbit.enableDamping = true;
      orbit.dampingFactor = 0.075;
      orbit.minDistance = 5;
      orbit.maxDistance = extent * 3.5;
      orbit.maxPolarAngle = Math.PI * 0.49;
      orbit.autoRotate = false;
      removeShiftPan = enableShiftPan(orbit);
      exhibitUI = createExhibitControls({ container, scene: world, renderer, controls: orbit, onImmersive: setImmersive });
      roam = createAutoRoam({
        controls: orbit,
        container,
        canRoam: () => roamEligible && !entering && mode === 'overview' && !immersiveMode,
      });
      const direction = new THREE.Vector3(0.57, 0.93, 1).normalize();
      const target = center.clone().add(new THREE.Vector3(container.clientWidth > 700 ? -size.x*0.12 : 0,0,0));
      const distance = extent * (container.clientWidth > 700 ? 1.55 : Math.max(1.75,1.3/camera.aspect));
      overviewView = { position: target.clone().addScaledVector(direction, distance), target };
      setView(overviewView.position, overviewView.target);
      updateHousing();
      walk = createWalkControls({
        camera, element: renderer.domElement, document, window,
        navigation: createNavigation(layout.roads,{
          bounds:layout.bounds,channels:layout.channels,waterAreas:layout.waterAreas,
          landPaths:layout.landPaths,obstacles:model.obstacles,groundY:2,
        }), spawn: layout.spawn, onChange: handleMode,
      });
      mounted = true;
      resize();
      observer = new ResizeObserver(resize);
      observer.observe(container);
      frame = requestAnimationFrame(animate);
    } catch (error) {
      dispose();
      throw error;
    }
  }

  async function enterWalk() {
    if (!mounted || disposed || mode === 'walking' || entering) return;
    if (immersiveMode) setImmersive(false);
    const request = ++walkRequest;
    savedView = { position: camera.position.clone(), target: orbit.target.clone() };
    savedRoamEligible = roamEligible;
    orbit.enabled = false;
    entering = true;
    roamEligible = false;
    onMode({ mode: 'overview', message: '正在展开街巷…' });
    if (!await model.ready || disposed || request !== walkRequest) return;
    walk.enter();
  }

  function exitWalk() {
    const pending = entering;
    walkRequest++;
    entering = false;
    walk?.exit();
    if (orbit) orbit.enabled = true;
    if (pending && mode === 'overview') {
      roamEligible = savedRoamEligible;
      savedView = null;
      onMode({ mode: 'overview' });
    }
  }

  function overview() {
    if (!mounted || disposed) return;
    exitWalk();
    roamEligible = true;
    setView(overviewView.position, overviewView.target);
  }

  function topView() {
    if (!mounted || disposed) return;
    exitWalk();
    roamEligible = false;
    const target = overviewView.target.clone();
    const height = overviewView.position.distanceTo(target) * 0.92;
    setView(target.clone().add(new THREE.Vector3(0, height, 0.15)), target);
  }

  function focusBridge(id) {
    if (!mounted || disposed) return;
    const road = layout.roads.find((item) => item.id === id);
    if (!road) return;
    exitWalk();
    roamEligible = false;
    const a = road.points[0];
    const b = road.points.at(-1);
    const target = new THREE.Vector3((a.x + b.x) / 2, Math.max(a.y, b.y) + 1, (a.z + b.z) / 2);
    setView(target.clone().add(new THREE.Vector3(16, 15, 21)), target);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    walkRequest++;
    mounted = false;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    walk?.dispose();
    roam?.dispose();
    removeShiftPan?.();
    orbit?.dispose();
    model?.dispose();
    exhibitUI?.dispose();
    light?.shadow.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    compass?.dispose();
    compass = null;
    renderer?.domElement.remove();
    world?.clear();
  }

  return { mount, enterWalk, exitWalk, resetWalk: () => walk?.reset(), overview, topView, focusBridge, setImmersive, dispose };
}
