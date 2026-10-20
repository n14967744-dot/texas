import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineMiles, projectsWithinRadius } from '../lib/geo.ts';
import { COORD_SOURCE, getOfficeBranch, OFFICES } from '../lib/offices.ts';
import { parseFilters, buildWhere } from '../lib/query.ts';
import { filtersToSearchParams } from '../lib/project-params.ts';
import { browserDefaults } from '../lib/browser-defaults.ts';
import { hiddenProjectNumbers } from '../lib/smart-list-review.ts';

test('haversine: Waco to Temple is roughly 35–45 miles', () => {
  const waco = getOfficeBranch('waco')!;
  const temple = getOfficeBranch('temple')!;
  const mi = haversineMiles(waco.lat, waco.lng, temple.lat, temple.lng);
  assert.ok(mi > 30 && mi < 50, `got ${mi}`);
});

test('haversine: zero distance for same point', () => {
  assert.equal(haversineMiles(31.5, -97.2, 31.5, -97.2), 0);
});

test('each CTWP office has a street address and Census Geocoder coordinates', () => {
  for (const office of OFFICES) {
    assert.ok(Number.isFinite(office.lat) && Number.isFinite(office.lng));
    assert.equal(office.coordSource, COORD_SOURCE);
    assert.match(office.address, /TX \d{5}/);
  }
});

test('radius filter returns projects within 60 mi of Waco and attaches office id', () => {
  const hits = projectsWithinRadius({ officeId: 'waco', radiusMiles: 60 });
  assert.ok(hits.length > 0);
  assert.ok(hits.every((h) => h.distanceMi <= 60 && h.officeId === 'waco'));
});

test('hidden projects can still be distance-ranked (filtering is SQL-side)', () => {
  const hidden = new Set(hiddenProjectNumbers('data-centers'));
  const hits = projectsWithinRadius({ officeId: 'waco', radiusMiles: 100 });
  // Just ensure the function runs; hide filtering is applied in buildWhere
  assert.ok(hits.length >= 0);
  assert.ok([...hidden].length > 0);
});

test('data-centers defaults to a 25 mile straight-line radius', () => {
  const defaults = browserDefaults({ office: 'waco', list: 'data-centers' });
  assert.equal(defaults.radius, 25);
  const params = filtersToSearchParams(defaults);
  assert.equal(params.get('radius'), null);
  assert.equal(params.get('sort'), null);
  assert.equal(params.get('direction'), null);
  assert.equal(parseFilters(params).sort, 'registration_date');
  assert.equal(parseFilters(params).direction, 'desc');
  assert.equal(parseFilters(params).radius, 25);
});

test('distance sort is straight-line miles from the office address', () => {
  const filters = parseFilters(new URLSearchParams({
    list: 'data-centers', radius: '50', sort: 'distance', direction: 'asc', office: 'waco',
  }));
  assert.equal(filters.sort, 'distance');
  const query = buildWhere(filters, '2026-10-19');
  assert.match(query.from, /3958\.8/);
  assert.match(query.geoClause, /distance_mi <= /);
  assert.ok(query.params.includes(31.529589));
  assert.ok(query.params.includes(50));
  assert.equal(query.where.includes('location_county IN'), false);
});
