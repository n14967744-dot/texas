import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ProjectBrowser } from '@/components/project-browser';
import { canonicalizeBrowseParams, resolveBrowserState, searchParamsRecordToURL } from '@/lib/browse-state';
import { DEFAULT_OFFICE_ID, OFFICE_COOKIE } from '@/lib/offices';
import { loadProjectList } from '@/lib/projects';
import { FilterError } from '@/lib/query';
import type { ProjectListResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = searchParamsRecordToURL(await searchParams);
  const cookieStore = await cookies();
  const cookieOffice = cookieStore.get(OFFICE_COOKIE)?.value ?? null;
  const canonical = canonicalizeBrowseParams(raw, cookieOffice);
  if (canonical) redirect(canonical);

  let filters;
  try {
    filters = resolveBrowserState(raw, cookieOffice);
  } catch (error) {
    if (error instanceof FilterError) {
      const office = raw.get('office') || DEFAULT_OFFICE_ID;
      redirect(`/?office=${encodeURIComponent(office)}`);
    }
    throw error;
  }

  let initialData: ProjectListResponse | null = null;
  try {
    initialData = await loadProjectList(filters);
  } catch {
    initialData = null;
  }
  return <ProjectBrowser initialFilters={filters} initialData={initialData} />;
}
