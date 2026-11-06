import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../src/places/catalog.json' with { type: 'json' };
import { PLACES } from '../src/places/registry.js';
import { renderHomeCollections } from '../src/places/home-cards.js';

test('every home card has one scene loader and external source information', () => {
  const cards = catalog.flatMap(group => group.cards);
  assert.equal(cards.length, 8);
  assert.equal(new Set(cards.map(card => card.place)).size, cards.length);
  for (const card of cards) {
    const place = PLACES[card.place];
    assert.equal(typeof place.view, 'function');
    assert.equal(typeof place.load, 'function');
    assert.ok(place.sources.length > 0);
    assert.ok(place.note.length > 0);
  }
  assert.ok(PLACES['xuankong-si'], 'retained route remains available without adding a home card');
});

test('generated initial HTML contains cards, accessible labels and source buttons', () => {
  const html = renderHomeCollections(catalog);
  for (const card of catalog.flatMap(group => group.cards)) {
    assert.ok(html.includes(`href="?place=${card.place}"`));
    assert.ok(html.includes(`data-source-place="${card.place}"`));
    assert.ok(html.includes(`id="${card.id}-title"`));
    assert.ok(html.includes(`width="${card.width}" height="${card.height}"`));
  }
  assert.equal((html.match(/class="landscape-card /g) || []).length, 8);
});
