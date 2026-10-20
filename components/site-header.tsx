'use client';

import type { ReactNode } from 'react';

export function SiteHeader({
  current,
  children,
}: {
  current?: 'projects' | 'reports';
  children?: ReactNode;
}) {
  return (
    <header className="app-header">
      <a className="brand" href="/" aria-label="CTWP Project Explorer home">
        <img src="/ctwp-logo.png" alt="CTWP" width="290" height="62" />
      </a>
      <span className="header-divider" />
      <span className="product-name">Project Explorer</span>
      <div className="header-end">
        <nav className="browser-mode" aria-label="Primary">
          <a href="/" className={current === 'projects' ? 'active' : undefined} aria-current={current === 'projects' ? 'page' : undefined}>Projects</a>
          <a href="/reports" className={current === 'reports' ? 'active' : undefined} aria-current={current === 'reports' ? 'page' : undefined}>Reports</a>
        </nav>
        {children}
      </div>
    </header>
  );
}
