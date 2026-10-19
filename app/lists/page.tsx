import { SMART_LISTS } from '@/lib/smart-lists';

export const metadata = {
  title: 'CTWP · Smart Lists',
  description: 'Curated project lists for CTWP sales and territory coverage.',
  robots: { index: false, follow: false },
};

export default function SmartListsIndexPage() {
  return (
    <div className="app-shell">
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
      <main className="workspace smart-lists-index">
        <div className="page-heading">
          <div>
            <div className="eyebrow territory-eyebrow">CURATED FILTERS</div>
            <h1>Smart Lists</h1>
            <p>Keyword-matched project lists that update as new TABS filings arrive. Add another list by appending one entry in <code>lib/smart-lists.ts</code>.</p>
          </div>
        </div>
        <ul className="smart-list-cards">
          {SMART_LISTS.map((list) => (
            <li key={list.id}>
              <a href={`/lists/${list.id}`} className="smart-list-card">
                <span className="smart-list-card-kicker">Smart list</span>
                <strong>{list.title}</strong>
                <span>{list.description}</span>
                <span className="smart-list-card-cta">Open list →</span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
