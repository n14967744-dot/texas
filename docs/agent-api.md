# Agent API

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

## Daily brief

`GET /api/v1/brief?office=bryan` is a read-only bot briefing. It uses the same
`Authorization: Bearer <AGENT_API_TOKEN>` check as field notes. Missing or invalid
credentials, including an unset/empty server token, return 401 before any DB read.
Every response is JSON with `Cache-Control: private, no-store`. Invalid offices
return 400; database failures return a sanitized 503 with an `error` string.

The only parameter is `office`, defaulting to `bryan` when omitted. Currently
`bryan` and `waco` are supported, matching the visible offices in `lib/offices.ts`.
Unknown/hidden offices, an empty value, and `texas`/`all` are rejected. The radius
is fixed at 25 straight-line miles. Census address matches or approximate city/
county centroids determine inclusion; unknown locations are excluded. Each item's
`precision` (`address`, `city`, `county`) identifies the location's precision.
Hidden field-note overlays are excluded from every section.

```bash
curl "$BASE_URL/api/v1/brief?office=bryan" \
  -H "Authorization: Bearer $AGENT_API_TOKEN"
```

Response shape (empty lists shown):

```json
{
  "generated_at": "2026-10-20T15:00:00.000Z",
  "office": { "id": "bryan", "name": "Bryan–College Station" },
  "radius_mi": 25,
  "business_date": "2026-10-20",
  "new_filings": {
    "last_1_day": [],
    "last_7_days": [],
    "counts": { "last_1_day": 0, "last_7_days": 0 },
    "limit": 25
  },
  "newly_inspected_or_closed_last_7_days": {
    "items": [], "count": 0, "limit": 25, "date_basis": "fetched_at"
  },
  "drive_by": { "items": [], "count": 0, "limit": 15 },
  "top_ranked": { "items": [], "count": 0, "limit": 10, "source": "bryan-priority" },
  "notes": ["No reliable status-change date exists in public.projects. The status section uses fetched_at, a refresh timestamp rather than a transition date."]
}
```

Every item includes `project_number`, `name` (project name, then facility name,
then project number), `city`, numeric or null `estimated_cost`, rounded
`distance_mi`, `precision`, `registration_date`, `current_status`, `fetched_at`,
`timing_label`, nullable `timing_tag`, and `timing_flags`. Counts include all
matching rows before each response cap. Project number breaks ordering ties.

- `business_date` uses America/Chicago. Filing windows include both endpoints:
  today minus 1 or 7 calendar days through today, matching the browser's inclusive
  date filters. Future registration dates are excluded. Filings sort newest first.
- **Status limitation:** there is no reliable status-change date in the project
  schema. The status section selects current `Inspection Complete`,
  `Inspection Completed`, or `Project Closed` rows whose `fetched_at` falls from
  today minus 7 Chicago calendar days through the generation instant, newest
  refresh first. This is a recently refreshed status signal, not evidence that
  the status changed in that window. Old statuses can reappear on refresh;
  transitions not yet refreshed can be missed. The response's `notes` and
  `date_basis` explicitly report this limitation. Inspected does not mean
  occupied; Closed does not prove construction completion or cancellation.
- `drive_by` selects `Behind?`, `Stale`, and `Needs drive-by` tags using the shared
  timing rules, highest estimated cost first (null costs last). A sighting within
  30 Chicago days overrides the inferred tag and removes the item from this section.
- `top_ranked` uses the office's curated default ranked list when available
  (currently Bryan Priority), excluding curated hides and overlay hides. It
  preserves the browser's rank ordering, including demoting filings whose planned
  finish is over 180 days old. If no ranking exists, it selects the highest-cost
  active leads, excluding inspected and closed statuses, and `source` is
  `estimated_cost`. An existing but empty ranking does not trigger the fallback.

### Daily sync configuration

The repository owner must configure the GitHub Actions **repository secret
`DATABASE_URL`**; without it, the daily workflow fails immediately with a clear
annotation. After a successful TABS sync, geocoding processes up to 3,000 missing/
changed project addresses in batches of 500. It uses only Python's standard
library, caches both matches and no-matches, and skips unchanged addresses on
subsequent runs. Census failures are logged per chunk and leave those addresses
pending for a later run. The geocode step has a 20-minute timeout and cannot fail
the sync job. After obtaining the sync lease, the updater marks other `running`
run records older than its three-hour lease window as `abandoned`.
