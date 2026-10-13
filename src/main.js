import './home.css';

const place = new URLSearchParams(window.location.search).get('place');
const model = new URLSearchParams(window.location.search).get('model');

if (model === 'house') {
  const [{ default: houseMarkup }] = await Promise.all([
    import('./models/house/view.html?raw'),
    import('./models/house/preview.css'),
  ]);
  document.body.innerHTML = houseMarkup;
  document.title = '一间山居 · 房屋模型 · 山水志';
  await import('./models/house/preview.js');
} else if (place === 'zhuozheng-garden') {
  document.querySelector('.homepage').hidden = true;
  const [{ default: gardenMarkup }] = await Promise.all([
    import('./zhuozheng-garden/view.html?raw'),
    import('./zhuozheng-garden/garden.css'),
  ]);
  document.body.innerHTML = gardenMarkup;
  await import('./zhuozheng-garden/index.js');
} else if (place === 'huangshan' || place === 'west-lake') {
  document.querySelector('.homepage').hidden = true;
  const [{ default: exhibitMarkup }] = await Promise.all([
    import('./landscape/exhibit.html?raw'),
    import('./landscape/style.css'),
  ]);
  document.body.innerHTML = exhibitMarkup;
  await import('./landscape/exhibit.js');
} else {
  document.querySelectorAll('.landscape-favorite').forEach((button) => {
    const storageKey = `landscape-favorite:${button.dataset.place}`;
    const setFavorite = (favorite) => {
      button.setAttribute('aria-pressed', String(favorite));
      button.setAttribute('aria-label', `${favorite ? '取消收藏' : '收藏'}${button.dataset.name}`);
    };
    try {
      setFavorite(localStorage.getItem(storageKey) === 'true');
    } catch { /* 收藏仍可在当前页面使用。 */ }
    button.addEventListener('click', () => {
      const favorite = button.getAttribute('aria-pressed') !== 'true';
      setFavorite(favorite);
      try {
        localStorage.setItem(storageKey, String(favorite));
      } catch { /* 浏览器禁用存储时保留当前页面状态。 */ }
    });
  });
}
