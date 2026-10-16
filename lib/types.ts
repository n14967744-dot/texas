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
  completion_date: string | null;
  fetched_at: string | null;
}
export interface Project extends ProjectRow {
  start_date: string | null;
  estimated_cost: string | number | null;
  scope_of_work: string | null;
  owner_name: string | null;
  owner_contact_name: string | null;
  owner_phone: string | null;
  tenant_name: string | null;
  tenant_contact_name: string | null;
  tenant_phone: string | null;
  design_firm_name: string | null;
  design_firm_phone: string | null;
  project_url: string | null;
}
export interface ProjectListResponse {
  projects: ProjectRow[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  latestFetch: string | null;
  facets: { cities: string[]; counties: string[]; statuses: string[] };
}
