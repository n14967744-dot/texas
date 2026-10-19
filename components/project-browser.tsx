'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { COVERAGE_VIEWS, getOffice, type OfficeId } from '@/lib/offices';
import type { ProjectListResponse, ProjectRow } from '@/lib/types';
import { formatDate, formatMoney } from '@/lib/format';
import { Icon } from './icons';
import { ScopePreview } from './scope-preview';
import { StatusBadge } from './status-badge';
import { ProjectModal } from './project-modal';
import { getSmartList, SMART_LISTS } from '@/lib/smart-lists';
import { buildProjectSearchParams } from '@/lib/project-params';
import { browserDefaults, sortMetaLabel } from '@/lib/browser-defaults';
import { COMPLETION_PRESETS, completionPresetRange, type CompletionPresetId } from '@/lib/date-presets';
import { clearProjectCache, readProjectCache, writeProjectCache } from '@/lib/project-cache';
import { getReviewEntry } from '@/lib/smart-list-review';
import { getRanking, getRankingEntry, hasRanking, PRIORITY_TIER_LABELS } from '@/lib/smart-list-rankings';
import { RADIUS_OPTIONS } from '@/lib/radius';

type View = 'all' | 'recent' | 'soon' | 'completed';
type Sort = 'estimated_cost' | 'project_name' | 'location_address' | 'current_status' | 'completion_date' | 'registration_date' | 'distance' | 'rank';
type State = ReturnType<typeof browserDefaults> & { office: OfficeId; view: View; sort: Sort };

function baseDefaults(listId?: string): State {
  return browserDefaults(listId) as State;
}

const views = [
  { id: 'all', label: 'All projects' },
  { id: 'recent', label: 'Recently registered' },
  { id: 'soon', label: 'Completing soon' },
  { id: 'completed', label: 'Recently completed' },
] as const;

function readUrl(defaults: State, listId?: string): State {
  const p = new URLSearchParams(window.location.search);
  const result = { ...defaults };
  if (getOffice(p.get('office') || '')) result.office = p.get('office') as OfficeId;
  if (result.office === 'texas' && p.get('coverage') === 'outside') result.coverage = 'outside';
  if (['all', 'recent', 'soon', 'completed'].includes(p.get('view') || '')) result.view = p.get('view') as View;
  for (const k of ['q', 'city', 'county', 'status', 'completionFrom', 'completionTo', 'registeredFrom', 'registeredTo'] as const) {
    result[k] = p.get(k) || '';
  }
  if (['project_name', 'location_address', 'current_status', 'completion_date', 'registration_date', 'estimated_cost', 'distance'].includes(p.get('sort') || '')) {
    result.sort = p.get('sort') as Sort;
  }
  if (p.get('sort') === 'rank' && listId && hasRanking(listId)) result.sort = 'rank';
  if (p.get('scope') === 'radius' || p.get('scope') === 'territory') result.scope = p.get('scope') as State['scope'];
  const radius = Number(p.get('radius')); if ((RADIUS_OPTIONS as readonly number[]).includes(radius)) result.radius = radius;
  if (result.scope !== 'radius' && result.sort === 'distance') { result.sort = defaults.sort; result.direction = defaults.direction; }
  if (p.get('direction') === 'asc') result.direction = 'asc';
  if (p.get('direction') === 'desc') result.direction = 'desc';
  const page = Number(p.get('page'));
  if (Number.isSafeInteger(page) && page > 0 && page <= 100000) result.page = page;
  const size = Number(p.get('pageSize'));
  if ([10, 25, 50].includes(size)) result.pageSize = size;
  if (p.has('upcoming')) result.upcoming = p.get('upcoming') === '1' || p.get('upcoming') === 'true';
  if (p.has('hidden')) result.hidden = p.get('hidden') === '1' || p.get('hidden') === 'true';
  return result;
}

function csvEscape(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value);
  return /["\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function downloadListCsv(query: string, filename: string, listId?: string) {
  const rows: ProjectRow[] = [];
  let page = 1;
  let pages = 1;
  while (page <= pages) {
    const params = new URLSearchParams(query);
    params.set('page', String(page));
    params.set('pageSize', '50');
    const response = await fetch(`/api/projects?${params}`);
    const payload = await response.json() as ProjectListResponse & { error?: string };
    if (!response.ok) throw new Error(payload.error || 'Unable to export projects.');
    rows.push(...payload.projects);
    pages = payload.pages;
    page += 1;
    if (page > 200) break;
  }
  const cols: (keyof ProjectRow)[] = [
    'project_number', 'project_name', 'facility_name', 'location_address', 'location_city',
    'location_county', 'current_status', 'type_of_work', 'scope_of_work', 'estimated_cost',
    'registration_date', 'completion_date',
  ];
  const reviewCols = listId ? ['review_decision', 'review_reason', 'cost_note'] : [];
  const distCols = listId && rows.some((r) => r.distance_mi != null) ? ['distance_mi', 'geo_precision'] : [];
  const rankCols = listId && hasRanking(listId) ? ['priority_rank', 'priority_tier', 'priority_note'] : [];
  const header = [...cols, ...reviewCols, ...distCols, ...rankCols].join(',');
  const lines = [header].concat(rows.map((row) => {
    const base = cols.map((col) => csvEscape(row[col]));
    if (!listId) return base.join(',');
    const entry = getReviewEntry(listId, row.project_number);
    const extra = [csvEscape(entry?.decision || 'keep'), csvEscape(entry?.reason || ''), csvEscape(entry?.costNote || '')];
    if (distCols.length) {
      extra.push(csvEscape(row.distance_mi), csvEscape(row.geo_precision || ''));
    }
    if (rankCols.length) {
      const ranked = getRankingEntry(listId, row.project_number);
      extra.push(csvEscape(ranked?.rank), csvEscape(ranked ? PRIORITY_TIER_LABELS[ranked.tier] : ''), csvEscape(ranked?.note || ''));
    }
    return [...base, ...extra].join(',');
  }));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function pageNumbers(current: number, total: number): (number | string)[] {
  const pages = [...new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total))].sort((a, b) => a - b);
  const out: (number | string)[] = [];
  pages.forEach((p, i) => {
    if (i && p - pages[i - 1] > 1) out.push(`gap-${p}`);
    out.push(p);
  });
  return out;
}

function activeCompletionPreset(filters: State): CompletionPresetId | null {
  for (const preset of COMPLETION_PRESETS) {
    const range = completionPresetRange(preset.id);
    if (filters.completionFrom === range.completionFrom && filters.completionTo === range.completionTo) return preset.id;
  }
  return null;
}

export function ProjectBrowser({
  listId,
  initialData = null,
}: {
  listId?: string;
  initialData?: ProjectListResponse | null;
} = {}) {
  const list = listId ? getSmartList(listId) : undefined;
  const ranked = Boolean(listId && hasRanking(listId));
  const hasReport = Boolean(listId && getRanking(listId)?.report);
  const defaults = useMemo(() => baseDefaults(listId), [listId]);
  const [filters, setFilters] = useState<State>(defaults);
  const [search, setSearch] = useState('');
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<ProjectListResponse | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [forceFresh, setForceFresh] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [selected, setSelected] = useState<ProjectRow | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const tableRegion = useRef<HTMLDivElement>(null);
  const seededRef = useRef(false);
  // `?open=<TABS#>` (used by report links) opens that project's details once its row loads.
  const pendingOpen = useRef<string | null>(null);

  useEffect(() => {
    const restore = () => {
      pendingOpen.current = new URLSearchParams(window.location.search).get('open');
      const f = readUrl(defaults, listId);
      setFilters(f);
      setSearch(f.q);
      setSelected(null);
    };
    restore();
    setReady(true);
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [defaults, listId]);

  useEffect(() => {
    if (!ready || search === filters.q) return;
    const timer = window.setTimeout(() => setFilters((f) => ({ ...f, q: search, page: 1 })), 350);
    return () => window.clearTimeout(timer);
  }, [search, filters.q, ready]);

  const params = useMemo(
    () => buildProjectSearchParams(filters, { listId }),
    [filters, listId],
  );

  // Seed cache + UI from SSR payload once for the default query.
  useEffect(() => {
    if (!ready || seededRef.current || !initialData) return;
    const defaultParams = buildProjectSearchParams(defaults, { listId });
    if (params === defaultParams) {
      writeProjectCache(params, initialData);
      seededRef.current = true;
    }
  }, [ready, initialData, params, defaults, listId]);

  useEffect(() => {
    if (!ready) return;
    window.history.replaceState(null, '', params ? `?${params}` : window.location.pathname);
    const controller = new AbortController();
    const cached = forceFresh ? null : readProjectCache(params);
    if (cached) {
      setData(cached);
      setLoading(false);
      setRefreshing(true);
    } else if (!data) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError('');

    const url = forceFresh
      ? `/api/projects?${params}${params ? '&' : ''}_=${Date.now()}`
      : `/api/projects?${params}`;

    fetch(url, {
      signal: controller.signal,
      cache: forceFresh ? 'no-store' : 'default',
    })
      .then(async (r) => {
        const payload = await r.json() as ProjectListResponse & { error?: string };
        if (!r.ok) throw new Error(payload.error || 'Unable to load projects.');
        return payload as ProjectListResponse;
      })
      .then((payload) => {
        writeProjectCache(params, payload);
        setData(payload);
        if (payload.page !== filters.page) setFilters((f) => ({ ...f, page: payload.page }));
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
          setForceFresh(false);
        }
      });
    return () => controller.abort();
    // intentionally omit `data` — keep previous rows while refetching
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, ready, retry]);

  useEffect(() => {
    const target = pendingOpen.current;
    if (!target || !data) return;
    const row = data.projects.find((p) => p.project_number === target);
    if (row) {
      pendingOpen.current = null;
      setSelected(row);
    }
  }, [data]);

  const office = getOffice(filters.office)!;
  const counties = office.counties || data?.facets.counties || [];
  const coverageLabel = filters.office === 'texas'
    ? (filters.coverage === 'outside' ? 'Outside mapped CTWP counties' : 'Texas records in our database')
    : filters.office === 'all'
      ? 'All seven office territories'
      : `${office.counties?.join(', ')} County`;
  const change = (patch: Partial<State>) => setFilters((f) => ({ ...f, ...patch, page: 1 }));
  const switchOffice = (id: OfficeId) => {
    setFilters({ ...defaults, office: id, upcoming: filters.upcoming, hidden: filters.hidden, scope: filters.scope, radius: filters.radius, sort: filters.scope === 'radius' && filters.sort === 'distance' ? 'distance' : defaults.sort, direction: filters.scope === 'radius' && filters.sort === 'distance' ? filters.direction : defaults.direction });
    setSearch('');
    setData(null);
    setSelected(null);
    setDatesOpen(false);
  };
  const clear = () => {
    setFilters({ ...defaults, office: filters.office, view: filters.view, upcoming: filters.upcoming, hidden: filters.hidden, scope: filters.scope, radius: filters.radius });
    setSearch('');
  };
  function reload() {
    clearProjectCache(params);
    setForceFresh(true);
    setRetry((r) => r + 1);
  }
  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadListCsv(params, `${listId || 'projects'}.csv`, listId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to export projects.');
    } finally {
      setExporting(false);
    }
  }
  const sort = (key: Sort) => change({
    sort: key,
    direction: filters.sort === key
      ? (filters.direction === 'asc' ? 'desc' : 'asc')
      : (key === 'project_name' || key === 'location_address' || key === 'current_status' || key === 'distance' || key === 'rank' ? 'asc' : 'desc'),
  });
  const activeCount = [
    filters.coverage === 'outside' ? 'outside' : '',
    filters.city,
    filters.county,
    filters.status,
    filters.completionFrom || filters.completionTo,
    filters.registeredFrom || filters.registeredTo,
  ].filter(Boolean).length;
  const dateCount = Number(Boolean(filters.completionFrom || filters.completionTo))
    + Number(Boolean(filters.registeredFrom || filters.registeredTo));
  const totals = data && !error ? data.total : null;
  const first = data && data.total ? (data.page - 1) * data.pageSize + 1 : 0;
  const last = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const showSkeleton = loading && !data;
  const busy = loading || refreshing;
  const presetActive = activeCompletionPreset(filters);
  const columnCount = 8 + Number(Boolean(list && filters.scope === 'radius')) + Number(ranked);

  function goPage(page: number) {
    setFilters((f) => ({ ...f, page }));
    tableRegion.current?.scrollTo({ top: 0 });
  }
  function header(label: string, key: Sort) {
    return (
      <th scope="col" aria-sort={filters.sort === key ? (filters.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button className="sort-button" onClick={() => sort(key)}>
          {label}
          <Icon name={filters.sort === key ? 'down' : 'sort'} size={13} style={filters.sort === key && filters.direction === 'asc' ? { transform: 'rotate(180deg)' } : undefined} />
        </button>
      </th>
    );
  }
  function applyPreset(id: CompletionPresetId) {
    change(completionPresetRange(id));
  }

  const viewTabs = (
    <div className="saved-views" role="tablist" aria-label="Saved project views">
      {views.map((v) => (
        <button
          key={v.id}
          role="tab"
          aria-selected={filters.view === v.id}
          className={filters.view === v.id ? 'active' : ''}
          onClick={() => change({
            view: v.id,
            ...(v.id === 'completed' ? { sort: 'completion_date' as Sort, direction: 'desc' as const } : {}),
          })}
        >
          {v.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`app-shell${list ? ' smart-list-shell' : ''}`}>
      <header className="app-header">
        <a className="brand" href="/" aria-label="CTWP Project Explorer home">
          <img src="/ctwp-logo.png" alt="CTWP" width="290" height="62" />
        </a>
        <span className="header-divider" />
        <span className="product-name">Project Explorer</span>
        <nav className="browser-mode" aria-label="Browse mode">
          <a href="/" className={list ? undefined : 'active'} aria-current={list ? undefined : 'page'}>Projects</a>
          <a href="/lists" className={list ? 'active' : undefined} aria-current={list ? 'page' : undefined}>Smart Lists</a>
          <a href={`/prospects?${new URLSearchParams({ office: filters.office, coverage: filters.coverage })}`}>Prospects</a>
        </nav>
        <div className="header-end">
          <span className="freshness">
            <span className="freshness-dot" /> {data?.latestFetch ? `Checked ${formatDate(data.latestFetch)}` : 'Live database'}
          </span>
        </div>
      </header>
      <nav className="office-nav" aria-label="CTWP offices">
        {COVERAGE_VIEWS.map((o) => (
          <button key={o.id} className={filters.office === o.id ? 'active' : ''} aria-current={filters.office === o.id ? 'page' : undefined} onClick={() => switchOffice(o.id)}>
            {o.name}
          </button>
        ))}
      </nav>
      <main className="workspace">
        <div className="page-heading">
          <div>
            <div className="eyebrow territory-eyebrow">{list ? 'SMART LIST' : 'TERRITORY PROJECTS'}</div>
            <h1>{list ? list.title : office.name}</h1>
            <p>{list ? list.description : coverageLabel}</p>
            {list && <p className="smart-list-meta">{coverageLabel} · {sortMetaLabel(filters.sort, filters.direction)}</p>}
          </div>
          <div className="heading-actions">
            <span className="territory-label"><Icon name="pin" size={15} />{coverageLabel}</span>
            {hasReport && <a className="report-link" href={`/reports/${listId}`}>View priority report →</a>}
            {list && (
              <button className="button" disabled={busy || exporting || !!error || !data?.total} onClick={exportCsv} aria-label="Download CSV of this smart list">
                {exporting ? 'Exporting…' : 'Export CSV'}
              </button>
            )}
            <button className="button refresh-button" aria-label="Reload projects from database" disabled={busy} onClick={reload}>
              <Icon name="refresh" size={16} />Reload
            </button>
          </div>
        </div>

        <div className="view-bar">
          {list ? (
            <div className="smart-list-controls" role="group" aria-label="Smart list options">
              <button type="button" className={filters.upcoming ? 'active' : ''} aria-pressed={filters.upcoming} onClick={() => change({ upcoming: !filters.upcoming })}>
                Upcoming only
              </button>
              <button type="button" className={filters.hidden ? 'active' : ''} aria-pressed={filters.hidden} onClick={() => change({ hidden: !filters.hidden })}>
                Show hidden
              </button>
              <div className="coverage-controls" role="group" aria-label="Coverage mode">
                <span className="coverage-label">Coverage</span>
                <button type="button" className={filters.scope === 'territory' ? 'active' : ''} aria-pressed={filters.scope === 'territory'} onClick={() => change({ scope: 'territory', sort: filters.sort === 'distance' ? defaults.sort : filters.sort, direction: filters.sort === 'distance' ? defaults.direction : filters.direction })}>
                  Territory counties
                </button>
                <button type="button" className={filters.scope === 'radius' ? 'active' : ''} aria-pressed={filters.scope === 'radius'} onClick={() => change({ scope: 'radius' })}>
                  Within {filters.radius} mi
                </button>
                {filters.scope === 'radius' && (
                  <label className="select-control radius-select">
                    <span className="sr-only">Radius miles</span>
                    <select aria-label="Radius in miles" value={filters.radius} onChange={(e) => change({ radius: Number(e.target.value) })}>
                      {RADIUS_OPTIONS.map((mi) => <option key={mi} value={mi}>{mi} miles</option>)}
                    </select>
                    <Icon name="down" size={14} />
                  </label>
                )}
              </div>
              {viewTabs}
              <a className="smart-list-catalog-link" href="/lists">All smart lists</a>
              {SMART_LISTS.length > 1 && SMART_LISTS.map((item) => (
                <a key={item.id} href={`/lists/${item.id}`} className={item.id === list.id ? 'active-list' : ''}>{item.title}</a>
              ))}
            </div>
          ) : viewTabs}
          <span className="result-count" aria-live="polite">
            {showSkeleton
              ? 'Loading projects…'
              : refreshing
                ? (totals !== null ? `Updating… · ${totals.toLocaleString()} projects` : 'Updating…')
                : totals !== null
                  ? (data && data.pages > 1 ? `${totals.toLocaleString()} projects · page ${data.page} of ${data.pages}` : `${totals.toLocaleString()} projects`)
                  : 'Projects unavailable'}
          </span>
        </div>

        <section className="project-workspace" aria-label="Project browser">
          <div className="toolbar">
            <div className="search-field">
              <Icon name="search" size={18} />
              <input type="search" aria-label="Search projects or addresses" placeholder="Search projects or addresses…" maxLength={200} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <button className="button mobile-filter-toggle" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
              <Icon name="filter" />Filters{activeCount > 0 && <span className="filter-count">{activeCount}</span>}
            </button>
            <div className={`filter-controls ${filtersOpen ? 'expanded' : ''}`}>
              {filters.office === 'texas' && (
                <label className="select-control">
                  <span className="sr-only">Territory coverage</span>
                  <select aria-label="Territory coverage" value={filters.coverage} onChange={(e) => { setData(null); change({ coverage: e.target.value as State['coverage'], county: '', city: '' }); }}>
                    <option value="all">All Texas projects</option>
                    <option value="outside">Outside CTWP territories</option>
                  </select>
                  <Icon name="down" size={14} />
                </label>
              )}
              <label className="select-control">
                <span className="sr-only">County</span>
                <select aria-label="Filter by county" value={filters.county} onChange={(e) => change({ county: e.target.value, city: '' })}>
                  <option value="">{filters.office === 'texas' ? 'All counties' : 'All territory counties'}</option>
                  {counties.map((c) => <option key={c} value={c}>{c} County</option>)}
                </select>
                <Icon name="down" size={14} />
              </label>
              <label className="select-control">
                <span className="sr-only">City</span>
                <select aria-label="Filter by city" value={filters.city} onChange={(e) => change({ city: e.target.value })}>
                  <option value="">All cities</option>
                  {data?.facets.cities.map((c) => <option key={c}>{c}</option>)}
                </select>
                <Icon name="down" size={14} />
              </label>
              <label className="select-control status-select">
                <span className="sr-only">TABS status</span>
                <select aria-label="Filter by TABS status" value={filters.status} onChange={(e) => change({ status: e.target.value })}>
                  <option value="">All statuses</option>
                  {data?.facets.statuses.map((s) => <option key={s}>{s}</option>)}
                </select>
                <Icon name="down" size={14} />
              </label>
              <button className={`button ${datesOpen || dateCount ? 'filter-active' : ''}`} onClick={() => setDatesOpen((v) => !v)} aria-expanded={datesOpen} aria-controls="date-filters">
                <Icon name="calendar" size={16} />Dates{dateCount > 0 && <span className="filter-count">{dateCount}</span>}<Icon name="down" size={13} />
              </button>
            </div>
          </div>

          {datesOpen && (
            <div className="date-panel" id="date-filters">
              <fieldset>
                <legend>Registration date</legend>
                <div className="date-range">
                  <label>From<input type="date" value={filters.registeredFrom} onChange={(e) => change({ registeredFrom: e.target.value })} /></label>
                  <span>–</span>
                  <label>To<input type="date" value={filters.registeredTo} onChange={(e) => change({ registeredTo: e.target.value })} /></label>
                </div>
              </fieldset>
              <fieldset>
                <legend>Estimated completion</legend>
                <div className="date-range">
                  <label>From<input type="date" value={filters.completionFrom} onChange={(e) => change({ completionFrom: e.target.value })} /></label>
                  <span>–</span>
                  <label>To<input type="date" value={filters.completionTo} onChange={(e) => change({ completionTo: e.target.value })} /></label>
                </div>
              </fieldset>
              <div className="date-presets">
                <div className="date-presets-label">Completion presets</div>
                <div className="date-preset-row" role="group" aria-label="Estimated completion presets">
                  {COMPLETION_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={`date-preset${presetActive === preset.id ? ' active' : ''}`}
                      aria-pressed={presetActive === preset.id}
                      onClick={() => applyPreset(preset.id)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <button className="text-button" onClick={() => change({ registeredFrom: '', registeredTo: '', completionFrom: '', completionTo: '' })}>Clear dates</button>
            </div>
          )}

          {(activeCount > 0 || filters.q) && (
            <div className="active-filters">
              <span>{activeCount + Number(Boolean(filters.q))} active {activeCount + Number(Boolean(filters.q)) === 1 ? 'filter' : 'filters'}</span>
              {filters.coverage === 'outside' && <span className="filter-chip">Outside mapped CTWP counties</span>}
              {filters.q && <span className="filter-chip">Search: {filters.q}</span>}
              {filters.city && <span className="filter-chip">{filters.city}</span>}
              {filters.status && <span className="filter-chip">{filters.status}</span>}
              <button className="text-button" onClick={clear}>Clear filters</button>
            </div>
          )}

          {list && filters.upcoming && (
            <div className="view-description">Upcoming only: estimated completion on or after today, excluding Project Closed and Inspection Complete. Toggle off to see every match with status so you can filter.</div>
          )}
          {list && filters.hidden && (
            <div className="view-description">{ranked
              ? 'Showing reviewed bad fits (roads, parks, c-stores, restaurants, speculative shells, storage, tiny scopes, duplicates). Hidden rows are excluded from the default list and CSV counts; hover the Hidden badge for the reason.'
              : 'Showing manually hidden filings (office build-outs, guardhouses, incidental IT rooms, etc.). Hidden rows are excluded from the default list and CSV counts; reasons appear on each row.'}</div>
          )}
          {ranked && filters.sort === 'rank' && !filters.hidden && (
            <div className="view-description">Ranked for office-equipment sales: timing first (finishing within 6 months, then under construction, then not started), then fit (document-heavy uses rank higher), then size. Tier and a one-line reason appear on each row.</div>
          )}
          {list && filters.scope === 'radius' && (
            <div className="view-description">
              {filters.office === 'texas' || filters.office === 'all'
                ? `Within ${filters.radius} miles of any CTWP office (city-center coordinates). Distance is to the nearest office. Locations use Census address geocodes when available, otherwise city/county centroids.`
                : `Within ${filters.radius} miles of the ${office.name} office (Census city-center coordinates; no street address on file). Project pins use Census address geocodes when available, otherwise city/county centroids.`}
            </div>
          )}
          {filters.view !== 'all' && (
            <div className="view-description">
              {filters.view === 'recent'
                ? 'Projects registered within the last 30 calendar days.'
                : filters.view === 'completed'
                  ? 'Estimated completion dates in the past 30 calendar days, including today. Actual completion is not verified.'
                  : 'Estimated completion within the next six months. Dates do not confirm construction progress.'}
            </div>
          )}

          <div className={`table-region${refreshing ? ' is-refreshing' : ''}`} ref={tableRegion} aria-busy={busy}>
            <table className={ranked ? 'ranked-table' : undefined}>
              <thead>
                <tr>
                  {ranked && header('Priority', 'rank')}
                  {header('Project', 'project_name')}
                  {header('Address', 'location_address')}
                  <th scope="col"><span className="column-label">Scope / description</span></th>
                  {header('Est. cost', 'estimated_cost')}
                  {list && filters.scope === 'radius' && header('Distance', 'distance')}
                  {header('TABS status', 'current_status')}
                  {header('Est. completion', 'completion_date')}
                  {header('Registered', 'registration_date')}
                  <th className="row-arrow" scope="col"><span className="sr-only">Open details</span></th>
                </tr>
              </thead>
              <tbody>
                {showSkeleton ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr className="skeleton-row" key={i}>
                      {ranked && <td><div className="skeleton short" /></td>}
                      <td><div className="skeleton" /><div className="skeleton short" /></td>
                      <td><div className="skeleton" /><div className="skeleton short" /></td>
                      <td><div className="skeleton" /></td>
                      <td><div className="skeleton" /></td>
                      <td><div className="skeleton badge-skeleton" /></td>
                      <td><div className="skeleton" /></td>
                      <td><div className="skeleton" /></td>
                      <td />
                    </tr>
                  ))
                ) : error && !data?.projects.length ? (
                  <tr>
                    <td colSpan={columnCount}>
                      <div className="state-message" role="alert">
                        <Icon name="alert" size={30} />
                        <h2>Unable to load projects</h2>
                        <p>{error}</p>
                        <button className="button primary" onClick={reload}>Try again</button>
                      </div>
                    </td>
                  </tr>
                ) : !data?.projects.length ? (
                  <tr>
                    <td colSpan={columnCount}>
                      <div className="state-message">
                        <Icon name="search" size={30} />
                        <h2>No projects found</h2>
                        <p>Try a different search, date range, or saved view.</p>
                        {(activeCount > 0 || search) ? (
                          <button className="button" onClick={clear}>Clear filters</button>
                        ) : (
                          <button className="button" onClick={() => change({ view: 'all' })}>View all projects</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.projects.map((p) => (
                    <tr key={p.project_number} className="project-row" onClick={() => setSelected(p)}>
                      {ranked && (() => {
                        const entry = listId ? getRankingEntry(listId, p.project_number) : undefined;
                        return (
                          <td className="priority-cell">
                            {entry ? (
                              <>
                                <span className="priority-rank">#{entry.rank}</span>
                                <span className={`priority-tier ${entry.tier}`}>{PRIORITY_TIER_LABELS[entry.tier]}</span>
                              </>
                            ) : <span className="priority-rank muted">—</span>}
                          </td>
                        );
                      })()}
                      <td className="project-cell">
                        <button className="project-name" onClick={(e) => { e.stopPropagation(); setSelected(p); }}>
                          {p.project_name || p.facility_name || p.project_number}
                        </button>
                        {listId ? (() => {
                          const entry = getReviewEntry(listId, p.project_number);
                          if (!entry) return null;
                          return (
                            <span className="review-badges">
                              {entry.decision === 'hide' && <span className="review-badge hide" title={entry.reason}>Hidden</span>}
                              {entry.decision === 'review' && <span className="review-badge review" title={entry.reason}>Review</span>}
                              {entry.costNote && <span className="review-badge cost" title={entry.costNote}>Cost note</span>}
                            </span>
                          );
                        })() : null}
                        {ranked && listId && (() => {
                          const entry = getRankingEntry(listId, p.project_number);
                          return entry ? <span className="priority-note">{entry.note}</span> : null;
                        })()}
                        <span className="secondary-line">{p.type_of_work || 'Work type not listed'}</span>
                      </td>
                      <td className="address-cell">
                        <span>{p.location_address || 'Address not listed'}</span>
                        <span className="secondary-line">{p.location_city ? `${p.location_city}, TX` : 'City not listed'}</span>
                      </td>
                      <td><ScopePreview scope={p.scope_of_work} /></td>
                      <td className="cost-cell">{formatMoney(p.estimated_cost)}</td>
                      {list && filters.scope === 'radius' && (
                        <td className="distance-cell" title={p.geo_precision ? `Location precision: ${p.geo_precision}` : undefined}>
                          {p.distance_mi != null ? `${p.distance_mi.toFixed(1)} mi` : '—'}
                          {p.geo_precision && p.geo_precision !== 'address' ? <span className="geo-precision">{p.geo_precision}</span> : null}
                        </td>
                      )}
                      <td><StatusBadge status={p.current_status} /></td>
                      <td className="date-cell">{formatDate(p.completion_date)}</td>
                      <td className="date-cell registered-cell">{formatDate(p.registration_date)}</td>
                      <td className="row-arrow"><Icon name="chevron" size={16} /></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <footer className="table-footer">
            <div className="pagination-summary">
              {data && !error && !showSkeleton
                ? `Showing ${first.toLocaleString()}–${last.toLocaleString()} of ${data.total.toLocaleString()}${data.pages > 1 ? ` · page ${data.page} of ${data.pages}` : ''}${refreshing ? ' · updating' : ''}`
                : showSkeleton
                  ? 'Loading records…'
                  : 'No records to display'}
              <label className="page-size">
                <span className="sr-only">Rows per page</span>
                <select aria-label="Rows per page" value={filters.pageSize} onChange={(e) => change({ pageSize: Number(e.target.value) })}>
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </label>
            </div>
            <nav className="pagination" aria-label="Project pages">
              <button className="page-button" aria-label="Previous page" disabled={busy || !data || data.page <= 1 || !!error} onClick={() => goPage(filters.page - 1)}>
                <Icon name="chevron" size={16} style={{ transform: 'rotate(180deg)' }} />
              </button>
              {data && !error && pageNumbers(data.page, data.pages).map((p) => (
                typeof p === 'number'
                  ? <button key={p} className={`page-button ${data.page === p ? 'active' : ''}`} aria-label={`Page ${p}`} aria-current={data.page === p ? 'page' : undefined} disabled={busy} onClick={() => goPage(p)}>{p}</button>
                  : <span className="page-gap" key={p}>…</span>
              ))}
              <button className="page-button" aria-label="Next page" disabled={busy || !data || data.page >= data.pages || !!error} onClick={() => goPage(filters.page + 1)}>
                <Icon name="chevron" size={16} />
              </button>
            </nav>
          </footer>
        </section>

        <div className="workspace-footnote">
          <span>Source: Texas Architectural Barriers System</span>
          <span>{filters.office === 'texas' ? 'Collected Texas records · Office counties are provisional · Dates are estimates' : 'Territory coverage is provisional · Dates are estimates'}</span>
        </div>
      </main>
      {selected && <ProjectModal summary={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
