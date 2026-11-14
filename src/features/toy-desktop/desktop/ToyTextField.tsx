import { useLayoutEffect, useRef, type KeyboardEvent, type SyntheticEvent } from 'react';
import type { TextFieldId } from '../model/fields.ts';
import type { CaretMove, TextEditOp, TextEditorState } from '../model/textEditor.ts';
import { useDesktopContext } from './desktopContext.ts';
import { textEdit } from './textDiff.ts';

export interface ToyTextFieldProps {
  readonly windowId: string;
  readonly field: TextFieldId;
  readonly editor: TextEditorState;
  /** The accessible name. Pass text from t(). */
  readonly label: string;
  readonly className?: string;
  /** Enter in a one-line field, such as saving from the name field. */
  readonly onEnter?: () => void;
  readonly onEscape?: () => void;
  /** Takes keyboard focus when it appears, such as a name field that opens for typing. */
  readonly focusOnMount?: boolean;
}

type TextControl = HTMLTextAreaElement | HTMLInputElement;

const ARROWS: Readonly<Record<string, CaretMove>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'line-start',
  End: 'line-end',
};

/** The caret move for a key, or null. The primary modifier with Home or End goes to either end. */
function caretMove(event: KeyboardEvent, mac: boolean): CaretMove | null {
  const primary = mac ? event.metaKey : event.ctrlKey;
  if (event.altKey) return null;
  if (primary) {
    if (event.key === 'Home' || (mac && event.key === 'ArrowUp')) return 'text-start';
    if (event.key === 'End' || (mac && event.key === 'ArrowDown')) return 'text-end';
    if (mac && event.key === 'ArrowLeft') return 'line-start';
    if (mac && event.key === 'ArrowRight') return 'line-end';
    return null;
  }
  if (event.ctrlKey || event.metaKey) return null;
  return ARROWS[event.key] ?? null;
}

/** True for a key that types one character: a letter, digit, mark, space, or emoji. */
function isTypedKey(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey && Array.from(event.key).length === 1;
}

/**
 * A real text box whose text, caret, and selection live in the model. Each key becomes a model
 * operation, so typing, Backspace, Delete, the arrows, Shift selection, and undo behave the same
 * everywhere and every change is an event a lesson can see. Edits the browser makes on its own,
 * such as an input method or the app's clipboard guard, are replayed through the model too.
 * Shortcuts with the primary modifier go up to the desktop, which runs the menu command.
 */
export function ToyTextField({
  windowId,
  field,
  editor,
  label,
  className,
  onEnter,
  onEscape,
  focusOnMount,
}: ToyTextFieldProps) {
  const { desktop, os } = useDesktopContext();
  const ref = useRef<TextControl | null>(null);
  const composing = useRef(false);
  const mac = os === 'mac';

  const send = (op: TextEditOp) => desktop.dispatch({ type: 'text', windowId, field, op });

  // Keep the box's selection where the model says, whenever the box has focus.
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || element.ownerDocument.activeElement !== element || composing.current) return;
    const start = Math.min(editor.anchor, editor.caret);
    const end = Math.max(editor.anchor, editor.caret);
    const direction = editor.anchor > editor.caret ? 'backward' : 'forward';
    if (element.selectionStart !== start || element.selectionEnd !== end) {
      element.setSelectionRange(start, end, direction);
    }
  });

  useLayoutEffect(() => {
    if (focusOnMount === true) ref.current?.focus();
  }, [focusOnMount]);

  function onKeyDown(event: KeyboardEvent<TextControl>): void {
    if (composing.current || event.nativeEvent.isComposing) return;
    let op: TextEditOp | null = null;
    const move = caretMove(event, mac);
    if (move !== null) op = { type: 'move', move, extend: event.shiftKey };
    else if (event.key === 'Backspace' && !event.ctrlKey && !event.metaKey) op = { type: 'backspace' };
    else if (event.key === 'Delete' && !event.ctrlKey && !event.metaKey) op = { type: 'delete' };
    else if (event.key === 'Enter') {
      if (!editor.multiline) {
        event.preventDefault();
        event.stopPropagation();
        onEnter?.();
        return;
      }
      op = { type: 'insert', text: '\n' };
    } else if (event.key === 'Escape' && onEscape !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    } else if (isTypedKey(event)) op = { type: 'insert', text: event.key };
    if (op === null) return;
    event.preventDefault();
    event.stopPropagation();
    send(op);
  }

  /** A selection made with the pointer, or by the browser. */
  function onSelect(event: SyntheticEvent<TextControl>): void {
    const element = event.currentTarget;
    if (composing.current) return;
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? start;
    const backward = element.selectionDirection === 'backward';
    const anchor = backward ? end : start;
    const caret = backward ? start : end;
    if (anchor !== editor.anchor || caret !== editor.caret) send({ type: 'select', anchor, caret });
  }

  /** An edit the model did not make, such as a paste routed by the clipboard guard. */
  function reconcile(element: TextControl): void {
    const edit = textEdit(editor.text, element.value);
    if (edit === null) return;
    send({ type: 'select', anchor: edit.start, caret: edit.end });
    send(edit.insert === '' ? { type: 'delete' } : { type: 'insert', text: edit.insert });
  }

  const shared = {
    className,
    value: editor.text,
    'aria-label': label,
    spellCheck: false,
    autoComplete: 'off',
    autoCapitalize: 'off',
    onKeyDown,
    onSelect,
    onChange: (event: SyntheticEvent<TextControl>) => {
      if (!composing.current) reconcile(event.currentTarget);
    },
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (event: SyntheticEvent<TextControl>) => {
      composing.current = false;
      reconcile(event.currentTarget);
    },
    'data-text-field': field,
  };

  return editor.multiline ? (
    <textarea
      {...shared}
      ref={(element) => {
        ref.current = element;
      }}
    />
  ) : (
    <input
      {...shared}
      type='text'
      ref={(element) => {
        ref.current = element;
      }}
    />
  );
}
