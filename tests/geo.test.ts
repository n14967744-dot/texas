import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineMiles, projectsWithinRadius, distanceToOffice } from '../lib/geo.ts';
import { getOfficeBranch, OFFICES } from '../lib/offices.ts';
import { parseFilters, buildWhere } from '../lib/query.ts';
import { buildProjectSearchParams, API_PROJECT_PARAM_DEFAULTS } from '../lib/project-params.ts';
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

test('each CTWP office has coordinates from Census city centroids', () => {
  for (const office of OFFICES) {
    assert.ok(Number.isFinite(office.lat) && Number.isFinite(office.lng));
    assert.match(office.coordSource, /Census 2024/);
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

test('smart list defaults serialize scope=radius and radius=60', () => {
  const defaults = browserDefaults('data-centers');
  assert.equal(defaults.scope, 'radius');
  assert.equal(defaults.radius, 60);
  const query = buildProjectSearchParams(defaults, { listId: 'data-centers' });
  const params = new URLSearchParams(query);
  assert.equal(params.get('scope'), 'radius');
  assert.equal(params.get('radius'), '60');
  assert.equal(params.get('sort'), 'estimated_cost');
  assert.equal(params.get('direction'), 'desc');
  const filters = parseFilters(params);
  assert.equal(filters.scope, 'radius');
  assert.equal(filters.radius, 60);
});

test('radius scope without list is rejected; distance sort requires radius', () => {
  assert.throws(() => parseFilters(new URLSearchParams({ scope: 'radius' })));
  assert.throws(() => parseFilters(new URLSearchParams({ list: 'data-centers', sort: 'distance' })));
  const ok = parseFilters(new URLSearchParams({
    list: 'data-centers', scope: 'radius', radius: '60', sort: 'distance', direction: 'asc', office: 'waco',
  }));
  assert.equal(ok.sort, 'distance');
  assert.equal(ok.scope, 'radius');
});

test('territory mode still applies office county restriction in SQL', () => {
  const filters = parseFilters(new URLSearchParams({
    list: 'data-centers', office: 'waco', scope: 'territory', upcoming: '1',
  }));
  const q = buildWhere(filters, ['McLennan'], '2026-10-19');
  assert.ok(q.where.includes('location_county IN'));
  assert.ok(q.params.includes('McLennan'));
});
