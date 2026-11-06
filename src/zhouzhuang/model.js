import * as THREE from 'three';
import { layout } from './layout.js';
import { createWaterQuery, pointInPolygon } from './surfaces.js';
import housing from '../data/zhouzhuang-housing.json' with { type: 'json' };
import { createLand } from './land.js';
import { createProgressiveLand } from './progressive-land.js';
import { createHousingLOD } from './housing-lod.js';

const UP = new THREE.Vector3(0, 1, 0);
const WATER_Y = 0.04;
const UNIT_BOX = [1, 1, 1];
const waterAreas = (layout.waterAreas || []).map((area) => ({ ...area, points: area.points || area.outer || [] }))
  .filter((area) => area.points.length >= 3);
const waterQuery = createWaterQuery({ channels: layout.channels, waterAreas, landPaths: layout.landPaths || [] });

function material(color, roughness = 0.9, options = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness, ...options });
}

function createMaterials() {
  return {
    water: material('#477f82', 0.32, { metalness: 0.08, side: THREE.DoubleSide }),
    road: material('#8e897b', 0.98, { side: THREE.DoubleSide }),
    roadEdge: material('#6f6d65', 1, { side: THREE.DoubleSide }),
    roadSeam: material('#77756c', 1, { side: THREE.DoubleSide }),
    step: material('#858278', 1),
    stone: material('#969284', 1),
    stoneDark: material('#706f68', 1),
    wall: material('#ddd9ca', 0.96),
    wallShade: material('#c5c1b3', 0.98),
    wood: material('#6b3928', 0.9),
    woodDark: material('#3d2924', 0.94),
    bridgeRed: material('#a84032', 0.9),
    roof: material('#353e3d', 0.94),
    roofEdge: material('#252e2e', 0.94),
    tiles: material('#53605b', 0.94),
    ground: material('#aeb39a', 1),
    coarseHouse: material('#ffffff', 0.96),
    trunk: material('#49372b', 1),
    leaves: material('#3f6647', 0.98),
  };
}

function mesh(name, geometry, surface, userData = {}) {
  const object = new THREE.Mesh(geometry, surface);
  object.name = name;
  object.userData = { ...userData };
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function scaledBox(name, size, position, surface, userData = {}, geometry = new THREE.BoxGeometry(...UNIT_BOX)) {
  const object = mesh(name, geometry, surface, userData);
  object.position.set(...position);
  object.scale.set(...size);
  return object;
}

function instanced(name, geometry, surface, matrices, userData = {}) {
  if (!matrices.length) return null;
  const object = new THREE.InstancedMesh(geometry, surface, matrices.length);
  object.name = name;
  object.userData = { ...userData };
  object.castShadow = true;
  object.receiveShadow = true;
  matrices.forEach((matrix, index) => object.setMatrixAt(index, matrix));
  object.instanceMatrix.needsUpdate = true;
  return object;
}

function clipLandPolygon(points) {
  const polygon=[];
  for (let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    if (a.f>=0) polygon.push(a);
    if ((a.f>=0)!==(b.f>=0)) {
      const t=a.f/(a.f-b.f);
      polygon.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,f:0});
    }
  }
  return polygon;
}

function flatRibbonGeometry(points, width, yForPoint = (point) => point.y, { clipWater = false } = {}) {
  const positions = [];
  const indices = [];
  const samples = new Map();
  const sampledWater = (p) => {
    const key = `${p.x},${p.z}`;
    if (!samples.has(key)) samples.set(key, waterDistance(p.x, p.z));
    return samples.get(key);
  };
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const pieces = clipWater ? Math.max(1, Math.ceil(length)) : 1;
    for (let piece = 0; piece < pieces; piece += 1) {
      const ta = piece / pieces, tb = (piece + 1) / pieces;
      const pa = { x: a.x + (b.x - a.x) * ta, z: a.z + (b.z - a.z) * ta, y: a.y + (b.y - a.y) * ta };
      const pb = { x: a.x + (b.x - a.x) * tb, z: a.z + (b.z - a.z) * tb, y: a.y + (b.y - a.y) * tb };
      const dx = pb.x - pa.x, dz = pb.z - pa.z, localLength = Math.hypot(dx, dz) || 1;
      const nx = -dz / localLength * width / 2, nz = dx / localLength * width / 2;
      const strip=[pa,pb].flatMap(p=>[1,0,-1].map(side=>({x:p.x+nx*side,y:yForPoint(p),z:p.z+nz*side})));
      for (const triangle of [[0,1,4],[0,4,3],[1,2,5],[1,5,4]]) {
        const vertices=triangle.map(i=>({...strip[i],f:clipWater?sampledWater(strip[i]):1}));
        const polygon=clipLandPolygon(vertices);
        for (let i=1;i+1<polygon.length;i++) for (const p of [polygon[0],polygon[i],polygon[i+1]]) {
          indices.push(positions.length/3);
          positions.push(p.x,p.y,p.z);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function segmentPose(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return {
    length: Math.hypot(dx, dz),
    x: (a.x + b.x) / 2,
    z: (a.z + b.z) / 2,
    yaw: -Math.atan2(dz, dx),
  };
}

function pointSegmentDistance(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const denominator = dx * dx + dz * dz;
  const t = denominator ? THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / denominator, 0, 1) : 0;
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

function distanceToPolylines(x, z, lines) {
  let result = Infinity;
  for (const line of lines) {
    for (let index = 1; index < line.points.length; index += 1) {
      result = Math.min(result, pointSegmentDistance(x, z, line.points[index - 1], line.points[index]));
    }
  }
  return result;
}

function makeRoads(materials) {
  const roads = new THREE.Group();
  roads.name = 'walkable-road-surfaces';
  const jointMatrices = [], seamMatrices = [];
  for (const road of layout.roads) {
    const surface = mesh(
      `road-surface-${road.id}`,
        flatRibbonGeometry(road.points, road.width, (point) => point.y, { clipWater: road.kind !== 'bridge' }),
      materials.road,
      { kind: 'walkable-surface', roadId: String(road.id), source: 'layout-road-points' },
    );
    surface.castShadow = false;
    roads.add(surface);
    if (road.kind !== 'bridge') {
      const edge = mesh(
        `road-edge-${road.id}`,
        flatRibbonGeometry(road.points, road.width + 0.18, (point) => point.y - 0.018, { clipWater: true }),
        materials.roadEdge,
        { kind: 'walkable-road-edge', roadId: String(road.id) },
      );
      edge.castShadow = false;
      roads.add(edge);
    }
    if (road.kind !== 'bridge') for (const point of road.points) {
      if (waterQuery.signedDistance(point.x, point.z) <= road.width/2) continue;
      const matrix = new THREE.Matrix4().compose(new THREE.Vector3(point.x, point.y - 0.002, point.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)),
        new THREE.Vector3(road.width / 2, road.width / 2, 1));
      jointMatrices.push(matrix);
    }
    for (let index = 1; index < road.points.length; index += 1) {
      const a = road.points[index - 1], b = road.points[index];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      for (let distance = 0.8; distance < length - 0.2; distance += 0.8) {
        const t = distance / length, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const y = a.y + (b.y - a.y) * t;
        const nx = -(b.z - a.z) / length * road.width / 2, nz = (b.x - a.x) / length * road.width / 2;
        if (road.kind!=='bridge' && Math.min(waterDistance(x-nx,z-nz),waterDistance(x+nx,z+nz))<0.05) continue;
        seamMatrices.push(matrixBetween(new THREE.Vector3(x - nx, y + 0.012, z - nz),
          new THREE.Vector3(x + nx, y + 0.012, z + nz), 0.012, 0.025));
        const offset=(Math.round(distance/0.8)%2?1:-1)*road.width/8;
        const ux=(b.x-a.x)/length,uz=(b.z-a.z)/length;
        const slope=(b.y-a.y)/length;
        const start=new THREE.Vector3(x-uz*offset,y+0.012,z+ux*offset);
        const end=start.clone().add(new THREE.Vector3(-ux*0.8,-slope*0.8,-uz*0.8));
        if (road.kind==='bridge' || waterDistance(end.x,end.z)>0.05) seamMatrices.push(matrixBetween(start,end,0.012,0.025));
      }
    }
  }
  const joints = instanced('road-joints', new THREE.CircleGeometry(1, 12), materials.road, jointMatrices, { kind: 'road-joints' });
  if (joints) { joints.castShadow = false; roads.add(joints); }
  const seams = instanced('road-stone-seams', new THREE.BoxGeometry(1, 1, 1), materials.roadSeam, seamMatrices, { kind: 'road-stone-seams' });
  if (seams) { seams.castShadow = false; roads.add(seams); }
  return roads;
}

function makeWaterways(materials) {
  const waterways = new THREE.Group();
  waterways.name = 'waterways';
  const { minX,maxX,minZ,maxZ } = layout.bounds;
  const surface = mesh('canal-water',new THREE.PlaneGeometry(maxX-minX,maxZ-minZ),materials.water,{kind:'water-surface'});
  surface.rotation.x = -Math.PI / 2;
  surface.position.set((minX+maxX)/2,WATER_Y,(minZ+maxZ)/2);
  surface.castShadow = false;
  waterways.add(surface);
  return waterways;
}

function waterDistance(x, z) {
  return waterQuery.signedDistance(x, z);
}

function boxMatrix(size, position, rotationZ = 0) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rotationZ)),
    new THREE.Vector3(...size),
  );
}

function matrixBetween(from, to, thickness, depth) {
  const direction = to.clone().sub(from);
  return new THREE.Matrix4().compose(
    from.clone().add(to).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.clone().normalize()),
    new THREE.Vector3(direction.length(), thickness, depth),
  );
}

function addBridgeRail(matrices, localPoints, bridge) {
  // Keep both bridgeheads open so connected streets and the perpendicular bridge
  // do not meet an invisible-through-navigation railing at the shared OSM node.
  const margin = bridge.width * 0.7;
  const distances=[0];
  for (let i=1;i<localPoints.length;i++) distances.push(distances.at(-1)+localPoints[i].distanceTo(localPoints[i-1]));
  const trim=Math.min(margin,distances.at(-1)*0.2),end=distances.at(-1)-trim;
  const sampleAt = distance => {
    const i=distances.findIndex(d=>d>=distance);
    return localPoints[i-1].clone().lerp(localPoints[i],(distance-distances[i-1])/(distances[i]-distances[i-1]));
  };
  localPoints=[sampleAt(trim),...localPoints.filter((_,i)=>distances[i]>trim && distances[i]<end),sampleAt(end)];
  const railOffset = bridge.width / 2 + 0.06;
  for (const side of [-1, 1]) {
    const offsetPoints = localPoints.map((point, index) => {
      const before = localPoints[Math.max(0, index - 1)], after = localPoints[Math.min(localPoints.length - 1, index + 1)];
      const tangent = after.clone().sub(before).setY(0).normalize();
      return point.clone().add(new THREE.Vector3(-tangent.z * side * railOffset, 0, tangent.x * side * railOffset));
    });
    for (const point of offsetPoints) {
      matrices.push(boxMatrix([0.13, 0.82, 0.13], [point.x, point.y + 0.41, point.z]));
    }
    for (const height of [0.25, 0.68]) {
      for (let index = 1; index < offsetPoints.length; index += 1) {
        const from = offsetPoints[index - 1].clone().add(new THREE.Vector3(0, height, 0));
        const to = offsetPoints[index].clone().add(new THREE.Vector3(0, height, 0));
        matrices.push(matrixBetween(from, to, 0.11, 0.13));
      }
    }
  }
}

function makeBridge(bridge, road, materials, boxGeometry) {
  const first = road.points[0];
  const last = road.points.at(-1);
  const pose = segmentPose(first, last);
  const deckY = Math.max(...road.points.map((point) => point.y));
  const endDeckY = (first.y + last.y) / 2;
  const fuAn = String(bridge.id) === '608390993' || String(road.id) === '608390993';
  const openingSpan = Math.min(fuAn ? 6.6 : bridge.openingSpan, Math.max(2, pose.length - 1.2));
  const group = new THREE.Group();
  group.name = `bridge-${road.id}`;
  group.position.set(pose.x, 0, pose.z);
  group.rotation.y = pose.yaw;
  group.userData = {
    kind: 'mapped-bridge',
    bridgeId: String(road.id),
    layoutBridgeId: String(bridge.id),
    bridgeType: bridge.type,
    source: bridge.typeConfidence==='schematic-unverified' ? 'OSM-way-position-with-schematic-form' : 'OSM-way-position-with-source-guided-form',
    walkClearance: Math.max(0, bridge.width - 0.3),
  };

  const localPoints = road.points.map((point) => new THREE.Vector3(point.x - pose.x, point.y, point.z - pose.z)
    .applyAxisAngle(UP, -pose.yaw));
  const stoneMatrices = [];
  const deckMatrices = [];
  const stepMatrices = [];
  for (let index = 1; index < localPoints.length; index += 1) {
    const from = localPoints[index - 1].clone().add(new THREE.Vector3(0, -0.22, 0));
    const to = localPoints[index].clone().add(new THREE.Vector3(0, -0.22, 0));
    deckMatrices.push(matrixBetween(from, to, 0.28, bridge.width + 0.38));
  }

  const classicBridge = bridge.type === 'arch' || bridge.profile === 'classic';
  const sideLength = Math.max(0.35, (pose.length - openingSpan) / 2);
  if (classicBridge) for (const side of [-1, 1]) {
    stoneMatrices.push(boxMatrix(
      [sideLength, endDeckY - WATER_Y - 0.2, bridge.width + 0.5],
      [side * (openingSpan / 2 + sideLength / 2), (endDeckY + WATER_Y - 0.2) / 2, 0],
    ));
  }

  if (bridge.type === 'arch' && classicBridge) {
    const shape = new THREE.Shape();
    const half = pose.length / 2;
    const opening = openingSpan / 2;
    shape.moveTo(-half,-0.25);
    shape.lineTo(-opening,-0.25);
    shape.lineTo(-opening,0.15);
    shape.absellipse(0,0.15,opening,Math.min(opening*0.91,deckY-0.75),Math.PI,0,true,0);
    shape.lineTo(opening,-0.25);
    shape.lineTo(half,-0.25);
    for (const point of [...localPoints].reverse()) shape.lineTo(point.x,point.y-0.22);
    shape.closePath();
    const fill = mesh(`bridge-${bridge.id}-stone-body`,new THREE.ExtrudeGeometry(shape,{
      depth:bridge.width+0.38,bevelEnabled:false,curveSegments:20,
    }),materials.stone,{kind:'arch-stone-body'});
    fill.position.z = -(bridge.width+0.38)/2;
    group.add(fill);
    const radius = Math.min(openingSpan / 2, Math.max(0.8, deckY - 0.62));
    const blockCount = 11;
    for (let index = 0; index < blockCount; index += 1) {
      const angle = Math.PI * (index + 0.5) / blockCount;
      const x = Math.cos(angle) * radius;
      const y = WATER_Y + 0.14 + Math.sin(angle) * radius;
      stoneMatrices.push(boxMatrix(
        [Math.max(0.32, Math.PI * radius / blockCount * 0.9), 0.36, bridge.width + 0.5],
        [x, y, 0], angle - Math.PI / 2,
      ));
    }
  } else {
    // Beam bridges keep the mapped deck path and rails only. A straight
    // centre abutment would cut across the source curved channel alignment.
  }

  for (let index = 0; index < road.points.length; index += 1) {
    const point = road.points[index];
    const local = localPoints[index];
    stepMatrices.push(boxMatrix([0.16, 0.035, bridge.width - 0.34], [local.x, point.y + 0.018, local.z]));
  }
  addBridgeRail(stoneMatrices, localPoints, bridge);
  group.add(
    instanced(`bridge-${road.id}-stone-structure`, boxGeometry, materials.stone, stoneMatrices, { kind: 'bridge-structure' }),
    instanced(`bridge-${road.id}-deck-edge`, boxGeometry, materials.stoneDark, deckMatrices, { kind: 'bridge-deck' }),
    instanced(`bridge-${road.id}-step-edges`, boxGeometry, materials.step, stepMatrices,
      { kind: 'visible-step-edges', blocksUnderpass: false }),
  );
  if (fuAn) {
    // The source way locates the central arch; four simplified corner houses
    // express the official bridge-house form without claiming measured plans.
    const houses=new THREE.Group();
    houses.name='fuan-corner-houses';
    const batches={plots:[],bases:[],walls:[],shadeWalls:[],gables:[],roofs:[],tileLines:[],ridges:[],doors:[],windows:[],mullions:[]};
    for (const [end,point] of [[-1,localPoints[0]],[1,localPoints.at(-1)]]) for (const side of [-1,1]) {
      const spec={x:point.x+end*0.7,z:point.z+side*(bridge.width/2+1.6),yaw:side<0?Math.PI:0,width:3.2,depth:2.6,storeys:1};
      collectHouse(houses,batches,spec,houses.children.length);
      const house=houses.children.at(-1);
      house.name=`fuan-bridge-house-${end}-${side}`;
      house.userData={...house.userData,kind:'bridge-house',bridgeId:road.id,source:'official-four-corner-houses',approximation:true};
    }
    addHouseBatches(houses,batches,materials,boxGeometry);
    group.add(houses);
  }
  return group;
}

function makeBridges(materials, boxGeometry) {
  const bridges = new THREE.Group();
  bridges.name = 'mapped-bridges';
  for (const bridge of layout.bridges) {
    const road = layout.roads.find((entry) => String(entry.id) === String(bridge.roadId));
    if (!road) throw new Error(`Missing road ${bridge.roadId} for bridge ${bridge.id}`);
    bridges.add(makeBridge(bridge, road, materials, boxGeometry));
  }
  return bridges;
}

function footprintPoint(house, x, z) {
  const c = Math.cos(house.yaw), s = Math.sin(house.yaw);
  return { x: house.x + x * c + z * s, z: house.z - x * s + z * c };
}

function fitsLand(house, { ignoreSourceAreas = false } = {}) {
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  for (const x of [-1, 0, 1]) for (const z of [-1, 0, 1]) {
    const p = footprintPoint(house, x * (house.width / 2 + 0.4), z * (house.depth / 2 + 0.4));
    if (p.x < minX || p.x > maxX || p.z < minZ || p.z > maxZ || waterDistance(p.x,p.z) < 0.3) return false;
  }
  const sourceAreas = [...(layout.buildingAreas || []), ...(layout.landmarks || [])];
  const footprintCorners = [-1, 1].flatMap((x) => [-1, 1].map((z) =>
    footprintPoint(house, x * (house.width / 2 + 0.18), z * (house.depth / 2 + 0.18))));
  if (!ignoreSourceAreas && sourceAreas.some((area) => {
    const points = area.points || [];
    return pointInPolygon(house.x, house.z, points)
      || footprintCorners.some((point) => pointInPolygon(point.x, point.z, points));
  })) return false;
  // Test each source road against the expanded, oriented building footprint.
  for (const road of layout.roads) for (let i = 1; i < road.points.length; i += 1) {
    const local = (p) => ({ x:(p.x-house.x)*Math.cos(house.yaw)-(p.z-house.z)*Math.sin(house.yaw),
      z:(p.x-house.x)*Math.sin(house.yaw)+(p.z-house.z)*Math.cos(house.yaw) });
    const a = local(road.points[i-1]), b = local(road.points[i]);
    let low = 0, high = 1;
    for (const [axis, half] of [['x',house.width/2+road.width/2+0.4], ['z',house.depth/2+road.width/2+0.4]]) {
      const delta = b[axis]-a[axis];
      if (Math.abs(delta) < 1e-9) { if (Math.abs(a[axis]) > half) { low=1; high=0; } }
      else {
        const t1=(-half-a[axis])/delta, t2=(half-a[axis])/delta;
        low=Math.max(low,Math.min(t1,t2)); high=Math.min(high,Math.max(t1,t2));
      }
    }
    if (low <= high) return false;
  }
  return true;
}

function nestedMatrix(spec, position, scale, rotationZ = 0, rotationX = 0) {
  const root = new THREE.Matrix4().compose(
    new THREE.Vector3(spec.x, 0, spec.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, spec.yaw, 0)),
    new THREE.Vector3(1, 1, 1),
  );
  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotationX, 0, rotationZ)),
    new THREE.Vector3(...scale),
  );
  return root.multiply(local);
}

function emptyHouseBatches() {
  return { plots: [], bases: [], walls: [], shadeWalls: [], gables: [], roofs: [], tileLines: [], ridges: [], doors: [], windows: [], mullions: [] };
}

function collectHouseShell(batches, spec, index) {
  const baseY = 2.12;
  const wallHeight = spec.storeys === 2 ? 5.4 : 3.25;
  batches.plots.push(nestedMatrix(spec, [0, 2.025, 0], [spec.width + 0.6, 0.045, spec.depth + 0.6]));
  batches.bases.push(nestedMatrix(spec, [0, baseY - 0.21, 0], [spec.width, 0.42, spec.depth]));
  batches[index % 4 === 0 ? 'shadeWalls' : 'walls'].push(nestedMatrix(
    spec, [0, baseY + wallHeight / 2, 0], [spec.width - 0.25, wallHeight, spec.depth - 0.25],
  ));
  const roofRise = 1.25;
  batches.gables.push(nestedMatrix(spec,[0,baseY+wallHeight,0],[spec.width-0.25,roofRise,spec.depth-0.25]));
  const halfRoof = Math.hypot(spec.depth / 2 + 0.3, roofRise);
  const roofAngle = Math.atan2(roofRise, spec.depth / 2 + 0.3);
  for (const side of [-1, 1]) batches.roofs.push(nestedMatrix(spec,
    [0, baseY + wallHeight + roofRise / 2, side * (spec.depth / 2 + 0.3) / 2],
    [spec.width + 0.8, 0.22, halfRoof], 0, side * roofAngle));
  batches.ridges.push(nestedMatrix(spec, [0, baseY + wallHeight + roofRise + 0.02, 0],
    [spec.width + 0.9, 0.28, 0.24]));
}

function collectHouseDetails(batches, spec) {
  const baseY = 2.12, wallHeight = spec.storeys === 2 ? 5.4 : 3.25, roofRise = 1.25;
  const halfRoof = Math.hypot(spec.depth / 2 + 0.3, roofRise);
  const roofAngle = Math.atan2(roofRise, spec.depth / 2 + 0.3);
  for (const side of [-1, 1]) for (let x = -spec.width / 2; x <= spec.width / 2; x += 0.55) {
    batches.tileLines.push(nestedMatrix(spec,
      [x,baseY+wallHeight+roofRise/2+0.13,side*(spec.depth/2+0.3)/2],
      [0.055,0.035,halfRoof],0,side*roofAngle));
  }
  const frontZ = spec.depth / 2 + 0.015;
  batches.doors.push(nestedMatrix(spec, [0, baseY + 1.08, frontZ], [1.15, 2.15, 0.12]));
  for (const side of [-1, 1]) {
    batches.windows.push(nestedMatrix(spec, [side * spec.width * 0.27, baseY + 1.65, frontZ + 0.015], [1.3, 1.25, 0.1]));
    for (const mullion of [-0.33, 0, 0.33]) batches.mullions.push(nestedMatrix(spec,
      [side * spec.width * 0.27 + mullion, baseY + 1.65, frontZ + 0.08], [0.055, 1.2, 0.08]));
    if (spec.storeys === 2) batches.windows.push(nestedMatrix(spec,
      [side * spec.width * 0.24, baseY + 4.25, frontZ + 0.015], [1.35, 1.2, 0.1]));
  }
}

function collectHouse(parent, batches, spec, index) {
  const house = new THREE.Group();
  house.name = `street-house-${index}`;
  house.userData = { footprint: { ...spec }, kind: 'street-house', style: 'jiangnan-white-wall-dark-tile', accuracy: 'artistic-approximation' };
  house.position.set(spec.x, 0, spec.z);
  house.rotation.y = spec.yaw;
  parent.add(house);
  collectHouseShell(batches, spec, index);
  collectHouseDetails(batches, spec);
}

function coarseHouseBatch(houses, boxGeometry, materials) {
  const matrices = [];
  for (const spec of houses) {
    const height = spec.storeys === 2 ? 5.4 : 3.25;
    matrices.push(nestedMatrix(spec, [0, 2.12 + height / 2, 0], [spec.width - 0.25, height, spec.depth - 0.25]));
    for (const side of [-1, 1]) matrices.push(nestedMatrix(spec,
      [0, 2.12 + height + 0.625, side * (spec.depth / 2 + 0.3) / 2],
      [spec.width + 0.8, 0.22, Math.hypot(spec.depth / 2 + 0.3, 1.25)], 0, side * Math.atan2(1.25, spec.depth / 2 + 0.3)));
  }
  const object = instanced('distant-house-masses', boxGeometry, materials.coarseHouse, matrices, { kind: 'distant-house-masses' });
  for (let index = 0; index < matrices.length; index++) object.setColorAt(index, index % 3 === 0 ? materials.wall.color : materials.roof.color);
  object.instanceColor.needsUpdate = true;
  object.castShadow = false;
  return object;
}

function addHouseBatches(blocks,batches,materials,boxGeometry) {
  const batchSpecs = [
    ['house-plots', 'plots', materials.road, 'house-paving'],
    ['house-stone-bases', 'bases', materials.stone, 'street-house-detail'],
    ['house-white-walls', 'walls', materials.wall, 'street-house-detail'],
    ['house-shaded-walls', 'shadeWalls', materials.wallShade, 'street-house-detail'],
    ['house-dark-roofs', 'roofs', materials.roof, 'street-house-detail'],
    ['house-tile-rows', 'tileLines', materials.tiles, 'street-house-detail'],
    ['house-roof-ridges', 'ridges', materials.roofEdge, 'street-house-detail'],
    ['house-wood-doors', 'doors', materials.woodDark, 'street-house-detail'],
    ['house-wood-windows', 'windows', materials.wood, 'street-house-detail'],
    ['house-window-mullions', 'mullions', materials.woodDark, 'street-house-detail'],
  ];
  for (const [name, key, surface, kind] of batchSpecs) {
    const object = instanced(name, boxGeometry, surface, batches[key], { kind });
    if (object) blocks.add(object);
  }
  const gable = new THREE.BufferGeometry();
  gable.setAttribute('position',new THREE.Float32BufferAttribute([
    -0.5,0,-0.5, -0.5,0,0.5, -0.5,1,0,
    0.5,0,-0.5, 0.5,0,0.5, 0.5,1,0,
  ],3));
  gable.setIndex([0,1,2, 3,5,4, 0,2,5,0,5,3, 1,4,5,1,5,2, 0,3,4,0,4,1]);
  gable.computeVertexNormals();
  const gables=instanced('house-gable-walls',gable,materials.wall,batches.gables,{kind:'street-house-detail'});
  if(gables) blocks.add(gables); else gable.dispose();
}

function makeDistrict(materials, boxGeometry) {
  const blocks = new THREE.Group();
  blocks.name = 'courtyard-blocks';
  const houses = housing.houses;
  houses.forEach((spec, index) => {
    const descriptor = new THREE.Group();
    descriptor.name = `street-house-${index}`;
    descriptor.position.set(spec.x, 0, spec.z);
    descriptor.rotation.y = spec.yaw;
    descriptor.userData = { footprint: spec, kind: 'street-house', accuracy: housing.accuracy };
    blocks.add(descriptor);
  });
  const lod = createHousingLOD({ houses, createBatch(specs, level) {
    if (level === 'coarse') return coarseHouseBatch(specs, boxGeometry, materials);
    const group = new THREE.Group();
    const batches = emptyHouseBatches();
    specs.forEach((spec, index) => {
      if (level === 'shell') collectHouseShell(batches, spec, index);
      else collectHouseDetails(batches, spec);
    });
    addHouseBatches(group, batches, materials, boxGeometry);
    return group;
  } });
  blocks.add(lod.group);
  const obstacles = houses.map((house) => ({
    type: 'box', x: house.x, z: house.z, yaw: house.yaw,
    width: Math.max(1, house.width - 0.25), depth: Math.max(1, house.depth - 0.25),
  }));
  return { blocks, houses, obstacles, lod };
}

function makeSourceBuildings(materials) {
  const group = new THREE.Group();
  group.name = 'mapped-source-buildings';
  const obstacles = [];
  const seen = new Set();
  const boxGeometry=new THREE.BoxGeometry(1,1,1);
  const batches={plots:[],bases:[],walls:[],shadeWalls:[],gables:[],roofs:[],tileLines:[],ridges:[],doors:[],windows:[],mullions:[]};
  for (const area of [...(layout.buildingAreas || []), ...(layout.landmarks || [])]) {
    if (!Array.isArray(area.points) || area.points.length < 3) continue;
    const sourceId = String(area.sourceWayId || area.id);
    if (seen.has(sourceId)) continue;
    seen.add(sourceId);
    if (!area.points.every((point) => point.x >= layout.bounds.minX && point.x <= layout.bounds.maxX
      && point.z >= layout.bounds.minZ && point.z <= layout.bounds.maxZ)) continue;
    const centre = area.points.reduce((acc, point) => ({ x: acc.x + point.x, z: acc.z + point.z }), { x: 0, z: 0 });
    centre.x /= area.points.length; centre.z /= area.points.length;
    const first = area.points[1], origin = area.points[0];
    const yaw = Math.atan2(first.z - origin.z, first.x - origin.x);
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const projected = area.points.map((point) => ({
      x: (point.x - centre.x) * c + (point.z - centre.z) * s,
      z: -(point.x - centre.x) * s + (point.z - centre.z) * c,
    }));
    const width = Math.max(...projected.map((point) => point.x)) - Math.min(...projected.map((point) => point.x));
    const depth = Math.max(...projected.map((point) => point.z)) - Math.min(...projected.map((point) => point.z));
    const landmark = (layout.landmarks || []).some((entry) => String(entry.sourceWayId) === sourceId);
    const halls = landmark
      ? [
        ...[-0.3,0,0.3].map(t=>({ x:0,z:depth*t,width:width*0.68,depth:Math.min(6.2,depth*0.18) })),
        { x: -width * 0.34, z: 0, width: Math.min(6.5, width * 0.18), depth: depth * 0.46 },
        { x: width * 0.34, z: 0, width: Math.min(6.5, width * 0.18), depth: depth * 0.46 },
      ]
      : [{ x: 0, z: 0, width: Math.min(width * 0.82, 18), depth: Math.min(depth * 0.72, 10) }];
    halls.forEach((hall, index) => {
      const x = centre.x + hall.x * c - hall.z * s, z = centre.z + hall.x * s + hall.z * c;
      const spec = { x, z, yaw:-yaw, width: Math.max(2.4, hall.width), depth: Math.max(2.2, hall.depth) };
      const corners=[-1,1].flatMap(dx=>[-1,1].map(dz=>footprintPoint(spec,dx*(spec.width/2+0.45),dz*(spec.depth/2+0.45))));
      if (!corners.every(p=>pointInPolygon(p.x,p.z,area.points)) || !fitsLand(spec,{ignoreSourceAreas:true})) return;
      const hallIndex=group.children.length;
      collectHouse(group,batches,{...spec,storeys:1},hallIndex);
      const building=group.children.at(-1);
      building.name=`source-building-${sourceId}-hall-${index}`;
      building.userData={...building.userData,kind:'source-building-hall',sourceWayId:sourceId,approximation:true};
      obstacles.push({type:'box',x:spec.x,z:spec.z,yaw:spec.yaw,width:spec.width-0.25,depth:spec.depth-0.25});
    });
  }
  addHouseBatches(group,batches,materials,boxGeometry);
  return { group, obstacles };
}

function makeTrees(materials, boxGeometry, houses) {
  const trees = new THREE.Group();
  trees.name = 'canal-side-trees';
  const crownGeometry = new THREE.DodecahedronGeometry(1, 0);
  const { minX, maxX, minZ, maxZ } = layout.bounds;
  const grid = [];
  for (let z=minZ+6; z<maxZ-6; z+=8) for (let x=minX+6; x<maxX-6; x+=9) grid.push({x,z});
  grid.sort((a,b) => Math.hypot(a.x,a.z)-Math.hypot(b.x,b.z));
  const candidates = [];
  for (const {x,z} of grid) {
    const roadDistance = distanceToPolylines(x,z,layout.roads);
    if (roadDistance < 4 || roadDistance > 14 || waterDistance(x,z) < 2) continue;
    if (houses.some(h => Math.hypot(x-h.x,z-h.z)<Math.hypot(h.width,h.depth)/2+2.5)) continue;
    if (distanceToPolylines(x,z,housing.lanes) < 2.2) continue;
    candidates.push({x,z});
    if (candidates.length === 32) break;
  }
  const obstacles = [];
  candidates.slice(0,32).forEach(({x,z},count) => {
    const height = 3.5 + count % 4 * 0.4;
    trees.add(scaledBox(`tree-${count}-trunk`, [0.35,height,0.35], [x,2+height/2,z],materials.trunk,{kind:'tree'},boxGeometry));
    const crown = mesh(`tree-${count}-crown`,crownGeometry,materials.leaves,{kind:'tree'});
    crown.position.set(x,2+height+1.2,z);
    crown.scale.set(2.5+count%3*0.3,2.2,2.6);
    trees.add(crown);
    obstacles.push({ type: 'circle', x, z, radius: 0.2 });
  });
  return { trees, obstacles };
}

function makeCourtyardLanes(materials) {
  const positions = [];
  for (const lane of housing.lanes) {
    // Generated lanes already validate their full width against water at 0.2m intervals.
    const geometry = flatRibbonGeometry(lane.points, lane.width, () => 2.035);
    positions.push(...geometry.attributes.position.array);
    geometry.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const lanes = mesh('courtyard-side-lanes', geometry, materials.road, { kind: 'artistic-side-lanes', approximation: true });
  lanes.castShadow = false;
  return lanes;
}

/**
 * Builds a close-range artistic reconstruction around Zhouzhuang's Double
 * Bridges. Mapped roads, waterways and bridge endpoints drive the geometry;
 * ordinary street-house masses are deterministic visual approximations.
 */
export function createZhouzhuangModel({ progressiveLand = false } = {}) {
  const materials = createMaterials();
  const boxGeometry = new THREE.BoxGeometry(...UNIT_BOX);
  const group = new THREE.Group();
  group.name = 'zhouzhuang-walkable-district';
  group.userData = {
    kind: 'source-guided-artistic-approximation',
    subject: 'Zhouzhuang Double Bridges walkable district',
    sourceBoundary: 'mapped-bridge-and-road-topology-with-photo-guided-ordinary-building-massing',
    coordinateSystem: '+x-east-+z-south-metres',
  };
  const { blocks, houses, obstacles, lod } = makeDistrict(materials, boxGeometry);
  const sourceBuildings = makeSourceBuildings(materials);
  const treeResult = makeTrees(materials, boxGeometry, houses);
  const landStage = progressiveLand ? createProgressiveLand(materials, waterQuery, layout.bounds) : null;
  group.add(
    makeWaterways(materials),
    landStage?.group || createLand(materials, waterQuery, layout.bounds),
    blocks,
    sourceBuildings.group,
    treeResult.trees,
    makeRoads(materials),
    makeCourtyardLanes(materials),
    makeBridges(materials, boxGeometry),
  );
  group.updateMatrixWorld(true);
  const bridgeHouseObstacles=[];
  group.traverse(object=>{
    if (object.userData.kind!=='bridge-house') return;
    const p=object.getWorldPosition(new THREE.Vector3()),footprint=object.userData.footprint;
    const yaw=new THREE.Euler().setFromRotationMatrix(object.matrixWorld,'YXZ').y;
    bridgeHouseObstacles.push({type:'box',x:p.x,z:p.z,yaw,width:footprint.width-0.25,depth:footprint.depth-0.25});
  });

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    landStage?.dispose();
    lod.dispose();
    const geometries = new Set();
    const ownedMaterials = new Set();
    group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const materialList = Array.isArray(object.material) ? object.material : [object.material];
      materialList.filter(Boolean).forEach((entry) => ownedMaterials.add(entry));
    });
    geometries.forEach((geometry) => geometry.dispose());
    ownedMaterials.forEach((entry) => entry.dispose());
  };
  return {
    group,
    update: (camera, options) => lod.update(camera, options),
    housingStats: lod.stats,
    ready: landStage?.ready || Promise.resolve(true),
    obstacles: [...obstacles, ...sourceBuildings.obstacles, ...treeResult.obstacles,...bridgeHouseObstacles],
    walkSurfaces: layout.roads.map((road) => ({
      id: String(road.id), points: road.points.map((point) => ({ ...point })), width: road.width,
    })),
    dispose,
  };
}
