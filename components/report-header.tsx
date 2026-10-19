export function ReportHeader() {
  return (
    <header className="app-header">
      <a className="brand" href="/" aria-label="CTWP Project Explorer home">
        <img src="/ctwp-logo.png" alt="CTWP" width="290" height="62" />
      </a>
      <span className="header-divider" />
      <span className="product-name">Project Explorer</span>
      <nav className="browser-mode" aria-label="Browse mode">
        <a href="/">Projects</a>
        <a href="/lists" className="active" aria-current="page">Smart Lists</a>
        <a href="/prospects">Prospects</a>
      </nav>
    </header>
  );
}
