import test from 'node:test';
import assert from 'node:assert/strict';
import { browserDefaults, sortMetaLabel } from '../lib/browser-defaults.ts';
import { filtersToSearchParams } from '../lib/project-params.ts';
import { parseFilters } from '../lib/query.ts';

test('data-centers defaults to newest filed and stays on the selected office', () => {
  const defaults = browserDefaults({ office: 'bryan', list: 'data-centers' });
  assert.equal(defaults.office, 'bryan');
  assert.equal(defaults.list, 'data-centers');
  assert.equal(defaults.sort, 'registration_date');
  assert.equal(defaults.direction, 'desc');
  assert.equal(defaults.radius, 25);
  const params = filtersToSearchParams(defaults);
  assert.equal(params.get('sort'), null);
  assert.equal(params.get('direction'), null);
  assert.equal(params.get('office'), 'bryan');
  assert.equal(params.get('list'), 'data-centers');
  assert.equal(params.get('radius'), null);
  const filters = parseFilters(params);
  assert.equal(filters.sort, 'registration_date');
  assert.equal(filters.direction, 'desc');
  assert.equal(filters.radius, 25);
});

test('main browser defaults to Bryan, 25 miles, and newest filed', () => {
  const defaults = browserDefaults();
  assert.equal(defaults.office, 'bryan');
  assert.equal(defaults.sort, 'registration_date');
  assert.equal(defaults.direction, 'desc');
  assert.equal(defaults.radius, 25);
  assert.equal(defaults.list, '');
  assert.equal(filtersToSearchParams(defaults).toString(), 'office=bryan');
});

test('All Texas defaults to filed date and a hidden office falls back to Bryan', () => {
  const texas = browserDefaults({ office: 'texas' });
  assert.equal(texas.sort, 'registration_date');
  assert.equal(texas.direction, 'desc');
  assert.equal(browserDefaults({ office: 'temple' }).office, 'bryan');
  assert.equal(browserDefaults({ office: 'waco', list: 'bryan-priority' }).list, '');
});

test('Bryan Priority opens on rank', () => {
  const defaults = browserDefaults({ list: 'bryan-priority' });
  assert.equal(defaults.office, 'bryan');
  assert.equal(defaults.sort, 'rank');
  assert.equal(defaults.direction, 'asc');
  assert.equal(defaults.radius, 25);
});

test('sortMetaLabel describes direction and starts with a capital', () => {
  assert.match(sortMetaLabel('estimated_cost', 'desc'), /^Sorted by est\. cost \(highest first\)$/);
  assert.equal(sortMetaLabel('distance', 'asc'), 'Sorted by distance (nearest first)');
  assert.equal(sortMetaLabel('registration_date', 'desc'), 'Sorted by filed date (newest first)');
  assert.equal(sortMetaLabel('rank', 'asc'), 'Sorted by priority rank (best first)');
});
