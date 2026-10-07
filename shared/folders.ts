// Folder tree helpers shared by the server and the web client.

import type { Folder } from './types.ts';

/** The folder and every folder nested inside it, at any depth. */
export function folderSubtree(folders: Pick<Folder, 'id' | 'parentId'>[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  // Walk until nothing new is added; robust to any order in the list.
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Folders from the top level down to `id`, inclusive. Stops on a broken or looping chain. */
export function folderPath<T extends Pick<Folder, 'id' | 'parentId'>>(folders: T[], id: string | null | undefined): T[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: T[] = [];
  const seen = new Set<string>();
  let cur = id ? byId.get(id) : undefined;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    path.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return path;
}

/** A folder can move anywhere except into itself or one of its own subfolders. */
export function canMoveFolder(folders: Pick<Folder, 'id' | 'parentId'>[], id: string, parentId: string | null): boolean {
  return parentId === null || !folderSubtree(folders, id).has(parentId);
}
