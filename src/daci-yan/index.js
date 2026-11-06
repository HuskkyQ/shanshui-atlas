import content from '../content/daci-yan.json' with { type: 'json' };
import { createScene } from './scene.js';
import { createDaciUI } from './ui.js';

const daci = createDaciUI({ document, window, createScene, content });
await daci.start();
