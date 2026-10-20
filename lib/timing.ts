import { monthsFromToday } from './stage.ts';

/**
 * One rep-facing timing label. State inspection / closed wording is only used
 * when the filing says so. Planned dates are never described as built, occupied,
 * or "likely moving in". A missing date is not treated as reached or passed.
 */
export type TimingInput = {
  start_date?: string | null;
  completion_date?: string | null;
  current_status?: string | null;
};

const INSPECTION_STATUSES = new Set(['Inspection Complete', 'Inspection Completed']);

function isoDate(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

export function timingLabel(row: TimingInput, today: string): string {
  const status = row.current_status || '';
  if (INSPECTION_STATUSES.has(status)) return 'State inspection complete';
  if (status === 'Project Closed') return 'State filing closed';

  const start = isoDate(row.start_date);
  const finish = isoDate(row.completion_date);

  if (start && start > today) {
    const rel = monthsFromToday(start, today);
    return rel ? `Planned to start ${rel}` : 'Planned to start';
  }
  if (finish && finish >= today) {
    const rel = monthsFromToday(finish, today);
    return rel ? `Planned finish ${rel}` : 'Planned finish';
  }
  if (finish && finish < today) return 'Planned finish passed (status not confirmed)';
  if (start && start <= today) {
    const rel = monthsFromToday(start, today);
    if (!rel || rel === 'this month') return 'Planned start passed this month';
    return `Planned start passed ${rel}`;
  }
  return 'Timing not listed';
}

const dateExpr = (column: string) => `NULLIF(${column}::text, '')::date`;

/** Sort bucket. Lower numbers are the more actionable planned-date cases. `today` is a bound placeholder. */
export function timingBucketSql(today: string): string {
  const start = dateExpr('start_date');
  const finish = dateExpr('completion_date');
  return `(CASE WHEN current_status IN ('Inspection Complete', 'Inspection Completed') THEN 5`
    + ` WHEN current_status = 'Project Closed' THEN 6`
    + ` WHEN ${start} > ${today}::date THEN 1`
    + ` WHEN ${finish} >= ${today}::date THEN 2`
    + ` WHEN ${finish} < ${today}::date THEN 4`
    + ` WHEN ${start} <= ${today}::date THEN 3`
    + ` ELSE 7 END)`;
}

export function timingDateSql(today: string): string {
  const start = dateExpr('start_date');
  const finish = dateExpr('completion_date');
  const bucket = timingBucketSql(today);
  return `(CASE WHEN ${bucket} = 1 THEN ${start} WHEN ${bucket} = 2 THEN ${finish}`
    + ` WHEN ${bucket} = 3 THEN ${start} WHEN ${bucket} = 4 THEN ${finish} ELSE NULL END)`;
}
