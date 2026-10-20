'use client';

import { formatDate, formatMoney } from '@/lib/format';
import type { SortKey } from '@/lib/query';
import type { ProjectRow } from '@/lib/types';
import { Icon } from '../icons';
import { ScopePreview } from '../scope-preview';
import { DistanceCell } from './distance-cell';
import { ProjectListMarks } from './project-list-marks';
import { ProjectTiming } from '../timing-display';

const COLUMNS = 8;

function SortHeader({
  label,
  sortKey,
  sort,
  direction,
  className,
  title,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortKey;
  direction: 'asc' | 'desc';
  className?: string;
  title?: string;
  onSort: (key: SortKey) => void;
}) {
  const active = sort === sortKey;
  return (
    <th scope="col" className={className} title={title} aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="sort-button" onClick={() => onSort(sortKey)}>
        {label}
        <Icon name={active ? 'down' : 'sort'} size={13} style={active && direction === 'asc' ? { transform: 'rotate(180deg)' } : undefined} />
      </button>
    </th>
  );
}

export function ResultsTable({
  projects,
  sort,
  direction,
  nearestOffice,
  listId,
  showSkeleton,
  error,
  onSort,
  onOpen,
  onRetry,
}: {
  projects: ProjectRow[];
  sort: SortKey;
  direction: 'asc' | 'desc';
  nearestOffice: boolean;
  listId: string;
  showSkeleton: boolean;
  error: string;
  onSort: (key: SortKey) => void;
  onOpen: (row: ProjectRow) => void;
  onRetry: () => void;
}) {
  const distanceHeader = nearestOffice ? 'Nearest office (straight-line)' : 'Distance (straight-line)';
  return (
    <div className="browse-table-wrap">
      <table className="browse-table">
        <thead>
          <tr>
            <SortHeader label="Project" sortKey="project_name" sort={sort} direction={direction} className="col-project" onSort={onSort} />
            <SortHeader label="Address" sortKey="location_address" sort={sort} direction={direction} className="col-address" onSort={onSort} />
            <th scope="col" className="col-scope"><span className="column-label">Scope</span></th>
            <SortHeader label="Est. cost" sortKey="estimated_cost" sort={sort} direction={direction} className="col-cost" onSort={onSort} />
            <SortHeader label={distanceHeader} sortKey="distance" sort={sort} direction={direction} className="col-distance" title="Straight-line miles, not driving distance" onSort={onSort} />
            <SortHeader label="Timing" sortKey="timing" sort={sort} direction={direction} className="col-timing" title="From planned dates and the state filing status. Not a confirmation of construction or move-in." onSort={onSort} />
            <SortHeader label="Planned start" sortKey="start_date" sort={sort} direction={direction} className="col-start" onSort={onSort} />
            <SortHeader label="Planned finish" sortKey="completion_date" sort={sort} direction={direction} className="col-finish" onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {showSkeleton ? Array.from({ length: 8 }, (_, index) => (
            <tr className="skeleton-row" key={index}>
              {Array.from({ length: COLUMNS }, (_, cell) => <td key={cell}><div className="skeleton" /></td>)}
            </tr>
          )) : error ? (
            <tr>
              <td colSpan={COLUMNS}>
                <div className="state-message" role="alert">
                  <Icon name="alert" size={26} />
                  <h2>Projects unavailable</h2>
                  <p>{error}</p>
                  <button type="button" className="button" onClick={onRetry}>Try again</button>
                </div>
              </td>
            </tr>
          ) : !projects.length ? (
            <tr>
              <td colSpan={COLUMNS}>
                <div className="state-message">
                  <Icon name="search" size={28} />
                  <h2>No projects match</h2>
                  <p>Try a wider radius, clear a filter, or search a project number, owner, or phone.</p>
                </div>
              </td>
            </tr>
          ) : projects.map((project) => {
            const name = project.project_name || project.facility_name || project.project_number;
            return (
              <tr key={project.project_number} className="project-row" onClick={() => onOpen(project)}>
                <td>
                  <button type="button" className="project-name" onClick={(event) => { event.stopPropagation(); onOpen(project); }}>
                    {name}
                  </button>
                  {project.has_research && <span className="researched-badge">Researched</span>}
                  <ProjectListMarks listId={listId} projectNumber={project.project_number} timingTone={project.timing_tone} placement="row" />
                  <span className="secondary-line">{project.project_number}{project.facility_name && project.facility_name !== name ? ` · ${project.facility_name}` : ''}</span>
                </td>
                <td className="address-cell">
                  <span>{project.location_address || 'Address not listed'}</span>
                  <span className="secondary-line">{[project.location_city, project.location_county].filter(Boolean).join(' · ') || 'City not listed'}</span>
                </td>
                <td><ScopePreview scope={project.scope_of_work} /></td>
                <td className="date-cell">{formatMoney(project.estimated_cost)}</td>
                <td><DistanceCell miles={project.distance_mi} precision={project.geo_precision} nearestOffice={nearestOffice} /></td>
                <td className="timing-cell"><ProjectTiming project={project} /></td>
                <td className="date-cell">{formatDate(project.start_date)}</td>
                <td className="date-cell">{formatDate(project.completion_date)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
