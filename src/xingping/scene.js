import { resizeTerrainViewport } from '../shared/scene-viewport.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { enableShiftPan } from '../shared/scene-controls.js';
import { createCompass } from '../shared/compass.js';
import { createXingpingModel } from './model.js';
import { createTerrainRefinement } from './refinement.js';
import { createXingpingContext } from './context.js';
import { xingpingPOIs, getPOIView } from './pois.js';
import { createAutoRoam } from '../shared/auto-roam.js';
import { createExhibitControls } from '../shared/exhibit-controls.js';
import { SCENE_COLORS } from '../shared/scene-palette.js';

export async function createScene({ container, onReady, onError, signal } = {}) {
  if (!container?.append) throw new TypeError('Xingping scene requires a container');
  const started = performance.now();
  let disposed = false;
  let cleanupComplete = false;
  let frame = 0;
  let renderer;
  let controls;
  let compass;
  let roam;
  let exhibitUI;
  let model;
  let world;
  let camera;
  let observer;
  let removePan;
  let marker;
  let selected;
  let tween;
  let refinement;
  let scenery;
  let keyLight;
  let detailStarted = false;
  let roamEligible = true;
  let immersiveMode = false;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const cancelTween = () => {
    tween = null;
    container.dataset.view = 'free';
    container.dataset.viewSettled = 'true';
  };
  function dispose() {
    if (cleanupComplete) return;
    cleanupComplete = true;
    disposed = true;
    cancelAnimationFrame(frame);
    observer?.disconnect();
    removePan?.();
    controls?.removeEventListener('start', cancelTween);
    exhibitUI?.dispose();
    roam?.dispose();
    controls?.dispose();
    refinement?.dispose();
    scenery?.dispose();
    compass?.dispose();
    model?.dispose?.();
    keyLight?.shadow.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss?.();
    renderer?.domElement?.remove();
    marker?.remove();
    world?.clear();
    signal?.removeEventListener('abort', dispose);
  }
  signal?.addEventListener('abort', dispose, { once: true });
  if (signal?.aborted) throw new DOMException('Xingping scene load was aborted', 'AbortError');
  function fit(direction, target, padding = 1.06) {
    const b = model.bounds;
    const size = new THREE.Vector3(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
    const unit = direction.clone().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), unit).normalize();
    const up = new THREE.Vector3().crossVectors(unit, right);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * Math.max(camera.aspect, 0.5);
    let distance = 0;
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1]) {
          const corner = new THREE.Vector3((x * size.x) / 2, (y * size.y) / 2, (z * size.z) / 2);
          distance = Math.max(
            distance,
            corner.dot(unit) + Math.abs(corner.dot(right)) / tanH,
            corner.dot(unit) + Math.abs(corner.dot(up)) / tanV,
          );
        }
    return {
      target: target.clone(),
      position: target.clone().addScaledVector(unit, distance * padding),
    };
  }
  function getView(name) {
    const poi = xingpingPOIs.find((point) => name === `poi:${point.id}`);
    if (poi) return getPOIView(model, poi, camera.aspect);
    const b = model.bounds;
    const center = new THREE.Vector3(
      (b.minX + b.maxX) / 2,
      (b.minY + b.maxY) / 2,
      (b.minZ + b.maxZ) / 2,
    );
    return name === 'north'
      ? fit(new THREE.Vector3(0, 0.9, 0.08), center, 1.08)
      : fit(new THREE.Vector3(0.7, 0.85, 0.95), center, 1.03);
  }
  function applyView(name, animate = true) {
    if (disposed || !camera || !controls || !marker) return false;
    roamEligible = name === 'overview';
    container.dataset.view = name;
    container.dataset.viewSettled = String(!animate || reduced);
    const poi = xingpingPOIs.find((point) => name === `poi:${point.id}`);
    const view = getView(name);
    selected = poi ? (view.markerPosition || view.target).clone() : null;
    marker.hidden = !poi;
    if (poi) {
      marker.textContent = poi.name;
      marker.setAttribute('aria-label', `景点位置：${poi.name}`);
    }
    if (!animate || reduced) {
      controls.autoRotate = false;
      camera.position.copy(view.position);
      controls.target.copy(view.target);
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
    if (disposed || !camera || !renderer) return;
    viewport = resizeTerrainViewport(container, camera, renderer) || viewport;
  }
  function animate(time) {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (tween) {
      const progress = THREE.MathUtils.clamp((time - tween.start) / 850, 0, 1);
      const eased = progress * progress * (3 - 2 * progress);
      camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
      if (progress === 1) {
        tween = null;
        container.dataset.viewSettled = 'true';
      }
    }
    controls.update(roam?.update(time));
    if (selected) {
      const projected = projectedPoint.copy(selected).project(camera);
      let visible =
        Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 && Math.abs(projected.z) < 1;
      for (let step = 1; visible && step <= 16; step += 1) {
        const point = sightPoint.copy(selected).lerp(camera.position, step / 16);
        if (point.y < model.getHeight(point.x, point.z) + 0.05) visible = false;
      }
      marker.hidden = !visible;
      marker.style.left = `${((projected.x + 1) * viewport.width) / 2}px`;
      marker.style.top = `${((1 - projected.y) * viewport.height) / 2}px`;
    }
    const terrainChanged = model.update?.(camera, time / 1000);
    if (scenery.update(camera, time / 1000) || terrainChanged)
      renderer.shadowMap.needsUpdate = true;
    exhibitUI?.update();
    compass.update(camera);
    renderer.info.reset();
    renderer.render(world, camera);
    container.dataset.renderedTriangles = String(renderer.info.render.triangles);
    container.dataset.drawCalls = String(renderer.info.render.calls);
    container.dataset.treeDetail = String(
      !!model.group.getObjectByName('xingping-vegetation')?.visible,
    );
    container.dataset.waterReflection = String(
      !!model.group.getObjectByName('xingping-water-surface')?.userData.reflectionEnabled,
    );
    if (!container.dataset.firstFrameMs) {
      container.dataset.firstFrameMs = String(Math.round(performance.now() - started));
      container.dataset.terrainTriangles = String(renderer.info.render.triangles);
    }
    // Start source-resolution work only after the complete coarse scene has rendered.
    if (!detailStarted) {
      detailStarted = true;
      container.dataset.contextReady = 'false';
      scenery
        .start({ signal })
        .then((ready) => {
          if (!disposed && ready) {
            container.dataset.contextReady = 'true';
            renderer.shadowMap.needsUpdate = true;
          }
        })
        .catch((error) => {
          if (!disposed) {
            container.dataset.contextReady = 'error';
            console.error('Failed to refine Xingping settlements', error);
          }
        });
      refinement = createTerrainRefinement({
        source: model.sourceData,
        onGeometry(geometry) {
          if (disposed) {
            geometry.dispose();
            return;
          }
          model.setDetailGeometry(geometry);
          container.dataset.detailReady = 'true';
          container.dataset.detailMode = 'worker';
        },
        onFailure() {
          if (disposed) return;
          model.buildDetail();
          container.dataset.detailReady = 'true';
          container.dataset.detailMode = 'fallback';
        },
      });
    }
  }
  let api;
  try {
    model = await createXingpingModel({ signal });
    if (disposed || signal?.aborted) {
      model?.dispose?.();
      model = null;
      throw new DOMException('Xingping scene load was aborted', 'AbortError');
    }
    scenery = createXingpingContext(model);
    container.dataset.firstFrameMs = '';
    container.dataset.renderedTriangles = '';
    container.dataset.drawCalls = '';
    container.dataset.detailReady = 'false';
    world = new THREE.Scene();
    world.background = new THREE.Color(SCENE_COLORS.paper);
    world.add(model.group);
    const b = model.bounds;
    const center = new THREE.Vector3(
      (b.minX + b.maxX) / 2,
      (b.minY + b.maxY) / 2,
      (b.minZ + b.maxZ) / 2,
    );
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 1);
    camera = new THREE.PerspectiveCamera(42, 1, Math.max(0.05, span / 2500), span * 10);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.domElement.className = 'xingping-canvas';
    renderer.domElement.setAttribute('aria-label', '拖动旋转，滚轮缩放，右键拖动平移');
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.info.autoReset = false;
    container.append(renderer.domElement);
    marker = document.createElement('span');
    marker.className = 'xingping-poi-marker';
    marker.hidden = true;
    container.append(marker);
    compass = createCompass(container, { reference: 'geographic' });
    world.add(new THREE.HemisphereLight('#d9e7e4', '#59624d', 1));
    keyLight = new THREE.DirectionalLight('#fff0cf', 2.4);
    keyLight.position.copy(center).add(new THREE.Vector3(-span * 0.8, span * 0.9, -span * 0.4));
    keyLight.target.position.copy(center);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -span * 0.7;
    keyLight.shadow.camera.right = keyLight.shadow.camera.top = span * 0.7;
    keyLight.shadow.camera.near = span * 0.05;
    keyLight.shadow.camera.far = span * 3;
    keyLight.shadow.normalBias = 0.04;
    world.add(keyLight, keyLight.target);
    renderer.shadowMap.needsUpdate = true;
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.autoRotate = false;
    controls.minDistance = Math.max(3, span * 0.025);
    controls.maxDistance = span * 4;
    controls.minPolarAngle = 0.04;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.addEventListener('start', cancelTween);
    removePan = enableShiftPan(controls);
    api = {
      overview: () => applyView('overview'),
      northView: () => applyView('north'),
      focusPOI: (id) => xingpingPOIs.some((point) => point.id === id) && applyView(`poi:${id}`),
      setImmersive: (value) => {
        immersiveMode = Boolean(value);
        exhibitUI?.setImmersive(immersiveMode);
      },
      dispose,
    };
    exhibitUI = createExhibitControls({
      container,
      scene: world,
      renderer,
      controls,
      onImmersive: api.setImmersive,
    });
    roam = createAutoRoam({
      controls,
      container,
      canRoam: () => roamEligible && !tween && !immersiveMode,
    });
    resize();
    applyView('overview', false);
    observer = new ResizeObserver(resize);
    observer.observe(container);
    frame = requestAnimationFrame(animate);
    onReady?.(api);
    return api;
  } catch (error) {
    dispose();
    if (error?.name !== 'AbortError') onError?.(error);
    throw error;
  }
}
