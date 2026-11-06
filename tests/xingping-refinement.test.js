import test from 'node:test';
import assert from 'node:assert/strict';
import { createTerrainRefinement } from '../src/xingping/refinement.js';

function setup() {
  const worker = { terminated: 0, sent: null, postMessage(source) { this.sent = source; }, terminate() { this.terminated++; } };
  const source = { elevations: new Uint16Array([100, 200]) };
  return { worker, source };
}
const payload = () => ({ position: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), normal: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), color: new Float32Array(9).fill(.5), index: new Uint16Array([0, 2, 1]) });

test('detail worker success keeps the main-thread data and closes the worker once', () => {
  const { worker, source } = setup();
  let geometry;
  const refinement = createTerrainRefinement({ source, workerFactory: () => worker, onGeometry: value => { geometry = value; }, onFailure: error => { throw error; } });
  assert.equal(worker.sent, source);
  worker.onmessage({ data: payload() });
  assert.equal(geometry.getAttribute('position').count, 3);
  assert.equal(source.elevations.byteLength, 4);
  refinement.dispose();
  assert.equal(worker.terminated, 1);
  geometry.dispose();
});

test('malformed detail fails once, terminates and ignores late messages', () => {
  const { worker, source } = setup();
  let failed = 0, received = 0;
  const refinement = createTerrainRefinement({ source, workerFactory: () => worker, onGeometry: () => { received++; }, onFailure: () => { failed++; } });
  worker.onmessage({ data: {} });
  worker.onmessage({ data: payload() });
  refinement.dispose();
  assert.equal(failed, 1);
  assert.equal(received, 0);
  assert.equal(worker.terminated, 1);
});

test('leaving the scene cancels detail work and suppresses late delivery', () => {
  const { worker, source } = setup();
  let called = false;
  const refinement = createTerrainRefinement({ source, workerFactory: () => worker, onGeometry: () => { called = true; }, onFailure: () => { called = true; } });
  refinement.dispose(); refinement.dispose();
  worker.onmessage({ data: payload() });
  worker.onerror(new Error('late error'));
  assert.equal(called, false);
  assert.equal(worker.terminated, 1);
});
