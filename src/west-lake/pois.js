import mountainLandmarks from '../data/west-lake-landmarks.json' with { type: 'json' };
import originalAttractions from '../data/west-lake-attractions.json' with { type: 'json' };
import builtLandmarkData from '../data/west-lake-built-landmarks.json' with { type: 'json' };
import trailheads from '../data/west-lake-trailheads.json' with { type: 'json' };
import hillSights from '../data/west-lake-hill-sights.json' with { type: 'json' };
import { getWestLakeBuiltPOIs } from './built-pois.js';

const CORE_POI_IDS = new Set(['leifeng', 'lingyin-temple', 'santan']);
const FUTURE_SCENE_IDS = {
  leifeng: 'leifeng-pagoda',
  'lingyin-temple': 'lingyin-temple',
  santan: 'santanyinyue',
};
const BRIDGE_IDS = new Set(['yingbo', 'suolan', 'wangshan', 'yadi', 'dongpu', 'kuahong', 'jindai']);

function decorate(items, entityType) {
  return items.map((item) => {
    const importance = CORE_POI_IDS.has(item.id) ? 3
      : entityType === 'trailhead' || BRIDGE_IDS.has(item.id) ? 1 : 2;
    const sceneId = FUTURE_SCENE_IDS[item.id];
    return {
      ...item,
      entityType,
      importance,
      ...(sceneId ? { sceneId } : {}),
    };
  });
}

export const westLakePOIGroups = {
  mountains: decorate(mountainLandmarks, 'mountain'),
  attractions: decorate(getWestLakeBuiltPOIs(builtLandmarkData, originalAttractions), 'attraction'),
  trailheads: decorate(trailheads, 'trailhead'),
  hillSights: decorate(hillSights, 'hill-sight'),
};

export const westLakePOIs = Object.values(westLakePOIGroups).flat();
