const SVG_NS = 'http://www.w3.org/2000/svg';

const ICON_PATHS = {
  peak: [
    ['M3 19 9 8l3 4 3-6 6 13Z', 'light'],
    ['m5 19 4-3 2 2 3-3 4 4Z', 'green'],
    ['m14.8 8.8 1.2 2.5-1.4 1.5-1.1-1.4Z', 'dark'],
  ],
  temple: [
    ['m2.5 8.5 2.2-1.4.9-1.8 1.3 1.1L12 3.1l5.1 3.3 1.3-1.1.9 1.8 2.2 1.4H2.5Z', 'light'],
    ['M5 9h14v10H5Z', 'green'],
    ['M3 19h18v2H3Z', 'dark'],
    ['M7.2 19V9m3.2 10V9m3.2 10V9m3.2 10V9', 'dark', { fill: 'none', strokeWidth: '1.3' }],
    ['M10 19v-5.8c0-1.4 4-1.4 4 0V19Z', 'dark'],
  ],
  cave: [
    ['M3 20C4 12 7 7 12 7s8 5 9 13H3Z', 'light'],
    ['M5 18c1.5-5.5 3.8-8.2 7-8.2s5.5 2.7 7 8.2Z', 'green'],
    ['M9 20c.2-4 1.2-6 3-6s2.8 2 3 6Z', 'dark'],
  ],
  trailhead: [
    ['m3 7.5 2-1.4 1-2 1.3 1.2L12 2.7l4.7 2.6L18 4.1l1 2 2 1.4H3Z', 'light'],
    ['M5 8.5h14v12H5Z', 'green'],
    ['M3 19h18v2H3Z', 'dark'],
    ['M7 8.5V21m10-12.5V21', 'dark', { fill: 'none', strokeWidth: '1.4' }],
    ['M9 21v-6c0-2 6-2 6 0v6Z', 'dark'],
  ],
  lake: [
    ['M4 7c2 1.7 3.7 1.7 5.7 0s3.7-1.7 5.7 0 3.7 1.7 4.6 0v10H4Z', 'light'],
    ['M4 9.5c2 1.5 3.7 1.5 5.7 0s3.7-1.5 5.7 0 3.7 1.5 4.6 0v7.5H4Z', 'green'],
    ['M4 11c2 1.5 3.7 1.5 5.7 0s3.7-1.5 5.7 0 3.7 1.5 4.6 0', 'dark', { fill: 'none' }],
  ],
  rock: [
    ['M3 19 8 9l5-3 7 13Z', 'rock'],
    ['M8 9 13 6l1 13H3Z', 'green'],
    ['M8 9 13 6l7 4-6 2Z', 'light'],
  ],
};

const COLORS = { light: '#f0cb86', green: '#86a37e', dark: '#17353a', rock: '#7d9684' };

export function createLandmarkIcon(kind = 'peak') {
  const iconKind = ICON_PATHS[kind] ? kind : 'peak';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'landmark-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('role', 'presentation');
  svg.setAttribute('stroke-width', '1.5');
  svg.style.pointerEvents = 'none';
  svg.dataset.iconKind = iconKind;

  ICON_PATHS[iconKind].forEach(([d, tone, extra = {}]) => {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('class', `landmark-icon-${tone}`);
    Object.entries(extra).forEach(([attribute, value]) => path.setAttribute(attribute === 'strokeWidth' ? 'stroke-width' : attribute, value));
    if (!extra.fill) path.setAttribute('fill', COLORS[tone]);
    if (extra.fill === 'none' || extra.strokeWidth) path.setAttribute('stroke', COLORS.dark);
    svg.appendChild(path);
  });
  return svg;
}

export function getLandmarkIconKind(landmark = {}) {
  const name = String(landmark.name || '');
  if (landmark.category === '上山口') return 'trailhead';
  if (name.includes('洞')) return 'cave';
  if (name.includes('飞来石')) return 'rock';
  if (/(寺|庙|塔|亭|道院|道观|福星观)$/.test(name)) return 'temple';
  if (landmark.category === '湖畔名胜') return 'lake';
  if (name.includes('泉') || name.includes('烟树')) return 'lake';
  return 'peak';
}
