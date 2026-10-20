import { statusLabel, STATUS_SOURCE_NOTE } from '@/lib/status-labels';

export function StatusBadge({ status }: { status: string | null }) {
  const tone = status === 'Project Registered' ? 'registered' : status === 'Review Complete' ? 'review' : status === 'Inspection Complete' || status === 'Inspection Completed' ? 'inspection' : 'closed';
  return <span className={`status-badge ${tone}`} title={status ? `${STATUS_SOURCE_NOTE}: "${status}"` : STATUS_SOURCE_NOTE}>{statusLabel(status)}</span>;
}
