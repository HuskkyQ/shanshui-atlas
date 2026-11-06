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
import { createSceneShell, resizeSceneViewport } from '../shared/scene-shell.js';
import { createChengqiLouModel } from './model.js';
import content from '../content/chengqi-lou.json' with { type: 'json' };
import { SCENE_COLORS } from '../shared/scene-palette.js';

export function createScene(initialContext = {}) {
  let mounted = false;
  let disposed = false;
  let renderer, labels, controls, camera, scene, container, model, keyLight, fillLight, compass, roam, exhibitUI;
  let removeShiftPan, onHotspot, tween = null;
  const shell = createSceneShell();
  let selectedId = null;
  let overhead = false;
  let viewIsControlled = true;
  let immersive = false;
  let reducedMotion = false;
  let animations = [];
  const bounds = new THREE.Box3();
  const buildingBounds = new Map();
  const markers = new Map();
  const landmarkLabels = [];
  let landmarkIconScaler;

  function listen(element, event, handler) {
    shell.listen(element, event, handler);
  }

  function fitView(box, { close = false, overhead = false, interior = false } = {}) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const mobile = container.clientWidth < 650;
    const direction = overhead
      ? new THREE.Vector3(-0.16, 1, -0.18).normalize()
      : interior
        ? new THREE.Vector3(0.32, 1.7, 1).normalize()
        : close
          ? new THREE.Vector3(0.78, 0.58, 1).normalize()
          : new THREE.Vector3(-0.38, 0.94, -1).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * camera.aspect;
    const fractionX = mobile ? 0.82 : close ? 0.53 : 0.6;
    const fractionY = mobile ? (immersive ? 0.69 : 0.42) : 0.68;
    let distance = 0;
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const corner = new THREE.Vector3(x * size.x / 2, y * size.y / 2, z * size.z / 2);
      const depth = corner.dot(direction);
      distance = Math.max(distance,
        depth + Math.abs(corner.dot(right)) / (tanH * fractionX),
        depth + Math.abs(corner.dot(up)) / (tanV * fractionY));
    }
    distance = Math.max(close ? 15 : 36, distance * (overhead ? 1.16 : 1.1));
    const shift = mobile || immersive ? new THREE.Vector3() : right.multiplyScalar(size.x * 0.16);
    const target = center.add(shift);
    return { position: target.clone().addScaledVector(direction, distance), target };
  }

  function currentView() {
    const close = Boolean(selectedId && selectedId !== 'neighbors');
    return fitView(close ? buildingBounds.get(selectedId) : bounds, {
      close,
      overhead: overhead && !selectedId,
      interior: selectedId === 'inner-rings' || selectedId === 'ancestral-hall',
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
    resizeSceneViewport({ container, camera, renderer, labels, immersive });
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
    overhead = false;
    viewIsControlled = true;
    setActive(id);
    moveTo(currentView(), animate);
    onHotspot?.(id);
    return true;
  }

  function resetView() {
    if (!mounted) return false;
    selectedId = null;
    overhead = false;
    viewIsControlled = true;
    setActive(null);
    moveTo(currentView());
    onHotspot?.(null);
    return true;
  }

  function setOverheadView() {
    if (!mounted) return false;
    selectedId = null;
    overhead = true;
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
    shell.request(animate);
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
    if (disposed) throw new Error('Cannot mount a disposed Chengqi Lou scene');
    if (mounted) return;
    container = context.container;
    if (!(container instanceof HTMLElement)) throw new TypeError('Chengqi Lou scene requires a container');
    onHotspot = context.onHotspot;
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(SCENE_COLORS.paper);
      camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.domElement.className = 'chengqi-canvas';
      renderer.domElement.setAttribute('aria-label', '拖动旋转，滚轮缩放，Shift 加左键平移');
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.06;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);
      compass = createCompass(container, { reference: 'geographic' });
      labels = new CSS2DRenderer();
      labels.domElement.className = 'chengqi-hotspot-overlay';
      container.appendChild(labels.domElement);
      shell.addCleanup(() => renderer?.domElement?.remove());
      shell.addCleanup(() => labels?.domElement?.remove());
      model = createChengqiLouModel();
      scene.add(model.group);
      const focusBuildings = content.hotspots.map((item) => {
        const building = model.group.getObjectByName(`building-${item.id}`);
        if (!building || !model.anchors[item.id]) throw new Error(`Missing Chengqi Lou building: ${item.id}`);
        return building;
      });
      // The terrain and roadside trees set the setting, but should not force
      // the overview so far back that the concentric building becomes unreadable.
      bounds.makeEmpty();
      focusBuildings.forEach((building) => bounds.expandByObject(building));
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const extent = Math.max(size.x, size.z);
      scene.fog = new THREE.Fog(SCENE_COLORS.dayFog, extent * 4.5, extent * 8);
      camera.far = extent * 12;
      content.hotspots.forEach((item) => {
        const building = model.group.getObjectByName(`building-${item.id}`);
        const anchor = model.anchors[item.id];
        if (!building || !anchor) throw new Error(`Missing Chengqi Lou building: ${item.id}`);
        buildingBounds.set(item.id, new THREE.Box3().setFromObject(building).expandByScalar(1.4));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chengqi-hotspot';
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
      const hemisphere = new THREE.HemisphereLight('#fff0d5', '#294942', 2.5);
      keyLight = new THREE.DirectionalLight('#ffe7bd', 3.1);
      keyLight.position.copy(center).add(new THREE.Vector3(-extent * 1.2, extent * 1.9, extent * 1.1));
      keyLight.target.position.copy(center);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -extent * 0.7;
      keyLight.shadow.camera.right = keyLight.shadow.camera.top = extent * 0.7;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = extent * 4;
      keyLight.shadow.normalBias = 0.12;
      fillLight = new THREE.PointLight('#ffd5a1', 22, extent * 1.6, 2);
      fillLight.position.copy(center).add(new THREE.Vector3(0, size.y * 0.55, 0));
      scene.add(hemisphere, keyLight, keyLight.target, fillLight);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.065;
      controls.minDistance = 6;
      controls.maxDistance = extent * 5;
      controls.minPolarAngle = 0.1;
      controls.maxPolarAngle = Math.PI * 0.485;
      controls.addEventListener('start', cancelTween);
      removeShiftPan = enableShiftPan(controls);
      exhibitUI = createExhibitControls({ container, scene, renderer, controls });
      roam = createAutoRoam({ controls, container, canRoam: () => !tween && !selectedId && !overhead && !immersive });
      mounted = true;
      resize();
      landmarkIconScaler = createLandmarkIconScaler(landmarkLabels, camera, controls.target);
      shell.observeResize(container, resize);
      shell.request(animate);
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
    shell.dispose();
    animations.forEach((animation) => animation.cancel());
    animations = [];
    removeShiftPan?.();
    controls?.removeEventListener('start', cancelTween);
    roam?.dispose();
    exhibitUI?.dispose();
    exhibitUI = null;
    controls?.dispose();
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

  return { mount, selectHotspot, resetView, setOverheadView, setImmersive, reveal, dispose };
}
