import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
  type SyntheticEvent,
} from 'react';
import { toyClipboard } from '../../../app/inputGuards.ts';
import type { OsFamily } from '../../../core/platform/bridge.ts';
import { textEdit } from '../../toy-desktop/desktop/textDiff.ts';
import {
  applyTextOp,
  type TextEditorState,
  type TextOp,
  type TextOpResult,
} from '../../toy-desktop/model/textEditor.ts';
import { editorKeyAction } from './editorKeys.ts';

/** What an activity can ask of the field from outside it. */
export interface EditorFieldHandle {
  /**
   * A key pressed while focus was somewhere else, such as on the replay control after a click.
   * The field takes focus and runs the key, so the child's key is never lost.
   */
  readonly takeKey: (event: KeyboardEvent) => void;
}

export interface EditorFieldProps {
  readonly editor: TextEditorState;
  readonly os: OsFamily;
  /** The accessible name. Pass text from t(). */
  readonly label: string;
  /** Every operation, with its result. The owner keeps `result.editor` as the new state. */
  readonly onEdit: (result: TextOpResult, op: TextOp) => void;
  /** The save shortcut. Leave out for an editor that has no saving. */
  readonly onSave?: () => void;
  readonly className?: string;
  readonly focusOnMount?: boolean;
  readonly handle?: Ref<EditorFieldHandle>;
}

type TextControl = HTMLTextAreaElement | HTMLInputElement;

/** Puts the box's selection where the model says. */
function showSelection(element: TextControl, model: TextEditorState): void {
  const start = Math.min(model.anchor, model.caret);
  const end = Math.max(model.anchor, model.caret);
  const direction = model.anchor > model.caret ? 'backward' : 'forward';
  if (element.selectionStart !== start || element.selectionEnd !== end) {
    element.setSelectionRange(start, end, direction);
  }
}

/**
 * A real text box whose text, caret, and selection live in the toy desktop's text model. Each
 * key becomes a model operation, so typing, Backspace, Delete, the arrows, Shift selection, and
 * the shortcuts behave as on a real computer, and copy, cut, and paste use the app's toy
 * clipboard only. A selection made with the pointer, and an edit the browser makes on its own,
 * such as a paste the app's clipboard guard put in, are replayed through the model too.
 */
export function EditorField({ editor, os, label, onEdit, onSave, className, focusOnMount, handle }: EditorFieldProps) {
  const ref = useRef<TextControl | null>(null);
  const composing = useRef(false);
  // Several operations can land before React renders again, such as a select and an insert.
  const latest = useRef(editor);
  useLayoutEffect(() => {
    latest.current = editor;
  });

  const run = (op: TextOp): void => {
    const result = applyTextOp(latest.current, op, toyClipboard);
    latest.current = result.editor;
    onEdit(result, op);
  };

  // Keep the box's selection where the model says, whenever the box has focus.
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null || element.ownerDocument.activeElement !== element || composing.current) return;
    showSelection(element, editor);
  });

  // Focus puts the browser's caret wherever it likes, so the model's selection goes back at once.
  useLayoutEffect(() => {
    const element = ref.current;
    if (focusOnMount !== true || element === null) return;
    element.focus();
    showSelection(element, latest.current);
  }, [focusOnMount]);

  /** Runs a key press. Returns false for a key the editor leaves alone. */
  function key(event: KeyboardEvent): boolean {
    const action = editorKeyAction(event, os, latest.current.multiline);
    if (action === null) return false;
    event.preventDefault();
    if (action.kind === 'save') onSave?.();
    else run(action.op);
    return true;
  }

  useImperativeHandle(handle, () => ({
    takeKey(event) {
      const element = ref.current;
      if (!key(event) || element === null) return;
      element.focus();
      showSelection(element, latest.current);
    },
  }));

  function onKeyDown(event: ReactKeyboardEvent<TextControl>): void {
    if (composing.current || event.nativeEvent.isComposing) return;
    key(event.nativeEvent);
  }

  /**
   * A selection made with the pointer, or by the browser. React also reports a select during a
   * key press, from the box as it was before the model's change renders, so this compares with the
   * rendered state, not the latest one.
   */
  function onSelect(event: SyntheticEvent<TextControl>): void {
    if (composing.current) return;
    const element = event.currentTarget;
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? start;
    const backward = element.selectionDirection === 'backward';
    const anchor = backward ? end : start;
    const caret = backward ? start : end;
    if (anchor !== editor.anchor || caret !== editor.caret) run({ type: 'select', anchor, caret });
  }

  /** An edit the model did not make, such as a paste the clipboard guard routed in. */
  function reconcile(element: TextControl): void {
    const edit = textEdit(latest.current.text, element.value);
    if (edit === null) return;
    run({ type: 'select', anchor: edit.start, caret: edit.end });
    run(edit.insert === '' ? { type: 'delete' } : { type: 'insert', text: edit.insert });
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
