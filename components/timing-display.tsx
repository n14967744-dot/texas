import { TIMING_NOTE, timingInfo, type TimingInfo } from '@/lib/timing';
import type { ProjectRow } from '@/lib/types';
import { projectSighting } from '@/lib/field-notes';

export function TimingDisplay({ info }: { info: TimingInfo }) {
  return (
    <span className={`timing-display ${info.tone}`} title={TIMING_NOTE}>
      <span>{info.label}</span>
      {info.tag && <span className={`timing-tag ${info.tone}`}>{info.tag}</span>}
      {info.flags.map((flag) => <span key={flag} className="timing-tag plans">{flag}</span>)}
    </span>
  );
}

export function ProjectTiming({ project, today }: { project: ProjectRow; today?: string }) {
  const info = project.timing_label ? {
    label: project.timing_label,
    tag: project.timing_tag ?? null,
    flags: project.timing_flags ?? [],
    tone: project.timing_tone ?? 'unknown',
  } : timingInfo(project, today, projectSighting(project));
  return <TimingDisplay info={info} />;
}
