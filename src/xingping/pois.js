import * as THREE from 'three';

export const xingpingPOIs = [
  { id: 'jiumaha', name: '九马画山', category: '临江峰群', longitude: 110.4906918, latitude: 24.9384064, description: '临江峰群与河湾相映。', viewOffset: [-8, 4.5, 2], source: { url: 'https://www.openstreetmap.org/node/3151840555', kind: 'node' } },
  { id: 'xianggong', name: '相公山', category: '高位山峰', longitude: 110.4790377, latitude: 24.9258349, description: '俯瞰漓江的高位山峰。', viewOffset: [8, 4, 9], source: { url: 'https://www.openstreetmap.org/node/1599397646', kind: 'node' } },
  { id: 'huangbu', name: '黄布倒影', category: '观景位置', longitude: 110.5166399, latitude: 24.9251035, description: '黄布河湾的观景位置。', viewOffset: [7, 3.5, 8], source: { url: 'https://www.openstreetmap.org/node/4376696293', kind: 'node' } },
  { id: 'xingping-town', name: '兴坪古镇', category: '聚落定位', longitude: 110.5236087, latitude: 24.9191229, description: '古镇与老寨山相邻的河谷聚落。', viewOffset: [7, 3, 8], source: { url: 'https://www.openstreetmap.org/node/9921956319', kind: 'node' } },
  { id: 'laozhai', name: '老寨山', category: '古镇后山', longitude: 110.5205037, latitude: 24.9177348, description: '古镇后侧的登高山峰。', viewOffset: [6, 3.5, 8], source: { url: 'https://www.openstreetmap.org/node/4780981642', kind: 'node' } },
  { id: 'fishing-village', name: '兴坪渔村', category: '河谷聚落', longitude: 110.5131787, latitude: 24.9053907, description: '漓江下游的河谷村落。', viewOffset: [8, 3.5, 9], source: { url: 'https://www.openstreetmap.org/node/3975227499', kind: 'node' } },
];

export function getPOIView(model, poi, aspect = 16 / 9) {
  const target = model.toWorld(poi.longitude, poi.latitude);
  target.y = model.getHeight(target.x, target.z) + .3;
  if (poi.id === 'jiumaha' && model.jiumaCliff) {
    const view = model.jiumaCliff.view;
    const position = view.position.clone().sub(view.target).multiplyScalar(Math.max(1, .72 / aspect)).add(view.target);
    position.y = Math.max(position.y, model.getHeight(position.x, position.z) + .6);
    const approaches = [view.target];
    if (aspect < 1) for (const fraction of [.2, .8]) {
      const station = model.jiumaCliff.stations[Math.floor((model.jiumaCliff.stations.length - 1) * fraction)];
      const edge = station.center.clone().addScaledVector(station.land, -.7);
      edge.y = model.waterLevel + (station.shoulder - model.waterLevel) * .55;
      approaches.push(edge);
    }
    for (const approach of approaches) for (let step = 8; step <= 48; step++) {
      const t = step / 48;
      const point = approach.clone().lerp(position, t);
      position.y = Math.max(position.y, approach.y + (model.getHeight(point.x, point.z) + .25 - approach.y) / t);
    }
    return { target: view.target.clone(), position, markerPosition: target };
  }
  const position = target.clone().add(new THREE.Vector3(...poi.viewOffset));
  for (let step = 1; step <= 48; step += 1) {
    const t = step / 48;
    const point = target.clone().lerp(position, t);
    position.y = Math.max(position.y, target.y + (model.getHeight(point.x, point.z) + .6 - target.y) / t);
  }
  return { target, position };
}
