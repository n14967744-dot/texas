BEGIN;

CREATE SCHEMA IF NOT EXISTS leads;

-- Observations are appended; undo only sets superseded_at. State filings stay untouched.
CREATE TABLE IF NOT EXISTS leads.field_notes (
  id bigserial PRIMARY KEY,
  project_number text NOT NULL,
  rep text,
  created_at timestamptz NOT NULL DEFAULT now(),
  observed_at timestamptz NOT NULL DEFAULT now(),
  raw_text text,
  site_state text CHECK (site_state IN ('dirt', 'sitework', 'foundation', 'framing', 'dried_in', 'interior', 'complete', 'occupied', 'unknown')),
  occupant_name text,
  occupant_contact_name text,
  occupant_phone text,
  disposition text CHECK (disposition IN ('working', 'bad_lead', 'not_our_buyer', 'won', 'lost')),
  source text NOT NULL DEFAULT 'rep' CHECK (source IN ('rep', 'bot')),
  request_id text UNIQUE,
  superseded_at timestamptz
);

CREATE INDEX IF NOT EXISTS field_notes_project_observed_idx
  ON leads.field_notes (project_number, observed_at DESC);

-- Each field carries forward independently. Backdated notes are ordered by the
-- observation, with id breaking ties. Undo immediately exposes the prior value.
CREATE OR REPLACE VIEW leads.project_overlay AS
SELECT latest.*,
  COALESCE(disposition IN ('bad_lead', 'not_our_buyer', 'won', 'lost'), false) AS hidden
FROM (
  SELECT project_number,
    (array_agg(site_state ORDER BY observed_at DESC, id DESC) FILTER (WHERE site_state IS NOT NULL))[1] AS site_state,
    (array_agg(observed_at ORDER BY observed_at DESC, id DESC) FILTER (WHERE site_state IS NOT NULL))[1] AS site_state_observed_at,
    (array_agg(occupant_name ORDER BY observed_at DESC, id DESC) FILTER (WHERE occupant_name IS NOT NULL))[1] AS occupant_name,
    (array_agg(occupant_contact_name ORDER BY observed_at DESC, id DESC) FILTER (WHERE occupant_contact_name IS NOT NULL))[1] AS occupant_contact_name,
    (array_agg(occupant_phone ORDER BY observed_at DESC, id DESC) FILTER (WHERE occupant_phone IS NOT NULL))[1] AS occupant_phone,
    (array_agg(disposition ORDER BY observed_at DESC, id DESC) FILTER (WHERE disposition IS NOT NULL))[1] AS disposition,
    count(*) AS note_count,
    max(created_at) AS last_note_at
  FROM leads.field_notes
  WHERE superseded_at IS NULL
  GROUP BY project_number
) latest;

COMMIT;
