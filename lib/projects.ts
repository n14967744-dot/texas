import 'server-only';
import { getOffice, TERRITORY_COUNTIES } from './offices';
import { buildWhere, businessToday, FilterError, parseFilters, SORTS, type Filters } from './query';
import { readQueries } from './db';
import { projectsWithinRadius, type DistanceHit } from './geo';
import type { ProjectListResponse, ProjectRow } from './types';

const LIST_COLUMNS = 'project_number, project_name, facility_name, location_address, location_city, location_county, current_status, type_of_work, scope_of_work, estimated_cost, registration_date, completion_date, fetched_at';

function emptyResponse(pageSize: number, latestFetch: string | null = null): ProjectListResponse {
  return {
    projects: [],
    total: 0,
    page: 1,
    pageSize,
    pages: 1,
    latestFetch,
    facets: { cities: [], counties: [], statuses: [] },
  };
}

function attachDistances(rows: ProjectRow[], byId: Map<string, DistanceHit>): ProjectRow[] {
  return rows.map((row) => {
    const hit = byId.get(row.project_number);
    if (!hit) return row;
    return { ...row, distance_mi: Math.round(hit.distanceMi * 10) / 10, geo_precision: hit.precision };
  });
}

export async function loadProjectList(filters: Filters): Promise<ProjectListResponse> {
  const office = getOffice(filters.office);
  if (!office) throw new FilterError('Unknown office.');

  const useRadius = filters.scope === 'radius' && Boolean(filters.list);
  if (useRadius && filters.sort === 'distance' && filters.scope !== 'radius') {
    throw new FilterError('Distance sort requires radius coverage.');
  }

  if (!useRadius && filters.county && office.counties !== null && !(office.counties as readonly string[]).includes(filters.county)) {
    throw new FilterError('County is outside this office territory.');
  }
  if (filters.coverage === 'outside' && filters.county && (TERRITORY_COUNTIES as readonly string[]).includes(filters.county)) {
    throw new FilterError('County is inside a CTWP territory.');
  }

  let distanceById = new Map<string, DistanceHit>();
  if (useRadius) {
    const branchId = filters.office === 'all' || filters.office === 'texas' ? null : filters.office;
    const hits = projectsWithinRadius({ officeId: branchId, radiusMiles: filters.radius });
    distanceById = new Map(hits.map((hit) => [hit.projectNumber, hit]));
    if (!hits.length) return emptyResponse(filters.pageSize);
  }

  // Radius mode ignores office county restriction (distance replaces territory).
  const counties = useRadius ? null : office.counties;
  let { where, params } = buildWhere(filters, counties, businessToday(), TERRITORY_COUNTIES);

  if (useRadius) {
    const ids = [...distanceById.keys()];
    const start = params.length + 1;
    where = `${where} AND project_number IN (${ids.map((_, i) => `$${start + i}`).join(',')})`;
    params = [...params, ...ids];
  }

  const facetOffice = useRadius ? 'texas' : filters.office;
  const facetSearch = new URLSearchParams({ office: facetOffice, coverage: filters.coverage });
  if (filters.list) facetSearch.set('list', filters.list);
  if (useRadius) {
    facetSearch.set('scope', 'radius');
    facetSearch.set('radius', String(filters.radius));
  }
  const facetOfficeObj = getOffice(facetOffice)!;
  const facetCounties = useRadius ? null : facetOfficeObj.counties;
  let territory = buildWhere(parseFilters(facetSearch), facetCounties, businessToday(), TERRITORY_COUNTIES);
  if (useRadius && distanceById.size) {
    const ids = [...distanceById.keys()];
    const start = territory.params.length + 1;
    territory = {
      where: `${territory.where} AND project_number IN (${ids.map((_, i) => `$${start + i}`).join(',')})`,
      params: [...territory.params, ...ids],
    };
  }

  if (filters.sort === 'distance' && useRadius) {
    const idResult = await readQueries<{ project_number: string }>([
      { query: `SELECT project_number FROM public.projects WHERE ${where}`, params },
    ]);
    const facetResult = await readQueries<Record<string, unknown>>([
      { query: `SELECT max(fetched_at) AS latest_fetch, array_agg(DISTINCT location_city ORDER BY location_city) FILTER (WHERE location_city IS NOT NULL AND location_city <> '') AS cities, array_agg(DISTINCT location_county ORDER BY location_county) FILTER (WHERE location_county IS NOT NULL AND location_county <> '') AS counties, array_agg(DISTINCT current_status ORDER BY current_status) FILTER (WHERE current_status IS NOT NULL AND current_status <> '') AS statuses FROM public.projects WHERE ${territory.where}`, params: territory.params },
    ]);
    let ordered = idResult[0].rows.map((row) => row.project_number);
    ordered.sort((a, b) => {
      const da = distanceById.get(a)?.distanceMi ?? Number.POSITIVE_INFINITY;
      const db = distanceById.get(b)?.distanceMi ?? Number.POSITIVE_INFINITY;
      return filters.direction === 'asc' ? da - db : db - da;
    });
    const total = ordered.length;
    const pages = Math.max(1, Math.ceil(total / filters.pageSize));
    const page = Math.min(filters.page, pages);
    const pageIds = ordered.slice((page - 1) * filters.pageSize, page * filters.pageSize);
    const meta = facetResult[0].rows[0];
    if (!pageIds.length) {
      return {
        ...emptyResponse(filters.pageSize, (meta.latest_fetch as string | null) ?? null),
        total,
        page,
        pages,
        facets: {
          cities: (meta.cities as string[] | null) ?? [],
          counties: (meta.counties as string[] | null) ?? [],
          statuses: (meta.statuses as string[] | null) ?? [],
        },
      };
    }
    const rowsResult = await readQueries<ProjectRow>([{
      query: `SELECT ${LIST_COLUMNS} FROM public.projects WHERE project_number IN (${pageIds.map((_, i) => `$${i + 1}`).join(',')})`,
      params: pageIds,
    }]);
    const byNum = new Map(rowsResult[0].rows.map((row) => [row.project_number, row]));
    const projects = attachDistances(pageIds.map((id) => byNum.get(id)!).filter(Boolean), distanceById);
    return {
      projects,
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

  const sqlSort = SORTS[filters.sort] === 'distance' ? 'project_number' : SORTS[filters.sort];
  const summaries = await readQueries<Record<string, unknown>>([
    { query: `SELECT count(*) AS total FROM public.projects WHERE ${where}`, params },
    { query: `SELECT max(fetched_at) AS latest_fetch, array_agg(DISTINCT location_city ORDER BY location_city) FILTER (WHERE location_city IS NOT NULL AND location_city <> '') AS cities, array_agg(DISTINCT location_county ORDER BY location_county) FILTER (WHERE location_county IS NOT NULL AND location_county <> '') AS counties, array_agg(DISTINCT current_status ORDER BY current_status) FILTER (WHERE current_status IS NOT NULL AND current_status <> '') AS statuses FROM public.projects WHERE ${territory.where}`, params: territory.params },
  ]);
  const total = Number(summaries[0].rows[0].total);
  const pages = Math.max(1, Math.ceil(total / filters.pageSize));
  const page = Math.min(filters.page, pages);
  const result = await readQueries<ProjectRow>([{
    query: `SELECT ${LIST_COLUMNS} FROM public.projects WHERE ${where} ORDER BY ${sqlSort} ${filters.direction.toUpperCase()} NULLS LAST, project_number ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    params: [...params, filters.pageSize, (page - 1) * filters.pageSize],
  }]);
  const meta = summaries[1].rows[0];
  return {
    projects: useRadius ? attachDistances(result[0].rows, distanceById) : result[0].rows,
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
