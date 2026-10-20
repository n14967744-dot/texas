import 'server-only';
import { readQueries } from './db';
import { getOfficeBranch } from './offices';
import { distanceToOffice } from './geo';
import { timingInfo, type TimingInfo } from './timing';
import { businessToday } from './query';
import { getRanking, hiddenReasonCounts, priorityTier, type PriorityTier, type SmartListRanking, type SmartListRankingReport } from './smart-list-rankings';

export type ReportRow = {
  projectNumber: string;
  rank: number;
  tier: PriorityTier;
  note: string;
  name: string | null;
  city: string | null;
  cost: string | number | null;
  completion: string | null;
  status: string | null;
  startDate: string | null;
  timing: TimingInfo;
  distanceMi: number | null;
};

export type RankingReport = {
  ranking: SmartListRanking;
  report: SmartListRankingReport;
  officeName: string;
  rows: ReportRow[];
  hiddenCount: number;
  hiddenReasons: { reason: string; count: number }[];
  /** False when live project details could not be loaded (rows still list rank + note). */
  detailsLoaded: boolean;
  latestFetch: string | null;
};

type DetailRow = {
  project_number: string;
  project_name: string | null;
  facility_name: string | null;
  location_city: string | null;
  estimated_cost: string | number | null;
  start_date: string | null;
  completion_date: string | null;
  current_status: string | null;
  fetched_at: string | null;
};

export async function loadRankingReport(listId: string): Promise<RankingReport | null> {
  const ranking = getRanking(listId);
  if (!ranking?.report) return null;
  const report = ranking.report;
  const office = getOfficeBranch(report.officeId);
  const numbers = ranking.ranked.map((e) => e.projectNumber);

  let details = new Map<string, DetailRow>();
  let detailsLoaded = false;
  let latestFetch: string | null = null;
  try {
    const [result] = await readQueries<DetailRow>([{
      query: `SELECT project_number, project_name, facility_name, location_city, estimated_cost, start_date, completion_date, current_status, fetched_at FROM public.projects WHERE project_number IN (${numbers.map((_, i) => `$${i + 1}`).join(',')})`,
      params: numbers,
    }]);
    details = new Map(result.rows.map((row) => [row.project_number, row]));
    detailsLoaded = true;
    latestFetch = result.rows.reduce<string | null>((max, row) => (row.fetched_at && (!max || row.fetched_at > max) ? row.fetched_at : max), null);
  } catch {
    detailsLoaded = false;
  }

  const today = businessToday();
  const rows = [...ranking.ranked].sort((a, b) => a.rank - b.rank).map((entry) => {
    const d = details.get(entry.projectNumber);
    const hit = office ? distanceToOffice(entry.projectNumber, office) : null;
    const timing = timingInfo(d ?? {}, today);
    return {
      projectNumber: entry.projectNumber,
      rank: entry.rank,
      tier: priorityTier(entry.tier, timing.tone),
      note: entry.note,
      name: d?.project_name || d?.facility_name || null,
      city: d?.location_city ?? null,
      cost: d?.estimated_cost ?? null,
      completion: d?.completion_date ?? null,
      status: d?.current_status ?? null,
      startDate: d?.start_date ?? null,
      timing,
      distanceMi: hit ? Math.round(hit.distanceMi * 10) / 10 : null,
    };
  }).sort((a, b) => Number(a.timing.tone === 'drive_by') - Number(b.timing.tone === 'drive_by') || a.rank - b.rank);

  return {
    ranking,
    report,
    officeName: office?.name ?? report.officeId,
    rows,
    hiddenCount: ranking.hidden.length,
    hiddenReasons: hiddenReasonCounts(listId),
    detailsLoaded,
    latestFetch,
  };
}
