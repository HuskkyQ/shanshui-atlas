import content from './content/zhuozheng-garden.json' with { type: 'json' };
import { createScene } from './scenes/zhuozheng-garden.js';
import { createGardenUI } from './garden-ui.js';

const garden = createGardenUI({ document, window, createScene, content });
await garden.start();
