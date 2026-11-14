import { describe, expect, it } from 'vitest';
import type { Band } from '../../../../core/bands.ts';
import type { DesktopAction, DialogAction } from '../../model/desktop.ts';
import { HOME_ID, listFolder, nodeAtPath } from '../../model/fileSystem.ts';
import { hasUnsavedChanges, type DesktopState } from '../../model/state.ts';
import { LESSON_DESKTOP_SIZE } from '../harness/lesson.ts';
import { playSteps } from '../harness/playSteps.ts';
import activity from './activity.ts';
import { generateLevel, NOTES_FOLDER, WORK, type SaveOpenLevel } from './level.ts';
import { saveOpenSteps } from './steps.ts';
import { strings } from './strings.ts';

const ICON_ROOM = 320;
const SEEDS = Array.from({ length: 200 }, (_, index) => index * 7_919 + 11);
const NAME = 'My day';

function rangeOf(band: Band): { min: number; max: number } {
  if (activity.kind !== 'rounds') throw new Error('save-and-open is a rounds activity');
  const range = activity.difficulty[band];
  if (range === undefined) throw new Error(`no range for ${band}`);
  return range;
}

/** What makes a round fair: one notepad with the child's unsaved sentence, and no note already holds it. */
function problems(level: SaveOpenLevel): string[] {
  const found: string[] = [];
  const [window, ...extra] = level.desktop.windows;
  if (window === undefined || extra.length > 0) return ['the round does not start with one notepad'];
  if (window.app.kind !== 'notepad' || window.app.editor.text !== level.text || window.app.fileId !== null) {
    found.push('the notepad does not hold the new sentence');
  } else if (!hasUnsavedChanges(window.app)) found.push('the sentence is saved already');
  const notes = Object.values(level.desktop.fs.nodes).filter((node) => node.kind === 'note');
  if (notes.some((node) => node.kind === 'note' && node.text === level.text)) found.push('a note holds the sentence');
  const names = Object.values(level.desktop.fs.nodes).map((node) => node.name.toLowerCase());
  if (new Set(names).size !== names.length) found.push('two items share a name');
  if (names.includes(NAME.toLowerCase())) found.push('the name a child might type is taken');
  const { x, y, width, height } = window.rect;
  if (x < 0 || y < 0 || y + height > LESSON_DESKTOP_SIZE.height) found.push('the notepad leaves the desktop');
  if (x + width > LESSON_DESKTOP_SIZE.width - ICON_ROOM) found.push('the notepad covers the icon');
  if (level.folderId !== null && level.desktop.fs.nodes[level.folderId]?.name !== NOTES_FOLDER) {
    found.push('the folder to save in is not Notes');
  }
  return found;
}

const dialog = (windowId: string, action: DialogAction) => (): DesktopAction => ({ type: 'dialog', windowId, action });

/** The note the child saved, found by the name they typed. */
function saved(state: DesktopState, level: SaveOpenLevel): string {
  const folder = level.folderId === null ? '' : `${NOTES_FOLDER}/`;
  const node = nodeAtPath(state.fs, `${folder}${NAME}`);
  if (node === undefined) throw new Error('the note was not saved');
  return node.id;
}

/** What a child does: File, Save, name it, Save; close; open the notepad, File, Open, pick it, Open. */
function childActions(level: SaveOpenLevel): ((state: DesktopState) => DesktopAction)[] {
  const intoFolder = (windowId: string) =>
    level.folderId === null ? [] : [dialog(windowId, { type: 'open-folder', folderId: level.folderId })];
  return [
    () => ({ type: 'command', windowId: 'w1', command: 'save' }),
    ...intoFolder('w1'),
    () => ({ type: 'text', windowId: 'w1', field: 'file-name', op: { type: 'insert', text: NAME } }),
    dialog('w1', { type: 'confirm' }),
    () => ({ type: 'close-window', windowId: 'w1' }),
    () => ({ type: 'open-app', app: 'notepad' }),
    () => ({ type: 'command', windowId: 'w2', command: 'open' }),
    ...intoFolder('w2'),
    (state) => ({ type: 'dialog', windowId: 'w2', action: { type: 'select', nodeId: saved(state, level) } }),
    dialog('w2', { type: 'confirm' }),
  ];
}

describe.each(['band-6-8', 'band-9-12'] as const)('save and open for %s', (band) => {
  const { min, max } = rangeOf(band);

  it.each([min, max])('is fair and solvable at difficulty %i for every seed', (difficulty) => {
    for (const seed of SEEDS) {
      const level = generateLevel(seed, difficulty, band);
      expect(problems(level), `seed ${seed}`).toEqual([]);
      const played = playSteps(level.desktop, saveOpenSteps(level), childActions(level));
      expect(played, `seed ${seed}`).toMatchObject({ done: 4, wrong: 0, rejected: [] });
      // The note open again is the one the child wrote.
      const window = played.state.windows[0];
      expect(window?.app.kind === 'notepad' ? window.app.editor.text : null).toBe(level.text);
    }
  });

  it('writes every sentence across seeds', () => {
    expect(new Set(SEEDS.map((seed) => generateLevel(seed, max, band).text)).size).toBe(WORK.length);
  });
});

describe('save and open difficulty', () => {
  // The design: [other notes at home, folders, save in Notes, notes already in Notes].
  it.each([
    [1, 0, 0, false, 0],
    [2, 1, 0, false, 0],
    [3, 2, 1, false, 0],
    [4, 2, 1, true, 0],
    [5, 2, 2, true, 1],
    [6, 3, 3, true, 1],
    [7, 3, 3, true, 2],
    [8, 4, 3, true, 3],
  ])(
    'at %i has %i notes, %i folders, saves in Notes: %s, with %i notes there',
    (difficulty, notes, folders, inNotes, there) => {
      for (const seed of SEEDS.slice(0, 20)) {
        const level = generateLevel(seed, difficulty, 'band-9-12');
        const home = listFolder(level.desktop.fs, HOME_ID);
        expect(home.filter((node) => node.kind === 'note')).toHaveLength(notes);
        expect(home.filter((node) => node.kind === 'folder')).toHaveLength(folders);
        expect(level.folderId !== null).toBe(inNotes);
        const notesFolder = nodeAtPath(level.desktop.fs, NOTES_FOLDER);
        expect(notesFolder === undefined ? 0 : listFolder(level.desktop.fs, notesFolder.id).length).toBe(there);
        expect(saveOpenSteps(level)[1]?.instruction).toBe(inNotes ? strings.nameInNotes : strings.name);
      }
    },
  );

  it('keeps a difficulty outside the range at the nearest end', () => {
    expect(generateLevel(5, 0, 'band-6-8')).toEqual(generateLevel(5, 1, 'band-6-8'));
    expect(generateLevel(5, 10, 'band-9-12')).toEqual(generateLevel(5, 8, 'band-9-12'));
  });
});

describe('save and open steps', () => {
  const level = generateLevel(SEEDS[2] ?? 1, 6, 'band-9-12');
  const steps = saveOpenSteps(level);
  const other = listFolder(level.desktop.fs, HOME_ID).find((node) => node.kind === 'note');
  if (level.folderId === null || other === undefined) throw new Error('difficulty 6 saves in Notes beside other notes');
  const notesId = level.folderId;

  it('counts a save in another folder as a try, then points at Notes and then at Save', () => {
    const atHome = [
      () => ({ type: 'command', windowId: 'w1', command: 'save' }) as const,
      () => ({ type: 'text', windowId: 'w1', field: 'file-name', op: { type: 'insert', text: NAME } }) as const,
      dialog('w1', { type: 'confirm' }),
      () => ({ type: 'command', windowId: 'w1', command: 'save-as' }) as const,
      () => ({ type: 'text', windowId: 'w1', field: 'file-name', op: { type: 'insert', text: ' 2' } }) as const,
      dialog('w1', { type: 'confirm' }),
    ];
    const played = playSteps(level.desktop, steps, atHome);
    expect(played).toMatchObject({ done: 1, wrong: 2, rejected: [] });
    expect(played.hints).toEqual([{ kind: 'menu', menu: 'file' }]);
    const asking = playSteps(played.state, steps.slice(1), [
      () => ({ type: 'command', windowId: 'w1', command: 'save-as' }),
    ]);
    expect(steps[1]?.hint?.(asking.state)).toEqual({ kind: 'key', key: `item:${notesId}` });
    const inNotes = playSteps(asking.state, steps.slice(1), [dialog('w1', { type: 'open-folder', folderId: notesId })]);
    expect(steps[1]?.hint?.(inNotes.state)).toEqual({ kind: 'key', key: 'dialog:confirm' });
  });

  it('counts opening another note as a try, and points the way to the right one', () => {
    const upToClose = childActions(level).slice(0, 5);
    const played = playSteps(level.desktop, steps, [
      ...upToClose,
      () => ({ type: 'open-file', fileId: other.id }),
      () => ({ type: 'close-window', windowId: 'w2' }),
    ]);
    expect(played).toMatchObject({ done: 3, wrong: 1, rejected: [] });
    expect(steps[3]?.hint?.(played.state)).toEqual({ kind: 'icon', index: 0 });
    const opening = playSteps(played.state, steps.slice(3), [
      () => ({ type: 'open-app', app: 'notepad' }),
      () => ({ type: 'command', windowId: 'w3', command: 'open' }),
    ]);
    expect(steps[3]?.hint?.(opening.state)).toEqual({ kind: 'key', key: `item:${notesId}` });
    const inNotes = playSteps(opening.state, steps.slice(3), [
      dialog('w3', { type: 'open-folder', folderId: notesId }),
    ]);
    const mine = saved(inNotes.state, level);
    expect(steps[3]?.hint?.(inNotes.state)).toEqual({ kind: 'key', key: `item:${mine}` });
    const picked = playSteps(inNotes.state, steps.slice(3), [dialog('w3', { type: 'select', nodeId: mine })]);
    expect(steps[3]?.hint?.(picked.state)).toEqual({ kind: 'key', key: 'dialog:confirm' });
  });

  it('points at the close button while the notepad is open', () => {
    expect(steps[2]?.hint?.(level.desktop)).toEqual({ kind: 'window-control', windowId: 'w1', control: 'close' });
  });

  it('takes a save over an old note as the child’s own note', () => {
    const easy = generateLevel(SEEDS[0] ?? 1, 2, 'band-6-8');
    const old = listFolder(easy.desktop.fs, HOME_ID).find((node) => node.kind === 'note');
    if (old === undefined) throw new Error('difficulty 2 has a note at home');
    const played = playSteps(easy.desktop, saveOpenSteps(easy), [
      () => ({ type: 'command', windowId: 'w1', command: 'save' }),
      dialog('w1', { type: 'select', nodeId: old.id }),
      dialog('w1', { type: 'confirm' }),
      dialog('w1', { type: 'confirm' }),
    ]);
    expect(played).toMatchObject({ done: 2, wrong: 0, rejected: [] });
  });
});
