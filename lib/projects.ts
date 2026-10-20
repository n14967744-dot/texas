import 'server-only';
import { readQueries } from './db';
import { isBrowseOffice } from './offices';
import { getRanking, getRankingEntry, PRIORITY_TIER_LABELS } from './smart-list-rankings';
import { projectOrderBy } from './project-order';
import { businessToday, buildWhere, FILTER_DEFAULTS, FilterError, type Filters } from './query';
import { timingLabel } from './timing';
import { distanceLabel } from './distance-label';
import { getReviewEntry } from './smart-list-review';
import type { CoverageCounts, ProjectListResponse, ProjectRow } from './types';

const LIST_COLUMNS = `project_number, project_name, facility_name, location_address, location_city, location_county,
  current_status, type_of_work, scope_of_work, estimated_cost, registration_date, start_date, completion_date, fetched_at,
  distance_mi, geo_precision`;

type CountRow = {
  total: string | number;
  address_count: string | number;
  approximate_count: string | number;
  unknown_count: string | number;
  unknown_pool: string | number;
};

type FacetRow = {
  latest_fetch: string | null;
  cities: string[] | null;
  counties: string[] | null;
  work_types: string[] | null;
};

function emptyCoverage(): CoverageCounts {
  return { address: 0, approximate: 0, unknown: 0, unknownPool: 0 };
}

function num(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function scopeFilters(filters: Filters): Filters {
  return {
    ...FILTER_DEFAULTS,
    office: filters.office,
    list: filters.list,
    radius: filters.radius,
    hidden: filters.hidden,
    sort: filters.sort,
    direction: filters.direction,
  };
}

function bindMore(params: (string | number)[]) {
  return (value: string | number) => {
    params.push(value);
    return `$${params.length}`;
  };
}

function rankJoin(listId: string, bind: (value: string | number) => string): string {
  const ranking = listId ? getRanking(listId) : undefined;
  if (!ranking?.ranked.length) return '';
  const values = ranking.ranked.map((entry) => `(${bind(entry.projectNumber)}::text, ${bind(entry.rank)}::int)`).join(', ');
  // The join key is not named project_number: that column already exists on located.
  return `LEFT JOIN (VALUES ${values}) AS curated_rank(tabs_number, rank) ON curated_rank.tabs_number = located.project_number`;
}

function ordering(filters: Filters, params: (string | number)[], today: string) {
  const bind = bindMore(params);
  const join = filters.sort === 'rank' ? rankJoin(filters.list, bind) : '';
  const todayParam = filters.sort === 'timing' ? bind(today) : `''`;
  return { join, order: projectOrderBy(filters, todayParam) };
}

function mapRow(row: ProjectRow, today: string): ProjectRow {
  const rawMiles = row.distance_mi as number | string | null | undefined;
  const miles = rawMiles == null || rawMiles === '' ? null : Math.round(Number(rawMiles) * 10) / 10;
  const flag = (row as { has_research?: unknown }).has_research;
  const researched = flag === true || flag === 't' || flag === 'true';
  return {
    ...row,
    distance_mi: miles != null && Number.isFinite(miles) ? miles : null,
    has_research: researched,
    timing_label: timingLabel(row, today),
  };
}

export async function loadProjectList(filters: Filters): Promise<ProjectListResponse> {
  if (!isBrowseOffice(filters.office)) throw new FilterError('Unknown office.');
  const today = businessToday();
  const compiled = buildWhere(filters, today);
  const scope = buildWhere(scopeFilters(filters), today);

  const summarySql = `SELECT
      count(*) FILTER (WHERE ${compiled.geoClause}) AS total,
      count(*) FILTER (WHERE ${compiled.geoClause} AND geo_precision = 'address') AS address_count,
      count(*) FILTER (WHERE ${compiled.geoClause} AND geo_precision IN ('city', 'county')) AS approximate_count,
      count(*) FILTER (WHERE ${compiled.geoClause} AND geo_precision = 'none') AS unknown_count,
      count(*) FILTER (WHERE geo_precision = 'none') AS unknown_pool
    FROM ${compiled.from}
    WHERE ${compiled.attributeWhere}`;

  const facetSql = `SELECT max(fetched_at) AS latest_fetch,
      array_agg(DISTINCT location_city ORDER BY location_city) FILTER (WHERE location_city IS NOT NULL AND location_city <> '') AS cities,
      array_agg(DISTINCT location_county ORDER BY location_county) FILTER (WHERE location_county IS NOT NULL AND location_county <> '') AS counties,
      array_agg(DISTINCT type_of_work ORDER BY type_of_work) FILTER (WHERE type_of_work IS NOT NULL AND type_of_work <> '') AS work_types
    FROM ${scope.from}
    WHERE ${scope.where}`;

  const [summary, facets] = await readQueries<CountRow | FacetRow>([
    { query: summarySql, params: compiled.params },
    { query: facetSql, params: scope.params },
  ]);

  const counts = summary.rows[0] as CountRow;
  const facet = facets.rows[0] as FacetRow;
  const total = num(counts?.total);
  const pages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, pages);
  const coverage: CoverageCounts = {
    address: num(counts?.address_count),
    approximate: num(counts?.approximate_count),
    unknown: num(counts?.unknown_count),
    unknownPool: num(counts?.unknown_pool),
  };
  const facetPayload = {
    cities: facet?.cities ?? [],
    counties: facet?.counties ?? [],
    workTypes: facet?.work_types ?? [],
  };
  const latestFetch = facet?.latest_fetch ?? null;

  if (!total) {
    return {
      projects: [],
      total: 0,
      page: 1,
      pageSize: filters.pageSize,
      pages: 1,
      latestFetch,
      facets: facetPayload,
      coverage,
    };
  }

  const params = [...compiled.params];
  const { join, order } = ordering(filters, params, today);
  const bind = bindMore(params);
  const limit = bind(filters.pageSize);
  const offset = bind((page - 1) * filters.pageSize);
  const rows = await readQueries<ProjectRow>([{
    query: `SELECT ${LIST_COLUMNS},
        EXISTS (SELECT 1 FROM leads.project_research r WHERE r.project_number = located.project_number) AS has_research
      FROM ${compiled.from}
      ${join}
      WHERE ${compiled.where}
      ORDER BY ${order}
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  }]);

  return {
    projects: rows[0].rows.map((row) => mapRow(row, today)),
    total,
    page,
    pageSize: filters.pageSize,
    pages,
    latestFetch,
    facets: facetPayload,
    coverage,
  };
}

function csvEscape(value: string | number | null | undefined) {
  let text = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /["\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Full filtered export. Same WHERE and ORDER BY as the table, including distance, precision, and timing. */
export async function loadProjectCsv(filters: Filters): Promise<string> {
  if (!isBrowseOffice(filters.office)) throw new FilterError('Unknown office.');
  const today = businessToday();
  const compiled = buildWhere(filters, today);
  const params = [...compiled.params];
  const { join, order } = ordering(filters, params, today);
  const result = await readQueries<ProjectRow>([{
    query: `SELECT ${LIST_COLUMNS} FROM ${compiled.from} ${join} WHERE ${compiled.where} ORDER BY ${order} LIMIT 60000`,
    params,
  }]);
  const header = [
    'project_number', 'project_name', 'facility_name', 'location_address', 'location_city', 'location_county',
    'type_of_work', 'scope_of_work', 'estimated_cost', 'distance_mi', 'geo_precision', 'distance_label',
    'timing_label', 'planned_start', 'planned_finish', 'filed_date', 'state_status',
    'priority_rank', 'priority_tier', 'priority_note', 'review_decision', 'review_reason',
  ];
  const lines = [header.join(',')];
  for (const raw of result[0].rows) {
    const row = mapRow(raw, today);
    const ranked = filters.list ? getRankingEntry(filters.list, row.project_number) : undefined;
    const review = filters.list ? getReviewEntry(filters.list, row.project_number) : undefined;
    const values = [
      row.project_number, row.project_name, row.facility_name, row.location_address, row.location_city, row.location_county,
      row.type_of_work, row.scope_of_work, row.estimated_cost, row.distance_mi, row.geo_precision,
      distanceLabel(row.distance_mi, row.geo_precision),
      row.timing_label, row.start_date, row.completion_date, row.registration_date, row.current_status,
      ranked?.rank ?? '', ranked ? PRIORITY_TIER_LABELS[ranked.tier] : '', ranked?.note ?? '',
      review?.decision ?? '', review?.reason ?? '',
    ];
    lines.push(values.map((value) => csvEscape(value)).join(','));
  }
  return lines.join('\n');
}
