import content from '../content/chengqi-lou.json' with { type: 'json' };
import { createScene } from './scene.js';
import { createChengqiUI } from './ui.js';

const chengqi = createChengqiUI({ document, window, createScene, content });
await chengqi.start();
