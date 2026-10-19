import 'server-only';
import { getOffice, TERRITORY_COUNTIES } from './offices';
import { buildWhere, businessToday, FilterError, parseFilters, SORTS, type Filters } from './query';
import { readQueries } from './db';
import type { ProjectListResponse, ProjectRow } from './types';

export async function loadProjectList(filters: Filters): Promise<ProjectListResponse> {
  const office = getOffice(filters.office);
  if (!office) throw new FilterError('Unknown office.');
  if (filters.county && office.counties !== null && !(office.counties as readonly string[]).includes(filters.county)) {
    throw new FilterError('County is outside this office territory.');
  }
  if (filters.coverage === 'outside' && filters.county && (TERRITORY_COUNTIES as readonly string[]).includes(filters.county)) {
    throw new FilterError('County is inside a CTWP territory.');
  }
  const { where, params } = buildWhere(filters, office.counties, businessToday(), TERRITORY_COUNTIES);
  const facetSearch = new URLSearchParams({ office: filters.office, coverage: filters.coverage });
  if (filters.list) facetSearch.set('list', filters.list);
  const territory = buildWhere(parseFilters(facetSearch), office.counties, businessToday(), TERRITORY_COUNTIES);
  const summaries = await readQueries<Record<string, unknown>>([
    { query: `SELECT count(*) AS total FROM public.projects WHERE ${where}`, params },
    { query: `SELECT max(fetched_at) AS latest_fetch, array_agg(DISTINCT location_city ORDER BY location_city) FILTER (WHERE location_city IS NOT NULL AND location_city <> '') AS cities, array_agg(DISTINCT location_county ORDER BY location_county) FILTER (WHERE location_county IS NOT NULL AND location_county <> '') AS counties, array_agg(DISTINCT current_status ORDER BY current_status) FILTER (WHERE current_status IS NOT NULL AND current_status <> '') AS statuses FROM public.projects WHERE ${territory.where}`, params: territory.params },
  ]);
  const total = Number(summaries[0].rows[0].total);
  const pages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, pages);
  const result = await readQueries<ProjectRow>([{
    query: `SELECT project_number, project_name, facility_name, location_address, location_city, location_county, current_status, type_of_work, scope_of_work, estimated_cost, registration_date, completion_date, fetched_at FROM public.projects WHERE ${where} ORDER BY ${SORTS[filters.sort]} ${filters.direction.toUpperCase()} NULLS LAST, project_number ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    params: [...params, filters.pageSize, (page - 1) * filters.pageSize],
  }]);
  const meta = summaries[1].rows[0];
  return {
    projects: result[0].rows,
    total,
    page,
    pageSize: filters.pageSize,
    pages,
    latestFetch: (meta.latest_fetch as string | null) ?? null,
    facets: {
      cities: (meta.cities as string[] | null) ?? [],
      counties: (meta.counties as string[] | null) ?? [],
      statuses: (meta.statuses as string[] | null) ?? [],
    },
  };
}
