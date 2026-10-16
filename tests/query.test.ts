import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilters, buildWhere, businessToday } from '../lib/query.ts';
import { formatDate, safeSourceLink } from '../lib/format.ts';
test('search text is bound, wildcard characters escaped, and territory always applied', () => {
  const injection = "%_' OR 1=1 --";
  const f = parseFilters(new URLSearchParams({ q: injection, county: 'Brazos', status: 'Review Complete' }));
  const q = buildWhere(f, ['Brazos'], '2026-10-03');
  assert.ok(q.where.startsWith('location_county IN ($1)'));
  assert.ok(!q.where.includes(injection));
  assert.equal(q.params[0], 'Brazos');
  assert.equal(q.params[1], "%\\%\\_' OR 1=1 --%");
  assert.ok(q.params.includes('Review Complete'));
});
test('sort injection, prototype keys, invalid dates and pagination are rejected', () => {
  for (const value of ['completion_date; DROP TABLE projects', 'toString', '__proto__']) assert.throws(() => parseFilters(new URLSearchParams({ sort: value })));
  for (const p of [{ completionFrom: '2026-02-30' }, { completionFrom: '2026-11-01', completionTo: '2026-10-01' }, { page: '-1' }, { pageSize: '100000' }, { direction: 'desc; SELECT 1' }]) assert.throws(() => parseFilters(new URLSearchParams(p)));
});
test('saved views use inclusive calendar boundaries and six calendar months', () => {
  const recent = buildWhere(parseFilters(new URLSearchParams({ view: 'recent' })), ['Bell'], '2026-10-03');
  assert.ok(recent.where.includes('::date - 29'));
  assert.equal(recent.params.at(-1), '2026-10-03');
  const soon = buildWhere(parseFilters(new URLSearchParams({ view: 'soon' })), ['Bell'], '2026-10-03');
  assert.ok(soon.where.includes("INTERVAL '6 months'"));
});
test('business day respects Chicago timezone and dates do not shift a day', () => {
  assert.equal(businessToday(new Date('2026-10-03T02:00:00Z')), '2026-10-02');
  assert.equal(formatDate('2026-10-03'), 'Oct 3, 2026');
  assert.equal(formatDate('2026-09-29 05:59:49.667704+00'), 'Sep 29, 2026');
});
test('source links only permit HTTPS TDLR addresses', () => {
  assert.ok(safeSourceLink('https://www.tdlr.texas.gov/TABS/Projects/TABS2027001470'));
  for (const s of ['javascript:alert(1)', 'https://tdlr.texas.gov.evil.example', 'https://evil.example', 'http://tdlr.texas.gov']) assert.equal(safeSourceLink(s), null);
});
