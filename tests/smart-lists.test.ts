import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { combinedPattern, getSmartList, matchesSmartList, SMART_LISTS } from '../lib/smart-lists.ts';
import { buildWhere, parseFilters } from '../lib/query.ts';

const list = getSmartList('data-centers')!;

test('smart lists registry exposes data-centers and stable ids', () => {
  assert.ok(list);
  assert.equal(list.id, 'data-centers');
  assert.ok(list.include.length > 5);
  assert.ok(SMART_LISTS.every((entry) => /^[a-z0-9-]+$/.test(entry.id)));
});

test('data center matcher includes core vocabulary and excludes known false positives', () => {
  assert.equal(matchesSmartList({
    project_name: 'Edged Energy Outpost',
    facility_name: 'Edged Energy Outpost',
    scope_of_work: '488,770 sf data center',
  }, list), true);
  assert.equal(matchesSmartList({
    project_name: 'HOU2 CAPACITY EXPANSION',
    facility_name: 'HOU2',
    scope_of_work: 'CAPACITY EXPANSION WITHIN HOU2 FACILITY WITH 6MW OF CRITICAL IT LOUD',
  }, list), true);
  assert.equal(matchesSmartList({
    project_name: 'TX11 OPEL Fit-Up',
    facility_name: 'TX11',
    scope_of_work: 'TX11 OPEL Fit-Up includes 32MW DM tenant build out',
  }, list), true);
  assert.equal(matchesSmartList({
    project_name: 'DATACENTERHAWK',
    facility_name: 'SIGNATURE EXCHANGE',
    scope_of_work: 'NON-STRUCTURAL INTERIOR FINISH OUT IN AN EXISTING SINGLE FLOOR SUITE',
  }, list), false);
  assert.equal(matchesSmartList({
    project_name: 'HEART & MIND MD - OFFICE BUILDOUT',
    facility_name: 'Krishna Pabba MD PLLC d/b/a Heart & Mind MD',
    scope_of_work: 'Small tenant improvement ancillary to existing adjacent completed data center work',
  }, list), false);
  assert.equal(matchesSmartList({
    project_name: 'Switchyards',
    facility_name: 'Switchyards',
    scope_of_work: 'Interior remodel for switchyards',
  }, list), false);
  assert.equal(matchesSmartList({
    project_name: 'CSA Manufacturing Facility',
    facility_name: 'Taylorport',
    scope_of_work: 'Remodel existing shell building into a server assembly factory',
  }, list), false);
});

test('list filters are validated and keyword SQL does not imply a finish window', () => {
  assert.throws(() => parseFilters(new URLSearchParams({ list: 'nope' })));
  assert.throws(() => parseFilters(new URLSearchParams({ list: 'Data Centers' })));
  const filters = parseFilters(new URLSearchParams({ list: 'data-centers', upcoming: '1', office: 'texas', sort: 'completion_date', direction: 'asc' }));
  assert.equal(filters.list, 'data-centers');
  assert.equal('upcoming' in filters, false);
  const query = buildWhere(filters, '2026-10-19');
  assert.ok(query.where.includes('~*'));
  assert.ok(query.where.includes('NOT'));
  assert.equal(query.where.includes('completion_date >='), false);
  assert.ok(query.params.includes(combinedPattern(list.include)));
  assert.ok(query.params.includes(combinedPattern(list.exclude)));
  assert.equal(query.params.includes('Project Closed'), false);
  assert.equal(query.params.includes('Inspection Complete'), false);
});

test('offline dump: data-centers rule yields roughly the hand-reviewed count', () => {
  const path = '/workspace/texas_all.json';
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    // Dump is only present in the agent workspace that scraped the live API.
    return;
  }
  const rows = JSON.parse(raw) as Array<{
    project_number: string;
    project_name: string | null;
    facility_name: string | null;
    scope_of_work: string | null;
  }>;
  const matched = rows.filter((row) => matchesSmartList(row, list));
  // Hand-curated export was 313; keyword rules intentionally skip Dell/hospital
  // server rooms and a few ancillary office jobs, so expect ~290–310.
  assert.ok(matched.length >= 280, `expected >= 280 matches, got ${matched.length}`);
  assert.ok(matched.length <= 320, `expected <= 320 matches, got ${matched.length}`);
  assert.ok(matched.some((row) => row.project_number === 'TABS2026022947'));
  assert.ok(!matched.some((row) => row.project_number === 'TABS2027000208'));
});
