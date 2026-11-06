import { buildChangbaiModel } from './model.js';


self.onmessage = (event) => {
  let model;
  try {
    model = buildChangbaiModel(event.data);
    model.update({ position: model.lakeCenter.clone() }, 0);
    const geometry = model.group.getObjectByName('changbai-terrain-source-detail')?.geometry;
    if (!geometry) throw new Error('Changbai source-detail geometry was not built');
    const position = geometry.getAttribute('position').array;
    const normal = geometry.getAttribute('normal').array;
    const color = geometry.getAttribute('color').array;
    const uv = geometry.getAttribute('uv').array;
    const index = geometry.getIndex().array;
    self.postMessage(
      { position, normal, color, uv, index },
      [position.buffer, normal.buffer, color.buffer, uv.buffer, index.buffer],
    );
  } finally {
    model?.dispose();
  }
};
