import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAutoRoam } from '../src/shared/auto-roam.js';
import { createDaciRoam } from '../src/daci-yan/roam.js';

function fixture({ reduced = false, daci = false } = {}) {
  let now = 0, allowed = true;
  const query = new EventTarget(); query.matches = reduced;
  const document = new EventTarget(); document.hidden = false;
  document.defaultView = { performance: { now: () => now }, matchMedia: () => query };
  const children = [], elements = [];
  document.createElement = tag => {
    const element = new EventTarget(); element.dataset = {}; element.attributes = {}; element.children = []; element.tagName = tag;
    element.setAttribute = (key, value) => { element.attributes[key] = value; };
    element.append = (...nodes) => element.children.push(...nodes);
    element.remove = () => { children.splice(children.indexOf(element), 1); };
    elements.push(element);
    return element;
  };
  const container = { ownerDocument: document, dataset: {},
    parentElement: { append: element => children.push(element) },
    append() { assert.fail('the switch must sit above the canvas stacking context'); },
  };
  const element = new EventTarget(); element.style = {}; element.clientWidth = 800; element.clientHeight = 600;
  element.getRootNode = () => document;
  const camera = new THREE.PerspectiveCamera(45, 4 / 3, .1, 1000); camera.position.set(0, 5, 10);
  const controls = new OrbitControls(camera, element); controls.enableDamping = false;
  const createRoam = daci ? createDaciRoam : createAutoRoam;
  const roam = createRoam({ controls, container, canRoam: () => allowed });
  return { camera, controls, roam, container, query, document, element, button: elements.find(e => e.tagName === 'button'), children,
    tick(time) {
      now = time;
      if (daci) roam.update(time);
      else controls.update(roam.update(time));
    },
    allow(value) { allowed = value; },
    close() { roam.dispose(); controls.dispose(); },
  };
}

test('overview really rotates the camera at the same speed at 30 and 60 frames per second', () => {
  const results = [];
  for (const fps of [30, 60]) {
    const f = fixture(); f.tick(0);
    const before = f.camera.position.clone();
    for (let i = 1; i <= fps; i++) f.tick(i * 1000 / fps);
    assert.ok(f.camera.position.distanceTo(before) > .1);
    assert.equal(f.container.dataset.autoRoam, 'running');
    results.push(f.camera.position.clone()); f.close();
  }
  assert.ok(results[0].distanceTo(results[1]) < 1e-8);
});

test('manual rotation resumes on the next frame after release, like Huangshan and West Lake', () => {
  const f = fixture(); f.tick(0); f.tick(100);
  f.controls.dispatchEvent({ type: 'start' });
  const before = f.camera.position.clone();
  f.tick(3000); assert.equal(f.controls.autoRotate, false);
  assert.deepEqual(f.camera.position.toArray(), before.toArray());
  f.controls.dispatchEvent({ type: 'end' });
  f.tick(3016); assert.equal(f.controls.autoRotate, true);
  assert.ok(f.camera.position.distanceTo(before) > 0); f.close();
});

test('wheel zoom changes distance and keeps roaming on the next frame after each scroll', () => {
  const f = fixture(); f.tick(0); f.tick(100);
  let time = 100;
  for (const deltaY of [-120, 120, -120]) {
    const distance = f.camera.position.distanceTo(f.controls.target);
    const wheel = new Event('wheel', { cancelable: true });
    Object.assign(wheel, { deltaY, deltaMode: 0, clientX: 400, clientY: 300 });
    f.element.dispatchEvent(wheel);
    assert.notEqual(f.camera.position.distanceTo(f.controls.target), distance);
    const angle = f.controls.getAzimuthalAngle();
    time += 16;
    f.tick(time);
    assert.equal(f.container.dataset.autoRoam, 'running');
    assert.notEqual(f.controls.getAzimuthalAngle(), angle);
  }
  f.close();
});

test('Daci Yan reverses at both front angles without overshooting with damping enabled', (t) => {
  const f = fixture({ daci: true });
  t.after(() => f.close());
  f.controls.enableDamping = true;
  f.controls.dampingFactor = .065;
  const limit = THREE.MathUtils.degToRad(24);
  let min = Infinity, max = -Infinity;
  for (let time = 0; time <= 60000; time += 1000 / 60) {
    f.tick(time);
    const angle = f.controls.getAzimuthalAngle();
    min = Math.min(min, angle);
    max = Math.max(max, angle);
    assert.ok(Math.abs(angle) <= limit + 1e-8);
  }
  assert.ok(min <= -limit + 1e-8);
  assert.ok(max >= limit - 1e-8);
  assert.ok(f.controls.getAzimuthalAngle() < max - .1);
});

test('Daci Yan holds the manually chosen rear view and resumes from the front only when enabled', (t) => {
  const f = fixture({ daci: true });
  t.after(() => f.close());
  const setAzimuth = (angle) => {
    f.controls.dispatchEvent({ type: 'start' });
    f.camera.position.set(10 * Math.sin(angle), 5, 10 * Math.cos(angle));
    f.controls.update();
    f.controls.dispatchEvent({ type: 'end' });
  };
  f.tick(0); f.tick(16);
  setAzimuth(Math.PI);
  const rear = f.camera.position.clone();
  f.tick(32); f.tick(1000);
  assert.ok(f.camera.position.distanceTo(rear) < 1e-8);
  assert.equal(f.controls.autoRotate, false);
  setAzimuth(.1);
  f.tick(1016);
  assert.ok(f.controls.getAzimuthalAngle() < .1);
  f.button.dispatchEvent(new Event('click'));
  setAzimuth(-.2);
  f.tick(1032);
  assert.ok(Math.abs(f.controls.getAzimuthalAngle() + .2) < 1e-8);
});

test('pause switch stays off across gestures and viewpoint changes until explicitly enabled', () => {
  const f = fixture(); f.tick(0); f.button.dispatchEvent(new Event('click')); f.tick(100);
  assert.equal(f.controls.autoRotate, false); assert.equal(f.button.attributes['aria-pressed'], 'false');
  f.controls.dispatchEvent({ type: 'start' }); f.controls.dispatchEvent({ type: 'end' });
  f.allow(false); f.tick(6000); assert.equal(f.button.hidden, true);
  f.allow(true); f.tick(7000); assert.equal(f.controls.autoRotate, false);
  f.button.dispatchEvent(new Event('click')); f.tick(7100); assert.equal(f.controls.autoRotate, true); f.close();
});

test('precise views and walking suppress auto motion; reduced-motion preference is honored live', () => {
  const f = fixture(); f.tick(0); f.allow(false); f.tick(100);
  assert.equal(f.controls.autoRotate, false); assert.equal(f.button.hidden, true);
  f.allow(true); f.query.matches = true; f.query.dispatchEvent(new Event('change')); f.tick(200);
  assert.equal(f.controls.autoRotate, false); assert.equal(f.button.disabled, true);
  f.query.matches = false; f.query.dispatchEvent(new Event('change')); f.tick(300);
  assert.equal(f.controls.autoRotate, true); f.close();
  const reduced = fixture({ reduced: true }); reduced.tick(0); reduced.tick(100);
  assert.equal(reduced.controls.autoRotate, false); reduced.close();
});

test('backgrounding prevents rotation and clamps the returning frame instead of jumping', () => {
  const f = fixture(); f.tick(0); f.tick(100);
  f.document.hidden = true; f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.controls.autoRotate, false);
  const before = f.camera.position.clone(); f.tick(100000);
  assert.deepEqual(f.camera.position.toArray(), before.toArray());
  f.document.hidden = false; f.document.dispatchEvent(new Event('visibilitychange')); f.tick(200000);
  assert.deepEqual(f.camera.position.toArray(), before.toArray());
  f.tick(200016); assert.ok(f.camera.position.distanceTo(before) > 0); f.close();
});

test('disposal removes the switch and listeners without affecting a later scene', () => {
  const f = fixture(); f.tick(0); f.roam.dispose(); f.roam.dispose();
  assert.equal(f.children.length, 0); assert.equal(f.controls.autoRotate, false);
  f.button.dispatchEvent(new Event('click')); f.controls.dispatchEvent({ type: 'end' });
  f.query.dispatchEvent(new Event('change')); f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.roam.update(100), 0); assert.equal(f.controls.autoRotate, false); f.controls.dispose();
});
