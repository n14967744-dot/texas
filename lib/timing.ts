/**
 * One rep-facing timing label for lists, cards, and reports.
 * Today is an America/Chicago calendar date (see businessToday() in lib/query.ts).
 * Planned dates are never described as finished or occupied. A missing date is not
 * treated as reached. Age tags lower the sort priority; they do not hide a row.
 *
 * First match wins. A sighting from the last 30 Chicago days then replaces a
 * date-based label and drops its tag. Inspection and closed filings stay as
 * state signals. Sort SQL follows the filing only (sightings are not in the list query).
 */

export type TimingTag = 'Behind?' | 'Stale' | 'Needs drive-by';

export type TimingTone =
  | 'ahead'
  | 'active'
  | 'behind'
  | 'stale'
  | 'drive_by'
  | 'inspected'
  | 'closed'
  | 'seen'
  | 'unknown';

export type TimingInput = {
  start_date?: string | null;
  completion_date?: string | null;
  current_status?: string | null;
};

export type TimingSighting = {
  site_state: string;
  observed_at: string;
};

export type TimingInfo = {
  label: string;
  tag: TimingTag | null;
  flags: string[];
  tone: TimingTone;
};

export const TIMING_NOTE = 'From planned dates on the state filing, compared with today in America/Chicago. A site visit in the last 30 days replaces the date label. Not proof the building is finished or that anyone has moved in.';

const PLANS_NOT_REVIEWED = 'Plans not reviewed';
const BEHIND_DAYS = 90;
const STALE_DAYS = 180;
const SIGHTING_DAYS = 30;
const PLANS_LAG_DAYS = 60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const SITE_STATE_LABELS: Record<string, string> = {
  dirt: 'Dirt',
  sitework: 'Sitework',
  foundation: 'Foundation',
  framing: 'Framing',
  dried_in: 'Dried in',
  interior: 'Interior work',
  complete: 'Complete',
  occupied: 'Occupied',
  unknown: 'Checked',
};

function isoDate(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

/** Calendar days from `startIso` to `endIso`. Both are `YYYY-MM-DD`. */
function daysAfter(startIso: string, endIso: string): number {
  const start = Date.parse(`${startIso}T12:00:00Z`);
  const end = Date.parse(`${endIso}T12:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}

function monthYear(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

function monthDay(iso: string): string {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
}

/** Same Chicago calendar date as businessToday(), for a timestamp on a sighting. */
function chicagoIso(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function observedIso(value: string): string | null {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null;
  const parsed = new Date(trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(parsed.getTime())) return trimmed.slice(0, 10);
  return chicagoIso(parsed);
}

function siteStateLabel(value: string): string {
  const key = value.trim().toLowerCase();
  return SITE_STATE_LABELS[key] ?? 'Checked';
}

function plansFlag(status: string, start: string | null, today: string): string[] {
  if (status !== 'Project Registered' || !start || start > today) return [];
  return daysAfter(start, today) > PLANS_LAG_DAYS ? [PLANS_NOT_REVIEWED] : [];
}

function baseTiming(row: TimingInput, today: string): Omit<TimingInfo, 'flags'> {
  const status = (row.current_status || '').trim();
  if (status === 'Inspection Complete' || status === 'Inspection Completed') {
    return { label: 'Inspected', tag: null, tone: 'inspected' };
  }
  if (status === 'Project Closed') return { label: 'Closed', tag: null, tone: 'closed' };

  const start = isoDate(row.start_date);
  const finish = isoDate(row.completion_date);

  if (start && start > today) return { label: `Start: ${monthYear(start)}`, tag: null, tone: 'ahead' };
  if (finish && finish >= today) return { label: `Finish: ${monthYear(finish)}`, tag: null, tone: 'active' };
  if (finish && finish < today) {
    const age = daysAfter(finish, today);
    const label = `Finish was ${monthYear(finish)}`;
    if (age <= BEHIND_DAYS) return { label, tag: 'Behind?', tone: 'behind' };
    if (age <= STALE_DAYS) return { label, tag: 'Stale', tone: 'stale' };
    return { label, tag: 'Needs drive-by', tone: 'drive_by' };
  }
  if (start && start <= today) return { label: `Started: ${monthYear(start)}`, tag: null, tone: 'active' };
  return { label: 'Timing not listed', tag: null, tone: 'unknown' };
}

function recentSighting(sighting: TimingSighting | undefined, today: string): { state: string; seen: string } | null {
  if (!sighting?.site_state?.trim() || !sighting.observed_at) return null;
  const seen = observedIso(sighting.observed_at);
  if (!seen || seen > today || daysAfter(seen, today) > SIGHTING_DAYS) return null;
  return { state: siteStateLabel(sighting.site_state), seen };
}

export function timingInfo(row: TimingInput, today: string, sighting?: TimingSighting): TimingInfo {
  const status = (row.current_status || '').trim();
  const flags = plansFlag(status, isoDate(row.start_date), today);
  const base = baseTiming(row, today);
  if (base.tone === 'inspected' || base.tone === 'closed') return { ...base, flags };
  const seen = recentSighting(sighting, today);
  if (!seen) return { ...base, flags };
  return { label: `${seen.state} · seen ${monthDay(seen.seen)}`, tag: null, flags, tone: 'seen' };
}

/** Plain label, plus the age tag when there is one. Used by the CSV export. */
export function timingLabel(row: TimingInput, today: string, sighting?: TimingSighting): string {
  const info = timingInfo(row, today, sighting);
  return info.tag ? `${info.label} · ${info.tag}` : info.label;
}

const dateExpr = (column: string) => `NULLIF(${column}::text, '')::date`;

/**
 * Sort bucket. Lower numbers are the more actionable planned-date cases.
 * `today` is a bound placeholder (for example `$3`).
 * 1 future start · 2 finish today or later · 3 started, no finish ·
 * 4 finish 1–90 days ago · 5 finish 91–180 days ago · 6 finish older than 180 days ·
 * 7 inspected · 8 closed · 9 nothing listed.
 */
export function timingBucketSql(today: string): string {
  const start = dateExpr('start_date');
  const finish = dateExpr('completion_date');
  const day = `${today}::date`;
  return `(CASE WHEN current_status IN ('Inspection Complete', 'Inspection Completed') THEN 7`
    + ` WHEN current_status = 'Project Closed' THEN 8`
    + ` WHEN ${start} > ${day} THEN 1`
    + ` WHEN ${finish} >= ${day} THEN 2`
    + ` WHEN ${finish} >= ${day} - ${BEHIND_DAYS} THEN 4`
    + ` WHEN ${finish} >= ${day} - ${STALE_DAYS} THEN 5`
    + ` WHEN ${finish} < ${day} - ${STALE_DAYS} THEN 6`
    + ` WHEN ${start} <= ${day} THEN 3`
    + ` ELSE 9 END)`;
}

export function timingDateSql(today: string): string {
  const start = dateExpr('start_date');
  const finish = dateExpr('completion_date');
  const bucket = timingBucketSql(today);
  return `(CASE WHEN ${bucket} IN (1, 3) THEN ${start} WHEN ${bucket} IN (2, 4, 5, 6) THEN ${finish} ELSE NULL END)`;
}
