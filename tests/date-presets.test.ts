import test from 'node:test';
import assert from 'node:assert/strict';
import { completionPresetRange, COMPLETION_PRESETS } from '../lib/date-presets.ts';

test('completion presets cover requested windows relative to a fixed today', () => {
  const today = '2026-10-19';
  assert.deepEqual(completionPresetRange('next30', today), { completionFrom: '2026-10-19', completionTo: '2026-11-18' });
  assert.deepEqual(completionPresetRange('next90', today), { completionFrom: '2026-10-19', completionTo: '2027-01-17' });
  assert.deepEqual(completionPresetRange('next6mo', today), { completionFrom: '2026-10-19', completionTo: '2027-04-20' });
  assert.deepEqual(completionPresetRange('thisYear', today), { completionFrom: '2026-10-19', completionTo: '2026-12-31' });
  assert.deepEqual(completionPresetRange('nextYear', today), { completionFrom: '2027-01-01', completionTo: '2027-12-31' });
  assert.equal(COMPLETION_PRESETS.length, 5);
});
