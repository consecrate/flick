import { describe, expect, it } from 'vitest';
import { canMoveFolder, folderPath, folderSubtree } from '../shared/folders.ts';

// school > bio > cells, school > chem, plus a separate top-level "hobby"
const folders = [
  { id: 'cells', parentId: 'bio' },
  { id: 'bio', parentId: 'school' },
  { id: 'school', parentId: null },
  { id: 'chem', parentId: 'school' },
  { id: 'hobby', parentId: null },
];

describe('folders', () => {
  it('collects every nested folder regardless of list order', () => {
    expect([...folderSubtree(folders, 'school')].sort()).toEqual(['bio', 'cells', 'chem', 'school']);
    expect([...folderSubtree(folders, 'cells')]).toEqual(['cells']);
  });

  it('builds the path from the top level down', () => {
    expect(folderPath(folders, 'cells').map((f) => f.id)).toEqual(['school', 'bio', 'cells']);
    expect(folderPath(folders, null)).toEqual([]);
    expect(folderPath(folders, 'missing')).toEqual([]);
  });

  it('survives a parent loop in damaged data', () => {
    const loop = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];
    expect(folderPath(loop, 'a').map((f) => f.id)).toEqual(['b', 'a']);
    expect([...folderSubtree(loop, 'a')].sort()).toEqual(['a', 'b']);
  });

  it('refuses to move a folder into itself or its own subfolders', () => {
    expect(canMoveFolder(folders, 'school', 'cells')).toBe(false);
    expect(canMoveFolder(folders, 'school', 'school')).toBe(false);
    expect(canMoveFolder(folders, 'bio', 'chem')).toBe(true);
    expect(canMoveFolder(folders, 'cells', null)).toBe(true);
  });
});
