import { NextRequest, NextResponse } from 'next/server';
import { DatabaseError } from '@/lib/db';
import { loadProjectDetail } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(_request: NextRequest, context: { params: Promise<{ projectNumber: string }> }) {
  const { projectNumber } = await context.params;
  if (!/^[A-Za-z0-9-]{1,40}$/.test(projectNumber)) return NextResponse.json({ error: 'Invalid project number.' }, { status: 400, headers });
  try {
    const payload = await loadProjectDetail(projectNumber);
    if (!payload) return NextResponse.json({ error: 'Project not found.' }, { status: 404, headers });
    return NextResponse.json(payload, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof DatabaseError ? error.message : 'Unable to load project.' }, { status: 503, headers });
  }
}
