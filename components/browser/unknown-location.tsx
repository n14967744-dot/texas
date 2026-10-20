'use client';

export function UnknownLocationControl({
  count,
  checked,
  compact = false,
  onChange,
}: {
  /** Null while coverage is still unknown. */
  count: number | null;
  checked: boolean;
  compact?: boolean;
  onChange: (include: boolean) => void;
}) {
  if (count == null) return null;
  if (count <= 0) {
    return <p className="fine-print unknown-note">All projects in range have a known location (address or city/county center).</p>;
  }
  const noun = count === 1 ? 'project' : 'projects';
  return (
    <label className={compact ? 'check-label unknown-toggle' : 'check-label'}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      Include {count.toLocaleString()} {noun} with unknown location
    </label>
  );
}
