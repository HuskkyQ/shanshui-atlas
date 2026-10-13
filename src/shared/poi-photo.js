import photos from '../content/poi-photos.json' with { type: 'json' };

export function createPOIPhoto(container, photoCollection = photos) {
  return function showPhoto(id, name) {
    const photo = photoCollection[id];
    const figure = document.createElement('figure');
    figure.className = 'poi-photo';
    if (!photo) {
      const empty = document.createElement('p');
      empty.className = 'poi-photo-empty';
      empty.textContent = '暂无实景照片';
      figure.append(empty);
      container.replaceChildren(figure);
      return;
    }

    const media = document.createElement('div');
    media.className = 'poi-photo-media';
    const status = document.createElement('span');
    status.className = 'poi-photo-status';
    status.setAttribute('role', 'status');
    status.textContent = '图片加载中…';
    const image = document.createElement('img');
    image.alt = photo.alt || `${name}实景照片`;
    image.decoding = 'async';
    image.hidden = true;
    image.addEventListener('load', () => { image.hidden = false; status.hidden = true; });
    image.addEventListener('error', () => { image.hidden = true; status.hidden = false; status.textContent = '图片暂时无法显示'; });
    image.src = photo.src;
    media.append(image, status);

    const caption = document.createElement('figcaption');
    const description = document.createElement('span');
    description.textContent = photo.caption || '景点实景';
    const credit = document.createElement('a');
    credit.href = photo.sourceUrl;
    credit.target = '_blank';
    credit.rel = 'noreferrer';
    credit.textContent = `${photo.author} ↗`;
    credit.setAttribute('aria-label', `${name}照片来源：${photo.author}`);
    const license = document.createElement('a');
    license.href = photo.licenseUrl;
    license.target = '_blank';
    license.rel = 'noreferrer';
    license.textContent = photo.license;
    const credits = document.createElement('div');
    credits.className = 'poi-photo-credit';
    credits.append(credit, license);
    caption.append(description, credits);
    figure.append(media, caption);
    container.replaceChildren(figure);
  };
}
