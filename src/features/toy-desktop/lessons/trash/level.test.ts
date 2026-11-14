import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import { withDefaults } from '../../desktop/parts.ts';
import type { DesktopAction } from '../../model/desktop.ts';
import { HOME_ID, listFolder, TRASH_ID } from '../../model/fileSystem.ts';
import { LESSON_DESKTOP_SIZE } from '../harness/lesson.ts';
import { playSteps } from '../harness/playSteps.ts';
import activity from './activity.ts';
import { generateLevel, PICTURES_FOLDER, type TrashLevel } from './level.ts';
import { trashSteps } from './steps.ts';
import { strings } from './strings.ts';

const ICON_ROOM = 320;
const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);
const EXPLORER = 'w1';

function rangeOf(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('trash is a rounds activity');
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`no range for ${band}`);
  return range;
}

/** What makes a round fair: the named picture is in the open folder once, and no picture is in the trash. */
function problems(level: TrashLevel): string[] {
  const found: string[] = [];
  const { fs } = level.desktop;
  const file = fs.nodes[level.fileId];
  if (file?.kind !== 'picture' || file.pictureId !== level.pictureId) found.push('the file is not the named picture');
  if (file?.parentId !== level.folderId) found.push('the picture is not in its folder');
  const shown = listFolder(fs, level.folderId);
  if (shown.filter((node) => node.kind === 'picture' && node.pictureId === level.pictureId).length !== 1) {
    found.push('the named picture is not there exactly once');
  }
  if (listFolder(fs, TRASH_ID).some((node) => node.kind === 'picture')) found.push('a picture is in the trash');
  const [window, ...extra] = level.desktop.windows;
  if (window === undefined || extra.length > 0) found.push('the round does not start with one explorer');
  else {
    if (window.app.kind !== 'file-explorer' || window.app.folderId !== level.folderId) {
      found.push('the explorer does not show the pictures');
    }
    const { x, y, width, height } = window.rect;
    if (x < 0 || y < 0 || y + height > LESSON_DESKTOP_SIZE.height) found.push('the explorer leaves the desktop');
    if (x + width > LESSON_DESKTOP_SIZE.width - ICON_ROOM) found.push('the explorer covers the icons');
  }
  return found;
}

const explorer = (action: Extract<DesktopAction, { type: 'explorer' }>['action']) => (): DesktopAction => ({
  type: 'explorer',
  windowId: EXPLORER,
  action,
});

/** What a child does: carry the picture to Trash, open Trash, pick the picture, and click Restore. */
function childActions(level: TrashLevel): (() => DesktopAction)[] {
  return [
    explorer({ type: 'move', nodeId: level.fileId, toId: TRASH_ID }),
    explorer({ type: 'open-node', nodeId: TRASH_ID }),
    explorer({ type: 'select', nodeId: level.fileId }),
    () => ({ type: 'command', windowId: EXPLORER, command: 'restore' }),
  ];
}

describe.each(['band-6-8', 'band-9-12'] as const)('trash for %s', (band) => {
  const { min, max } = rangeOf(band);

  it.each([min, max])('is fair and solvable at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, band);
      expect(problems(level), `seed ${seed}`).toEqual([]);
      const played = playSteps(level.desktop, trashSteps(level), childActions(level));
      expect(played, `seed ${seed}`).toMatchObject({ done: 3, wrong: 0, rejected: [] });
      // The picture is back in the folder it came from.
      expect(played.state.fs.nodes[level.fileId]?.parentId).toBe(level.folderId);
    }
  });

  it('names every picture across seeds', () => {
    const named = new Set(SEEDS.map((seed) => generateLevel(seed, max, band).pictureId));
    expect(named.size).toBe(6);
  });
});

describe('trash difficulty', () => {
  // The design: [pictures to choose from, in a Pictures folder, notes and tunes already in the trash].
  it.each([
    [1, 2, false, 0],
    [2, 3, false, 0],
    [3, 3, true, 0],
    [4, 4, true, 1],
    [5, 4, true, 2],
    [6, 5, true, 2],
    [7, 5, true, 3],
    [8, 6, true, 3],
  ])('at %i shows %i pictures, in a folder: %s, with %i things in the trash', (difficulty, count, inFolder, old) => {
    for (const seed of SEEDS.slice(0, 20)) {
      const level = generateLevel(seed, difficulty, 'band-9-12');
      expect(listFolder(level.desktop.fs, level.folderId)).toHaveLength(count);
      expect(level.desktop.fs.nodes[level.folderId]?.name).toBe(inFolder ? PICTURES_FOLDER : 'Home');
      expect(level.folderId === HOME_ID).toBe(!inFolder);
      expect(listFolder(level.desktop.fs, TRASH_ID)).toHaveLength(old);
    }
  });

  it('keeps a difficulty outside the range at the nearest end', () => {
    expect(generateLevel(5, 0, 'band-6-8')).toEqual(generateLevel(5, 1, 'band-6-8'));
    expect(generateLevel(5, 11, 'band-9-12')).toEqual(generateLevel(5, 8, 'band-9-12'));
  });

  it('shows the explorer and the trash, and keeps Empty trash away', () => {
    const parts = withDefaults(generateLevel(3, 4, 'band-6-8').parts);
    expect(parts.icons).toEqual([{ app: 'file-explorer' }, { trash: true }]);
    expect(parts.hiddenCommands).toEqual(['empty-trash']);
  });
});

describe('trash steps', () => {
  const level = generateLevel(SEEDS[5] ?? 1, 6, 'band-9-12');
  const steps = trashSteps(level);
  const other = listFolder(level.desktop.fs, level.folderId).find((node) => node.id !== level.fileId);
  const old = listFolder(level.desktop.fs, TRASH_ID)[0];
  if (other === undefined || old === undefined) throw new Error('difficulty 6 has five pictures and old things');

  it('names the picture first, then says to open the trash and restore', () => {
    expect(steps[0]?.instruction).toEqual(expect.objectContaining({ id: expect.stringMatching(/^trash\.delete/) }));
    expect(steps.slice(1).map((step) => step.instruction)).toEqual([strings.openTrash, strings.restore]);
  });

  it('counts another picture in the trash as a try, then points at the right one', () => {
    const played = playSteps(level.desktop, steps, [
      explorer({ type: 'move', nodeId: other.id, toId: TRASH_ID }),
      () => ({ type: 'open-file', fileId: level.fileId }),
    ]);
    expect(played).toMatchObject({ done: 0, wrong: 2 });
    expect(played.hints).toEqual([{ kind: 'key', key: `move:${level.fileId}` }]);
  });

  it('counts restoring something else as a try, and points at the picture, then at Restore', () => {
    const upToRestore = childActions(level).slice(0, 2);
    const restoreOld = [
      explorer({ type: 'select', nodeId: old.id }),
      () => ({ type: 'command', windowId: EXPLORER, command: 'restore' }) as const,
    ];
    const played = playSteps(level.desktop, steps, [
      ...upToRestore,
      ...restoreOld,
      explorer({ type: 'open-node', nodeId: TRASH_ID }),
    ]);
    expect(played).toMatchObject({ done: 2, wrong: 1, rejected: [] });
    expect(steps[2]?.hint?.(played.state)).toEqual({ kind: 'key', key: `item:${level.fileId}` });
    const picked = playSteps(played.state, steps.slice(2), [explorer({ type: 'select', nodeId: level.fileId })]);
    expect(steps[2]?.hint?.(picked.state)).toEqual({ kind: 'command', command: 'restore' });
  });

  it('points at Trash while the trash is not open', () => {
    expect(steps[1]?.hint?.(level.desktop)).toEqual({ kind: 'key', key: `place:${TRASH_ID}` });
    expect(steps[2]?.hint?.(level.desktop)).toEqual({ kind: 'key', key: `place:${TRASH_ID}` });
  });
});
