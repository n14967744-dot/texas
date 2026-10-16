import { NextRequest, NextResponse } from 'next/server';
import { readQueries, DatabaseError } from '@/lib/db';
import { getOffice, TERRITORY_COUNTIES } from '@/lib/offices';
import { businessToday } from '@/lib/query';
import { parseProspectFilters, prospectBase, prospectWhere, PROSPECT_SORTS, ProspectFilterError } from '@/lib/prospects';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: NextRequest) {
  try {
    const f = parseProspectFilters(request.nextUrl.searchParams), office = getOffice(f.office);
    if (!office) throw new ProspectFilterError('Unknown territory.');
    const {where,params} = prospectWhere(f,office.counties,TERRITORY_COUNTIES,businessToday());
    const base = `${prospectBase(f.role)}, matching AS (SELECT * FROM identified WHERE ${where}), grouped AS (
      SELECT prospect_id AS id, min(prospect_name) AS name,
      array_agg(DISTINCT contact_name ORDER BY contact_name) FILTER (WHERE contact_name IS NOT NULL) AS contacts,
      array_agg(DISTINCT contact_phone ORDER BY contact_phone) FILTER (WHERE contact_phone IS NOT NULL) AS phones,
      array_agg(DISTINCT location_city ORDER BY location_city) FILTER (WHERE location_city IS NOT NULL AND location_city <> '') AS cities,
      array_agg(DISTINCT location_county ORDER BY location_county) FILTER (WHERE location_county IS NOT NULL AND location_county <> '') AS counties,
      count(*)::int AS project_count, sum(estimated_cost) AS total_value, count(estimated_cost)::int AS known_cost_count,
      min(completion_date) FILTER (WHERE completion_date >= $1::date) AS next_completion,
      max(fetched_at) AS latest_fetch, bool_and(match_phone IS NOT NULL) AS matched_by_phone
      FROM matching GROUP BY prospect_id)`;
    const count = await readQueries<{total:string}>([{query:`${base} SELECT count(*) AS total FROM grouped`,params}]);
    const total=Number(count[0].rows[0].total), pageSize=25, pages=Math.max(1,Math.ceil(total/pageSize)), page=Math.min(f.page,pages);
    const rows=await readQueries<Record<string,unknown>>([{query:`${base} SELECT * FROM grouped ORDER BY ${PROSPECT_SORTS[f.sort]} ${f.direction.toUpperCase()} NULLS LAST, id ASC LIMIT 25 OFFSET $${params.length+1}`,params:[...params,(page-1)*pageSize]}]);
    return NextResponse.json({prospects:rows[0].rows.map(r=>({...r,contacts:r.contacts||[],phones:r.phones||[],cities:r.cities||[],counties:r.counties||[]})),total,page,pages,pageSize},{headers});
  } catch(e) { return NextResponse.json({error:e instanceof ProspectFilterError || e instanceof DatabaseError ? e.message : 'Unable to load prospects. Please try again.'},{status:e instanceof ProspectFilterError?400:503,headers}); }
}
