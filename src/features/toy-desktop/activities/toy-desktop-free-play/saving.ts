/**
 * The free-play desktop as it is saved. Undo history and playback are not saved: a loaded desktop
 * starts with empty history and the music box stopped, so they would only make the file bigger.
 * Up to eight notepads with a hundred undo steps each could pass the document size limit.
 */
import { createEditor, type TextEditorState } from '../../model/textEditor.ts';
import type { AppState, DesktopState } from '../../model/state.ts';
import { GALLERY_PICTURE_PREFIX } from '../../desktop/labels.ts';
import { createFolder, HOME_ID, nodeAtPath, saveNewFile } from '../../model/fileSystem.ts';
import { uniqueName } from '../../model/names.ts';

function withoutHistory(editor: TextEditorState): TextEditorState {
  const fresh = createEditor({ text: editor.text, multiline: editor.multiline, maxLength: editor.maxLength });
  return { ...fresh, anchor: editor.anchor, caret: editor.caret };
}

function appForSaving(app: AppState): AppState {
  switch (app.kind) {
    case 'notepad':
      return {
        ...app,
        editor: withoutHistory(app.editor),
        dialog: app.dialog === null ? null : { ...app.dialog, name: withoutHistory(app.dialog.name) },
      };
    case 'music-box':
      return { ...app, playing: false, position: 0, undo: [], redo: [] };
    case 'file-explorer':
      return {
        ...app,
        search: withoutHistory(app.search),
        rename: app.rename === null ? null : { ...app.rename, field: withoutHistory(app.rename.field) },
      };
    case 'settings':
      return { ...app, nameField: withoutHistory(app.nameField) };
    default:
      return app;
  }
}

export function forSaving(state: DesktopState): DesktopState {
  return { ...state, windows: state.windows.map((window) => ({ ...window, app: appForSaving(window.app) })) };
}

/** The folder that holds the child's paintings. A file system name, like "New folder", not interface text. */
export const PAINTINGS_FOLDER = 'Paintings';
const PAINTING_NAME = 'Painting';

/** A picture id the toy file system accepts: short, lowercase, starting with a letter. */
const PICTURE_ID = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * Adds the child's gallery paintings to the Paintings folder, so the picture viewer can show
 * them. A painting already in the toy file system, even in the trash, is not added again. The
 * state is unchanged when there is nothing new or no room.
 */
export function withPaintings(state: DesktopState, galleryIds: readonly string[]): DesktopState {
  const known = new Set(
    Object.values(state.fs.nodes).flatMap((node) => (node.kind === 'picture' ? [node.pictureId] : [])),
  );
  const fresh = galleryIds
    .map((id) => `${GALLERY_PICTURE_PREFIX}${id}`)
    .filter((pictureId) => PICTURE_ID.test(pictureId) && !known.has(pictureId));
  if (fresh.length === 0) return state;
  let next = state;
  let folder = nodeAtPath(next.fs, PAINTINGS_FOLDER);
  if (folder?.kind !== 'folder') {
    const made = createFolder(
      next.fs,
      HOME_ID,
      uniqueName(
        PAINTINGS_FOLDER,
        Object.values(next.fs.nodes)
          .filter((node) => node.parentId === HOME_ID)
          .map((node) => node.name),
      ),
      `n${String(next.nextId)}`,
    );
    if (!made.ok) return state;
    next = { ...next, fs: made.fs, nextId: next.nextId + 1 };
    folder = made.node;
  }
  const folderId = folder.id;
  for (const pictureId of fresh) {
    const siblings = Object.values(next.fs.nodes)
      .filter((node) => node.parentId === folderId)
      .map((node) => node.name);
    const saved = saveNewFile(
      next.fs,
      folderId,
      uniqueName(PAINTING_NAME, siblings),
      { kind: 'picture', pictureId },
      `n${String(next.nextId)}`,
    );
    if (!saved.ok) break;
    next = { ...next, fs: saved.fs, nextId: next.nextId + 1 };
  }
  return next;
}
