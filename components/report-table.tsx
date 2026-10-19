import { formatDate, formatMoney, safeSourceLink } from '@/lib/format';
import { PRIORITY_TIER_LABELS } from '@/lib/smart-list-rankings';
import type { ReportRow } from '@/lib/reports';
import { StageChip } from './status-badge';
import { businessToday } from '@/lib/query';
import { monthsFromToday, STAGE_NOTE } from '@/lib/stage';

export function projectListHref(listId: string, projectNumber: string) {
  return `/lists/${listId}?${new URLSearchParams({ q: projectNumber, open: projectNumber })}`;
}

export function ReportTable({ rows, listId, compact = false, showTier = false }: { rows: ReportRow[]; listId: string; compact?: boolean; showTier?: boolean }) {
  const today = businessToday();
  return (
    <div className="report-table-wrap">
      <table className={`report-table${compact ? ' compact' : ''}`}>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Project</th>
            <th scope="col">City</th>
            <th scope="col">Distance</th>
            <th scope="col">Est. cost</th>
            <th scope="col">Planned finish</th>
            <th scope="col" title={STAGE_NOTE}>Stage</th>
            <th scope="col">Why</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const source = safeSourceLink(`https://www.tdlr.texas.gov/TABS/Projects/${row.projectNumber}`);
            return (
              <tr key={row.projectNumber}>
                <td className="report-rank">
                  {row.rank}
                  {showTier && <span className={`priority-tier ${row.tier}`}>{PRIORITY_TIER_LABELS[row.tier]}</span>}
                </td>
                <td className="report-project">
                  <a className="report-project-name" href={projectListHref(listId, row.projectNumber)}>{row.name || row.projectNumber}</a>
                  <span className="secondary-line">
                    {source ? <a href={source} target="_blank" rel="noreferrer">{row.projectNumber} ↗</a> : row.projectNumber}
                  </span>
                </td>
                <td className="report-city">{row.city || "—"}</td>
                <td className="report-num">{row.distanceMi != null ? `${row.distanceMi.toFixed(0)} mi` : '—'}</td>
                <td className="report-num">{row.cost != null ? formatMoney(row.cost) : '—'}</td>
                <td className="report-num">
                  {row.completion ? formatDate(row.completion) : '—'}
                  {monthsFromToday(row.completion, today) && <span className="relative-date">{monthsFromToday(row.completion, today)}</span>}
                </td>
                <td className="report-stage">{row.stage ? <StageChip stage={row.stage} /> : '—'}</td>
                <td className="report-note">{row.note}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
