import test from 'node:test';
import assert from 'node:assert/strict';
import { browserDefaults, sortMetaLabel } from '../lib/browser-defaults.ts';
import { buildProjectSearchParams } from '../lib/project-params.ts';
import { parseFilters } from '../lib/query.ts';

test('data-centers defaults to estimated_cost desc and serializes for the API', () => {
  const defaults = browserDefaults('data-centers');
  assert.equal(defaults.office, 'texas');
  assert.equal(defaults.sort, 'estimated_cost');
  assert.equal(defaults.direction, 'desc');
  assert.equal(defaults.upcoming, true);
  const query = buildProjectSearchParams(defaults, { listId: 'data-centers' });
  const params = new URLSearchParams(query);
  assert.equal(params.get('sort'), 'estimated_cost');
  assert.equal(params.get('direction'), 'desc'); // paired with non-default sort
  assert.equal(params.get('office'), 'texas');
  assert.equal(params.get('list'), 'data-centers');
  assert.equal(params.get('upcoming'), '1');
  const filters = parseFilters(params);
  assert.equal(filters.sort, 'estimated_cost');
  assert.equal(filters.direction, 'desc');
});

test('main projects defaults stay registration_date desc / office all', () => {
  const defaults = browserDefaults();
  assert.equal(defaults.sort, 'registration_date');
  assert.equal(defaults.direction, 'desc');
  assert.equal(defaults.office, 'all');
  assert.equal(buildProjectSearchParams(defaults), '');
});

test('sortMetaLabel describes cost direction', () => {
  assert.match(sortMetaLabel('estimated_cost', 'desc'), /highest first/);
});
