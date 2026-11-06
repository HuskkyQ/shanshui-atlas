import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWestLakeHikes } from '../src/west-lake/hikes-data.js';

test('hike JSON failure can retry and parallel consumers share one parsed response', async () => {
  let requests = 0;
  const data = { routes: [], network: [] };
  const fetcher = async url => {
    requests++;
    assert.match(url, /west-lake-hikes\.json/);
    return requests === 1 ? { ok: false, status: 503 }
      : { ok: true, json: async () => data };
  };
  await assert.rejects(loadWestLakeHikes(fetcher), /503/);
  const first = loadWestLakeHikes(fetcher);
  const second = loadWestLakeHikes(fetcher);
  assert.equal(first, second);
  assert.equal(await first, data);
  assert.equal(requests, 2);
});
