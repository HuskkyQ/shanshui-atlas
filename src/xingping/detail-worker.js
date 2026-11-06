import { buildXingpingModel } from './model.js';

self.onmessage = (event) => {
  let model;
  try {
    model = buildXingpingModel({ ...event.data, deferDetail: false });
    model.update({ position: { distanceTo: () => 0 } }, 0);
    model.buildDetail();
    const geometry = model.group.getObjectByName('xingping-terrain-source-detail')?.geometry;
    if (!geometry) throw new Error('Xingping source-detail geometry was not built');
    const payload = {
      position: geometry.getAttribute('position').array,
      normal: geometry.getAttribute('normal').array,
      color: geometry.getAttribute('color').array,
      index: geometry.getIndex().array,
    };
    self.postMessage(payload, Object.values(payload).map(value => value.buffer));
  } finally {
    model?.dispose();
  }
};
