import { DEFAULT_OFFICE_ID, getOfficeBranch, type OfficeBranch } from './offices.ts';
import { buildWhere, FILTER_DEFAULTS, type SqlQuery } from './query.ts';
import { businessToday, timingInfo } from './timing.ts';
import { projectSighting } from './field-notes.ts';
import { SMART_LISTS } from './smart-lists.ts';
import { getRanking } from './smart-list-rankings.ts';
import { hiddenProjectNumbers } from './smart-list-review.ts';
import type { ProjectRow } from './types.ts';

export const BRIEF_RADIUS_MI = 25;
export const BRIEF_STATUS_NOTE = 'No reliable status-change date exists in public.projects. newly_inspected_or_closed_last_7_days uses current Inspection Complete/Inspection Completed/Project Closed status and fetched_at in the last 7 days. fetched_at is a refresh timestamp, not a transition date: older statuses can reappear and transitions not yet refreshed can be missed.';

export type BriefRow = Pick<ProjectRow, 'project_number' | 'project_name' | 'facility_name' | 'location_city'
  | 'estimated_cost' | 'registration_date' | 'current_status' | 'start_date' | 'completion_date'
  | 'fetched_at' | 'site_state' | 'site_state_observed_at' | 'overlay_hidden'> & {
    distance_mi: string | number | null;
    geo_precision: string | null;
  };

/** Match the browser's visible branch scopes; All Texas has no office radius. */
export function briefOffice(value: string | null): OfficeBranch | undefined {
  const office = getOfficeBranch(value ?? DEFAULT_OFFICE_ID);
  return office?.visible ? office : undefined;
}

/** Read the complete radius pool so counts and rankings are computed before response caps. */
export function buildBriefQuery(office: OfficeBranch, today: string): SqlQuery {
  const compiled = buildWhere({ ...FILTER_DEFAULTS, office: office.id, radius: BRIEF_RADIUS_MI }, today);
  return {
    query: `SELECT project_number, project_name, facility_name, location_city, estimated_cost,
      registration_date, current_status, start_date, completion_date, fetched_at,
      distance_mi, geo_precision, site_state, site_state_observed_at, overlay_hidden
      FROM ${compiled.from} WHERE ${compiled.where}`,
    params: compiled.params,
  };
}

function daysBefore(today: string, days: number): string {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function numberOrNull(value: string | number | null): number | null {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

const terminal = (row: BriefRow) => ['Inspection Complete', 'Inspection Completed', 'Project Closed'].includes(row.current_status?.trim() ?? '');
const tie = (a: BriefRow, b: BriefRow) => a.project_number.localeCompare(b.project_number);
const costOrder = (a: BriefRow, b: BriefRow) => (numberOrNull(b.estimated_cost) ?? -Infinity) - (numberOrNull(a.estimated_cost) ?? -Infinity) || tie(a, b);

/** Pure shaping: one business clock, field-note overrides, stable order, and uncapped counts. */
export function shapeBrief(rows: readonly BriefRow[], office: OfficeBranch, now: Date) {
  const today = businessToday(now);
  const oneDayAgo = daysBefore(today, 1);
  const sevenDaysAgo = daysBefore(today, 7);
  const inside = rows.filter((row) => {
    const distance = numberOrNull(row.distance_mi);
    return !row.overlay_hidden && ['address', 'city', 'county'].includes(row.geo_precision ?? '')
      && distance != null && distance >= 0 && distance <= BRIEF_RADIUS_MI;
  });
  const item = (row: BriefRow) => {
    const timing = timingInfo(row, today, projectSighting(row));
    return {
      project_number: row.project_number,
      name: row.project_name || row.facility_name || row.project_number,
      city: row.location_city,
      estimated_cost: numberOrNull(row.estimated_cost),
      distance_mi: Math.round(Number(row.distance_mi) * 10) / 10,
      precision: row.geo_precision,
      registration_date: row.registration_date,
      current_status: row.current_status,
      fetched_at: row.fetched_at,
      timing_label: timing.label,
      timing_tag: timing.tag,
      timing_flags: timing.flags,
    };
  };
  const section = (candidates: BriefRow[], limit: number) => ({
    items: candidates.slice(0, limit).map(item), count: candidates.length, limit,
  });
  const filed = (from: string) => inside.filter((row) => {
    const date = row.registration_date?.slice(0, 10);
    return date != null && date >= from && date <= today;
  }).sort((a, b) => (b.registration_date ?? '').localeCompare(a.registration_date ?? '') || tie(a, b));
  const filed1 = filed(oneDayAgo);
  const filed7 = filed(sevenDaysAgo);
  const inspected = inside.filter((row) => {
    if (!terminal(row) || !row.fetched_at) return false;
    const fetched = new Date(row.fetched_at);
    return Number.isFinite(fetched.getTime()) && fetched <= now && businessToday(fetched) >= sevenDaysAgo;
  }).sort((a, b) => Date.parse(b.fetched_at!) - Date.parse(a.fetched_at!) || tie(a, b));
  const driveBy = inside.filter((row) => timingInfo(row, today, projectSighting(row)).tag != null).sort(costOrder);
  const list = SMART_LISTS.find((list) => list.curated && list.defaultOffice === office.id && list.defaultSort === 'rank' && getRanking(list.id));
  const ranking = list ? getRanking(list.id) : undefined;
  let ranked: BriefRow[];
  if (ranking && list) {
    const ranks = new Map(ranking.ranked.map((entry) => [entry.projectNumber, entry.rank]));
    const hidden = new Set(hiddenProjectNumbers(list.id));
    // Same demotion as projectOrderBy(sort=rank): use filing dates before sighting overrides.
    const oldFinish = (row: BriefRow) => Number(timingInfo(row, today).tone === 'drive_by');
    ranked = inside.filter((row) => ranks.has(row.project_number) && !hidden.has(row.project_number))
      .sort((a, b) => oldFinish(a) - oldFinish(b) || ranks.get(a.project_number)! - ranks.get(b.project_number)! || tie(a, b));
  } else {
    ranked = inside.filter((row) => !terminal(row)).sort(costOrder);
  }
  return {
    generated_at: now.toISOString(),
    office: { id: office.id, name: office.name },
    radius_mi: BRIEF_RADIUS_MI,
    business_date: today,
    new_filings: {
      last_1_day: filed1.slice(0, 25).map(item),
      last_7_days: filed7.slice(0, 25).map(item),
      counts: { last_1_day: filed1.length, last_7_days: filed7.length },
      limit: 25,
    },
    newly_inspected_or_closed_last_7_days: { ...section(inspected, 25), date_basis: 'fetched_at' },
    drive_by: section(driveBy, 15),
    top_ranked: { ...section(ranked, 10), source: list?.id ?? 'estimated_cost' },
    notes: [BRIEF_STATUS_NOTE],
  };
}
