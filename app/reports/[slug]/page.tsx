import { notFound } from 'next/navigation';
import { ReportHeader } from '@/components/report-header';
import { ReportTable } from '@/components/report-table';
import { formatDate } from '@/lib/format';
import { loadRankingReport, type ReportRow } from '@/lib/reports';
import { getRanking } from '@/lib/smart-list-rankings';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const report = getRanking(slug)?.report;
  return {
    title: report ? `CTWP · ${report.title}` : 'CTWP · Report',
    robots: { index: false, follow: false },
  };
}

function snapshotLabel(value: string) {
  return formatDate(value);
}

export default async function ReportPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await loadRankingReport(slug);
  if (!data) notFound();
  const { ranking, report, rows } = data;
  const byTier = (tier: ReportRow['tier']) => rows.filter((row) => row.tier === tier);
  const hot = byTier('hot');
  const warm = byTier('warm');
  const pipeline = byTier('pipeline');
  const focus = new Set(report.focusCities.map((c) => c.toLowerCase()));
  const inTown = hot.filter((row) => row.city && focus.has(row.city.toLowerCase()));
  const listHref = `/lists/${ranking.listId}`;
  const majorReasons = data.hiddenReasons.filter((item) => item.count >= 3);
  const otherReasons = data.hiddenReasons.filter((item) => item.count < 3);
  const otherCount = otherReasons.reduce((sum, item) => sum + item.count, 0);
  const stats = [
    { label: 'Filings scanned', value: report.scannedCount },
    { label: `Within ${report.radiusMi} mi & open`, value: report.reviewedCount },
    { label: 'Hidden as bad fits', value: data.hiddenCount },
    { label: 'Kept', value: rows.length },
    { label: 'Hot', value: hot.length, tier: 'hot' },
    { label: 'Warm', value: warm.length, tier: 'warm' },
    { label: 'Pipeline', value: pipeline.length, tier: 'pipeline' },
  ];

  return (
    <div className="app-shell report-shell">
      <ReportHeader />
      <main className="workspace report-page">
        <div className="page-heading">
          <div>
            <div className="eyebrow territory-eyebrow">PRIORITY REPORT</div>
            <h1>{report.title}</h1>
            <p>{data.officeName} office · within {report.radiusMi} miles · snapshot {snapshotLabel(ranking.generatedAt)}</p>
          </div>
          <div className="heading-actions">
            <a className="button" href={listHref}>Open sortable list</a>
          </div>
        </div>

        <dl className="report-stats">
          {stats.map((stat) => (
            <div key={stat.label} className={`report-stat${stat.tier ? ` ${stat.tier}` : ''}`}>
              <dt>{stat.label}</dt>
              <dd>{stat.value.toLocaleString()}</dd>
            </div>
          ))}
        </dl>

        {!data.detailsLoaded && (
          <p className="report-warning" role="status">Live project details are temporarily unavailable; ranks and notes are shown from the snapshot.</p>
        )}

        <section className="report-section" aria-labelledby="start-here">
          <h2 id="start-here">Start here: Hot ({hot.length})</h2>
          <p className="report-lede">Finishing within about six months (or just past their estimated date and not closed), strong fit for copiers, MFPs and managed print, and at least $250k. Click a project to open its details.</p>
          <ReportTable rows={hot} listId={ranking.listId} />
        </section>

        {inTown.length > 0 && (
          <section className="report-section report-callout" aria-labelledby="in-town">
            <h2 id="in-town">Hot in {report.focusCities.join(' / ')} ({inTown.length})</h2>
            <ul className="report-intown">
              {inTown.map((row) => (
                <li key={row.projectNumber}>
                  <span className="report-intown-rank">#{row.rank}</span>
                  <a href={`${listHref}?${new URLSearchParams({ q: row.projectNumber, open: row.projectNumber })}`}>{row.name || row.projectNumber}</a>
                  <span className="muted"> · {row.city} · {row.completion ? formatDate(row.completion) : 'date not listed'}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <details className="report-section report-details">
          <summary><h2>Warm ({warm.length})</h2><span className="muted">Good timing with reasonable fit, or under construction with strong fit, or large strong-fit jobs.</span></summary>
          <ReportTable rows={warm} listId={ranking.listId} compact />
        </details>

        <details className="report-section report-details">
          <summary><h2>Pipeline ({pipeline.length})</h2><span className="muted">Later timing or lighter fit. Worth tracking.</span></summary>
          <ReportTable rows={pipeline} listId={ranking.listId} compact />
        </details>

        <section className="report-section" aria-labelledby="hidden-summary">
          <h2 id="hidden-summary">Hidden as bad fits ({data.hiddenCount})</h2>
          <p className="report-lede">Still in the list behind <a href={`${listHref}?hidden=1`}>Show hidden</a>, each with its reason.</p>
          <table className="report-table report-reasons">
            <thead><tr><th scope="col">Reason</th><th scope="col">Filings</th></tr></thead>
            <tbody>
              {majorReasons.map((item) => (
                <tr key={item.reason}><td>{item.reason}</td><td className="report-num">{item.count}</td></tr>
              ))}
              {otherCount > 0 && (
                <tr>
                  <td>
                    <details className="report-other-reasons">
                      <summary>Other one-off reasons ({otherReasons.length})</summary>
                      <ul>{otherReasons.map((item) => <li key={item.reason}>{item.reason}{item.count > 1 ? ` (${item.count})` : ''}</li>)}</ul>
                    </details>
                  </td>
                  <td className="report-num">{otherCount}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="report-section report-method" aria-labelledby="method">
          <h2 id="method">How this was scored</h2>
          <ol>{report.method.map((line) => <li key={line}>{line}</li>)}</ol>
          <h3>Assumptions</h3>
          <ul>{report.assumptions.map((line) => <li key={line}>{line}</li>)}</ul>
        </section>

        <div className="workspace-footnote">
          <span>Source: Texas Architectural Barriers System</span>
          <span>{data.latestFetch ? `Project details checked ${formatDate(data.latestFetch)}` : 'Dates are estimates'}</span>
        </div>
      </main>
    </div>
  );
}
