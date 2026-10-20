import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COORD_SOURCE,
  DEFAULT_OFFICE_ID,
  OFFICES,
  VISIBLE_OFFICES,
  getOffice,
  getOfficeBranch,
  resolveBrowseOffice,
} from '../lib/offices.ts';
import { listsForOffice } from '../lib/browse-lists.ts';
import { canonicalizeBrowseParams, resolveBrowserState } from '../lib/browse-state.ts';

test('visible offices are Bryan and Waco; the rest stay defined but hidden', () => {
  assert.equal(DEFAULT_OFFICE_ID, 'bryan');
  assert.deepEqual(VISIBLE_OFFICES.map((office) => office.id), ['bryan', 'waco']);
  assert.equal(OFFICES.filter((office) => !office.visible).length, 5);
  assert.equal(getOfficeBranch('corsicana')?.name, 'Corsicana (Copy Center)');
  assert.equal(getOfficeBranch('bryan')?.address, '410 E. Villa Maria Rd, Bryan, TX 77801');
  assert.equal(getOfficeBranch('waco')?.address, '3730 Franklin Ave, Waco, TX 76710');
  for (const office of OFFICES) assert.equal(office.coordSource, COORD_SOURCE);
  assert.deepEqual(getOffice('bryan')?.counties, ['Brazos']);
});

test('the URL office wins and a hidden office does not fall through to the cookie', () => {
  assert.equal(resolveBrowseOffice('waco', 'bryan', true), 'waco');
  assert.equal(resolveBrowseOffice('temple', 'waco', true), 'bryan');
  assert.equal(resolveBrowseOffice('nope', 'waco', true), 'bryan');
  assert.equal(resolveBrowseOffice(null, 'waco', false), 'waco');
  assert.equal(resolveBrowseOffice(null, 'temple', false), 'bryan');
  assert.equal(resolveBrowseOffice(null, null, false), 'bryan');
});

test('lists follow the office', () => {
  assert.deepEqual(listsForOffice('bryan').map((list) => list.title), ['All Projects', 'Bryan Priority', 'Data Centers']);
  assert.deepEqual(listsForOffice('waco').map((list) => list.id), ['', 'data-centers']);
  assert.deepEqual(listsForOffice('texas').map((list) => list.id), ['', 'data-centers']);
});

test('canonical browse URLs fill the office and drop a list the office cannot show', () => {
  assert.equal(canonicalizeBrowseParams(new URLSearchParams(), 'waco'), '/?office=waco');
  assert.equal(canonicalizeBrowseParams(new URLSearchParams({ office: 'temple', q: 'a' }), 'waco'), '/?office=bryan&q=a');
  assert.equal(canonicalizeBrowseParams(new URLSearchParams({ office: 'waco', list: 'bryan-priority' }), null), '/?office=waco');
  assert.equal(canonicalizeBrowseParams(new URLSearchParams({ office: 'bryan' }), null), null);
  assert.equal(canonicalizeBrowseParams(new URLSearchParams({ office: 'bryan', sort: 'rank' }), null), '/?office=bryan');
  const ranked = resolveBrowserState(new URLSearchParams({ office: 'bryan', list: 'bryan-priority' }), null);
  assert.equal(ranked.sort, 'rank');
  assert.equal(ranked.direction, 'asc');
  assert.equal(ranked.radius, 25);
});
