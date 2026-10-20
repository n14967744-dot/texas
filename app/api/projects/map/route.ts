import { NextRequest, NextResponse } from 'next/server';
import { DatabaseError } from '@/lib/db';
import { LocationError, parseHereLocation } from '@/lib/here-location';
import { loadProjectMap } from '@/lib/projects';
import { FilterError, parseFilters } from '@/lib/query';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const here = parseHereLocation(request.nextUrl.searchParams);
    if (filters.sort === 'here' && !here) throw new FilterError('Nearest to me requires lat and lng.');
    return NextResponse.json(await loadProjectMap(filters, here), { headers });
  } catch (error) {
    const invalid = error instanceof FilterError || error instanceof LocationError;
    const message = invalid || error instanceof DatabaseError ? error.message : 'Unable to load the map. Please try again.';
    return NextResponse.json({ error: message }, { status: invalid ? 400 : 503, headers });
  }
}
