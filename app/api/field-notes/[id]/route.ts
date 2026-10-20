import { isAgentAuthorized } from '@/lib/agent-auth';
import { writeQueries } from '@/lib/write';
import { loadProjectOverlay, NOTE_COLUMNS } from '@/lib/field-note-store';
import type { FieldNote } from '@/lib/field-notes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isAgentAuthorized(request)) return json({ error: 'Unauthorized.' }, 401);
  const { id } = await context.params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return json({ error: 'Invalid note id.' }, 400);
  try {
    const [result] = await writeQueries<FieldNote>([{
      query: `UPDATE leads.field_notes SET superseded_at = COALESCE(superseded_at, now()) WHERE id = $1::bigint RETURNING ${NOTE_COLUMNS}`,
      params: [id],
    }]);
    const note = result.rows[0];
    if (!note) return json({ error: 'Field note not found.' }, 404);
    const overlay = await loadProjectOverlay(note.project_number);
    return json({ note, overlay });
  } catch { return json({ error: 'Unable to undo field note.' }, 503); }
}
