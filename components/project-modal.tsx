'use client';
import { useEffect, useRef, useState } from 'react';
import type { Project, ProjectRow } from '@/lib/types';
import { formatDate, formatMoney, safeSourceLink } from '@/lib/format';
import { Icon } from './icons';
import { StatusBadge } from './status-badge';
function Detail({ label, value }: { label: string; value: string | null | undefined }) { return <div className="detail-pair"><dt>{label}</dt><dd>{value || 'Not listed'}</dd></div>; }
function Contact({ title, name, person, phone }: { title: string; name: string | null; person?: string | null; phone: string | null }) {
  const digits = (phone || '').replace(/[^0-9+]/g, '');
  return <section className="contact-card"><div className="contact-heading"><Icon name="building"/><h3>{title}</h3></div><p className={name ? 'contact-name' : 'muted'}>{name || 'Not listed'}</p>{person && person !== name && <p className="muted">{person}</p>}{phone && <p>{digits ? <a className="phone-link" href={`tel:${digits}`}><Icon name="phone" size={15}/>{phone}</a> : phone}</p>}</section>;
}
export function ProjectModal({ summary, onClose }: { summary: ProjectRow; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<'overview' | 'contacts'>('overview');
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
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
    setError(''); setProject(null);
    fetch(`/api/projects/${encodeURIComponent(summary.project_number)}`, { signal: controller.signal })
      .then(async (r) => { const data = await r.json() as Project & { error?: string }; if (!r.ok) throw new Error(data.error || 'Unable to load this project.'); return data; })
      .then(setProject).catch((e) => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [summary.project_number, attempt]);
  const source = project ? safeSourceLink(project.project_url) : null;
  return <dialog ref={dialog} className="project-dialog" aria-labelledby="project-title" onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={(e) => { if (e.target === e.currentTarget) { const rect = e.currentTarget.getBoundingClientRect(); if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) onClose(); } }}>
    <header className="modal-header"><div className="modal-topline"><span className="eyebrow">PROJECT DETAILS</span><button className="icon-button" aria-label="Close project details" onClick={onClose}><Icon name="close" size={22}/></button></div><h2 id="project-title">{summary.project_name || summary.facility_name || summary.project_number}</h2><p className="modal-address"><Icon name="pin" size={17}/>{[summary.location_address, summary.location_city, 'TX'].filter(Boolean).join(', ')}</p><div className="modal-meta"><StatusBadge status={summary.current_status}/><span className="meta-divider"/>{summary.type_of_work || 'Work type not listed'}<span className="project-id">{summary.project_number}</span></div></header>
    <div className="modal-tabs" role="tablist" aria-label="Project information">{(['overview', 'contacts'] as const).map((t) => <button key={t} id={`tab-${t}`} role="tab" aria-selected={tab === t} aria-controls="project-tab-panel" tabIndex={tab === t ? 0 : -1} className={tab === t ? 'active' : ''} onClick={() => setTab(t)} onKeyDown={(e) => { if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) { e.preventDefault(); const next = e.key === 'Home' ? 'overview' : e.key === 'End' ? 'contacts' : tab === 'overview' ? 'contacts' : 'overview'; setTab(next); document.getElementById(`tab-${next}`)?.focus(); } }}>{t === 'overview' ? 'Overview' : 'Contacts'}</button>)}</div>
    <div className="modal-body" id="project-tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
      {error ? <div className="state-message modal-state" role="alert"><Icon name="alert" size={26}/><h3>Project details unavailable</h3><p>{error}</p><button className="button" onClick={() => setAttempt((a) => a + 1)}>Try again</button></div> : !project ? <div className="modal-loading" role="status" aria-label="Loading project details"><div className="skeleton wide"/><div className="skeleton"/><div className="skeleton"/><div className="skeleton wide"/></div> : tab === 'overview' ? <div className="overview-grid"><div><section className="scope-section"><h3>Scope of work</h3><p>{project.scope_of_work || 'No scope description listed.'}</p></section><section><h3>Project information</h3><dl><Detail label="Facility" value={project.facility_name}/><Detail label="Work type" value={project.type_of_work}/><Detail label="County" value={project.location_county}/><Detail label="Estimated cost" value={formatMoney(project.estimated_cost)}/></dl></section></div><div className="overview-right"><section><h3>Key dates</h3><dl><Detail label="Registered" value={formatDate(project.registration_date)}/><Detail label="Estimated start" value={formatDate(project.start_date)}/><Detail label="Estimated completion" value={formatDate(project.completion_date)}/></dl><p className="fine-print">Construction dates are estimates from the source filing.</p></section><section className="ownership-section"><dl><Detail label="Property owner" value={project.owner_name}/><Detail label="Tenant" value={project.tenant_name}/></dl></section></div></div> : <><div className="contacts-grid"><Contact title="Property owner" name={project.owner_name} person={project.owner_contact_name} phone={project.owner_phone}/><Contact title="Tenant" name={project.tenant_name} person={project.tenant_contact_name} phone={project.tenant_phone}/><Contact title="Design firm" name={project.design_firm_name} phone={project.design_firm_phone}/></div><p className="fine-print contacts-note">Contacts are listed in the source filing. The property owner may differ from the business purchasing equipment.</p></>}
    </div>
    <footer className="modal-footer">{source ? <a href={source} target="_blank" rel="noopener noreferrer" className="source-link">Open TABS record <Icon name="external" size={15}/></a> : <span className="fine-print">{project ? 'Source link not available' : 'Loading source record…'}</span>}<span className="fine-print">Last checked {formatDate(project?.fetched_at || summary.fetched_at)}</span></footer>
  </dialog>;
}
