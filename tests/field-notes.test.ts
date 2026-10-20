import test from 'node:test';
import assert from 'node:assert/strict';
import { parseFieldNote, projectSighting, SITE_STATES, DISPOSITIONS } from '../lib/field-notes.ts';
import { timingInfo } from '../lib/timing.ts';
import { buildWhere, parseFilters } from '../lib/query.ts';
import { filtersToSearchParams } from '../lib/project-params.ts';

test('field notes normalize optional text and validate every enum', () => {
  const minimal = parseFieldNote({ project_number: 'TABS123', rep: ' Nick ', occupant_phone: ' ' });
  assert.equal(minimal.rep, 'Nick');
  assert.equal(minimal.occupant_phone, null);
  assert.equal(minimal.source, 'rep');
  assert.equal(minimal.observed_at, null);
  for (const site_state of SITE_STATES) assert.equal(parseFieldNote({ project_number: 'TABS123', site_state }).site_state, site_state);
  for (const disposition of DISPOSITIONS) assert.equal(parseFieldNote({ project_number: 'TABS123', disposition }).disposition, disposition);
  for (const value of [null, [], 'text', { project_number: null }, { project_number: 'bad number' },
    { project_number: 'a'.repeat(41) }, { site_state: 'built' }, { disposition: 'hide' }, { source: 'other' },
    { rep: 5 }, { rep: 'a'.repeat(201) }, { raw_text: 'a'.repeat(10001) },
    { occupant_name: 'a'.repeat(501) }, { occupant_contact_name: 'a'.repeat(201) },
    { occupant_phone: 'a'.repeat(101) }, { request_id: 'a'.repeat(201) }, { raw_text: '\0' }]) {
    assert.throws(() => parseFieldNote(value && typeof value === 'object' && !Array.isArray(value) ? { project_number: 'TABS123', ...value } : value));
  }
});

test('observation timestamps require real calendar dates and explicit offsets', () => {
  for (const observed_at of ['2026-10-20T14:30:00-05:00', '2026-10-21T04:00:00Z', '2026-10-20T14:30:00.123456+00:00']) {
    assert.equal(parseFieldNote({ project_number: 'TABS123', observed_at }).observed_at, observed_at);
  }
  for (const observed_at of ['', '2026-10-20', '2026-10-20T14:30:00', '2026-02-30T12:00:00Z', '2026-10-20T24:00:00Z', 'no']) {
    assert.throws(() => parseFieldNote({ project_number: 'TABS123', observed_at }));
  }
});

test('joined overlay uses its site-state timestamp and preserves inference with no row', () => {
  const filing = { completion_date: '2020-01-01' };
  for (const overlay of [{}, { site_state: null, site_state_observed_at: null }, { site_state: 'framing' }]) {
    assert.deepEqual(timingInfo(filing, '2026-10-20', projectSighting(overlay)), timingInfo(filing, '2026-10-20'));
  }
  const sighting = projectSighting({ site_state: 'dried_in', site_state_observed_at: '2026-10-21T04:00:00Z' });
  assert.equal(timingInfo(filing, '2026-10-20', sighting).label, 'Dried in · seen Oct 20');
  assert.equal(timingInfo(filing, '2026-10-20', sighting).tag, null);
  assert.equal(timingInfo(filing, '2026-11-19', sighting).tone, 'seen');
  assert.equal(timingInfo(filing, '2026-11-20', sighting).tag, 'Stale');
});

test('all lists left join overlays and Show hidden bypasses disposition and review hides together', () => {
  for (const list of ['', 'bryan-priority', 'data-centers']) {
    const filters = parseFilters(new URLSearchParams({ list }));
    const hidden = buildWhere(filters, '2026-10-20');
    assert.match(hidden.from, /LEFT JOIN leads\.project_overlay/);
    assert.match(hidden.from, /COALESCE\(overlay.hidden, false\)/);
    assert.match(hidden.where, /overlay_hidden = false/);
    const shownFilters = parseFilters(filtersToSearchParams({ ...filters, hidden: true }));
    const shown = buildWhere(shownFilters, '2026-10-20');
    assert.doesNotMatch(shown.where, /overlay_hidden = false|project_number NOT IN/);
    assert.equal(shownFilters.hidden, true);
  }
});
