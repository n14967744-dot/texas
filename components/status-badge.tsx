export function StatusBadge({ status }: { status: string | null }) {
  const tone = status === 'Project Registered' ? 'registered' : status === 'Review Complete' ? 'review' : status === 'Inspection Complete' ? 'inspection' : 'closed';
  return <span className={`status-badge ${tone}`}>{status || 'Not listed'}</span>;
}
