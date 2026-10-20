import { notFound, redirect } from 'next/navigation';
import { legacyListRedirect } from '@/lib/redirects';

export default async function SmartListPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const target = legacyListRedirect(`/lists/${slug}`, await searchParams);
  if (!target) notFound();
  redirect(target);
}
