import test from 'node:test';
import assert from 'node:assert/strict';
import { serverModule, modulePath } from './helpers/load-server-module.mjs';

function configureToken(t) {
  const previous = process.env.AGENT_API_TOKEN;
  process.env.AGENT_API_TOKEN = 'test-only-token';
  t.after(() => { if (previous === undefined) delete process.env.AGENT_API_TOKEN; else process.env.AGENT_API_TOKEN = previous; });
}
const request = (method, body, token = 'test-only-token') => new Request('http://local/api/field-notes?project=TABS123', {
  method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const note = { id: '10', project_number: 'TABS123', observed_at: '2026-10-20T12:00:00Z', superseded_at: null, superseded: false };

function routes(readQueries, writeQueries, entry = 'app/api/field-notes/route.ts') {
  return serverModule(entry, {
    [modulePath('lib/db.ts')]: { readQueries },
    [modulePath('lib/write.ts')]: { writeQueries },
  });
}

test('auth rejects unset, empty, malformed, incorrect, and unequal-length bearer values', (t) => {
  configureToken(t);
  const { isAgentAuthorized } = serverModule('lib/agent-auth.ts');
  assert.equal(isAgentAuthorized(request('GET')), true);
  for (const token of ['', 'wrong', 'x'.repeat(100), 'test-only-tokeN']) assert.equal(isAgentAuthorized(request('GET', undefined, token)), false);
  for (const authorization of ['', 'Basic test-only-token', 'Bearer test-only-token extra']) {
    assert.equal(isAgentAuthorized(new Request('http://local', { headers: { authorization } })), false);
  }
  for (const token of [undefined, '', ' ']) {
    if (token === undefined) delete process.env.AGENT_API_TOKEN; else process.env.AGENT_API_TOKEN = token;
    assert.equal(isAgentAuthorized(request('GET')), false);
  }
});

test('every notes handler authenticates before DB access and sends no-store JSON errors', async (t) => {
  configureToken(t);
  const unexpected = () => assert.fail('Database must not be reached');
  const { GET, POST } = routes(unexpected, unexpected);
  const { DELETE } = routes(unexpected, unexpected, 'app/api/field-notes/[id]/route.ts');
  for (const response of [await GET(request('GET', undefined, 'wrong')), await POST(request('POST', {}, 'wrong')),
    await DELETE(request('DELETE', undefined, 'wrong'), { params: Promise.resolve({ id: '10' }) })]) {
    assert.equal(response.status, 401);
    assert.match(response.headers.get('Cache-Control'), /no-store/);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('POST creates once, retries return original note, and overlay belongs to that note', async (t) => {
  configureToken(t);
  let writes = 0;
  const overlay = { project_number: 'TABS123', site_state: 'framing', hidden: false };
  const read = async (queries) => queries.map(({ query, params }) => {
    if (query.includes('public.projects')) return { rows: [{ project_number: params[0] }] };
    if (query.includes('WHERE request_id')) return { rows: [note] };
    assert.equal(params[0], note.project_number);
    return { rows: [overlay] };
  });
  const write = async ([query]) => {
    assert.match(query.query, /ON CONFLICT \(request_id\) DO NOTHING/);
    assert.ok(query.params.includes("rep's words"));
    assert.doesNotMatch(query.query, /rep's words/);
    return [{ rows: writes++ ? [] : [note] }];
  };
  const { POST } = routes(read, write);
  const body = { project_number: 'TABS123', raw_text: "rep's words", request_id: 'retry-key' };
  const first = await POST(request('POST', body));
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), { note, overlay });
  const retry = await POST(request('POST', { ...body, project_number: 'TABS999' }));
  assert.equal(retry.status, 200);
  assert.deepEqual(await retry.json(), { note, overlay });
});

test('validation and missing projects never invoke writes; database failures are sanitized', async (t) => {
  configureToken(t);
  const { POST, GET } = routes(async () => [{ rows: [] }], () => assert.fail('No write expected'));
  assert.equal((await POST(request('POST', { project_number: 'TABS123', site_state: 'built' }))).status, 400);
  assert.equal((await POST(new Request('http://local', { method: 'POST', headers: { Authorization: 'Bearer test-only-token' }, body: '{' }))).status, 400);
  assert.equal((await POST(request('POST', { project_number: 'TABS123' }))).status, 404);
  assert.equal((await GET(new Request('http://local/api/field-notes', { headers: { Authorization: 'Bearer test-only-token' } }))).status, 400);
  const broken = routes(async () => { throw new Error('sensitive failure'); }, () => {});
  const response = await broken.GET(request('GET'));
  assert.equal(response.status, 503);
  assert.doesNotMatch(JSON.stringify(await response.json()), /sensitive/);
});

test('GET includes superseded history, orders numeric IDs, and allows a null overlay', async (t) => {
  configureToken(t);
  const undone = { ...note, superseded: true, superseded_at: '2026-10-20T15:00:00Z' };
  const { GET } = routes(async (queries) => {
    assert.match(queries[0].query, /ORDER BY observed_at DESC, n.id DESC/);
    assert.doesNotMatch(queries[0].query, /superseded_at IS NULL/);
    return [{ rows: [undone] }, { rows: [] }];
  }, () => {});
  const response = await GET(request('GET'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { notes: [undone], overlay: null });
});

test('DELETE uses async params, soft-deletes idempotently, validates IDs, and returns 404', async (t) => {
  configureToken(t);
  let writes = 0;
  const undone = { ...note, superseded: true, superseded_at: '2026-10-20T15:00:00Z' };
  const { DELETE } = routes(async () => [{ rows: [] }], async ([query]) => {
    writes++;
    assert.match(query.query, /superseded_at = COALESCE\(superseded_at, now\(\)\)/);
    assert.doesNotMatch(query.query, /DELETE FROM/i);
    return [{ rows: query.params[0] === '404' ? [] : [undone] }];
  }, 'app/api/field-notes/[id]/route.ts');
  const remove = (id) => DELETE(request('DELETE'), { params: Promise.resolve({ id }) });
  for (const id of ['0', '-1', 'abc', '9223372036854775808']) assert.equal((await remove(id)).status, 400);
  assert.equal(writes, 0);
  for (let i = 0; i < 2; i++) {
    const response = await remove('10');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { note: undone, overlay: null });
  }
  assert.equal((await remove('404')).status, 404);
});

test('write helper uses a parameterized Neon transaction without read-only header', async (t) => {
  const previousConnection = process.env.DATABASE_URL;
  const previousFetch = globalThis.fetch;
  process.env.DATABASE_URL = 'postgresql://example:fake@ep-test.neon.tech/test';
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousConnection === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousConnection;
  });
  const queries = [{ query: 'INSERT INTO leads.field_notes(project_number) VALUES ($1)', params: ['TABS123'] }];
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://ep-test.neon.tech/sql');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.headers['Neon-Batch-Read-Only'], undefined);
    assert.deepEqual(JSON.parse(options.body), { queries });
    return Response.json({ results: [{ rows: [] }] });
  };
  const { writeQueries } = serverModule('lib/write.ts');
  assert.deepEqual(await writeQueries(queries), [{ rows: [] }]);
});

test('list and modal read loaders apply sightings and tolerate a missing overlay', async () => {
  const observed = new Date().toISOString();
  const project = { project_number: 'TABS123', site_state: 'framing', site_state_observed_at: observed,
    completion_date: '2020-01-01', overlay: { site_state: 'framing' } };
  let mode = 'list';
  const { loadProjectList, loadProjectDetail } = serverModule('lib/projects.ts', {
    [modulePath('lib/db.ts')]: {
      readQueries: async (queries) => {
        if (mode === 'detail' || mode === 'empty') {
          assert.match(queries[0].query, /LEFT JOIN leads.project_overlay/);
          assert.match(queries[2].query, /superseded_at IS NULL ORDER BY observed_at DESC, n.id DESC/);
          return [{ rows: [{ ...project, ...(mode === 'empty' ? { site_state: null, site_state_observed_at: null, overlay: null } : {}) }] },
            { rows: [] }, { rows: mode === 'empty' ? [] : [note] }];
        }
        if (queries.length === 2) return [{ rows: [{ total: 1 }] }, { rows: [] }];
        assert.match(queries[0].query, /LEFT JOIN leads.project_overlay/);
        assert.match(queries[0].query, /overlay_hidden = false/);
        return [{ rows: [project] }];
      },
    },
  });
  const { FILTER_DEFAULTS } = serverModule('lib/query.ts');
  const list = await loadProjectList(FILTER_DEFAULTS);
  assert.match(list.projects[0].timing_label, /^Framing · seen /);
  assert.equal(list.projects[0].timing_tag, null);
  mode = 'detail';
  const detail = await loadProjectDetail('TABS123');
  assert.equal(detail.timing_tone, 'seen');
  assert.deepEqual(detail.field_notes, [note]);
  mode = 'empty';
  const empty = await loadProjectDetail('TABS123');
  assert.equal(empty.overlay, null);
  assert.deepEqual(empty.field_notes, []);
  assert.equal(empty.timing_tag, 'Needs drive-by');
});
