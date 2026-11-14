/**
 * What the reducer says happened. Lessons check goals against these and against the state; a
 * screen uses them for sound and spoken feedback. A refused action changes nothing and reports
 * one `rejected` event with a reason a screen can turn into a short, neutral sentence.
 */
import type { CalculatorProblem } from './apps/calculator.ts';
import type { SettingsProblem, ToySettings } from './apps/settingsPanel.ts';
import type { CommandId } from './commands.ts';
import type { TextFieldId } from './fields.ts';
import type { FileKind, FsProblem } from './fileSystem.ts';
import type { Rect, Size } from './geometry.ts';
import type { NameProblem } from './names.ts';
import type { AppKind } from './state.ts';

export type RejectReason =
  | NameProblem
  | FsProblem
  | SettingsProblem
  /** No window has that id. */
  | 'no-window'
  /** The action is for another kind of app, such as a calculator key sent to a notepad. */
  | 'wrong-app'
  /** The command is not in this app's menus, or cannot run now. See `isCommandEnabled`. */
  | 'command-disabled'
  /** `MAX_WINDOWS` windows are open already. */
  | 'too-many-windows'
  /** A minimized window cannot be moved, resized, restored to its size, or focused until it is restored. */
  | 'minimized'
  /** A maximized window cannot be resized until it is restored. */
  | 'maximized'
  /** The window has no such text field right now. */
  | 'no-text-field'
  /** The window has no dialog open. */
  | 'no-dialog'
  /** A save or open dialog is up, so the document under it takes no edits until it closes. */
  | 'dialog-open'
  /** Open needs a selected file first. */
  | 'nothing-selected'
  /** The item is a folder or a different kind of file than this app opens. */
  | 'not-a-file'
  /** Pasted text is not a number the calculator can show. */
  | 'not-a-number';

export type DesktopEvent =
  | { type: 'window-opened'; windowId: string; app: AppKind }
  | { type: 'window-closed'; windowId: string; app: AppKind; unsavedChanges: boolean }
  | { type: 'window-focused'; windowId: string }
  | { type: 'window-moved'; windowId: string; rect: Rect }
  /** `clamped` is true when the asked-for size was outside the limits. */
  | { type: 'window-resized'; windowId: string; rect: Rect; clamped: boolean }
  | { type: 'window-minimized'; windowId: string }
  /** A minimized window came back. */
  | { type: 'window-restored'; windowId: string }
  | { type: 'window-maximized'; windowId: string }
  | { type: 'window-unmaximized'; windowId: string }
  | { type: 'desktop-resized'; size: Size }
  | { type: 'command-run'; windowId: string; app: AppKind; command: CommandId }
  | { type: 'text-changed'; windowId: string; field: TextFieldId; text: string }
  | { type: 'copied'; windowId: string; text: string }
  | { type: 'cut'; windowId: string; text: string }
  | { type: 'pasted'; windowId: string; text: string }
  | { type: 'undone'; windowId: string }
  | { type: 'redone'; windowId: string }
  | { type: 'dialog-opened'; windowId: string; mode: 'save-as' | 'open' }
  | { type: 'dialog-closed'; windowId: string }
  /** A save dialog found a file with that name and waits for the child to confirm the replace. */
  | { type: 'replace-asked'; windowId: string; nodeId: string }
  | { type: 'folder-opened'; windowId: string; folderId: string }
  | { type: 'selection-changed'; windowId: string; nodeId: string | null }
  | { type: 'folder-created'; nodeId: string; parentId: string; name: string }
  | { type: 'rename-started'; windowId: string; nodeId: string }
  | { type: 'node-renamed'; nodeId: string; from: string; to: string }
  | { type: 'node-moved'; nodeId: string; fromId: string; toId: string }
  | { type: 'node-trashed'; nodeId: string; fromId: string }
  /** `renamedTo` is set when the old name was taken and the item got the next free one. */
  | { type: 'node-restored'; nodeId: string; toId: string; renamedTo: string | null }
  | { type: 'trash-emptied'; nodeIds: string[] }
  /** `how` is "new" for a new file, "update" for saving over its own file, "replace" for save-as over another. */
  | {
      type: 'file-saved';
      windowId: string;
      nodeId: string;
      folderId: string;
      kind: FileKind;
      how: 'new' | 'update' | 'replace';
    }
  | { type: 'file-opened'; windowId: string; nodeId: string }
  | { type: 'picture-shown'; windowId: string; nodeId: string }
  | { type: 'note-toggled'; windowId: string; step: number; note: number; on: boolean }
  | { type: 'tune-cleared'; windowId: string }
  | { type: 'playback-changed'; windowId: string; playing: boolean }
  /** A music box step sounds: the screen plays these notes now. */
  | { type: 'step-played'; windowId: string; step: number; notes: number[] }
  | { type: 'calculator-changed'; windowId: string; display: string; problem: CalculatorProblem | null }
  | { type: 'setting-changed'; setting: keyof ToySettings; value: string | number | boolean }
  | { type: 'volume-changed'; volume: number }
  | { type: 'mute-changed'; muted: boolean }
  | { type: 'rejected'; action: string; reason: RejectReason };

export type DesktopEventType = DesktopEvent['type'];
