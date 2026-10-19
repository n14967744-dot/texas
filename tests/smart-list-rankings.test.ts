import test from 'node:test';
import assert from 'node:assert/strict';
import { RANKINGS, getRanking, getRankingEntry, curatedProjectNumbers, rankOf, reportRankings, hiddenReasonCounts } from '../lib/smart-list-rankings.ts';
import { getSmartList, matchesSmartList } from '../lib/smart-lists.ts';
import { getReviewEntry, hiddenProjectNumbers } from '../lib/smart-list-review.ts';
import { buildWhere, parseFilters } from '../lib/query.ts';
import { browserDefaults } from '../lib/browser-defaults.ts';
import { buildProjectSearchParams } from '../lib/project-params.ts';
import { getOfficeBranch } from '../lib/offices.ts';
import { distanceToOffice } from '../lib/geo.ts';

test('every ranking is registered to a curated smart list with contiguous unique ranks', () => {
  for (const ranking of RANKINGS) {
    const list = getSmartList(ranking.listId);
    assert.ok(list?.curated, `${ranking.listId} must be a curated smart list`);
    const ranks = ranking.ranked.map((e) => e.rank).sort((a, b) => a - b);
    assert.deepEqual(ranks, ranks.map((_, i) => i + 1));
    const nums = curatedProjectNumbers(ranking.listId);
    assert.equal(new Set(nums).size, nums.length, 'ranked and hidden must not overlap');
    for (const entry of ranking.ranked) {
      assert.match(entry.projectNumber, /^TABS\d+$/);
      assert.ok(['hot', 'warm', 'pipeline'].includes(entry.tier));
      assert.ok(entry.note.length > 10);
    }
    for (const hidden of ranking.hidden) assert.ok(hidden.reason.length > 3);
  }
});

test('bryan-priority: ranked rows are tier-ordered and within 20 mi of Bryan', () => {
  const ranking = getRanking('bryan-priority')!;
  const order = { hot: 0, warm: 1, pipeline: 2 } as const;
  const sorted = [...ranking.ranked].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < sorted.length; i += 1) assert.ok(order[sorted[i - 1].tier] <= order[sorted[i].tier]);
  const bryan = getOfficeBranch('bryan')!;
  for (const n of curatedProjectNumbers('bryan-priority')) {
    const hit = distanceToOffice(n, bryan);
    assert.ok(hit, `${n} needs a geocode`);
    assert.ok(hit!.distanceMi <= 20, `${n} is ${hit!.distanceMi} mi`);
  }
});

test('ranking hides flow through the existing review/hide mechanism', () => {
  const ranking = getRanking('bryan-priority')!;
  const hidden = ranking.hidden[0];
  assert.equal(getReviewEntry('bryan-priority', hidden.projectNumber)?.decision, 'hide');
  assert.ok(hiddenProjectNumbers('bryan-priority').includes(hidden.projectNumber));
  const top = ranking.ranked.find((e) => e.rank === 1)!;
  assert.equal(getReviewEntry('bryan-priority', top.projectNumber), undefined);
  assert.equal(getRankingEntry('bryan-priority', top.projectNumber)?.rank, 1);
  assert.equal(rankOf('bryan-priority', hidden.projectNumber), Number.POSITIVE_INFINITY);
  // data-centers hides are unaffected
  assert.ok(hiddenProjectNumbers('data-centers').includes('TABS2025007641'));
});

test('curated list SQL uses membership + hidden exclusion, not keyword regex', () => {
  const filters = parseFilters(new URLSearchParams({ list: 'bryan-priority', office: 'bryan', sort: 'rank', direction: 'asc', upcoming: '0', scope: 'radius', radius: '60' }));
  const { where, params } = buildWhere(filters, null, '2026-10-19');
  assert.ok(where.includes('project_number IN ('));
  assert.ok(where.includes('project_number NOT IN ('));
  assert.equal(where.includes('~*'), false);
  const top = getRanking('bryan-priority')!.ranked[0].projectNumber;
  assert.ok(params.includes(top));
  assert.ok(matchesSmartList({ project_number: top }, getSmartList('bryan-priority')!));
  assert.equal(matchesSmartList({ project_number: 'TABS0000000000' }, getSmartList('bryan-priority')!), false);
});

test('rank sort is only valid on ranked lists', () => {
  assert.throws(() => parseFilters(new URLSearchParams({ sort: 'rank' })));
  assert.throws(() => parseFilters(new URLSearchParams({ list: 'data-centers', sort: 'rank' })));
  assert.equal(parseFilters(new URLSearchParams({ list: 'bryan-priority', sort: 'rank' })).sort, 'rank');
});

test('bryan-priority defaults: Bryan office, 20 mi radius, rank ascending', () => {
  const defaults = browserDefaults('bryan-priority');
  assert.equal(defaults.office, 'bryan');
  assert.equal(defaults.scope, 'radius');
  assert.equal(defaults.radius, 20);
  assert.equal(defaults.sort, 'rank');
  assert.equal(defaults.direction, 'asc');
  const params = new URLSearchParams(buildProjectSearchParams(defaults, { listId: 'bryan-priority' }));
  assert.equal(params.get('office'), 'bryan');
  assert.equal(params.get('sort'), 'rank');
  assert.equal(params.get('scope'), 'radius');
  assert.equal(params.get('list'), 'bryan-priority');
  assert.equal(params.get('radius'), '20');
  assert.equal(parseFilters(params).radius, 20);
  // data-centers keeps its All Texas default
  assert.equal(browserDefaults('data-centers').office, 'texas');
  assert.equal(browserDefaults('data-centers').radius, 60);
});

test('report metadata is consistent with the ranking snapshot', () => {
  const ranking = getRanking('bryan-priority')!;
  const report = ranking.report!;
  assert.ok(report, 'bryan-priority has report metadata');
  assert.equal(report.reviewedCount, ranking.ranked.length + ranking.hidden.length);
  assert.ok(report.method.length > 0 && report.assumptions.length > 0);
  assert.ok(reportRankings().some((r) => r.listId === 'bryan-priority'));
});

test('hidden reasons are grouped, duplicates collapse, totals match', () => {
  const ranking = getRanking('bryan-priority')!;
  const groups = hiddenReasonCounts('bryan-priority');
  assert.equal(groups.reduce((sum, g) => sum + g.count, 0), ranking.hidden.length);
  assert.equal(groups.filter((g) => g.reason.startsWith('Duplicate')).length <= 1, true);
  for (let i = 1; i < groups.length; i++) assert.ok(groups[i - 1].count >= groups[i].count);
  assert.deepEqual(hiddenReasonCounts('nope'), []);
});

test('bryan-priority ranks are contiguous 1..N and hidden rows are within 20 mi', () => {
  const ranking = getRanking('bryan-priority')!;
  const ranks = ranking.ranked.map((e) => e.rank).sort((a, b) => a - b);
  ranks.forEach((r, i) => assert.equal(r, i + 1));
  const bryan = getOfficeBranch('bryan')!;
  for (const h of ranking.hidden) assert.ok(distanceToOffice(h.projectNumber, bryan)!.distanceMi <= 20, h.projectNumber);
  assert.equal(ranking.report!.radiusMi, 20);
});
