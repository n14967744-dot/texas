/**
 * Serialize project browser filters for /api/projects and the URL.
 *
 * Params are omitted only when they match the API's parseFilters defaults.
 * Do not compare against page-specific UI defaults (e.g. smart lists start on
 * office=texas + sort=completion_date) — omitting those would make the API fall
 * back to office=all / registration_date and silently shrink or re-sort results.
 */
export type ProjectParamState = {
  coverage: 'all' | 'outside';
  office: string;
  view: string;
  q: string;
  city: string;
  county: string;
  status: string;
  completionFrom: string;
  completionTo: string;
  registeredFrom: string;
  registeredTo: string;
  sort: string;
  direction: 'asc' | 'desc';
  page: number;
  pageSize: number;
  upcoming: boolean;
  hidden: boolean;
  scope: string;
  radius: number;
};

/** Mirrors parseFilters() defaults in lib/query.ts when a key is absent. */
export const API_PROJECT_PARAM_DEFAULTS: ProjectParamState = {
  coverage: 'all',
  office: 'all',
  view: 'all',
  q: '',
  city: '',
  county: '',
  status: '',
  completionFrom: '',
  completionTo: '',
  registeredFrom: '',
  registeredTo: '',
  sort: 'registration_date',
  direction: 'desc',
  page: 1,
  pageSize: 50,
  upcoming: false,
  hidden: false,
  scope: 'territory',
  radius: 60,
};

export function buildProjectSearchParams(
  filters: ProjectParamState,
  options: { listId?: string } = {},
): string {
  const p = new URLSearchParams();
  const defaults = API_PROJECT_PARAM_DEFAULTS;
  (Object.keys(defaults) as (keyof ProjectParamState)[]).forEach((key) => {
    if (key === 'upcoming' || key === 'hidden' || key === 'scope' || key === 'radius') return;
    const value = filters[key];
    if (value === '' || value === defaults[key]) return;
    p.set(key, String(value));
  });
  if (options.listId) {
    p.set('list', options.listId);
    p.set('upcoming', filters.upcoming ? '1' : '0');
    if (filters.hidden) p.set('hidden', '1');
    if (filters.scope && filters.scope !== 'territory') p.set('scope', filters.scope);
    if (filters.scope === 'radius') p.set('radius', String(filters.radius || 60));
  } else if (filters.upcoming) {
    p.set('upcoming', '1');
  }
  // When sort differs from the API default, always pair direction so URLs are explicit
  // even if direction happens to match the API default (desc).
  if (p.has('sort') && !p.has('direction')) {
    p.set('direction', filters.direction);
  }
  return p.toString();
}
