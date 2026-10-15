import content from '../content/west-lake-scenic.json' with { type: 'json' };
import { leifengContent, santanContent, lingyinContent, jingciContent } from './scenic-content.js';

const implementations = {
  'leifeng-pagoda': {
    content: leifengContent,
    loader: (context) => import('./leifeng-pagoda/scene.js')
      .then((module) => module.createScene(context)),
  },
  santanyinyue: {
    content: santanContent,
    loader: (context) => import('./santanyinyue/scene.js')
      .then((module) => module.createScene(context)),
  },
  'lingyin-temple': {
    content: lingyinContent,
    loader: (context) => import('./lingyin-temple/scene.js')
      .then((module) => module.createScene(context)),
  },
  'jingci-temple': {
    content: jingciContent,
    loader: (context) => import('./jingci-temple/scene.js')
      .then((module) => module.createScene(context)),
  },
};

const scenes = new Map(content.map((item) => {
  const implementation = implementations[item.id];
  const ready = Boolean(implementation);
  return [item.id, Object.freeze({ ...item,
    status: ready ? 'ready' : item.status,
    enabled: ready,
    hidden: !ready,
    content: implementation?.content || null,
    loader: implementation?.loader || null,
  })];
}));

export function getScenicScene(sceneId) {
  return scenes.get(sceneId) || null;
}
