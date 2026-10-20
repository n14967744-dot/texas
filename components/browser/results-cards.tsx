'use client';

import { formatDate, formatMoney } from '@/lib/format';
import type { ProjectRow } from '@/lib/types';
import { Icon } from '../icons';
import { ScopePreview } from '../scope-preview';
import { DistanceCell } from './distance-cell';
import { ProjectListMarks } from './project-list-marks';
import { ProjectTiming } from '../timing-display';

export function ResultsCards({
  projects,
  nearestOffice,
  officeName,
  locationEnabled,
  listId,
  showSkeleton,
  error,
  onOpen,
  onRetry,
}: {
  projects: ProjectRow[];
  nearestOffice: boolean;
  officeName: string;
  locationEnabled: boolean;
  listId: string;
  showSkeleton: boolean;
  error: string;
  onOpen: (row: ProjectRow) => void;
  onRetry: () => void;
}) {
  if (showSkeleton) {
    return (
      <div className="browse-cards" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => <div className="project-card skeleton-card" key={index}><div className="skeleton wide" /><div className="skeleton" /></div>)}
      </div>
    );
  }
  if (error) {
    return (
      <div className="browse-cards">
        <div className="state-message" role="alert">
          <Icon name="alert" size={26} />
          <h2>Projects unavailable</h2>
          <p>{error}</p>
          <button type="button" className="button" onClick={onRetry}>Try again</button>
        </div>
      </div>
    );
  }
  if (!projects.length) {
    return (
      <div className="browse-cards">
        <div className="state-message">
          <Icon name="search" size={28} />
          <h2>No projects match</h2>
          <p>Try a wider radius, clear a filter, or search a project number, owner, or phone.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="browse-cards">
      {projects.map((project) => {
        const name = project.project_name || project.facility_name || project.project_number;
        return (
          <article key={project.project_number} className="project-card">
            <button type="button" className="project-card-open" onClick={() => onOpen(project)}>
              <span className="project-card-title">
                {name}
                {project.has_research && <span className="researched-badge">Researched</span>}
                <ProjectListMarks listId={listId} projectNumber={project.project_number} timingTone={project.timing_tone} placement="row" />
              </span>
              <span className="secondary-line">{project.project_number}</span>
              <span className="project-card-address">{[project.location_address, project.location_city].filter(Boolean).join(', ') || 'Address not listed'}</span>
            </button>
            <dl className="project-card-facts">
              <div><dt>Scope</dt><dd><ScopePreview scope={project.scope_of_work} /></dd></div>
              <div><dt>Est. cost</dt><dd>{formatMoney(project.estimated_cost)}</dd></div>
              <div><dt>{nearestOffice ? 'Nearest office' : 'Distance'}</dt><dd><DistanceCell miles={project.distance_mi} precision={project.geo_precision} nearestOffice={nearestOffice} hereMiles={project.here_mi} locationEnabled={locationEnabled} officeName={officeName} distanceOfficeId={project.distance_office_id} /></dd></div>
              <div><dt>Timing</dt><dd><ProjectTiming project={project} /></dd></div>
              <div><dt>Planned start</dt><dd>{formatDate(project.start_date)}</dd></div>
              <div><dt>Planned finish</dt><dd>{formatDate(project.completion_date)}</dd></div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}
