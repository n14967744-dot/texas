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

Notes, shortlists, login, outreach, AI scoring, and scraper scheduling are intentionally deferred. There are no database writes or fake/demo records.

## Checks

```sh
npm test
npm run typecheck
npm run build
```

Tests cover query safety, calendar filters, validation, and source-link safety. APIs: `GET /api/projects` and `GET /api/projects/:projectNumber`.

## Prospects and coverage

- `/` browses projects; `/prospects` browses tenant and owner contacts.
- All CTWP territories is the default. All Texas includes every stored project; an outside-territories filter excludes the configured office counties. The database is not guaranteed to contain every Texas project.
- Prospect filters cover territory, tenant/owner role, search, and estimated completion (next six months, next 90 days, 91 days to six months, or any date).
- Prospect counts and construction values reflect the selected filters. Opening a prospect shows all linked projects across dates and territories, with contacts and individual project details.
- Grouping requires an exact normalized name and usable US phone number. Without a usable phone, records remain separate. A filing's tenant name may be a person rather than a business: these are contact groups, not verified business histories.
- There is no scraper or automatic database refresh in this repository. `fetched_at` records the existing source sync time.

Additional APIs: `GET /api/prospects` and `GET /api/prospects/detail`.
