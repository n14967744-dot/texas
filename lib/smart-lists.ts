/**
 * Smart Lists — curated, keyword-based project filters.
 *
 * To add a new list:
 *  1. Append one object to SMART_LISTS below (id/slug, title, description,
 *     include/exclude regexes, optional fields and filters).
 *  2. The project browser and API pick it up from `?list=<id>`.
 *     Old /lists/<id> URLs redirect there. No route or SQL changes required for a basic keyword list.
 *
 * Include/exclude patterns are case-insensitive and must work in both JavaScript
 * RegExp and PostgreSQL POSIX `~*` (prefer `[\\s\\-_]*`, `(?:...)`, avoid `\\b`).
 * A project matches when ANY include hits a searched field and NO exclude hits.
 *
 * Curated lists (`curated: true`) skip keyword matching: membership, rank, tier
 * and notes come from a ranking file registered in lib/smart-list-rankings.ts.
 */

import { curatedProjectNumbers } from './smart-list-rankings.ts';

export type SmartListField = 'project_name' | 'facility_name' | 'scope_of_work' | 'type_of_work';

export interface SmartListDefinition {
  id: string;
  title: string;
  description: string;
  /** Regex sources; match if ANY hits the searched fields. */
  include: readonly string[];
  /** Reject if ANY hits, even when an include matched. */
  exclude: readonly string[];
  /** Defaults to project_name, facility_name, scope_of_work. */
  fields?: readonly SmartListField[];
  /** When true, the list page starts with the upcoming-only toggle on. */
  upcomingOnlyDefault?: boolean;
  /** Initial sort column (must be a /api/projects sort key; `rank` needs a curated list). */
  defaultSort?: 'estimated_cost' | 'registration_date' | 'completion_date' | 'project_name' | 'location_address' | 'current_status' | 'rank';
  /** Initial sort direction. */
  defaultDirection?: 'asc' | 'desc';
  /** Office tab the list opens on (office id from lib/offices.ts). Defaults to All Texas. */
  defaultOffice?: string;
  /** Default radius (miles) for distance coverage; must be one of RADIUS_OPTIONS. Defaults to 60. */
  defaultRadius?: number;
  /** Membership comes from lib/smart-list-rankings.ts instead of include/exclude patterns. */
  curated?: boolean;
  minEstimatedCost?: number;
  statuses?: readonly string[];
  typesOfWork?: readonly string[];
}

export type SmartListProjectFields = Partial<Record<SmartListField, string | null | undefined>> & {
  estimated_cost?: string | number | null;
  current_status?: string | null;
};

const DEFAULT_FIELDS: readonly SmartListField[] = ['project_name', 'facility_name', 'scope_of_work'];

/**
 * Data centers — TABS filings that look like commercial / hyperscale data center
 * work (plus clear operator-campus jobs). Tuned against a full Texas dump; Dell
 * lab / hospital server-room filings are intentionally omitted to limit noise.
 */
const DATA_CENTERS: SmartListDefinition = {
  id: 'data-centers',
  title: 'Data centers',
  description:
    'Commercial and hyperscale data center filings across Texas TABS — new builds, data halls, fit-outs, and clear operator campus work. Keyword-matched so new registrations appear automatically.',
  upcomingOnlyDefault: true,
  defaultSort: 'registration_date',
  defaultDirection: 'desc',
  include: [
    // Primary DC vocabulary
    String.raw`data[\s_\-]*cent(?:er|re)s?`,
    String.raw`datacent(?:er|re)s?`,
    String.raw`data[\s\-]*halls?`,
    String.raw`co-?locations?`,
    String.raw`hyperscales?`,
    String.raw`server\s*farms?`,
    String.raw`comput(?:e|ing)\s+(?:campus|center|centres?|facilit(?:y|ies))`,
    String.raw`AI\s+(?:campus|factor(?:y|ies))`,
    String.raw`DC\s+campus`,
    // Second-pass rules from hand review (expressible as patterns)
    String.raw`critical\s+IT`,
    String.raw`data\s+modules?`,
    String.raw`\d+\s*MW\s+(?:of\s+)?critical`,
    String.raw`\d+\s*MW\s+DM`,
    String.raw`white\s*floor`,
    // Operator / campus markers that reliably indicate DC work
    String.raw`CyrusOne`,
    String.raw`Digital\s+Real(?:ty|ity)`,
    String.raw`Colovore`,
    String.raw`Edged\s+Energy`,
    String.raw`Core\s+Scientific`,
    String.raw`CoreWeave`,
    String.raw`DataBank|Databank`,
    String.raw`Vantage\s+(?:Data\s+Centers?|DC)`,
    String.raw`QTS\s+(?:Data\s+Centers?|DFW|FTW|Irving)`,
    String.raw`STACK\s*[-–]\s*DFW`,
    String.raw`Riot\s+Platforms`,
    String.raw`serverfarm`,
    String.raw`Flexential`,
    String.raw`Equinix`,
    String.raw`Prime\s+Data\s+Center`,
    String.raw`Skybox\s*[-–]|Skybox.*(?:Data\s*Center|Fit\s*O(?:ut|ff)|Fit\s*Up|LAN\d+|Hutto|Lancaster)`,
    String.raw`Sabey\s+Austin`,
    String.raw`Switch\s+AUS`,
    String.raw`Nexus\s+(?:Apex|Data\s+Centers?)`,
    String.raw`Microsoft\s+SAT\d+`,
    String.raw`Microsoft\s+SN\d+`,
  ],
  exclude: [
    // Known false positives from hand review
    String.raw`DATACENTERHAWK`,
    String.raw`Heart\s*&\s*Mind\s+MD`,
    // Server manufacturing / assembly, not a data center building
    String.raw`server\s+assembly`,
    String.raw`AI\s+chip\s+server`,
    String.raw`computer\s+server\s+rack\s+production`,
    // Homonyms / unrelated
    String.raw`Switchyards`,
    String.raw`Executive\s+Office\s+Suite`,
    String.raw`Break\s+Room\s+Updates`,
    // Future-safe phrases (do not overlap current review-hide rows — those stay
    // keyword-visible so Show hidden can surface them with a badge)
    String.raw`server\s+assembly\s+factory`,
    String.raw`coworking\s+switchyard`,
  ],
};

/**
 * Bryan priority — every project type within 20 mi of the Bryan office, reviewed
 * for office-equipment fit and ranked by timing, fit and size (see
 * lib/rankings/bryan-priority.ts). Other offices: copy this entry + a ranking file.
 */
const BRYAN_PRIORITY: SmartListDefinition = {
  id: 'bryan-priority',
  title: 'Bryan priority',
  description:
    'All project types within 20 miles of the Bryan office that are upcoming or still open, reviewed for copier/MFP/managed-print fit and ranked: finishing within 6 months first, then passed planned starts, then future starts; Needs drive-by rows stay visible at lower priority; document-heavy uses (government, medical, schools, finance, offices) and larger jobs rank higher.',
  curated: true,
  defaultOffice: 'bryan',
  defaultRadius: 20,
  defaultSort: 'rank',
  defaultDirection: 'asc',
  include: [],
  exclude: [],
};

/** Append new list definitions here. */
export const SMART_LISTS: readonly SmartListDefinition[] = [DATA_CENTERS, BRYAN_PRIORITY];

export function getSmartList(id: string): SmartListDefinition | undefined {
  return SMART_LISTS.find((list) => list.id === id);
}

export function smartListFields(list: SmartListDefinition): readonly SmartListField[] {
  return list.fields ?? DEFAULT_FIELDS;
}

export function listSearchText(row: SmartListProjectFields, fields: readonly SmartListField[] = DEFAULT_FIELDS): string {
  return fields.map((field) => row[field] || '').join(' | ');
}

function compile(patterns: readonly string[]): RegExp[] {
  return patterns.map((source) => new RegExp(source, 'i'));
}

/** Pure matcher used by unit tests and offline sanity checks. */
export function matchesSmartList(row: SmartListProjectFields & { project_number?: string }, list: SmartListDefinition): boolean {
  if (list.curated) return Boolean(row.project_number && curatedProjectNumbers(list.id).includes(row.project_number));
  const fields = smartListFields(list);
  const text = listSearchText(row, fields);
  if (compile(list.exclude).some((re) => re.test(text))) return false;
  if (!compile(list.include).some((re) => re.test(text))) return false;
  if (list.minEstimatedCost != null) {
    const cost = Number(row.estimated_cost);
    if (!Number.isFinite(cost) || cost < list.minEstimatedCost) return false;
  }
  if (list.statuses?.length) {
    if (!row.current_status || !list.statuses.includes(row.current_status)) return false;
  }
  if (list.typesOfWork?.length) {
    if (!row.type_of_work || !list.typesOfWork.includes(row.type_of_work)) return false;
  }
  return true;
}

/** Combine patterns into one POSIX/JS alternation for a single SQL `~*` bind. */
export function combinedPattern(patterns: readonly string[]): string {
  return patterns.map((source) => `(?:${source})`).join('|');
}

/**
 * Append smart-list SQL predicates onto an existing WHERE builder.
 * `bind` must push a param and return its `$n` placeholder (same as buildWhere).
 */
export function appendSmartListClauses(
  list: SmartListDefinition,
  bind: (value: string | number) => string,
  clauses: string[],
): void {
  if (list.curated) {
    const members = curatedProjectNumbers(list.id);
    clauses.push(members.length ? `project_number IN (${members.map((n) => bind(n)).join(',')})` : 'FALSE');
    return;
  }
  const fields = smartListFields(list);
  const fieldMatch = (param: string) =>
    `(${fields.map((field) => `COALESCE(${field}, '') ~* ${param}`).join(' OR ')})`;

  if (!list.include.length) {
    clauses.push('FALSE');
    return;
  }
  clauses.push(fieldMatch(bind(combinedPattern(list.include))));
  if (list.exclude.length) {
    clauses.push(`NOT ${fieldMatch(bind(combinedPattern(list.exclude)))}`);
  }
  if (list.minEstimatedCost != null) {
    clauses.push(`estimated_cost >= ${bind(list.minEstimatedCost)}`);
  }
  if (list.statuses?.length) {
    clauses.push(`current_status IN (${list.statuses.map((status) => bind(status)).join(',')})`);
  }
  if (list.typesOfWork?.length) {
    clauses.push(`type_of_work IN (${list.typesOfWork.map((type) => bind(type)).join(',')})`);
  }
}
