/** Heading of the north arrow, including vertical views and first-person look. */
export function getCompassAngle(camera, north = [0, 0, -1]) {
  camera.updateWorldMatrix(true, false);
  const right = camera.matrixWorld.elements;
  return Math.atan2(-right[2], right[0]) + Math.atan2(north[0], -north[2]);
}

export function createCompass(container, { north = [0, 0, -1], reference = 'geographic', variant = 'default' } = {}) {
  const element = container.ownerDocument.createElement('div');
  element.className = `scene-compass scene-compass--${variant}`;
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', reference === 'model'
    ? '模型方位罗盘：N为模型参考北向，随视角旋转'
    : '方位罗盘：N指向地理北方，随视角旋转');
  element.dataset.reference = reference;
  element.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">
    <circle class="scene-compass-face" cx="50" cy="50" r="48"/>
    <circle class="scene-compass-ring" cx="50" cy="50" r="31"/>
    <path class="scene-compass-ticks" d="M50 20v6 M80 50h-6 M50 80v-6 M20 50h6"/>
    <path class="scene-compass-north" d="M50 28 43 55 50 50 57 55Z"/>
    <path class="scene-compass-south" d="M50 72 43 45 50 50 57 45Z"/>
    <circle class="scene-compass-pivot" cx="50" cy="50" r="2.5"/>
    <text class="scene-compass-n" x="50" y="15">北 N</text>
    <text x="88" y="53">E</text><text x="50" y="93">S</text><text x="12" y="53">W</text>
  </svg>${reference === 'model' ? '<span class="scene-compass-reference">模型方位</span>' : ''}`;
  container.append(element);
  const dial = element.querySelector('svg');
  let lastAngle;
  return {
    element,
    update(camera) {
      const angle = getCompassAngle(camera, north);
      if (lastAngle === undefined || Math.abs(angle - lastAngle) > 0.0001) {
        dial.style.transform = `rotate(${angle}rad)`;
        lastAngle = angle;
      }
    },
    dispose() { element.remove(); },
  };
}
