'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as LeafletMap, LatLngTuple } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { HereLocation } from '@/lib/here-location';
import type { TimingTone } from '@/lib/timing';
import type { MapProject, ProjectMapResponse, ProjectRow } from '@/lib/types';

const PIN_STYLES: Record<TimingTone, { color: string; label: string }> = {
  behind: { color: '#b45309', label: 'Behind?' },
  stale: { color: '#be123c', label: 'Stale' },
  drive_by: { color: '#7e22ce', label: 'Needs drive-by' },
  inspected: { color: '#166534', label: 'Inspected' },
  closed: { color: '#475569', label: 'Closed' },
  ahead: { color: '#1d4ed8', label: 'Start upcoming' },
  active: { color: '#0f766e', label: 'Finish upcoming / planned start' },
  seen: { color: '#a16207', label: 'Field-note sighting' },
  unknown: { color: '#64748b', label: 'Timing not listed' },
};

function mapSummary(project: MapProject): ProjectRow {
  return {
    project_number: project.project_number,
    project_name: project.name,
    location_city: project.city,
    geo_precision: project.precision,
    timing_label: project.timing_label,
    timing_tag: project.timing_tag,
    timing_tone: project.timing_tone,
    facility_name: null, location_address: null, location_county: null,
    current_status: null, type_of_work: null, scope_of_work: null, estimated_cost: null,
    registration_date: null, start_date: null, completion_date: null, fetched_at: null,
  };
}

export function ProjectMap({ query, here, refreshKey, onOpen }: {
  query: string;
  here: HereLocation | null;
  refreshKey: number;
  onOpen: (row: ProjectRow) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<ProjectMapResponse | null>(null);
  const [error, setError] = useState('');
  const [mapError, setMapError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const mapQuery = useMemo(() => {
    const params = new URLSearchParams(query);
    params.delete('page');
    params.delete('pageSize');
    return params.toString();
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError('');
    fetch(`/api/projects/map?${mapQuery}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json() as ProjectMapResponse & { error?: string };
        if (!response.ok) throw new Error(payload.error || 'Unable to load the map.');
        return payload;
      })
      .then((payload) => { if (!controller.signal.aborted) setData(payload); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load the map.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mapQuery, refreshKey, attempt]);

  useEffect(() => {
    if (!data || !container.current) return;
    let disposed = false;
    let map: LeafletMap | undefined;
    setMapError('');
    // Leaflet reads window/document at import time. Keep the runtime import inside this effect.
    import('leaflet').then((L) => {
      if (disposed || !container.current) return;
      map = L.map(container.current).setView([31, -99], 6);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        maxZoom: 19,
        // Request tiles for the visible viewport only, after panning/zooming finishes.
        updateWhenIdle: true,
        updateWhenZooming: false,
        keepBuffer: 0,
      }).addTo(map);
      const bounds: LatLngTuple[] = [];
      for (const project of data.projects) {
        if (project.lat == null || project.lng == null || !Number.isFinite(project.lat) || !Number.isFinite(project.lng)) continue;
        const point: LatLngTuple = [project.lat, project.lng];
        bounds.push(point);
        const style = PIN_STYLES[project.timing_tone] || PIN_STYLES.unknown;
        const approximate = project.precision !== 'address';
        const text = [project.name, project.city, project.timing_tag, project.timing_label,
          approximate ? `approx. (${project.precision} center)` : 'Address match'].filter(Boolean).join(' · ');
        // DOM text prevents project names or field notes from injecting popup HTML.
        const popup = document.createElement('div');
        popup.textContent = text;
        const marker = L.circleMarker(point, {
          radius: 8, color: style.color, weight: approximate ? 3 : 2,
          fillColor: style.color, fillOpacity: approximate ? 0 : 0.8,
          dashArray: approximate ? '3 3' : undefined,
        }).addTo(map).bindPopup(popup).bindTooltip(text);
        const open = () => onOpen(mapSummary(project));
        marker.on('click', open);
        const element = marker.getElement();
        if (element) {
          element.setAttribute('tabindex', '0');
          element.setAttribute('role', 'button');
          element.setAttribute('aria-label', `Open project: ${text}`);
          element.addEventListener('keydown', (event: Event) => {
            const key = (event as KeyboardEvent).key;
            if (key === 'Enter' || key === ' ') { event.preventDefault(); open(); }
          });
        }
      }
      if (here) {
        const point: LatLngTuple = [here.lat, here.lng];
        L.circleMarker(point, { radius: 7, color: '#fff', weight: 3, fillColor: '#0284c7', fillOpacity: 1 })
          .addTo(map).bindTooltip('Your location').bindPopup('Your location');
        bounds.push(point);
      }
      if (bounds.length) map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
      const resize = new ResizeObserver(() => map?.invalidateSize());
      resize.observe(container.current);
      map.on('unload', () => resize.disconnect());
    }).catch(() => {
      if (!disposed) setMapError('Unable to display the map. Please try again.');
    });
    return () => { disposed = true; map?.remove(); };
  }, [data, here, onOpen]);

  const unmapped = data?.projects.filter((project) => project.lat == null || project.lng == null).length ?? 0;
  return (
    <div className="project-map-panel" aria-busy={loading}>
      {loading && <p className="map-message" role="status">Loading map…</p>}
      {(error || mapError) && <p className="map-message" role="alert">{error || mapError} <button className="button" type="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button></p>}
      {data && <>
        {data.truncated && <p className="map-message" role="status">Showing first 2,000 of {data.total.toLocaleString('en-US')}</p>}
        {!data.total && <p className="map-message">No projects match these filters.</p>}
        {!!unmapped && <p className="map-message">{unmapped.toLocaleString()} of these results have no coordinates and cannot be placed on the map.</p>}
        <div className="map-legend" aria-label="Map legend">
          {Object.entries(PIN_STYLES).map(([tone, style]) => <span key={tone}><i style={{ backgroundColor: style.color }} />{style.label}</span>)}
          <span><i className="approx-pin" />Dashed / hollow = approx. city or county center</span>
          {here && <span><i style={{ backgroundColor: '#0284c7' }} />Your location</span>}
        </div>
      </>}
      <div ref={container} className="project-map" aria-label="Project locations; select a pin to open project details" hidden={!data || !!mapError} />
    </div>
  );
}
