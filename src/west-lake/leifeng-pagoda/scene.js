import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createLandmarkIcon } from '../../shared/landmark-icons.js';
import { createLeifengModel } from './model.js';
import { enableShiftPan } from '../../shared/scene-controls.js';
import { createLandmarkIconScaler } from '../../shared/landmark-scale.js';
import { layoutLandmarkLabels } from '../../shared/landmark-layout.js';
import { applyScenicEntryProjection, applyScenicEntryView } from '../../shared/scenic-entry-view.js';
import { leifengContent as content } from '../scenic-content.js';

const INITIAL_VIEW = {
  position: [48, 34, 52],
  target: [0, 14, 0],
};
const MOBILE_INITIAL_VIEW = {
  position: [62, 24, 67],
  target: [0, -2, 0],
};

const HOTSPOT_ANCHORS = {
  tower: 'tower',
  base: 'base',
  eaves: 'eaves',
  'lake-view': 'lakeView',
};

const HOTSPOT_VIEWS = {
  tower: { offset: [30, 15, 34], targetOffset: [0, 2, 0] },
  base: { offset: [24, 8, 28], targetOffset: [0, 1.5, 0] },
  eaves: { position: [29, 32, 35], target: [0, 25, 0] },
  'lake-view': { position: [8.4, 18, -7.4], target: [0, 4, -68] },
};

function vectorFrom(value, fallback) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value) && value.length >= 3) return new THREE.Vector3(value[0], value[1], value[2]);
  return fallback.clone();
}

function createLake() {
  const geometry = new THREE.PlaneGeometry(180, 140, 1, 1);
  const material = new THREE.MeshPhysicalMaterial({
    color: '#477b80',
    roughness: 0.34,
    metalness: 0.05,
    transparent: true,
    opacity: 0.88,
  });
  const lake = new THREE.Mesh(geometry, material);
  lake.name = 'leifeng-exhibition-lake';
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(0, -1.1, -82);
  lake.receiveShadow = true;
  return lake;
}

function createDistantMountains() {
  const group = new THREE.Group();
  group.name = 'leifeng-distant-mountains';
  const material = new THREE.MeshStandardMaterial({ color: '#42645e', roughness: 1, flatShading: true });
  [
    [-72, -1.1, -137, 38, 11, 20],
    [-35, -1.1, -139, 42, 15, 22],
    [4, -1.1, -141, 34, 10, 19],
    [40, -1.1, -138, 41, 16, 22],
    [78, -1.1, -136, 35, 12, 20],
  ].forEach(([x, y, z, radius, height, depth]) => {
    const mountain = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2),
      material,
    );
    mountain.position.set(x, y, z);
    mountain.scale.set(radius, height, depth);
    mountain.rotation.y = x * 0.013;
    mountain.receiveShadow = true;
    group.add(mountain);
  });
  return group;
}

function disposeSceneResources(scene) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  scene?.traverse((object) => {
    if (object.isInstancedMesh) object.dispose?.();
    object.shadow?.dispose?.();
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    list.forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value);
      });
    });
  });
  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

export function createScene(initialContext = {}) {
  let mounted = false;
  let disposed = false;
  let frameId = 0;
  let renderer = null;
  let labelRenderer = null;
  let resizeObserver = null;
  let controls = null;
  let disposeShiftPan = null;
  let scene = null;
  let camera = null;
  let container = null;
  let onHotspot = null;
  let tween = null;
  let reducedMotion = false;
  let clock = null;
  let transitionAnimations = [];
  const hotspotElements = new Map();
  const hotspotListeners = new Map();
  const landmarkLabels = [];
  let landmarkIconScaler;
  const views = new Map();
  let entryView = null;
  let entrySettlement = null;

  function resize() {
    if (!mounted || !container?.clientWidth || !container?.clientHeight) return;
    const { clientWidth: width, clientHeight: height } = container;
    camera.aspect = width / height;
    if (entryView) applyScenicEntryProjection(camera, entryView, width, height);
    else {
      camera.zoom = 1;
      camera.clearViewOffset();
      camera.fov = width < 650 ? 55 : 39;
      camera.updateProjectionMatrix();
    }
    renderer.setSize(width, height, false);
    labelRenderer.setSize(width, height);
  }

  function restorePresetProjection() {
    if (!entryView) return;
    entryView = null;
    entrySettlement = null;
    scene.fog.near = 78;
    scene.fog.far = 190;
    resize();
  }

  function moveTo(view) {
    if (!mounted || !view) return false;
    if (reducedMotion) {
      camera.position.copy(view.position);
      controls.target.copy(view.target);
      controls.update();
      tween = null;
      return true;
    }
    tween = {
      start: clock.getElapsedTime(),
      fromPosition: camera.position.clone(),
      toPosition: view.position.clone(),
      fromTarget: controls.target.clone(),
      toTarget: view.target.clone(),
    };
    return true;
  }

  function setActive(id) {
    hotspotElements.forEach((element, key) => {
      element.classList.toggle('is-active', key === id);
      element.setAttribute('aria-pressed', String(key === id));
    });
  }

  function selectHotspot(id) {
    if (!mounted || !views.has(id)) return false;
    restorePresetProjection();
    setActive(id);
    const view = id === 'eaves' && container.clientWidth < 650
      ? { position: new THREE.Vector3(32, 24, 39), target: new THREE.Vector3(0, 16, 0) }
      : views.get(id);
    moveTo(view);
    onHotspot?.(id);
    return true;
  }

  function resetView() {
    if (!mounted) return false;
    restorePresetProjection();
    setActive(null);
    const view = container.clientWidth < 650 ? MOBILE_INITIAL_VIEW : INITIAL_VIEW;
    moveTo({
      position: new THREE.Vector3(...view.position),
      target: new THREE.Vector3(...view.target),
    });
    onHotspot?.(null);
    return true;
  }

  function addHotspots(model) {
    content.hotspots.forEach((item) => {
      const fallback = item.id === 'lake-view'
        ? new THREE.Vector3(0, 7, -24)
        : new THREE.Vector3(0, item.id === 'base' ? 4 : item.id === 'eaves' ? 25 : 17, 0);
      const anchor = vectorFrom(model.anchors?.[HOTSPOT_ANCHORS[item.id]], fallback);
      const marker = new THREE.Group();
      marker.name = `leifeng-hotspot-${item.id}`;
      marker.position.copy(anchor);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'scenic-hotspot is-attraction leifeng-scene-hotspot';
      button.dataset.hotspotId = item.id;
      button.setAttribute('aria-label', `查看${item.name}`);
      button.setAttribute('aria-pressed', 'false');
      const label = document.createElement('span');
      label.textContent = item.name;
      button.append(createLandmarkIcon(item.id === 'lake-view' ? 'lake' : 'temple'), label);
      const activate = () => selectHotspot(item.id);
      button.addEventListener('click', activate);
      hotspotElements.set(item.id, button);
      hotspotListeners.set(item.id, activate);

      const tag = new CSS2DObject(button);
      marker.add(tag);
      scene.add(marker);
      landmarkLabels.push(tag);

      const config = HOTSPOT_VIEWS[item.id];
      views.set(item.id, {
        position: config.position
          ? new THREE.Vector3(...config.position)
          : anchor.clone().add(new THREE.Vector3(...config.offset)),
        target: config.target
          ? new THREE.Vector3(...config.target)
          : anchor.clone().add(new THREE.Vector3(...config.targetOffset)),
      });
    });
  }

  function animate() {
    if (!mounted || disposed) return;
    frameId = requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    if (tween) {
      const progress = THREE.MathUtils.clamp((elapsed - tween.start) / 1.05, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      camera.position.copy(tween.fromPosition).lerp(tween.toPosition, eased);
      controls.target.copy(tween.fromTarget).lerp(tween.toTarget, eased);
      if (progress === 1) tween = null;
    }
    controls.update();
    landmarkIconScaler?.();
    layoutLandmarkLabels(landmarkLabels, camera, container.clientWidth, container.clientHeight);
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  function mount(context = initialContext) {
    if (disposed) throw new Error('Cannot mount a disposed Leifeng Pagoda scene');
    if (mounted) return;
    container = context.container;
    if (!(container instanceof HTMLElement)) throw new TypeError('Leifeng Pagoda scene requires a container element');
    onHotspot = typeof context.onHotspot === 'function' ? context.onHotspot : null;
    entryView = context.entryView ?? null;
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Mark ownership before allocating GPU/DOM resources so the session can
    // safely dispose a partially mounted scene if any following step throws.
    mounted = true;

    scene = new THREE.Scene();
    scene.name = 'leifeng-pagoda-scenic-scene';
    scene.userData.lightingMode = 'fixed-exhibition-lighting';
    scene.background = new THREE.Color('#456064');
    scene.fog = new THREE.Fog('#456064', 78, 190);
    camera = new THREE.PerspectiveCamera(39, 1, 0.1, 260);
    const initialView = container.clientWidth < 650 ? MOBILE_INITIAL_VIEW : INITIAL_VIEW;
    camera.position.set(...initialView.position);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.domElement.className = 'scenic-arrival-canvas';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = 'trailhead-overlay leifeng-hotspot-overlay';
    container.appendChild(labelRenderer.domElement);

    const model = createLeifengModel();
    scene.add(model.group, createLake(), createDistantMountains());
    addHotspots(model);

    const ambient = new THREE.HemisphereLight('#f4f5ef', '#244541', 2.25);
    const keyLight = new THREE.DirectionalLight('#fff3df', 3.4);
    keyLight.position.set(44, 62, 35);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -45;
    keyLight.shadow.camera.right = keyLight.shadow.camera.top = 45;
    keyLight.shadow.normalBias = 0.025;
    scene.add(ambient, keyLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...initialView.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.minDistance = 7;
    controls.maxDistance = 105;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.update();
    controls.addEventListener('start', cancelTween);
    disposeShiftPan = enableShiftPan(controls);

    clock = new THREE.Clock();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
    if (entryView) {
      const towerBounds = new THREE.Box3().setFromObject(model.group.getObjectByName('leifeng-tower'));
      entrySettlement = applyScenicEntryView(
        camera, controls, entryView, towerBounds, container.clientWidth, container.clientHeight,
      );
      const distance = Math.max(
        camera.position.distanceTo(controls.target),
        entrySettlement?.position.distanceTo(entrySettlement.target) ?? 0,
      );
      scene.fog.near = Math.max(scene.fog.near, distance * 1.5);
      scene.fog.far = Math.max(scene.fog.far, distance * 3);
    }
    landmarkIconScaler = createLandmarkIconScaler(landmarkLabels, camera, controls.target);
    animate();
  }

  function cancelTween() {
    tween = null;
    entrySettlement = null;
  }

  async function fade(from, to, { signal } = {}) {
    if (!mounted || disposed || signal?.aborted) return false;
    const elements = [renderer.domElement, labelRenderer.domElement];
    if (reducedMotion) {
      elements.forEach((element) => { element.style.opacity = String(to); });
      return true;
    }
    const animations = elements.map((element) => element.animate(
      [{ opacity: from }, { opacity: to }],
      { duration: 1100, easing: 'ease-in-out', fill: 'forwards' },
    ));
    transitionAnimations = animations;
    const abort = () => animations.forEach((animation) => animation.cancel());
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await Promise.all(animations.map((animation) => animation.finished));
      if (disposed || signal?.aborted) return false;
      elements.forEach((element) => { element.style.opacity = String(to); });
      return true;
    } catch (error) {
      if (disposed || signal?.aborted) return false;
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
      abort();
      transitionAnimations = [];
    }
  }

  async function reveal(options) {
    const revealed = await fade(0, 1, options);
    if (!revealed || !entrySettlement) return revealed;
    const settled = entrySettlement;
    entrySettlement = null;
    moveTo(settled);
    return true;
  }
  function conceal(options) {
    cancelTween();
    if (controls) controls.enabled = false;
    return fade(1, 0, options);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    transitionAnimations.forEach((animation) => animation.cancel());
    if (!mounted) return;
    mounted = false;
    cancelAnimationFrame(frameId);
    resizeObserver?.disconnect();
    controls?.removeEventListener('start', cancelTween);
    disposeShiftPan?.();
    controls?.dispose();
    hotspotElements.forEach((element, id) => element.removeEventListener('click', hotspotListeners.get(id)));
    hotspotElements.clear();
    hotspotListeners.clear();
    landmarkLabels.length = 0;
    views.clear();
    disposeSceneResources(scene);
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
    labelRenderer?.domElement.remove();
    scene = null;
    camera = null;
    renderer = null;
    labelRenderer = null;
    controls = null;
    resizeObserver = null;
    container = null;
    onHotspot = null;
    tween = null;
    entryView = null;
    entrySettlement = null;
  }

  return { mount, reveal, conceal, selectHotspot, resetView, dispose };
}
