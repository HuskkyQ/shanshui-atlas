// Slow overview orbit, shared by the standalone scenic pages.
export function createAutoRoam({ controls, container, canRoam = () => true }) {
  const document = container.ownerDocument;
  const window = document.defaultView;
  const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'scene-auto-roam';
  const indicator = document.createElement('span');
  indicator.className = 'scene-roam-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = '自动漫游';
  const status = document.createElement('span');
  status.className = 'scene-roam-state';
  button.append(indicator, label, status);
  const footer = document.createElement('footer');
  footer.className = 'scene-roam-footer';
  const hint = document.createElement('div');
  hint.className = 'scene-roam-hint';
  hint.innerHTML = '<span class="scene-roam-hint-icon" aria-hidden="true">↔</span><span class="scene-roam-hint-text">左键旋转 <b>·</b> Shift＋左键平移 <b>·</b> 滚轮缩放</span>';
  footer.append(hint, button);
  // Match the Huangshan / West Lake footer above the canvas stacking context.
  (container.parentElement || container).append(footer);
  let enabled = true, interacting = false, lastTime, disposed = false;
  let lastState, lastAllowed, lastEnabled;
  controls.autoRotateSpeed = .3;

  function synchronize() {
    const allowed = canRoam();
    const state = preference?.matches ? 'reduced' : document.hidden ? 'hidden' : !allowed ? 'view'
      : !enabled ? 'paused' : interacting ? 'interaction' : 'running';
    controls.autoRotate = state === 'running';
    if (state === lastState && allowed === lastAllowed && enabled === lastEnabled) return;
    lastState = state; lastAllowed = allowed; lastEnabled = enabled;
    container.dataset.autoRoam = state;
    button.dataset.state = state;
    button.hidden = !allowed;
    footer.hidden = !allowed;
    button.disabled = !!preference?.matches;
    button.setAttribute('aria-pressed', String(enabled && !preference?.matches));
    status.textContent = enabled && !preference?.matches ? 'ON' : 'OFF';
    button.title = preference?.matches ? '已遵循系统减少动态效果设置' : enabled ? '暂停自动漫游' : '开启自动漫游';
  }
  function start() { interacting = true; synchronize(); }
  // Huangshan / West Lake resume as soon as OrbitControls releases the gesture.
  function end() { interacting = false; synchronize(); }
  function toggle() { enabled = !enabled; synchronize(); }
  function visibilityChanged() { lastTime = undefined; synchronize(); }
  function preferenceChanged() { synchronize(); }
  controls.addEventListener('start', start);
  controls.addEventListener('end', end);
  button.addEventListener('click', toggle);
  document.addEventListener('visibilitychange', visibilityChanged);
  preference?.addEventListener('change', preferenceChanged);
  synchronize();

  return {
    update(time) {
      if (disposed) return 0;
      const delta = lastTime === undefined ? 0 : Math.max(0, Math.min((time - lastTime) / 1000, .1));
      lastTime = time;
      synchronize();
      return delta;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controls.autoRotate = false;
      controls.removeEventListener('start', start);
      controls.removeEventListener('end', end);
      button.removeEventListener('click', toggle);
      document.removeEventListener('visibilitychange', visibilityChanged);
      preference?.removeEventListener('change', preferenceChanged);
      footer.remove();
      delete container.dataset.autoRoam;
    },
  };
}
