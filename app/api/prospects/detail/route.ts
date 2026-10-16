import { NextRequest, NextResponse } from 'next/server';
import { readQueries, DatabaseError } from '@/lib/db';
import { parseProspectFilters, prospectBase, ProspectFilterError } from '@/lib/prospects';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  try {
    const p=request.nextUrl.searchParams, f=parseProspectFilters(p), id=p.get('id')||'';
    if (!/^[a-f0-9]{32}$/.test(id)) throw new ProspectFilterError('Invalid prospect.');
    const base=prospectBase(f.role);
    const count=await readQueries<{total:string; name:string; total_value:string|null; contacts:{name:string|null;phone:string|null}[]}>([{query:`${base} SELECT count(*) AS total, min(prospect_name) AS name, sum(estimated_cost) AS total_value, jsonb_agg(DISTINCT jsonb_build_object('name',contact_name,'phone',contact_phone)) FILTER (WHERE contact_name IS NOT NULL OR contact_phone IS NOT NULL) AS contacts FROM identified WHERE prospect_id=$1`,params:[id]}]);
    const total=Number(count[0].rows[0].total);
    if (!total) return NextResponse.json({error:'Prospect not found.'},{status:404,headers});
    const pages=Math.ceil(total/20),page=Math.min(f.page,pages);
    const rows=await readQueries<Record<string,unknown>>([{query:`${base} SELECT project_number,project_name,facility_name,location_address,location_city,location_county,current_status,type_of_work,scope_of_work,estimated_cost,registration_date,completion_date,fetched_at,contact_name,contact_phone,prospect_name FROM identified WHERE prospect_id=$1 ORDER BY completion_date DESC NULLS LAST,project_number ASC LIMIT 20 OFFSET $2`,params:[id,(page-1)*20]}]);
    return NextResponse.json({projects:rows[0].rows,total,page,pages,summary:count[0].rows[0]},{headers});
  } catch(e) { return NextResponse.json({error:e instanceof ProspectFilterError || e instanceof DatabaseError?e.message:'Unable to load prospect details.'},{status:e instanceof ProspectFilterError?400:503,headers}); }
}
