function pathMidpoint(points) {
  const lengths = points.slice(1).map((point, index) => Math.hypot(
    (point[0] - points[index][0]) * Math.cos(point[1] * Math.PI / 180), point[1] - points[index][1],
  ));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
  for (let index = 0; index < lengths.length; index++) {
    if (remaining <= lengths[index]) {
      const t = remaining / lengths[index];
      return points[index].map((value, axis) => value + (points[index + 1][axis] - value) * t);
    }
    remaining -= lengths[index];
  }
  return points[0];
}

// Keep the existing attraction IDs and descriptions while moving the Broken
// Bridge marker from its scenic-area point onto the actual bridge centreline.
export function getWestLakeBuiltPOIs(data, attractions) {
  const modelled = [];
  function add(item, coordinate, osmElement, description, viewOffset) {
    const original = attractions.find(({ id }) => id === item.id);
    modelled.push({ ...original, id: item.id, name: original?.name || item.name, category: '湖畔名胜',
      longitude: coordinate[0], latitude: coordinate[1], description: original?.description || description,
      osmElement, osm: `https://www.openstreetmap.org/${osmElement}`, viewOffset, modelled: true });
  }
  data.causeways.forEach((item) => add(item, pathMidpoint(item.points), `way/${item.osmWays[0]}`,
    item.id === 'sudi'
      ? '纵贯西湖西部的长堤，六座石拱桥串起南北湖岸。沿堤可以欣赏柳树与桃树，向东望湖，向西望山。'
      : '连接断桥与孤山的湖上长堤，途中经过锦带桥。杨柳与桃树沿岸相间，是观赏西湖北岸景色的经典步行段。',
    item.id === 'sudi' ? [4, 4.5, 6] : [2.4, 2.7, 3.6]));
  const suBridges = ['yingbo', 'suolan', 'wangshan', 'yadi', 'dongpu', 'kuahong'];
  data.bridges.forEach((item) => add(item, item.center, `way/${item.osmWays[0]}`,
    suBridges.includes(item.id)
      ? `苏堤六桥之一，位于自南向北的第${suBridges.indexOf(item.id) + 1}座。石拱桥连接堤道，两侧水面相通，桥上可眺望西湖。`
      : '白堤上的石拱桥，连接堤道两侧，可在桥上观赏湖面和北岸风景。', [0.5, 0.42, 0.65]));
  data.landmarks.forEach((item) => {
    const tower = item.kind === 'stone-pagodas' ? item.points[0] : null;
    add(item, tower ? [tower.longitude, tower.latitude] : [item.longitude, item.latitude],
      tower?.osmElement || item.osmElement,
      item.id === 'santan'
        ? '小瀛洲南面的湖水中，三座瓶形石塔鼎立。塔腹各有五个圆孔，月夜灯影与水中倒影构成“三潭印月”的意境。'
        : '西湖中央的小岛与亭阁，四周环水，可隔湖眺望山色与堤岸。这里与小瀛洲、阮公墩共同组成西湖三岛。',
      [0.75, 0.5, 0.9]);
  });
  data.islands.forEach((item) => add(item, pathMidpoint(item.outer), item.osmElement,
    '西湖三岛中面积最大的一座，岛中有湖、湖中有岛。环岸步道、亭台与内湖共同构成江南水上园林，南侧水域可观三潭石塔。', [1.1, 1.4, 1.7]));
  const replaced = new Set(modelled.map(({ id }) => id));
  return [...attractions.map((item) => replaced.has(item.id) ? modelled.find(({ id }) => id === item.id) : item),
    ...modelled.filter(({ id }) => !attractions.some((item) => item.id === id))];
}
