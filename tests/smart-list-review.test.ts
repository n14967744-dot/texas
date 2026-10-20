import test from 'node:test';
import assert from 'node:assert/strict';
import { SMART_LIST_REVIEW, getReviewEntry, hiddenProjectNumbers } from '../lib/smart-list-review.ts';
import { buildWhere, FILTER_DEFAULTS, parseFilters } from '../lib/query.ts';
import { filtersToSearchParams } from '../lib/project-params.ts';
import { matchesSmartList, getSmartList } from '../lib/smart-lists.ts';

const list = getSmartList('data-centers')!;

test('review registry has hide and review decisions for data-centers', () => {
  assert.ok(SMART_LIST_REVIEW.length >= 30);
  const hides = hiddenProjectNumbers('data-centers');
  assert.ok(hides.length >= 20);
  assert.ok(hides.every((n) => /^TABS\d+$/.test(n)));
  const guard = getReviewEntry('data-centers', 'TABS2025007641');
  assert.equal(guard?.decision, 'hide');
  assert.match(guard?.reason || '', /guardhouse/i);
  const abilene = getReviewEntry('data-centers', 'TABS2026008297');
  assert.equal(abilene?.decision, 'keep');
  assert.ok(abilene?.costNote);
});

test('hidden projects are excluded from SQL unless hidden=1', () => {
  const base = parseFilters(new URLSearchParams({
    list: 'data-centers', office: 'texas', sort: 'estimated_cost', direction: 'desc',
  }));
  assert.equal(base.hidden, false);
  const where = buildWhere(base, '2026-10-19');
  assert.ok(where.where.includes('project_number NOT IN'));
  assert.ok(where.params.includes('TABS2025007641'));

  const shown = parseFilters(new URLSearchParams({
    list: 'data-centers', office: 'texas', hidden: '1', sort: 'estimated_cost', direction: 'desc',
  }));
  assert.equal(shown.hidden, true);
  const whereShown = buildWhere(shown, '2026-10-19');
  assert.equal(whereShown.where.includes('project_number NOT IN'), false);
});

test('hidden=1 requires a smart list and serializes in params', () => {
  assert.throws(() => parseFilters(new URLSearchParams({ hidden: '1' })));
  const params = filtersToSearchParams({
    ...FILTER_DEFAULTS,
    office: 'texas',
    list: 'data-centers',
    sort: 'estimated_cost',
    direction: 'desc',
    hidden: true,
  });
  assert.equal(params.get('hidden'), '1');
  assert.equal(params.get('list'), 'data-centers');
});

test('manual hide rows still keyword-match so Show hidden can surface them', () => {
  // Guardhouse filing is hidden via review file, not keyword exclude
  assert.equal(matchesSmartList({
    project_name: 'TTX Data Center',
    facility_name: 'Guard House',
    scope_of_work: 'Construction of a new pre-cast concrete guardhouse with slab-on-grade foundation.',
  }, list), true);
  assert.equal(getReviewEntry('data-centers', 'TABS2025007641')?.decision, 'hide');
  // Real DC shell with incidental office language still matches
  assert.equal(matchesSmartList({
    project_name: 'CyrusOne DFW10 | Shell & Upfit',
    facility_name: 'DFW10',
    scope_of_work: 'New Construction, single-story Data Center with two-story office component.',
  }, list), true);
  // Campus that mentions a guard house in scope must still match
  assert.equal(matchesSmartList({
    project_name: 'Project Plaid',
    facility_name: 'Llano',
    scope_of_work: 'New approx. 479,721 SF 1 story Data Hall. New approx. 300 SF Guard House.',
  }, list), true);
});
