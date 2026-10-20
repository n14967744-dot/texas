'use client';

import { getRankingEntry, hasRanking, PRIORITY_TIER_LABELS, type SmartListRankingEntry } from '@/lib/smart-list-rankings';
import { getReviewEntry, type SmartListReviewEntry } from '@/lib/smart-list-review';

function PriorityChip({ entry }: { entry: SmartListRankingEntry }) {
  const label = PRIORITY_TIER_LABELS[entry.tier];
  return <span className={`priority-chip ${entry.tier}`} title={`${label} priority`}>#{entry.rank} · {label}</span>;
}

function PriorityNote({ note, clamp }: { note: string; clamp: boolean }) {
  return <span className={clamp ? 'priority-note' : 'priority-note priority-note-full'} title={note}>{note}</span>;
}

function ReviewBadges({ entry }: { entry: SmartListReviewEntry }) {
  return (
    <span className="review-badges">
      {entry.decision === 'hide' && <span className="review-badge hide" title={entry.reason}>Hidden</span>}
      {entry.decision === 'review' && <span className="review-badge review" title={entry.reason}>Review</span>}
      {entry.costNote && <span className="review-badge cost" title={entry.costNote}>Cost note</span>}
    </span>
  );
}

/** Rank chip, priority note, and Show hidden / review badges for the active list. */
export function ProjectListMarks({
  listId,
  projectNumber,
  placement,
}: {
  listId: string;
  projectNumber: string;
  placement: 'row' | 'overview';
}) {
  if (!listId) return null;
  const entry = hasRanking(listId) ? getRankingEntry(listId, projectNumber) : undefined;
  const review = getReviewEntry(listId, projectNumber);
  if (!entry && !review) return null;
  const chip = entry ? <PriorityChip entry={entry} /> : null;
  const note = entry?.note ? <PriorityNote note={entry.note} clamp={placement === 'row'} /> : null;
  const callInfo = entry?.callRank != null ? (
    <span className="priority-call-info">
      Call #{entry.callRank}
      {entry.askFor && <> · Ask for {entry.askFor}</>}
      {entry.phone && <> · <a href={`tel:+1${entry.phone.replace(/\D/g, '')}`} onClick={(event) => event.stopPropagation()}>{entry.phone}</a></>}
      {entry.reachability && <> · {entry.reachability}</>}
    </span>
  ) : null;
  const badges = review ? <ReviewBadges entry={review} /> : null;
  if (placement === 'overview') {
    return (
      <section className="list-overview">
        {entry && <h3>Priority</h3>}
        {chip}
        {note}
        {callInfo}
        {badges}
      </section>
    );
  }
  return <>{chip}{badges}{note}{callInfo}</>;
}
