import { layout } from './layout.js';
import { createWaterQuery } from './surfaces.js';
import { generateLandArrays } from './land.js';

self.onmessage = (event) => {
  if (!event.data || event.data.type !== 'build-land') return;
  try {
    const waterQuery = createWaterQuery({
      channels: layout.channels,
      waterAreas: layout.waterAreas,
      landPaths: layout.landPaths || [],
    });
    const { top, sides } = generateLandArrays(waterQuery, event.data.bounds);
    const position = new Float32Array(top);
    const bankPosition = new Float32Array(sides);
    self.postMessage({ type: 'land-geometry', position, bankPosition }, [position.buffer, bankPosition.buffer]);
  } catch (error) {
    self.postMessage({ type: 'land-error', message: error instanceof Error ? error.message : String(error) });
  }
};
