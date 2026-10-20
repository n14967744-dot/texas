import test from 'node:test';
import assert from 'node:assert/strict';
import { LocationError, parseHereLocation, withHereLocation } from '../lib/here-location.ts';
import { buildWhere, FILTER_DEFAULTS, parseFilters } from '../lib/query.ts';
import { filtersToQueryString } from '../lib/project-params.ts';
import { haversineMiles } from '../lib/geo.ts';
import { distanceLabel, hereDistanceLabel } from '../lib/distance-label.ts';
import { projectOrderBy } from '../lib/project-order.ts';
import { capMapResults, MAP_LIMIT } from '../lib/map-results.ts';
import { canonicalizeBrowseParams } from '../lib/browse-state.ts';

test('location is optional; both finite coordinates within the inclusive Texas margin are required', () => {
  assert.equal(parseHereLocation(new URLSearchParams()), null);
  for (const [lat, lng] of [[25, -107.5], [37.5, -93], [30.642469, -96.354857]]) {
    assert.deepEqual(parseHereLocation(new URLSearchParams({ lat: String(lat), lng: String(lng) })), { lat, lng });
  }
  for (const params of [
    { lat: '30' }, { lng: '-96' }, { lat: '', lng: '-96' }, { lat: '30', lng: ' ' },
    { lat: 'NaN', lng: '-96' }, { lat: 'Infinity', lng: '-96' }, { lat: '30', lng: '-Infinity' },
    { lat: '24.99', lng: '-96' }, { lat: '37.51', lng: '-96' },
    { lat: '30', lng: '-107.51' }, { lat: '30', lng: '-92.99' }, { lat: 'bad', lng: '-96' },
  ]) assert.throws(() => parseHereLocation(new URLSearchParams(params)), LocationError);
  assert.throws(() => parseHereLocation(new URLSearchParams('lat=30&lat=31&lng=-96')), LocationError);
});

test('GPS only enters the API query, and page canonicalization removes it', () => {
  const filters = parseFilters(new URLSearchParams({ lat: '30.5', lng: '-96.2', sort: 'here', direction: 'asc' }));
  const shareable = filtersToQueryString(filters);
  assert.doesNotMatch(shareable, /lat=|lng=/);
  const request = new URLSearchParams(withHereLocation(shareable, { lat: 30.5, lng: -96.2 }));
  assert.equal(request.get('lat'), '30.5');
  assert.equal(request.get('lng'), '-96.2');
  assert.equal(request.get('sort'), 'here');
  assert.doesNotMatch(withHereLocation(request.toString(), null), /lat=|lng=/);
  assert.equal(canonicalizeBrowseParams(new URLSearchParams('office=bryan&lat=30.5&lng=-96.2'), null), '/?office=bryan');
});

test('here distance uses the same SQL haversine and effective point as office distance, with null guards', () => {
  const base = buildWhere(FILTER_DEFAULTS, '2026-10-20');
  const here = buildWhere(FILTER_DEFAULTS, '2026-10-20', { lat: 30.7, lng: -96.4 });
  assert.match(base.from, /NULL::float8 END AS here_mi/);
  assert.match(here.from, /base\.eff_lat IS NULL OR base\.eff_lng IS NULL THEN NULL ELSE \(3958\.8/);
  assert.equal(here.from.match(/3958\.8/g)?.length, 2);
  assert.ok(here.params.includes(30.7));
  assert.ok(here.params.includes(-96.4));
  assert.doesNotMatch(here.from, /30\.7|-96\.4/);
  assert.deepEqual(here.geoClause.replace(/\$\d+/g, '$n'), base.geoClause.replace(/\$\d+/g, '$n'));
  assert.equal(projectOrderBy({ sort: 'here', direction: 'asc' }, "''"), 'here_mi ASC NULLS LAST, project_number ASC');
  assert.equal(projectOrderBy({ sort: 'here', direction: 'desc' }, "''"), 'here_mi DESC NULLS LAST, project_number ASC');
  const texas = buildWhere({ ...FILTER_DEFAULTS, office: 'texas' }, '2026-10-20', { lat: 30.7, lng: -96.4 });
  assert.match(texas.from, /SELECT branch\.office_id FROM \(VALUES/);
  assert.ok(texas.params.includes('bryan'));
  assert.ok(texas.params.includes('waco'));
  assert.match(texas.from, /branch\.office_id LIMIT 1/);
});

test('haversine miles are symmetric, zero at the same point, and roughly 69 miles per latitude degree', () => {
  assert.equal(haversineMiles(30, -96, 30, -96), 0);
  const miles = haversineMiles(30, -96, 31, -96);
  assert.ok(miles > 69 && miles < 69.2);
  assert.equal(miles, haversineMiles(31, -96, 30, -96));
});

test('GPS labels round miles, preserve centroid markers, and never claim unknown coordinates are zero miles away', () => {
  assert.equal(hereDistanceLabel(12.2, 7.7, 'address', 'Bryan'), '12 mi from you · 8 mi from Bryan');
  assert.equal(hereDistanceLabel(0, 0, 'address', 'Waco'), '0 mi from you · 0 mi from Waco');
  for (const precision of ['city', 'county']) {
    assert.equal(hereDistanceLabel(12, 8, precision, 'Bryan'), '≈ 12 mi from you · ≈ 8 mi from Bryan');
  }
  assert.equal(hereDistanceLabel(null, null, 'none', 'Waco'), 'Distance from you unknown · Distance from Waco unknown');
  assert.match(hereDistanceLabel(NaN, Infinity, 'address', 'Waco'), /unknown.*unknown/);
  assert.equal(distanceLabel(8, 'address'), '8.0 mi straight-line');
  assert.equal(distanceLabel(8, 'city'), '≈ 8 mi · city center');
});

test('map cap handles empty, exact-cap and truncated results without changing order', () => {
  assert.deepEqual(capMapResults([], 0), { projects: [], total: 0, truncated: false });
  const rows = Array.from({ length: MAP_LIMIT + 2 }, (_, i) => i);
  assert.equal(capMapResults(rows.slice(0, MAP_LIMIT), MAP_LIMIT).truncated, false);
  const capped = capMapResults(rows, 2500);
  assert.equal(capped.truncated, true);
  assert.equal(capped.total, 2500);
  assert.deepEqual(capped.projects, rows.slice(0, MAP_LIMIT));
  assert.equal(capMapResults(rows.slice(0, MAP_LIMIT), 2500).truncated, true);
});
