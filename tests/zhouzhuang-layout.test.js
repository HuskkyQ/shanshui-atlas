import test from 'node:test';
import assert from 'node:assert/strict';
import layout from '../src/data/zhouzhuang-layout.json' with { type: 'json' };

test('expanded layout carries the old-town walking skeleton and fixed bounds', () => {
  assert.ok(layout.roads.length >= 100);
  assert.ok(layout.roads.filter((road) => road.kind === 'bridge').length >= 20);
  assert.deepEqual(layout.bounds, { minX: -460, maxX: 360, minZ: -650, maxZ: 690 });
  assert.ok(layout.roads.some((road) => road.osmWayId === '99211126'));
  assert.ok(layout.roads.some((road) => road.osmWayId === '608665209'));
});

test('core bridge route stays connected while public side streets may be separate', () => {
  const graph = new Map(layout.roads.map((road) => [road.id, new Set()]));
  const byNode = new Map();
  for (const road of layout.roads) for (const node of road.nodeIds) {
    if (!byNode.has(node)) byNode.set(node, []);
    byNode.get(node).push(road.id);
  }
  for (const ids of byNode.values()) for (const id of ids) for (const other of ids) if (id !== other) graph.get(id).add(other);
  const seen = new Set([layout.spawn.roadId]);
  const queue = [layout.spawn.roadId];
  while (queue.length) for (const id of graph.get(queue.shift()) ?? []) if (!seen.has(id)) { seen.add(id); queue.push(id); }
  for (const roadId of ['287819684', '807944468', '440352499', '608671657', '608673062']) assert.ok(seen.has(roadId), `${roadId} core route must remain connected`);
  assert.ok(layout.bridges.every((bridge) => layout.roads.some((road) => road.id === bridge.roadId)));
});

test('source-backed water, building footprints, and named landmarks are present', () => {
  assert.ok(layout.channels.length >= 10);
  assert.ok(layout.waterAreas.length >= 1);
  assert.ok(layout.waterAreas.some((area) => area.sourceRelationId === '62435' && area.holes.length === 2));
  assert.ok(layout.buildingAreas.length >= 11);
  for (const area of layout.waterAreas) assert.deepEqual(area.points[0], area.points.at(-1));
  assert.deepEqual(new Set(layout.landmarks.map((item) => item.sourceWayId)), new Set(['608673063', '608673064']));
});

test('only the established bridge profiles claim confirmed structure', () => {
  const confirmed = layout.bridges.filter((bridge) => bridge.typeConfidence === 'photo-confirmed').map((bridge) => bridge.roadId);
  assert.deepEqual(confirmed.sort(), ['287819684', '608391000']);
  assert.equal(layout.bridges.find((bridge) => bridge.roadId === '608673062')?.typeConfidence, 'photo-guided-candidate');
  for (const bridge of layout.bridges.filter((item) => !confirmed.includes(item.roadId) && !['608673062', '608390993'].includes(item.roadId))) assert.equal(bridge.typeConfidence, 'schematic-unverified');
  assert.equal(layout.bridges.find((bridge) => bridge.roadId === '608390993')?.type, 'arch');
  for (const id of ['608391000','608390993']) {
    const points=layout.roads.find(road=>road.id===id).points;
    assert.deepEqual(points.slice(2,5).map(p=>p.y),[points[3].y,points[3].y,points[3].y],'documented flat bridge platforms must not become a rounded arch deck');
  }
});

test('source nodes remain exact anchors and water areas expose the consumer field', () => {
  for (const road of layout.roads) {
    assert.equal(road.nodeIds.length, road.nodePoints.length);
    road.nodePoints.forEach((point, index) => assert.equal(point.nodeId, road.nodeIds[index]));
    for (let index = 1; index < road.points.length; index += 1) {
      assert.ok(Math.hypot(road.points[index].x - road.points[index - 1].x, road.points[index].z - road.points[index - 1].z) < 200);
    }
  }
  for (const area of layout.waterAreas) assert.ok(Array.isArray(area.points) && area.points.length >= 4);
});

test('water-centre crossings stay annotated instead of becoming false land paths', () => {
  const expected = new Set(['608388743', '608673066', '807944492']);
  const crossings = new Set(layout.roads.flatMap((road) => (road.waterCrossings ?? []).map(() => road.id)));
  for (const roadId of expected) assert.ok(crossings.has(roadId));
  assert.ok(layout.landPaths.every((path) => !expected.has(path.roadId)));
  for (const roadId of ['287819694', '608390994', '608391002', '608665209', '608669703', '608673061']) assert.ok(layout.landPaths.some((path) => path.roadId === roadId));
  for (const road of layout.roads.filter((item) => expected.has(item.id))) assert.ok(road.waterCrossings.every((crossing) => crossing.bridgeMapped === false));
});
