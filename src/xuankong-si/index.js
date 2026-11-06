import content from '../content/xuankong-si.json' with { type: 'json' };
import { createScene } from './scene.js';
import { createXuankongUI } from './ui.js';

const xuankong = createXuankongUI({ document, window, createScene, content });
await xuankong.start();
