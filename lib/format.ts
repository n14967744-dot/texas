export function formatDate(value: string | null | undefined) {
  if (!value) return 'Not listed';
  // DATE values remain calendar dates; timestamp values display in the territory timezone.
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isDate ? value + 'T12:00:00Z' : value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(date.getTime())) return 'Not listed';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: isDate ? 'UTC' : 'America/Chicago' }).format(date);
}
export function formatMoney(value: string | number | null) {
  if (value === null || value === '') return 'Not listed';
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : 'Not listed';
}
export function safeSourceLink(value: string | null) {
  try { const url = new URL(value || ''); return url.protocol === 'https:' && (url.hostname === 'tdlr.texas.gov' || url.hostname.endsWith('.tdlr.texas.gov')) ? url.href : null; } catch { return null; }
}

/** https URLs only. Used for research sources and contact websites. */
export function safeHttpsUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(value || '');
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
