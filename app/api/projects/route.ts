import { NextRequest, NextResponse } from 'next/server';
import { getOffice, TERRITORY_COUNTIES } from '@/lib/offices';
import { buildWhere, businessToday, FilterError, parseFilters, SORTS } from '@/lib/query';
import { DatabaseError, readQueries } from '@/lib/db';
import type { ProjectRow } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const office = getOffice(filters.office);
    if (!office) throw new FilterError('Unknown office.');
    if (filters.county && office.counties !== null && !(office.counties as readonly string[]).includes(filters.county)) throw new FilterError('County is outside this office territory.');
    if (filters.coverage === 'outside' && filters.county && (TERRITORY_COUNTIES as readonly string[]).includes(filters.county)) throw new FilterError('County is inside a CTWP territory.');
    const { where, params } = buildWhere(filters, office.counties, businessToday(), TERRITORY_COUNTIES);
    const territory = buildWhere(parseFilters(new URLSearchParams({ office: filters.office, coverage: filters.coverage })), office.counties, businessToday(), TERRITORY_COUNTIES);
    const summaries = await readQueries<Record<string, unknown>>([
      { query: `SELECT count(*) AS total FROM public.projects WHERE ${where}`, params },
      { query: `SELECT max(fetched_at) AS latest_fetch, array_agg(DISTINCT location_city ORDER BY location_city) FILTER (WHERE location_city IS NOT NULL AND location_city <> '') AS cities, array_agg(DISTINCT location_county ORDER BY location_county) FILTER (WHERE location_county IS NOT NULL AND location_county <> '') AS counties, array_agg(DISTINCT current_status ORDER BY current_status) FILTER (WHERE current_status IS NOT NULL AND current_status <> '') AS statuses FROM public.projects WHERE ${territory.where}`, params: territory.params },
    ]);
    const total = Number(summaries[0].rows[0].total);
    const pages = Math.max(1, Math.ceil(total / filters.pageSize));
    const page = Math.min(filters.page, pages);
    const result = await readQueries<ProjectRow>([{ query: `SELECT project_number, project_name, facility_name, location_address, location_city, location_county, current_status, type_of_work, scope_of_work, estimated_cost, registration_date, completion_date, fetched_at FROM public.projects WHERE ${where} ORDER BY ${SORTS[filters.sort]} ${filters.direction.toUpperCase()} NULLS LAST, project_number ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, params: [...params, filters.pageSize, (page - 1) * filters.pageSize] }]);
    const meta = summaries[1].rows[0];
    return NextResponse.json({ projects: result[0].rows, total, page, pageSize: filters.pageSize, pages, latestFetch: meta.latest_fetch ?? null, facets: { cities: meta.cities ?? [], counties: meta.counties ?? [], statuses: meta.statuses ?? [] } }, { headers });
  } catch (error) {
    const message = error instanceof FilterError || error instanceof DatabaseError ? error.message : 'Unable to load projects. Please try again.';
    return NextResponse.json({ error: message }, { status: error instanceof FilterError ? 400 : 503, headers });
  }
}
