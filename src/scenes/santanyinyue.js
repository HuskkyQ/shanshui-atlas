import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createLandmarkIcon } from '../landmark-icons.js';
import { createSantanModel } from '../models/santanyinyue.js';
import { enableShiftPan } from '../scene-controls.js';
import { santanContent as content } from '../scenic-content.js';

const OVERVIEW_VIEWS = {
  desktop: { position: [8, 22, 54], target: [4, 3.6, -3] },
  mobile: { position: [10, 28, 68], target: [0, -5, -3] },
};

const HOTSPOT_ANCHORS = {
  towers: 'towers',
  'tower-detail': 'towerDetail',
  island: 'island',
  'moon-view': 'moonView',
};

const HOTSPOT_VIEWS = {
  towers: { position: [7, 16, 44], mobilePosition: [8, 26, 75], target: [2.5, 3.7, 0.5], mobileTarget: [0, -7, 0.5] },
  'tower-detail': { offset: [10, 4.5, 14], targetOffset: [0, 0, 0], mobilePosition: [10, 14, 35], mobileTarget: [0, -3, 10] },
  island: { offset: [27, 9, 25], targetOffset: [0, 0.5, 0], mobilePosition: [6, 16, 18], mobileTarget: [-17, -8, -22] },
  'moon-view': { position: [30, 6.5, 23], target: [16, 0.1, 8] },
};

function vectorFrom(value, fallback) {
  if (value?.isVector3) return value.clone();
  if (Array.isArray(value) && value.length >= 3) return new THREE.Vector3(value[0], value[1], value[2]);
  return fallback.clone();
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
  const views = new Map();

  function overviewView() {
    return container?.clientWidth < 650 ? OVERVIEW_VIEWS.mobile : OVERVIEW_VIEWS.desktop;
  }

  function resize() {
    if (!mounted || !container?.clientWidth || !container?.clientHeight) return;
    const { clientWidth: width, clientHeight: height } = container;
    camera.aspect = width / height;
    camera.fov = width < 650 ? 55 : 40;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    labelRenderer.setSize(width, height);
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
    setActive(id);
    moveTo(views.get(id));
    onHotspot?.(id);
    return true;
  }

  function resetView() {
    if (!mounted) return false;
    setActive(null);
    const overview = overviewView();
    moveTo({
      position: new THREE.Vector3(...overview.position),
      target: new THREE.Vector3(...overview.target),
    });
    onHotspot?.(null);
    return true;
  }

  function addHotspots(model) {
    content.hotspots.forEach((item) => {
      const fallback = item.id === 'island'
        ? new THREE.Vector3(-17, 3, -21)
        : item.id === 'moon-view'
          ? new THREE.Vector3(18, 0.2, 10)
          : new THREE.Vector3(0, item.id === 'tower-detail' ? 4.5 : 3.5, 1);
      const anchor = vectorFrom(model.anchors?.[HOTSPOT_ANCHORS[item.id]], fallback);
      const marker = new THREE.Group();
      marker.name = `santan-hotspot-${item.id}`;
      marker.position.copy(anchor);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'scenic-hotspot is-attraction leifeng-scene-hotspot santan-scene-hotspot';
      button.dataset.hotspotId = item.id;
      button.setAttribute('aria-label', `查看${item.name}`);
      button.setAttribute('aria-pressed', 'false');
      const label = document.createElement('span');
      label.textContent = item.name;
      button.append(createLandmarkIcon(['towers', 'tower-detail'].includes(item.id) ? 'temple' : 'lake'), label);
      const activate = () => selectHotspot(item.id);
      button.addEventListener('click', activate);
      hotspotElements.set(item.id, button);
      hotspotListeners.set(item.id, activate);

      const tag = new CSS2DObject(button);
      marker.add(tag);
      scene.add(marker);

      const config = HOTSPOT_VIEWS[item.id];
      const configuredPosition = container.clientWidth < 650 && config.mobilePosition
        ? config.mobilePosition
        : config.position;
      const configuredTarget = container.clientWidth < 650 && config.mobileTarget
        ? config.mobileTarget
        : config.target;
      views.set(item.id, {
        position: configuredPosition
          ? new THREE.Vector3(...configuredPosition)
          : anchor.clone().add(new THREE.Vector3(...config.offset)),
        target: configuredTarget
          ? new THREE.Vector3(...configuredTarget)
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
    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  }

  function mount(context = initialContext) {
    if (disposed) throw new Error('Cannot mount a disposed Santanyinyue scene');
    if (mounted) return;
    container = context.container;
    if (!(container instanceof HTMLElement)) throw new TypeError('Santanyinyue scene requires a container element');
    onHotspot = typeof context.onHotspot === 'function' ? context.onHotspot : null;
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    mounted = true;

    scene = new THREE.Scene();
    scene.name = 'santanyinyue-scenic-scene';
    scene.userData.lightingMode = 'fixed-exhibition-lighting';
    scene.background = new THREE.Color('#6c8587');
    scene.fog = new THREE.Fog('#6c8587', 68, 150);
    camera = new THREE.PerspectiveCamera(40, 1, 0.1, 190);
    const overview = overviewView();
    camera.position.set(...overview.position);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.domElement.className = 'scenic-arrival-canvas';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = 'trailhead-overlay leifeng-hotspot-overlay santan-hotspot-overlay';
    container.appendChild(labelRenderer.domElement);

    const model = createSantanModel();
    scene.add(model.group);
    addHotspots(model);

    const ambient = new THREE.HemisphereLight('#fff2d2', '#294f53', 2.45);
    const keyLight = new THREE.DirectionalLight('#ffe0ae', 3.25);
    keyLight.position.set(37, 46, 31);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -42;
    keyLight.shadow.camera.right = keyLight.shadow.camera.top = 42;
    keyLight.shadow.normalBias = 0.024;
    scene.add(ambient, keyLight);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...overview.target);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.minDistance = 6;
    controls.maxDistance = 92;
    controls.minPolarAngle = 0.12;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.update();
    controls.addEventListener('start', cancelTween);
    disposeShiftPan = enableShiftPan(controls);

    clock = new THREE.Clock();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();
    animate();
  }

  function cancelTween() {
    tween = null;
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

  const reveal = (options) => fade(0, 1, options);
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
  }

  return { mount, reveal, conceal, selectHotspot, resetView, dispose };
}
