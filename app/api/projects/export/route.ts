import { NextRequest, NextResponse } from 'next/server';
import { FilterError, parseFilters } from '@/lib/query';
import { DatabaseError } from '@/lib/db';
import { loadProjectCsv } from '@/lib/projects';
import { LocationError, parseHereLocation } from '@/lib/here-location';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const here = parseHereLocation(request.nextUrl.searchParams);
    if (filters.sort === 'here' && !here) throw new FilterError('Nearest to me requires lat and lng.');
    const csv = await loadProjectCsv(filters, here);
    const office = filters.office || 'projects';
    const list = filters.list || 'projects';
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${list}-${office}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    const invalid = error instanceof FilterError || error instanceof LocationError;
    const message = invalid || error instanceof DatabaseError ? error.message : 'Unable to export projects.';
    return NextResponse.json({ error: message }, { status: invalid ? 400 : 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
