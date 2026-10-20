'use client';

import { Icon } from '../icons';

function pageNumbers(current: number, total: number): (number | string)[] {
  const pages = [...new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total))].sort((a, b) => a - b);
  const out: (number | string)[] = [];
  pages.forEach((page, index) => {
    if (index && page - pages[index - 1] > 1) out.push(`gap-${page}`);
    out.push(page);
  });
  return out;
}

export function PaginationBar({
  page,
  pages,
  pageSize,
  total,
  first,
  last,
  busy,
  refreshing,
  error,
  onPage,
  onPageSize,
}: {
  page: number;
  pages: number;
  pageSize: number;
  total: number;
  first: number;
  last: number;
  busy: boolean;
  refreshing: boolean;
  error: boolean;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  const summary = error
    ? 'No records to display'
    : total
      ? `Showing ${first.toLocaleString()}–${last.toLocaleString()} of ${total.toLocaleString()}${pages > 1 ? ` · page ${page} of ${pages}` : ''}${refreshing ? ' · updating' : ''}`
      : 'No records to display';
  return (
    <footer className="table-footer">
      <div className="pagination-summary">
        <span>{summary}</span>
        <label className="page-size">
          <span className="sr-only">Rows per page</span>
          <select aria-label="Rows per page" value={pageSize} onChange={(event) => onPageSize(Number(event.target.value))}>
            <option value={10}>10 / page</option>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
          </select>
        </label>
      </div>
      <nav className="pagination" aria-label="Project pages">
        <button type="button" className="page-button" aria-label="Previous page" disabled={busy || page <= 1 || error} onClick={() => onPage(page - 1)}>
          <Icon name="chevron" size={16} style={{ transform: 'rotate(180deg)' }} />
        </button>
        {!error && pageNumbers(page, pages).map((item) => (
          typeof item === 'number'
            ? <button key={item} type="button" className={`page-button ${page === item ? 'active' : ''}`} aria-label={`Page ${item}`} aria-current={page === item ? 'page' : undefined} disabled={busy} onClick={() => onPage(item)}>{item}</button>
            : <span className="page-gap" key={item}>…</span>
        ))}
        <button type="button" className="page-button" aria-label="Next page" disabled={busy || page >= pages || error} onClick={() => onPage(page + 1)}>
          <Icon name="chevron" size={16} />
        </button>
      </nav>
    </footer>
  );
}
