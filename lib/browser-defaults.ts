import { listAvailable } from './browse-lists.ts';
import { DEFAULT_OFFICE_ID, isBrowseOffice } from './offices.ts';
import { FILTER_DEFAULTS, type Filters, type SortKey } from './query.ts';

/** UI defaults. All Projects, Data Centers, and All Texas open on newest filed. Bryan Priority opens on rank. */
export function browserDefaults(options?: { office?: string; list?: string }): Filters {
  const requested = options?.office && isBrowseOffice(options.office) ? options.office : DEFAULT_OFFICE_ID;
  const requestedList = options?.list || '';
  const list = listAvailable(requested, requestedList) ? requestedList : '';
  const base: Filters = { ...FILTER_DEFAULTS, office: requested, list };
  if (list === 'bryan-priority') return { ...base, sort: 'rank', direction: 'asc' };
  return base;
}

export function sortMetaLabel(sort: string, direction: 'asc' | 'desc'): string {
  const labels: Record<string, string> = {
    estimated_cost: 'est. cost',
    registration_date: 'filed date',
    completion_date: 'planned finish',
    start_date: 'planned start',
    project_name: 'project name',
    location_address: 'address',
    distance: 'distance',
    here: 'distance from you',
    rank: 'priority rank',
    timing: 'timing',
  };
  const name = labels[sort] || sort;
  let how: string;
  if (sort === 'estimated_cost') how = direction === 'desc' ? 'highest first' : 'lowest first';
  else if (sort === 'rank') how = direction === 'asc' ? 'best first' : 'lowest first';
  else if (sort === 'distance' || sort === 'here') how = direction === 'asc' ? 'nearest first' : 'farthest first';
  else if (sort === 'timing') how = direction === 'asc' ? 'soonest planned dates first' : 'state status first';
  else if (sort === 'completion_date' || sort === 'start_date') how = direction === 'asc' ? 'soonest first' : 'latest first';
  else if (sort.endsWith('_date')) how = direction === 'desc' ? 'newest first' : 'oldest first';
  else how = direction === 'asc' ? 'A→Z' : 'Z→A';
  return `Sorted by ${name} (${how})`;
}

export function defaultSortFor(office: string, list: string): { sort: SortKey; direction: 'asc' | 'desc' } {
  const defaults = browserDefaults({ office, list });
  return { sort: defaults.sort, direction: defaults.direction };
}
