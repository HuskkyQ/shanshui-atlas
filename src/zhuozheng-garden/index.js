import content from '../content/zhuozheng-garden.json' with { type: 'json' };
import { createScene } from './scene.js';
import { createGardenUI } from './ui.js';

const garden = createGardenUI({ document, window, createScene, content });
await garden.start();
