import { resizeTerrainViewport } from '../shared/scene-viewport.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { enableShiftPan } from '../shared/scene-controls.js';
import { createCompass } from '../shared/compass.js';
import { createChangbaiModel } from './model.js';
import { createTerrainRefinement } from './refinement.js';
import { changbaiPOIs, getPOIView } from './pois.js';
import { createAutoRoam } from '../shared/auto-roam.js';
import { createExhibitControls } from '../shared/exhibit-controls.js';
import { SCENE_COLORS } from '../shared/scene-palette.js';

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export async function createScene({ container, onReady, onError, signal } = {}) {
  if (!container || typeof container.append !== 'function') {
    throw new TypeError('Changbai scene requires a container');
  }

  const sceneStartedAt = performance.now();
  delete container.dataset.firstFrameMs;
  delete container.dataset.terrainTriangles;
  let disposed = false;
  let cleanupComplete = false;
  let firstFrameRecorded = false;
  let frameId = 0;
  let observer;
  let renderer;
  let controls;
  let compass;
  let roam;
  let model;
  let refinement;
  let world;
  let camera;
  let keyLight;
  let removeShiftPan;
  let exhibitUI;
  let poiMarker;
  let selectedPoint = null;
  let tween = null;
  let roamEligible = true;
  let immersiveMode = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const abortError = () => new DOMException('Changbai scene load was aborted', 'AbortError');

  function onAbort() { dispose(); }
  signal?.addEventListener('abort', onAbort, { once: true });

  function cancelViewTween() {
    tween = null;
  }

  function dispose() {
    if (cleanupComplete) return;
    cleanupComplete = true;
    disposed = true;
    cancelAnimationFrame(frameId);
    observer?.disconnect();
    removeShiftPan?.();
    controls?.removeEventListener('start', cancelViewTween);
    exhibitUI?.dispose();
    roam?.dispose();
    controls?.dispose();
    refinement?.dispose();
    model?.dispose?.();
    model = null;
    keyLight?.shadow.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    compass?.dispose();
    compass = null;
    renderer?.domElement.remove();
    poiMarker?.remove();
    world?.clear();
    world = null;
    tween = null;
    signal?.removeEventListener('abort', onAbort);
  }

  function readBounds() {
    const fallback = new THREE.Box3().setFromObject(model.group);
    const source = model.bounds || {};
    return {
      minX: finite(source.minX, fallback.min.x), maxX: finite(source.maxX, fallback.max.x),
      minY: finite(source.minY, fallback.min.y), maxY: finite(source.maxY, fallback.max.y),
      minZ: finite(source.minZ, fallback.min.z), maxZ: finite(source.maxZ, fallback.max.z),
    };
  }

  let bounds;
  let size;
  let center;
  let span;

  function terrainHeight(x, z, fallback) {
    return finite(model.getHeight?.(x, z), fallback);
  }

  function fitView(direction, target = center, padding = 1.12) {
    const unit = direction.clone().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), unit).normalize();
    const up = new THREE.Vector3().crossVectors(unit, right);
    const tanVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanHorizontal = tanVertical * Math.max(camera.aspect, 0.5);
    let distance = 0;
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const corner = new THREE.Vector3(x * size.x / 2, y * size.y / 2, z * size.z / 2);
      distance = Math.max(distance,
        corner.dot(unit) + Math.abs(corner.dot(right)) / tanHorizontal,
        corner.dot(unit) + Math.abs(corner.dot(up)) / tanVertical);
    }
    return { target: target.clone(), position: target.clone().addScaledVector(unit, distance * padding) };
  }

  function getView(name) {
    const poi = changbaiPOIs.find(point => name === `poi:${point.id}`);
    if (poi) return getPOIView(model, poi);
    const lakeCenter = model.lakeCenter?.clone?.() || center.clone();
    const lakeLevel = finite(model.lakeLevel, center.y);
    if (name === 'north') {
      return fitView(new THREE.Vector3(0, 1, 0.01), center);
    }
    if (name === 'east' || name === 'west') {
      const side = name === 'east' ? 1 : -1;
      const lakeWidth = model.lakeBounds.maxX - model.lakeBounds.minX;
      const lakeDepth = model.lakeBounds.maxZ - model.lakeBounds.minZ;
      const x = lakeCenter.x + side * (lakeWidth / 2 + 4.5);
      const z = lakeCenter.z + lakeDepth * 0.16;
      const ground = terrainHeight(x, z, lakeLevel);
      const target = new THREE.Vector3(lakeCenter.x, lakeLevel, lakeCenter.z);
      const position = new THREE.Vector3(x, Math.max(ground + 1.5, lakeLevel + 6.5), z);
      return { target, position };
    }
    return fitView(new THREE.Vector3(0.65, 0.95, 1), center, container.clientWidth < 700 ? 1.15 : 1.04);
  }

  function applyView(name, animate = true) {
    if (disposed || !controls) return false;
    roamEligible = name === 'overview';
    const view = getView(name);
    const poi = changbaiPOIs.find(point => name === `poi:${point.id}`);
    selectedPoint = poi ? view.target.clone() : null;
    poiMarker.hidden = !poi;
    if (poi) {
      poiMarker.textContent = poi.name;
      poiMarker.setAttribute('aria-label', `景点位置：${poi.name}`);
    }
    if (!animate || reducedMotion) {
      camera.position.copy(view.position);
      controls.target.copy(view.target);
      controls.autoRotate = false;
      controls.update();
      tween = null;
      return true;
    }
    tween = {
      start: performance.now(),
      fromPosition: camera.position.clone(),
      toPosition: view.position,
      fromTarget: controls.target.clone(),
      toTarget: view.target,
    };
    return true;
  }

  let viewport = { width: 0, height: 0 };
  const projectedPoint = new THREE.Vector3();
  const sightPoint = new THREE.Vector3();
  function resize() {
    if (disposed) return;
    viewport = resizeTerrainViewport(container, camera, renderer) || viewport;
  }

  function animate(time) {
    if (disposed) return;
    frameId = requestAnimationFrame(animate);
    if (tween) {
      const progress = THREE.MathUtils.clamp((time - tween.start) / 900, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      camera.position.copy(tween.fromPosition).lerp(tween.toPosition, eased);
      controls.target.copy(tween.fromTarget).lerp(tween.toTarget, eased);
      if (progress === 1) tween = null;
    }
    controls.update(roam?.update(time));
    if (selectedPoint) {
      const projected = projectedPoint.copy(selectedPoint).project(camera);
      let visible = Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1;
      for (let step = 1; visible && step <= 16; step += 1) {
        const point = sightPoint.copy(selectedPoint).lerp(camera.position, step / 16);
        if (point.y < terrainHeight(point.x, point.z, 0) + .05) visible = false;
      }
      poiMarker.hidden = !visible;
      poiMarker.style.left = `${(projected.x + 1) * viewport.width / 2}px`;
      poiMarker.style.top = `${(1 - projected.y) * viewport.height / 2}px`;
    }
    if (model.update?.(camera, time / 1000)) renderer.shadowMap.needsUpdate = true;
    exhibitUI?.update();
    compass.update(camera);
    renderer.render(world, camera);
    container.dataset.renderedTriangles = renderer.info.render.triangles;
    if (!firstFrameRecorded) {
      firstFrameRecorded = true;
      container.dataset.firstFrameMs = String(Math.round(performance.now() - sceneStartedAt));
      container.dataset.terrainTriangles = String(renderer.info.render.triangles);
    }
  }

  const api = {
    overview: () => applyView('overview'),
    northView: () => applyView('north'),
    nearView: (direction) => ['east', 'west'].includes(direction) && applyView(direction),
    focusPOI: (id) => changbaiPOIs.some(poi => poi.id === id) && applyView(`poi:${id}`),
    setImmersive: (value) => {
      immersiveMode = Boolean(value);
      exhibitUI?.setImmersive(immersiveMode);
    },
    destroy: dispose,
    dispose,
  };

  try {
    if (signal?.aborted) throw abortError();
    model = await createChangbaiModel({ signal });
    if (disposed || signal?.aborted) {
      model?.dispose?.();
      model = null;
      throw abortError();
    }

    container.dataset.detailReady = 'false';
    refinement = createTerrainRefinement({
      source: model.sourceData,
      onGeometry(geometry) {
        model.setDetailGeometry(geometry);
        container.dataset.detailReady = 'true';
        container.dataset.detailMode = 'worker';
      },
      onFailure() {
        model.buildDetail();
        container.dataset.detailReady = 'true';
        container.dataset.detailMode = 'fallback';
      },
    });

    world = new THREE.Scene();
    world.background = new THREE.Color(SCENE_COLORS.paper);
    world.add(model.group);
    bounds = readBounds();
    size = new THREE.Vector3(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ);
    center = new THREE.Vector3((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, (bounds.minZ + bounds.maxZ) / 2);
    span = Math.max(size.x, size.z, 1);
    world.fog = new THREE.Fog(SCENE_COLORS.dayFog, span * 2.8, span * 6.5);

    camera = new THREE.PerspectiveCamera(42, 1, Math.max(0.05, span / 2500), span * 10);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.domElement.className = 'changbai-canvas';
    renderer.domElement.setAttribute('aria-label', '拖动旋转，滚轮缩放，右键拖动平移');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    container.append(renderer.domElement);
    poiMarker = document.createElement('span');
    poiMarker.className = 'changbai-poi-marker';
    poiMarker.hidden = true;
    container.append(poiMarker);

    compass = createCompass(container, { reference: 'geographic' });
    world.add(new THREE.HemisphereLight('#d9e7e4', '#59624d', 0.95));
    keyLight = new THREE.DirectionalLight('#fff0cf', 3.0);
    keyLight.position.copy(center).add(new THREE.Vector3(-span * 0.9, span * 0.95, -span * 0.35));
    keyLight.target.position.copy(center);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -span * 0.68;
    keyLight.shadow.camera.right = keyLight.shadow.camera.top = span * 0.68;
    keyLight.shadow.camera.near = span * 0.1;
    keyLight.shadow.camera.far = span * 3;
    keyLight.shadow.normalBias = 0.16;
    const fill = new THREE.DirectionalLight('#badde5', 0.35);
    fill.position.copy(center).add(new THREE.Vector3(span * 0.8, span * 0.45, -span * 0.75));
    fill.target.position.copy(center);
    world.add(keyLight, keyLight.target, fill, fill.target);
    renderer.shadowMap.needsUpdate = true;

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.065;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.autoRotate = false;
    controls.minDistance = Math.max(3, span * 0.035);
    controls.maxDistance = span * 4;
    controls.minPolarAngle = 0.04;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.addEventListener('start', cancelViewTween);
    removeShiftPan = enableShiftPan(controls);
    exhibitUI = createExhibitControls({ container, scene: world, renderer, controls, onImmersive: api.setImmersive });
    roam = createAutoRoam({ controls, container, canRoam: () => roamEligible && !tween && !immersiveMode });

    resize();
    applyView('overview', false);
    observer = new ResizeObserver(resize);
    observer.observe(container);
    frameId = requestAnimationFrame(animate);
    onReady?.(api);
    return api;
  } catch (error) {
    dispose();
    if (error?.name !== 'AbortError') onError?.(error);
    throw error;
  }
}
