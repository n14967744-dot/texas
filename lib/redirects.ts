import { DEFAULT_OFFICE_ID } from './offices.ts';
import { listAvailable } from './browse-lists.ts';
import { getSmartList } from './smart-lists.ts';

/**
 * Old smart-list URLs now land on the single project browser.
 * Extra query keys (q, open, hidden) are kept. Office and list from the legacy
 * path win over incoming copies of those keys.
 */
export function legacyListRedirect(
  pathname: string,
  extra?: URLSearchParams | Record<string, string | string[] | undefined> | null,
): string | null {
  const path = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  let office = DEFAULT_OFFICE_ID;
  let list = '';
  if (path === '/lists') {
    list = '';
  } else if (path === '/lists/bryan-priority') {
    list = 'bryan-priority';
  } else if (path === '/lists/data-centers') {
    list = 'data-centers';
  } else {
    return null;
  }

  const params = new URLSearchParams();
  params.set('office', office);
  if (list && listAvailable(office, list)) params.set('list', list);

  const incoming = toParams(extra);
  for (const [key, value] of incoming) {
    if (key === 'office' || key === 'list') continue;
    if (!params.has(key)) params.append(key, value);
  }
  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}

function toParams(extra?: URLSearchParams | Record<string, string | string[] | undefined> | null): URLSearchParams {
  if (!extra) return new URLSearchParams();
  if (extra instanceof URLSearchParams) return extra;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === 'string') params.append(key, value);
    else if (Array.isArray(value)) for (const item of value) if (typeof item === 'string') params.append(key, item);
  }
  return params;
}

/** Report "open this project" links into the consolidated browser. */
export function browseListHref(listId: string, extra?: Record<string, string>): string {
  const list = getSmartList(listId);
  const office = list?.defaultOffice && listAvailable(list.defaultOffice, listId) ? list.defaultOffice : DEFAULT_OFFICE_ID;
  const params = new URLSearchParams();
  params.set('office', office);
  if (listId && listAvailable(office, listId)) params.set('list', listId);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  }
  return `/?${params.toString()}`;
}
