import { browserDefaults } from './browser-defaults.ts';
import { listAvailable } from './browse-lists.ts';
import { hiddenProjectNumbers } from './smart-list-review.ts';
import { hasRanking } from './smart-list-rankings.ts';
import { getSmartList } from './smart-lists.ts';
import { DEFAULT_OFFICE_ID, OFFICE_COOKIE, resolveBrowseOffice } from './offices.ts';
import { parseFilters, type Filters } from './query.ts';

export function searchParamsRecordToURL(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string') params.append(key, value);
    else if (Array.isArray(value)) for (const item of value) if (typeof item === 'string') params.append(key, item);
  }
  return params;
}

/**
 * Apply the office cookie and list-specific sort when the URL omits them.
 * Invalid office/list combinations are coerced before parseFilters.
 */
export function resolveBrowserState(raw: URLSearchParams, cookieOffice: string | null): Filters {
  const office = resolveBrowseOffice(raw.get('office'), cookieOffice, raw.has('office'));
  let list = (raw.get('list') || '').trim();
  if (list && (!getSmartList(list) || !listAvailable(office, list))) list = '';
  const defaults = browserDefaults({ office, list });
  const merged = new URLSearchParams(raw);
  merged.set('office', office);
  if (list) merged.set('list', list);
  else merged.delete('list');
  if (!raw.get('sort') || (merged.get('sort') === 'rank' && !hasRanking(list))) {
    merged.set('sort', defaults.sort);
    merged.set('direction', defaults.direction);
  }
  if (!raw.get('radius')) merged.set('radius', String(defaults.radius));
  if ((merged.get('hidden') === '1' || merged.get('hidden') === 'true') && hiddenProjectNumbers(list).length === 0) {
    merged.delete('hidden');
  }
  return parseFilters(merged);
}

/**
 * Redirect target when the URL is missing an office or names a hidden office / unavailable list.
 * Returns null when the query is already safe to render.
 */
export function canonicalizeBrowseParams(raw: URLSearchParams, cookieOffice: string | null): string | null {
  const next = new URLSearchParams(raw);
  let changed = false;
  if (!raw.has('office')) {
    next.set('office', resolveBrowseOffice(null, cookieOffice, false));
    changed = true;
  } else if (!raw.get('office') || !isSafeOffice(raw.get('office') || '')) {
    next.set('office', DEFAULT_OFFICE_ID);
    changed = true;
  }
  const office = next.get('office') || DEFAULT_OFFICE_ID;
  const list = next.get('list') || '';
  if (list && (!getSmartList(list) || !listAvailable(office, list))) {
    next.delete('list');
    changed = true;
  }
  const effectiveList = next.get('list') || '';
  if (next.get('sort') === 'rank' && !hasRanking(effectiveList)) {
    next.delete('sort');
    next.delete('direction');
    changed = true;
  }
  if ((next.get('hidden') === '1' || next.get('hidden') === 'true') && hiddenProjectNumbers(effectiveList).length === 0) {
    next.delete('hidden');
    changed = true;
  }
  if (!changed) return null;
  const qs = next.toString();
  return qs ? `/?${qs}` : '/';
}

function isSafeOffice(id: string): boolean {
  return resolveBrowseOffice(id, null, true) === id;
}

export function readOfficeCookieFromDocument(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${OFFICE_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeOfficeCookie(office: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${OFFICE_COOKIE}=${encodeURIComponent(office)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
