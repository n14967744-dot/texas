import type { TimingSighting } from './timing.ts';

export const SITE_STATES = ['dirt', 'sitework', 'foundation', 'framing', 'dried_in', 'interior', 'complete', 'occupied', 'unknown'] as const;
export const DISPOSITIONS = ['working', 'bad_lead', 'not_our_buyer', 'won', 'lost'] as const;
export type SiteState = typeof SITE_STATES[number];
export type Disposition = typeof DISPOSITIONS[number];

export interface FieldNoteInput {
  project_number: string;
  rep: string | null;
  observed_at: string | null;
  raw_text: string | null;
  site_state: SiteState | null;
  occupant_name: string | null;
  occupant_contact_name: string | null;
  occupant_phone: string | null;
  disposition: Disposition | null;
  source: 'rep' | 'bot';
  request_id: string | null;
}

export interface FieldNote extends Omit<FieldNoteInput, 'observed_at'> {
  id: string;
  created_at: string;
  observed_at: string;
  superseded_at: string | null;
  superseded: boolean;
}

export interface ProjectOverlay {
  project_number: string;
  site_state: SiteState | null;
  site_state_observed_at: string | null;
  occupant_name: string | null;
  occupant_contact_name: string | null;
  occupant_phone: string | null;
  disposition: Disposition | null;
  hidden: boolean;
  note_count: string | number;
  last_note_at: string;
}

/** Adapt the joined overlay to Section 1's pure Chicago-calendar timing override. */
export function projectSighting(overlay: {
  site_state?: string | null;
  site_state_observed_at?: string | null;
}): TimingSighting | undefined {
  return overlay.site_state && overlay.site_state_observed_at
    ? { site_state: overlay.site_state, observed_at: overlay.site_state_observed_at }
    : undefined;
}

export class FieldNoteValidationError extends Error {}

export function validProjectNumber(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(value);
}

export function parseFieldNote(value: unknown): FieldNoteInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FieldNoteValidationError('Expected a JSON object.');
  const body = value as Record<string, unknown>;
  const text = (key: string, max: number): string | null => {
    const raw = body[key];
    if (raw === undefined || raw === null) return null;
    if (typeof raw !== 'string' || raw.length > max || raw.includes('\0')) throw new FieldNoteValidationError(`${key} must be text of at most ${max} characters.`);
    return raw.trim() || null;
  };
  const project_number = text('project_number', 40);
  if (!validProjectNumber(project_number)) throw new FieldNoteValidationError('Invalid project_number.');
  const enumValue = <T extends string>(key: string, allowed: readonly T[]): T | null => {
    if (body[key] == null) return null;
    if (typeof body[key] !== 'string' || !allowed.includes(body[key] as T)) throw new FieldNoteValidationError(`Invalid ${key}.`);
    return body[key] as T;
  };
  const observed_at = text('observed_at', 40);
  if (body.observed_at != null) {
    // Explicit offset avoids interpreting spoken dates in the server timezone.
    if (!observed_at || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(observed_at)
      || !Number.isFinite(Date.parse(observed_at))
      || new Date(`${observed_at.slice(0, 10)}T12:00:00Z`).toISOString().slice(0, 10) !== observed_at.slice(0, 10)
      || Number(observed_at.slice(11, 13)) > 23) {
      throw new FieldNoteValidationError('observed_at must be a valid ISO timestamp with a timezone offset.');
    }
  }
  return {
    project_number, observed_at,
    rep: text('rep', 200), raw_text: text('raw_text', 10000),
    site_state: enumValue('site_state', SITE_STATES),
    occupant_name: text('occupant_name', 500), occupant_contact_name: text('occupant_contact_name', 200),
    occupant_phone: text('occupant_phone', 100), disposition: enumValue('disposition', DISPOSITIONS),
    source: enumValue('source', ['rep', 'bot']) ?? 'rep', request_id: text('request_id', 200),
  };
}
