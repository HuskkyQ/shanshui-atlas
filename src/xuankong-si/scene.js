import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createLandmarkIcon } from '../shared/landmark-icons.js';
import { enableShiftPan } from '../shared/scene-controls.js';
import { createLandmarkIconScaler } from '../shared/landmark-scale.js';
import { layoutLandmarkLabels } from '../shared/landmark-layout.js';
import { createCompass } from '../shared/compass.js';
import { createAutoRoam } from '../shared/auto-roam.js';
import { createExhibitControls } from '../shared/exhibit-controls.js';
import { createXuankongModel } from './model.js';
import content from '../content/xuankong-si.json' with { type: 'json' };
import { SCENE_COLORS } from '../shared/scene-palette.js';

export function createScene(initialContext = {}) {
  let mounted = false;
  let disposed = false;
  let frameId = 0;
  let renderer, labels, controls, camera, scene, container, model, keyLight, fillLight, compass, roam, exhibitUI;
  let resizeObserver, removeShiftPan, onHotspot, tween = null;
  let selectedId = null;
  let sideView = false;
  let viewIsControlled = true;
  let immersive = false;
  let reducedMotion = false;
  let animations = [];
  const bounds = new THREE.Box3();
  const fullBounds = new THREE.Box3();
  const buildingBounds = new Map();
  const markers = new Map();
  const landmarkLabels = [];
  const listeners = [];
  let landmarkIconScaler;

  function listen(element, event, handler) {
    element.addEventListener(event, handler);
    listeners.push(() => element.removeEventListener(event, handler));
  }

  function fitView(box, { close = false, sideView = false, structure = false } = {}) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const mobile = container.clientWidth < 650;
    const direction = sideView
      ? new THREE.Vector3(0.95, 0.24, 1).normalize()
      : structure
        ? new THREE.Vector3(0.42, -0.12, 1).normalize()
        : close
          ? new THREE.Vector3(-0.32, 0.34, 1).normalize()
          : new THREE.Vector3(-0.18, 0.20, 1).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * camera.aspect;
    const fractionX = mobile ? 0.84 : close ? 0.58 : 0.67;
    const fractionY = mobile ? (immersive ? 0.72 : 0.43) : 0.70;
    let distance = 0;
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const corner = new THREE.Vector3(x * size.x / 2, y * size.y / 2, z * size.z / 2);
      const depth = corner.dot(direction);
      distance = Math.max(distance,
        depth + Math.abs(corner.dot(right)) / (tanH * fractionX),
        depth + Math.abs(corner.dot(up)) / (tanV * fractionY));
    }
    distance = Math.max(close ? 8 : 28, distance * 1.08);
    const shift = mobile || immersive ? new THREE.Vector3() : right.multiplyScalar(size.x * 0.11);
    const target = center.add(shift);
    return { position: target.clone().addScaledVector(direction, distance), target };
  }

  function currentView() {
    const close = Boolean(selectedId && selectedId !== 'cliff');
    return fitView(selectedId === 'cliff' ? fullBounds : close ? buildingBounds.get(selectedId) : bounds, {
      close,
      sideView: sideView && !selectedId,
      structure: selectedId === 'structure',
    });
  }

  function moveTo(view, animate = true) {
    if (!mounted || disposed) return;
    if (!animate || reducedMotion) {
      camera.position.copy(view.position);
      controls.target.copy(view.target);
      tween = null;
      controls.autoRotate = false;
      controls.update();
      return;
    }
    tween = {
      start: performance.now(),
      from: camera.position.clone(),
      to: view.position,
      fromTarget: controls.target.clone(),
      toTarget: view.target.clone(),
    };
  }

  function resize() {
    if (!mounted || !container.clientWidth || !container.clientHeight) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.fov = width < 650 ? 52 : 40;
    camera.setViewOffset(width, height, 0, height * (immersive ? 0 : width < 650 ? 0.1 : 0.015), width, height);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    labels.setSize(width, height);
    if (viewIsControlled) moveTo(currentView(), false);
  }

  function setActive(id) {
    markers.forEach(({ button }, key) => {
      button.classList.toggle('is-active', key === id);
      button.setAttribute('aria-pressed', String(key === id));
    });
  }

  function selectHotspot(id, { animate = true } = {}) {
    if (!mounted || !buildingBounds.has(id)) return false;
    selectedId = id;
    sideView = false;
    viewIsControlled = true;
    setActive(id);
    moveTo(currentView(), animate);
    onHotspot?.(id);
    return true;
  }

  function resetView() {
    if (!mounted) return false;
    selectedId = null;
    sideView = false;
    viewIsControlled = true;
    setActive(null);
    moveTo(currentView());
    onHotspot?.(null);
    return true;
  }

  function setSideView() {
    if (!mounted) return false;
    selectedId = null;
    sideView = true;
    viewIsControlled = true;
    setActive(null);
    moveTo(currentView());
    onHotspot?.(null);
    return true;
  }

  function setImmersive(value) {
    immersive = value;
    exhibitUI?.setImmersive(value);
    resize();
  }

  function cancelTween() {
    tween = null;
    viewIsControlled = false;
  }

  function animate(time) {
    if (!mounted || disposed) return;
    frameId = requestAnimationFrame(animate);
    if (tween) {
      const progress = THREE.MathUtils.clamp((time - tween.start) / 1050, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      camera.position.copy(tween.from).lerp(tween.to, eased);
      controls.target.copy(tween.fromTarget).lerp(tween.toTarget, eased);
      if (progress === 1) tween = null;
    }
    exhibitUI?.update();
    controls.update(roam?.update(time));
    landmarkIconScaler?.();
    layoutLandmarkLabels(landmarkLabels, camera, container.clientWidth, container.clientHeight);
    compass?.update(camera);
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  function mount(context = initialContext) {
    if (disposed) throw new Error('Cannot mount a disposed Xuankong Temple scene');
    if (mounted) return;
    container = context.container;
    if (!(container instanceof HTMLElement)) throw new TypeError('Xuankong Temple scene requires a container');
    onHotspot = context.onHotspot;
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(SCENE_COLORS.paper);
      camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.domElement.className = 'xuankong-canvas';
      renderer.domElement.setAttribute('aria-label', '拖动旋转，滚轮缩放，Shift 加左键平移');
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);
      compass = createCompass(container, { north: [1, 0, 0], reference: 'geographic' });
      labels = new CSS2DRenderer();
      labels.domElement.className = 'xuankong-hotspot-overlay';
      container.appendChild(labels.domElement);
      model = createXuankongModel();
      scene.add(model.group);
      const focusBuildings = content.hotspots.map((item) => {
        const building = model.group.getObjectByName(`building-${item.id}`);
        if (!building || !model.anchors[item.id]) throw new Error(`Missing Xuankong Temple building: ${item.id}`);
        return building;
      });
      fullBounds.setFromObject(model.group);
      bounds.makeEmpty();
      content.hotspots.forEach((item, index) => {
        if (!['cliff', 'structure'].includes(item.id)) bounds.expandByObject(focusBuildings[index]);
      });
      bounds.expandByVector(new THREE.Vector3(5, 7, 4));
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const extent = Math.max(size.x, size.z);
      scene.fog = new THREE.Fog(SCENE_COLORS.dayFog, extent * 5, extent * 9);
      camera.far = extent * 12;
      content.hotspots.forEach((item) => {
        const building = model.group.getObjectByName(`building-${item.id}`);
        const anchor = model.anchors[item.id];
        if (!building || !anchor) throw new Error(`Missing Xuankong Temple building: ${item.id}`);
        buildingBounds.set(item.id, new THREE.Box3().setFromObject(building).expandByScalar(1.4));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'xuankong-hotspot';
        button.dataset.hotspotId = item.id;
        button.setAttribute('aria-label', `查看${item.name}`);
        button.setAttribute('aria-pressed', 'false');
        const label = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = item.name;
        label.append(name);
        button.append(createLandmarkIcon('temple'), label);
        listen(button, 'click', () => selectHotspot(item.id));
        const marker = new CSS2DObject(button);
        marker.position.copy(anchor);
        scene.add(marker);
        markers.set(item.id, { button, marker });
        landmarkLabels.push(marker);
      });
      const hemisphere = new THREE.HemisphereLight('#e7f1f2', '#5c5946', 2.2);
      keyLight = new THREE.DirectionalLight('#fff0d2', 3.0);
      keyLight.position.copy(center).add(new THREE.Vector3(-extent, extent * 1.5, extent * 1.6));
      keyLight.target.position.copy(center);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -extent * 0.7;
      keyLight.shadow.camera.right = keyLight.shadow.camera.top = extent * 0.7;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = extent * 4;
      keyLight.shadow.normalBias = 0.12;
      fillLight = new THREE.DirectionalLight('#d6e4e7', 0.8);
      fillLight.position.copy(center).add(new THREE.Vector3(extent, size.y * 0.35, extent));
      fillLight.target.position.copy(center);
      scene.add(hemisphere, keyLight, keyLight.target, fillLight, fillLight.target);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.065;
      controls.minDistance = 3;
      controls.maxDistance = extent * 5;
      controls.minPolarAngle = 0.1;
      controls.maxPolarAngle = Math.PI * 0.57;
      controls.addEventListener('start', cancelTween);
      removeShiftPan = enableShiftPan(controls);
      exhibitUI = createExhibitControls({ container, scene, renderer, controls });
      roam = createAutoRoam({ controls, container, canRoam: () => !tween && !selectedId && !sideView && !immersive });
      mounted = true;
      resize();
      landmarkIconScaler = createLandmarkIconScaler(landmarkLabels, camera, controls.target);
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      frameId = requestAnimationFrame(animate);
    } catch (error) {
      dispose();
      throw error;
    }
  }

  async function reveal() {
    if (!mounted || disposed || reducedMotion) return !disposed;
    animations = [renderer.domElement, labels.domElement].map((element) => element.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 720, easing: 'ease-out', fill: 'forwards',
    }));
    const currentAnimations = animations;
    try {
      await Promise.all(currentAnimations.map((animation) => animation.finished));
      return !disposed;
    } catch { return false; }
    finally {
      currentAnimations.forEach((animation) => animation.cancel());
      if (animations === currentAnimations) animations = [];
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    mounted = false;
    cancelAnimationFrame(frameId);
    animations.forEach((animation) => animation.cancel());
    animations = [];
    resizeObserver?.disconnect();
    removeShiftPan?.();
    controls?.removeEventListener('start', cancelTween);
    roam?.dispose();
    exhibitUI?.dispose();
    exhibitUI = null;
    controls?.dispose();
    listeners.forEach((remove) => remove());
    markers.forEach(({ marker }) => marker.removeFromParent());
    markers.clear();
    landmarkLabels.length = 0;
    buildingBounds.clear();
    model?.dispose?.();
    keyLight?.shadow.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    compass?.dispose();
    compass = null;
    renderer?.domElement.remove();
    labels?.domElement.remove();
    scene?.clear();
    scene = null;
    model = null;
    tween = null;
  }

  return { mount, selectHotspot, resetView, setSideView, setImmersive, reveal, dispose };
}
