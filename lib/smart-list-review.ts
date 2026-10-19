/**
 * Manual smart-list review overrides, keyed by TABS project_number.
 * Versioned in git — reversible and survives Neon/TABS refreshes.
 * Do not store secrets here. To hide/unhide: edit this file and ship a PR.
 * Curated lists also contribute hides from their ranking file (lib/smart-list-rankings.ts).
 */
import { getRankingHidden, rankingHiddenNumbers } from './smart-list-rankings.ts';

export type ReviewDecision = 'hide' | 'review' | 'keep';

export type SmartListReviewEntry = {
  projectNumber: string;
  listId: string;
  decision: ReviewDecision;
  reason: string;
  costNote?: string;
};

export const SMART_LIST_REVIEW: readonly SmartListReviewEntry[] = [
  { projectNumber: 'TABS2025001695', listId: 'data-centers', decision: 'hide', reason: 'San Angelo ISD data-center relocation into elementary school library' },
  { projectNumber: 'TABS2025001727', listId: 'data-centers', decision: 'hide', reason: 'QTS Destination DFW rotunda interior office finish-out' },
  { projectNumber: 'TABS2025002766', listId: 'data-centers', decision: 'hide', reason: 'CyrusOne Allen open-office/conference suite finish-out' },
  { projectNumber: 'TABS2025003482', listId: 'data-centers', decision: 'hide', reason: 'Equinix Infomart suite office renovation (Suite 6000/6040)' },
  { projectNumber: 'TABS2025007641', listId: 'data-centers', decision: 'hide', reason: 'Standalone guardhouse construction at TTX site' },
  { projectNumber: 'TABS2025008795', listId: 'data-centers', decision: 'hide', reason: 'QTS Fort Worth office tenant improvement only' },
  { projectNumber: 'TABS2025009744', listId: 'data-centers', decision: 'hide', reason: 'CyrusOne Allen level-2 tenant office fit-out (~2k SF)' },
  { projectNumber: 'TABS2025009760', listId: 'data-centers', decision: 'hide', reason: 'METRO Polk admin interior remodel; facility name \'Metro Data Center Building\' but scope is generic remodel' },
  { projectNumber: 'TABS2025010215', listId: 'data-centers', decision: 'hide', reason: 'Compass operations/office facility servicing adjacent DCs, not a data hall' },
  { projectNumber: 'TABS2025012206', listId: 'data-centers', decision: 'hide', reason: 'TWC MoPac — three offices combined into a data room' },
  { projectNumber: 'TABS2025015878', listId: 'data-centers', decision: 'hide', reason: 'Digital Realty entry vestibule and canopy only' },
  { projectNumber: 'TABS2025016095', listId: 'data-centers', decision: 'hide', reason: 'Sabey Austin McKinstry office TI (~1.4k SF)' },
  { projectNumber: 'TABS2025021913', listId: 'data-centers', decision: 'hide', reason: 'UTEP education-building first-floor data room, not a dedicated DC facility' },
  { projectNumber: 'TABS2025022968', listId: 'data-centers', decision: 'hide', reason: 'Restroom renovation at existing Bank of America data center' },
  { projectNumber: 'TABS2025024081', listId: 'data-centers', decision: 'hide', reason: 'Office remodel labeled datacenter; unclear scale / not a clear data-hall project' },
  { projectNumber: 'TABS2025024138', listId: 'data-centers', decision: 'hide', reason: 'Sabey Austin A11 tenant office/storage (~2.8k SF), not data hall' },
  { projectNumber: 'TABS2026000039', listId: 'data-centers', decision: 'hide', reason: 'CyrusOne San Antonio ancillary office TI' },
  { projectNumber: 'TABS2026000432', listId: 'data-centers', decision: 'hide', reason: 'Foxconn \'data center support\' warehouse for boxed electronic components — not a data center' },
  { projectNumber: 'TABS2026000718', listId: 'data-centers', decision: 'hide', reason: 'CyrusOne DFW6 front-of-house office up-fit' },
  { projectNumber: 'TABS2026001237', listId: 'data-centers', decision: 'hide', reason: 'Flexential Plano suite renovation adding offices/conference/break rooms only' },
  { projectNumber: 'TABS2026001982', listId: 'data-centers', decision: 'hide', reason: 'Cook Children\'s parking garage; basement data center is incidental to garage program' },
  { projectNumber: 'TABS2026003740', listId: 'data-centers', decision: 'hide', reason: 'Harris Health Ben Taub hospital data-center room renovation / IDF closets' },
  { projectNumber: 'TABS2026003980', listId: 'data-centers', decision: 'hide', reason: 'Childress campus office building (29k SF), not a data center' },
  { projectNumber: 'TABS2026006734', listId: 'data-centers', decision: 'hide', reason: 'Garland ISD technology center (training/offices/warehouse) with incidental server room' },
  { projectNumber: 'TABS2026011010', listId: 'data-centers', decision: 'hide', reason: 'Texas State JC Kellam admin building 7th-floor data center room' },
  { projectNumber: 'TABS2026011788', listId: 'data-centers', decision: 'hide', reason: 'Sabey Austin DH A23 tenant office expansion (~3.3k SF)' },
  { projectNumber: 'TABS2026012254', listId: 'data-centers', decision: 'hide', reason: 'CyrusOne SAT3 PSOC office TI (duplicate filing pair)' },
  { projectNumber: 'TABS2026012287', listId: 'data-centers', decision: 'hide', reason: 'CyrusOne SAT3 PSOC office TI (duplicate filing pair)' },
  { projectNumber: 'TABS2026017705', listId: 'data-centers', decision: 'hide', reason: 'Stream Data Centers TI in Trammell Crow Center office tower — corporate office, not colo/DC space' },
  { projectNumber: 'TABS2026024113', listId: 'data-centers', decision: 'hide', reason: 'Campus office building filing (\'New Office Building\'), not data hall space' },
  { projectNumber: 'TABS2026026132', listId: 'data-centers', decision: 'hide', reason: 'Equinix DA11 flex office interior renovation' },
  { projectNumber: 'TABS2025014372', listId: 'data-centers', decision: 'review', reason: 'Bank of America WTX control-room / archive storage at data center — operational space, not a data hall' },
  { projectNumber: 'TABS2026000330', listId: 'data-centers', decision: 'review', reason: 'Apple Parmer Lane workroom converted to data hall — keep; confirm it is dedicated compute space' },
  { projectNumber: 'TABS2026009879', listId: 'data-centers', decision: 'review', reason: 'Microsoft SN1 interior archive enclosure within existing San Antonio data center — keep visible pending confirmation' },
  { projectNumber: 'TABS2026028916', listId: 'data-centers', decision: 'review', reason: 'Tarrant County College Trinity River campus data-center renovation — dedicated space but campus IT scale' },
  { projectNumber: 'TABS2027000435', listId: 'data-centers', decision: 'review', reason: 'First Community Credit Union tower Level 15 in-building data center — enterprise room in office tower' },
  { projectNumber: 'TABS2026008297', listId: 'data-centers', decision: 'keep', reason: 'Cost outlier flagged; project appears to be a real data center filing', costNote: 'Abilene Building 9 shell filed at $6.3B — extreme outlier; same campus has matching TI at identical cost' },
  { projectNumber: 'TABS2026008308', listId: 'data-centers', decision: 'keep', reason: 'Cost outlier flagged; project appears to be a real data center filing', costNote: 'Abilene Building 9 TI filed at $6.3B — duplicates shell cost; likely inflated / double-counted vs peer DCs' },
  { projectNumber: 'TABS2026008318', listId: 'data-centers', decision: 'keep', reason: 'Cost outlier flagged; project appears to be a real data center filing', costNote: 'Abilene Building 10 shell filed at $6.3B — extreme outlier; same campus has matching TI at identical cost' },
  { projectNumber: 'TABS2026008329', listId: 'data-centers', decision: 'keep', reason: 'Cost outlier flagged; project appears to be a real data center filing', costNote: 'Abilene Building 10 TI filed at $6.3B — duplicates shell cost; likely inflated / double-counted vs peer DCs' },
] as const;

const byList = new Map<string, Map<string, SmartListReviewEntry>>();
for (const entry of SMART_LIST_REVIEW) {
  let map = byList.get(entry.listId);
  if (!map) { map = new Map(); byList.set(entry.listId, map); }
  map.set(entry.projectNumber, entry);
}

export function getReviewEntry(listId: string, projectNumber: string): SmartListReviewEntry | undefined {
  const manual = byList.get(listId)?.get(projectNumber);
  if (manual) return manual;
  const ranked = getRankingHidden(listId, projectNumber);
  return ranked ? { projectNumber, listId, decision: 'hide', reason: ranked.reason } : undefined;
}

export function hiddenProjectNumbers(listId: string): string[] {
  const map = byList.get(listId);
  const manual = map ? [...map.values()].filter((e) => e.decision === 'hide').map((e) => e.projectNumber) : [];
  return [...new Set([...manual, ...rankingHiddenNumbers(listId)])];
}

export function reviewIndexForList(listId: string): ReadonlyMap<string, SmartListReviewEntry> {
  return byList.get(listId) ?? new Map();
}

