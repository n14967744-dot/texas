'use client';

import { listsForOffice } from '@/lib/browse-lists';
import { ALL_TEXAS_ID, VISIBLE_OFFICES } from '@/lib/offices';

export function OfficeListControls({
  office,
  list,
  onOffice,
  onList,
}: {
  office: string;
  list: string;
  onOffice: (office: string) => void;
  onList: (list: string) => void;
}) {
  const lists = listsForOffice(office);
  return (
    <div className="office-list-controls">
      <label className="select-control browse-select">
        <span>Office</span>
        <select aria-label="Office" value={office} onChange={(event) => onOffice(event.target.value)}>
          {VISIBLE_OFFICES.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          <option value={ALL_TEXAS_ID}>All Texas — no radius</option>
        </select>
      </label>
      <label className="select-control browse-select">
        <span>List</span>
        <select aria-label="List" value={lists.some((item) => item.id === list) ? list : ''} onChange={(event) => onList(event.target.value)}>
          {lists.map((item) => <option key={item.id || 'all'} value={item.id}>{item.title}</option>)}
        </select>
      </label>
    </div>
  );
}
