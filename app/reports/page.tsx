import { ReportHeader } from '@/components/report-header';
import { getSmartList } from '@/lib/smart-lists';
import { reportRankings } from '@/lib/smart-list-rankings';

export const metadata = {
  title: 'CTWP · Priority reports',
  description: 'Read-only ranked priority reports for CTWP offices.',
  robots: { index: false, follow: false },
};

export default function ReportsIndexPage() {
  const reports = reportRankings();
  return (
    <div className="app-shell report-shell">
      <ReportHeader />
      <main className="workspace smart-lists-index">
        <div className="page-heading">
          <div>
            <div className="eyebrow territory-eyebrow">PRIORITY REPORTS</div>
            <h1>Reports</h1>
            <p>Read-only summaries of ranked smart lists. Each report has a matching sortable table under <a href="/lists">Smart Lists</a>.</p>
          </div>
        </div>
        <ul className="smart-list-cards">
          {reports.map((ranking) => (
            <li key={ranking.listId}>
              <a href={`/reports/${ranking.listId}`} className="smart-list-card">
                <span className="smart-list-card-kicker">Report · snapshot {ranking.generatedAt}</span>
                <strong>{ranking.report!.title}</strong>
                <span>{getSmartList(ranking.listId)?.description}</span>
                <span className="smart-list-card-cta">Open report →</span>
              </a>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
