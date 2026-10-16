import { NextRequest, NextResponse } from 'next/server';
import { readQueries, DatabaseError } from '@/lib/db';
import type { Project } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(_request: NextRequest, context: { params: Promise<{ projectNumber: string }> }) {
  const { projectNumber } = await context.params;
  if (!/^[A-Za-z0-9-]{1,40}$/.test(projectNumber)) return NextResponse.json({ error: 'Invalid project number.' }, { status: 400, headers });
  try {
    const [result] = await readQueries<Project>([{ query: 'SELECT project_number, project_name, facility_name, location_address, location_city, location_county, current_status, type_of_work, registration_date, start_date, completion_date, fetched_at, estimated_cost, scope_of_work, owner_name, owner_contact_name, owner_phone, tenant_name, tenant_contact_name, tenant_phone, design_firm_name, design_firm_phone, project_url FROM public.projects WHERE project_number = $1 LIMIT 1', params: [projectNumber] }]);
    if (!result.rows.length) return NextResponse.json({ error: 'Project not found.' }, { status: 404, headers });
    return NextResponse.json(result.rows[0], { headers });
  } catch (error) { return NextResponse.json({ error: error instanceof DatabaseError ? error.message : 'Unable to load project.' }, { status: 503, headers }); }
}
