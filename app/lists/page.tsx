import { redirect } from 'next/navigation';
import { legacyListRedirect } from '@/lib/redirects';

export default async function SmartListsIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(legacyListRedirect('/lists', await searchParams)!);
}
