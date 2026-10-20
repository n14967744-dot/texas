import test from 'node:test';
import assert from 'node:assert/strict';
import { businessToday, timingBucketSql, timingDateSql, timingInfo, timingLabel, type TimingTag, type TimingTone } from '../lib/timing.ts';
import { statusLabel } from '../lib/status-labels.ts';
import { buildWhere, parseFilters, SORTS } from '../lib/query.ts';

const today = '2026-10-20';
const past = (days: number) => new Date(Date.parse(`${today}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
const filing = { start_date: '2025-01-01', current_status: 'Review Complete' };

test('future start and current/future finish use month-year labels', () => {
  assert.deepEqual(timingInfo({ ...filing, start_date: '2026-11-01', completion_date: '2027-04-01' }, today), {
    label: 'Start: Nov 2026', tag: null, flags: [], tone: 'ahead',
  });
  for (const start_date of [past(1), today, null]) {
    assert.deepEqual(timingInfo({ ...filing, start_date, completion_date: '2027-04-01' }, today), {
      label: 'Finish: Apr 2027', tag: null, flags: [], tone: 'active',
    });
  }
  // Future start wins when the filing contains inconsistent dates.
  assert.equal(timingInfo({ start_date: '2026-11-01', completion_date: past(181) }, today).tone, 'ahead');
});

const boundaries: [number, TimingTag | null, TimingTone, string][] = [
  [0, null, 'active', 'Finish: Oct 2026'],
  [1, 'Behind?', 'behind', 'Finish was Oct 2026'],
  [90, 'Behind?', 'behind', 'Finish was Jul 2026'],
  [91, 'Stale', 'stale', 'Finish was Jul 2026'],
  [180, 'Stale', 'stale', 'Finish was Apr 2026'],
  [181, 'Needs drive-by', 'drive_by', 'Finish was Apr 2026'],
];
for (const [days, tag, tone, label] of boundaries) {
  test(`planned finish ${days} days past`, () => {
    assert.deepEqual(timingInfo({ ...filing, completion_date: past(days) }, today), { label, tag, flags: [], tone });
  });
}

test('old filings remain labeled, with no claims about completion or occupancy', () => {
  const row = { ...filing, completion_date: '2000-01-01' };
  assert.equal(timingLabel(row, today), 'Finish was Jan 2000 · Needs drive-by');
  for (const [days] of boundaries) {
    assert.doesNotMatch(timingLabel({ ...filing, completion_date: past(days) }, today), /built|occupied|likely mov(?:e|ing)[ -]in|under construction/i);
  }
});

for (const [current_status, label, tone] of [
  ['Inspection Complete', 'Inspected', 'inspected'],
  ['Inspection Completed', 'Inspected', 'inspected'],
  ['Project Closed', 'Closed', 'closed'],
] as const) {
  test(`${current_status} overrides dates without inferring occupancy`, () => {
    for (const completion_date of [past(1), past(91), past(181), '2027-04-01', null]) {
      const row = { start_date: '2027-01-01', completion_date, current_status };
      assert.deepEqual(timingInfo(row, today), { label, tag: null, flags: [], tone });
      assert.equal(statusLabel(current_status), label);
      assert.equal(timingInfo({ ...row, current_status: ` ${current_status} ` }, today).label, label);
      assert.equal(timingLabel(row, today, { site_state: 'framing', observed_at: today }), 'Framing · seen Oct 20');
    }
  });
}

test('Plans not reviewed starts at day 61 and requires Project Registered', () => {
  for (const days of [-1, 0, 1, 60, 61, 181]) {
    for (const current_status of ['Project Registered', 'Review Complete', 'Inspection Complete', 'Project Closed', null]) {
      const info = timingInfo({ start_date: past(days), completion_date: '2027-04-01', current_status }, today);
      assert.deepEqual(info.flags, days > 60 && current_status === 'Project Registered' ? ['Plans not reviewed'] : []);
    }
  }
  const row = { start_date: past(61), completion_date: past(1), current_status: 'Project Registered' };
  assert.equal(timingLabel(row, today), 'Finish was Oct 2026 · Behind? · Plans not reviewed');
  assert.equal(timingLabel(row, today, { site_state: 'framing', observed_at: today }), 'Framing · seen Oct 20 · Plans not reviewed');
});

test('missing and invalid dates never imply progress', () => {
  for (const date of [null, undefined, '', 'not a date', '2026-02-30', '2026-13-01', '2026-10-20junk']) {
    assert.deepEqual(timingInfo({ start_date: date, completion_date: date, current_status: 'Project Registered' }, today), {
      label: 'Timing not listed', tag: null, flags: [], tone: 'unknown',
    });
  }
  assert.equal(timingLabel({ ...filing, start_date: today }, today), 'Planned start: Oct 2026');
  assert.equal(timingLabel({ ...filing, start_date: past(1) }, today), 'Planned start: Oct 2026');
  assert.equal(timingLabel({ completion_date: '2027-04-01T00:00:00Z' }, today), 'Finish: Apr 2027');
  assert.throws(() => timingInfo({}, '2026-02-30'), /Invalid timing business date/);
  assert.throws(() => timingInfo({}, `${today}T00:00:00Z`), /Invalid timing business date/);
});

test('sightings override every age tag through day 30, inclusive; day 31 restores inference', () => {
  for (const daysPastFinish of [1, 90, 91, 180, 181]) {
    const row = { ...filing, completion_date: past(daysPastFinish) };
    for (const age of [0, 1, 30]) {
      const info = timingInfo(row, today, { site_state: 'framing', observed_at: past(age) });
      assert.equal(info.tone, 'seen');
      assert.equal(info.tag, null);
      assert.equal(info.label, age === 0 ? 'Framing · seen Oct 20' : age === 1 ? 'Framing · seen Oct 19' : 'Framing · seen Sep 20');
    }
    const old = timingInfo(row, today, { site_state: 'framing', observed_at: past(31) });
    assert.equal(old.tag, daysPastFinish <= 90 ? 'Behind?' : 'Stale');
    assert.match(old.label, /^Finish was /);
  }
});

test('Needs drive-by requires no valid past sighting, even if a sighting is older than 30 days', () => {
  const row = { ...filing, completion_date: past(181) };
  for (const observed_at of [past(31), past(181), '2020-01-01']) {
    assert.equal(timingInfo(row, today, { site_state: 'unknown', observed_at }).tag, 'Stale');
  }
  for (const observed_at of [past(-1), '', 'invalid', '2026-02-30', '2026-10-20garbage', '2026-10-20T12:00:00']) {
    assert.equal(timingInfo(row, today, { site_state: 'framing', observed_at }).tag, 'Needs drive-by');
  }
  assert.equal(timingInfo(row, today, { site_state: '', observed_at: today }).tag, 'Needs drive-by');
});

test('site-state labels describe rep observations, including explicit occupancy', () => {
  const labels = { dirt: 'Dirt', sitework: 'Sitework', foundation: 'Foundation', framing: 'Framing', dried_in: 'Dried in', interior: 'Interior work', complete: 'Complete', occupied: 'Occupied', unknown: 'Checked' };
  for (const [site_state, label] of Object.entries(labels)) {
    assert.equal(timingLabel({}, today, { site_state, observed_at: today }), `${label} · seen Oct 20`);
  }
});

test('Chicago midnight controls date labels and sighting freshness, not UTC midnight', () => {
  const before = new Date('2026-10-21T04:59:59Z');
  const after = new Date('2026-10-21T05:00:00Z');
  assert.equal(businessToday(before), today);
  assert.equal(businessToday(after), '2026-10-21');
  assert.equal(timingInfo({ completion_date: today }, before).tag, null);
  assert.equal(timingInfo({ completion_date: today }, after).tag, 'Behind?');
  const sighting = { site_state: 'framing', observed_at: '2026-09-21T04:59:59Z' }; // Sep 20 in Chicago
  assert.equal(timingLabel({ completion_date: past(1) }, before, sighting), 'Framing · seen Sep 20');
  assert.equal(timingInfo({ completion_date: past(1) }, after, sighting).tag, 'Behind?');
  assert.equal(timingLabel({}, before, { site_state: 'framing', observed_at: '2026-10-21T04:00:00Z' }), 'Framing · seen Oct 20');
  assert.equal(timingLabel({}, before, { site_state: 'framing', observed_at: '2026-10-20 23:00:00-05' }), 'Framing · seen Oct 20');
  assert.equal(businessToday(new Date('2026-01-21T05:59:59Z')), '2026-01-20');
  assert.equal(businessToday(new Date('2026-01-21T06:00:00Z')), '2026-01-21');
});

test('calendar day boundaries survive both DST transitions', () => {
  assert.equal(timingInfo({ completion_date: '2026-03-08' }, new Date('2026-03-09T05:00:00Z')).tag, 'Behind?');
  assert.equal(timingInfo({ completion_date: '2026-11-01' }, new Date('2026-11-02T06:00:00Z')).tag, 'Behind?');
  assert.equal(timingInfo({}, '2026-11-02', { site_state: 'framing', observed_at: '2026-10-03T05:00:00Z' }).tone, 'seen');
});

test('status fallbacks and retired stage URLs remain supported', () => {
  assert.equal(statusLabel('Project Registered'), 'Filed, plans not reviewed');
  assert.equal(statusLabel('Review Complete'), 'Plans approved');
  assert.equal(statusLabel('Something New'), 'Something New');
  assert.equal(statusLabel(null), 'Not listed');
  assert.throws(() => parseFilters(new URLSearchParams({ sort: 'stage' })));
  assert.equal('stage' in SORTS, false);
  assert.equal(parseFilters(new URLSearchParams({ stage: 'finishing_soon' })).sort, 'registration_date');
});

test('default and curated list membership do not expire with date age', () => {
  for (const list of ['', 'bryan-priority', 'data-centers']) {
    const filters = parseFilters(new URLSearchParams({ list }));
    const now = buildWhere(filters, today);
    const later = buildWhere(filters, '2040-01-01');
    assert.deepEqual(now, later);
    assert.doesNotMatch(now.where, /completion_date|start_date/);
  }
});

test('SQL timing buckets include both inspection spellings and 90/180 day cutoffs', () => {
  const sql = timingBucketSql('$3');
  assert.match(sql, /Inspection Complete', 'Inspection Completed/);
  assert.match(sql, /Project Closed/);
  assert.match(sql, />= \$3::date THEN 2/);
  assert.match(sql, />= \$3::date - 90 THEN 4/);
  assert.match(sql, />= \$3::date - 180 THEN 5/);
  assert.match(sql, /< \$3::date - 180 THEN 6/);
  assert.match(timingDateSql('$3'), /IN \(2, 4, 5, 6\)/);
});
