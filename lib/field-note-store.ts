import 'server-only';
import { readQueries } from './db';
import type { FieldNote, ProjectOverlay } from './field-notes';

export const NOTE_COLUMNS = `id::text AS id, project_number, rep, created_at, observed_at, raw_text,
  site_state, occupant_name, occupant_contact_name, occupant_phone, disposition, source, request_id,
  superseded_at, (superseded_at IS NOT NULL) AS superseded`;

export async function loadProjectOverlay(projectNumber: string): Promise<ProjectOverlay | null> {
  const [result] = await readQueries<ProjectOverlay>([{
    query: 'SELECT * FROM leads.project_overlay WHERE project_number = $1', params: [projectNumber],
  }]);
  return result.rows[0] ?? null;
}

export async function loadFieldNotes(projectNumber: string) {
  const [notes, overlay] = await readQueries<FieldNote | ProjectOverlay>([
    { query: `SELECT ${NOTE_COLUMNS} FROM leads.field_notes n WHERE project_number = $1 ORDER BY observed_at DESC, n.id DESC`, params: [projectNumber] },
    { query: 'SELECT * FROM leads.project_overlay WHERE project_number = $1', params: [projectNumber] },
  ]);
  return { notes: notes.rows as FieldNote[], overlay: (overlay.rows[0] as ProjectOverlay | undefined) ?? null };
}
