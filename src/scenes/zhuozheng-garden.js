import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createLandmarkIcon } from '../landmark-icons.js';
import { createZhuozhengGardenModel } from '../models/zhuozheng-garden.js';
import { enableShiftPan } from '../scene-controls.js';
import content from '../content/zhuozheng-garden.json' with { type: 'json' };

export function createScene(initialContext = {}) {
  let mounted = false, disposed = false, frameId = 0;
  let renderer, labels, controls, camera, scene, container, model, keyLight;
  let resizeObserver, removeShiftPan, onHotspot, tween = null;
  let selectedId = null, viewIsControlled = true, immersive = false;
  let animations = [];
  let reducedMotion = false;
  const bounds = new THREE.Box3();
  const buildingBounds = new Map();
  const markers = new Map();
  const listeners = [];

  function listen(element, event, handler) {
    element.addEventListener(event, handler);
    listeners.push(() => element.removeEventListener(event, handler));
  }

  function fitView(box, close = false) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const mobile = container.clientWidth < 650;
    const direction = new THREE.Vector3(close ? 0.75 : 0.5, close ? 0.64 : 0.85, 1).normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * camera.aspect;
    const fractionX = mobile ? 0.82 : (close ? 0.48 : 0.67);
    const fractionY = mobile ? (immersive ? 0.70 : 0.42) : 0.67;
    let distance = 0;
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const corner = new THREE.Vector3(x * size.x / 2, y * size.y / 2, z * size.z / 2);
      const depth = corner.dot(direction);
      distance = Math.max(distance, depth + Math.abs(corner.dot(right)) / (tanH * fractionX),
        depth + Math.abs(corner.dot(up)) / (tanV * fractionY));
    }
    distance = Math.max(close ? 14 : 30, distance * 1.09);
    return { position: center.clone().addScaledVector(direction, distance), target: center };
  }

  function currentView() {
    return fitView(selectedId ? buildingBounds.get(selectedId) : bounds, Boolean(selectedId));
  }

  function moveTo(view, animate = true) {
    if (!mounted || disposed) return;
    if (!animate || reducedMotion) {
      camera.position.copy(view.position);
      controls.target.copy(view.target);
      tween = null;
      controls.update();
      return;
    }
    tween = { start: performance.now(), from: camera.position.clone(), to: view.position,
      fromTarget: controls.target.clone(), toTarget: view.target };
  }

  function resize() {
    if (!mounted || !container.clientWidth || !container.clientHeight) return;
    const width = container.clientWidth, height = container.clientHeight;
    camera.aspect = width / height;
    camera.fov = width < 650 ? 52 : 40;
    camera.setViewOffset(width, height, 0, height * (immersive ? 0 : width < 650 ? 0.09 : 0.015), width, height);
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
    viewIsControlled = true;
    setActive(id);
    moveTo(currentView(), animate);
    onHotspot?.(id);
    return true;
  }

  function resetView() {
    if (!mounted) return false;
    selectedId = null;
    viewIsControlled = true;
    setActive(null);
    moveTo(currentView());
    onHotspot?.(null);
    return true;
  }

  function setImmersive(value) {
    immersive = value;
    resize();
  }

  function cancelTween() { tween = null; viewIsControlled = false; }

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
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  function mount(context = initialContext) {
    if (disposed) throw new Error('Cannot mount a disposed garden scene');
    if (mounted) return;
    container = context.container;
    if (!(container instanceof HTMLElement)) throw new TypeError('Garden scene requires a container');
    onHotspot = context.onHotspot;
    reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color('#526f69');
      camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.domElement.className = 'garden-canvas';
      renderer.domElement.setAttribute('aria-label', '拖动旋转，滚轮缩放，Shift 加左键平移');
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);
      labels = new CSS2DRenderer();
      labels.domElement.className = 'garden-hotspot-overlay';
      container.appendChild(labels.domElement);
      model = createZhuozhengGardenModel();
      scene.add(model.group);
      bounds.setFromObject(model.group);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const extent = Math.max(size.x, size.z);
      scene.fog = new THREE.Fog('#526f69', extent * 4.5, extent * 8);
      camera.far = extent * 12;
      content.hotspots.forEach((item) => {
        const building = model.group.getObjectByName(`building-${item.id}`);
        if (!building || !model.anchors[item.id]) throw new Error(`Missing garden building: ${item.id}`);
        buildingBounds.set(item.id, new THREE.Box3().setFromObject(building).expandByScalar(1.5));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'garden-hotspot';
        button.dataset.hotspotId = item.id;
        button.setAttribute('aria-label', `查看${item.name}`);
        button.setAttribute('aria-pressed', 'false');
        const label = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = item.name;
        const description = document.createElement('small');
        description.textContent = item.description;
        label.append(name, description);
        button.append(createLandmarkIcon('temple'), label);
        listen(button, 'click', () => selectHotspot(item.id));
        const marker = new CSS2DObject(button);
        marker.position.copy(model.anchors[item.id]);
        scene.add(marker);
        markers.set(item.id, { button, marker });
      });
      const ambient = new THREE.HemisphereLight('#fff2d9', '#3b5547', 2.6);
      keyLight = new THREE.DirectionalLight('#ffedcf', 3);
      keyLight.position.copy(center).add(new THREE.Vector3(-65, 125, 70));
      keyLight.target.position.copy(center);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -extent * 0.7;
      keyLight.shadow.camera.right = keyLight.shadow.camera.top = extent * 0.7;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = extent * 4;
      keyLight.shadow.normalBias = 0.12;
      scene.add(ambient, keyLight, keyLight.target);
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.065;
      controls.minDistance = 5;
      controls.maxDistance = extent * 5;
      controls.minPolarAngle = 0.12;
      controls.maxPolarAngle = Math.PI * 0.485;
      controls.addEventListener('start', cancelTween);
      removeShiftPan = enableShiftPan(controls);
      mounted = true;
      resize();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      frameId = requestAnimationFrame(animate);
    } catch (error) {
      dispose();
      throw error;
    }
  }

  async function reveal() {
    if (!mounted || disposed) return false;
    if (reducedMotion) return true;
    animations = [renderer.domElement, labels.domElement].map((element) => element.animate(
      [{ opacity: 0 }, { opacity: 1 }], { duration: 720, easing: 'ease-out', fill: 'forwards' },
    ));
    const currentAnimations = animations;
    try { await Promise.all(currentAnimations.map((animation) => animation.finished)); return !disposed; }
    catch { return false; }
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
    controls?.dispose();
    listeners.forEach((remove) => remove());
    markers.forEach(({ marker }) => marker.removeFromParent());
    markers.clear();
    buildingBounds.clear();
    model?.dispose();
    keyLight?.shadow.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer?.domElement.remove();
    labels?.domElement.remove();
    scene?.clear();
    scene = null; model = null; tween = null;
  }

  return { mount, selectHotspot, resetView, setImmersive, reveal, dispose };
}
