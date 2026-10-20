/**
 * Curated, ranked smart lists (e.g. per-office priority lists).
 *
 * A ranking file supplies list membership, row order, a tier and a one-line
 * "why" note per project, plus reviewed bad fits that stay hidden (reachable
 * via "Show hidden" with their reason, same as lib/smart-list-review.ts).
 *
 * To add another office priority list:
 *  1. Add lib/rankings/<list-id>.ts exporting a SmartListRanking.
 *  2. Register it in RANKINGS below.
 *  3. Add a SmartListDefinition with `curated: true` (and defaultOffice) in lib/smart-lists.ts.
 *  4. Make sure every listed project has a geocode (data/project-geocodes.json) so
 *     radius coverage and the distance column work.
 */
import { BRYAN_PRIORITY_RANKING } from './rankings/bryan-priority.ts';
import type { TimingTone } from './timing.ts';

export type PriorityTier = 'hot' | 'warm' | 'pipeline';

export const PRIORITY_TIER_LABELS: Record<PriorityTier, string> = {
  hot: 'Hot',
  warm: 'Warm',
  pipeline: 'Pipeline',
};

/** Keep the snapshot rank, but lower the current priority of unconfirmed old dates. */
export function priorityTier(tier: PriorityTier, tone?: TimingTone): PriorityTier {
  return tone === 'drive_by' ? 'pipeline' : tier;
}

export type SmartListRankingEntry = {
  projectNumber: string;
  /** 1 = highest priority. Unique and contiguous within a list. */
  rank: number;
  tier: PriorityTier;
  /** One-line plain-English reason, built only from TABS data. */
  note: string;
};

export type SmartListRankingHidden = {
  projectNumber: string;
  reason: string;
};

/** Plain-English context for the read-only report page (/reports/<listId>). */
export type SmartListRankingReport = {
  title: string;
  /** Office id from lib/offices.ts the ranking was built around. */
  officeId: string;
  radiusMi: number;
  /** Filings scanned before the radius/open filters (county pulls). */
  scannedCount: number;
  /** Filings within the radius and still open — everything that was reviewed. */
  reviewedCount: number;
  /** Cities called out as "in town" for the office. */
  focusCities: readonly string[];
  method: readonly string[];
  assumptions: readonly string[];
};

export type SmartListRanking = {
  listId: string;
  generatedAt: string;
  report?: SmartListRankingReport;
  ranked: readonly SmartListRankingEntry[];
  hidden: readonly SmartListRankingHidden[];
};

export const RANKINGS: readonly SmartListRanking[] = [BRYAN_PRIORITY_RANKING];

const byList = new Map<string, { ranking: SmartListRanking; entries: Map<string, SmartListRankingEntry>; hidden: Map<string, SmartListRankingHidden> }>();
for (const ranking of RANKINGS) {
  byList.set(ranking.listId, {
    ranking,
    entries: new Map(ranking.ranked.map((entry) => [entry.projectNumber, entry])),
    hidden: new Map(ranking.hidden.map((entry) => [entry.projectNumber, entry])),
  });
}

export function getRanking(listId: string): SmartListRanking | undefined {
  return byList.get(listId)?.ranking;
}

/** Rankings that have report metadata, for /reports. */
export function reportRankings(): SmartListRanking[] {
  return RANKINGS.filter((ranking) => ranking.report);
}

/** Group hidden reasons for summaries; duplicate notes collapse into one bucket. */
export function hiddenReasonCounts(listId: string): { reason: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const entry of getRanking(listId)?.hidden ?? []) {
    const reason = entry.reason.startsWith('Duplicate') ? 'Duplicate of another filing in the list' : entry.reason;
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

export function hasRanking(listId: string): boolean {
  return byList.has(listId);
}

export function getRankingEntry(listId: string, projectNumber: string): SmartListRankingEntry | undefined {
  return byList.get(listId)?.entries.get(projectNumber);
}

export function getRankingHidden(listId: string, projectNumber: string): SmartListRankingHidden | undefined {
  return byList.get(listId)?.hidden.get(projectNumber);
}

/** Ranked + hidden project numbers: the full curated membership of a list. */
export function curatedProjectNumbers(listId: string): string[] {
  const ranking = getRanking(listId);
  if (!ranking) return [];
  return [...ranking.ranked.map((e) => e.projectNumber), ...ranking.hidden.map((e) => e.projectNumber)];
}

export function rankingHiddenNumbers(listId: string): string[] {
  return getRanking(listId)?.hidden.map((e) => e.projectNumber) ?? [];
}

/** Sort key for `sort=rank`; hidden/unranked rows go last. */
export function rankOf(listId: string, projectNumber: string): number {
  return getRankingEntry(listId, projectNumber)?.rank ?? Number.POSITIVE_INFINITY;
}
