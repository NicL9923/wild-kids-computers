/** Which text field in a window the keyboard and the edit commands work on. */
import type { AppState } from './state.ts';
import type { TextEditorState } from './textEditor.ts';

const TEXT_FIELDS = ['document', 'file-name', 'search', 'rename', 'computer-name'] as const;
export type TextFieldId = (typeof TEXT_FIELDS)[number];

/** The editor behind a field, or undefined when the app has no such field right now. */
export function getField(app: AppState, field: TextFieldId): TextEditorState | undefined {
  switch (field) {
    case 'document':
      return app.kind === 'notepad' ? app.editor : undefined;
    case 'file-name':
      return 'dialog' in app && app.dialog?.mode === 'save-as' ? app.dialog.name : undefined;
    case 'search':
      return app.kind === 'file-explorer' ? app.search : undefined;
    case 'rename':
      return app.kind === 'file-explorer' ? app.rename?.field : undefined;
    // 'computer-name', the last case.
    default:
      return app.kind === 'settings' ? app.nameField : undefined;
  }
}

/** Returns the app with a field's editor replaced. The field must exist; see `getField`. */
export function setField(app: AppState, field: TextFieldId, editor: TextEditorState): AppState {
  if (field === 'document' && app.kind === 'notepad') return { ...app, editor };
  if (field === 'file-name' && 'dialog' in app && app.dialog !== null) {
    // Changing the name drops a pending replace question. Moving the caret does not.
    const replaceId = editor.text === app.dialog.name.text ? app.dialog.replaceId : null;
    return { ...app, dialog: { ...app.dialog, name: editor, replaceId } };
  }
  if (field === 'search' && app.kind === 'file-explorer') return { ...app, search: editor };
  if (field === 'rename' && app.kind === 'file-explorer' && app.rename !== null) {
    return { ...app, rename: { ...app.rename, field: editor } };
  }
  if (field === 'computer-name' && app.kind === 'settings') return { ...app, nameField: editor };
  return app;
}

/**
 * The field the edit commands (undo, cut, copy, paste, select all) work on: a dialog's name
 * field while a save dialog is open, the name being typed in a rename, and otherwise the app's
 * main field. Null when the window has none.
 */
export function activeField(app: AppState): TextFieldId | null {
  if ('dialog' in app && app.dialog !== null) return app.dialog.mode === 'save-as' ? 'file-name' : null;
  switch (app.kind) {
    case 'notepad':
      return 'document';
    case 'file-explorer':
      return app.rename === null ? 'search' : 'rename';
    case 'settings':
      return 'computer-name';
    default:
      return null;
  }
}
