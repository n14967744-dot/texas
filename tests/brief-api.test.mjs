import test from 'node:test';
import assert from 'node:assert/strict';
import { serverModule, modulePath } from './helpers/load-server-module.mjs';

function configureToken(t) {
  const previous = process.env.AGENT_API_TOKEN;
  process.env.AGENT_API_TOKEN = 'test-only-token';
  t.after(() => { if (previous === undefined) delete process.env.AGENT_API_TOKEN; else process.env.AGENT_API_TOKEN = previous; });
}
const request = (query = '', token = 'test-only-token') => new Request(`http://local/api/v1/brief${query}`, {
  headers: token == null ? {} : { authorization: `Bearer ${token}` },
});
const route = (readQueries) => serverModule('app/api/v1/brief/route.ts', { [modulePath('lib/db.ts')]: { readQueries } });

test('brief fails closed for missing/invalid bearer or unconfigured token before database access', async (t) => {
  configureToken(t);
  const { GET } = route(() => assert.fail('DB must not be reached'));
  for (const token of [null, '', 'wrong', 'test-only-token extra']) {
    const response = await GET(request('', token));
    assert.equal(response.status, 401);
    assert.match(response.headers.get('Cache-Control'), /no-store/);
  }
  for (const token of [undefined, '', ' ']) {
    if (token === undefined) delete process.env.AGENT_API_TOKEN; else process.env.AGENT_API_TOKEN = token;
    assert.equal((await GET(request())).status, 401);
  }
});

test('brief validates office before DB, defaults to Bryan, reads only and returns no-store JSON', async (t) => {
  configureToken(t);
  let reads = 0;
  const { GET } = route(async (queries) => {
    reads++;
    assert.equal(queries.length, 1);
    assert.match(queries[0].query, /^SELECT /);
    assert.ok(queries[0].params.includes(25));
    return [{ rows: [] }];
  });
  for (const office of ['bogus', 'texas', 'temple', '']) assert.equal((await GET(request(`?office=${office}`))).status, 400);
  assert.equal(reads, 0);
  for (const query of ['', '?office=waco']) {
    const response = await GET(request(query));
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Cache-Control'), /no-store/);
    assert.match(response.headers.get('Content-Type'), /application\/json/);
    const body = await response.json();
    assert.equal(body.office.id, query ? 'waco' : 'bryan');
    assert.deepEqual(body.drive_by.items, []);
    assert.equal(body.radius_mi, 25);
  }
});

test('brief sanitizes DB failures', async (t) => {
  configureToken(t);
  const { GET } = route(async () => { throw new Error('sensitive-connection'); });
  const response = await GET(request());
  assert.equal(response.status, 503);
  assert.match(response.headers.get('Cache-Control'), /no-store/);
  assert.deepEqual(await response.json(), { error: 'Unable to load daily brief.' });
});
