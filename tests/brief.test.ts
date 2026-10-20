import test from 'node:test';
import assert from 'node:assert/strict';
import { briefOffice, buildBriefQuery, shapeBrief, type BriefRow } from '../lib/brief.ts';
import { getOfficeBranch } from '../lib/offices.ts';
import { getRanking } from '../lib/smart-list-rankings.ts';

const bryan = getOfficeBranch('bryan')!;
const waco = getOfficeBranch('waco')!;
// UTC is already Oct 21, while the business date in Chicago is still Oct 20.
const now = new Date('2026-10-21T02:00:00Z');
const row = (id: string, values: Partial<BriefRow> = {}): BriefRow => ({
  project_number: id, project_name: id, facility_name: null, location_city: 'Bryan',
  estimated_cost: '100000', registration_date: '2026-10-20', current_status: 'Project Registered',
  start_date: '2026-09-01', completion_date: '2026-10-01', fetched_at: '2026-10-20T12:00:00Z',
  distance_mi: '10.25', geo_precision: 'address', overlay_hidden: false, ...values,
});

test('office defaults and validation match visible physical branches; SQL reuses read-only radius/overlay scope', () => {
  assert.equal(briefOffice(null)?.id, 'bryan');
  assert.equal(briefOffice('waco')?.id, 'waco');
  for (const id of ['', 'bogus', 'texas', 'all', 'temple', "bryan'; DROP TABLE projects;"]) assert.equal(briefOffice(id), undefined);
  const query = buildBriefQuery(bryan, '2026-10-20');
  assert.match(query.query, /LEFT JOIN leads\.project_geocodes/);
  assert.match(query.query, /LEFT JOIN leads\.tx_place_centroids/);
  assert.match(query.query, /LEFT JOIN leads\.project_overlay/);
  assert.match(query.query, /overlay_hidden = false/);
  assert.match(query.query, /geo_precision <> 'none' AND distance_mi <= \$\d+/);
  assert.deepEqual(query.params, [bryan.lat, bryan.lng, 25]);
});

test('filing windows use Chicago dates and inclusive bounds, exclude future filings, cap after counting', () => {
  const rows = Array.from({ length: 30 }, (_, i) => row(String(i).padStart(2, '0')));
  rows.push(row('yesterday', { registration_date: '2026-10-19' }), row('week-edge', { registration_date: '2026-10-13' }),
    row('old', { registration_date: '2026-10-12' }), row('future', { registration_date: '2026-10-21' }));
  const result = shapeBrief(rows, bryan, now);
  assert.equal(result.generated_at, now.toISOString());
  assert.equal(result.business_date, '2026-10-20');
  assert.deepEqual(result.office, { id: bryan.id, name: bryan.name });
  assert.equal(result.radius_mi, 25);
  assert.deepEqual(result.new_filings.counts, { last_1_day: 31, last_7_days: 32 });
  assert.equal(result.new_filings.last_1_day.length, 25);
  assert.equal(result.new_filings.last_7_days.length, 25);
  assert.equal(result.new_filings.last_7_days[0].project_number, '00');
  assert.equal(result.new_filings.last_7_days[0].estimated_cost, 100000);
  assert.equal(result.new_filings.last_7_days[0].distance_mi, 10.3);
});

test('all sections exclude hidden overlays and unlocated/outside rows, allow approximate and boundary locations', () => {
  const rows = [row('edge', { distance_mi: 25, geo_precision: 'city' }), row('county', { geo_precision: 'county' }),
    row('outside', { distance_mi: 25.001 }), row('hidden', { overlay_hidden: true }),
    row('none', { geo_precision: 'none' }), row('null', { distance_mi: null }), row('invalid', { distance_mi: 'bad' })];
  const result = shapeBrief(rows, waco, now);
  for (const items of [result.new_filings.last_7_days, result.drive_by.items, result.top_ranked.items]) {
    assert.deepEqual(items.map((item) => item.project_number), ['county', 'edge']);
    assert.equal(items[1].precision, 'city');
  }
});

test('status signals use fetched_at in Chicago, all three terminal labels, and document refresh limitation', () => {
  const rows = [row('closed', { current_status: 'Project Closed' }),
    row('inspected', { current_status: 'Inspection Complete', fetched_at: '2026-10-13T05:00:00Z' }),
    row('inspected-alt', { current_status: ' Inspection Completed ' }),
    row('too-old', { current_status: 'Project Closed', fetched_at: '2026-10-13T04:59:59Z' }),
    row('future-refresh', { current_status: 'Project Closed', fetched_at: '2026-10-21T03:00:00Z' }),
    row('no-refresh', { current_status: 'Project Closed', fetched_at: null }),
    row('invalid-refresh', { current_status: 'Project Closed', fetched_at: 'bad' }), row('active')];
  const result = shapeBrief(rows, waco, now);
  assert.deepEqual(result.newly_inspected_or_closed_last_7_days.items.map((item) => item.project_number), ['closed', 'inspected-alt', 'inspected']);
  assert.equal(result.newly_inspected_or_closed_last_7_days.date_basis, 'fetched_at');
  assert.equal(result.newly_inspected_or_closed_last_7_days.count, 3);
  assert.match(result.notes.join(' '), /refresh timestamp, not a transition date/);
  assert.deepEqual(result.top_ranked.items.map((item) => item.project_number), ['active']);
});

test('drive-by uses shared timing and sightings, cost order, stable ties, and cap/count', () => {
  const rows = [row('behind'), row('stale', { completion_date: '2026-05-01', estimated_cost: '300000' }),
    row('drive-by', { completion_date: '2026-01-01', estimated_cost: '400000' }),
    row('seen', { completion_date: '2026-01-01', site_state: 'framing', site_state_observed_at: '2026-10-20T12:00:00Z', estimated_cost: '9999999' }),
    row('inspected', { current_status: 'Inspection Complete' })];
  const result = shapeBrief(rows, bryan, now);
  assert.deepEqual(result.drive_by.items.map((item) => item.project_number), ['drive-by', 'stale', 'behind']);
  assert.deepEqual(result.drive_by.items.map((item) => item.timing_tag), ['Needs drive-by', 'Stale', 'Behind?']);
  assert.equal(result.new_filings.last_7_days.find((item) => item.project_number === 'seen')?.timing_label, 'Framing · seen Oct 20');
  const many = shapeBrief(Array.from({ length: 20 }, (_, i) => row(String(i).padStart(2, '0'))), bryan, now);
  assert.equal(many.drive_by.items.length, 15);
  assert.equal(many.drive_by.count, 20);
  assert.equal(many.drive_by.items[0].project_number, '00');
});

test('top ranked keeps curated order/demotion and overlay hides; fallback is cost among active leads', () => {
  const ranking = getRanking('bryan-priority')!;
  const entries = ranking.ranked.slice(0, 14);
  const rows = entries.map((entry, i) => row(entry.projectNumber, {
    completion_date: i === 0 ? '2026-01-01' : '2026-11-01',
    overlay_hidden: i === 1, estimated_cost: String(i * 100000),
  })).reverse();
  rows.push(row('unranked', { estimated_cost: 999999999 }));
  if (ranking.hidden[0]) rows.push(row(ranking.hidden[0].projectNumber));
  const result = shapeBrief(rows, bryan, now);
  assert.equal(result.top_ranked.source, 'bryan-priority');
  assert.equal(result.top_ranked.items.length, 10);
  assert.equal(result.top_ranked.count, 13);
  assert.deepEqual(result.top_ranked.items.map((item) => item.project_number), entries.slice(2, 12).map((entry) => entry.projectNumber));
  const fallback = shapeBrief([row('cheap', { estimated_cost: 0 }), row('expensive', { estimated_cost: 100 }),
    row('missing', { estimated_cost: null }), row('terminal', { estimated_cost: 999, current_status: 'Project Closed' })], waco, now);
  assert.equal(fallback.top_ranked.source, 'estimated_cost');
  assert.deepEqual(fallback.top_ranked.items.map((item) => item.project_number), ['expensive', 'cheap', 'missing']);
});

test('empty pool produces empty lists and zero counts', () => {
  const result = shapeBrief([], bryan, now);
  assert.deepEqual(result.new_filings.last_1_day, []);
  assert.deepEqual(result.new_filings.counts, { last_1_day: 0, last_7_days: 0 });
  for (const section of [result.drive_by, result.top_ranked, result.newly_inspected_or_closed_last_7_days]) {
    assert.deepEqual(section.items, []);
    assert.equal(section.count, 0);
  }
});
