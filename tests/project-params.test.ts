import test from 'node:test';
import assert from 'node:assert/strict';
import { API_PROJECT_PARAM_DEFAULTS, buildProjectSearchParams } from '../lib/project-params.ts';

test('smart list texas defaults are sent so the API does not fall back to office=all', () => {
  const query = buildProjectSearchParams({
    ...API_PROJECT_PARAM_DEFAULTS,
    office: 'texas',
    sort: 'completion_date',
    direction: 'asc',
    upcoming: true,
  }, { listId: 'data-centers' });
  const params = new URLSearchParams(query);
  assert.equal(params.get('list'), 'data-centers');
  assert.equal(params.get('office'), 'texas');
  assert.equal(params.get('sort'), 'completion_date');
  assert.equal(params.get('direction'), 'asc');
  assert.equal(params.get('upcoming'), '1');
  assert.equal(params.get('page'), null);
});

test('page is included when browsing past page 1 and omitted on page 1', () => {
  const page1 = buildProjectSearchParams({ ...API_PROJECT_PARAM_DEFAULTS, office: 'texas', page: 1 }, { listId: 'data-centers' });
  assert.equal(new URLSearchParams(page1).get('page'), null);
  const page2 = buildProjectSearchParams({ ...API_PROJECT_PARAM_DEFAULTS, office: 'texas', page: 2 }, { listId: 'data-centers' });
  assert.equal(new URLSearchParams(page2).get('page'), '2');
});

test('main projects browser still omits API-default office=all', () => {
  const query = buildProjectSearchParams({ ...API_PROJECT_PARAM_DEFAULTS });
  assert.equal(query, '');
});

test('pageSize defaults to 50 and is omitted from the query when unchanged', () => {
  const query = buildProjectSearchParams({ ...API_PROJECT_PARAM_DEFAULTS, office: 'texas' }, { listId: 'data-centers' });
  const params = new URLSearchParams(query);
  assert.equal(API_PROJECT_PARAM_DEFAULTS.pageSize, 50);
  assert.equal(params.get('pageSize'), null);
  const custom = buildProjectSearchParams({ ...API_PROJECT_PARAM_DEFAULTS, office: 'texas', pageSize: 25 }, { listId: 'data-centers' });
  assert.equal(new URLSearchParams(custom).get('pageSize'), '25');
});
