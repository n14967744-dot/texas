import test from 'node:test';
import assert from 'node:assert/strict';
import { serverModule, modulePath } from './helpers/load-server-module.mjs';

const request = (query = '') => ({ nextUrl: new URL(`http://local/api/projects?office=bryan&${query}`) });

test('GPS list responses are private/no-store and invalid coordinates never reach the loader', async () => {
  const seen = [];
  const { GET } = serverModule('app/api/projects/route.ts', {
    [modulePath('lib/projects.ts')]: { loadProjectList: async (filters, here) => {
      seen.push({ filters, here });
      return { projects: [{ here_mi: here ? 12 : null }] };
    } },
  });
  const publicResponse = await GET(request());
  assert.equal(publicResponse.status, 200);
  assert.match(publicResponse.headers.get('Cache-Control'), /public/);
  const response = await GET(request('lat=30.5&lng=-96.2&sort=here&direction=asc'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(seen[1].here, { lat: 30.5, lng: -96.2 });
  assert.equal((await response.json()).projects[0].here_mi, 12);
  for (const query of ['lat=30', 'lat=0&lng=0', 'lat=NaN&lng=-96', 'sort=here']) {
    const invalid = await GET(request(query));
    assert.equal(invalid.status, 400);
    assert.match(invalid.headers.get('Cache-Control'), /no-store/);
    assert.match((await invalid.json()).error, /lat|lng/);
  }
  assert.equal(seen.length, 2);
});

test('map route validates GPS and returns private/no-store responses with truncation metadata', async () => {
  let calls = 0;
  const { GET } = serverModule('app/api/projects/map/route.ts', {
    [modulePath('lib/projects.ts')]: { loadProjectMap: async (filters, here) => {
      calls++;
      assert.equal(filters.hidden, true);
      assert.deepEqual(here, { lat: 30.5, lng: -96.2 });
      return { projects: [], total: 2100, truncated: true };
    } },
  });
  const response = await GET(request('hidden=1&lat=30.5&lng=-96.2'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal((await response.json()).truncated, true);
  assert.equal((await GET(request('lat=100&lng=-96'))).status, 400);
  assert.equal((await GET(request('sort=here'))).status, 400);
  assert.equal(calls, 1);
});

test('list loader returns rounded here_mi or null and binds GPS only in the request queries', async () => {
  let calls = 0;
  const { loadProjectList } = serverModule('lib/projects.ts', {
    [modulePath('lib/db.ts')]: { readQueries: async (queries) => {
      calls++;
      if (queries.length === 2) return [{ rows: [{ total: 2 }] }, { rows: [] }];
      assert.ok(queries[0].params.includes(30.7));
      assert.ok(queries[0].params.includes(-96.4));
      assert.match(queries[0].query, /here_mi/);
      assert.match(queries[0].query, /ORDER BY here_mi ASC NULLS LAST/);
      assert.doesNotMatch(queries[0].query, /30\.7|-96\.4/);
      return [{ rows: [
        { project_number: 'TABS1', here_mi: '12.24', distance_mi: '8.03', geo_precision: 'city' },
        { project_number: 'TABS2', here_mi: null, distance_mi: null, geo_precision: 'none' },
      ] }];
    } },
  });
  const { FILTER_DEFAULTS } = serverModule('lib/query.ts');
  const payload = await loadProjectList({ ...FILTER_DEFAULTS, sort: 'here', direction: 'asc' }, { lat: 30.7, lng: -96.4 });
  assert.equal(calls, 2);
  assert.equal(payload.projects[0].here_mi, 12.2);
  assert.equal(payload.projects[1].here_mi, null);
  assert.equal(payload.projects[0].lat, undefined);
  assert.equal(payload.projects[0].lng, undefined);
});

test('map loader shares filters and sort, ignores list pagination, and applies field-note timing overrides', async () => {
  const observed = new Date().toISOString();
  const { loadProjectMap } = serverModule('lib/projects.ts', {
    [modulePath('lib/db.ts')]: { readQueries: async (queries) => {
      assert.equal(queries.length, 2);
      for (const { query, params } of queries) {
        assert.match(query, /LEFT JOIN leads\.project_overlay/);
        assert.match(query, /overlay_hidden = false/);
        assert.ok(params.includes('Waco'));
      }
      assert.match(queries[1].query, /ORDER BY here_mi ASC NULLS LAST, project_number ASC LIMIT 2000/);
      assert.doesNotMatch(queries[1].query, /OFFSET|scope_of_work,/);
      return [{ rows: [{ total: '2001' }] }, { rows: [{
        project_number: 'TABS123', project_name: 'Example', facility_name: null,
        location_city: 'Waco', eff_lat: '31.5', eff_lng: '-97.1', geo_precision: 'city',
        site_state: 'framing', site_state_observed_at: observed,
        completion_date: '2020-01-01',
      }] }];
    } },
  });
  const { FILTER_DEFAULTS } = serverModule('lib/query.ts');
  const payload = await loadProjectMap({ ...FILTER_DEFAULTS, city: 'Waco', sort: 'here', direction: 'asc', page: 5, pageSize: 10 }, { lat: 31.6, lng: -97.2 });
  assert.equal(payload.total, 2001);
  assert.equal(payload.truncated, true);
  assert.equal(payload.projects[0].lat, 31.5);
  assert.equal(payload.projects[0].precision, 'city');
  assert.equal(payload.projects[0].timing_tone, 'seen');
  assert.match(payload.projects[0].timing_label, /^Framing · seen /);
  assert.equal(payload.projects[0].timing_tag, null);
  assert.equal(payload.projects[0].site_state, undefined);
});
