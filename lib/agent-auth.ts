import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';

/** Fail closed when unconfigured. Hashes keep the comparison buffers equal-sized. */
export function isAgentAuthorized(request: Request): boolean {
  const expected = process.env.AGENT_API_TOKEN;
  if (!expected?.trim()) return false;
  const match = /^Bearer ([^\s]+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) return false;
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(match[1]), digest(expected));
}
