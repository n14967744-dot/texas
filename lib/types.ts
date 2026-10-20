import type { ResearchView } from './research.ts';
import type { TimingFlag, TimingTag, TimingTone } from './timing.ts';
import type { Disposition, FieldNote, ProjectOverlay, SiteState } from './field-notes.ts';

export type GeoPrecision = 'address' | 'city' | 'county' | 'none';

export interface ProjectRow {
  estimated_cost: string | number | null;
  scope_of_work: string | null;
  project_number: string;
  project_name: string | null;
  facility_name: string | null;
  location_address: string | null;
  location_city: string | null;
  location_county: string | null;
  current_status: string | null;
  type_of_work: string | null;
  registration_date: string | null;
  /** Planned start (TABS estimated start). */
  start_date?: string | null;
  completion_date: string | null;
  fetched_at: string | null;
  /** Straight-line miles. Null when the location is unknown. */
  distance_mi?: number | null;
  geo_precision?: GeoPrecision | string | null;
  /** True when leads.project_research has a row. */
  has_research?: boolean;
  site_state?: SiteState | null;
  site_state_observed_at?: string | null;
  disposition?: Disposition | null;
  overlay_hidden?: boolean;
  /** Plain timing label from lib/timing.ts. The age tag is timing_tag, not part of this string. */
  timing_label?: string;
  timing_tag?: TimingTag | null;
  timing_flags?: TimingFlag[];
  timing_tone?: TimingTone;
}

export interface Project extends ProjectRow {
  estimated_cost: string | number | null;
  scope_of_work: string | null;
  owner_name: string | null;
  owner_contact_name: string | null;
  owner_phone: string | null;
  owner_address: string | null;
  tenant_name: string | null;
  tenant_contact_name: string | null;
  tenant_phone: string | null;
  tenant_address: string | null;
  design_firm_name: string | null;
  design_firm_phone: string | null;
  design_firm_address: string | null;
  filer_contact_name: string | null;
  project_url: string | null;
}

export interface ProjectDetail extends Project {
  research: ResearchView | null;
  field_notes: FieldNote[];
  overlay: ProjectOverlay | null;
}

export interface CoverageCounts {
  address: number;
  approximate: number;
  unknown: number;
  /** Projects matching the other filters whose location is unknown (inside or outside the result set). */
  unknownPool: number;
}

export interface ProjectListResponse {
  projects: ProjectRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  latestFetch: string | null;
  facets: { cities: string[]; counties: string[]; workTypes: string[] };
  coverage: CoverageCounts;
}
