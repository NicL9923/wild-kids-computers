import { Emoji } from '../../../components/ui/Emoji.tsx';
import { t } from '../../../core/strings/defineStrings.ts';
import type { DialogAction } from '../model/desktop.ts';
import { getNode, HOME_ID, listFolder, type FileKind } from '../model/fileSystem.ts';
import type { AppKind, WindowState } from '../model/state.ts';
import { useDesktopContext } from './desktopContext.ts';
import { ControlGlyph } from './glyphs.tsx';
import { nodeKindName, nodePicture } from './labels.ts';
import { strings } from './strings.ts';
import { ToyTextField } from './ToyTextField.tsx';
import { WindowNotice } from './WindowNotice.tsx';

/** Dialogs sit above every window, since each belongs to the window that asked. */
const DIALOG_LAYER = 20;

const FILE_KIND: Readonly<Partial<Record<AppKind, FileKind>>> = {
  notepad: 'note',
  'picture-viewer': 'picture',
  'music-box': 'tune',
};

/**
 * The save and open dialog of a window, in the middle of the desktop and big enough for its list,
 * whatever the size of the window that opened it. Folders open with one click; a file is picked with
 * one click and then confirmed. Save as asks before it replaces a file with the same name.
 */
export function FileDialogView({ window, layer }: { readonly window: WindowState; readonly layer: number }) {
  const { desktop, sayName } = useDesktopContext();
  const { app } = window;
  if (!('dialog' in app) || app.dialog === null) return null;
  const dialog = app.dialog;
  const windowId = window.id;
  const kind = FILE_KIND[app.kind];
  const folder = getNode(desktop.state.fs, dialog.folderId);
  const items = listFolder(desktop.state.fs, dialog.folderId).filter(
    (node) => node.kind === 'folder' || node.kind === kind,
  );
  const run = (action: DialogAction) => desktop.dispatch({ type: 'dialog', windowId, action });
  const saving = dialog.mode === 'save-as';
  const headingId = `${windowId}-dialog-heading`;

  return (
    <dialog
      open
      className='td-dialog'
      aria-labelledby={headingId}
      data-file-dialog={dialog.mode}
      data-dialog-window={windowId}
      style={{ zIndex: DIALOG_LAYER + layer }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        run({ type: 'cancel' });
      }}
    >
      <h2 id={headingId} className='td-dialog-heading'>
        {t(saving ? strings.saveAs : strings.open)}
      </h2>
      <div className='td-dialog-places'>
        <button
          type='button'
          className='td-tool'
          aria-label={t(strings.goUp)}
          disabled={dialog.folderId === HOME_ID}
          {...sayName(strings.goUp)}
          onClick={() => run({ type: 'go-up' })}
        >
          <ControlGlyph glyph='up' />
        </button>
        <button
          type='button'
          className='td-tool td-tool-text'
          data-dialog-home
          {...sayName(strings.home)}
          onClick={() => run({ type: 'open-folder', folderId: HOME_ID })}
        >
          <Emoji id='house' decorative className='td-tool-picture' />
          {t(strings.home)}
        </button>
        <span className='td-dialog-folder'>
          <Emoji id='open-folder' decorative className='td-tool-picture' />
          {dialog.folderId === HOME_ID ? t(strings.home) : folder?.name}
        </span>
      </div>
      <ul className='td-dialog-list' aria-label={folder?.name ?? t(strings.home)}>
        {items.length === 0 && <li className='td-empty'>{t(strings.emptyFolder)}</li>}
        {items.map((node) => (
          <li key={node.id}>
            <button
              type='button'
              className='td-list-item'
              data-dialog-item={node.name}
              data-highlight-key={`item:${node.id}`}
              aria-pressed={node.id === dialog.selectedId}
              onClick={() => run({ type: 'select', nodeId: node.id })}
            >
              <Emoji id={nodePicture(node)} decorative className='td-list-picture' />
              <span className='td-list-name'>{node.name}</span>
              <span className='wk-visually-hidden'>{t(nodeKindName(node))}</span>
            </button>
          </li>
        ))}
      </ul>
      {saving && (
        <div className='td-dialog-name'>
          <span className='td-field-label'>{t(strings.name)}</span>
          <ToyTextField
            windowId={windowId}
            field='file-name'
            editor={dialog.name}
            label={t(strings.name)}
            className='td-text-input'
            focusOnMount
            onEnter={() => run({ type: 'confirm' })}
            onEscape={() => run({ type: 'cancel' })}
          />
        </div>
      )}
      <WindowNotice windowId={windowId} />
      {dialog.replaceId !== null && <output className='td-dialog-question'>{t(strings.replaceQuestion)}</output>}
      <div className='td-dialog-actions'>
        <button
          type='button'
          className='wk-button'
          data-dialog-action='cancel'
          {...sayName(strings.cancel)}
          onClick={() => run({ type: 'cancel' })}
        >
          {t(strings.cancel)}
        </button>
        <button
          type='button'
          className='wk-button'
          data-variant='primary'
          data-dialog-action='confirm'
          data-highlight-key='dialog:confirm'
          disabled={!saving && dialog.selectedId === null}
          {...sayName(saving ? (dialog.replaceId === null ? strings.save : strings.replace) : strings.open)}
          onClick={() => run({ type: 'confirm' })}
        >
          {t(saving ? (dialog.replaceId === null ? strings.save : strings.replace) : strings.open)}
        </button>
      </div>
    </dialog>
  );
}
