import test from 'node:test';
import assert from 'node:assert/strict';

import { layout } from '../src/zhouzhuang/layout.js';
import { createNavigation } from '../src/zhouzhuang/navigation.js';

const EXPECTED_BRIDGE_ENDPOINTS = {
  '287819684': [[-16.354, 7.34], [0, 0]],
  '608391000': [[0, 0], [4.489, 10.225]],
  '608673062': [[-8.025, 34.975], [-4.689, 42.204]],
};

function endpoints(road) {
  const first = road.points[0];
  const last = road.points.at(-1);
  return [[first.x, first.z], [last.x, last.z]];
}

test('the neighboring bridge crosses the sourced western canal, separate from the double-bridge junction', () => {
  const west = layout.channels.find((channel) => channel.sourceWayId === '99211134');
  assert.ok(west, 'the western canal must be actual sourced geometry, not a bridge-only water patch');
  const bridge = layout.roads.find((road) => road.id === '608673062');
  const midpoint = bridge.points[Math.floor(bridge.points.length / 2)];
  let closest = Infinity;
  for (let i = 1; i < west.points.length; i += 1) {
    const a = west.points[i - 1], b = west.points[i];
    const dx = b.x-a.x, dz = b.z-a.z;
    const t = Math.max(0,Math.min(1,((midpoint.x-a.x)*dx+(midpoint.z-a.z)*dz)/(dx*dx+dz*dz)));
    closest = Math.min(closest,Math.hypot(midpoint.x-a.x-t*dx,midpoint.z-a.z-t*dz));
  }
  assert.ok(closest < west.width / 2);
  assert.ok(!west.points.some((point) => Math.hypot(point.x+8.206,point.z-8.136)<0.1),
    'do not turn the double-bridge T junction into a four-arm crossing');
});

function roadGraph(roads) {
  const byNode = new Map();
  for (const road of roads) {
    for (const nodeId of road.nodeIds) {
      if (!byNode.has(nodeId)) byNode.set(nodeId, []);
      byNode.get(nodeId).push(road.id);
    }
  }
  const graph = new Map(roads.map((road) => [road.id, new Set()]));
  for (const ids of byNode.values()) {
    for (const id of ids) for (const other of ids) if (other !== id) graph.get(id).add(other);
  }
  return graph;
}

test('keeps the three sourced bridge endpoints in the shared east/south metre frame', () => {
  assert.deepEqual(layout.origin, { lon: 120.8458221, lat: 31.1163909 });
  for (const [roadId, expected] of Object.entries(EXPECTED_BRIDGE_ENDPOINTS)) {
    const road = layout.roads.find((candidate) => candidate.id === roadId);
    assert.ok(road, `${roadId} must be retained`);
    assert.equal(road.kind, 'bridge');
    for (const [actualPoint, expectedPoint] of endpoints(road).map((point, index) => [point, expected[index]])) {
      assert.ok(Math.abs(actualPoint[0] - expectedPoint[0]) < 0.002, `${roadId} x drifted`);
      assert.ok(Math.abs(actualPoint[1] - expectedPoint[1]) < 0.002, `${roadId} z drifted`);
    }
  }
});

test('retains the real route from the double bridges to the neighboring bridge', () => {
  const graph = roadGraph(layout.roads);
  const expectedPath = ['287819684', '807944468', '440352499', '608671657', '608673062'];
  for (const [from, to] of expectedPath.slice(0, -1).map((id, index) => [id, expectedPath[index + 1]])) {
    assert.ok(graph.get(from)?.has(to), `${from} must join ${to} through a shared OSM node`);
  }
  assert.ok(!graph.get('440352499')?.has('608673062'), 'nearby roads must not gain a shortcut');

  const seen = new Set([layout.spawn.roadId]);
  const queue = [layout.spawn.roadId];
  while (queue.length) {
    for (const next of graph.get(queue.shift()) ?? []) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  for (const roadId of Object.keys(EXPECTED_BRIDGE_ENDPOINTS)) assert.ok(seen.has(roadId), `${roadId} must retain its sourced walking connection`);
});

test('bridge profiles remain above water and meet connected streets without height jumps', () => {
  const roadsById = new Map(layout.roads.map((road) => [road.id, road]));
  for (const bridge of layout.bridges) {
    const road = roadsById.get(bridge.roadId);
    assert.ok(road.points.length >= 5, `${road.id} needs a visible height profile`);
    assert.ok(road.points.every((point) => point.y > 0), `${road.id} must remain above water`);
    for (let index = 1; index < road.points.length; index += 1) {
      assert.ok(Math.abs(road.points[index].y - road.points[index - 1].y) < 0.8, `${road.id} profile has a step`);
    }
    assert.equal(road.points[0].y, 2.1);
    assert.equal(road.points.at(-1).y, 2.1);
  }

  const sharedNode = '2913894167';
  for (const road of layout.roads.filter((candidate) => candidate.nodeIds.includes(sharedNode))) {
    const index = road.nodeIds.indexOf(sharedNode);
    const point = index === 0 ? road.points[0] : road.points.at(-1);
    assert.equal(point.y, 2.1, `${road.id} must meet the double-bridge platform at street height`);
  }
});

test('locate returns the bridge deck height even where the deck crosses water', () => {
  const bridge = layout.roads.find((road) => road.id === '287819684');
  const middle = bridge.points[Math.floor(bridge.points.length / 2)];
  const navigation = createNavigation(layout.roads);
  const located = navigation.locate(middle.x, middle.z, bridge.id);
  assert.equal(located.roadId, bridge.id);
  assert.ok(located.y > 3.5, 'arch crown should rise about two metres above its ends');
});

test('a walker can follow the sourced topology across both double bridges and the neighboring bridge', () => {
  const navigation = createNavigation(layout.roads);
  let state = navigation.locate(layout.spawn.x, layout.spawn.z, layout.spawn.roadId);
  const waypoints = [
    [0, 0],
    [4.489, 10.225],
    [0, 0],
    [-16.354, 7.34],
    [-6.666, 28.139],
    [-9.283, 31.655],
    [-8.025, 34.975],
    [-4.689, 42.204],
  ];
  for (const [x, z] of waypoints) state = navigation.move(state, x - state.x, z - state.z);
  assert.equal(state.roadId, '608673062');
  assert.ok(Math.hypot(state.x + 4.689, state.z - 42.204) < 0.01);
});

test('large and diagonal moves stop or slide inside the current corridor', () => {
  const roads = [{
    id: 'bank', osmWayId: 'bank', kind: 'street', width: 2,
    nodeIds: ['a', 'b'],
    points: [{ x: 0, y: 2.1, z: -5 }, { x: 0, y: 2.1, z: 5 }],
  }];
  const navigation = createNavigation(roads);
  const start = navigation.locate(0, 0, 'bank');
  const diagonal = navigation.move(start, 3, 3, 0.25);
  assert.ok(diagonal.z > 1.5, 'movement should slide along the street edge');
  assert.ok(Math.abs(diagonal.x) <= 0.751, 'player radius must stay inside the edge');
  const beyond = navigation.move(start, 20, 0, 0.25);
  assert.ok(Math.abs(beyond.x) <= 0.751, 'a large step must not cross the boundary');
});

test('movement never snaps to a disconnected parallel road across water', () => {
  const roads = [
    { id: 'west-bank', osmWayId: 'west-bank', kind: 'street', width: 1.4, nodeIds: ['a', 'b'], points: [{ x: 0, y: 2.1, z: -8 }, { x: 0, y: 2.1, z: 8 }] },
    { id: 'east-bank', osmWayId: 'east-bank', kind: 'street', width: 1.4, nodeIds: ['c', 'd'], points: [{ x: 3, y: 2.1, z: -8 }, { x: 3, y: 2.1, z: 8 }] },
  ];
  const navigation = createNavigation(roads);
  const start = navigation.locate(0, 0, 'west-bank');
  const moved = navigation.move(start, 3, 0, 0.25);
  assert.equal(moved.roadId, 'west-bank');
  assert.ok(moved.x < 0.5, 'the player must remain on the original bank');
});
