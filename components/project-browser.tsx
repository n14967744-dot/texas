'use client';

import { activeFilterChips } from '@/lib/filter-chips';
import { listTitle } from '@/lib/browse-lists';
import { sortMetaLabel } from '@/lib/browser-defaults';
import { formatDate } from '@/lib/format';
import { ALL_TEXAS_ID, getOfficeBranch } from '@/lib/offices';
import type { Filters, SortKey } from '@/lib/query';
import { hasRanking } from '@/lib/smart-list-rankings';
import { getSmartList } from '@/lib/smart-lists';
import type { ProjectListResponse } from '@/lib/types';
import { FilterChips } from './browser/filter-chips';
import { FiltersPanel } from './browser/filters-panel';
import { OfficeListControls } from './browser/office-list-controls';
import { PaginationBar } from './browser/pagination-bar';
import { ResultsCards } from './browser/results-cards';
import { ResultsTable } from './browser/results-table';
import { SearchBox } from './browser/search-box';
import { UnknownLocationControl } from './browser/unknown-location';
import { useBrowserState } from './browser/use-browser-state';
import { Icon } from './icons';
import { ProjectModal } from './project-modal';
import { SiteHeader } from './site-header';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'distance', label: 'Distance' },
  { key: 'timing', label: 'Timing' },
  { key: 'start_date', label: 'Planned start' },
  { key: 'completion_date', label: 'Planned finish' },
  { key: 'estimated_cost', label: 'Estimated cost' },
  { key: 'registration_date', label: 'Filed date' },
  { key: 'project_name', label: 'Project name' },
  { key: 'location_address', label: 'Address' },
  { key: 'rank', label: 'Priority rank' },
];

export function ProjectBrowser({
  initialFilters,
  initialData,
}: {
  initialFilters: Filters;
  initialData: ProjectListResponse | null;
}) {
  const state = useBrowserState(initialFilters, initialData);
  const { filters, data } = state;
  const nearestOffice = filters.office === ALL_TEXAS_ID;
  const office = getOfficeBranch(filters.office);
  const officeName = nearestOffice ? 'All Texas' : office?.name ?? 'Office';
  const list = filters.list ? getSmartList(filters.list) : undefined;
  const chipCount = activeFilterChips(filters).length;
  const projects = data?.projects ?? [];
  const showSkeleton = state.loading && !data;
  const busy = state.loading || state.refreshing;
  const total = data && !state.error ? data.total : 0;
  const first = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const coverage = data && !state.error ? data.coverage : null;
  const unknownPool = coverage ? coverage.unknownPool : null;
  const scopeLine = nearestOffice
    ? 'All Texas projects. Distance is straight-line miles to the nearest visible office (Bryan–College Station or Waco).'
    : `Within ${filters.radius} miles straight-line of ${office?.address ?? officeName}.`;

  return (
    <div className="app-shell">
      <SiteHeader current="projects">
        <span className="freshness">
          <span className="freshness-dot" />
          {data?.latestFetch ? `Updated ${formatDate(data.latestFetch)}` : 'Project data'}
        </span>
      </SiteHeader>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <div className="eyebrow territory-eyebrow">PROJECTS</div>
            <h1>{listTitle(filters.list)}</h1>
            <p>{officeName}. {scopeLine} {sortMetaLabel(filters.sort, filters.direction)}.</p>
          </div>
          <div className="heading-actions">
            {filters.list === 'bryan-priority' && <a className="button" href="/reports/bryan-priority">Priority report</a>}
            <button type="button" className="button" disabled={state.exporting || !!state.error} onClick={() => void state.exportCsv()}>
              {state.exporting ? 'Exporting…' : 'Export CSV'}
            </button>
            <button type="button" className="button refresh-button" disabled={busy} onClick={state.reload} aria-label="Reload projects">
              <Icon name="refresh" size={15} /> Reload
            </button>
          </div>
        </div>

        <section className="project-workspace" aria-label="Project browser">
          <div className="browse-bar">
            <OfficeListControls office={filters.office} list={filters.list} onOffice={state.setOffice} onList={state.setList} />
            <SearchBox value={state.searchText} onChange={state.setSearchText} onClear={state.clearSearch} />
            <button
              type="button"
              className={`button filter-toggle${state.filtersOpen ? ' active' : ''}`}
              aria-expanded={state.filtersOpen}
              aria-controls="project-filters"
              onClick={() => state.setFiltersOpen((open) => !open)}
            >
              <Icon name="filter" size={15} />
              Filters{chipCount ? ` (${chipCount})` : ''}
            </button>
          </div>

          <FiltersPanel
            open={state.filtersOpen}
            filters={filters}
            cities={data?.facets.cities ?? []}
            counties={data?.facets.counties ?? []}
            workTypes={data?.facets.workTypes ?? []}
            unknownPool={nearestOffice ? null : unknownPool}
            onChange={state.patch}
            onClear={state.clearFilters}
            onClose={() => state.setFiltersOpen(false)}
          />
          <FilterChips filters={filters} onClearChip={state.patch} onClearAll={state.clearFilters} />

          {list && <p className="view-description">{list.description}</p>}

          <div className="browse-meta">
            <span className="result-count" aria-live="polite">
              {showSkeleton ? 'Loading projects…' : state.error ? 'Projects unavailable' : `${total.toLocaleString()} projects`}
            </span>
            {!nearestOffice && (
              <UnknownLocationControl
                count={unknownPool}
                checked={filters.includeUnknown}
                compact
                onChange={(includeUnknown) => state.patch({ includeUnknown })}
              />
            )}
            {coverage && (
              <span className="coverage-note">
                {coverage.address.toLocaleString()} address · {coverage.approximate.toLocaleString()} approximate · {coverage.unknown.toLocaleString()} unknown in these results (approximate = city or county center used because the address could not be matched).
              </span>
            )}
          </div>

          <label className="mobile-sort select-control">
            <span>Sort</span>
            <select
              aria-label="Sort projects"
              value={`${filters.sort}:${filters.direction}`}
              onChange={(event) => {
                const [sort, direction] = event.target.value.split(':') as [SortKey, 'asc' | 'desc'];
                state.patch({ sort, direction });
              }}
            >
              {SORT_OPTIONS.filter((option) => option.key !== 'rank' || hasRanking(filters.list)).map((option) => (
                <optgroup key={option.key} label={option.label}>
                  <option value={`${option.key}:asc`}>{option.label}, ascending</option>
                  <option value={`${option.key}:desc`}>{option.label}, descending</option>
                </optgroup>
              ))}
            </select>
          </label>

          {state.error && projects.length > 0 && (
            <p className="browse-error" role="alert">{state.error}</p>
          )}
          <div ref={state.tableRegion} className="table-region" aria-busy={busy}>
            <ResultsTable
              projects={projects}
              sort={filters.sort}
              direction={filters.direction}
              nearestOffice={nearestOffice}
              listId={filters.list}
              showSkeleton={showSkeleton}
              error={projects.length ? '' : state.error}
              onSort={state.toggleSort}
              onOpen={state.setSelected}
              onRetry={state.reload}
            />
            <ResultsCards
              projects={projects}
              nearestOffice={nearestOffice}
              listId={filters.list}
              showSkeleton={showSkeleton}
              error={projects.length ? '' : state.error}
              onOpen={state.setSelected}
              onRetry={state.reload}
            />
          </div>

          <PaginationBar
            page={data?.page ?? filters.page}
            pages={data?.pages ?? 1}
            pageSize={filters.pageSize}
            total={state.error ? 0 : total}
            first={first}
            last={last}
            busy={busy}
            refreshing={state.refreshing}
            error={Boolean(state.error) && !data}
            onPage={state.goPage}
            onPageSize={(pageSize) => state.patch({ pageSize })}
          />
        </section>

        <div className="workspace-footnote">
          <span>Source: Texas Architectural Barriers System</span>
          <span>Distance is straight-line, not driving. Planned dates are estimates from the state filing.</span>
        </div>
      </main>
      {state.selected && (
        <ProjectModal summary={state.selected} nearestOffice={nearestOffice} listId={filters.list} onClose={() => state.setSelected(null)} />
      )}
    </div>
  );
}
