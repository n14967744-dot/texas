'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { browserDefaults } from '@/lib/browser-defaults';
import { listAvailable } from '@/lib/browse-lists';
import { readOfficeCookieFromDocument, resolveBrowserState, writeOfficeCookie } from '@/lib/browse-state';
import { clearProjectCache, readProjectCache, writeProjectCache } from '@/lib/project-cache';
import { filtersToQueryString } from '@/lib/project-params';
import type { Filters, SortKey } from '@/lib/query';
import type { ProjectListResponse, ProjectRow } from '@/lib/types';

const ASC_FIRST = new Set<SortKey>(['project_name', 'location_address', 'distance', 'rank', 'timing', 'start_date', 'completion_date']);

export function useBrowserState(initialFilters: Filters, initialData: ProjectListResponse | null) {
  const [filters, setFilters] = useState(initialFilters);
  const [searchText, setSearchText] = useState(initialFilters.q);
  const [data, setData] = useState<ProjectListResponse | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [forceFresh, setForceFresh] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<ProjectRow | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const pendingOpen = useRef<string | null>(null);
  const seeded = useRef(false);
  const tableRegion = useRef<HTMLDivElement>(null);

  useEffect(() => {
    pendingOpen.current = new URLSearchParams(window.location.search).get('open');
    setReady(true);
    const onPop = () => {
      const next = resolveBrowserState(new URLSearchParams(window.location.search), readOfficeCookieFromDocument());
      setFilters(next);
      setSearchText(next.q);
      setSelected(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    writeOfficeCookie(filters.office);
  }, [filters.office]);

  useEffect(() => {
    if (!ready || searchText === filters.q) return;
    const timer = window.setTimeout(() => setFilters((current) => ({ ...current, q: searchText, page: 1 })), 350);
    return () => window.clearTimeout(timer);
  }, [searchText, filters.q, ready]);

  const query = useMemo(() => filtersToQueryString(filters), [filters]);

  useEffect(() => {
    if (!ready || seeded.current || !initialData) return;
    writeProjectCache(query, initialData);
    seeded.current = true;
  }, [ready, initialData, query]);

  useEffect(() => {
    if (!ready) return;
    window.history.replaceState(null, '', query ? `?${query}` : '/');
    const controller = new AbortController();
    const cached = forceFresh ? null : readProjectCache(query);
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
    const url = forceFresh ? `/api/projects?${query}${query ? '&' : ''}_=${Date.now()}` : `/api/projects?${query}`;
    fetch(url, { signal: controller.signal, cache: forceFresh ? 'no-store' : 'default' })
      .then(async (response) => {
        const payload = await response.json() as ProjectListResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Unable to load projects.');
        return payload;
      })
      .then((payload) => {
        writeProjectCache(query, payload);
        setData(payload);
        if (payload.page !== filters.page) setFilters((current) => ({ ...current, page: payload.page }));
      })
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Unable to load projects.');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
          setForceFresh(false);
        }
      });
    return () => controller.abort();
    // `data` is omitted so the previous rows stay up while a refetch runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, ready, retry]);

  useEffect(() => {
    const target = pendingOpen.current;
    if (!target || !data) return;
    const row = data.projects.find((project) => project.project_number === target);
    pendingOpen.current = null;
    if (row) {
      setSelected(row);
      return;
    }
    setSelected({
      project_number: target,
      project_name: target,
      facility_name: null,
      location_address: null,
      location_city: null,
      location_county: null,
      current_status: null,
      type_of_work: null,
      scope_of_work: null,
      estimated_cost: null,
      registration_date: null,
      start_date: null,
      completion_date: null,
      fetched_at: null,
    });
  }, [data]);

  function patch(partial: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...partial, page: partial.page ?? 1 }));
  }

  function setOffice(office: string) {
    setFilters((current) => {
      const list = listAvailable(office, current.list) ? current.list : '';
      let sort = current.sort;
      let direction = current.direction;
      if (list !== current.list && sort === 'rank') {
        const defaults = browserDefaults({ office, list });
        sort = defaults.sort;
        direction = defaults.direction;
      }
      return { ...current, office, list, sort, direction, page: 1 };
    });
    setSelected(null);
  }

  function setList(list: string) {
    setFilters((current) => {
      const defaults = browserDefaults({ office: current.office, list });
      const sort = list === 'bryan-priority' ? 'rank' as const : (current.sort === 'rank' ? defaults.sort : current.sort);
      const direction = list === 'bryan-priority' ? 'asc' as const : (current.sort === 'rank' ? defaults.direction : current.direction);
      return { ...current, list, sort, direction, page: 1 };
    });
  }

  function clearFilters() {
    setSearchText('');
    setFilters((current) => {
      const defaults = browserDefaults({ office: current.office, list: current.list });
      return { ...defaults, sort: current.sort, direction: current.direction, pageSize: current.pageSize };
    });
  }

  function clearSearch() {
    setSearchText('');
    setFilters((current) => ({ ...current, q: '', page: 1 }));
  }

  function toggleSort(key: SortKey) {
    setFilters((current) => {
      if (current.sort === key) {
        return { ...current, direction: current.direction === 'asc' ? 'desc' : 'asc', page: 1 };
      }
      return { ...current, sort: key, direction: ASC_FIRST.has(key) ? 'asc' : 'desc', page: 1 };
    });
  }

  function goPage(page: number) {
    setFilters((current) => ({ ...current, page }));
    tableRegion.current?.scrollTo({ top: 0 });
  }

  function reload() {
    clearProjectCache(query);
    setForceFresh(true);
    setRetry((value) => value + 1);
  }

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const response = await fetch(`/api/projects/export?${query}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || 'Unable to export projects.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${filters.list || 'projects'}-${filters.office}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to export projects.');
    } finally {
      setExporting(false);
    }
  }

  return {
    filters,
    searchText,
    setSearchText,
    data,
    loading,
    refreshing,
    error,
    exporting,
    selected,
    setSelected,
    filtersOpen,
    setFiltersOpen,
    tableRegion,
    query,
    patch,
    setOffice,
    setList,
    clearFilters,
    clearSearch,
    toggleSort,
    goPage,
    reload,
    exportCsv,
  };
}
