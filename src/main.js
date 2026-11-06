import './shared/compass.css';
import './shared/auto-roam.css';
import './shared/exhibit-layout.css';
import { PLACES } from './places/registry.js';
import { mountThemeToggle } from './shared/atlas-theme.js';

const params = new URLSearchParams(window.location.search);
const place = params.get('place');
const model = params.get('model');
const finishStartup = () => document.documentElement.removeAttribute('data-scene-startup');
const entry =
  model === 'house'
    ? {
        view: () =>
          Promise.all([
            import('./models/house/view.html?raw'),
            import('./models/house/preview.css'),
          ]),
        load: () => import('./models/house/preview.js'),
      }
    : Object.hasOwn(PLACES, place)
      ? PLACES[place]
      : null;

// A built scene can import shared exports from this entry chunk. Start it
// asynchronously so the entry finishes evaluating before that scene loads.
async function openScene(entry) {
  try {
    const [{ default: markup }] = await entry.view();
    const template = document.createElement('template');
    template.innerHTML = markup;
    mountThemeToggle(
      template.content.querySelector('.header-controls, .house-header-actions') ??
        template.content.querySelector('header'),
    );
    const scenicActions = template.content.querySelector('.scenic-header-actions');
    if (scenicActions) mountThemeToggle(scenicActions);
    document.querySelector('.homepage').replaceWith(template.content);
    finishStartup();
    if (model === 'house') document.title = '一间山居 · 房屋模型 · 山水志';
    await entry.load();
  } catch (error) {
    finishStartup();
    console.error('Failed to open place', error);
    const notice = document.createElement('div');
    notice.className = 'webgl-recovery-notice';
    notice.setAttribute('role', 'alert');
    notice.append('景观暂时无法加载。');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '重新加载';
    retry.addEventListener('click', () => window.location.reload());
    const back = document.createElement('a');
    back.href = './';
    back.textContent = '返回首页';
    notice.append(retry, back);
    document.body.append(notice);
  }
}

if (entry) {
  openScene(entry);
} else {
  finishStartup();
  mountThemeToggle(document.querySelector('.home-header-actions'));
  const sourceDialog = document.querySelector('#home-sources-dialog');
  const sourceCopyright = document.querySelector('#home-sources-copyright');
  const copernicusCopyright = sourceCopyright.textContent;
  document.querySelectorAll('[data-source-place]').forEach((button) =>
    button.addEventListener('click', () => {
      document.querySelector('#home-sources-title').textContent =
        `${button.dataset.name} · 数据来源`;
      document.querySelector('#home-sources-note').textContent =
        PLACES[button.dataset.sourcePlace].note;
      sourceCopyright.textContent = ['changbai', 'xingping'].includes(button.dataset.sourcePlace)
        ? `${copernicusCopyright} 地图数据 © OpenStreetMap贡献者（ODbL）；参考照片版权与许可见原始页面，未作为模型纹理。`
        : ['huangshan', 'west-lake'].includes(button.dataset.sourcePlace)
          ? copernicusCopyright
          : ['xuankong-si', 'daci-yan'].includes(button.dataset.sourcePlace)
            ? '实拍照片与视频版权归各来源作者所有，授权信息见原始页面。模型未直接使用这些照片作纹理；崖体为程序化艺术近似，未采用实测高程。'
            : '地图数据 © OpenStreetMap 贡献者，按开放数据库许可（ODbL）提供。建筑细节为艺术化近似。';
      document.querySelector('#home-sources-links').replaceChildren(
        ...PLACES[button.dataset.sourcePlace].sources.map(([label, url]) => {
          const link = document.createElement('a');
          link.textContent = label;
          link.href = url;
          link.target = '_blank';
          link.rel = 'noreferrer';
          return link;
        }),
      );
      sourceDialog.showModal();
    }),
  );
  document.querySelectorAll('.landscape-favorite').forEach((button) => {
    const storageKey = `landscape-favorite:${button.dataset.place}`;
    const setFavorite = (favorite) => {
      button.setAttribute('aria-pressed', String(favorite));
      button.setAttribute('aria-label', `${favorite ? '取消收藏' : '收藏'}${button.dataset.name}`);
    };
    try {
      setFavorite(localStorage.getItem(storageKey) === 'true');
    } catch {
      /* 收藏仍可在当前页面使用。 */
    }
    button.addEventListener('click', () => {
      const favorite = button.getAttribute('aria-pressed') !== 'true';
      setFavorite(favorite);
      try {
        localStorage.setItem(storageKey, String(favorite));
      } catch {
        /* 浏览器禁用存储时保留当前页面状态。 */
      }
    });
  });
}
