// Local artistic coordinates reconstructed from the two Mu-tect proposal renderings.
// They describe massing and courtyard relationships, not surveyed footprints.
// Legacy east/west IDs are stable grouping keys; use the labels for left/right placement in the reference view.
export const JINGCI_LAYOUT = [
  { id: 'gate', zone: 'central-axis', label: '前部入口殿', type: 'gate', x: 0, z: 0, width: 13, depth: 5.5, level: 0, floors: 1, eaves: 1 },
  { id: 'bell', zone: 'front-court', label: '前院西侧楼阁', type: 'tower', x: -14.5, z: 7.5, width: 6.5, depth: 5.6, level: 0.35, floors: 2, eaves: 3 },
  { id: 'front-east-pavilion', zone: 'front-court', label: '前院东侧楼阁', type: 'tower', x: 14.5, z: 7.5, width: 6.5, depth: 5.6, level: 0.35, floors: 2, eaves: 2 },
  { id: 'daxiong', zone: 'central-axis', label: '中轴宽大重檐殿', type: 'main-hall', x: 0, z: 24, width: 20, depth: 12, level: 1.35, floors: 1, eaves: 2 },
  { id: 'rear-hall', zone: 'central-axis', label: '中轴后殿', type: 'hall', x: 0, z: 43.5, width: 18, depth: 8.5, level: 4.35, floors: 1, eaves: 1 },
  { id: 'rear-pavilion', zone: 'rear-terrace', label: '后部高台三檐大阁', type: 'grand-pavilion', x: 0, z: 66, width: 18, depth: 13, level: 9.2, floors: 3, eaves: 3 },

  { id: 'main-west-wing', zone: 'main-court', label: '中院西庑', type: 'wing', x: -17.5, z: 24, width: 6.2, depth: 20, level: 1.2, floors: 1, eaves: 1 },
  { id: 'main-east-wing', zone: 'main-court', label: '中院东庑', type: 'wing', x: 17.5, z: 24, width: 6.2, depth: 20, level: 1.2, floors: 1, eaves: 1 },
  { id: 'middle-west-gallery', zone: 'middle-court', label: '中后院西廊', type: 'gallery', x: -14.5, z: 41.5, width: 5.2, depth: 15, level: 3.7, floors: 1, eaves: 1 },
  { id: 'middle-east-gallery', zone: 'middle-court', label: '中后院东廊', type: 'gallery', x: 14.5, z: 41.5, width: 5.2, depth: 15, level: 3.7, floors: 1, eaves: 1 },
  { id: 'rear-west-gallery', zone: 'rear-terrace', label: '高台西廊', type: 'gallery', x: -12.5, z: 57, width: 5, depth: 10, level: 7.05, floors: 1, eaves: 1 },
  { id: 'rear-east-gallery', zone: 'rear-terrace', label: '高台东廊', type: 'gallery', x: 12.5, z: 57, width: 5, depth: 10, level: 7.05, floors: 1, eaves: 1 },

  { id: 'west-front-hall-a', zone: 'west-campus', label: '参考图左侧前部堂楼一', type: 'hall', x: 56, z: 3, width: 12, depth: 7, level: 0.3, floors: 2, eaves: 1 },
  { id: 'west-front-hall-b', zone: 'west-campus', label: '参考图左侧前部堂楼二', type: 'hall', x: 56, z: 16, width: 13, depth: 7, level: 0.75, floors: 1, eaves: 1 },
  { id: 'west-row-house-a', zone: 'west-campus', label: '参考图左侧后排房一', type: 'residence', x: 58, z: 30, width: 13, depth: 5.6, level: 1.7, floors: 2, eaves: 1 },
  { id: 'west-row-house-b', zone: 'west-campus', label: '参考图左侧后排房二', type: 'residence', x: 43, z: 30, width: 12, depth: 5.6, level: 1.7, floors: 2, eaves: 1 },
  { id: 'west-row-house-c', zone: 'west-campus', label: '参考图左侧后排房三', type: 'residence', x: 28, z: 30, width: 9, depth: 5.2, level: 1.9, floors: 1, eaves: 1 },
  { id: 'west-court-north', zone: 'west-u-court', label: '参考图左侧围院后房', type: 'residence', x: 35, z: 18, width: 15, depth: 5.5, level: 0.9, floors: 1, eaves: 1 },
  { id: 'west-court-west', zone: 'west-u-court', label: '参考图左侧围院外厢', type: 'wing', x: 44.5, z: 12, width: 5.5, depth: 12, level: 0.55, floors: 1, eaves: 1 },
  { id: 'west-court-east', zone: 'west-u-court', label: '参考图左侧围院内厢', type: 'wing', x: 25.5, z: 12, width: 5.5, depth: 12, level: 0.55, floors: 1, eaves: 1 },
  { id: 'west-rear-house', zone: 'west-campus', label: '参考图左侧后山房', type: 'residence', x: 35, z: 49, width: 12, depth: 6, level: 4.5, floors: 1, eaves: 1 },

  { id: 'east-front-hall', zone: 'east-front-court', label: '参考图右侧前庭正房', type: 'hall', x: -37, z: 8, width: 14, depth: 7, level: 0.45, floors: 1, eaves: 1 },
  { id: 'east-front-west-wing', zone: 'east-front-court', label: '参考图右侧前庭内厢', type: 'wing', x: -27.5, z: 14, width: 5, depth: 13, level: 0.7, floors: 1, eaves: 1 },
  { id: 'east-front-east-wing', zone: 'east-front-court', label: '参考图右侧前庭外厢', type: 'wing', x: -47, z: 14, width: 5, depth: 13, level: 0.7, floors: 1, eaves: 1 },
  { id: 'east-middle-tower-a', zone: 'east-middle', label: '参考图右侧中部楼一', type: 'residence', x: -28, z: 29, width: 7.5, depth: 6, level: 1.75, floors: 2, eaves: 1 },
  { id: 'east-middle-tower-b', zone: 'east-middle', label: '参考图右侧中部楼二', type: 'residence', x: -40, z: 29, width: 7.5, depth: 6, level: 1.75, floors: 2, eaves: 1 },
  { id: 'east-court-north', zone: 'east-u-court', label: '参考图右侧围院后房', type: 'hall', x: -39, z: 46, width: 15, depth: 6, level: 3.8, floors: 1, eaves: 1 },
  { id: 'east-court-west', zone: 'east-u-court', label: '参考图右侧围院内厢', type: 'wing', x: -29.5, z: 40, width: 5.5, depth: 12, level: 3.2, floors: 1, eaves: 1 },
  { id: 'east-court-east', zone: 'east-u-court', label: '参考图右侧围院外厢', type: 'wing', x: -48.5, z: 40, width: 5.5, depth: 12, level: 3.2, floors: 1, eaves: 1 },
  { id: 'east-rear-court-south', zone: 'east-rear-court', label: '参考图右后院前房', type: 'hall', x: -38, z: 55, width: 14, depth: 5.5, level: 5, floors: 1, eaves: 1 },
  { id: 'east-rear-court-north', zone: 'east-rear-court', label: '参考图右后院后房', type: 'hall', x: -38, z: 69, width: 14, depth: 5.5, level: 6.6, floors: 1, eaves: 1 },
  { id: 'east-rear-court-west', zone: 'east-rear-court', label: '参考图右后院内厢', type: 'wing', x: -28.5, z: 62, width: 5, depth: 12, level: 5.8, floors: 1, eaves: 1 },
  { id: 'east-rear-court-east', zone: 'east-rear-court', label: '参考图右后院外厢', type: 'wing', x: -47.5, z: 62, width: 5, depth: 12, level: 5.8, floors: 1, eaves: 1 },
  { id: 'east-hillside-house-a', zone: 'east-hillside', label: '参考图右后山房一', type: 'residence', x: -28, z: 78, width: 10, depth: 5.5, level: 8.2, floors: 1, eaves: 1 },
  { id: 'east-hillside-house-b', zone: 'east-hillside', label: '参考图右后山房二', type: 'residence', x: -42, z: 80, width: 11, depth: 5.5, level: 8.6, floors: 1, eaves: 1 },
  { id: 'west-hillside-house', zone: 'west-hillside', label: '参考图左后山房', type: 'residence', x: 24, z: 76, width: 11, depth: 5.5, level: 8, floors: 1, eaves: 1 },
];

export const JINGCI_COURTYARDS = [
  { id: 'courtyard', zone: 'front-court', label: '入口石庭', x: 0, z: 10.5, width: 26, depth: 12, level: 0.22 },
  { id: 'main-court', zone: 'main-court', label: '中轴主院', x: 0, z: 16.5, width: 29, depth: 8, level: 1.27 },
  { id: 'middle-court', zone: 'middle-court', label: '中后院', x: 0, z: 35.5, width: 24, depth: 10, level: 3.25 },
  { id: 'rear-court', zone: 'rear-terrace', label: '高台前庭', x: 0, z: 54, width: 21, depth: 10, level: 6.5 },
  { id: 'west-court', zone: 'west-u-court', label: '参考图左侧围合院', x: 35, z: 11.5, width: 14, depth: 9, level: 0.5 },
  { id: 'east-front-court', zone: 'east-front-court', label: '参考图右侧前庭', x: -37, z: 14, width: 14, depth: 10, level: 0.6 },
  { id: 'east-court', zone: 'east-u-court', label: '参考图右侧围合院', x: -39, z: 39, width: 14, depth: 9, level: 3 },
  { id: 'east-rear-court', zone: 'east-rear-court', label: '参考图右后围合院', x: -38, z: 62, width: 14, depth: 9, level: 5.65 },
];

export const JINGCI_PATHS = [
  { id: 'central-walk', x: 0, z: 34, width: 4.2, depth: 68 },
  { id: 'front-crosswalk', x: 0, z: 8, width: 70, depth: 3.4 },
  { id: 'middle-crosswalk', x: 0, z: 36, width: 78, depth: 3.4 },
  { id: 'west-link', x: 30, z: 24, width: 3.2, depth: 38 },
  { id: 'east-link', x: -24, z: 34, width: 3.2, depth: 62 },
];

export const JINGCI_ZONES = Object.freeze({
  central: ['gate', 'daxiong', 'rear-hall', 'rear-pavilion'],
  westEnclosure: ['west-court-north', 'west-court-west', 'west-court-east'],
  eastEnclosure: ['east-court-north', 'east-court-west', 'east-court-east'],
  eastRearEnclosure: ['east-rear-court-north', 'east-rear-court-south', 'east-rear-court-west', 'east-rear-court-east'],
});
