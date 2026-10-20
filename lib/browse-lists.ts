/**
 * Which lists each browse scope offers.
 * Bryan has a reviewed priority list. Waco and All Texas do not — do not invent one.
 * An empty id is All Projects.
 */

export type BrowseListChoice = { id: string; title: string };

const ALL_PROJECTS: BrowseListChoice = { id: '', title: 'All Projects' };
const DATA_CENTERS: BrowseListChoice = { id: 'data-centers', title: 'Data Centers' };
const BRYAN_PRIORITY: BrowseListChoice = { id: 'bryan-priority', title: 'Bryan Priority' };

export function listsForOffice(officeId: string): BrowseListChoice[] {
  if (officeId === 'bryan') return [ALL_PROJECTS, BRYAN_PRIORITY, DATA_CENTERS];
  return [ALL_PROJECTS, DATA_CENTERS];
}

export function listAvailable(officeId: string, listId: string): boolean {
  if (!listId) return true;
  return listsForOffice(officeId).some((list) => list.id === listId);
}

export function listTitle(listId: string): string {
  if (!listId) return ALL_PROJECTS.title;
  for (const officeId of ['bryan', 'waco', 'texas']) {
    const match = listsForOffice(officeId).find((list) => list.id === listId);
    if (match) return match.title;
  }
  return listId;
}
