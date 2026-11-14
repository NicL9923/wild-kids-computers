import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { withDefaults } from '../../desktop/parts.ts';
import type { DesktopAction } from '../../model/desktop.ts';
import { HOME_ID, listFolder, TRASH_ID } from '../../model/fileSystem.ts';
import { LESSON_DESKTOP_SIZE } from '../harness/lesson.ts';
import { FILE_KINDS_IN_FOLDERS } from '../harness/lessonFiles.ts';
import { playSteps } from '../harness/playSteps.ts';
import activity from './activity.ts';
import { generateLevel, type FilesFoldersLevel } from './level.ts';
import { filesFoldersSteps } from './steps.ts';
import { strings } from './strings.ts';

/** Room the icon column needs at the right edge, in desktop units. */
const ICON_ROOM = 320;
const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);
const EXPLORER = 'w1';

function rangeOf(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('files-and-folders is a rounds activity');
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`no range for ${band}`);
  return range;
}

const folderOf = (kind: string) => FILE_KINDS_IN_FOLDERS.find((entry) => entry.kind === kind)?.folder;

/** What makes a round fair: one file to sort, its folder at home, and nothing else of its kind loose. */
function problems(level: FilesFoldersLevel): string[] {
  const found: string[] = [];
  const { fs } = level.desktop;
  const file = fs.nodes[level.fileId];
  const folder = fs.nodes[level.folderId];
  if (file?.kind !== level.kind || file.parentId !== HOME_ID) found.push('the file is not at home');
  if (folder?.kind !== 'folder' || folder.parentId !== HOME_ID || folder.name !== folderOf(level.kind)) {
    found.push('the folder is not the one for its kind');
  }
  const home = listFolder(fs, HOME_ID);
  if (home.filter((node) => node.kind === level.kind).length !== 1)
    found.push('more than one file of the kind is loose');
  for (const node of home.filter((entry) => entry.kind === 'folder')) {
    const inside = listFolder(fs, node.id);
    const kind = FILE_KINDS_IN_FOLDERS.find((entry) => entry.folder === node.name)?.kind;
    if (inside.length === 0 || inside.some((entry) => entry.kind !== kind))
      found.push(`${node.name} holds the wrong things`);
  }
  const names = Object.values(fs.nodes).map((node) => node.name.toLowerCase());
  if (new Set(names).size !== names.length) found.push('two items share a name');
  if (listFolder(fs, TRASH_ID).length > 0) found.push('the trash is not empty');
  const [window, ...extra] = level.desktop.windows;
  if (window === undefined || extra.length > 0) found.push('the round does not start with one explorer');
  else {
    const { x, y, width, height } = window.rect;
    if (x < 0 || y < 0 || y + height > LESSON_DESKTOP_SIZE.height) found.push('the explorer leaves the desktop');
    if (x + width > LESSON_DESKTOP_SIZE.width - ICON_ROOM) found.push('the explorer covers the icon');
    const start = window.app.kind === 'file-explorer' ? window.app.folderId : null;
    if (start !== (level.startFolderId ?? HOME_ID)) found.push('the explorer starts in another folder');
  }
  if (level.startFolderId === level.folderId) found.push('the explorer starts in the target folder');
  return found;
}

const explorer = (action: Extract<DesktopAction, { type: 'explorer' }>['action']) => (): DesktopAction => ({
  type: 'explorer',
  windowId: EXPLORER,
  action,
});

/** What a child does: go home if needed, carry the file to its folder, open it, make and name a folder. */
function childActions(level: FilesFoldersLevel): (() => DesktopAction)[] {
  return [
    ...(level.startFolderId === null ? [] : [explorer({ type: 'open-node', nodeId: HOME_ID })]),
    explorer({ type: 'move', nodeId: level.fileId, toId: level.folderId }),
    explorer({ type: 'open-node', nodeId: level.folderId }),
    () => ({ type: 'command', windowId: EXPLORER, command: 'new-folder' }),
    () => ({ type: 'text', windowId: EXPLORER, field: 'rename', op: { type: 'insert', text: 'Toys' } }),
    explorer({ type: 'commit-rename' }),
  ];
}

describe.each(['band-6-8', 'band-9-12'] as const)('files and folders for %s', (band) => {
  const { min, max } = rangeOf(band);

  it.each([min, max])('is fair and solvable at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, band);
      expect(problems(level), `seed ${seed}`).toEqual([]);
      const steps = filesFoldersSteps(level);
      const played = playSteps(level.desktop, steps, childActions(level));
      expect(played, `seed ${seed}`).toMatchObject({ done: steps.length, wrong: 0, rejected: [] });
    }
  });

  it('asks for every kind of file across seeds', () => {
    const kinds = new Set(SEEDS.map((seed) => generateLevel(seed, max, band).kind));
    expect([...kinds].toSorted()).toEqual(['note', 'picture', 'tune']);
  });
});

describe('files and folders difficulty', () => {
  // The design: [folders at home, loose files of other kinds, starts away from home] per difficulty.
  it.each([
    [1, 1, 0, false],
    [2, 2, 0, false],
    [3, 2, 1, false],
    [4, 3, 1, false],
    [5, 3, 2, false],
    [6, 3, 3, false],
    [7, 3, 3, true],
    [8, 3, 4, true],
  ])('at %i has %i folders, %i other loose files, and starts away: %s', (difficulty, folders, others, away) => {
    for (const seed of SEEDS.slice(0, 20)) {
      const level = generateLevel(seed, difficulty, 'band-9-12');
      const home = listFolder(level.desktop.fs, HOME_ID);
      expect(home.filter((node) => node.kind === 'folder')).toHaveLength(folders);
      expect(home.filter((node) => node.kind !== 'folder')).toHaveLength(others + 1);
      expect(level.startFolderId !== null).toBe(away);
      expect(filesFoldersSteps(level)[0]?.instruction === strings.goHome).toBe(away);
    }
  });

  it('keeps a difficulty outside the range at the nearest end', () => {
    expect(generateLevel(5, 0, 'band-6-8')).toEqual(generateLevel(5, 1, 'band-6-8'));
    expect(generateLevel(5, 12, 'band-9-12')).toEqual(generateLevel(5, 8, 'band-9-12'));
  });

  it('shows only the explorer icon and keeps Empty trash away', () => {
    const parts = withDefaults(generateLevel(3, 4, 'band-6-8').parts);
    expect(parts.icons).toEqual([{ app: 'file-explorer' }]);
    expect(parts.hiddenCommands).toEqual(['empty-trash']);
    expect(parts.windowControls).toEqual(['close']);
  });
});

describe('files and folders steps', () => {
  const level = generateLevel(SEEDS[3] ?? 1, 4, 'band-6-8');
  const steps = filesFoldersSteps(level);
  const otherFolder = listFolder(level.desktop.fs, HOME_ID).find(
    (node) => node.kind === 'folder' && node.id !== level.folderId,
  );
  if (otherFolder === undefined) throw new Error('difficulty 4 has three folders');

  const moveFile = explorer({ type: 'move', nodeId: level.fileId, toId: level.folderId });
  it.each([
    ['into another folder before the file is in it', [], otherFolder.id, 0],
    ['into the trash before the file is in it', [], TRASH_ID, 0],
    ['into another folder once the file is in it', [moveFile], otherFolder.id, 1],
  ] as const)(
    'puts the named folder back at home when the child moves it %s, and counts no try',
    (_label, before, to, done) => {
      const played = playSteps(level.desktop, steps, [
        ...before,
        explorer({ type: 'move', nodeId: level.folderId, toId: to }),
      ]);
      expect(played).toMatchObject({ done, wrong: 0, restored: 1, rejected: [] });
      expect(played.state.fs.nodes[level.folderId]?.parentId).toBe(HOME_ID);
    },
  );

  it('says each step: move, open, make, name', () => {
    expect(steps.map((step) => step.instruction)).toEqual([
      expect.objectContaining({ id: expect.stringMatching(/files-and-folders\.move/) }),
      expect.objectContaining({ id: expect.stringMatching(/files-and-folders\.open/) }),
      strings.newFolder,
      strings.nameFolder,
    ]);
  });

  it('counts a file in the wrong folder as a try, then points at its dots', () => {
    const wrongTwice = [
      explorer({ type: 'move', nodeId: level.fileId, toId: otherFolder.id }),
      explorer({ type: 'move', nodeId: level.fileId, toId: HOME_ID }),
      explorer({ type: 'move', nodeId: level.fileId, toId: otherFolder.id }),
    ];
    const played = playSteps(level.desktop, steps, wrongTwice);
    expect(played).toMatchObject({ done: 0, wrong: 3, rejected: [] });
    // Back at home after the second try, so the hint points at the file's dots.
    expect(played.hints).toEqual([{ kind: 'key', key: `move:${level.fileId}` }]);
  });

  it('counts opening the file instead of moving it as a try', () => {
    const played = playSteps(level.desktop, steps, [() => ({ type: 'open-file', fileId: level.fileId })]);
    expect(played).toMatchObject({ done: 0, wrong: 1 });
  });

  it('points at Home when the explorer is somewhere else', () => {
    const inside = listFolder(level.desktop.fs, otherFolder.id)[0];
    if (inside === undefined) throw new Error('every folder holds a file');
    const played = playSteps(level.desktop, steps, [
      explorer({ type: 'open-node', nodeId: otherFolder.id }),
      explorer({ type: 'move', nodeId: inside.id, toId: TRASH_ID }),
      () => ({ type: 'open-file', fileId: level.fileId }),
    ]);
    expect(played).toMatchObject({ done: 0, wrong: 2 });
    expect(played.hints).toEqual([{ kind: 'key', key: `place:${HOME_ID}` }]);
  });

  it('does not count renaming a folder that was already there', () => {
    const upToName = childActions(level).slice(0, 3);
    const renameOld = [
      ...upToName,
      explorer({ type: 'cancel-rename' }),
      explorer({ type: 'start-rename', nodeId: otherFolder.id }),
      () => ({ type: 'text', windowId: EXPLORER, field: 'rename', op: { type: 'insert', text: 'Old' } }) as const,
      explorer({ type: 'commit-rename' }),
    ];
    const played = playSteps(level.desktop, steps, renameOld);
    expect(played).toMatchObject({ done: 3, wrong: 1, rejected: [] });
  });

  it('starts a round that begins away from home by going home', () => {
    const away = generateLevel(SEEDS[0] ?? 1, 8, 'band-9-12');
    const awaySteps = filesFoldersSteps(away);
    const played = playSteps(away.desktop, awaySteps, [explorer({ type: 'open-node', nodeId: away.folderId })]);
    expect(played).toMatchObject({ done: 0, wrong: 1 });
    expect(awaySteps[0]?.hint?.(away.desktop)).toEqual({ kind: 'key', key: `place:${HOME_ID}` });
  });
});

// The layout is the design reviewed in the screenshots: one explorer, as big as the lesson
// desktop allows beside the icon, and only the parts sorting files needs.
describe('files and folders layout', () => {
  it('opens one big explorer beside a single explorer icon', () => {
    const level = generateLevel(1, 8, 'band-9-12');
    expect(level.desktop.windows.map((window) => window.rect)).toEqual([{ x: 24, y: 24, width: 680, height: 592 }]);
    const { icons, ...parts } = withDefaults(level.parts);
    expect(icons).toEqual([{ app: 'file-explorer' }]);
    expect(parts).toEqual({
      menuBar: true,
      taskStrip: false,
      launcher: [],
      windowControls: ['close'],
      move: false,
      resize: false,
      openMaximized: false,
      systemSound: false,
      hiddenCommands: ['empty-trash'],
    });
  });
});
