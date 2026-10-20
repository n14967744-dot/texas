import { NextRequest, NextResponse } from 'next/server';
import { FilterError, parseFilters } from '@/lib/query';
import { DatabaseError } from '@/lib/db';
import { loadProjectList } from '@/lib/projects';
import { LocationError, parseHereLocation } from '@/lib/here-location';

export const runtime = 'nodejs';

const CACHE_HEADERS = {
  // TABS sync ~daily; 5 min fresh at CDN, stale OK for a day while revalidating.
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
};
const ERROR_HEADERS = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const here = parseHereLocation(request.nextUrl.searchParams);
    if (filters.sort === 'here' && !here) throw new FilterError('Nearest to me requires lat and lng.');
    const payload = await loadProjectList(filters, here);
    return NextResponse.json(payload, { headers: here ? ERROR_HEADERS : CACHE_HEADERS });
  } catch (error) {
    const invalid = error instanceof FilterError || error instanceof LocationError;
    const message = invalid || error instanceof DatabaseError ? error.message : 'Unable to load projects. Please try again.';
    return NextResponse.json({ error: message }, { status: invalid ? 400 : 503, headers: ERROR_HEADERS });
  }
}
