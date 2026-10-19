import { NextRequest, NextResponse } from 'next/server';
import { FilterError, parseFilters } from '@/lib/query';
import { DatabaseError } from '@/lib/db';
import { loadProjectList } from '@/lib/projects';

export const runtime = 'nodejs';

const CACHE_HEADERS = {
  // TABS sync ~daily; 5 min fresh at CDN, stale OK for a day while revalidating.
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
};
const ERROR_HEADERS = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const payload = await loadProjectList(filters);
    return NextResponse.json(payload, { headers: CACHE_HEADERS });
  } catch (error) {
    const message = error instanceof FilterError || error instanceof DatabaseError ? error.message : 'Unable to load projects. Please try again.';
    return NextResponse.json({ error: message }, { status: error instanceof FilterError ? 400 : 503, headers: ERROR_HEADERS });
  }
}
