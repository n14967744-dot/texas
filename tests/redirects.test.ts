import test from 'node:test';
import assert from 'node:assert/strict';
import { browseListHref, legacyListRedirect } from '../lib/redirects.ts';

test('legacy list URLs land on the project browser and keep extra query keys', () => {
  assert.equal(legacyListRedirect('/lists'), '/?office=bryan');
  assert.equal(legacyListRedirect('/lists/'), '/?office=bryan');
  assert.equal(legacyListRedirect('/lists/bryan-priority'), '/?office=bryan&list=bryan-priority');
  const extra = new URLSearchParams();
  extra.set('q', 'abc');
  extra.set('open', 'TABS1');
  extra.set('office', 'waco');
  extra.set('hidden', '1');
  assert.equal(
    legacyListRedirect('/lists/data-centers', extra),
    '/?office=bryan&list=data-centers&q=abc&open=TABS1&hidden=1',
  );
  assert.equal(legacyListRedirect('/lists/nope'), null);
});

test('report links open the list in the browser', () => {
  assert.equal(browseListHref('bryan-priority', { q: 'x', open: 'y' }), '/?office=bryan&list=bryan-priority&q=x&open=y');
  assert.equal(browseListHref('data-centers'), '/?office=bryan&list=data-centers');
  assert.equal(browseListHref('bryan-priority', { hidden: '1' }), '/?office=bryan&list=bryan-priority&hidden=1');
});
