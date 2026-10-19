import { notFound } from 'next/navigation';
import { ProjectBrowser } from '@/components/project-browser';
import { SMART_LISTS, getSmartList } from '@/lib/smart-lists';

export function generateStaticParams() {
  return SMART_LISTS.map((list) => ({ slug: list.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const list = getSmartList(slug);
  return {
    title: list ? `CTWP · ${list.title}` : 'CTWP · Smart List',
    description: list?.description,
    robots: { index: false, follow: false },
  };
}

export default async function SmartListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const list = getSmartList(slug);
  if (!list) notFound();
  return <ProjectBrowser listId={list.id} />;
}
