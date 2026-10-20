import 'server-only';
import { DatabaseError } from './db';

export type WriteQuery = { query: string; params: (string | number | null)[] };
interface SqlResult<T> { rows: T[] }

/** Parameterized Neon HTTPS batch, executed as one write-capable transaction. */
export async function writeQueries<T>(queries: WriteQuery[]): Promise<SqlResult<T>[]> {
  const connection = process.env.DATABASE_URL;
  if (!connection) throw new DatabaseError('DATABASE_URL is not configured.');
  let url: URL;
  try { url = new URL(connection); } catch { throw new DatabaseError('Database configuration is invalid.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname.endsWith('.neon.tech')) throw new DatabaseError('A Neon PostgreSQL connection is required.');
  try {
    const response = await fetch(`https://${url.hostname}/sql`, {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(20000),
      headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': connection },
      body: JSON.stringify({ queries }),
    });
    if (!response.ok) throw new Error('Database request failed.');
    const data = await response.json();
    if (!Array.isArray(data.results) || data.results.length !== queries.length || data.results.some((r: SqlResult<T>) => !Array.isArray(r.rows))) throw new Error('Invalid database response.');
    return data.results as SqlResult<T>[];
  } catch { throw new DatabaseError('The database is temporarily unavailable. Please try again.'); }
}
