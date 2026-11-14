import { describe, expect, it } from 'vitest';
import type { DesktopAction } from '../../model/desktop.ts';
import { ancestry, HOME_ID, isFile, listFolder, searchByName } from '../../model/fileSystem.ts';
import { pictureSource } from '../../desktop/labels.ts';
import { withDefaults } from '../../desktop/parts.ts';
import { LESSON_DESKTOP_SIZE } from '../harness/lesson.ts';
import { playSteps } from '../harness/playSteps.ts';
import activity from './activity.ts';
import { generateLevel, type FindItLevel } from './level.ts';
import { TARGETS } from './targets.ts';
import { FIND, findItSteps } from './steps.ts';
import { strings } from './strings.ts';

const ICON_ROOM = 320;
const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);
const EXPLORER = 'w1';

function nameOf(level: FindItLevel): string {
  const target = TARGETS[level.target];
  if (target === undefined) throw new Error('no such target');
  return target.name;
}

const words = (name: string) => name.toLowerCase().split(' ');

/** Everything under home but home itself. */
function items(level: FindItLevel) {
  const { fs } = level.desktop;
  return Object.values(fs.nodes).filter((node) => node.id !== HOME_ID && node.parentId !== null);
}

/** Items besides the target whose name shares a word with it: the look-alikes. */
function lookAlikes(level: FindItLevel) {
  const wanted = new Set(words(nameOf(level)));
  return items(level).filter((node) => node.id !== level.fileId && words(node.name).some((word) => wanted.has(word)));
}

/** What makes a round fair: one file has the name, a full-name search finds only it, and it is hidden in folders. */
function problems(level: FindItLevel): string[] {
  const found: string[] = [];
  const { fs } = level.desktop;
  const file = fs.nodes[level.fileId];
  if (!isFile(file) || file.name !== nameOf(level)) found.push('the file is not the named one');
  if (
    searchByName(fs, nameOf(level))
      .map((node) => node.id)
      .join() !== level.fileId
  ) {
    found.push('a search for the whole name finds more than the file');
  }
  if (ancestry(fs, level.fileId)[1]?.id === undefined || file?.parentId === HOME_ID)
    found.push('the file is not in a folder');
  for (const alike of lookAlikes(level)) {
    if (alike.parentId === file?.parentId) found.push('a look-alike sits beside the file');
    if (alike.kind === 'folder') found.push('a folder looks like the file');
  }
  const [window, ...extra] = level.desktop.windows;
  if (window === undefined || extra.length > 0) found.push('the round does not start with one explorer');
  else {
    if (window.app.kind !== 'file-explorer' || window.app.folderId !== HOME_ID)
      found.push('the explorer is not at home');
    const { x, y, width, height } = window.rect;
    if (x < 0 || y < 0 || y + height > LESSON_DESKTOP_SIZE.height) found.push('the explorer leaves the desktop');
    if (x + width > LESSON_DESKTOP_SIZE.width - ICON_ROOM) found.push('the explorer covers the icon');
  }
  return found;
}

/** What a child does: type the name in the search box, then click the file in the results. */
function childActions(level: FindItLevel, typed = nameOf(level)): (() => DesktopAction)[] {
  return [
    () => ({ type: 'text', windowId: EXPLORER, field: 'search', op: { type: 'insert', text: typed } }),
    () => ({ type: 'open-file', fileId: level.fileId }),
  ];
}

describe('find it for band-9-12', () => {
  if (activity.kind !== 'rounds') throw new Error('find-it is a rounds activity');
  const range = activity.difficulty['band-9-12'];
  if (range === undefined) throw new Error('find-it serves band-9-12');

  it.each([range.min, range.max])('is fair and solvable at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, 'band-9-12');
      expect(problems(level), `seed ${seed}`).toEqual([]);
      const played = playSteps(level.desktop, findItSteps(level), childActions(level));
      expect(played, `seed ${seed}`).toMatchObject({ done: 2, wrong: 0, rejected: [] });
    }
  });

  it('asks for every file across seeds, each with its own instruction', () => {
    const asked = new Set(SEEDS.map((seed) => generateLevel(seed, 3, 'band-9-12').target));
    expect(asked.size).toBe(TARGETS.length);
    expect(new Set(FIND).size).toBe(TARGETS.length);
    for (const [index, target] of TARGETS.entries()) expect(FIND[index]?.text).toContain(target.name);
  });
});

describe('find it difficulty', () => {
  // The design: [folders, other files, folders above the file, look-alike names].
  it.each([
    [1, 4, 6, 1, 0],
    [2, 5, 10, 1, 1],
    [3, 6, 14, 2, 1],
    [4, 7, 18, 2, 2],
    [5, 8, 22, 3, 2],
    [6, 9, 26, 3, 2],
  ])(
    'at %i has %i folders, %i other files, depth %i, and %i look-alikes',
    (difficulty, folders, files, depth, alikes) => {
      for (const seed of SEEDS.slice(0, 30)) {
        const level = generateLevel(seed, difficulty, 'band-9-12');
        const all = items(level);
        expect(all.filter((node) => node.kind === 'folder')).toHaveLength(folders);
        expect(all.filter((node) => node.kind !== 'folder')).toHaveLength(files + 1 + alikes);
        // Home, the folders above, and the file.
        expect(ancestry(level.desktop.fs, level.fileId)).toHaveLength(depth + 2);
        expect(lookAlikes(level)).toHaveLength(alikes);
      }
    },
  );

  it('keeps a difficulty outside the range at the nearest end', () => {
    expect(generateLevel(5, 0, 'band-9-12')).toEqual(generateLevel(5, 1, 'band-9-12'));
    expect(generateLevel(5, 9, 'band-9-12')).toEqual(generateLevel(5, 6, 'band-9-12'));
  });

  it('keeps Empty trash away', () => {
    expect(withDefaults(generateLevel(1, 1, 'band-9-12').parts).hiddenCommands).toEqual(['empty-trash']);
  });
});

describe('find it steps', () => {
  const level = generateLevel(SEEDS[4] ?? 1, 6, 'band-9-12');
  const steps = findItSteps(level);
  const [alike] = lookAlikes(level);
  if (alike === undefined) throw new Error('difficulty 6 has look-alikes');

  it('finds the file from the first word too, among its look-alikes', () => {
    const first = words(nameOf(level))[0] ?? '';
    const played = playSteps(level.desktop, steps, childActions(level, first));
    expect(played).toMatchObject({ done: 2, wrong: 0 });
    expect(searchByName(level.desktop.fs, first).length).toBeGreaterThan(1);
  });

  it('counts opening a look-alike as a try, then points at the file in the results', () => {
    const played = playSteps(level.desktop, steps, [
      childActions(level)[0] ?? (() => ({ type: 'focus-next-window' })),
      () => ({ type: 'open-file', fileId: alike.id }),
      () => ({ type: 'open-file', fileId: alike.id }),
    ]);
    // The second click only brings the look-alike forward, which opens nothing new.
    expect(played).toMatchObject({ done: 1, wrong: 1 });
    expect(steps[1]?.hint?.(played.state)).toEqual({ kind: 'key', key: `item:${level.fileId}` });
  });

  it('does not take opening the file by browsing for a search', () => {
    const played = playSteps(level.desktop, steps, [() => ({ type: 'open-file', fileId: level.fileId })]);
    expect(played.done).toBe(0);
    expect(steps[0]?.hint?.(played.state)).toEqual({ kind: 'key', key: 'search' });
    expect(steps[1]?.hint?.(played.state)).toEqual({ kind: 'key', key: 'search' });
  });

  it('takes bringing the file forward when it was open already', () => {
    const played = playSteps(level.desktop, steps, [
      () => ({ type: 'open-file', fileId: level.fileId }),
      ...childActions(level).slice(0, 1),
      () => ({ type: 'focus-window', windowId: EXPLORER }),
      () => ({ type: 'open-file', fileId: level.fileId }),
    ]);
    expect(played).toMatchObject({ done: 2, wrong: 0 });
  });

  it('says to open it once it shows', () => {
    expect(steps[1]?.instruction).toBe(strings.openIt);
    expect(listFolder(level.desktop.fs, HOME_ID).length).toBeGreaterThan(0);
  });
});

describe('find it layout and files', () => {
  it('opens one big explorer at home beside an explorer icon', () => {
    const level = generateLevel(1, 6, 'band-9-12');
    expect(level.desktop.windows.map((window) => window.rect)).toEqual([{ x: 24, y: 24, width: 680, height: 592 }]);
    expect(withDefaults(level.parts)).toEqual({
      icons: [{ app: 'file-explorer' }],
      menuBar: true,
      taskStrip: true,
      launcher: [],
      windowControls: ['close'],
      move: true,
      resize: false,
      openMaximized: false,
      systemSound: false,
      hiddenCommands: ['empty-trash'],
    });
  });

  it('hides no folder deeper than the file’s own folder', () => {
    for (const seed of SEEDS) {
      for (const difficulty of [1, 6]) {
        const level = generateLevel(seed, difficulty, 'band-9-12');
        const fileDepth = ancestry(level.desktop.fs, level.fileId).length;
        for (const node of items(level).filter((entry) => entry.kind === 'folder')) {
          expect(ancestry(level.desktop.fs, node.id).length, `seed ${seed}`).toBeLessThanOrEqual(fileDepth);
        }
      }
    }
  });

  it('names each file in its instruction, with look-alikes that share a word of its name', () => {
    for (const [index, target] of TARGETS.entries()) {
      expect(FIND[index]?.text).toContain(`called ${target.name}.`);
      for (const decoy of target.decoys) {
        expect(decoy.name).not.toBe(target.name);
        expect(words(decoy.name).some((word) => words(target.name).includes(word))).toBe(true);
      }
      if (target.spec.kind === 'picture') expect(pictureSource(target.spec.pictureId).kind).toBe('emoji');
    }
  });
});
