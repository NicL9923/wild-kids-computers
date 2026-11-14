import { describe, expect, it } from 'vitest';
import { createToyClipboard } from '../../../../app/inputGuards.ts';
import { buildDesktop, picture } from '../../model/build.ts';
import { reduceAll, type DesktopAction } from '../../model/desktop.ts';
import { listFolder, MAX_NODES, nodeAtPath, trashNode } from '../../model/fileSystem.ts';
import { desktopDocument } from '../../model/schema.ts';
import type { DesktopState } from '../../model/state.ts';
import { forSaving, PAINTINGS_FOLDER, withPaintings } from './saving.ts';

const env = () => ({ clipboard: createToyClipboard() });

function typed(): DesktopState {
  const start = buildDesktop({ windows: [{ app: 'notepad' }, { app: 'music-box' }] });
  const keys: DesktopAction[] = 'a fox'.split('').map((key) => ({
    type: 'text',
    windowId: 'w1',
    field: 'document',
    op: { type: 'insert', text: key },
  }));
  return reduceAll(
    start,
    [
      ...keys,
      { type: 'music-box', windowId: 'w2', action: { type: 'toggle', step: 1, note: 2 } },
      { type: 'command', windowId: 'w2', command: 'play' },
    ],
    env(),
  ).state;
}

describe('forSaving', () => {
  it('keeps the text and caret but drops undo history and playback', () => {
    const state = typed();
    const saved = forSaving(state);
    const [notepad, music] = saved.windows.map((window) => window.app);
    if (notepad?.kind !== 'notepad' || music?.kind !== 'music-box') throw new Error('unexpected apps');
    expect(notepad.editor.text).toBe('a fox');
    expect(notepad.editor.caret).toBe(5);
    expect(notepad.editor.undo).toEqual([]);
    expect(music.tune.steps[1]?.[2]).toBe(true);
    expect([music.playing, music.undo.length]).toEqual([false, 0]);
    // What is saved loads back as the same desktop.
    const loaded = desktopDocument.schema.safeParse({ version: 1, state: saved });
    expect(loaded.success).toBe(true);
  });
});

describe('withPaintings', () => {
  const ids = ['3f2a9c1e-0000-4000-8000-000000000001', '3f2a9c1e-0000-4000-8000-000000000002'];

  it('puts each gallery painting in a Paintings folder for the picture viewer', () => {
    const state = withPaintings(buildDesktop(), ids);
    const folder = nodeAtPath(state.fs, PAINTINGS_FOLDER);
    if (folder === undefined) throw new Error('no Paintings folder');
    const paintings = listFolder(state.fs, folder.id);
    expect(paintings.map((node) => (node.kind === 'picture' ? node.pictureId : null))).toEqual(
      ids.map((id) => `g-${id}`),
    );
    expect(new Set(paintings.map((node) => node.name)).size).toBe(2);
  });

  it('adds a painting only once, even after the child moved or trashed it', () => {
    const once = withPaintings(buildDesktop(), ids);
    expect(withPaintings(once, ids)).toBe(once);
    const painting = Object.values(once.fs.nodes).find((node) => node.kind === 'picture');
    if (painting === undefined) throw new Error('no painting');
    const trashed = trashNode(once.fs, painting.id);
    if (!trashed.ok) throw new Error(trashed.problem);
    const inTrash = { ...once, fs: trashed.fs };
    expect(withPaintings(inTrash, ids)).toBe(inTrash);
  });

  it('uses a Paintings folder that is already there, and adds new paintings to it', () => {
    const start = buildDesktop({ files: { Paintings: { Old: picture('fox') } } });
    const state = withPaintings(start, [ids[0] ?? '']);
    const folder = nodeAtPath(state.fs, PAINTINGS_FOLDER);
    if (folder === undefined) throw new Error('no Paintings folder');
    expect(listFolder(state.fs, folder.id)).toHaveLength(2);
  });

  it('skips an id the toy file system cannot hold, and changes nothing when nothing is new', () => {
    const start = buildDesktop();
    expect(withPaintings(start, ['UPPER-case', 'a'.repeat(60)])).toBe(start);
    expect(withPaintings(start, [])).toBe(start);
  });

  it('stops quietly when the toy computer is full', () => {
    const files = Object.fromEntries(
      Array.from({ length: MAX_NODES - 2 }, (_, index) => [`File ${String(index)}`, picture('fox')]),
    );
    const full = buildDesktop({ files });
    expect(withPaintings(full, ids)).toBe(full);
  });
});
