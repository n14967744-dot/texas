import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilters, buildWhere } from '../lib/query.ts';
import { getOffice, TERRITORY_COUNTIES } from '../lib/offices.ts';
const today = '2026-10-15';
test('default combines all office counties once and existing office URLs still work', () => {
  const filters = parseFilters(new URLSearchParams());
  assert.equal(filters.office, 'all');
  const query = buildWhere(filters, getOffice(filters.office).counties, today);
  assert.deepEqual(query.params, TERRITORY_COUNTIES);
  assert.equal(new Set(query.params).size, query.params.length);
  assert.deepEqual(getOffice('bryan').counties, ['Brazos']);
});
test('statewide scope has no office county restriction, while county values remain bound', () => {
  const filters = parseFilters(new URLSearchParams({office:'texas',county:'Travis'}));
  const query = buildWhere(filters, getOffice('texas').counties, today);
  assert.equal(query.where, 'TRUE AND location_county = $1');
  assert.deepEqual(query.params,['Travis']);
});
test('outside filter excludes mapped counties and does not classify missing counties as outside', () => {
  const filters = parseFilters(new URLSearchParams({office:'texas',coverage:'outside'}));
  const query = buildWhere(filters,null,today,TERRITORY_COUNTIES);
  assert.ok(query.where.includes('location_county NOT IN'));
  assert.ok(query.where.includes('location_county IS NOT NULL'));
  assert.ok(query.where.includes("location_county <> ''"));
  assert.deepEqual(query.params,TERRITORY_COUNTIES);
  assert.throws(()=>parseFilters(new URLSearchParams({office:'waco',coverage:'outside'})));
  assert.throws(()=>parseFilters(new URLSearchParams({coverage:'invalid'})));
});
