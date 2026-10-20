import test from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, presetRange } from '../lib/date-presets.ts';

const today = '2026-10-19';

test('presets are inclusive Chicago calendar ranges', () => {
  assert.deepEqual(presetRange('start', 'next30', today), { from: '2026-10-19', to: '2026-11-18' });
  assert.deepEqual(presetRange('start', 'next90', today), { from: '2026-10-19', to: '2027-01-17' });
  assert.equal(presetRange('start', 'reached', today), null);
  assert.deepEqual(presetRange('finish', 'next30', today), { from: '2026-10-19', to: '2026-11-18' });
  assert.deepEqual(presetRange('finish', 'next90', today), { from: '2026-10-19', to: '2027-01-17' });
  assert.deepEqual(presetRange('finish', 'next6mo', today), { from: '2026-10-19', to: '2027-04-19' });
  assert.deepEqual(presetRange('finish', 'prev90', today), { from: '2026-07-21', to: '2026-10-19' });
  assert.deepEqual(presetRange('filed', 'last7', today), { from: '2026-10-12', to: '2026-10-19' });
  assert.deepEqual(presetRange('filed', 'last30', today), { from: '2026-09-19', to: '2026-10-19' });
  assert.deepEqual(presetRange('filed', 'last90', today), { from: '2026-07-21', to: '2026-10-19' });
});

test('addMonths clamps short months', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-10-19', 6), '2027-04-19');
});
