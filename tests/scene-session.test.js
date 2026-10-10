import test from 'node:test';
import assert from 'node:assert/strict';
import { getScenicScene } from '../src/scenic-scenes.js';
import { createSceneSession } from '../src/scene-session.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeWorld(events, { flyToScenic } = {}) {
  return {
    captureState() { events.push('world:capture'); return { view: 'overview' }; },
    restoreState(state) { events.push(`world:restore:${state.view}`); },
    setPaused(paused, options) {
      events.push(options?.keepVisible ? `world:pause:${paused}:keep-visible` : `world:pause:${paused}`);
    },
    ...(flyToScenic ? { flyToScenic } : {}),
  };
}

function makeInstance(id, events, { reveal, conceal } = {}) {
  return {
    mount(context) { events.push(`${id}:mount:${context.slot}`); },
    ...(reveal ? { reveal } : {}),
    ...(conceal ? { conceal } : {}),
    update() {},
    dispose() { events.push(`${id}:dispose`); },
  };
}

function readyScene(id, loader) {
  return { id, status: 'ready', enabled: true, hidden: false, loader };
}

test('the registry enables three implemented scenic scenes without invented assets', () => {
  for (const id of ['leifeng-pagoda', 'santanyinyue', 'lingyin-temple']) {
    const scene = getScenicScene(id);
    assert.equal(scene.status, 'ready');
    assert.equal(scene.enabled, true);
    assert.equal(scene.hidden, false);
    assert.equal(typeof scene.loader, 'function');
    assert.equal('modelURL' in scene, false);
  }
  assert.equal(getScenicScene('missing'), null);
});

test('creating a session does not load a scene and planned scenes cannot enter', async () => {
  const events = [];
  let loads = 0;
  const planned = { id: 'planned', status: 'planned', enabled: false, hidden: true, loader() { loads += 1; } };
  const session = createSceneSession({ world: makeWorld(events), scenes: (id) => id === planned.id ? planned : null });

  assert.deepEqual(session.state, { status: 'world', sceneId: null });
  assert.equal(loads, 0);
  assert.equal(await session.enter('planned', {}), false);
  assert.equal(await session.enter('missing', {}), false);
  assert.equal(loads, 0);
  assert.deepEqual(events, []);
});

test('a successful entry pauses only after loading and exit restores the World', async () => {
  const events = [];
  const loaded = deferred();
  const scene = readyScene('ready', () => { events.push('scene:load'); return loaded.promise; });
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });

  const entering = session.enter('ready', { slot: 'panel' });
  assert.equal(session.activeScene, null);
  assert.deepEqual(session.state, { status: 'loading', sceneId: 'ready' });
  assert.deepEqual(events, ['world:capture', 'scene:load']);

  loaded.resolve(makeInstance('scene', events));
  assert.equal(await entering, true);
  assert.deepEqual(session.state, { status: 'scenic', sceneId: 'ready' });
  assert.equal(typeof session.activeScene.mount, 'function');
  assert.deepEqual(events, ['world:capture', 'scene:load', 'world:pause:true', 'scene:mount:panel']);

  session.exit();
  assert.deepEqual(session.state, { status: 'world', sceneId: null });
  assert.equal(session.activeScene, null);
  assert.deepEqual(events.slice(-3), ['scene:dispose', 'world:restore:overview', 'world:pause:false']);
});

test('a loading failure leaves the World running and rejects to the caller', async () => {
  const events = [];
  const failure = new Error('asset failed');
  const scene = readyScene('broken', async () => { throw failure; });
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });

  await assert.rejects(session.enter('broken', {}), failure);
  assert.deepEqual(session.state, { status: 'world', sceneId: null });
  assert.deepEqual(events, ['world:capture', 'world:restore:overview', 'world:pause:false']);
});

test('exit during loading disposes the late instance and leaves the World available', async () => {
  const events = [];
  const loaded = deferred();
  const scene = readyScene('slow', () => loaded.promise);
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });
  const entering = session.enter('slow', { slot: 'panel' });

  session.exit();
  assert.deepEqual(session.state, { status: 'world', sceneId: null });
  assert.deepEqual(events, ['world:capture', 'world:restore:overview', 'world:pause:false']);

  loaded.resolve(makeInstance('late', events));
  assert.equal(await entering, false);
  assert.deepEqual(events, [
    'world:capture', 'world:restore:overview', 'world:pause:false', 'late:dispose',
  ]);
  assert.deepEqual(session.state, { status: 'world', sceneId: null });
});

test('a synchronous mount failure restores the World and allows a later entry', async () => {
  const events = [];
  const mountFailure = new Error('mount failed');
  const broken = readyScene('broken', async () => ({
    mount() { events.push('broken:mount'); throw mountFailure; },
    dispose() { events.push('broken:dispose'); },
  }));
  const ready = readyScene('ready', async () => makeInstance('ready', events));
  const scenes = new Map([['broken', broken], ['ready', ready]]);
  const session = createSceneSession({ world: makeWorld(events), scenes: (id) => scenes.get(id) });

  await assert.rejects(session.enter('broken', {}), mountFailure);
  assert.deepEqual(events, [
    'world:capture',
    'world:pause:true',
    'broken:mount',
    'broken:dispose',
    'world:restore:overview',
    'world:pause:false',
  ]);
  assert.deepEqual(session.state, { status: 'world', sceneId: null });

  assert.equal(await session.enter('ready', { slot: 'next' }), true);
  assert.deepEqual(session.state, { status: 'scenic', sceneId: 'ready' });
  assert.deepEqual(events.slice(-3), ['world:capture', 'world:pause:true', 'ready:mount:next']);
  session.exit();
});

test('switching during a load disposes the late instance without mounting it', async () => {
  const events = [];
  const firstLoad = deferred();
  const secondLoad = deferred();
  const scenes = new Map([
    ['first', readyScene('first', () => firstLoad.promise)],
    ['second', readyScene('second', () => secondLoad.promise)],
  ]);
  const session = createSceneSession({ world: makeWorld(events), scenes: (id) => scenes.get(id) });

  const firstEntry = session.enter('first', { slot: 'first' });
  const secondEntry = session.enter('second', { slot: 'second' });
  secondLoad.resolve(makeInstance('second', events));
  assert.equal(await secondEntry, true);

  firstLoad.resolve(makeInstance('first', events));
  assert.equal(await firstEntry, false);
  assert.equal(events.includes('first:mount:first'), false);
  assert.equal(events.filter((event) => event === 'first:dispose').length, 1);
  assert.deepEqual(session.state, { status: 'scenic', sceneId: 'second' });
});

test('scene loading and World fly-to run in parallel and pause only after both finish', async () => {
  const events = [];
  const loaded = deferred();
  const flown = deferred();
  let flightSignal;
  let flightPoi;
  const scene = readyScene('ready', () => {
    events.push('scene:load');
    return loaded.promise;
  });
  scene.poiId = 'leifeng-pagoda';
  const world = makeWorld(events, {
    flyToScenic(poiId, { signal }) {
      events.push('world:fly');
      flightPoi = poiId;
      flightSignal = signal;
      return flown.promise;
    },
  });
  const session = createSceneSession({ world, scenes: () => scene });

  const entering = session.enter('ready', { slot: 'panel' });
  assert.deepEqual(events, ['world:capture', 'scene:load', 'world:fly']);
  assert.equal(flightPoi, 'leifeng-pagoda');
  assert.equal(flightSignal.aborted, false);

  loaded.resolve(makeInstance('scene', events));
  await Promise.resolve();
  assert.equal(events.includes('world:pause:true'), false);

  flown.resolve(true);
  assert.equal(await entering, true);
  assert.deepEqual(events, [
    'world:capture', 'scene:load', 'world:fly',
    'world:pause:true', 'scene:mount:panel',
  ]);
});

test('a completed fly-to waits for the scene instance before mounting', async () => {
  const events = [];
  const loaded = deferred();
  const scene = readyScene('ready', () => loaded.promise);
  scene.poiId = 'ready-poi';
  const world = makeWorld(events, {
    async flyToScenic(poiId) {
      events.push(`world:fly:${poiId}`);
      return true;
    },
  });
  const session = createSceneSession({ world, scenes: () => scene });

  const entering = session.enter('ready', { slot: 'panel' });
  await Promise.resolve();
  assert.deepEqual(events, ['world:capture', 'world:fly:ready-poi']);
  assert.equal(session.state.status, 'loading');

  loaded.resolve(makeInstance('scene', events));
  assert.equal(await entering, true);
  assert.deepEqual(events, [
    'world:capture', 'world:fly:ready-poi',
    'world:pause:true', 'scene:mount:panel',
  ]);
});

test('exit during fly-to aborts the flight, restores immediately, and disposes a late instance', async () => {
  const events = [];
  const flown = deferred();
  let flightSignal;
  const scene = readyScene('ready', async () => makeInstance('late', events));
  scene.poiId = 'ready-poi';
  const world = makeWorld(events, {
    flyToScenic(_poiId, { signal }) {
      events.push('world:fly');
      flightSignal = signal;
      return flown.promise;
    },
  });
  const session = createSceneSession({ world, scenes: () => scene });
  const entering = session.enter('ready', {});

  await Promise.resolve();
  session.exit();
  assert.equal(flightSignal.aborted, true);
  assert.deepEqual(events, [
    'world:capture', 'world:fly',
    'world:restore:overview', 'world:pause:false',
  ]);

  flown.resolve(true);
  assert.equal(await entering, false);
  assert.deepEqual(events.slice(-1), ['late:dispose']);
  assert.equal(events.includes('late:mount:undefined'), false);
});

test('loader failure aborts an in-flight fly-to and restores the captured World', async () => {
  const events = [];
  const failure = new Error('asset failed');
  const flightSettled = deferred();
  let flightSignal;
  const scene = readyScene('broken', async () => {
    events.push('scene:load');
    throw failure;
  });
  scene.poiId = 'broken-poi';
  const world = makeWorld(events, {
    flyToScenic(_poiId, { signal }) {
      events.push('world:fly');
      flightSignal = signal;
      return flightSettled.promise;
    },
  });
  const session = createSceneSession({ world, scenes: () => scene });

  const entering = session.enter('broken', {});
  await assert.rejects(entering, failure);
  assert.equal(flightSignal.aborted, true);
  flightSettled.resolve(false);
  assert.deepEqual(events, [
    'world:capture', 'scene:load', 'world:fly',
    'world:restore:overview', 'world:pause:false',
  ]);
  assert.deepEqual(session.state, { status: 'world', sceneId: null });
});

test('a flight failure restores the World and disposes a scene that finishes loading later', async () => {
  const events = [];
  const loaded = deferred();
  const failure = new Error('fly failed');
  const scene = readyScene('ready', () => loaded.promise);
  scene.poiId = 'ready-poi';
  const world = makeWorld(events, {
    async flyToScenic() {
      events.push('world:fly');
      throw failure;
    },
  });
  const session = createSceneSession({ world, scenes: () => scene });

  const entering = session.enter('ready', {});
  await assert.rejects(entering, failure);
  assert.deepEqual(events, [
    'world:capture', 'world:fly',
    'world:restore:overview', 'world:pause:false',
  ]);

  loaded.resolve(makeInstance('late', events));
  await Promise.resolve();
  assert.deepEqual(events.slice(-1), ['late:dispose']);
  assert.equal(session.state.status, 'world');
});

test('a false fly-to result cancels entry and disposes the already loaded scene', async () => {
  const events = [];
  const scene = readyScene('ready', async () => makeInstance('cancelled', events));
  scene.poiId = 'ready-poi';
  const world = makeWorld(events, {
    async flyToScenic() {
      events.push('world:fly');
      return false;
    },
  });
  const session = createSceneSession({ world, scenes: () => scene });

  assert.equal(await session.enter('ready', {}), false);
  assert.deepEqual(events, [
    'world:capture', 'world:fly',
    'cancelled:dispose', 'world:restore:overview', 'world:pause:false',
  ]);
  assert.deepEqual(session.state, { status: 'world', sceneId: null });
});

test('a scenic reveal keeps the World visible until the new scene is ready', async () => {
  const events = [];
  const revealed = deferred();
  const revealStarted = deferred();
  let revealSignal;
  const scene = readyScene('ready', async () => makeInstance('scene', events, {
    reveal({ signal }) {
      events.push('scene:reveal');
      revealSignal = signal;
      revealStarted.resolve();
      return revealed.promise;
    },
  }));
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });

  const entering = session.enter('ready', { slot: 'panel' });
  await revealStarted.promise;
  assert.deepEqual(events.slice(0, 4), [
    'world:capture',
    'world:pause:true:keep-visible',
    'scene:mount:panel',
    'scene:reveal',
  ]);
  assert.equal(session.state.status, 'loading');
  assert.equal(session.activeScene !== null, true);
  assert.equal(revealSignal.aborted, false);

  revealed.resolve(true);
  assert.equal(await entering, true);
  assert.deepEqual(events, [
    'world:capture',
    'world:pause:true:keep-visible',
    'scene:mount:panel',
    'scene:reveal',
    'world:pause:true',
  ]);
  assert.deepEqual(session.state, { status: 'scenic', sceneId: 'ready' });
});

test('exit during scenic reveal aborts reveal, disposes once, and restores the World immediately', async () => {
  const events = [];
  const revealed = deferred();
  const revealStarted = deferred();
  let revealSignal;
  const scene = readyScene('ready', async () => makeInstance('scene', events, {
    reveal({ signal }) {
      events.push('scene:reveal');
      revealSignal = signal;
      revealStarted.resolve();
      return revealed.promise;
    },
  }));
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });
  const entering = session.enter('ready', {});

  await revealStarted.promise;
  session.exit();
  assert.equal(revealSignal.aborted, true);
  assert.deepEqual(events, [
    'world:capture',
    'world:pause:true:keep-visible',
    'scene:mount:undefined',
    'scene:reveal',
    'scene:dispose',
    'world:restore:overview',
    'world:pause:false',
  ]);

  revealed.resolve(true);
  assert.equal(await entering, false);
  assert.equal(events.filter((event) => event === 'scene:dispose').length, 1);
  assert.deepEqual(session.state, { status: 'world', sceneId: null });
});

test('dispose during scenic reveal aborts and cannot dispose the mounted scene twice', async () => {
  const events = [];
  const revealed = deferred();
  const revealStarted = deferred();
  let revealSignal;
  const scene = readyScene('ready', async () => makeInstance('scene', events, {
    reveal({ signal }) {
      revealSignal = signal;
      revealStarted.resolve();
      return revealed.promise;
    },
  }));
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });
  const entering = session.enter('ready', {});

  await revealStarted.promise;
  session.dispose();
  assert.equal(revealSignal.aborted, true);
  assert.deepEqual(session.state, { status: 'disposed', sceneId: null });
  revealed.resolve(true);
  assert.equal(await entering, false);
  assert.equal(events.filter((event) => event === 'scene:dispose').length, 1);
});

test('a reveal failure disposes the mounted scene and restores the World', async () => {
  const events = [];
  const failure = new Error('reveal failed');
  const scene = readyScene('broken', async () => makeInstance('scene', events, {
    async reveal() {
      events.push('scene:reveal');
      throw failure;
    },
  }));
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });

  await assert.rejects(session.enter('broken', {}), failure);
  assert.deepEqual(events, [
    'world:capture',
    'world:pause:true:keep-visible',
    'scene:mount:undefined',
    'scene:reveal',
    'scene:dispose',
    'world:restore:overview',
    'world:pause:false',
  ]);
  assert.deepEqual(session.state, { status: 'world', sceneId: null });
});

test('a false reveal result cancels the mounted scene and restores the World', async () => {
  const events = [];
  const scene = readyScene('cancelled', async () => makeInstance('scene', events, {
    async reveal() {
      events.push('scene:reveal');
      return false;
    },
  }));
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });

  assert.equal(await session.enter('cancelled', {}), false);
  assert.deepEqual(events, [
    'world:capture',
    'world:pause:true:keep-visible',
    'scene:mount:undefined',
    'scene:reveal',
    'scene:dispose',
    'world:restore:overview',
    'world:pause:false',
  ]);
  assert.deepEqual(session.state, { status: 'world', sceneId: null });
});

test('an animated exit keeps the scenic instance and World backdrop visible until conceal completes', async () => {
  const events = [];
  const concealed = deferred();
  const concealStarted = deferred();
  let concealSignal;
  const scene = readyScene('ready', async () => makeInstance('scene', events, {
    conceal({ signal }) {
      events.push('scene:conceal');
      concealSignal = signal;
      concealStarted.resolve();
      return concealed.promise;
    },
  }));
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });

  assert.equal(await session.enter('ready', {}), true);
  const exiting = session.exit({ animate: true });
  await concealStarted.promise;

  assert.equal(session.exit({ animate: true }), exiting);
  assert.deepEqual(session.state, { status: 'returning', sceneId: 'ready' });
  assert.equal(session.activeScene !== null, true);
  assert.equal(concealSignal.aborted, false);
  assert.deepEqual(events, [
    'world:capture',
    'world:pause:true',
    'scene:mount:undefined',
    'world:restore:overview',
    'world:pause:false',
    'world:pause:true:keep-visible',
    'scene:conceal',
  ]);

  concealed.resolve(true);
  assert.equal(await exiting, true);
  assert.deepEqual(session.state, { status: 'world', sceneId: null });
  assert.equal(session.activeScene, null);
  assert.equal(concealSignal.aborted, true);
  assert.equal(events.filter((event) => event === 'scene:dispose').length, 1);
  assert.deepEqual(events.slice(-4), [
    'scene:conceal',
    'scene:dispose',
    'world:restore:overview',
    'world:pause:false',
  ]);
});

test('an animated exit that is cancelled by dispose aborts conceal and disposes once', async () => {
  const events = [];
  const concealed = deferred();
  const concealStarted = deferred();
  let concealSignal;
  const scene = readyScene('ready', async () => makeInstance('scene', events, {
    conceal({ signal }) {
      concealSignal = signal;
      concealStarted.resolve();
      return concealed.promise;
    },
  }));
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });

  await session.enter('ready', {});
  const exiting = session.exit({ animate: true });
  await concealStarted.promise;
  session.dispose();

  assert.equal(concealSignal.aborted, true);
  assert.deepEqual(session.state, { status: 'disposed', sceneId: null });
  assert.equal(session.activeScene, null);
  concealed.resolve(true);
  assert.equal(await exiting, false);
  assert.equal(events.filter((event) => event === 'scene:dispose').length, 1);
});

test('a new entry aborts a stale animated exit and does not let it dispose the new scene', async () => {
  const events = [];
  const concealed = deferred();
  const concealStarted = deferred();
  let concealSignal;
  const first = readyScene('first', async () => makeInstance('first', events, {
    conceal({ signal }) {
      concealSignal = signal;
      concealStarted.resolve();
      return concealed.promise;
    },
  }));
  const second = readyScene('second', async () => makeInstance('second', events));
  const scenes = new Map([['first', first], ['second', second]]);
  const session = createSceneSession({ world: makeWorld(events), scenes: (id) => scenes.get(id) });

  await session.enter('first', {});
  const exiting = session.exit({ animate: true });
  await concealStarted.promise;
  const entering = session.enter('second', {});
  assert.equal(concealSignal.aborted, true);
  assert.equal(await entering, true);

  concealed.resolve(true);
  assert.equal(await exiting, false);
  assert.deepEqual(session.state, { status: 'scenic', sceneId: 'second' });
  assert.equal(session.activeScene !== null, true);
  assert.equal(events.filter((event) => event === 'first:dispose').length, 1);
  assert.equal(events.filter((event) => event === 'second:dispose').length, 0);
});

test('a failed conceal restores the World, disposes the scene, and rejects the animated exit', async () => {
  const events = [];
  const failure = new Error('conceal failed');
  const scene = readyScene('ready', async () => makeInstance('scene', events, {
    async conceal() {
      events.push('scene:conceal');
      throw failure;
    },
  }));
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });

  await session.enter('ready', {});
  await assert.rejects(session.exit({ animate: true }), failure);
  assert.deepEqual(session.state, { status: 'world', sceneId: null });
  assert.equal(session.activeScene, null);
  assert.deepEqual(events.slice(-4), [
    'scene:conceal',
    'scene:dispose',
    'world:restore:overview',
    'world:pause:false',
  ]);
});

test('a false conceal result still completes the animated exit cleanup', async () => {
  const events = [];
  const scene = readyScene('ready', async () => makeInstance('scene', events, {
    async conceal() {
      events.push('scene:conceal');
      return false;
    },
  }));
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });

  await session.enter('ready', {});
  assert.equal(await session.exit({ animate: true }), false);
  assert.deepEqual(session.state, { status: 'world', sceneId: null });
  assert.equal(session.activeScene, null);
  assert.equal(events.filter((event) => event === 'scene:dispose').length, 1);
  assert.deepEqual(events.slice(-4), [
    'scene:conceal',
    'scene:dispose',
    'world:restore:overview',
    'world:pause:false',
  ]);
});

test('animated exit during loading falls back to immediate cancellation', async () => {
  const events = [];
  const loaded = deferred();
  const scene = readyScene('slow', () => loaded.promise);
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });
  const entering = session.enter('slow', {});

  assert.equal(session.exit({ animate: true }), undefined);
  assert.deepEqual(session.state, { status: 'world', sceneId: null });
  loaded.resolve(makeInstance('late', events));
  assert.equal(await entering, false);
  assert.deepEqual(events, [
    'world:capture',
    'world:restore:overview',
    'world:pause:false',
    'late:dispose',
  ]);
});

test('dispose is idempotent and disposes an instance that finishes loading late', async () => {
  const events = [];
  const loaded = deferred();
  const scene = readyScene('ready', () => loaded.promise);
  const session = createSceneSession({ world: makeWorld(events), scenes: () => scene });
  const entering = session.enter('ready', { slot: 'panel' });

  session.dispose();
  session.dispose();
  assert.deepEqual(session.state, { status: 'disposed', sceneId: null });
  loaded.resolve(makeInstance('late', events));
  assert.equal(await entering, false);
  assert.deepEqual(events, [
    'world:capture', 'world:restore:overview', 'world:pause:false', 'late:dispose',
  ]);
  assert.equal(await session.enter('ready', { slot: 'panel' }), false);
});
