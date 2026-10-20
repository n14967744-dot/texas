'use client';

import { useEffect, useState } from 'react';
import { FILED_PRESETS, FINISH_PRESETS, START_PRESETS } from '@/lib/date-presets';
import { ALL_TEXAS_ID, getOfficeBranch } from '@/lib/offices';
import { DEFAULT_RADIUS, RADIUS_PRESETS, type Filters } from '@/lib/query';
import { hiddenProjectNumbers } from '@/lib/smart-list-review';
import { SearchableSelect } from './searchable-select';
import { UnknownLocationControl } from './unknown-location';

export function FiltersPanel({
  open,
  filters,
  cities,
  counties,
  workTypes,
  unknownPool,
  onChange,
  onClear,
  onClose,
}: {
  open: boolean;
  filters: Filters;
  cities: string[];
  counties: string[];
  workTypes: string[];
  /** Null until coverage has loaded. */
  unknownPool: number | null;
  onChange: (partial: Partial<Filters>) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const office = getOfficeBranch(filters.office);
  const texas = filters.office === ALL_TEXAS_ID;
  const customRadius = !(RADIUS_PRESETS as readonly number[]).includes(filters.radius);
  const [customOn, setCustomOn] = useState(customRadius);
  const canHide = Boolean(filters.list && hiddenProjectNumbers(filters.list).length > 0);

  useEffect(() => {
    if ((RADIUS_PRESETS as readonly number[]).includes(filters.radius)) setCustomOn(false);
  }, [filters.radius]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const showCustom = customOn || customRadius;

  return (
    <div className="filters-panel open" id="project-filters" role="region" aria-label="Filters">
      <div className="filters-panel-bar">
        <strong>Filters</strong>
        <button type="button" className="button filters-done" onClick={onClose}>Done</button>
      </div>
      <div className="filters-grid">
        <fieldset>
          <legend>Distance (straight-line)</legend>
          {texas ? (
            <p className="fine-print">All Texas is not limited by distance. The distance column is straight-line miles to the nearest visible office.</p>
          ) : (
            <>
              <p className="fine-print">From {office?.address}. Not driving distance. {DEFAULT_RADIUS} miles is the default.</p>
              <div className="choice-row" role="radiogroup" aria-label="Radius in miles">
                {RADIUS_PRESETS.map((miles) => (
                  <label key={miles} className={!showCustom && filters.radius === miles ? 'choice selected' : 'choice'}>
                    <input
                      type="radio"
                      name="radius"
                      checked={!showCustom && filters.radius === miles}
                      onChange={() => { setCustomOn(false); onChange({ radius: miles }); }}
                    />
                    {miles} mi
                  </label>
                ))}
                <label className={showCustom ? 'choice selected' : 'choice'}>
                  <input
                    type="radio"
                    name="radius"
                    checked={showCustom}
                    onChange={() => setCustomOn(true)}
                  />
                  Custom
                </label>
              </div>
              {showCustom && (
                <label className="stack-label">
                  Custom miles
                  <input
                    type="number"
                    min={1}
                    max={500}
                    step="0.1"
                    aria-label="Custom radius in miles"
                    value={filters.radius}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isFinite(next) && next > 0 && next <= 500) onChange({ radius: next });
                    }}
                  />
                </label>
              )}
              <UnknownLocationControl
                count={unknownPool}
                checked={filters.includeUnknown}
                onChange={(includeUnknown) => onChange({ includeUnknown })}
              />
            </>
          )}
        </fieldset>

        <fieldset className="range-fieldset">
          <legend>Planned start</legend>
          <div className="choice-row">
            {START_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={filters.startPreset === preset.id ? 'choice selected' : 'choice'}
                aria-pressed={filters.startPreset === preset.id}
                onClick={() => onChange({ startPreset: filters.startPreset === preset.id ? '' : preset.id, startFrom: '', startTo: '' })}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="date-range">
            <label>From<input type="date" value={filters.startFrom} onChange={(event) => onChange({ startPreset: '', startFrom: event.target.value })} /></label>
            <span className="range-to">to</span>
            <label>To<input type="date" value={filters.startTo} onChange={(event) => onChange({ startPreset: '', startTo: event.target.value })} /></label>
          </div>
        </fieldset>

        <fieldset className="range-fieldset">
          <legend>Planned finish</legend>
          <div className="choice-row">
            {FINISH_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={filters.finishPreset === preset.id ? 'choice selected' : 'choice'}
                aria-pressed={filters.finishPreset === preset.id}
                onClick={() => onChange({ finishPreset: filters.finishPreset === preset.id ? '' : preset.id, finishFrom: '', finishTo: '' })}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="date-range">
            <label>From<input type="date" value={filters.finishFrom} onChange={(event) => onChange({ finishPreset: '', finishFrom: event.target.value })} /></label>
            <span className="range-to">to</span>
            <label>To<input type="date" value={filters.finishTo} onChange={(event) => onChange({ finishPreset: '', finishTo: event.target.value })} /></label>
          </div>
        </fieldset>

        <fieldset className="range-fieldset">
          <legend>Estimated cost</legend>
          <div className="date-range">
            <label>Min
              <input
                type="number"
                min={0}
                inputMode="numeric"
                aria-label="Minimum estimated cost"
                value={filters.costMin ?? ''}
                onChange={(event) => onChange({ costMin: event.target.value === '' ? null : Number(event.target.value) })}
              />
            </label>
            <span className="range-to">to</span>
            <label>Max
              <input
                type="number"
                min={0}
                inputMode="numeric"
                aria-label="Maximum estimated cost"
                value={filters.costMax ?? ''}
                onChange={(event) => onChange({ costMax: event.target.value === '' ? null : Number(event.target.value) })}
              />
            </label>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={filters.includeNoCost}
              onChange={(event) => onChange({ includeNoCost: event.target.checked })}
            />
            Include projects with no listed cost
          </label>
        </fieldset>

        <fieldset>
          <legend>Work type</legend>
          <label className="select-control browse-select wide">
            <span className="sr-only">Work type</span>
            <select aria-label="Work type" value={filters.workType} onChange={(event) => onChange({ workType: event.target.value })}>
              <option value="">All work types</option>
              {workTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              {filters.workType && !workTypes.includes(filters.workType) && <option value={filters.workType}>{filters.workType}</option>}
            </select>
          </label>
        </fieldset>

        <fieldset>
          <legend>Location</legend>
          <div className="location-picks">
            <SearchableSelect label="City" value={filters.city} options={cities} placeholder="Search cities" onChange={(city) => onChange({ city })} />
            <SearchableSelect label="County" value={filters.county} options={counties} placeholder="Search counties" onChange={(county) => onChange({ county })} />
          </div>
        </fieldset>

        <fieldset className="range-fieldset">
          <legend>Filed date</legend>
          <div className="choice-row">
            {FILED_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={filters.filedPreset === preset.id ? 'choice selected' : 'choice'}
                aria-pressed={filters.filedPreset === preset.id}
                onClick={() => onChange({ filedPreset: filters.filedPreset === preset.id ? '' : preset.id, registeredFrom: '', registeredTo: '' })}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="date-range">
            <label>From<input type="date" value={filters.registeredFrom} onChange={(event) => onChange({ filedPreset: '', registeredFrom: event.target.value })} /></label>
            <span className="range-to">to</span>
            <label>To<input type="date" value={filters.registeredTo} onChange={(event) => onChange({ filedPreset: '', registeredTo: event.target.value })} /></label>
          </div>
        </fieldset>

        {canHide && (
          <details className="filter-secondary">
            <summary>More options</summary>
            <label className="check-label">
              <input type="checkbox" checked={filters.hidden} onChange={(event) => onChange({ hidden: event.target.checked })} />
              Show hidden
            </label>
            <p className="fine-print">Hidden filings stay out of the list until this is on. Each one keeps its review note.</p>
          </details>
        )}
      </div>
      <div className="filters-footer">
        <button type="button" className="text-button" onClick={onClear}>Clear filters</button>
      </div>
    </div>
  );
}
