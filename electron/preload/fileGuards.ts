/**
 * Guards the preload installs before any page script runs, so no file from the system reaches
 * the page. The main process stops the file chooser itself (electron/main/fileChooserBlock.ts);
 * these cover the other ways a file comes in, and give the chooser a second layer.
 */

/**
 * Makes `showPicker()` refuse on a file input. It runs in the page's own world, so it must not use
 * anything from this module: contextBridge sends its source text, not the function.
 */
export function refuseFileShowPicker(): void {
  const prototype = HTMLInputElement.prototype;
  const original: unknown = Reflect.get(prototype, 'showPicker');
  if (typeof original !== 'function') return;
  Object.defineProperty(prototype, 'showPicker', {
    configurable: false,
    enumerable: true,
    writable: false,
    value: function showPicker(this: HTMLInputElement): void {
      if (this.type === 'file') throw new DOMException('The app opens no file chooser.', 'NotAllowedError');
      Reflect.apply(original, this, []);
    },
  });
}

function carriesFiles(data: DataTransfer | null): boolean {
  return data !== null && (data.types.includes('Files') || data.files.length > 0);
}

/** Refuses a drag that carries files, with no drop effect, so the drop never happens. */
function refuseFileDrag(event: Event): void {
  if (!(event instanceof DragEvent) || !carriesFiles(event.dataTransfer)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'none';
}

/**
 * Stops a drag or paste that carries files from another program before the page hears it. The
 * listeners go on the window in the capture phase before any page script runs, so they are the
 * first to see each event, and stopping it there keeps every page listener from seeing it.
 *
 * - A file drag is refused with no drop effect, so the drop never happens.
 * - A paste with files on the system clipboard is replaced by an empty paste on the same target.
 *   The app's paste reads the toy clipboard and never the event's data, so the child's paste
 *   still works when an adult has copied a file in another program.
 */
export function installFileGuards(target: Window): void {
  const capture = { capture: true };
  for (const type of ['dragenter', 'dragover', 'drop']) target.addEventListener(type, refuseFileDrag, capture);

  target.addEventListener(
    'paste',
    (event) => {
      if (!carriesFiles(event.clipboardData)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const pasteTarget = event.composedPath()[0] ?? event.target;
      pasteTarget?.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          composed: true,
          clipboardData: new DataTransfer(),
        }),
      );
    },
    capture,
  );
}
