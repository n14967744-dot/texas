import { NextRequest, NextResponse } from 'next/server';
import { FilterError, parseFilters } from '@/lib/query';
import { DatabaseError } from '@/lib/db';
import { loadProjectCsv } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    const csv = await loadProjectCsv(filters);
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
    const message = error instanceof FilterError || error instanceof DatabaseError ? error.message : 'Unable to export projects.';
    return NextResponse.json({ error: message }, { status: error instanceof FilterError ? 400 : 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
