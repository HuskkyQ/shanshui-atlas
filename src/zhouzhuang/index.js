import { createScene } from './scene.js';

const get = (selector) => document.querySelector(selector);
const app = get('#zhou-app');
const enter = get('#zhou-enter');
const hud = get('.zhou-walk-hud');
const loading = get('#zhou-loading');
const errorPanel = get('#zhou-error');
const status = get('#zhou-status');
const desktop = window.matchMedia('(min-width: 701px) and (pointer: fine)');
const listeners = [];
let scene = null;
let disposed = false;
let previousMode = 'overview';

document.title = '周庄 · 漫步水乡 · 山水志';
const listen = (element, name, handler) => {
  element.addEventListener(name, handler);
  listeners.push(() => element.removeEventListener(name, handler));
};

function updateDevice() {
  enter.hidden = !desktop.matches;
  if (!desktop.matches) scene?.exitWalk();
}

function onMode({ mode, message = '', lookMode }) {
  const wasWalking = previousMode === 'walking';
  previousMode = mode;
  const walking = mode === 'walking';
  app.classList.toggle('is-walking', walking);
  hud.hidden = !walking;
  get('.zhou-main').inert = walking;
  get('.zhou-header').inert = walking;
  enter.setAttribute('aria-pressed', String(walking));
  status.textContent = message;
  get('#zhou-look-hint').textContent = lookMode === 'drag' ? '按住鼠标 拖动环视' : '鼠标 环视';
  if (wasWalking && !walking && desktop.matches) enter.focus({ preventScroll: true });
  if (walking && desktop.matches) get('#zhou-exit').focus({ preventScroll: true });
}

function stopScene() {
  scene?.dispose();
  scene = null;
}

function start() {
  if (disposed) return;
  stopScene();
  loading.hidden = false;
  errorPanel.hidden = true;
  onMode({ mode: 'overview' });
  try {
    scene = createScene({ container: get('#zhou-canvas'), onMode });
    scene.mount();
    loading.hidden = true;
  } catch (error) {
    stopScene();
    loading.hidden = true;
    errorPanel.hidden = false;
    console.error('Failed to open Zhouzhuang', error);
  }
}

listen(enter, 'click', () => {
  status.textContent = '正在进入行走模式…';
  scene?.enterWalk();
});
listen(get('#zhou-exit'), 'click', () => scene?.exitWalk());
listen(get('#zhou-overview'), 'click', () => scene?.overview());
listen(get('#zhou-top'), 'click', () => scene?.topView());
listen(get('#zhou-retry'), 'click', start);
document.querySelectorAll('[data-bridge]').forEach((button) => {
  listen(button, 'click', () => scene?.focusBridge(button.dataset.bridge));
});
listen(desktop, 'change', updateDevice);
listen(document, 'keydown', (event) => {
  if (event.code === 'KeyR' && app.classList.contains('is-walking')) {
    event.preventDefault();
    scene?.resetWalk();
  }
});
listen(window, 'pagehide', (event) => {
  stopScene();
  if (!event.persisted) {
    disposed = true;
    listeners.forEach((remove) => remove());
  }
});
listen(window, 'pageshow', (event) => { if (event.persisted) start(); });
updateDevice();
start();
