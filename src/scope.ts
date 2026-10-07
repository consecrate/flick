// What a study session draws cards from: one deck (its id), a folder
// ("folder:<id>", which includes its subfolders), or null for every deck.

export type Scope = string | null;

const FOLDER = 'folder:';

export const folderScope = (folderId: string): string => `${FOLDER}${folderId}`;

export function scopeFolderId(scope: Scope): string | null {
  return scope?.startsWith(FOLDER) ? scope.slice(FOLDER.length) : null;
}

export function scopeDeckId(scope: Scope): string | null {
  return scope && !scope.startsWith(FOLDER) ? scope : null;
}

/** Query string for /api/study. */
export function scopeQuery(scope: Scope): string {
  const folderId = scopeFolderId(scope);
  if (folderId) return `&folderId=${encodeURIComponent(folderId)}`;
  return scope ? `&deckId=${encodeURIComponent(scope)}` : '';
}

/** Route that starts a mode, e.g. /play/quiz/folder/abc. */
export function playPath(mode: string, scope: Scope): string {
  const folderId = scopeFolderId(scope);
  return `/play/${mode}/${folderId ? `folder/${folderId}` : (scope ?? 'all')}`;
}

/** Where to go when a session ends. */
export function scopeHome(scope: Scope): string {
  const folderId = scopeFolderId(scope);
  if (folderId) return `/folder/${folderId}`;
  return scope ? `/deck/${scope}` : '/';
}

export function scopeBackLabel(scope: Scope): string {
  if (scopeFolderId(scope)) return 'Back to folder';
  return scope ? 'Back to deck' : 'Home';
}
