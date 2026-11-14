/** Which text field in a window the keyboard and the edit commands work on. */
import type { AppState } from './state.ts';
import type { TextEditorState } from './textEditor.ts';

export type TextFieldId = 'document' | 'file-name' | 'search' | 'rename' | 'computer-name';

interface FieldAccess {
  editor: TextEditorState;
  /** The app with this field's editor replaced. */
  set: (editor: TextEditorState) => AppState;
}

/** The editor behind a field and a way to replace it, or undefined when the app has no such field now. */
export function fieldAccess(app: AppState, field: TextFieldId): FieldAccess | undefined {
  switch (field) {
    case 'document':
      return app.kind === 'notepad' ? { editor: app.editor, set: (editor) => ({ ...app, editor }) } : undefined;
    case 'file-name': {
      if (!('dialog' in app) || app.dialog?.mode !== 'save-as') return undefined;
      const dialog = app.dialog;
      return {
        editor: dialog.name,
        // Changing the name drops a pending replace question. Moving the caret does not.
        set: (editor) => ({
          ...app,
          dialog: { ...dialog, name: editor, replaceId: editor.text === dialog.name.text ? dialog.replaceId : null },
        }),
      };
    }
    case 'search':
      return app.kind === 'file-explorer'
        ? { editor: app.search, set: (editor) => ({ ...app, search: editor }) }
        : undefined;
    case 'rename': {
      if (app.kind !== 'file-explorer' || app.rename === null) return undefined;
      const rename = app.rename;
      return { editor: rename.field, set: (editor) => ({ ...app, rename: { ...rename, field: editor } }) };
    }
    // 'computer-name', the last case.
    default:
      return app.kind === 'settings'
        ? { editor: app.nameField, set: (editor) => ({ ...app, nameField: editor }) }
        : undefined;
  }
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
