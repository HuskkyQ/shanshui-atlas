import './style.css';
import huangshanLandmarks from '../data/huangshan-landmarks.json';
import { westLakePOIs, westLakePOIGroups } from '../west-lake/pois.js';
import { getScenicScene } from '../west-lake/scenic-scenes.js';
import { createSceneSession } from '../west-lake/scene-session.js';
import { createScenicUI } from '../west-lake/scenic-ui.js';
import { createPOIPhoto } from '../shared/poi-photo.js';
import westLakeRoutes from '../data/west-lake-routes.json';
import westLakeHikes from '../data/west-lake-hikes.json';

const isWestLake = new URLSearchParams(window.location.search).get('place') === 'west-lake';
const { mountains: westLakeLandmarks, attractions: westLakeAttractions, trailheads: westLakeTrailheads,
  hillSights: westLakeHillSights } = westLakePOIGroups;
document.title = isWestLake ? '西湖 · 山水志' : '黄山 · 山水志';
document.querySelector('meta[name="description"]').content = isWestLake
  ? '以 Three.js 探索杭州西湖、真实湖岸与周边群山。'
  : '以 Three.js 探索黄山的奇峰、云海与迎客松。';
const landmarks = isWestLake
  ? westLakePOIs
  : huangshanLandmarks;
const westLakeRouteSource = 'https://wgly.hangzhou.gov.cn/module/download/downfile.jsp?classid=0&filename=c3ccb4250d3143a09047ee20fbe1170c.pdf';
let renderRouteCredit;
document.querySelectorAll('[data-place]').forEach((link) => {
  if (link.dataset.place === (isWestLake ? 'west-lake' : 'huangshan')) link.setAttribute('aria-current', 'page');
});

if (isWestLake) {
  document.querySelector('#app').classList.add('is-west-lake');
  document.querySelector('#canvas-wrap').setAttribute('aria-label', '可旋转的杭州西湖与群山三维场景，点击标记探索上山口、群山与湖山名胜');
  document.querySelector('.eyebrow').innerHTML = '<span class="eyebrow-line"></span> HANGZHOU, CHINA <span class="eyebrow-dot">◆</span> 30°N 120°E';
  document.querySelector('#title').innerHTML = '西<span>湖</span>';
  document.querySelector('.english-title').textContent = 'WEST LAKE · HANGZHOU';
  document.querySelector('.intro-copy').innerHTML = '三面云山，一湖碧水，<br />在湖岸与山脊之间游望。';
  document.querySelector('.intro-caption').textContent = '西湖与周边群山 · 高程数据驱动的微缩景观';
  document.querySelector('.terrain-source a:nth-child(2)').textContent = '湖岸、路线与点位：© OpenStreetMap 贡献者 ↗';
  const reference = document.createElement('a');
  reference.href = 'https://www.google.com/maps/@30.238,120.125,13z/data=!5m1!1e4';
  reference.target = '_blank';
  reference.rel = 'noreferrer';
  reference.textContent = '地貌参考：Google Maps 地形视图 ↗';
  document.querySelector('.terrain-source').insertBefore(reference, document.querySelector('.terrain-source p'));
  document.querySelector('.scene-caption').innerHTML = '<span class="caption-cross">＋</span> 湖山相依 <span> / </span> BETWEEN WATER & WOODED HILLS';
  document.querySelector('.view-group-heading').innerHTML = '西湖群山 <i></i> HILLS';
  document.querySelector('.landmark-kicker').innerHTML = '西湖群山 <b>LANDMARK</b>';
  document.querySelector('#landmark-source').textContent = '地图点位资料 ↗';
  document.querySelector('.landmark-detail small').textContent = '山脊依据 30 米级高程展示，局部建筑与岩石未作精细还原。';
  const routeCredit = document.querySelector('.trailhead-credit');
  const routeStopNames = new Map(westLakeAttractions.map((item) => [item.id, item.name]));
  const osmSource = 'https://www.openstreetmap.org/copyright';
  const routeSequence = (route) => {
    if (route.start || route.end) return [route.start, ...(route.via || []), route.end].filter(Boolean);
    return (route.stops || []).map((id) => routeStopNames.get(id) || id);
  };
  renderRouteCredit = ({ routes, title, english, source, network }) => {
    routeCredit.innerHTML = `<strong>${title} <span>${english}</span></strong><ul class="route-legend">${routes.map((route) => {
      const length = Number.isFinite(route.mappedLengthMetres) ? `${(route.mappedLengthMetres / 1000).toFixed(1)} km` : '地图折线估算';
      const sequence = routeSequence(route).join(' → ');
      const name = route.official
        ? `<a class="route-name" href="${route.official}" target="_blank" rel="noreferrer">${route.name} ↗</a>`
        : route.name;
      return `<li><i style="--route-color:${route.color}"></i><span>${name} · ${length}<small>${sequence}</small></span></li>`;
    }).join('')}</ul>${network ? '<small>彩色：精选主线片段；浅色：地图支路。浅色点：岔路；金色点：接路处；灰色点：地图断点或展示边界。</small>' : ''}<small>路线为公开地图几何示意，长度为地图折线估算；开放与现场通行以景区公告为准。</small><a href="${source || osmSource}" target="_blank" rel="noreferrer">${source ? '杭州西湖景区资料 ↗' : '步道几何 © OpenStreetMap 贡献者 ↗'}</a>${source ? `<a href="${osmSource}" target="_blank" rel="noreferrer">路线几何 © OpenStreetMap 贡献者 ↗</a>` : ''}`;
  };
  renderRouteCredit({ routes: westLakeRoutes.routes, title: '西湖步行路线', english: 'WALKING ROUTES', source: westLakeRouteSource });
  const viewMarkup = (id, name, number) => `<button class="view-button${id === 'overview' ? ' is-active' : ''}" data-view="${id}" aria-pressed="${id === 'overview'}"><span class="view-no">${String(number).padStart(2, '0')}</span><span>${name}</span><span class="view-arrow">↗</span></button>`;
  document.querySelector('.view-main').innerHTML = [['overview', '湖山全景'], ['lake', '湖畔之间'], ['hills', '湖西群山'], ['top', '游览路线'], ['hiking', '群山徒步']]
    .map(([id, name], index) => viewMarkup(id, name, index + 1)).join('');
  const groupDefinitions = [
    { className: 'trailheads', title: '上山口', english: 'TRAILHEADS', items: westLakeTrailheads, open: true },
    { className: 'hill-sights', title: '山间名胜', english: 'HILL SIGHTS', items: westLakeHillSights },
    { className: 'attractions', title: '湖畔名胜', english: 'SHORELINE SIGHTS', items: westLakeAttractions },
    { className: 'mountains', title: '西湖群山', english: 'HILLS', items: westLakeLandmarks },
  ];
  const oldGroups = document.querySelectorAll('.view-group-heading, .view-landmarks');
  oldGroups.forEach((node) => node.remove());
  let landmarkNumber = 6;
  const groupsMarkup = groupDefinitions.map(({ className, title, english, items, open }) => {
    const buttons = items.map(({ id, name }) => viewMarkup(id, name, landmarkNumber++)).join('');
    return `<details class="view-group view-group-${className}" data-point-category="${title}" name="west-landmark-groups"${open ? ' open' : ''}><summary><span>${title}</span><b>${english}</b><i>＋</i></summary><div class="view-landmarks">${buttons}</div></details>`;
  }).join('');
  document.querySelector('.view-main').insertAdjacentHTML('afterend', groupsMarkup);
}

const motionButton = document.querySelector('#motion-toggle');
const stateLabel = motionButton.querySelector('.toggle-state');
const lightStatus = document.querySelector('#light-status');
const cleanButton = document.querySelector('#clean-toggle');
const cleanLabel = cleanButton.querySelector('.clean-label');
const immersiveButton = document.querySelector('#immersive-toggle');
const immersiveLabel = immersiveButton.querySelector('.immersive-label');
const viewButtons = [...document.querySelectorAll('[data-view]')];
const landmarkDetail = document.querySelector('#landmark-detail');
const scenicEnter = document.querySelector('#scenic-enter');
const showLandmarkPhoto = createPOIPhoto(document.querySelector('#landmark-photo'));

function renderLandmark(landmark) {
  const scenic = isWestLake && landmark.sceneId ? getScenicScene(landmark.sceneId) : null;
  scenicEnter.hidden = !scenic?.enabled || scenic.hidden;
  scenicEnter.dataset.sceneId = scenic?.id || '';
  const category = isWestLake
    ? (westLakeLandmarks.some((item) => item.id === landmark.id) ? '西湖群山' : landmark.category)
    : landmark.category === '上山口' ? '上山口' : null;
  document.querySelector('.landmark-kicker').innerHTML = `${category || '黄山名胜'} <b>LANDMARK</b>`;
  document.querySelector('#landmark-name').textContent = landmark.name;
  showLandmarkPhoto(landmark.id, landmark.name);
  document.querySelector('#landmark-description').textContent = scenic?.description || landmark.description;
  const source = scenic?.sources.find((item) => item.url === landmark.official)?.url
    || (category === '上山口' ? landmark.osm : (landmark.official || landmark.osm));
  const sourceLink = document.querySelector('#landmark-source');
  sourceLink.hidden = !source;
  if (source) sourceLink.href = source;
  sourceLink.textContent = landmark.official && category !== '上山口' ? '景区资料 ↗' : '地图点位资料 ↗';
  document.querySelector('.landmark-detail small').textContent = category === '上山口'
    ? isWestLake ? '点位表示步道接路处或支线入口，不代表检票闸机。' : '点位对应山脚登山点地名，检票闸机与起点以现场指引为准。'
    : category === '山间名胜'
      ? '位置依据公开地图；建筑、洞口和园林未精细复原。'
      : category === '湖畔名胜'
        ? landmark.modelled
          ? landmark.id === 'santan' ? '一座石塔按公开地图定位，其余两座的位置及建筑细节为实景近似。' : '位置与轮廓依据公开地图，建筑细节为实景近似。'
          : '位置依据公开地图点位；周边建筑与园林细节未作精细复原。'
        : isWestLake ? '山脊依据 30 米级高程展示，局部建筑与岩石未作精细还原。' : '模型位置为公开地图近似坐标；实地通行以景区公告为准。';
  landmarkDetail.hidden = false;
  return category;
}

function openWestGroup(category) {
  if (!isWestLake) return;
  const groupByCategory = { 上山口: 'trailheads', 山间名胜: 'hill-sights', 湖畔名胜: 'attractions', 西湖群山: 'mountains' };
  const className = groupByCategory[category];
  if (!className) return;
  document.querySelectorAll('.view-group').forEach((group) => {
    group.open = group.classList.contains(`view-group-${className}`);
  });
}

function updateMotion(isOn) {
  motionButton.setAttribute('aria-pressed', String(isOn));
  stateLabel.textContent = isOn ? 'ON' : 'OFF';
}

function updateLightingStatus({ time, period }) {
  lightStatus.textContent = `北京时间 ${time} · ${period}`;
}

function updateCleanMode(isClean) {
  document.querySelector('#app').classList.toggle('is-clean', isClean);
  cleanButton.setAttribute('aria-pressed', String(isClean));
  cleanLabel.textContent = isClean ? '恢复光影' : '去除光影';
  cleanButton.title = isClean ? '恢复原视角与实时日夜光照' : '关闭日夜光照、投影与云雾，保留模型原色';
}

try {
  const createScene = isWestLake ? (await import('../west-lake/scene.js')).createWestLakeScene
    : (await import('../huangshan/scene.js')).createHuangshanScene;
  const exhibit = await createScene(document.querySelector('#canvas-wrap'), updateMotion, updateLightingStatus);
  const scenicSession = isWestLake ? createSceneSession({ world: exhibit, scenes: getScenicScene }) : null;
  const scenicUI = isWestLake ? createScenicUI({ session: scenicSession,
    container: document.querySelector('#canvas-wrap'), entryButton: scenicEnter }) : null;
  updateMotion(exhibit.isMotionOn());
  updateCleanMode(exhibit.isCleanMode());
  let immersiveMode = false, pinnedHotspot = null;
  const canvasWrap = document.querySelector('#canvas-wrap');
  const immersivePanels = [...document.querySelectorAll('.brand, .place-nav, .clean-toggle, .intro, .scene-caption, .trailhead-credit, .view-nav, .site-footer, .compass')];
  const hotspots = [...canvasWrap.querySelectorAll('.scenic-hotspot, .trailhead-hotspot')];

  function hideImmersiveDetail() {
    if (!immersiveMode || scenicUI?.isOpen) return;
    pinnedHotspot?.classList.remove('is-pinned');
    pinnedHotspot = null;
    landmarkDetail.hidden = true;
    landmarkDetail.classList.remove('is-pinned');
  }

  function showImmersiveDetail(hotspot, pin = false) {
    if (!immersiveMode || (pinnedHotspot && !pin)) return;
    const landmark = landmarks.find((item) => item.id === hotspot.dataset.landmarkId)
      || { name: hotspot.dataset.landmarkName, description: hotspot.dataset.landmarkDescription, category: '上山口' };
    if (!landmark.name) return;
    renderLandmark(landmark);
    pinnedHotspot?.classList.remove('is-pinned');
    pinnedHotspot = pin ? hotspot : null;
    pinnedHotspot?.classList.add('is-pinned');
    landmarkDetail.classList.toggle('is-pinned', pin);
    const rect = hotspot.getBoundingClientRect();
    const width = landmarkDetail.offsetWidth, height = landmarkDetail.offsetHeight;
    const right = rect.right + 12;
    const left = right + width <= window.innerWidth - 12 ? right : rect.left - width - 12;
    landmarkDetail.style.left = `${Math.max(12, Math.min(left, window.innerWidth - width - 12))}px`;
    landmarkDetail.style.top = `${Math.max(74, Math.min(rect.top, window.innerHeight - height - 12))}px`;
  }

  function setImmersiveMode(value) {
    immersiveMode = value;
    if (value && exhibit.isCleanMode()) updateCleanMode(exhibit.toggleCleanMode());
    document.querySelector('#app').classList.toggle('is-immersive', value);
    immersiveButton.setAttribute('aria-pressed', String(value));
    immersiveLabel.textContent = value ? '退出沉浸' : '沉浸式体验';
    immersivePanels.forEach((panel) => { panel.inert = value; });
    exhibit.setImmersiveMode(value);
    pinnedHotspot?.classList.remove('is-pinned');
    pinnedHotspot = null;
    landmarkDetail.hidden = true;
    landmarkDetail.classList.remove('is-pinned');
    if (isWestLake) {
      const category = document.querySelector('.view-group[open]')?.dataset.pointCategory || '上山口';
      exhibit.setPointCategory(value ? 'all' : category);
    }
    if (!value) {
      landmarkDetail.style.removeProperty('left');
      landmarkDetail.style.removeProperty('top');
      const active = viewButtons.find((button) => button.getAttribute('aria-pressed') === 'true');
      const landmark = landmarks.find((item) => item.id === active?.dataset.view);
      if (landmark) renderLandmark(landmark);
    }
  }

  immersiveButton.addEventListener('click', () => setImmersiveMode(!immersiveMode));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented && immersiveMode && !scenicUI?.isOpen) {
      setImmersiveMode(false);
      immersiveButton.focus();
    }
  });
  hotspots.forEach((hotspot) => {
    hotspot.addEventListener('pointerenter', () => showImmersiveDetail(hotspot));
    hotspot.addEventListener('focus', () => showImmersiveDetail(hotspot));
    hotspot.addEventListener('pointerleave', () => { if (!pinnedHotspot) hideImmersiveDetail(); });
    hotspot.addEventListener('blur', () => { if (!pinnedHotspot) hideImmersiveDetail(); });
  });
  canvasWrap.addEventListener('click', (event) => {
    const hotspot = event.target.closest('.scenic-hotspot, .trailhead-hotspot');
    if (immersiveMode && hotspot && !scenicUI?.isOpen) {
      event.stopPropagation();
      if (isWestLake) {
        const button = viewButtons.find((item) => item.dataset.view === hotspot.dataset.landmarkId);
        if (button) selectView(button);
      }
      showImmersiveDetail(hotspot, true);
    }
  }, true);
  canvasWrap.addEventListener('pointerdown', (event) => { if (event.target.tagName === 'CANVAS') hideImmersiveDetail(); });
  canvasWrap.addEventListener('wheel', hideImmersiveDetail, { passive: true });
  window.addEventListener('resize', hideImmersiveDetail);
  if (isWestLake) {
    exhibit.setPointCategory('上山口');
    document.querySelectorAll('.view-group').forEach((group) => group.addEventListener('toggle', () => {
      if (group.open && !immersiveMode) exhibit.setPointCategory(group.dataset.pointCategory);
    }));
  }

  function selectView(button) {
    exhibit.setView(button.dataset.view);
    const landmark = landmarks.find((item) => item.id === button.dataset.view);
    document.querySelector('#app').classList.toggle('is-trailheads', !isWestLake && button.dataset.view === 'trailheads');
    const isMapView = isWestLake && (button.dataset.view === 'top' || button.dataset.view === 'hiking');
    document.querySelector('#app').classList.toggle('is-map', isMapView);
    document.querySelector('#app').classList.toggle('is-hiking-view', isWestLake && button.dataset.view === 'hiking');
    document.querySelector('#app').classList.toggle('is-landmark', Boolean(landmark));
    if (isWestLake && button.dataset.view === 'top') openWestGroup('湖畔名胜');
    if (isWestLake && button.dataset.view === 'hiking') openWestGroup('上山口');
    landmarkDetail.hidden = !landmark;
    if (landmark) {
      const category = renderLandmark(landmark);
      if (isWestLake) openWestGroup(category);
    }
    viewButtons.forEach((other) => {
      const active = other === button;
      other.classList.toggle('is-active', active);
      other.setAttribute('aria-pressed', String(active));
    });
    if (isWestLake && button.dataset.view === 'hiking') {
      renderRouteCredit({ routes: westLakeHikes.routes, title: '西湖群山步道网络', english: 'HILL TRAILS', source: null, network: westLakeHikes.network });
    } else if (isWestLake && button.dataset.view === 'top') {
      renderRouteCredit({ routes: westLakeRoutes.routes, title: '西湖步行路线', english: 'WALKING ROUTES', source: westLakeRouteSource });
    }
  }
  viewButtons.forEach((button) => button.addEventListener('click', () => selectView(button)));

  motionButton.addEventListener('click', () => exhibit.toggleMotion());
  cleanButton.addEventListener('click', () => updateCleanMode(exhibit.toggleCleanMode()));
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) { scenicUI?.dispose(); scenicSession?.dispose(); exhibit.dispose(); }
  });
} catch (error) {
  console.error('Failed to initialize landscape scene', error);
  document.querySelector('#scene-error').hidden = false;
  motionButton.disabled = true;
  cleanButton.disabled = true;
  immersiveButton.disabled = true;
  viewButtons.forEach((button) => { button.disabled = true; });
}
