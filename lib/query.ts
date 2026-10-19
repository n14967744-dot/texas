import { appendSmartListClauses, getSmartList } from './smart-lists.ts';
import { hiddenProjectNumbers } from './smart-list-review.ts';

export type SqlQuery = { query: string; params: (string | number)[] };
export type View = 'all' | 'recent' | 'soon' | 'completed';
export const SORTS = { estimated_cost: 'estimated_cost', registration_date: 'registration_date', completion_date: 'completion_date', project_name: 'project_name', location_address: 'location_address', current_status: 'current_status', distance: 'distance' } as const;
export type CoverageScope = 'territory' | 'radius';
export const RADIUS_MILES = [30, 60, 100] as const;
export interface Filters {
  coverage: 'all' | 'outside'; office: string; q: string; city: string; county: string; status: string;
  registeredFrom: string; registeredTo: string; completionFrom: string; completionTo: string;
  view: View; sort: keyof typeof SORTS; direction: 'asc' | 'desc'; page: number; pageSize: number;
  /** Smart list slug from lib/smart-lists.ts, or empty when browsing all projects. */
  list: string;
  /** Est. completion on/after today and not Closed / Inspection Complete. */
  upcoming: boolean;
  /** When true on a smart list, include manually hidden projects. */
  hidden: boolean;
  /** territory = office counties; radius = within radius miles of office (smart lists). */
  scope: CoverageScope;
  /** Miles from office when scope=radius. */
  radius: number;
}
export class FilterError extends Error {}
function dateParam(params: URLSearchParams, key: string) {
  const value = params.get(key) || '';
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new FilterError(`Invalid ${key} date.`);
  return value;
}
export function parseFilters(params: URLSearchParams): Filters {
  const sort = params.get('sort') || 'registration_date';
  const view = params.get('view') || 'all';
  const direction = params.get('direction') || 'desc';
  if (!(sort in SORTS) || !Object.hasOwn(SORTS, sort)) throw new FilterError('Invalid sort column.');
  if (!['all', 'recent', 'soon', 'completed'].includes(view)) throw new FilterError('Invalid saved view.');
  if (!['asc', 'desc'].includes(direction)) throw new FilterError('Invalid sort direction.');
  const page = Number(params.get('page') || 1);
  const pageSize = Number(params.get('pageSize') || 50);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new FilterError('Invalid page.');
  if (![10, 25, 50].includes(pageSize)) throw new FilterError('Invalid page size.');
  const get = (k: string) => (params.get(k) || '').trim();
  const coverage = get('coverage') || 'all';
  if (!['all', 'outside'].includes(coverage)) throw new FilterError('Invalid coverage filter.');
  if (coverage === 'outside' && get('office') !== 'texas') throw new FilterError('Outside territories is available in All Texas.');
  const q = get('q');
  if (q.length > 200) throw new FilterError('Search must be 200 characters or fewer.');
  for (const k of ['city', 'county', 'status']) if (get(k).length > 100) throw new FilterError('Filter value is too long.');
  const list = get('list');
  if (list) {
    if (list.length > 64 || !/^[a-z0-9-]+$/.test(list)) throw new FilterError('Invalid smart list.');
    if (!getSmartList(list)) throw new FilterError('Unknown smart list.');
  }
  const upcomingRaw = get('upcoming');
  if (upcomingRaw && !['1', 'true', '0', 'false'].includes(upcomingRaw)) throw new FilterError('Invalid upcoming filter.');
  const upcoming = upcomingRaw === '1' || upcomingRaw === 'true';
  const hiddenRaw = get('hidden');
  if (hiddenRaw && !['1', 'true', '0', 'false'].includes(hiddenRaw)) throw new FilterError('Invalid hidden filter.');
  const hidden = hiddenRaw === '1' || hiddenRaw === 'true';
  if (hidden && !list) throw new FilterError('Show hidden is only available on smart lists.');
  const scopeRaw = get('scope') || 'territory';
  if (!['territory', 'radius'].includes(scopeRaw)) throw new FilterError('Invalid coverage scope.');
  if (scopeRaw === 'radius' && !list) throw new FilterError('Radius coverage is only available on smart lists.');
  if (sort === 'distance' && scopeRaw !== 'radius') throw new FilterError('Distance sort requires radius coverage.');
  const radiusRaw = get('radius') || '60';
  const radius = Number(radiusRaw);
  if (![30, 60, 100].includes(radius)) throw new FilterError('Invalid radius.');
  const dates = { registeredFrom: dateParam(params, 'registeredFrom'), registeredTo: dateParam(params, 'registeredTo'), completionFrom: dateParam(params, 'completionFrom'), completionTo: dateParam(params, 'completionTo') };
  if (dates.registeredFrom && dates.registeredTo && dates.registeredFrom > dates.registeredTo) throw new FilterError('Registration date range is reversed.');
  if (dates.completionFrom && dates.completionTo && dates.completionFrom > dates.completionTo) throw new FilterError('Completion date range is reversed.');
  return { coverage: coverage as 'all' | 'outside', office: get('office') || 'all', q, city: get('city'), county: get('county'), status: get('status'), ...dates, view: view as View, sort: sort as keyof typeof SORTS, direction: direction as 'asc' | 'desc', page, pageSize, list, upcoming, hidden, scope: scopeRaw as CoverageScope, radius };
}
export function businessToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function buildWhere(filters: Filters, counties: readonly string[] | null, today: string, excludedCounties: readonly string[] = []) {
  const params: (string | number)[] = [];
  const bind = (value: string | number) => { params.push(value); return `$${params.length}`; };
  const clauses = counties === null ? ['TRUE'] : counties.length ? [`location_county IN (${counties.map(bind).join(',')})`] : ['FALSE'];
  if (filters.coverage === 'outside') {
    if (!excludedCounties.length) throw new FilterError('Territory mapping is unavailable.');
    clauses.push(`location_county IS NOT NULL AND location_county <> '' AND location_county NOT IN (${excludedCounties.map(bind).join(',')})`);
  }
  if (filters.q) {
    // Treat %, _ and backslash as literal search text, never SQL syntax.
    const pattern = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
    const b = bind(pattern);
    clauses.push(`(project_name ILIKE ${b} ESCAPE E'\\\\' OR facility_name ILIKE ${b} ESCAPE E'\\\\' OR location_address ILIKE ${b} ESCAPE E'\\\\' OR location_city ILIKE ${b} ESCAPE E'\\\\' OR project_number ILIKE ${b} ESCAPE E'\\\\')`);
  }
  for (const [field, value] of [['location_city', filters.city], ['location_county', filters.county], ['current_status', filters.status]]) if (value) clauses.push(`${field} = ${bind(value)}`);
  for (const [column, operator, value] of [['registration_date', '>=', filters.registeredFrom], ['registration_date', '<=', filters.registeredTo], ['completion_date', '>=', filters.completionFrom], ['completion_date', '<=', filters.completionTo]]) if (value) clauses.push(`${column} ${operator} ${bind(value)}::date`);
  if (filters.view === 'recent') { const b = bind(today); clauses.push(`registration_date BETWEEN (${b}::date - 29) AND ${b}::date`); }
  if (filters.view === 'soon') { const b = bind(today); clauses.push(`completion_date BETWEEN ${b}::date AND (${b}::date + INTERVAL '6 months')`); }
  if (filters.view === 'completed') { const b = bind(today); clauses.push(`completion_date BETWEEN (${b}::date - 29) AND ${b}::date`); }
  if (filters.list) {
    const list = getSmartList(filters.list);
    if (!list) throw new FilterError('Unknown smart list.');
    appendSmartListClauses(list, bind, clauses);
    if (!filters.hidden) {
      const hiddenNums = hiddenProjectNumbers(filters.list);
      if (hiddenNums.length) {
        clauses.push(`project_number NOT IN (${hiddenNums.map(bind).join(',')})`);
      }
    }
  }
  if (filters.upcoming) {
    const b = bind(today);
    clauses.push(`completion_date >= ${b}::date`);
    clauses.push(`(current_status IS NULL OR current_status NOT IN (${bind('Project Closed')}, ${bind('Inspection Complete')}))`);
  }
  return { where: clauses.join(' AND '), params };
}
