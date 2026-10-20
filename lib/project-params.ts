import { FILTER_DEFAULTS, type Filters } from './query.ts';

/**
 * One serializer for the browser URL, /api/projects, and CSV export.
 * Values that match parseFilters defaults are omitted, except `office`,
 * which is always written so a shared link does not depend on the cookie.
 */
export function filtersToSearchParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  const defaults = FILTER_DEFAULTS;
  params.set('office', filters.office);
  if (filters.list) params.set('list', filters.list);
  if (filters.q) params.set('q', filters.q);
  if (filters.city) params.set('city', filters.city);
  if (filters.county) params.set('county', filters.county);
  if (filters.workType) params.set('workType', filters.workType);
  if (filters.radius !== defaults.radius) params.set('radius', String(filters.radius));
  if (filters.includeUnknown) params.set('unknown', '1');
  if (filters.startPreset) params.set('start', filters.startPreset);
  if (filters.startFrom) params.set('startFrom', filters.startFrom);
  if (filters.startTo) params.set('startTo', filters.startTo);
  if (filters.finishPreset) params.set('finish', filters.finishPreset);
  if (filters.finishFrom) params.set('finishFrom', filters.finishFrom);
  if (filters.finishTo) params.set('finishTo', filters.finishTo);
  if (filters.costMin != null) params.set('costMin', String(filters.costMin));
  if (filters.costMax != null) params.set('costMax', String(filters.costMax));
  if (filters.includeNoCost) params.set('noCost', '1');
  if (filters.filedPreset) params.set('filed', filters.filedPreset);
  if (filters.registeredFrom) params.set('registeredFrom', filters.registeredFrom);
  if (filters.registeredTo) params.set('registeredTo', filters.registeredTo);
  if (filters.hidden) params.set('hidden', '1');
  if (filters.sort !== defaults.sort || filters.direction !== defaults.direction) {
    params.set('sort', filters.sort);
    params.set('direction', filters.direction);
  }
  if (filters.page !== defaults.page) params.set('page', String(filters.page));
  if (filters.pageSize !== defaults.pageSize) params.set('pageSize', String(filters.pageSize));
  return params;
}

export function filtersToQueryString(filters: Filters): string {
  return filtersToSearchParams(filters).toString();
}
