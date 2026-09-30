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
}
