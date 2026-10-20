import { safeHttpsUrl } from './format.ts';

export type DecisionMaker = { name: string; title: string };
export type ResearchSource = { url: string; title: string };

export type ResearchView = {
  endUser: string | null;
  businessType: string | null;
  ownerEntity: string | null;
  developer: string | null;
  architect: string | null;
  generalContractor: string | null;
  decisionMakers: DecisionMaker[];
  phone: string | null;
  email: string | null;
  website: string | null;
  linkedin: string | null;
  openingTimeline: string | null;
  equipmentNeed: string | null;
  whyNow: string | null;
  strategy: string | null;
  firstCallScript: string | null;
  nextAction: string | null;
  nextActionDate: string | null;
  priorityScore: number | null;
  confidence: string | null;
  researchedAt: string | null;
  sources: ResearchSource[];
  notes: string[];
};

function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function decisionMakers(value: unknown): DecisionMaker[] {
  const rows = Array.isArray(value) ? value : [];
  const out: DecisionMaker[] = [];
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const name = text(record.name) || '';
    const title = text(record.title) || text(record.role) || '';
    if (!name && !title) continue;
    out.push({ name, title });
  }
  return out;
}

export function researchSources(value: unknown): ResearchSource[] {
  const rows = Array.isArray(value) ? value : [];
  const out: ResearchSource[] = [];
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const url = safeHttpsUrl(text(record.url));
    if (!url) continue;
    out.push({ url, title: text(record.title) || url });
  }
  return out;
}

/** Render notes without dumping the embedded TABS filing copy. */
export function researchNotes(value: unknown): string[] {
  if (typeof value === 'string') return text(value) ? [value.trim()] : [];
  if (Array.isArray(value)) return value.map(text).filter((item): item is string => Boolean(item));
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const lines: string[] = [];
  const ranking = text(record.ranking_source);
  if (ranking) lines.push(ranking);
  if (Array.isArray(record.not_found)) {
    const missing = record.not_found.map(text).filter((item): item is string => Boolean(item));
    if (missing.length) lines.push(`Not found: ${missing.join(', ')}`);
  }
  return lines;
}

export function toResearchView(row: Record<string, unknown> | null | undefined): ResearchView | null {
  if (!row || typeof row !== 'object') return null;
  const score = row.priority_score == null || row.priority_score === '' ? null : Number(row.priority_score);
  return {
    endUser: text(row.end_user_business),
    businessType: text(row.business_type),
    ownerEntity: text(row.owner_entity),
    developer: text(row.developer),
    architect: text(row.architect),
    generalContractor: text(row.general_contractor),
    decisionMakers: decisionMakers(row.tenant_decision_makers),
    phone: text(row.contact_phone),
    email: text(row.contact_email),
    website: safeHttpsUrl(text(row.contact_website)),
    linkedin: safeHttpsUrl(text(row.contact_linkedin)),
    openingTimeline: text(row.opening_timeline_evidence),
    equipmentNeed: text(row.likely_equipment_need),
    whyNow: text(row.why_now),
    strategy: text(row.recommended_strategy),
    firstCallScript: text(row.first_call_script),
    nextAction: text(row.next_action),
    nextActionDate: text(row.next_action_date)?.slice(0, 10) ?? null,
    priorityScore: score != null && Number.isFinite(score) ? score : null,
    confidence: text(row.confidence),
    researchedAt: text(row.researched_at),
    sources: researchSources(row.sources),
    notes: researchNotes(row.notes),
  };
}
