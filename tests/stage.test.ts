import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveStage, monthsFromToday, parseStages, stageSql, stageOrderSql, STAGES, STAGE_LABELS } from '../lib/stage.ts';
import { statusLabel } from '../lib/status-labels.ts';
import { buildWhere, parseFilters, SORTS } from '../lib/query.ts';

const today = '2026-10-19';
const row = (start: string | null, finish: string | null, status = 'Review Complete') => ({ start_date: start, completion_date: finish, current_status: status });

test('stage: built statuses win over dates', () => {
  assert.equal(deriveStage(row('2027-01-01', '2027-06-01', 'Inspection Complete'), today), 'built');
  assert.equal(deriveStage(row(null, null, 'Project Closed'), today), 'built');
});

test('stage: not started when planned start is in the future', () => {
  assert.equal(deriveStage(row('2026-10-20', '2027-06-01'), today), 'not_started');
  assert.equal(deriveStage(row('2026-11-01', '2026-12-01'), today), 'not_started');
});

test('stage: past due when planned finish passed and not built', () => {
  assert.equal(deriveStage(row('2025-01-01', '2026-10-18'), today), 'past_due');
  assert.equal(deriveStage(row(null, '2026-01-01', 'Project Registered'), today), 'past_due');
});

test('stage: finishing soon is today through +90 days inclusive', () => {
  assert.equal(deriveStage(row('2025-01-01', today), today), 'finishing_soon');
  assert.equal(deriveStage(row('2025-01-01', '2027-01-17'), today), 'finishing_soon');
  assert.equal(deriveStage(row(null, '2026-12-01'), today), 'finishing_soon');
  assert.equal(deriveStage(row('2025-01-01', '2027-01-18'), today), 'under_construction');
});

test('stage: under construction when started and finish >90 days out or missing', () => {
  assert.equal(deriveStage(row(today, '2027-06-01'), today), 'under_construction');
  assert.equal(deriveStage(row('2025-01-01', null), today), 'under_construction');
});

test('stage: unknown without usable dates', () => {
  assert.equal(deriveStage(row(null, null), today), 'unknown');
  assert.equal(deriveStage(row(null, '2027-08-01'), today), 'unknown');
  assert.equal(deriveStage(row('', ''), today), 'unknown');
});

test('stage labels and status display names', () => {
  assert.equal(STAGE_LABELS.past_due, 'Past due, likely moving in');
  assert.equal(statusLabel('Project Registered'), 'Filed, plans not reviewed');
  assert.equal(statusLabel('Review Complete'), 'Plans approved');
  assert.equal(statusLabel('Inspection Complete'), 'Final inspection passed (built)');
  assert.equal(statusLabel('Project Closed'), 'Closed out');
  assert.equal(statusLabel('Something New'), 'Something New');
  assert.equal(statusLabel(null), 'Not listed');
});

test('monthsFromToday relative text', () => {
  assert.equal(monthsFromToday('2026-10-01', today), 'this month');
  assert.equal(monthsFromToday('2026-12-31', today), 'in 2 mo');
  assert.equal(monthsFromToday('2026-07-15', today), '3 mo ago');
  assert.equal(monthsFromToday('2027-10-19', today), 'in 12 mo');
  assert.equal(monthsFromToday(null, today), null);
});

test('stage param parsing, filter SQL and sort', () => {
  assert.deepEqual(parseStages('past_due,finishing_soon,past_due'), ['past_due', 'finishing_soon']);
  assert.throws(() => parseStages('bogus'));
  assert.throws(() => parseFilters(new URLSearchParams({ stage: 'bogus' })));
  const f = parseFilters(new URLSearchParams({ stage: 'finishing_soon,past_due', sort: 'stage', direction: 'asc' }));
  assert.deepEqual(f.stage, ['finishing_soon', 'past_due']);
  assert.equal(f.sort, 'stage');
  assert.ok('stage' in SORTS);
  const { where, params } = buildWhere(f, null, today);
  assert.match(where, /CASE WHEN current_status IN/);
  assert.ok(params.includes('finishing_soon') && params.includes('past_due') && params.includes(today));
  assert.equal(parseFilters(new URLSearchParams()).stage.length, 0);
  assert.ok(!buildWhere(parseFilters(new URLSearchParams()), null, today).where.includes('CASE'));
  for (const s of STAGES) assert.ok(stageSql('$1').includes(`'${s}'`));
  assert.match(stageOrderSql(`'${today}'`), /^array_position\(ARRAY\['not_started'/);
});
