import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOrderBy } from '../lib/project-order.ts';
import type { SortKey } from '../lib/query.ts';
import { timingBucketSql, timingDateSql } from '../lib/timing.ts';

function order(sort: SortKey, direction: 'asc' | 'desc', today = '$9') {
  return projectOrderBy({ sort, direction }, today);
}

test('list and export share one ORDER BY, including tie-breakers', () => {
  assert.equal(order('distance', 'asc'), 'distance_mi ASC NULLS LAST, project_number ASC');
  assert.equal(order('distance', 'desc'), 'distance_mi DESC NULLS LAST, project_number ASC');
  assert.equal(order('rank', 'asc'), 'curated_rank.rank ASC NULLS LAST, project_number ASC');
  assert.equal(order('rank', 'desc'), 'curated_rank.rank DESC NULLS LAST, project_number ASC');
  assert.equal(order('estimated_cost', 'asc'), 'estimated_cost ASC NULLS LAST, project_number ASC');
  assert.equal(order('estimated_cost', 'desc'), 'estimated_cost DESC NULLS LAST, project_number ASC');
  assert.equal(order('registration_date', 'desc'), 'registration_date DESC NULLS LAST, project_number ASC');
  assert.equal(order('registration_date', 'asc'), 'registration_date ASC NULLS LAST, project_number ASC');
  assert.equal(order('start_date', 'asc'), 'start_date ASC NULLS LAST, project_number ASC');
  assert.equal(order('completion_date', 'desc'), 'completion_date DESC NULLS LAST, project_number ASC');
  assert.equal(order('project_name', 'asc'), 'project_name ASC NULLS LAST, project_number ASC');
  assert.equal(order('project_name', 'desc'), 'project_name DESC NULLS LAST, project_number ASC');
  assert.equal(order('location_address', 'asc'), 'location_address ASC NULLS LAST, project_number ASC');
  assert.equal(order('location_address', 'desc'), 'location_address DESC NULLS LAST, project_number ASC');
  const today = '$3';
  assert.equal(
    order('timing', 'asc', today),
    `${timingBucketSql(today)} ASC, ${timingDateSql(today)} ASC NULLS LAST, project_number ASC`,
  );
  assert.equal(
    order('timing', 'desc', today),
    `${timingBucketSql(today)} DESC, ${timingDateSql(today)} DESC NULLS LAST, project_number ASC`,
  );
});
