/**
 * Root input handlers from "Keyboard and clipboard ownership" in docs/architecture.md.
 *
 * - Copy, cut, and paste go to an in-app toy clipboard and never touch the system clipboard.
 *   An adult's copied password cannot land in a toy app, and a child's text cannot leave.
 * - Every native drag is cancelled. Moving things uses the activity kit's useCarry, and a drop
 *   from another program would carry system data in. A drag out of the window would also leave
 *   a file on the desktop.
 * - A click on a file input is cancelled, so no system file chooser opens.
 */

/**
 * What the toy clipboard holds. Text for now; toy apps may add kinds.
 * @public
 */
export interface ToyClipboardContent {
  kind: 'text';
  text: string;
}

export interface ToyClipboard {
  read(): ToyClipboardContent | null;
  write(content: ToyClipboardContent): void;
  clear(): void;
  /** Called after every write or clear. Returns an unsubscribe function. */
  subscribe(listener: (content: ToyClipboardContent | null) => void): () => void;
}

export function createToyClipboard(): ToyClipboard {
  let content: ToyClipboardContent | null = null;
  const listeners = new Set<(content: ToyClipboardContent | null) => void>();
  const set = (next: ToyClipboardContent | null) => {
    content = next;
    for (const listener of listeners) listener(content);
  };
  return {
    read: () => content,
    write: (next) => set({ ...next }),
    clear: () => set(null),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * The app's one toy clipboard. Toy desktop apps and lessons read and write it.
 * @public
 */
export const toyClipboard: ToyClipboard = createToyClipboard();

type TextControl = HTMLInputElement | HTMLTextAreaElement;

const DRAG_EVENTS = ['dragstart', 'dragover', 'drop'] as const;

/**
 * A click on a file input, from the pointer, a label, the keyboard, or script, opens the
 * system's file chooser. Nothing in the app needs one, and a chooser is a system dialog outside
 * the bridge, so the click is cancelled before the input sees it.
 */
function cancelFileChooser(event: Event): void {
  if (event.target instanceof HTMLInputElement && event.target.type === 'file') event.preventDefault();
}

/** Input types whose value supports selection and setRangeText. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'password', '']);

function textControl(target: EventTarget | null): TextControl | null {
  if (target instanceof HTMLTextAreaElement) return target;
  if (target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type)) return target;
  return null;
}

function selectedText(doc: Document, control: TextControl | null): string {
  if (control !== null) {
    const start = control.selectionStart ?? 0;
    const end = control.selectionEnd ?? start;
    // A password field never gives its text up, as in every browser.
    return control.type === 'password' ? '' : control.value.slice(start, end);
  }
  return doc.getSelection()?.toString() ?? '';
}

function replaceSelection(control: TextControl, text: string, inputType: string): void {
  if (control.readOnly || control.disabled) return;
  const start = control.selectionStart ?? control.value.length;
  const end = control.selectionEnd ?? start;
  control.setRangeText(text, start, end, 'end');
  // setRangeText fires no input event. React and the toy apps listen for one.
  control.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data: text === '' ? null : text }));
}

function isEditableContent(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.isContentEditable;
}

function cancel(event: Event): void {
  event.preventDefault();
}

/**
 * Installs the handlers on the document in the capture phase, before any element sees the
 * event. Returns a function that removes them.
 */
export function installInputGuards(doc: Document, clipboard: ToyClipboard = toyClipboard): () => void {
  const onCopyOrCut = (event: ClipboardEvent) => {
    // Cancelling without setData leaves the system clipboard as it was.
    event.preventDefault();
    const control = textControl(event.target);
    const text = selectedText(doc, control);
    if (text !== '') clipboard.write({ kind: 'text', text });
    if (event.type !== 'cut' || text === '') return;
    if (control !== null) replaceSelection(control, '', 'deleteByCut');
    else if (isEditableContent(event.target)) doc.execCommand('delete');
  };

  const onPaste = (event: ClipboardEvent) => {
    // The event's clipboardData holds the system clipboard. It is never read.
    event.preventDefault();
    const content = clipboard.read();
    if (content === null) return;
    const control = textControl(event.target);
    if (control !== null) replaceSelection(control, content.text, 'insertFromPaste');
    else if (isEditableContent(event.target)) doc.execCommand('insertText', false, content.text);
  };

  const capture = { capture: true };
  doc.addEventListener('copy', onCopyOrCut, capture);
  doc.addEventListener('cut', onCopyOrCut, capture);
  doc.addEventListener('paste', onPaste, capture);
  for (const type of DRAG_EVENTS) doc.addEventListener(type, cancel, capture);
  doc.addEventListener('click', cancelFileChooser, capture);
  return () => {
    doc.removeEventListener('click', cancelFileChooser, capture);
    doc.removeEventListener('copy', onCopyOrCut, capture);
    doc.removeEventListener('cut', onCopyOrCut, capture);
    doc.removeEventListener('paste', onPaste, capture);
    for (const type of DRAG_EVENTS) doc.removeEventListener(type, cancel, capture);
  };
}
