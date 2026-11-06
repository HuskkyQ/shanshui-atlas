import catalog from './src/places/catalog.json' with { type: 'json' };
import { renderHomeCollections } from './src/places/home-cards.js';

export default {
  plugins: [
    {
      name: 'json-module-attributes',
      enforce: 'pre',
      async resolveId(source, importer, options) {
        if (!source.endsWith('.json')) return null;
        const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
        return resolved && { ...resolved, attributes: { type: 'json' } };
      },
    },
    {
      name: 'scenic-home-cards',
      transformIndexHtml: {
        order: 'pre',
        handler: (html) =>
          html.replace('<!-- scenic-collections -->', renderHomeCollections(catalog)),
      },
    },
  ],
};
