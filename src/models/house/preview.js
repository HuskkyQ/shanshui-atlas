import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { enableShiftPan } from '../../shared/scene-controls.js';
import { createHouseModel } from './model.js';

function createPreview() {
  const container = document.querySelector('#house-canvas');
  const buttons = [...document.querySelectorAll('[data-house-view]')];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#f0efe8');
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 150);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.append(renderer.domElement);

  const house = createHouseModel();
  scene.add(house.group);
  house.group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(house.group);
  const size = bounds.getSize(new THREE.Vector3());
  const target = bounds.getCenter(new THREE.Vector3());
  document.querySelector('#house-dimensions').textContent = `占地 ${house.footprint.width.toFixed(1)} × ${house.footprint.depth.toFixed(1)} 米 · 高 ${size.y.toFixed(1)} 米`;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({ color: '#f0efe8', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.01;
  ground.receiveShadow = true;
  scene.add(ground);
  scene.add(new THREE.HemisphereLight('#fffdf5', '#a0a79a', 2.1));
  const sunlight = new THREE.DirectionalLight('#fff5dc', 3);
  sunlight.position.set(-12, 18, 12);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 65 });
  sunlight.shadow.bias = -0.0003;
  sunlight.shadow.normalBias = 0.035;
  scene.add(sunlight);
  const fill = new THREE.DirectionalLight('#dce8ef', 0.8);
  fill.position.set(12, 8, -10);
  scene.add(fill);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 9;
  controls.maxDistance = 60;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  const removeShiftPan = enableShiftPan(controls);
  let activeView = 'overview';
  let frameId = 0;

  function setView(view) {
    activeView = view;
    const direction = view === 'front' ? new THREE.Vector3(0, 0.16, 1)
      : view === 'back' ? new THREE.Vector3(0, 0.16, -1) : new THREE.Vector3(1, 0.64, 1.25);
    direction.normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
    const up = new THREE.Vector3().crossVectors(direction, right);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const tanH = tanV * camera.aspect;
    let distance = controls.minDistance;
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const corner = new THREE.Vector3(x * size.x / 2, y * size.y / 2, z * size.z / 2);
      const depth = corner.dot(direction);
      distance = Math.max(distance,
        depth + Math.abs(corner.dot(right)) / (tanH * 0.84),
        depth + Math.abs(corner.dot(up)) / (tanV * 0.84));
    }
    controls.target.copy(target);
    camera.position.copy(target).addScaledVector(direction, distance);
    controls.update();
    buttons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.houseView === view)));
  }
  function resize() {
    const width = container.clientWidth, height = container.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.fov = width < 650 ? 46 : 38;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    setView(activeView);
  }
  const onView = (event) => setView(event.currentTarget.dataset.houseView);
  const onControlStart = () => buttons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
  buttons.forEach((button) => button.addEventListener('click', onView));
  controls.addEventListener('start', onControlStart);
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  function render() {
    controls.update();
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(render);
  }
  render();
  document.querySelector('#house-loading').hidden = true;

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frameId);
    observer.disconnect();
    buttons.forEach((button) => button.removeEventListener('click', onView));
    controls.removeEventListener('start', onControlStart);
    removeShiftPan();
    controls.dispose();
    house.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
    sunlight.shadow.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

let disposePreview = createPreview();
const onPageHide = () => { disposePreview(); };
const onPageShow = (event) => { if (event.persisted) disposePreview = createPreview(); };
window.addEventListener('pagehide', onPageHide);
window.addEventListener('pageshow', onPageShow);
if (import.meta.hot) import.meta.hot.dispose(() => {
  disposePreview();
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
});
