import * as THREE from 'three';

export const changbaiPOIs = [
  {
    id: 'tianchi', name: '天池', category: '天池火山口',
    longitude: 128.05698997519673, latitude: 42.00577838553149,
    description: '长白山主峰火山口内的湖泊，四周由山脊环抱。',
    viewOffset: [31, 33, 40],
    source: { url: 'https://www.openstreetmap.org/relation/11650508', kind: 'shoreline-center' },
  },
  {
    id: 'tianwenfeng-trail', name: '天文峰步道', category: '北坡',
    longitude: 128.0677358, latitude: 42.0263798,
    description: '天池东北侧的山脊步道位置，取公开地图步道中心。当前展示所在地形，步道设施尚未还原。',
    viewOffset: [-12, 12, -17],
    source: { url: 'https://www.openstreetmap.org/way/1033243463', kind: 'way-center' },
  },
  {
    id: 'xiaotianchi', name: '小天池', category: '北坡',
    longitude: 128.0568827, latitude: 42.0576897,
    description: '天池以北、岳桦林中的小湖。当前展示所在地形，湖面尚未单独建模。',
    viewOffset: [12, 12, 17],
    source: { url: 'https://www.openstreetmap.org/way/543958159', kind: 'way-center' },
  },
  {
    id: 'lvyuantan', name: '绿渊潭', category: '北坡',
    longitude: 128.0607681, latitude: 42.0592807,
    description: '位于小天池东侧略偏北的水潭。当前展示所在谷地，潭水与瀑布细节尚未单独建模。',
    viewOffset: [12, 12, 17],
    source: { url: 'https://www.openstreetmap.org/way/543958160', kind: 'way-center' },
  },
];

export function getPOIView(model, poi) {
  const target = model.toWorld(poi.longitude, poi.latitude);
  target.y = model.getHeight(target.x, target.z) + .25;
  const position = target.clone().add(new THREE.Vector3(...poi.viewOffset));
  // Check the approach above the actual terrain instead of using a fixed camera height.
  for (let step = 1; step <= 48; step += 1) {
    const t = step / 48;
    const point = target.clone().lerp(position, t);
    position.y = Math.max(position.y, target.y + (model.getHeight(point.x, point.z) + .5 - target.y) / t);
  }
  return { target, position };
}
