import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenicHistory } from '../src/west-lake/scenic-history.js';

function createWindow() {
  const listeners = new Map();
  const stack = [{ state: null, url: '/?place=west-lake' }];
  let index = 0;
  const win = {
    location: { href: 'http://localhost/?place=west-lake' },
    history: {
      state: null,
      pushState(state, _title, url) {
        stack.splice(index + 1);
        stack.push({ state, url });
        index += 1;
        this.state = state;
        win.location.href = `http://localhost${url}`;
      },
      replaceState(state, _title, url) {
        stack[index] = { state, url };
        this.state = state;
        win.location.href = `http://localhost${url}`;
      },
      back() {
        index = Math.max(0, index - 1);
        const entry = stack[index];
        this.state = entry.state;
        win.location.href = `http://localhost${entry.url}`;
        for (const listener of listeners.get('popstate') || []) listener({ state: entry.state });
      },
    },
    addEventListener(type, listener) {
      const set = listeners.get(type) || new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
  };
  return win;
}

test('scenic history returns to the world on browser back and keeps direct scene URLs usable', async () => {
  const win = createWindow();
  const events = [];
  const history = createScenicHistory({
    window: win,
    onEnter: (id) => events.push(`enter:${id}`),
    onExit: () => events.push('exit'),
  });
  history.enter('santanyinyue');
  assert.equal(new URL(win.location.href).searchParams.get('scene'), 'santanyinyue');
  win.history.back();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ['exit']);
  history.dispose();
});

test('history is a no-op when the host has no browser navigation API', () => {
  const events = [];
  const history = createScenicHistory({ window: {}, onEnter: () => events.push('enter'), onExit: () => events.push('exit') });
  history.enter('leifeng-pagoda');
  history.back();
  assert.deepEqual(events, []);
  assert.equal(history.enabled, false);
});

test('a direct scene URL clears in place instead of navigating away', () => {
  const win = createWindow();
  win.location.href = 'http://localhost/?place=west-lake&scene=leifeng-pagoda';
  const history = createScenicHistory({ window: win, onEnter() {}, onExit() {} });
  history.syncInitial();
  assert.equal(history.shouldGoBack(), false);
  history.clear();
  assert.equal(new URL(win.location.href).searchParams.get('scene'), null);
  assert.equal(win.location.href.includes('place=west-lake'), true);
});

test('entering the same scenic scene twice does not add a second history entry', () => {
  const win = createWindow();
  const history = createScenicHistory({ window: win, onEnter() {}, onExit() {} });
  history.enter('leifeng-pagoda');
  const first = win.location.href;
  history.enter('leifeng-pagoda');
  assert.equal(win.location.href, first);
  history.dispose();
});
