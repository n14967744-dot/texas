export const MAP_LIMIT = 2000;

/** Keep the API cap and truncation reporting consistent, including empty results. */
export function capMapResults<T>(rows: T[], total: number): { projects: T[]; total: number; truncated: boolean } {
  return { projects: rows.slice(0, MAP_LIMIT), total, truncated: total > MAP_LIMIT };
}
