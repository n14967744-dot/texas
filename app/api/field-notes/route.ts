import { isAgentAuthorized } from '@/lib/agent-auth';
import { readQueries } from '@/lib/db';
import { writeQueries } from '@/lib/write';
import { FieldNoteValidationError, parseFieldNote, validProjectNumber, type FieldNote } from '@/lib/field-notes';
import { loadFieldNotes, loadProjectOverlay, NOTE_COLUMNS } from '@/lib/field-note-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function GET(request: Request) {
  if (!isAgentAuthorized(request)) return json({ error: 'Unauthorized.' }, 401);
  const project = new URL(request.url).searchParams.get('project');
  if (!validProjectNumber(project)) return json({ error: 'Invalid project query parameter.' }, 400);
  try {
    return json(await loadFieldNotes(project));
  } catch { return json({ error: 'Unable to load field notes.' }, 503); }
}

export async function POST(request: Request) {
  if (!isAgentAuthorized(request)) return json({ error: 'Unauthorized.' }, 401);
  let body: unknown;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON body.' }, 400); }
  try {
    const input = parseFieldNote(body);
    const [project] = await readQueries<{ project_number: string }>([{
      query: 'SELECT project_number FROM public.projects WHERE project_number = $1 LIMIT 1', params: [input.project_number],
    }]);
    if (!project.rows.length) return json({ error: 'Project not found.' }, 404);
    const [inserted] = await writeQueries<FieldNote>([{
      query: `INSERT INTO leads.field_notes (project_number, rep, observed_at, raw_text, site_state,
        occupant_name, occupant_contact_name, occupant_phone, disposition, source, request_id)
        VALUES ($1, $2, COALESCE($3::timestamptz, now()), $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (request_id) DO NOTHING RETURNING ${NOTE_COLUMNS}`,
      params: [input.project_number, input.rep, input.observed_at, input.raw_text, input.site_state,
        input.occupant_name, input.occupant_contact_name, input.occupant_phone, input.disposition, input.source, input.request_id],
    }]);
    let note = inserted.rows[0];
    if (!note && input.request_id) {
      // A separate read after the insert commits also sees a concurrent retry's row.
      const [existing] = await readQueries<FieldNote>([{
        query: `SELECT ${NOTE_COLUMNS} FROM leads.field_notes WHERE request_id = $1`, params: [input.request_id],
      }]);
      note = existing.rows[0];
    }
    if (!note) return json({ error: 'Unable to save field note.' }, 503);
    const overlay = await loadProjectOverlay(note.project_number);
    return json({ note, overlay }, inserted.rows.length ? 201 : 200);
  } catch (error) {
    return error instanceof FieldNoteValidationError
      ? json({ error: error.message }, 400)
      : json({ error: 'Unable to save field note.' }, 503);
  }
}
