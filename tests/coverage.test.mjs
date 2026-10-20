import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilters, buildWhere } from '../lib/query.ts';
import { getOffice } from '../lib/offices.ts';

const today = '2026-10-15';

test('the project browser defaults to Bryan and still knows Bryan counties for prospects', () => {
  const filters = parseFilters(new URLSearchParams());
  assert.equal(filters.office, 'bryan');
  assert.equal(filters.radius, 25);
  const query = buildWhere(filters, today);
  assert.match(query.geoClause, /distance_mi <= /);
  assert.equal(query.where.includes('location_county IN'), false);
  assert.deepEqual(getOffice('bryan').counties, ['Brazos']);
});

test('All Texas has no radius predicate and still binds an explicit county', () => {
  const filters = parseFilters(new URLSearchParams({ office: 'texas', county: 'Travis' }));
  const query = buildWhere(filters, today);
  assert.equal(query.geoClause, 'TRUE');
  assert.match(query.where, /location_county = \$/);
  assert.ok(query.params.includes('Travis'));
});
