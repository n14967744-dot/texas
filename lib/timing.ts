/**
 * One rep-facing timing label for lists, cards, and reports.
 * Today and sightings use America/Chicago calendar days, including across DST.
 * Planned dates are never described as finished or occupied. A missing date is not
 * treated as reached. Age tags lower the sort priority; they do not hide a row.
 *
 * First match wins. A sighting from the last 30 Chicago days then replaces a
 * label and drops its inferred age tag. Older valid sightings prevent the
 * no-sighting Needs drive-by tag, but leave the date label and Stale tag.
 * Sort SQL follows the filing only; displayed labels can use the overlay sighting.
 */

export type TimingTag = 'Behind?' | 'Stale' | 'Needs drive-by';
export type TimingFlag = 'Plans not reviewed';

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
  flags: TimingFlag[];
  tone: TimingTone;
};

export const TIMING_NOTE = 'Planned dates are estimates, compared with today in America/Chicago. Behind?, Stale and Needs drive-by prompt a site visit to confirm. A sighting within 30 days overrides the timing label. Inspected signals construction done, not occupancy; Closed describes the filing, not the site.';

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
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(value)) return null;
  const iso = value.slice(0, 10);
  const parsed = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
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

/** Shared business clock. Date-only filing values are already calendar dates. */
export function businessToday(now = new Date()): string {
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
  if (!isoDate(trimmed)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Require an explicit offset: never interpret a sighting in the host timezone.
  if (!/(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(trimmed)) return null;
  const parsed = new Date(trimmed.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(parsed.getTime())) return null;
  return businessToday(parsed);
}

export function siteStateLabel(value: string): string {
  const key = value.trim().toLowerCase();
  return SITE_STATE_LABELS[key] ?? 'Checked';
}

function plansFlag(status: string, start: string | null, today: string): TimingFlag[] {
  if (status !== 'Project Registered' || !start || start > today) return [];
  return daysAfter(start, today) > PLANS_LAG_DAYS ? [PLANS_NOT_REVIEWED] : [];
}

function baseTiming(row: TimingInput, today: string, hasSighting: boolean): Omit<TimingInfo, 'flags'> {
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
    if (age <= STALE_DAYS || hasSighting) return { label, tag: 'Stale', tone: 'stale' };
    return { label, tag: 'Needs drive-by', tone: 'drive_by' };
  }
  if (start && start <= today) return { label: `Planned start: ${monthYear(start)}`, tag: null, tone: 'active' };
  return { label: 'Timing not listed', tag: null, tone: 'unknown' };
}

function validSighting(sighting: TimingSighting | undefined, today: string): { state: string; seen: string } | null {
  if (!sighting?.site_state?.trim() || !sighting.observed_at) return null;
  const seen = observedIso(sighting.observed_at);
  if (!seen || seen > today) return null;
  return { state: siteStateLabel(sighting.site_state), seen };
}

/** A string clock is a Chicago YYYY-MM-DD; a Date clock is converted to Chicago. */
export function timingInfo(row: TimingInput, clock: string | Date = new Date(), sighting?: TimingSighting): TimingInfo {
  const today = clock instanceof Date ? businessToday(clock) : isoDate(clock);
  if (!today || (typeof clock === 'string' && clock !== today)) throw new Error('Invalid timing business date.');
  const status = (row.current_status || '').trim();
  const flags = plansFlag(status, isoDate(row.start_date), today);
  const seen = validSighting(sighting, today);
  const base = baseTiming(row, today, Boolean(seen));
  if (!seen || daysAfter(seen.seen, today) > SIGHTING_DAYS) return { ...base, flags };
  return { label: `${seen.state} · seen ${monthDay(seen.seen)}`, tag: null, flags, tone: 'seen' };
}

/** Plain text with every tag, for exports and other non-visual consumers. */
export function timingLabel(row: TimingInput, today: string | Date = new Date(), sighting?: TimingSighting): string {
  const info = timingInfo(row, today, sighting);
  return [info.label, info.tag, ...info.flags].filter(Boolean).join(' · ');
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
  return `(CASE WHEN TRIM(current_status) IN ('Inspection Complete', 'Inspection Completed') THEN 7`
    + ` WHEN TRIM(current_status) = 'Project Closed' THEN 8`
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
