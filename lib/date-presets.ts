/** Inclusive America/Chicago calendar ranges. Callers pass the Chicago business date. */

export type StartPreset = 'next30' | 'next90' | 'reached';
export type FinishPreset = 'next30' | 'next90' | 'next6mo' | 'prev90';
export type FiledPreset = 'last7' | 'last30' | 'last90';

export type DateRange = { from: string; to: string };

export const START_PRESETS: { id: StartPreset; label: string }[] = [
  { id: 'next30', label: 'Next 30 days' },
  { id: 'next90', label: 'Next 90 days' },
  { id: 'reached', label: 'Start date reached' },
];

export const FINISH_PRESETS: { id: FinishPreset; label: string }[] = [
  { id: 'next30', label: 'Next 30 days' },
  { id: 'next90', label: 'Next 90 days' },
  { id: 'next6mo', label: 'Next 6 months' },
  { id: 'prev90', label: 'Previous 90 days' },
];

export const FILED_PRESETS: { id: FiledPreset; label: string }[] = [
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'last90', label: 'Last 90 days' },
];

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Calendar months, clamping the day when the target month is shorter. */
export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const date = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay)));
  return date.toISOString().slice(0, 10);
}

/**
 * Next N days is [today, today+N] inclusive.
 * Previous/last N days is [today−N, today] inclusive.
 * "Next 6 months" is [today, today plus 6 calendar months] inclusive.
 * "Start date reached" is not a closed range — the caller compares start_date <= today.
 */
export function presetRange(kind: 'start' | 'finish' | 'filed', id: string, today: string): DateRange | null {
  if (kind === 'start') {
    if (id === 'next30') return { from: today, to: addDays(today, 30) };
    if (id === 'next90') return { from: today, to: addDays(today, 90) };
    return null;
  }
  if (kind === 'finish') {
    if (id === 'next30') return { from: today, to: addDays(today, 30) };
    if (id === 'next90') return { from: today, to: addDays(today, 90) };
    if (id === 'next6mo') return { from: today, to: addMonths(today, 6) };
    if (id === 'prev90') return { from: addDays(today, -90), to: today };
    return null;
  }
  if (id === 'last7') return { from: addDays(today, -7), to: today };
  if (id === 'last30') return { from: addDays(today, -30), to: today };
  if (id === 'last90') return { from: addDays(today, -90), to: today };
  return null;
}
