import type { OsFamily } from '../../../core/platform/bridge.ts';
import { commandsForKey, type CommandId, type KeyPress } from '../../toy-desktop/model/commands.ts';
import type { CaretMove, TextOp } from '../../toy-desktop/model/textEditor.ts';

/**
 * Which editing operation a key press is in the computer skills editor: typing, Backspace,
 * Delete, the arrows with or without Shift, and the shortcuts for select all, copy, cut, paste,
 * undo, redo, and save, with the primary modifier of the child's own computer. The text model is
 * the toy desktop's, so text editing behaves the same in every activity.
 */

export type EditorKeyAction = { readonly kind: 'op'; readonly op: TextOp } | { readonly kind: 'save' };

const ARROWS: Readonly<Record<string, CaretMove>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'line-start',
  End: 'line-end',
};

/** The shortcuts the editor runs, as text operations. */
const COMMAND_OPS: Partial<Record<CommandId, TextOp>> = {
  'select-all': { type: 'select-all' },
  copy: { type: 'copy' },
  cut: { type: 'cut' },
  paste: { type: 'paste' },
  undo: { type: 'undo' },
  redo: { type: 'redo' },
};

function caretMove(press: KeyPress, os: OsFamily): CaretMove | null {
  const mac = os === 'mac';
  const primary = mac ? press.metaKey : press.ctrlKey;
  if (press.altKey) return null;
  if (primary) {
    if (press.key === 'Home' || (mac && press.key === 'ArrowUp')) return 'text-start';
    if (press.key === 'End' || (mac && press.key === 'ArrowDown')) return 'text-end';
    if (mac && press.key === 'ArrowLeft') return 'line-start';
    if (mac && press.key === 'ArrowRight') return 'line-end';
    return null;
  }
  if (press.ctrlKey || press.metaKey) return null;
  return ARROWS[press.key] ?? null;
}

/**
 * The action for a key press, or null for a key the editor leaves alone, such as Tab, which
 * moves focus, or a shortcut it does not have.
 */
export function editorKeyAction(press: KeyPress, os: OsFamily, multiline: boolean): EditorKeyAction | null {
  const move = caretMove(press, os);
  if (move !== null) return { kind: 'op', op: { type: 'move', move, extend: press.shiftKey } };
  const modified = press.ctrlKey || press.metaKey;
  if (modified) {
    const commands = commandsForKey(press, os);
    if (commands.includes('save')) return { kind: 'save' };
    const op = commands.map((command) => COMMAND_OPS[command]).find((found) => found !== undefined);
    return op === undefined ? null : { kind: 'op', op };
  }
  if (press.key === 'Backspace') return { kind: 'op', op: { type: 'backspace' } };
  if (press.key === 'Delete') return { kind: 'op', op: { type: 'delete' } };
  if (press.key === 'Enter') return multiline ? { kind: 'op', op: { type: 'insert', text: '\n' } } : null;
  if (!press.altKey && Array.from(press.key).length === 1)
    return { kind: 'op', op: { type: 'insert', text: press.key } };
  return null;
}
