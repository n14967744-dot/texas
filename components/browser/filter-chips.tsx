'use client';

import { activeFilterChips } from '@/lib/filter-chips';
import type { Filters } from '@/lib/query';

export function FilterChips({
  filters,
  onClearChip,
  onClearAll,
}: {
  filters: Filters;
  onClearChip: (partial: Partial<Filters>) => void;
  onClearAll: () => void;
}) {
  const chips = activeFilterChips(filters);
  if (!chips.length) return null;
  return (
    <div className="active-filters" aria-label="Active filters">
      {chips.map((chip) => (
        <button key={chip.id} type="button" className="filter-chip removable" onClick={() => onClearChip(chip.clear)}>
          {chip.label}
          <span aria-hidden="true">×</span>
          <span className="sr-only">Remove {chip.label}</span>
        </button>
      ))}
      <button type="button" className="text-button" onClick={onClearAll}>Clear filters</button>
    </div>
  );
}
