export type ProspectRole = 'tenant' | 'owner';
export type CompletionWindow = 'six' | 'ninety' | 'later' | 'any';
export class ProspectFilterError extends Error {}
export const PROSPECT_SORTS = { next_completion: 'next_completion', total_value: 'total_value', project_count: 'project_count', name: 'name' } as const;
export interface ProspectFilters { role: ProspectRole; office: string; coverage: 'all' | 'outside'; window: CompletionWindow; q: string; sort: keyof typeof PROSPECT_SORTS; direction: 'asc' | 'desc'; page: number }
export function parseProspectFilters(p: URLSearchParams): ProspectFilters {
  const role = p.get('role') || 'tenant', window = p.get('window') || 'six', office = p.get('office') || 'all', coverage = p.get('coverage') || 'all';
  const sort = p.get('sort') || 'next_completion', direction = p.get('direction') || (sort === 'total_value' || sort === 'project_count' ? 'desc' : 'asc');
  const q = (p.get('q') || '').trim(), page = Number(p.get('page') || 1);
  if (!['tenant','owner'].includes(role) || !['six','ninety','later','any'].includes(window) || !['all','outside'].includes(coverage) || (coverage === 'outside' && office !== 'texas')) throw new ProspectFilterError('Invalid prospect filter.');
  if (!Object.hasOwn(PROSPECT_SORTS,sort) || !['asc','desc'].includes(direction)) throw new ProspectFilterError('Invalid sort.');
  if (q.length > 200 || !Number.isSafeInteger(page) || page < 1 || page > 100000) throw new ProspectFilterError('Invalid search or page.');
  return { role: role as ProspectRole, office, coverage: coverage as 'all' | 'outside', window: window as CompletionWindow, sort: sort as keyof typeof PROSPECT_SORTS, direction: direction as 'asc' | 'desc', q, page };
}
/** Exact normalized name + usable US phone. Without a usable phone, keep filings separate. */
export function prospectBase(role: ProspectRole) {
  if (!['tenant','owner'].includes(role)) throw new ProspectFilterError('Invalid role.');
  return `WITH named AS (
    SELECT p.*, btrim(${role}_name) AS prospect_name, nullif(btrim(${role}_contact_name),'') AS contact_name,
      nullif(btrim(${role}_phone),'') AS contact_phone,
      lower(regexp_replace(btrim(${role}_name), '[[:space:]]+', ' ', 'g')) AS normalized_name,
      regexp_replace(coalesce(${role}_phone,''), '[^0-9]', '', 'g') AS phone_digits
    FROM public.projects p
    WHERE lower(btrim(coalesce(${role}_name,''))) NOT IN ('','not assigned','not listed','n/a','na','none','null','unknown','tbd','to be determined')
  ), normalized AS (
    SELECT *, CASE WHEN length(phone_digits)=11 AND left(phone_digits,1)='1' THEN substring(phone_digits from 2) ELSE phone_digits END AS national_phone FROM named
  ), keyed AS (
    SELECT *, CASE WHEN national_phone ~ '^[2-9][0-9]{2}[2-9][0-9]{6}$' THEN national_phone ELSE NULL END AS match_phone FROM normalized
  ), identified AS (
    SELECT *, md5(jsonb_build_array(normalized_name, CASE WHEN match_phone IS NULL THEN 'project:' || project_number ELSE 'phone:' || match_phone END)::text) AS prospect_id FROM keyed
  )`;
}
export function prospectWhere(f: ProspectFilters, counties: readonly string[] | null, excluded: readonly string[], today: string) {
  const params: (string | number)[] = [today];
  const bind = (v: string) => { params.push(v); return `$${params.length}`; };
  const clauses = counties === null ? ['TRUE'] : counties.length ? [`location_county IN (${counties.map(bind).join(',')})`] : ['FALSE'];
  if (f.coverage === 'outside') clauses.push(`location_county IS NOT NULL AND location_county <> '' AND location_county NOT IN (${excluded.map(bind).join(',')})`);
  if (f.window === 'six') clauses.push("completion_date BETWEEN $1::date AND ($1::date + INTERVAL '6 months')");
  if (f.window === 'ninety') clauses.push('completion_date BETWEEN $1::date AND ($1::date + 90)');
  if (f.window === 'later') clauses.push("completion_date > ($1::date + 90) AND completion_date <= ($1::date + INTERVAL '6 months')");
  if (f.q) { const b=bind(`%${f.q.replace(/[\\%_]/g,'\\$&')}%`); clauses.push(`(prospect_name ILIKE ${b} OR contact_name ILIKE ${b} OR contact_phone ILIKE ${b} OR project_name ILIKE ${b} OR location_city ILIKE ${b})`); }
  return { where: clauses.join(' AND '), params };
}
export interface ProspectRow {
  id: string; name: string; contacts: string[]; phones: string[]; cities: string[]; counties: string[];
  project_count: number; total_value: string | number | null; known_cost_count: number; next_completion: string | null; latest_fetch: string | null; matched_by_phone: boolean;
}
export interface ProspectResponse { prospects: ProspectRow[]; total: number; page: number; pages: number; pageSize: number }
