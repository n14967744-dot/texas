# CTWP Project Explorer

A portable Next.js App Router application with TypeScript, a table of real TABS projects, and centered Overview / Contacts dialogs. Uses CTWP's supplied logo and navy/red palette.

## Run locally

Requires Node.js 22.13+ (Node 24 also works).

```sh
npm ci
cp .env.example .env.local
```

Set `DATABASE_URL` in `.env.local` to your Neon PostgreSQL connection string. It stays on the server. Then:

```sh
npm run dev
```

Open http://localhost:3000. No schema changes or migrations are required.

## Deploy through GitHub and Vercel

1. Use this repository as the source, keeping `.env.local` out of Git.
2. Import the repository into Vercel. Use its Next.js framework preset.
3. Add `DATABASE_URL` to the Vercel project's environment variables, including Preview if needed.
4. Deploy. Use Vercel deployment protection if this internal browser should stay private; this v1 has no application login.

Vercel can use the default `npm run build` command. No Sites or Cloudflare setup is needed. Local secrets, installed dependencies, and build output are excluded from Git.

## Data and behavior

- Existing table: `public.projects`; records identified by `project_number`.
- Neon HTTPS SQL endpoint from the connection hostname; all calls use parameterized statements and a read-only transaction. Database reads are uncached; there is a 20-second request timeout.
- Office/county mappings are in `lib/offices.ts`. These are provisional; add counties after confirming territories.
- Default sort: registration date, newest first. Click column headers to sort; null dates stay last and project number breaks ties.
- Server-side search covers project/facility name, project number, address, and city. Percent and underscore are treated literally.
- Filters: territory county, city, original TABS status, registration and completion date ranges. Dates are inclusive.
- Recently registered: today and the preceding 29 calendar days, using America/Chicago. Completing soon: today through six calendar months ahead, regardless of TABS status.
- 10 / 25 / 50 rows per page. Filters and sorting are kept in the URL, so a view can be bookmarked.
- The dialog displays source details and contacts without losing the table's position. It supports Escape, focus trapping, and keyboard tab navigation.
- Last checked means the record's existing `fetched_at`, not an independent check of the live TABS website. Reload re-queries Neon; it does not scrape TABS.
- Missing information displays as “Not listed.” TABS statuses and estimated dates do not confirm opening, construction progress, or purchasing needs.

Notes, shortlists, login, outreach, and AI scoring are intentionally deferred. The web app only reads the database; the separate updater below writes verified source records. There are no fake/demo records.


## Smart Lists

Curated project lists live in `lib/smart-lists.ts`. Data centers is the first list; more can be added the same way.

- Catalog: `/lists`
- List page: `/lists/<id>` (example: `/lists/data-centers`)
- API: `GET /api/projects?list=<id>` — works with the existing office / coverage / city / status / date filters. Add `upcoming=1` for estimated completion on or after today, excluding Project Closed and Inspection Complete.

### Add a list

1. Append one object to `SMART_LISTS` in `lib/smart-lists.ts` (`id`, `title`, `description`, `include` / `exclude` regexes, optional fields and filters).
2. Open `/lists/<id>`. The catalog, nav, and `?list=` API param pick it up automatically.

Include/exclude patterns must work in both JavaScript and PostgreSQL `~*` (prefer `[\s\-_]*` and `(?:...)`; avoid `\b`). Matching is case-insensitive against project name, facility name, and scope by default.


### Radius coverage (smart lists)

On smart list pages, **Coverage** can be **Territory counties** (legacy office-county filter) or **Within N mi** of the selected office tab (30 / 60 / 100 miles, default 60). All Texas / All CTWP territories uses distance to the **nearest** office. Office coordinates are Census 2024 city centroids (no street addresses in-repo). Project coordinates are Census Geocoder address matches when available, else Gazetteer city/county centroids (`data/dc-geocodes.json`).

### Ranked priority lists (curated)

`/lists/bryan-priority` is a curated list: every project type within 60 mi of the Bryan office that is upcoming or still open, reviewed for office-equipment fit and ranked (timing → fit → size). Membership, rank, tier (Hot / Warm / Pipeline) and a one-line “why” note come from `lib/rankings/bryan-priority.ts`, registered in `lib/smart-list-rankings.ts`. Reviewed bad fits are listed there as `hidden` and use the same **Show hidden** badge/reason mechanism as `lib/smart-list-review.ts`. The list opens on the Bryan tab, 60 mi radius, sorted by `sort=rank`; CSV export adds `priority_rank`, `priority_tier`, `priority_note`.

To add a priority list for another office: add `lib/rankings/<id>.ts`, register it in `RANKINGS`, add a `SmartListDefinition` with `curated: true` and `defaultOffice`, and add any missing project geocodes to `data/project-geocodes.json` (regenerate `lib/project-geocodes-data.ts`). Curated lists are snapshots — new TABS filings do not appear until the ranking file is regenerated.

## Smart list review (hide / unhide)

Manual overrides live in `lib/smart-list-review.ts`, keyed by TABS `project_number` and list id. They are versioned in git (reversible) and do **not** change the Neon database.

| Decision | Effect |
| --- | --- |
| `hide` | Excluded from the smart list by default. Enable **Show hidden** (`hidden=1`) to see them with a red **Hidden** badge and reason. |
| `review` | Still listed; shows an amber **Review** badge with reason. |
| `keep` + `costNote` | Still listed; shows a **Cost note** badge (used for extreme cost outliers). |

To hide a project: add `{ projectNumber, listId, decision: 'hide', reason }` and open a PR. To unhide: remove that entry or change `decision` and merge. Keyword `exclude` patterns in `lib/smart-lists.ts` catch future obvious false positives; prefer specific phrases so real data-center shells with incidental “office” language are not dropped.


## Checks

```sh
npm test
npm run typecheck
npm run build
```

Tests cover query safety, calendar filters, smart-list matching, validation, and source-link safety. APIs: `GET /api/projects` (optional `list` / `upcoming`), `GET /api/projects/:projectNumber`.

## Prospects and coverage

- `/` browses projects; `/prospects` browses tenant and owner contacts.
- All CTWP territories is the default. All Texas includes every stored project; an outside-territories filter excludes the configured office counties. The database is not guaranteed to contain every Texas project.
- Prospect filters cover territory, tenant/owner role, search, and estimated completion (next six months, next 90 days, 91 days to six months, or any date).
- Prospect counts and construction values reflect the selected filters. Opening a prospect shows all linked projects across dates and territories, with contacts and individual project details.
- Grouping requires an exact normalized name and usable US phone number. Without a usable phone, records remain separate. A filing's tenant name may be a person rather than a business: these are contact groups, not verified business histories.
- `fetched_at` records the last successful detail-page refresh for that specific project. A daily discovery run does not mean every historical record was rechecked that day.

Additional APIs: `GET /api/prospects` and `GET /api/prospects/detail`.

## Daily source updates

`scripts/sync_tabs.py` uses the same public TDLR TABS search endpoint as the state's website, then parses the public project detail pages. No paid scraper service, browser, Python packages, or TABS account is needed. The website remains on Vercel; GitHub Actions runs the updater separately.

### Activate the schedule

1. In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**.
2. Name the secret `DATABASE_URL`; use the same Neon connection string as Vercel. Vercel environment variables are not automatically shared with GitHub Actions.
3. Open **Actions → Update TABS database → Run workflow** to verify a first run.

The workflow runs daily at **11:23 UTC** (6:23 a.m. Central daylight time / 5:23 a.m. Central standard time). GitHub can delay scheduled jobs. Public-repository schedules may be disabled after 60 days with no repository activity; check Actions periodically and re-enable the workflow if needed. Failed runs appear in Actions and can generate GitHub's normal workflow-failure notifications.

### What gets refreshed

- Discovery starts seven days before the last successful discovery watermark and continues through today in America/Chicago. On the first run it starts seven days before the latest stored registration date. An empty database requires an explicit `--since YYYY-MM-DD`.
- Every discovered project is fetched from its detail page and inserted or updated by `project_number`. The seven-day overlap catches late registrations and edits to recent filings; it is not a guarantee against arbitrarily backdated registrations.
- Retries reuse detail pages successfully checked in the preceding six hours. Writes are batched in groups of 25; a failed batch leaves the discovery checkpoint unchanged.
- Each daily run also rechecks up to 500 older detail pages, rotating oldest-first: 400 active/recent projects and 100 historical projects. Active/recent means estimated completion within the past 180 days or later (or unknown), excluding Project Closed and Inspection Completed. This is a refresh priority, not a claim about actual construction activity.
- Older records are therefore refreshed over multiple runs, **not all daily**. Adjust `--refresh-limit` in the workflow to change that budget. Source records not already in Neon and older than the discovery window require an explicit backfill.
- Source requests are limited to two starts per second across at most four workers, with timeouts and retries. Unexpected HTML, mismatched identifiers, incomplete sections, and invalid dates are rejected without overwriting the record.
- No projects are deleted. Existing `public.projects` columns are preserved; two small tracking tables, `public.tabs_sync_state` and `public.tabs_sync_runs`, record discovery progress, a run lease, counts, and success/failure. The first run creates them. A failure retains the discovery lower bound so the next run retries the gap.
- Database credentials are only read from the environment, never source code or log output. Keep the scheduled writer's connection in GitHub Actions secrets.

### Manual runs

With Python 3.12+ and `DATABASE_URL` exported in your shell:

```sh
python -m unittest discover -s tests -p 'test_tabs_sync.py' -v
python scripts/sync_tabs.py --dry-run --max-projects 3 --refresh-limit 0
python scripts/sync_tabs.py
# Explicit catch-up/backfill; includes the start date:
python scripts/sync_tabs.py --since 2026-09-28 --refresh-limit 0
```

`--dry-run` never creates tracking tables or writes projects. `--max-projects` is for testing and never advances the discovery watermark. Failed records leave the job failed while preserving successful upserts; retrying is safe. The updater does not load `.env.local` automatically.

### Priority reports (`/reports/<list-id>`)

Any ranking in `lib/rankings/` that includes a `report` block (office, radius, scanned/reviewed counts, focus cities, method and assumptions in plain English) gets a read-only report at `/reports/<list-id>`, listed on `/reports` and linked from the list page ("View priority report →"). The report shows the Hot tier first, Hot projects in the focus cities, collapsible Warm/Pipeline sections, hidden-by-reason counts and the scoring method. Project details (name, city, cost, completion) are read live from the database; project links open the row's details in the sortable list (`?open=<TABS#>`).
