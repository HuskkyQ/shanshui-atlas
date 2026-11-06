import test from 'node:test';
import assert from 'node:assert/strict';
import content from '../src/content/daci-yan.json' with { type: 'json' };
import { sources } from '../src/places/registry.js';

test('大慈岩公开来源只保留外部链接，照片副本不进入来源弹窗', () => {
  assert.match(content.source.url, /^https?:\/\//);
  assert.ok(sources['daci-yan'].some(([, url]) => url === content.source.url));
  for (const [label, url] of sources['daci-yan']) {
    assert.match(url, /^https?:\/\//, `${label} must not publish a local photo copy`);
  }
});
