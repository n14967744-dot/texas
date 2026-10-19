import { getSmartList } from './smart-lists.ts';
import type { ProjectParamState } from './project-params.ts';

/** UI defaults for the project browser (may differ from API parseFilters defaults). */
export function browserDefaults(listId?: string): ProjectParamState {
  const list = listId ? getSmartList(listId) : undefined;
  return {
    coverage: 'all',
    office: list ? (list.defaultOffice ?? 'texas') : 'all',
    view: 'all',
    q: '',
    city: '',
    county: '',
    status: '',
    stage: '',
    completionFrom: '',
    completionTo: '',
    registeredFrom: '',
    registeredTo: '',
    sort: list?.defaultSort ?? (list ? 'completion_date' : 'registration_date'),
    direction: list?.defaultDirection ?? (list ? 'asc' : 'desc'),
    page: 1,
    pageSize: 50,
    upcoming: Boolean(list?.upcomingOnlyDefault),
    hidden: false,
    // Smart lists default to distance coverage (list.defaultRadius, else 60 mi, of selected office / any office when All Texas).
    scope: list ? 'radius' : 'territory',
    radius: list?.defaultRadius ?? 60,
  };
}

export function sortMetaLabel(sort: string, direction: 'asc' | 'desc'): string {
  const labels: Record<string, string> = {
    estimated_cost: 'est. cost',
    registration_date: 'filed date',
    completion_date: 'planned finish',
    project_name: 'project name',
    location_address: 'address',
    current_status: 'state status',
    stage: 'stage',
    distance: 'distance',
    rank: 'priority rank',
  };
  const name = labels[sort] || sort;
  if (sort === 'estimated_cost') return `sorted by ${name} (${direction === 'desc' ? 'highest first' : 'lowest first'})`;
  if (sort === 'rank') return `sorted by ${name} (${direction === 'asc' ? 'best first' : 'lowest first'})`;
  if (sort === 'distance') return `sorted by ${name} (${direction === 'asc' ? 'nearest first' : 'farthest first'})`;
  if (sort === 'completion_date') return `sorted by ${name} (${direction === 'asc' ? 'soonest first' : 'latest first'})`;
  if (sort === 'stage') return `sorted by ${name} (${direction === 'asc' ? 'not started → built' : 'built → not started'})`;
  if (sort.endsWith('_date')) return `sorted by ${name} (${direction === 'desc' ? 'newest first' : 'oldest first'})`;
  return `sorted by ${name} (${direction === 'asc' ? 'A→Z' : 'Z→A'})`;
}
