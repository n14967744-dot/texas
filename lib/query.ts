import { ALL_TEXAS_ID, DEFAULT_OFFICE_ID, isBrowseOffice } from './offices.ts';
import { listAvailable } from './browse-lists.ts';
import { DEFAULT_RADIUS_MILES, MAX_RADIUS_MILES } from './radius.ts';
import { appendSmartListClauses, getSmartList } from './smart-lists.ts';
import { hiddenProjectNumbers } from './smart-list-review.ts';
import { hasRanking } from './smart-list-rankings.ts';
import { presetRange, type FiledPreset, type FinishPreset, type StartPreset } from './date-presets.ts';
import { locatedFromSql, type SqlBind } from './location-sql.ts';

export type SqlQuery = { query: string; params: (string | number)[] };

export const SORTS = {
  estimated_cost: 'estimated_cost',
  registration_date: 'registration_date',
  completion_date: 'completion_date',
  start_date: 'start_date',
  project_name: 'project_name',
  location_address: 'location_address',
  distance: 'distance',
  rank: 'rank',
  timing: 'timing',
} as const;

export type SortKey = keyof typeof SORTS;
export const RADIUS_PRESETS = [10, 25, 50, 100] as const;
export const DEFAULT_RADIUS = DEFAULT_RADIUS_MILES;

export interface Filters {
  office: string;
  list: string;
  q: string;
  city: string;
  county: string;
  workType: string;
  /** Straight-line miles. Ignored for All Texas. */
  radius: number;
  /** Include precision='none' rows, which are never treated as inside the radius. */
  includeUnknown: boolean;
  startPreset: StartPreset | '';
  startFrom: string;
  startTo: string;
  finishPreset: FinishPreset | '';
  finishFrom: string;
  finishTo: string;
  costMin: number | null;
  costMax: number | null;
  /** When a cost range is set, also keep projects with no estimated cost. */
  includeNoCost: boolean;
  filedPreset: FiledPreset | '';
  registeredFrom: string;
  registeredTo: string;
  /** Curated / reviewed lists only. */
  hidden: boolean;
  sort: SortKey;
  direction: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export const FILTER_DEFAULTS: Filters = {
  office: DEFAULT_OFFICE_ID,
  list: '',
  q: '',
  city: '',
  county: '',
  workType: '',
  radius: DEFAULT_RADIUS,
  includeUnknown: false,
  startPreset: '',
  startFrom: '',
  startTo: '',
  finishPreset: '',
  finishFrom: '',
  finishTo: '',
  costMin: null,
  costMax: null,
  includeNoCost: false,
  filedPreset: '',
  registeredFrom: '',
  registeredTo: '',
  hidden: false,
  sort: 'registration_date',
  direction: 'desc',
  page: 1,
  pageSize: 50,
};

export class FilterError extends Error {}

const START_PRESETS = new Set(['next30', 'next90', 'reached']);
const FINISH_PRESETS = new Set(['next30', 'next90', 'next6mo', 'prev90']);
const FILED_PRESETS = new Set(['last7', 'last30', 'last90']);

function dateParam(params: URLSearchParams, key: string) {
  const value = params.get(key) || '';
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) {
    throw new FilterError(`Invalid ${key} date.`);
  }
  return value;
}

function flagParam(params: URLSearchParams, key: string, label: string) {
  const raw = (params.get(key) || '').trim();
  if (raw && !['1', 'true', '0', 'false'].includes(raw)) throw new FilterError(`Invalid ${label}.`);
  return raw === '1' || raw === 'true';
}

function costParam(params: URLSearchParams, key: string): number | null {
  const raw = (params.get(key) || '').trim().replace(/[$,]/g, '');
  if (!raw) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new FilterError(`Invalid ${key}.`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value > 1e15) throw new FilterError(`Invalid ${key}.`);
  return value;
}

/** Extra params are ignored. That includes the retired `stage` filter, so old links still open. */
export function parseFilters(params: URLSearchParams): Filters {
  const sort = params.get('sort') || FILTER_DEFAULTS.sort;
  const direction = params.get('direction') || FILTER_DEFAULTS.direction;
  if (!(sort in SORTS) || !Object.hasOwn(SORTS, sort)) throw new FilterError('Invalid sort column.');
  if (!['asc', 'desc'].includes(direction)) throw new FilterError('Invalid sort direction.');
  const page = Number(params.get('page') || FILTER_DEFAULTS.page);
  const pageSize = Number(params.get('pageSize') || FILTER_DEFAULTS.pageSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new FilterError('Invalid page.');
  if (![10, 25, 50].includes(pageSize)) throw new FilterError('Invalid page size.');

  const get = (key: string) => (params.get(key) || '').trim();
  const office = get('office') || FILTER_DEFAULTS.office;
  if (!isBrowseOffice(office)) throw new FilterError('Unknown office.');

  const q = get('q');
  if (q.length > 200) throw new FilterError('Search must be 200 characters or fewer.');
  for (const key of ['city', 'county', 'workType']) {
    if (get(key).length > 100) throw new FilterError('Filter value is too long.');
  }

  const list = get('list');
  if (list) {
    if (list.length > 64 || !/^[a-z0-9-]+$/.test(list)) throw new FilterError('Invalid list.');
    if (!getSmartList(list)) throw new FilterError('Unknown list.');
    if (!listAvailable(office, list)) throw new FilterError('That list is not available for this office.');
  }

  const radiusRaw = get('radius') || String(DEFAULT_RADIUS);
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(radiusRaw)) throw new FilterError('Invalid radius.');
  const radius = Number(radiusRaw);
  if (!(radius > 0) || radius > MAX_RADIUS_MILES) throw new FilterError('Invalid radius.');

  const startPreset = get('start');
  if (startPreset && !START_PRESETS.has(startPreset)) throw new FilterError('Invalid planned start filter.');
  const finishPreset = get('finish');
  if (finishPreset && !FINISH_PRESETS.has(finishPreset)) throw new FilterError('Invalid planned finish filter.');
  const filedPreset = get('filed');
  if (filedPreset && !FILED_PRESETS.has(filedPreset)) throw new FilterError('Invalid filed date filter.');

  const startFrom = startPreset ? '' : dateParam(params, 'startFrom');
  const startTo = startPreset ? '' : dateParam(params, 'startTo');
  const finishFrom = finishPreset ? '' : dateParam(params, 'finishFrom');
  const finishTo = finishPreset ? '' : dateParam(params, 'finishTo');
  const registeredFrom = filedPreset ? '' : dateParam(params, 'registeredFrom');
  const registeredTo = filedPreset ? '' : dateParam(params, 'registeredTo');
  if (startFrom && startTo && startFrom > startTo) throw new FilterError('Planned start range is reversed.');
  if (finishFrom && finishTo && finishFrom > finishTo) throw new FilterError('Planned finish range is reversed.');
  if (registeredFrom && registeredTo && registeredFrom > registeredTo) throw new FilterError('Filed date range is reversed.');

  const costMin = costParam(params, 'costMin');
  const costMax = costParam(params, 'costMax');
  if (costMin != null && costMax != null && costMin > costMax) throw new FilterError('Cost range is reversed.');
  const includeNoCost = flagParam(params, 'noCost', 'cost option');
  const includeUnknown = flagParam(params, 'unknown', 'unknown location option');
  const hidden = flagParam(params, 'hidden', 'hidden filter');
  if (hidden && !list) throw new FilterError('Show hidden is only available on a list.');
  if (hidden && hiddenProjectNumbers(list).length === 0) throw new FilterError('Show hidden is only available on a list with hidden entries.');
  if (sort === 'rank' && !(list && hasRanking(list))) throw new FilterError('Rank sort requires a ranked list.');

  return {
    office,
    list,
    q,
    city: get('city'),
    county: get('county'),
    workType: get('workType'),
    radius,
    includeUnknown,
    startPreset: startPreset as StartPreset | '',
    startFrom,
    startTo,
    finishPreset: finishPreset as FinishPreset | '',
    finishFrom,
    finishTo,
    costMin,
    costMax,
    includeNoCost,
    filedPreset: filedPreset as FiledPreset | '',
    registeredFrom,
    registeredTo,
    hidden,
    sort: sort as SortKey,
    direction: direction as 'asc' | 'desc',
    page,
    pageSize,
  };
}

export { businessToday } from './timing.ts';

const SEARCH_FIELDS = [
  'project_name', 'facility_name', 'scope_of_work', 'location_address', 'location_city', 'location_county',
  'owner_name', 'tenant_name', 'design_firm_name',
  'owner_contact_name', 'tenant_contact_name', 'owner_phone', 'tenant_phone', 'design_firm_phone', 'filer_contact_name',
  'project_number',
] as const;

const dateExpr = (column: string) => `NULLIF(${column}::text, '')::date`;

function pushRange(
  clauses: string[],
  bind: SqlBind,
  column: string,
  from: string,
  to: string,
) {
  if (from) clauses.push(`${dateExpr(column)} >= ${bind(from)}::date`);
  if (to) clauses.push(`${dateExpr(column)} <= ${bind(to)}::date`);
}

export type CompiledWhere = {
  from: string;
  where: string;
  attributeWhere: string;
  /** TRUE for All Texas. Otherwise the radius predicate. Precision 'none' is never inside the radius. */
  geoClause: string;
  params: (string | number)[];
};

/**
 * One WHERE for search, list, dates, cost, work type, place, and radius.
 * `from` is the located subquery (address, else city centroid, else county centroid).
 */
export function buildWhere(filters: Filters, today: string): CompiledWhere {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new FilterError('Invalid business date.');
  if (!isBrowseOffice(filters.office)) throw new FilterError('Unknown office.');
  const params: (string | number)[] = [];
  const bind: SqlBind = (value) => {
    params.push(value);
    return `$${params.length}`;
  };
  const from = locatedFromSql(filters.office, bind);
  const clauses: string[] = ['TRUE'];

  if (filters.q) {
    const pattern = `%${filters.q.replace(/[\\%_]/g, '\\$&')}%`;
    const bound = bind(pattern);
    clauses.push(`(${SEARCH_FIELDS.map((field) => `${field} ILIKE ${bound} ESCAPE E'\\\\'`).join(' OR ')})`);
  }
  if (filters.city) clauses.push(`location_city = ${bind(filters.city)}`);
  if (filters.county) clauses.push(`location_county = ${bind(filters.county)}`);
  if (filters.workType) clauses.push(`type_of_work = ${bind(filters.workType)}`);

  if (filters.startPreset === 'reached') {
    clauses.push(`${dateExpr('start_date')} <= ${bind(today)}::date`);
  } else if (filters.startPreset) {
    const range = presetRange('start', filters.startPreset, today);
    if (!range) throw new FilterError('Invalid planned start filter.');
    pushRange(clauses, bind, 'start_date', range.from, range.to);
  } else {
    pushRange(clauses, bind, 'start_date', filters.startFrom, filters.startTo);
  }

  if (filters.finishPreset) {
    const range = presetRange('finish', filters.finishPreset, today);
    if (!range) throw new FilterError('Invalid planned finish filter.');
    pushRange(clauses, bind, 'completion_date', range.from, range.to);
  } else {
    pushRange(clauses, bind, 'completion_date', filters.finishFrom, filters.finishTo);
  }

  if (filters.filedPreset) {
    const range = presetRange('filed', filters.filedPreset, today);
    if (!range) throw new FilterError('Invalid filed date filter.');
    pushRange(clauses, bind, 'registration_date', range.from, range.to);
  } else {
    pushRange(clauses, bind, 'registration_date', filters.registeredFrom, filters.registeredTo);
  }

  if (filters.costMin != null || filters.costMax != null) {
    const parts: string[] = ['estimated_cost IS NOT NULL'];
    if (filters.costMin != null) parts.push(`estimated_cost >= ${bind(filters.costMin)}`);
    if (filters.costMax != null) parts.push(`estimated_cost <= ${bind(filters.costMax)}`);
    const priced = `(${parts.join(' AND ')})`;
    clauses.push(filters.includeNoCost ? `(${priced} OR estimated_cost IS NULL)` : priced);
  }

  if (filters.list) {
    const list = getSmartList(filters.list);
    if (!list) throw new FilterError('Unknown list.');
    appendSmartListClauses(list, bind, clauses);
    if (!filters.hidden) {
      const hiddenNums = hiddenProjectNumbers(filters.list);
      if (hiddenNums.length) clauses.push(`project_number NOT IN (${hiddenNums.map((num) => bind(num)).join(', ')})`);
    }
  }

  const attributeWhere = clauses.join(' AND ');
  let geoClause = 'TRUE';
  if (filters.office !== ALL_TEXAS_ID) {
    const miles = bind(filters.radius);
    const inside = `(geo_precision <> 'none' AND distance_mi <= ${miles})`;
    geoClause = filters.includeUnknown ? `(${inside} OR geo_precision = 'none')` : inside;
  }
  return {
    from,
    where: `${attributeWhere} AND ${geoClause}`,
    attributeWhere,
    geoClause,
    params,
  };
}
