import { attachWebGLRecovery } from './webgl-recovery.js';
import { watchSceneTheme } from './scene-palette.js';

export function createExhibitControls({ container, scene, renderer, controls, onImmersive }) {
  const removeRecovery = attachWebGLRecovery(renderer.domElement, { onRestored: () => { renderer.shadowMap.needsUpdate = true; } });
  const root = container.parentElement;
  const header = root?.querySelector('header');
  const main = root?.querySelector('main');
  // Bare canvas captures have no page chrome to normalize.
  if (!header || !main) return { setImmersive() {}, update() {}, dispose: removeRecovery };
  const stopWatchingTheme = watchSceneTheme(scene);
  const doc = root.ownerDocument;
  const prefix = root.id.replace(/-app$/, '');
  const brand = header.querySelector('a');
  const originalBrand = brand.innerHTML;
  const mark = brand.querySelector('span')?.textContent || '山';
  const classes = [], moves = [], listeners = [], created = [];
  let immersive = false, walking = false, disposed = false;
  const addClass = (node, name) => { if (!node) return; node.classList.add(name); classes.push([node, name]); };
  const listen = (node, event, handler) => { node.addEventListener(event, handler); listeners.push(() => node.removeEventListener(event, handler)); };
  const move = (node, parent) => { moves.push([node, node.parentNode, node.nextSibling]); parent.append(node); };
  const make = (tag, className, text) => { const node = doc.createElement(tag); node.className = className; if (text) node.textContent = text; return node; };

  root.dataset.exhibitLayout = 'true';
  addClass(header, 'exhibit-header');
  addClass(main, 'exhibit-main');
  addClass(brand, 'exhibit-brand');
  addClass(main.querySelector('section'), 'exhibit-intro');
  addClass(root.querySelector(`[class$="-wash"], .zhou-vignette`), 'exhibit-wash');
  brand.replaceChildren(...[
    ['exhibit-mark', mark], ['exhibit-brand-name', '山水志'],
    ['exhibit-brand-divider', ''], ['exhibit-brand-subtitle', '← 返回首页'],
  ].map(([name, text]) => make('span', name, text)));

  let nav = main.querySelector('aside');
  if (!nav) {
    nav = make('aside', 'exhibit-nav');
    const heading = make('div', 'exhibit-nav-heading', '探索视角 · EXPLORE');
    const actions = make('div', 'exhibit-view-actions');
    main.append(nav); created.push(nav);
    nav.append(heading, actions);
    for (const id of ['zhou-overview', 'zhou-top']) move(root.querySelector(`#${id}`), actions);
    move(root.querySelector('.zhou-places'), nav);
  }
  addClass(nav, 'exhibit-nav');
  addClass(nav.querySelector('nav'), 'exhibit-hotspots');
  const detail = nav.querySelector('article');
  if (detail) { move(detail, main); addClass(detail, 'exhibit-detail'); }
  nav.querySelectorAll('button[data-hotspot],button[data-bridge],button[data-poi-id],button[class*="-view-button"]').forEach(button => addClass(button, 'exhibit-nav-item'));

  const toolbar = make('div', 'exhibit-controls');
  header.append(toolbar); created.push(toolbar);
  const themeToggle = header.querySelector('.atlas-theme-toggle');
  if (themeToggle) move(themeToggle, toolbar);
  const walkButton = root.querySelector('#zhou-enter');
  if (walkButton) { move(walkButton, toolbar); addClass(walkButton, 'exhibit-walk-toggle'); }
  let enter = root.querySelector(`#${prefix}-immersive`);
  const existingImmersive = !!enter;
  let exit = root.querySelector(`#${prefix}-exit-immersive`);
  if (existingImmersive) {
    move(enter, toolbar);
    addClass(enter, 'exhibit-immersive-toggle');
    addClass(exit, 'exhibit-immersive-exit');
  } else {
    enter = make('button', 'exhibit-immersive-toggle', '沉浸式体验');
    enter.type = 'button'; enter.id = `${prefix}-immersive`;
    exit = make('button', 'exhibit-immersive-exit', '退出沉浸');
    exit.type = 'button'; exit.id = `${prefix}-exit-immersive`; exit.hidden = true;
    toolbar.append(enter); root.append(exit); created.push(exit);
    listen(enter, 'click', () => onImmersive(true));
    listen(exit, 'click', () => onImmersive(false));
    listen(doc, 'keydown', event => {
      if (event.key === 'Escape' && immersive && !event.defaultPrevented) { event.preventDefault(); onImmersive(false); }
    });
  }

  function sync() {
    root.classList.toggle('is-immersive', immersive);
    main.inert = !existingImmersive && immersive;
    brand.inert = immersive;
    enter.hidden = immersive;
    exit.hidden = !immersive;
    enter.setAttribute('aria-pressed', String(immersive));
    if (immersive || walking) controls.autoRotate = false;
  }
  sync();

  return {
    setImmersive(value) {
      immersive = value;
      sync();
      if (!existingImmersive) (value ? exit : enter).focus();
    },
    update({ walking: value = false } = {}) {
      if (walking === value) return;
      walking = value;
      root.dataset.exhibitWalking = String(value);
      sync();
    },
    dispose() {
      if (disposed) return; disposed = true;
      removeRecovery();
      listeners.forEach(remove => remove());
      stopWatchingTheme();
      moves.reverse().forEach(([node, parent, next]) => parent.insertBefore(node, next?.parentNode === parent ? next : null));
      classes.forEach(([node, name]) => node.classList.remove(name));
      created.forEach(node => node.remove());
      brand.innerHTML = originalBrand;
      main.inert = false; brand.inert = false;
      delete root.dataset.exhibitLayout; delete root.dataset.exhibitWalking;
    },
  };
}
