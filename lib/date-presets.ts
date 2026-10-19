import { businessToday } from './query.ts';

export type CompletionPresetId = 'next30' | 'next90' | 'next6mo' | 'thisYear' | 'nextYear';

export type DateRange = { completionFrom: string; completionTo: string };

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function endOfYear(year: number): string {
  return `${year}-12-31`;
}

/** Inclusive estimated-completion presets in America/Chicago business dates. */
export function completionPresetRange(id: CompletionPresetId, today = businessToday()): DateRange {
  const year = Number(today.slice(0, 4));
  switch (id) {
    case 'next30':
      return { completionFrom: today, completionTo: addDays(today, 30) };
    case 'next90':
      return { completionFrom: today, completionTo: addDays(today, 90) };
    case 'next6mo':
      return { completionFrom: today, completionTo: addDays(today, 183) };
    case 'thisYear':
      return { completionFrom: today, completionTo: endOfYear(year) };
    case 'nextYear':
      return { completionFrom: `${year + 1}-01-01`, completionTo: endOfYear(year + 1) };
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export const COMPLETION_PRESETS: { id: CompletionPresetId; label: string }[] = [
  { id: 'next30', label: 'Next 30 days' },
  { id: 'next90', label: 'Next 90 days' },
  { id: 'next6mo', label: 'Next 6 months' },
  { id: 'thisYear', label: 'Rest of this year' },
  { id: 'nextYear', label: 'Next year' },
];
