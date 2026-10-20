import test from 'node:test';
import assert from 'node:assert/strict';
import { timingBucketSql, timingLabel } from '../lib/timing.ts';

const today = '2026-10-19';

test('timing labels stay cautious and treat both inspection spellings the same', () => {
  const labels = [
    timingLabel({ start_date: '2026-12-19', completion_date: '2027-06-01', current_status: 'Review Complete' }, today),
    timingLabel({ start_date: '2026-07-19', current_status: 'Project Registered' }, today),
    timingLabel({ start_date: '2026-01-01', completion_date: '2026-11-19', current_status: 'Review Complete' }, today),
    timingLabel({ start_date: '2025-01-01', completion_date: '2026-09-01', current_status: 'Review Complete' }, today),
    timingLabel({ current_status: 'Inspection Complete', completion_date: '2020-01-01' }, today),
    timingLabel({ current_status: 'Inspection Completed', completion_date: '2020-01-01' }, today),
    timingLabel({ current_status: 'Project Closed', completion_date: '2020-01-01' }, today),
    timingLabel({ current_status: 'Review Complete' }, today),
  ];
  assert.deepEqual(labels, [
    'Planned to start in 2 mo',
    'Planned start passed 3 mo ago',
    'Planned finish in 1 mo',
    'Planned finish passed (status not confirmed)',
    'State inspection complete',
    'State inspection complete',
    'State filing closed',
    'Timing not listed',
  ]);
  for (const label of labels) assert.equal(/built|occupied|likely moving in/i.test(label), false);
});

test('a missing date is not treated as reached', () => {
  assert.equal(timingLabel({ start_date: '', completion_date: null, current_status: 'Project Registered' }, today), 'Timing not listed');
  assert.match(timingBucketSql('$1'), /Inspection Completed/);
  assert.match(timingBucketSql('$1'), /Inspection Complete/);
});
