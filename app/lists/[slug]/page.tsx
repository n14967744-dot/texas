import { notFound } from 'next/navigation';
import { ProjectBrowser } from '@/components/project-browser';
import { getSmartList } from '@/lib/smart-lists';
import { browserDefaults } from '@/lib/browser-defaults';
import { buildProjectSearchParams } from '@/lib/project-params';
import { parseFilters } from '@/lib/query';
import { loadProjectList } from '@/lib/projects';
import type { ProjectListResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const list = getSmartList(slug);
  return {
    title: list ? `CTWP · ${list.title}` : 'CTWP · Smart List',
    description: list?.description,
    robots: { index: false, follow: false },
  };
}

async function loadInitial(listId: string): Promise<ProjectListResponse | null> {
  try {
    const defaults = browserDefaults(listId);
    const query = buildProjectSearchParams(defaults, { listId });
    const filters = parseFilters(new URLSearchParams(query));
    return await loadProjectList(filters);
  } catch {
    return null;
  }
}

export default async function SmartListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const list = getSmartList(slug);
  if (!list) notFound();
  const initialData = await loadInitial(list.id);
  return <ProjectBrowser listId={list.id} initialData={initialData} />;
}
