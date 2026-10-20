'use client';

import { Icon } from '../icons';

export function SearchBox({
  value,
  onChange,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="search-field">
      <Icon name="search" size={18} />
      <input
        type="search"
        aria-label="Search projects"
        placeholder="Search name, scope, address, owner, tenant, phone, or project number"
        maxLength={200}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button type="button" className="search-clear" aria-label="Clear search" onClick={onClear}>
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
