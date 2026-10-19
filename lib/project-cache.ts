import type { ProjectListResponse } from './types.ts';

const MEMORY = new Map<string, ProjectListResponse>();
const STORAGE_PREFIX = 'ctwp-projects:v1:';
const MAX_SESSION_ENTRIES = 40;

function storageKey(query: string) {
  return `${STORAGE_PREFIX}${query || 'default'}`;
}

export function readProjectCache(query: string): ProjectListResponse | null {
  const hit = MEMORY.get(query);
  if (hit) return hit;
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(storageKey(query));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectListResponse;
    if (!parsed || !Array.isArray(parsed.projects)) return null;
    MEMORY.set(query, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeProjectCache(query: string, payload: ProjectListResponse) {
  MEMORY.set(query, payload);
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(query), JSON.stringify(payload));
    // Bound sessionStorage growth: drop oldest ctwp keys when over limit.
    const keys = Object.keys(sessionStorage).filter((key) => key.startsWith(STORAGE_PREFIX));
    if (keys.length > MAX_SESSION_ENTRIES) {
      keys.slice(0, keys.length - MAX_SESSION_ENTRIES).forEach((key) => sessionStorage.removeItem(key));
    }
  } catch {
    // Quota or private mode — memory cache still works.
  }
}

export function clearProjectCache(query?: string) {
  if (query != null) {
    MEMORY.delete(query);
    if (typeof sessionStorage !== 'undefined') {
      try { sessionStorage.removeItem(storageKey(query)); } catch { /* ignore */ }
    }
    return;
  }
  MEMORY.clear();
  if (typeof sessionStorage === 'undefined') return;
  try {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX))
      .forEach((key) => sessionStorage.removeItem(key));
  } catch { /* ignore */ }
}
