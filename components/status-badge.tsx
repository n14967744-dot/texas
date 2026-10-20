import { statusLabel, STATUS_SOURCE_NOTE } from '@/lib/status-labels';
import { STAGE_LABELS, STAGE_NOTE, type Stage } from '@/lib/stage';

export function StatusBadge({ status }: { status: string | null }) {
  const tone = status === 'Project Registered' ? 'registered' : status === 'Review Complete' ? 'review' : status === 'Inspection Complete' || status === 'Inspection Completed' ? 'inspection' : 'closed';
  return <span className={`status-badge ${tone}`} title={status ? `${STATUS_SOURCE_NOTE}: "${status}"` : STATUS_SOURCE_NOTE}>{statusLabel(status)}</span>;
}

export function StageChip({ stage }: { stage: Stage | null | undefined }) {
  const value = stage ?? 'unknown';
  return <span className={`stage-chip ${value}`} title={STAGE_NOTE}>{STAGE_LABELS[value]}</span>;
}
