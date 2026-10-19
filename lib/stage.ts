/**
 * Derived project stage — computed from the state filing's planned dates and status,
 * relative to today in America/Chicago. Shared by SQL (filter/sort/counts) and UI.
 * Based on planned dates in the state filing, not confirmed site progress.
 *
 * Rules (first match wins):
 *   built              status is Inspection Complete or Project Closed
 *   not_started        planned start is after today
 *   past_due           planned finish is before today (not built) — likely moving in
 *   finishing_soon     planned finish is today .. today + 90 days
 *   under_construction planned start on/before today (finish > 90 days out or not listed)
 *   unknown            otherwise (no planned start, and no finish within the rules above)
 */
export const STAGES = ['not_started', 'under_construction', 'finishing_soon', 'past_due', 'built', 'unknown'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  not_started: 'Not started',
  under_construction: 'Under construction',
  finishing_soon: 'Finishing soon',
  past_due: 'Past due, likely moving in',
  built: 'Built',
  unknown: 'Unknown',
};

export const STAGE_NOTE = 'Based on planned dates in the state filing, not confirmed site progress.';
export const FINISHING_SOON_DAYS = 90;
export const BUILT_STATUSES = ['Inspection Complete', 'Project Closed'] as const;

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

/** Parse a comma-separated stage param; throws on unknown values. */
export function parseStages(raw: string): Stage[] {
  if (!raw) return [];
  const values = [...new Set(raw.split(',').map((v) => v.trim()).filter(Boolean))];
  for (const v of values) if (!isStage(v)) throw new Error(`Invalid stage: ${v.slice(0, 40)}`);
  return values as Stage[];
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const isoDate = (value: string | null | undefined) => (value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);

export function deriveStage(
  row: { start_date?: string | null; completion_date?: string | null; current_status?: string | null },
  today: string,
): Stage {
  if (row.current_status && (BUILT_STATUSES as readonly string[]).includes(row.current_status)) return 'built';
  const start = isoDate(row.start_date);
  const finish = isoDate(row.completion_date);
  if (start && start > today) return 'not_started';
  if (finish && finish < today) return 'past_due';
  if (finish && finish <= addDays(today, FINISHING_SOON_DAYS)) return 'finishing_soon';
  if (start) return 'under_construction';
  return 'unknown';
}

/**
 * SQL CASE producing the stage id. `today` must be a bound parameter placeholder
 * (e.g. "$3") or a trusted DATE literal.
 */
export function stageSql(today: string): string {
  const start = `NULLIF(start_date::text, '')::date`;
  return `(CASE WHEN current_status IN ('Inspection Complete', 'Project Closed') THEN 'built'`
    + ` WHEN ${start} > ${today}::date THEN 'not_started'`
    + ` WHEN completion_date < ${today}::date THEN 'past_due'`
    + ` WHEN completion_date <= ${today}::date + ${FINISHING_SOON_DAYS} THEN 'finishing_soon'`
    + ` WHEN ${start} IS NOT NULL THEN 'under_construction'`
    + ` ELSE 'unknown' END)`;
}

/** Sort order for stage (pipeline order: earliest stage first). */
export function stageOrderSql(today: string): string {
  return `array_position(ARRAY[${STAGES.map((s) => `'${s}'`).join(',')}]::text[], ${stageSql(today)})`;
}

/** "this month", "in 2 mo", "3 mo ago" — calendar-month difference from today. */
export function monthsFromToday(date: string | null | undefined, today: string): string | null {
  const iso = isoDate(date);
  if (!iso) return null;
  const diff = (Number(iso.slice(0, 4)) - Number(today.slice(0, 4))) * 12 + (Number(iso.slice(5, 7)) - Number(today.slice(5, 7)));
  if (diff === 0) return 'this month';
  return diff > 0 ? `in ${diff} mo` : `${-diff} mo ago`;
}
