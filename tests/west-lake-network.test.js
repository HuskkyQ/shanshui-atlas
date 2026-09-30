import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const hikes = JSON.parse(fs.readFileSync(new URL('../src/data/west-lake-hikes.json', import.meta.url), 'utf8'));
const bounds = JSON.parse(fs.readFileSync(new URL('../src/data/west-lake-dem.json', import.meta.url), 'utf8'));
const { network } = hikes;
const edgeKey = (a, b) => [a, b].sort((first, second) => first - second).join('/');
const adjacency = new Map();
const edges = new Map();

for (const segment of network.segments) {
  segment.pointNodeIds.slice(1).forEach((node, index) => {
    const previous = segment.pointNodeIds[index];
    for (const [a, b] of [[previous, node], [node, previous]]) {
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      adjacency.get(a).add(b);
    }
    edges.set(edgeKey(previous, node), segment.perEdgeWayIds[index]);
  });
}

test('hill network preserves every selected-route edge and continues beyond peak stops', () => {
  for (const route of hikes.routes) {
    route.pointNodeIds.slice(1).forEach((node, index) => {
      assert.ok(edges.has(edgeKey(route.pointNodeIds[index], node)), `${route.id}: missing edge ${index}`);
    });
    if (route.id !== 'wuyun') {
      const end = route.pointNodeIds.at(-1);
      const routeEdges = new Set(route.pointNodeIds.slice(1).map((node, index) => edgeKey(route.pointNodeIds[index], node)));
      assert.ok([...adjacency.get(end)].some(node => !routeEdges.has(edgeKey(end, node))), `${route.id}: truncated at summit`);
    }
  }
});

test('network includes real alternate approaches beyond the five selected lines', () => {
  const names = network.segments.flatMap(segment => segment.sourceWayNames);
  for (const name of ['十里琅珰（梅坞支线）', '云栖竹径', '九溪十八涧', '万林背山']) {
    assert.ok(names.includes(name), `missing branch: ${name}`);
  }
  assert.ok(names.some(name => name.startsWith('老和山游步道')));
  assert.ok(names.some(name => name.startsWith('凤凰山登山道')));
  assert.ok(network.nodes.filter(node => node.degree >= 3).length > 10);
  for (const cityRoad of ['东坡路', '仁和路', '平海路', '湖滨路', '邮电路', '断桥']) {
    assert.ok(!names.includes(cityRoad), `city/lakeside way leaked into hill network: ${cityRoad}`);
  }
  const selectedEdges = new Set(hikes.routes.flatMap(route => route.pointNodeIds.slice(1).map((node, index) =>
    `${edgeKey(route.pointNodeIds[index], node)}/${route.perEdgeWayIds[index]}`)));
  for (const segment of network.segments.filter(segment => segment.sourceWayNames.includes('白堤'))) {
    segment.perEdgeWayIds.forEach((wayId, index) => {
      assert.ok(selectedEdges.has(`${edgeKey(segment.pointNodeIds[index], segment.pointNodeIds[index + 1])}/${wayId}`),
        'White Causeway approach expanded past selected-route edges');
    });
  }
});

test('ordinary road connectors use only the exact edges of the selected trails', () => {
  const roadWayIds = new Set(hikes.routes.flatMap(route => route.mixedRoadWayIds));
  const routeEdges = new Set(hikes.routes.flatMap(route => route.pointNodeIds.slice(1).map((node, index) =>
    `${edgeKey(route.pointNodeIds[index], node)}/${route.perEdgeWayIds[index]}`)));
  for (const segment of network.segments) {
    segment.perEdgeWayIds.forEach((wayId, index) => {
      if (roadWayIds.has(wayId)) {
        assert.ok(routeEdges.has(`${edgeKey(segment.pointNodeIds[index], segment.pointNodeIds[index + 1])}/${wayId}`),
          `road way ${wayId} expanded past selected edges`);
      }
    });
  }
});

test('compressed network retains exact shared-node topology without duplicated edges', () => {
  const totalEdges = network.segments.reduce((total, segment) => total + segment.pointNodeIds.length - 1, 0);
  assert.equal(edges.size, totalEdges, 'a shared trail edge was drawn twice');
  assert.equal(new Set(network.segments.map(segment => segment.id)).size, network.segments.length);
  const endpoints = new Map(network.nodes.map(node => [node.nodeId, node]));
  for (const segment of network.segments) {
    assert.equal(segment.fromNodeId, segment.pointNodeIds[0]);
    assert.equal(segment.toNodeId, segment.pointNodeIds.at(-1));
    for (const nodeId of [segment.fromNodeId, segment.toNodeId]) {
      const node = endpoints.get(nodeId);
      assert.ok(node, `missing endpoint ${nodeId}`);
      assert.equal(node.degree, adjacency.get(nodeId).size);
      assert.equal(node.componentId, segment.componentId);
    }
  }
});

test('all network geometries remain inside the terrain and retain edge provenance', () => {
  const coordinates = new Map();
  for (const segment of network.segments) {
    assert.equal(segment.points.length, segment.pointNodeIds.length);
    assert.equal(segment.perEdgeWayIds.length, segment.points.length - 1);
    segment.points.forEach((point, index) => {
      const [longitude, latitude] = point;
      assert.ok(Number.isFinite(longitude) && Number.isFinite(latitude));
      assert.ok(longitude >= bounds.west && longitude <= bounds.east);
      assert.ok(latitude >= bounds.south && latitude <= bounds.north);
      const nodeId = segment.pointNodeIds[index];
      if (coordinates.has(nodeId)) assert.deepEqual(point, coordinates.get(nodeId));
      coordinates.set(nodeId, point);
    });
    for (const wayId of segment.perEdgeWayIds) assert.ok(segment.sourceWayIds.includes(wayId));
  }
  for (const node of network.nodes) assert.deepEqual(node.coordinate, coordinates.get(node.nodeId));
});

test('termini distinguish mapped road interfaces, bounds and unresolved map ends', () => {
  const kinds = new Set(['junction', 'road-access', 'mapped-end', 'extent-edge', 'missing-data', 'waypoint']);
  for (const node of network.nodes) {
    assert.ok(kinds.has(node.kind), `${node.nodeId}: ${node.kind}`);
    if (node.degree === 1) assert.notEqual(node.kind, 'junction');
  }
  assert.ok(network.nodes.some(node => node.kind === 'road-access'));
});
