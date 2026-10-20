import { NextRequest, NextResponse } from 'next/server';
import { readQueries, DatabaseError } from '@/lib/db';
import { toResearchView } from '@/lib/research';
import type { Project, ProjectDetail } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const headers = { 'Cache-Control': 'private, no-store' };

const PROJECT_SQL = `SELECT project_number, project_name, facility_name, location_address, location_city, location_county,
  current_status, type_of_work, registration_date, start_date, completion_date, fetched_at, estimated_cost, scope_of_work,
  owner_name, owner_contact_name, owner_phone, owner_address, tenant_name, tenant_contact_name, tenant_phone, tenant_address,
  design_firm_name, design_firm_phone, design_firm_address, filer_contact_name, project_url
  FROM public.projects WHERE project_number = $1 LIMIT 1`;

const RESEARCH_SQL = `SELECT project_number, end_user_business, business_type, owner_entity, developer, architect,
  general_contractor, tenant_decision_makers, contact_phone, contact_email, contact_website, contact_linkedin,
  opening_timeline_evidence, likely_equipment_need, why_now, recommended_strategy, first_call_script, next_action,
  next_action_date, priority_score, confidence, researched_at, sources, notes
  FROM leads.project_research WHERE project_number = $1 LIMIT 1`;

export async function GET(_request: NextRequest, context: { params: Promise<{ projectNumber: string }> }) {
  const { projectNumber } = await context.params;
  if (!/^[A-Za-z0-9-]{1,40}$/.test(projectNumber)) return NextResponse.json({ error: 'Invalid project number.' }, { status: 400, headers });
  try {
    const [projectResult, researchResult] = await readQueries<Record<string, unknown>>([
      { query: PROJECT_SQL, params: [projectNumber] },
      { query: RESEARCH_SQL, params: [projectNumber] },
    ]);
    if (!projectResult.rows.length) return NextResponse.json({ error: 'Project not found.' }, { status: 404, headers });
    const project = projectResult.rows[0] as unknown as Project;
    const payload: ProjectDetail = {
      ...project,
      research: toResearchView(researchResult.rows[0] ?? null),
    };
    return NextResponse.json(payload, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof DatabaseError ? error.message : 'Unable to load project.' }, { status: 503, headers });
  }
}
