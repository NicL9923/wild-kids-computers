import type { HighlightTarget } from '../../desktop/parts.ts';
import { isTrashed } from '../../model/fileSystem.ts';
import { hasEvent, windowsOf } from '../../model/goals.ts';
import type { DesktopState, NotepadState } from '../../model/state.ts';
import type { LessonStep } from '../harness/lesson.ts';
import type { SaveOpenLevel } from './level.ts';
import { strings } from './strings.ts';

function notepads(state: DesktopState): { id: string; app: NotepadState }[] {
  return windowsOf(state, 'notepad').flatMap((window) =>
    window.app.kind === 'notepad' ? [{ id: window.id, app: window.app }] : [],
  );
}

/**
 * Four steps: open the save dialog, name the note and save it (in the Notes folder at higher
 * difficulty), close the notepad, and open the note again.
 */
export function saveOpenSteps(level: SaveOpenLevel): LessonStep[] {
  const start = level.desktop.fs.nodes;
  const { folderId } = level;

  /**
   * The child's notes: notes saved during the round, or notes whose text changed, as when the
   * child chose to save over one. Neither depends on the name the child typed. With `asked`,
   * only the ones in the folder the round asks for.
   */
  const yours = (state: DesktopState, asked = false): string[] =>
    Object.values(state.fs.nodes).flatMap((node) => {
      if (node.kind !== 'note' || isTrashed(state.fs, node.id)) return [];
      const before = start[node.id];
      const changed = before === undefined || (before.kind === 'note' && before.text !== node.text);
      return changed && (!asked || folderId === null || node.parentId === folderId) ? [node.id] : [];
    });
  const isYours = (state: DesktopState, nodeId: string | null) => nodeId !== null && yours(state).includes(nodeId);

  const savePlace = (state: DesktopState): HighlightTarget => {
    const dialog = notepads(state).find(({ app }) => app.dialog?.mode === 'save-as')?.app.dialog;
    if (dialog === undefined || dialog === null) return { kind: 'menu', menu: 'file' };
    if (folderId !== null && dialog.folderId !== folderId) return { kind: 'key', key: `item:${folderId}` };
    return { kind: 'key', key: 'dialog:confirm' };
  };

  const findPlace = (state: DesktopState): HighlightTarget => {
    const open = notepads(state);
    if (open.length === 0) return { kind: 'icon', index: 0 };
    const dialog = open.find(({ app }) => app.dialog?.mode === 'open')?.app.dialog;
    if (dialog === undefined || dialog === null) return { kind: 'menu', menu: 'file' };
    if (isYours(state, dialog.selectedId)) return { kind: 'key', key: 'dialog:confirm' };
    const note = yours(state)
      .map((id) => state.fs.nodes[id])
      .find((node) => node !== undefined);
    if (note === undefined) return { kind: 'menu', menu: 'file' };
    if (note.parentId === dialog.folderId) return { kind: 'key', key: `item:${note.id}` };
    return { kind: 'key', key: `item:${note.parentId ?? ''}` };
  };

  return [
    {
      instruction: strings.save,
      done: (state) =>
        yours(state, true).length > 0 || notepads(state).some(({ app }) => app.dialog?.mode === 'save-as'),
      hint: () => ({ kind: 'menu', menu: 'file' }),
    },
    {
      instruction: folderId === null ? strings.name : strings.nameInNotes,
      done: (state) => yours(state, true).length > 0,
      // Saved, but in another folder than the one asked for.
      wrong: ({ events }) => hasEvent(events, 'file-saved'),
      hint: savePlace,
    },
    {
      instruction: strings.close,
      done: (state) => notepads(state).length === 0,
      hint: (state) => {
        const window = notepads(state)[0];
        return window === undefined ? null : { kind: 'window-control', windowId: window.id, control: 'close' };
      },
    },
    {
      instruction: strings.reopen,
      done: (state) => notepads(state).some(({ app }) => isYours(state, app.fileId)),
      wrong: ({ state, events }) => hasEvent(events, 'file-opened', (event) => !isYours(state, event.nodeId)),
      hint: findPlace,
    },
  ];
}
