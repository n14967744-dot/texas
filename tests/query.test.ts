import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFilters, buildWhere, businessToday, FILTER_DEFAULTS } from '../lib/query.ts';
import { formatDate, safeHttpsUrl, safeSourceLink } from '../lib/format.ts';
import { cityNameKey, countyNameKey } from '../lib/location-sql.ts';

const today = '2026-10-19';

test('search text is bound and wildcard characters are escaped', () => {
  const injection = "%_' OR 1=1 --";
  const filters = parseFilters(new URLSearchParams({ q: injection, county: 'Brazos', office: 'bryan' }));
  const query = buildWhere(filters, today);
  assert.ok(!query.where.includes(injection));
  assert.ok(query.where.includes('owner_phone ILIKE'));
  assert.ok(query.where.includes("ESCAPE E'\\\\'"));
  assert.equal(query.params[0], 30.642469);
  assert.equal(query.params[1], -96.354857);
  assert.equal(query.params[2], "%\\%\\_' OR 1=1 --%");
  assert.ok(query.params.includes('Brazos'));
  assert.ok(query.from.includes('3958.8'));
  assert.ok(query.from.includes('leads.project_geocodes'));
  assert.ok(query.from.includes('leads.tx_place_centroids'));
  assert.equal(query.from.includes(' CITY'), false);
});

test('unknown locations are outside the radius unless the toggle is on', () => {
  const hidden = buildWhere(parseFilters(new URLSearchParams({ office: 'bryan' })), today);
  assert.match(hidden.geoClause, /geo_precision <> 'none'/);
  assert.equal(hidden.geoClause.includes("geo_precision = 'none'"), false);
  const shown = buildWhere(parseFilters(new URLSearchParams({ office: 'bryan', unknown: '1' })), today);
  assert.match(shown.geoClause, /geo_precision = 'none'/);
});

test('All Texas ignores radius and uses the nearest visible office', () => {
  const query = buildWhere(parseFilters(new URLSearchParams({ office: 'texas', radius: '10' })), today);
  assert.equal(query.geoClause, 'TRUE');
  assert.match(query.from, /LEAST\(/);
  assert.ok(query.params.includes(30.642469));
  assert.ok(query.params.includes(31.529589));
});

test('date presets use inclusive bound dates, not INTERVAL', () => {
  const query = buildWhere(parseFilters(new URLSearchParams({ office: 'bryan', finish: 'next6mo' })), today);
  assert.ok(query.params.includes('2026-10-19'));
  assert.ok(query.params.includes('2027-04-19'));
  assert.match(query.where, /NULLIF\(completion_date::text, ''\)::date >= /);
  assert.equal(query.where.includes('INTERVAL'), false);
  const reached = buildWhere(parseFilters(new URLSearchParams({ office: 'bryan', start: 'reached' })), today);
  assert.match(reached.where, /NULLIF\(start_date::text, ''\)::date <= /);
});

test('a cost bound can opt in to projects with no listed cost', () => {
  const query = buildWhere(parseFilters(new URLSearchParams({ office: 'bryan', costMin: '1000', noCost: '1' })), today);
  assert.match(query.where, /estimated_cost IS NULL/);
  const open = buildWhere(parseFilters(new URLSearchParams({ office: 'bryan', noCost: '1' })), today);
  assert.equal(open.where.includes('estimated_cost'), false);
});

test('presets win over custom dates and reversed ranges throw', () => {
  const filters = parseFilters(new URLSearchParams({ start: 'next30', startFrom: '2020-01-01', startTo: '2020-02-01' }));
  assert.equal(filters.startPreset, 'next30');
  assert.equal(filters.startFrom, '');
  assert.equal(filters.startTo, '');
  assert.throws(() => parseFilters(new URLSearchParams({ startFrom: '2026-11-01', startTo: '2026-10-01' })));
  assert.throws(() => parseFilters(new URLSearchParams({ finishFrom: '2026-12-01', finishTo: '2026-01-01' })));
});

test('sort injection, prototype keys, invalid dates and pagination are rejected', () => {
  for (const value of ['completion_date; DROP TABLE projects', 'toString', '__proto__', 'stage']) {
    assert.throws(() => parseFilters(new URLSearchParams({ sort: value })));
  }
  for (const params of [
    { startFrom: '2026-02-30' },
    { page: '-1' },
    { pageSize: '100000' },
    { direction: 'desc; SELECT 1' },
    { office: 'temple' },
    { office: 'all' },
    { list: 'bryan-priority', office: 'waco' },
    { hidden: '1' },
    { sort: 'rank' },
    { radius: '0' },
    { radius: '500.001' },
  ]) assert.throws(() => parseFilters(new URLSearchParams(params)));
});

test('place name keys keep City and only strip a county suffix', () => {
  assert.equal(cityNameKey('Missouri City'), 'MISSOURI CITY');
  assert.equal(cityNameKey('Haltom City'), 'HALTOM CITY');
  assert.equal(countyNameKey('Tom Green'), 'TOM GREEN');
  assert.equal(countyNameKey('De Witt'), 'DE WITT');
  assert.equal(countyNameKey('Brazos County'), 'BRAZOS');
});

test('business day respects Chicago timezone and dates do not shift a day', () => {
  assert.equal(businessToday(new Date('2026-10-03T02:00:00Z')), '2026-10-02');
  assert.equal(businessToday(new Date('2026-01-15T05:30:00Z')), '2026-01-14');
  assert.equal(businessToday(new Date('2026-01-15T06:30:00Z')), '2026-01-15');
  assert.equal(formatDate('2026-10-03'), 'Oct 3, 2026');
  assert.equal(formatDate('2026-09-29 05:59:49.667704+00'), 'Sep 29, 2026');
});

test('source links only permit HTTPS TDLR addresses; research links are any HTTPS URL', () => {
  assert.ok(safeSourceLink('https://www.tdlr.texas.gov/TABS/Projects/TABS2027001470'));
  for (const value of ['javascript:alert(1)', 'https://tdlr.texas.gov.evil.example', 'https://evil.example', 'http://tdlr.texas.gov']) {
    assert.equal(safeSourceLink(value), null);
  }
  assert.equal(safeHttpsUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeHttpsUrl('http://example.com'), null);
  assert.equal(FILTER_DEFAULTS.office, 'bryan');
  assert.equal(FILTER_DEFAULTS.radius, 25);
});
