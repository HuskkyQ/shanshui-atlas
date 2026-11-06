// Chengqi Lou uses metres as scene units. The outer diameter, four concentric
// rings, room counts and three entrance directions are documented by Yongding
// District. Inner radii, heights and component dimensions remain explicit
// artistic approximations for this close-range display model. Named neighbor
// centres follow OSM; their published dimensions take precedence over OSM
// outline bounds where those sources disagree.
export const CHENGQI_LAYOUT = {
  outerDiameter: 73,
  orientation: 'north=-z',
  entranceDirections: ['south', 'east', 'west'],
  entranceWidth: 4.8,
  rings: [
    {
      id: 'outer-ring', label: '承启楼外环', outerRadius: 36.5, innerRadius: 29.0,
      floors: 4, roomCount: 67, wallHeight: 16.4, roofRise: 2.2,
      roomCountMeaning: 'documented-openings-per-storey',
      heightAccuracy: 'artistic-approximation',
    },
    {
      id: 'second-ring', label: '承启楼第二环', outerRadius: 24.6, innerRadius: 18.3,
      floors: 2, roomCount: 34, wallHeight: 7.8, roofRise: 1.55,
      roomCountMeaning: 'documented-openings-per-storey-not-two-storey-total',
      passageCount: 7, wellCount: 2, heightAccuracy: 'artistic-approximation',
    },
    {
      id: 'third-ring', label: '承启楼第三环', outerRadius: 15.3, innerRadius: 10.4,
      floors: 1, roomCount: 20, wallHeight: 3.75, roofRise: 1.25,
      roomCountMeaning: 'documented-openings-on-the-single-storey',
      heightAccuracy: 'artistic-approximation',
    },
  ],
  ancestralHall: {
    x: 0, z: -2.1, width: 9.6, depth: 7.4, wallHeight: 4.5,
    documentedAreaSquareMetres: 33.83,
    footprintAccuracy: 'artistic-rectangle-with-front-court',
  },
  neighbors: [
    {
      id: 'qiaofu', label: '侨福楼', type: 'round', x: -62, z: -26,
      outerRadius: 22.5, innerRadius: 17.3, floors: 3, roomCount: 42,
      wallHeight: 10.8, roofRise: 1.65,
      documentedDimensions: { diameter: 45, floors: 3 },
      placementAccuracy: 'OSM-centre-approximation',
    },
    {
      id: 'shize', label: '世泽楼', type: 'rectangular', x: 56, z: -20,
      width: 40.8, depth: 41.2, floors: 4, wallHeight: 13.2,
      rotationY: 0.22,
      documentedDimensions: { width: 40.8, depth: 41.2, floors: 4 },
      placementAccuracy: 'OSM-centre-approximation',
    },
    {
      id: 'wuyun', label: '五云楼', type: 'rectangular', x: 93, z: -33,
      width: 25.8, depth: 24.3, floors: 4, wallHeight: 12.8,
      rotationY: 0.22,
      documentedDimensions: { width: 25.8, depth: 24.3, floors: 4 },
      placementAccuracy: 'OSM-centre-approximation-published-size',
    },
  ],
  site: { width: 232, depth: 154, bottomY: -1, bounds: [-116, 116, -77, 77] },
  bambooGroves: [
    { x: -10, z: -61, radiusX: 12, radiusZ: 8, count: 24, seed: 0.4 },
    { x: 20, z: -64, radiusX: 15, radiusZ: 8, count: 32, seed: 1.7 },
    { x: 54, z: -61, radiusX: 15, radiusZ: 10, count: 28, seed: 3.1 },
  ],
  trees: [
    [-110, -65, 5.4], [-104, -61, 6.0], [-99, -66, 4.8],
    [-108, -54, 5.2], [-102, -50, 6.1], [-106, -42, 5.0],
    [-92, 25, 5.7], [-88, 31, 4.9], [-93, 39, 5.8], [-86, 43, 5.3],
    [-82, 50, 6.2], [-88, 55, 5.1], [-96, 51, 5.5],
    [-47, 55, 4.7], [-43, 61, 5.8], [-37, 58, 5.2], [-33, 66, 4.9],
    [-27, 60, 5.6], [-45, 69, 4.8],
    [26, 61, 5.4], [31, 56, 5.1], [36, 64, 5.7], [42, 59, 4.8],
    [29, 70, 5.5], [45, 68, 5.2],
    [72, 42, 6.0], [77, 48, 4.9], [82, 45, 5.6], [74, 55, 5.1],
    [82, 58, 5.8], [73, 65, 4.8], [85, 67, 5.5],
  ],
};

export default CHENGQI_LAYOUT;
