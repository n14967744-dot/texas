import { ProjectBrowser } from '@/components/project-browser';
import { browserDefaults } from '@/lib/browser-defaults';
import { buildProjectSearchParams } from '@/lib/project-params';
import { parseFilters } from '@/lib/query';
import { loadProjectList } from '@/lib/projects';
import type { ProjectListResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function loadInitial(): Promise<ProjectListResponse | null> {
  try {
    const defaults = browserDefaults();
    const query = buildProjectSearchParams(defaults);
    const filters = parseFilters(new URLSearchParams(query));
    return await loadProjectList(filters);
  } catch {
    return null;
  }
}

export default async function Home() {
  const initialData = await loadInitial();
  return <ProjectBrowser initialData={initialData} />;
}
