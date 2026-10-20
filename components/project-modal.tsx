'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { distanceLabel, distanceTitle } from '@/lib/distance-label';
import { formatDate, formatMoney, safeHttpsUrl, safeSourceLink } from '@/lib/format';
import { businessToday } from '@/lib/query';
import { timingLabel } from '@/lib/timing';
import type { ResearchView } from '@/lib/research';
import type { ProjectDetail, ProjectRow } from '@/lib/types';
import { ProjectListMarks } from './browser/project-list-marks';
import { Icon } from './icons';

type Tab = 'overview' | 'contacts' | 'research';

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return <div className="detail-pair"><dt>{label}</dt><dd>{value || 'Not listed'}</dd></div>;
}

function linkedContact(value: string | null): ReactNode {
  if (!value) return 'Not listed';
  const pattern = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let phoneUsed = false;
  let emailUsed = false;
  let key = 0;
  for (const match of value.matchAll(pattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    const isEmail = token.includes('@');
    nodes.push(value.slice(last, index));
    if (isEmail && !emailUsed) {
      emailUsed = true;
      nodes.push(<a key={key++} href={`mailto:${token}`}>{token}</a>);
    } else if (!isEmail && !phoneUsed) {
      phoneUsed = true;
      const digits = token.replace(/[^\d+]/g, '');
      nodes.push(<a key={key++} className="phone-link" href={`tel:${digits}`}><Icon name="phone" size={15} />{token}</a>);
    } else {
      nodes.push(token);
    }
    last = index + token.length;
  }
  nodes.push(value.slice(last));
  return <>{nodes}</>;
}

function Contact({
  title,
  name,
  person,
  phone,
  address,
}: {
  title: string;
  name: string | null;
  person?: string | null;
  phone: string | null;
  address?: string | null;
}) {
  return (
    <section className="contact-card">
      <div className="contact-heading"><Icon name="building" /><h3>{title}</h3></div>
      <p className={name ? 'contact-name' : 'muted'}>{name || 'Not listed'}</p>
      {person && person !== name && <p className="muted">{person}</p>}
      <p>{linkedContact(phone)}</p>
      {address && <p className="muted">{address}</p>}
    </section>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children} <Icon name="external" size={14} /></a>;
}

function ResearchPanel({ research }: { research: ResearchView }) {
  const website = safeHttpsUrl(research.website);
  const linkedin = safeHttpsUrl(research.linkedin);
  return (
    <div className="research-panel">
      <section>
        <h3>Who is involved</h3>
        <dl>
          <Detail label="Occupant / end user" value={research.endUser} />
          <Detail label="Business type" value={research.businessType} />
          <Detail label="Owner entity" value={research.ownerEntity} />
          <Detail label="Developer" value={research.developer} />
          <Detail label="Architect" value={research.architect} />
          <Detail label="General contractor" value={research.generalContractor} />
        </dl>
      </section>
      <section>
        <h3>Decision makers</h3>
        {research.decisionMakers.length ? (
          <ul className="decision-makers">
            {research.decisionMakers.map((person) => (
              <li key={`${person.name}-${person.title}`}>{person.name || 'Name not listed'}{person.title ? ` · ${person.title}` : ''}</li>
            ))}
          </ul>
        ) : <p className="muted">Not listed</p>}
        <dl>
          <Detail label="Phone" value={linkedContact(research.phone)} />
          <Detail label="Email" value={linkedContact(research.email)} />
          <Detail label="Website" value={website ? <ExternalLink href={website}>{website}</ExternalLink> : null} />
          <Detail label="LinkedIn" value={linkedin ? <ExternalLink href={linkedin}>Profile</ExternalLink> : null} />
        </dl>
      </section>
      <section>
        <h3>Timing and equipment</h3>
        <dl>
          <Detail label="Opening timeline evidence" value={research.openingTimeline} />
          <Detail label="Likely equipment need" value={research.equipmentNeed} />
          <Detail label="Why now" value={research.whyNow} />
        </dl>
      </section>
      <section>
        <h3>How to approach</h3>
        <dl>
          <Detail label="Recommended strategy" value={research.strategy} />
          <Detail label="First-call script" value={research.firstCallScript} />
          <Detail label="Next action" value={research.nextAction} />
          <Detail label="Next action date" value={research.nextActionDate ? formatDate(research.nextActionDate) : null} />
          <Detail label="Priority score" value={research.priorityScore != null ? String(research.priorityScore) : null} />
          <Detail label="Confidence" value={research.confidence} />
          <Detail label="Researched" value={research.researchedAt ? formatDate(research.researchedAt) : null} />
        </dl>
      </section>
      {research.notes.length > 0 && (
        <section>
          <h3>Notes</h3>
          <ul className="research-notes">{research.notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </section>
      )}
      <section>
        <h3>Sources</h3>
        {research.sources.length ? (
          <ul className="research-sources">
            {research.sources.map((source) => (
              <li key={source.url}><ExternalLink href={source.url}>{source.title}</ExternalLink></li>
            ))}
          </ul>
        ) : <p className="muted">No sources listed</p>}
      </section>
    </div>
  );
}

export function ProjectModal({
  summary,
  nearestOffice = false,
  listId = '',
  onClose,
}: {
  summary: ProjectRow;
  nearestOffice?: boolean;
  /** Active browser list, so a ranked list can show rank, tier, and note. */
  listId?: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const today = businessToday();
  const showResearch = Boolean(summary.has_research || project?.research);

  useEffect(() => {
    const node = dialog.current!;
    const focused = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    node.showModal();
    return () => { node.close(); document.body.style.overflow = overflow; focused?.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setProject(null);
    fetch(`/api/projects/${encodeURIComponent(summary.project_number)}`, { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as ProjectDetail & { error?: string };
        if (!response.ok) throw new Error(data.error || 'Unable to load this project.');
        return data;
      })
      .then(setProject)
      .catch((reason) => { if (reason.name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Unable to load this project.'); });
    return () => controller.abort();
  }, [summary.project_number, attempt]);

  useEffect(() => {
    if (tab === 'research' && project && !project.research && !summary.has_research) setTab('overview');
  }, [tab, project, summary.has_research]);

  const source = project ? safeSourceLink(project.project_url) : null;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'contacts', label: 'Contacts' },
    ...(showResearch ? [{ id: 'research' as const, label: 'Research' }] : []),
  ];
  const label = summary.timing_label || timingLabel(summary, today);
  const miles = distanceLabel(summary.distance_mi, summary.geo_precision);

  function moveTab(key: string) {
    const index = tabs.findIndex((item) => item.id === tab);
    let next = tab;
    if (key === 'Home') next = tabs[0].id;
    else if (key === 'End') next = tabs[tabs.length - 1].id;
    else if (key === 'ArrowRight') next = tabs[(index + 1) % tabs.length].id;
    else if (key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length].id;
    else return;
    setTab(next);
    window.setTimeout(() => document.getElementById(`tab-${next}`)?.focus(), 0);
  }

  return (
    <dialog
      ref={dialog}
      className="project-dialog"
      aria-labelledby="project-title"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}
    >
      <header className="modal-header">
        <div className="modal-topline">
          <span className="eyebrow">PROJECT DETAILS</span>
          <button type="button" className="icon-button" aria-label="Close project details" onClick={onClose}><Icon name="close" size={22} /></button>
        </div>
        <h2 id="project-title">{summary.project_name || summary.facility_name || summary.project_number}</h2>
        <p className="modal-address"><Icon name="pin" size={17} />{[summary.location_address, summary.location_city, 'TX'].filter(Boolean).join(', ')}</p>
        <div className="modal-meta">
          <span>{summary.type_of_work || 'Work type not listed'}</span>
          {summary.has_research && <span className="researched-badge">Researched</span>}
          <span className="project-id">{summary.project_number}</span>
        </div>
      </header>
      <div className="modal-scroll">
      <div className="modal-tabs" role="tablist" aria-label="Project information">
        {tabs.map((item) => (
          <button
            key={item.id}
            id={`tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls="project-tab-panel"
            tabIndex={tab === item.id ? 0 : -1}
            className={tab === item.id ? 'active' : ''}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                event.preventDefault();
                moveTab(event.key);
              }
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="modal-body" id="project-tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {error ? (
          <div className="state-message modal-state" role="alert">
            <Icon name="alert" size={26} />
            <h3>Project details unavailable</h3>
            <p>{error}</p>
            <button type="button" className="button" onClick={() => setAttempt((value) => value + 1)}>Try again</button>
          </div>
        ) : !project ? (
          <div className="modal-loading" role="status" aria-label="Loading project details">
            <div className="skeleton wide" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton wide" />
          </div>
        ) : tab === 'overview' ? (
          <div className="overview-grid">
            <div>
              <ProjectListMarks listId={listId} projectNumber={summary.project_number} placement="overview" />
              <section className="scope-section">
                <h3>Scope of work</h3>
                <p>{project.scope_of_work || 'No scope description listed.'}</p>
              </section>
              <section>
                <h3>Project information</h3>
                <dl>
                  <Detail label="Facility" value={project.facility_name} />
                  <Detail label="Work type" value={project.type_of_work} />
                  <Detail label="County" value={project.location_county} />
                  <Detail label="Estimated cost" value={formatMoney(project.estimated_cost)} />
                  <Detail label="State status" value={project.current_status} />
                  <Detail label="Filed" value={formatDate(project.registration_date)} />
                </dl>
              </section>
            </div>
            <div className="overview-right">
              <section>
                <h3>Timing</h3>
                <dl>
                  <Detail label="Timing" value={label} />
                  <Detail label="Planned start" value={formatDate(project.start_date)} />
                  <Detail label="Planned finish" value={formatDate(project.completion_date)} />
                  <Detail label={nearestOffice ? 'Nearest office (straight-line)' : 'Distance (straight-line)'} value={<span title={distanceTitle(summary.geo_precision, nearestOffice)}>{miles}</span>} />
                </dl>
                <p className="fine-print">Timing is not confirmation that construction started, finished, or that anyone has moved in. Planned dates and the state status come from the TDLR TABS filing.</p>
              </section>
              <section className="ownership-section">
                <dl>
                  <Detail label="Property owner" value={project.owner_name} />
                  <Detail label="Tenant" value={project.tenant_name} />
                </dl>
              </section>
            </div>
          </div>
        ) : tab === 'contacts' ? (
          <>
            <div className="contacts-grid">
              <Contact title="Property owner" name={project.owner_name} person={project.owner_contact_name} phone={project.owner_phone} address={project.owner_address} />
              <Contact title="Tenant" name={project.tenant_name} person={project.tenant_contact_name} phone={project.tenant_phone} address={project.tenant_address} />
              <Contact title="Design firm" name={project.design_firm_name} phone={project.design_firm_phone} address={project.design_firm_address} />
            </div>
            {project.filer_contact_name && <p className="fine-print contacts-note">Filer contact: {project.filer_contact_name}</p>}
            <p className="fine-print contacts-note">Contacts are listed in the source filing. The property owner may differ from the business purchasing equipment.</p>
          </>
        ) : project.research ? (
          <ResearchPanel research={project.research} />
        ) : (
          <p className="muted">No research note is on file for this project.</p>
        )}
      </div>
      </div>
      <footer className="modal-footer">
        {source ? <a href={source} target="_blank" rel="noopener noreferrer" className="source-link">Open TABS record <Icon name="external" size={15} /></a> : <span className="fine-print">{project ? 'Source link not available' : 'Loading source record…'}</span>}
        <span className="fine-print">Last checked {formatDate(project?.fetched_at || summary.fetched_at)}</span>
      </footer>
    </dialog>
  );
}
