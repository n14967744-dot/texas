# Field notes API

Stage and timing labels are guesses from state filing dates. Reps and bots report
the real site status. Notes live separately from state data; the API never updates
`public.projects`.

Every field-notes request, including GET, requires:

```http
Authorization: Bearer <AGENT_API_TOKEN>
```

Configure `AGENT_API_TOKEN` only on the server. An unset or empty value disables all
field-notes API access (401). Never send the token to browser code or log it.
All responses are JSON with `Cache-Control: private, no-store`. Errors have an
`error` string: 400 for invalid input, 401 for auth, 404 for a missing project on
POST or a missing note on DELETE, 503 for database failures.

## Record an observation

`POST /api/field-notes` accepts these JSON fields:

| Field | Rules |
| --- | --- |
| `project_number` | Required, 1–40 letters, digits, or hyphens; must exist in `public.projects` |
| `rep` | Optional text, max 200 characters |
| `observed_at` | Optional ISO timestamp with explicit offset, e.g. `2026-10-20T14:30:00-05:00`; defaults to now |
| `raw_text` | Optional original spoken update, max 10,000 characters |
| `site_state` | `dirt`, `sitework`, `foundation`, `framing`, `dried_in`, `interior`, `complete`, `occupied`, `unknown`, or null |
| `occupant_name` | Optional text, max 500 characters |
| `occupant_contact_name` | Optional text, max 200 characters |
| `occupant_phone` | Optional text, max 100 characters |
| `disposition` | `working`, `bad_lead`, `not_our_buyer`, `won`, `lost`, or null |
| `source` | `rep` (default) or `bot` |
| `request_id` | Optional unique text, max 200 characters; use a stable ID per spoken update |

Text is trimmed; empty optional text becomes null. Null fields do not clear prior
overlay values. The newest non-null value for each field wins by `observed_at`,
then note ID to break ties. The overlay pairs the site state with that observation's
timestamp. `note_count` counts active notes; `last_note_at` is the latest creation
time. With no active notes the overlay is null.

```bash
curl "$BASE_URL/api/field-notes" \
  -H "Authorization: Bearer $AGENT_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"project_number":"TABS2027001470","rep":"Nick","observed_at":"2026-10-20T14:30:00-05:00","raw_text":"Framing is up. Occupant sign says Example Supply.","site_state":"framing","occupant_name":"Example Supply","disposition":"working","source":"bot","request_id":"spoken-update-example-001"}'
```

Returns `{ "note": {...}, "overlay": {...} }` with 201 for a new note. Retrying
with the same `request_id` returns the original note and its project's current
overlay with 200; it does not edit the note or revive an undone note. Request IDs
are global: never reuse one for another update or project. Without a request ID,
each POST appends a new note. Keep the request ID stable when retrying a timeout
or 503, since the insert may already have committed.

## Read history

`GET /api/field-notes?project=<project_number>` returns `{ "notes": [...],
"overlay": {...} }`, newest observed first (ID descending for ties). Each note
includes `superseded_at` and a `superseded` boolean. History includes undone
notes; the overlay and project modal exclude them. An unknown project returns an
empty history and null overlay.

```bash
curl "$BASE_URL/api/field-notes?project=TABS2027001470" \
  -H "Authorization: Bearer $AGENT_API_TOKEN"
```

## Undo an observation

`DELETE /api/field-notes/<id>` sets `superseded_at` and returns the note plus its
recalculated overlay. It never hard-deletes. Repeating DELETE is safe and preserves
the original undo timestamp. POST a new note to correct a mistaken observation.

```bash
curl -X DELETE "$BASE_URL/api/field-notes/123" \
  -H "Authorization: Bearer $AGENT_API_TOKEN"
```

Dispositions `bad_lead`, `not_our_buyer`, `won`, and `lost` hide projects from default
lists. “Show hidden” reveals them. A later `working` disposition or undoing the
hiding note can restore visibility (curated review hides still apply). A site
observation within 30 Chicago calendar days overrides the inferred timing label,
for example `Framing · seen Oct 20`.

## Grok Bot: match before writing

1. Identify the rep's office and search project name, address, and city within
   that office's radius. Use `GET /api/projects?office=bryan&radius=25&q=...&hidden=1`
   with URL-encoded search text; vary the name/address/city search as needed.
   Include hidden projects and check all result pages before counting matches.
2. If exactly one project matches the spoken description, POST its exact
   `project_number`. Preserve the rep's words in `raw_text`, use `source: "bot"`,
   and retain one stable `request_id` through retries.
3. If two or more match, present names and addresses and ask the rep to choose.
4. If none match, ask for more detail such as street address, city, or nearby
   landmark. Do not post until the project is identified.

Never guess which project, occupant, site state, or disposition the rep meant.
Leave unreported fields null. Use `observed_at` for the actual sighting time and
include its timezone offset; omit it only when the update describes now.
