import { getSmartList } from './smart-lists.ts';
import type { ProjectParamState } from './project-params.ts';

/** UI defaults for the project browser (may differ from API parseFilters defaults). */
export function browserDefaults(listId?: string): ProjectParamState {
  const list = listId ? getSmartList(listId) : undefined;
  return {
    coverage: 'all',
    office: list ? 'texas' : 'all',
    view: 'all',
    q: '',
    city: '',
    county: '',
    status: '',
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
  };
}

export function sortMetaLabel(sort: string, direction: 'asc' | 'desc'): string {
  const labels: Record<string, string> = {
    estimated_cost: 'est. cost',
    registration_date: 'registration date',
    completion_date: 'est. completion',
    project_name: 'project name',
    location_address: 'address',
    current_status: 'status',
  };
  const name = labels[sort] || sort;
  if (sort === 'estimated_cost') return `sorted by ${name} (${direction === 'desc' ? 'highest first' : 'lowest first'})`;
  if (sort.endsWith('_date')) return `sorted by ${name} (${direction === 'desc' ? 'newest first' : 'oldest first'})`;
  return `sorted by ${name} (${direction === 'asc' ? 'A→Z' : 'Z→A'})`;
}
