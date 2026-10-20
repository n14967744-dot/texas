import test from 'node:test';
import assert from 'node:assert/strict';
import { filtersToSearchParams } from '../lib/project-params.ts';
import { FILTER_DEFAULTS, parseFilters, type Filters } from '../lib/query.ts';

test('office is always serialized and other defaults are omitted', () => {
  const params = filtersToSearchParams(FILTER_DEFAULTS);
  assert.equal(params.toString(), 'office=bryan');
  assert.equal(params.get('page'), null);
  assert.equal(params.get('pageSize'), null);
  assert.equal(params.get('radius'), null);
});

test('page and page size are included only when they differ from the default', () => {
  const page1 = filtersToSearchParams({ ...FILTER_DEFAULTS, office: 'waco', page: 1 });
  assert.equal(page1.get('page'), null);
  const page2 = filtersToSearchParams({ ...FILTER_DEFAULTS, office: 'waco', page: 2, pageSize: 25 });
  assert.equal(page2.get('page'), '2');
  assert.equal(page2.get('pageSize'), '25');
});

test('non-default sort always sends both sort and direction', () => {
  const params = filtersToSearchParams({
    ...FILTER_DEFAULTS,
    office: 'texas',
    list: 'data-centers',
    sort: 'estimated_cost',
    direction: 'desc',
  });
  assert.equal(params.get('sort'), 'estimated_cost');
  assert.equal(params.get('direction'), 'desc');
  assert.equal(params.get('office'), 'texas');
  assert.equal(params.get('list'), 'data-centers');
});

test('filters round-trip through the URL', () => {
  const filters: Filters = {
    ...FILTER_DEFAULTS,
    office: 'waco',
    list: 'data-centers',
    q: 'hall',
    city: 'Waco',
    county: 'McLennan',
    workType: 'New Construction',
    radius: 12.5,
    includeUnknown: true,
    startPreset: 'next30',
    finishFrom: '2026-10-01',
    finishTo: '2026-12-01',
    costMin: 1000,
    costMax: 5000,
    includeNoCost: true,
    filedPreset: 'last7',
    hidden: true,
    sort: 'timing',
    direction: 'desc',
    page: 2,
    pageSize: 25,
  };
  assert.deepEqual(parseFilters(filtersToSearchParams(filters)), filters);
});
