import { isAgentAuthorized } from '@/lib/agent-auth';
import { readQueries } from '@/lib/db';
import { briefOffice, buildBriefQuery, shapeBrief, type BriefRow } from '@/lib/brief';
import { businessToday } from '@/lib/timing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function GET(request: Request) {
  if (!isAgentAuthorized(request)) return json({ error: 'Unauthorized.' }, 401);
  const office = briefOffice(new URL(request.url).searchParams.get('office'));
  if (!office) return json({ error: 'Unknown or unavailable office.' }, 400);
  const now = new Date();
  try {
    const [result] = await readQueries<BriefRow>([buildBriefQuery(office, businessToday(now))]);
    return json(shapeBrief(result.rows, office, now));
  } catch { return json({ error: 'Unable to load daily brief.' }, 503); }
}
