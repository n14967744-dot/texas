import test from 'node:test';
import assert from 'node:assert/strict';
import { clearProjectCache, readProjectCache, writeProjectCache } from '../lib/project-cache.ts';
import type { ProjectListResponse } from '../lib/types.ts';

const sample: ProjectListResponse = {
  projects: [],
  total: 0,
  page: 1,
  pageSize: 50,
  pages: 1,
  latestFetch: null,
  facets: { cities: [], counties: [], workTypes: [] },
  coverage: { address: 0, approximate: 0, unknown: 0, unknownPool: 0 },
};

test('project cache round-trips through memory', () => {
  clearProjectCache();
  assert.equal(readProjectCache('q=demo'), null);
  writeProjectCache('q=demo', { ...sample, total: 3 });
  assert.equal(readProjectCache('q=demo')?.total, 3);
  clearProjectCache('q=demo');
  assert.equal(readProjectCache('q=demo'), null);
});
