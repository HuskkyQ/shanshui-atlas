const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character],
  );

export function renderHomeCollections(groups) {
  return groups
    .map(
      (
        group,
        groupIndex,
      ) => `<section ${groupIndex === 0 ? 'id="landscapes" ' : ''}class="home-collection${groupIndex ? ' home-garden-collection' : ''}" aria-labelledby="${escape(group.id)}">
    <div class="home-collection-heading"><h2 id="${escape(group.id)}">${escape(group.title)}</h2><span>${String(group.cards.length).padStart(2, '0')} <span aria-hidden="true">/</span> ${escape(group.english)}</span></div>
    ${groupIndex === 0 ? '<div class="home-grid">' : ''}
    ${group.cards
      .map(
        (
          card,
          index,
        ) => `<article class="landscape-card${groupIndex ? ' garden-card' : ''} has-sources">
      <a class="landscape-card-link" href="?place=${escape(card.place)}" aria-labelledby="${escape(card.id)}-title ${escape(card.id)}-action">
        <div class="landscape-image">
          <img src="${escape(card.image)}" ${card.srcset ? `srcset="${escape(card.srcset)}" sizes="${escape(card.sizes)}" ` : ''}width="${card.width}" height="${card.height}" alt="${escape(card.alt)}" ${groupIndex === 0 && index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} />
          <span class="landscape-index" aria-hidden="true">${String(index + 1).padStart(2, '0')} <span>${escape(card.symbol)}</span></span>
          <span class="landscape-coordinates" aria-hidden="true">${escape(card.coordinates)}</span>
        </div>
        <div class="landscape-info"><div>
          <p class="landscape-location">${escape(card.location)} <span>${escape(card.region)}</span></p>
          <h3 id="${escape(card.id)}-title">${escape(card.name)} <span>${escape(card.english)}</span></h3>
          <p class="landscape-description">${escape(card.description)}</p>
        </div><span id="${escape(card.id)}-action" class="landscape-action">${escape(card.action)} <span aria-hidden="true">↗</span></span></div>
      </a>
      <div class="landscape-card-tools"><button class="landscape-sources" type="button" data-source-place="${escape(card.place)}" data-name="${escape(card.sourceName)}" aria-label="查看${escape(card.sourceName)}数据来源"><span aria-hidden="true">ⓘ</span> 数据来源</button></div>
      <button class="landscape-favorite" type="button" data-place="${escape(card.place)}" data-name="${escape(card.name)}" aria-label="收藏${escape(card.name)}" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg></button>
    </article>`,
      )
      .join('\n')}
    ${groupIndex === 0 ? '</div>' : ''}
  </section>`,
    )
    .join('\n');
}
