import { SORTS, type Filters } from './query.ts';
import { timingBucketSql, timingDateSql } from './timing.ts';

/**
 * ORDER BY shared by the project list and the CSV export.
 * `todayParam` is a bound placeholder (`$n`) when sorting by timing, otherwise unused.
 * Every sort keeps project_number ASC as the tie-breaker. Rank uses the curated_rank join.
 */
export function projectOrderBy(filters: Pick<Filters, 'sort' | 'direction'>, todayParam: string): string {
  const dir = filters.direction === 'asc' ? 'ASC' : 'DESC';
  const tie = 'project_number ASC';
  if (filters.sort === 'distance') return `distance_mi ${dir} NULLS LAST, ${tie}`;
  if (filters.sort === 'rank') return `curated_rank.rank ${dir} NULLS LAST, ${tie}`;
  if (filters.sort === 'call') return `curated_rank.call_rank ${dir} NULLS LAST, curated_rank.rank ASC NULLS LAST, ${tie}`;
  if (filters.sort === 'timing') {
    return `${timingBucketSql(todayParam)} ${dir}, ${timingDateSql(todayParam)} ${dir} NULLS LAST, ${tie}`;
  }
  const column = SORTS[filters.sort];
  return `${column} ${dir} NULLS LAST, ${tie}`;
}
