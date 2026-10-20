import { FILED_PRESETS, FINISH_PRESETS, START_PRESETS } from './date-presets.ts';
import { formatDate, formatMoney } from './format.ts';
import { DEFAULT_RADIUS, type Filters } from './query.ts';
import { ALL_TEXAS_ID } from './offices.ts';

export type FilterChip = { id: string; label: string; clear: Partial<Filters> };

function presetLabel(options: { id: string; label: string }[], id: string): string {
  return options.find((option) => option.id === id)?.label || id;
}

function rangeLabel(from: string, to: string): string {
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `from ${formatDate(from)}`;
  return `through ${formatDate(to)}`;
}

/** Removable chips for every active filter except search (search has its own clear). */
export function activeFilterChips(filters: Filters): FilterChip[] {
  const chips: FilterChip[] = [];
  if (filters.office !== ALL_TEXAS_ID && filters.radius !== DEFAULT_RADIUS) {
    chips.push({
      id: 'radius',
      label: `Within ${filters.radius} mi straight-line`,
      clear: { radius: DEFAULT_RADIUS },
    });
  }
  if (filters.office !== ALL_TEXAS_ID && filters.includeUnknown) {
    chips.push({ id: 'unknown', label: 'Including unknown locations', clear: { includeUnknown: false } });
  }
  if (filters.startPreset || filters.startFrom || filters.startTo) {
    const label = filters.startPreset
      ? presetLabel(START_PRESETS, filters.startPreset)
      : rangeLabel(filters.startFrom, filters.startTo);
    chips.push({
      id: 'start',
      label: `Planned start: ${label}`,
      clear: { startPreset: '', startFrom: '', startTo: '' },
    });
  }
  if (filters.finishPreset || filters.finishFrom || filters.finishTo) {
    const label = filters.finishPreset
      ? presetLabel(FINISH_PRESETS, filters.finishPreset)
      : rangeLabel(filters.finishFrom, filters.finishTo);
    chips.push({
      id: 'finish',
      label: `Planned finish: ${label}`,
      clear: { finishPreset: '', finishFrom: '', finishTo: '' },
    });
  }
  if (filters.costMin != null || filters.costMax != null) {
    const min = filters.costMin != null ? formatMoney(filters.costMin) : 'any';
    const max = filters.costMax != null ? formatMoney(filters.costMax) : 'any';
    const extra = filters.includeNoCost ? ' · includes no listed cost' : '';
    chips.push({
      id: 'cost',
      label: `Cost: ${min}–${max}${extra}`,
      clear: { costMin: null, costMax: null, includeNoCost: false },
    });
  }
  if (filters.workType) {
    chips.push({ id: 'workType', label: filters.workType, clear: { workType: '' } });
  }
  if (filters.city) chips.push({ id: 'city', label: `City: ${filters.city}`, clear: { city: '' } });
  if (filters.county) chips.push({ id: 'county', label: `County: ${filters.county}`, clear: { county: '' } });
  if (filters.filedPreset || filters.registeredFrom || filters.registeredTo) {
    const label = filters.filedPreset
      ? presetLabel(FILED_PRESETS, filters.filedPreset)
      : rangeLabel(filters.registeredFrom, filters.registeredTo);
    chips.push({
      id: 'filed',
      label: `Filed: ${label}`,
      clear: { filedPreset: '', registeredFrom: '', registeredTo: '' },
    });
  }
  if (filters.hidden) chips.push({ id: 'hidden', label: 'Showing hidden', clear: { hidden: false } });
  return chips;
}
