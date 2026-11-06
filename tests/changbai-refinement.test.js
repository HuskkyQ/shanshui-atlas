import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTerrainRefinement } from '../src/changbai/refinement.js';

function fakeWorker() {
  let messageHandler;
  let errorHandler;
  return {
    posted: [],
    terminateCalls: 0,
    set onmessage(handler) { messageHandler = handler; },
    get onmessage() { return messageHandler; },
    set onerror(handler) { errorHandler = handler; },
    get onerror() { return errorHandler; },
    postMessage(...args) { this.posted.push(args); },
    terminate() { this.terminateCalls += 1; },
    emit(data) { messageHandler?.({ data }); },
    fail(error) { errorHandler?.(error); },
  };
}

const source = {
  metadata: { width: 2, height: 2 },
  elevations: new Uint16Array([1, 2, 3, 4]),
  lake: { points: [] },
};

const geometryPayload = () => ({
  position: new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]),
  normal: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
  color: new Float32Array([0.2, 0.3, 0.4, 0.4, 0.5, 0.6, 0.6, 0.7, 0.8]),
  uv: new Float32Array([0, 0, 1, 0, 0, 1]),
  index: new Uint32Array([0, 1, 2]),
});

test('successful refinement keeps the source buffer and assembles all transferred geometry attributes', () => {
  const worker = fakeWorker();
  const geometries = [];
  const failures = [];
  const refinement = createTerrainRefinement({
    source,
    onGeometry: (geometry) => geometries.push(geometry),
    onFailure: (error) => failures.push(error),
    workerFactory: () => worker,
  });

  assert.equal(worker.posted.length, 1);
  assert.equal(worker.posted[0].length, 1, 'source must be cloned without a transfer list');
  assert.equal(worker.posted[0][0], source);
  assert.equal(source.elevations.byteLength, 8);

  const payload = geometryPayload();
  worker.emit(payload);
  assert.equal(failures.length, 0);
  assert.equal(geometries.length, 1);
  const geometry = geometries[0];
  assert.ok(geometry instanceof THREE.BufferGeometry);
  assert.equal(geometry.getAttribute('position').array, payload.position);
  assert.equal(geometry.getAttribute('normal').array, payload.normal);
  assert.equal(geometry.getAttribute('color').array, payload.color);
  assert.equal(geometry.getAttribute('uv').array, payload.uv);
  assert.equal(geometry.getIndex().array, payload.index);
  assert.equal(worker.terminateCalls, 1);

  worker.emit(geometryPayload());
  refinement.dispose();
  refinement.dispose();
  assert.equal(geometries.length, 1, 'completion must ignore duplicate worker messages');
  assert.equal(worker.terminateCalls, 1, 'completion and dispose must terminate once');
  geometry.dispose();
});

test('worker errors and factory throws invoke the fallback exactly once', () => {
  const worker = fakeWorker();
  const workerFailures = [];
  const refinement = createTerrainRefinement({
    source,
    onGeometry: () => assert.fail('failed worker must not deliver geometry'),
    onFailure: (error) => workerFailures.push(error),
    workerFactory: () => worker,
  });
  const first = new Error('worker unavailable');
  worker.fail(first);
  worker.fail(new Error('late duplicate'));
  refinement.dispose();
  assert.deepEqual(workerFailures, [first]);
  assert.equal(worker.terminateCalls, 1);

  const factoryFailure = new Error('factory blocked');
  const factoryFailures = [];
  const unavailable = createTerrainRefinement({
    source,
    onGeometry: () => assert.fail('throwing factory must not deliver geometry'),
    onFailure: (error) => factoryFailures.push(error),
    workerFactory: () => { throw factoryFailure; },
  });
  assert.deepEqual(factoryFailures, [factoryFailure], 'factory failure must be synchronous');
  unavailable.dispose();
  unavailable.dispose();
  assert.deepEqual(factoryFailures, [factoryFailure]);
});

test('dispose terminates pending work and ignores late success and error events', () => {
  const worker = fakeWorker();
  let callbacks = 0;
  const refinement = createTerrainRefinement({
    source,
    onGeometry: () => { callbacks += 1; },
    onFailure: () => { callbacks += 1; },
    workerFactory: () => worker,
  });
  const lateMessage = worker.onmessage;
  const lateError = worker.onerror;
  refinement.dispose();
  refinement.dispose();
  lateMessage({ data: geometryPayload() });
  lateError(new Error('after dispose'));
  assert.equal(callbacks, 0);
  assert.equal(worker.terminateCalls, 1);
});

test('detail worker builds the source-detail mesh, transfers five buffers, and disposes its model', async () => {
  const originalSelf = globalThis.self;
  const originalDispose = THREE.BufferGeometry.prototype.dispose;
  let message;
  let transfer;
  let geometryDisposals = 0;
  globalThis.self = { postMessage(payload, buffers) { message = payload; transfer = buffers; } };
  THREE.BufferGeometry.prototype.dispose = function dispose() {
    geometryDisposals += 1;
    return originalDispose.call(this);
  };
  try {
    await import(`../src/changbai/detail-worker.js?test=${Date.now()}`);
    const workerSource = {
      metadata: {
        width: 3, height: 3,
        west: 128, east: 128.002, north: 42.002, south: 42,
        minElevation: 1000, maxElevation: 1300, lakeElevation: 1100,
      },
      elevations: new Uint16Array([
        10000, 11000, 12000,
        10500, 11000, 12500,
        10000, 11500, 13000,
      ]),
      lake: {
        source: { osmId: 11650508 },
        points: [
          { lon: 128.0007, lat: 42.0013 },
          { lon: 128.0013, lat: 42.0013 },
          { lon: 128.0013, lat: 42.0007 },
          { lon: 128.0007, lat: 42.0007 },
        ],
      },
    };
    globalThis.self.onmessage({ data: workerSource });
    assert.ok(message.position instanceof Float32Array);
    assert.ok(message.normal instanceof Float32Array);
    assert.ok(message.color instanceof Float32Array);
    assert.ok(message.uv instanceof Float32Array);
    assert.ok(message.index instanceof Uint16Array || message.index instanceof Uint32Array);
    assert.deepEqual(transfer, [
      message.position.buffer,
      message.normal.buffer,
      message.color.buffer,
      message.uv.buffer,
      message.index.buffer,
    ]);
    assert.ok(geometryDisposals > 0, 'temporary model resources must be disposed after transfer');
  } finally {
    THREE.BufferGeometry.prototype.dispose = originalDispose;
    if (originalSelf === undefined) delete globalThis.self;
    else globalThis.self = originalSelf;
  }
});


test('an unavailable worker implementation still falls back once', () => {
  let failures=0;
  const refinement=createTerrainRefinement({source,onGeometry(){assert.fail('no geometry expected');},onFailure(){failures++;},workerFactory:()=>({postMessage(){}})});
  assert.equal(failures,1);refinement.dispose();assert.equal(failures,1);
});
