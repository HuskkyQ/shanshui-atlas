import './home.css';

const place = new URLSearchParams(window.location.search).get('place');

if (place === 'huangshan' || place === 'west-lake') {
  document.querySelector('.homepage').hidden = true;
  const [{ default: exhibitMarkup }] = await Promise.all([
    import('./exhibit.html?raw'),
    import('./style.css'),
  ]);
  document.body.innerHTML = exhibitMarkup;
  await import('./exhibit.js');
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
