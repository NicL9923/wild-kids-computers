import { useRef, type MouseEvent } from 'react';
import { toyClipboard } from '../../../../app/inputGuards.ts';
import { useCarry } from '../../../../activityShell/carry/useCarry.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t } from '../../../../core/strings/defineStrings.ts';
import type { CommandId } from '../../model/commands.ts';
import { explorerItems, type ExplorerAction } from '../../model/desktop.ts';
import { HOME_ID, isTrashed, TRASH_ID } from '../../model/fileSystem.ts';
import { isCommandEnabled } from '../../model/menus.ts';
import type { FileExplorerState } from '../../model/state.ts';
import { useDesktopContext } from '../desktopContext.ts';
import { ControlGlyph, type Glyph } from '../glyphs.tsx';
import { COMMAND_NAMES, nodeKindName, nodePicture } from '../labels.ts';
import { isHighlighted } from '../parts.ts';
import { strings } from '../strings.ts';
import { ToyTextField } from '../ToyTextField.tsx';
import { WindowNotice } from '../WindowNotice.tsx';

/** The tools above the list, and the picture each shows. */
const FOLDER_TOOLS: readonly { command: CommandId; glyph?: Glyph; emoji?: 'folder' | 'trash-can' }[] = [
  { command: 'go-up', glyph: 'up' },
  { command: 'new-folder', emoji: 'folder' },
  { command: 'rename' },
  { command: 'delete', emoji: 'trash-can' },
];
const TRASH_TOOLS: readonly { command: CommandId; glyph?: Glyph; emoji?: 'folder' | 'trash-can' }[] = [
  { command: 'go-up', glyph: 'up' },
  { command: 'restore' },
  { command: 'empty-trash', emoji: 'trash-can' },
];

/**
 * Folders and files. One click opens a folder here or a file in its app. Focus picks an item for
 * the tools above. An item moves with its grip: carry it onto a folder, Home, or the Trash, by
 * dragging or by a click to pick up and a click to place.
 */
export function FileExplorerApp({ windowId, app }: { readonly windowId: string; readonly app: FileExplorerState }) {
  const { desktop, kit, sayName, highlight, open, parts } = useDesktopContext();
  const { state, dispatch } = desktop;
  const items = explorerItems(state.fs, app);
  const inTrash = app.folderId === TRASH_ID || isTrashed(state.fs, app.folderId);
  const send = (action: ExplorerAction) => dispatch({ type: 'explorer', windowId, action });
  // The click that places an item lands on the folder or place under it. It puts the item there
  // and does nothing more, so a drop never also opens the folder. That click comes from the same
  // press as the drop: the drop marks it, and the next press clears the mark, so no timer decides
  // which input counts. A click from the keyboard has a detail of 0 and never places anything, so
  // Enter on a place right after a drop always opens it.
  const placingClick = useRef(false);
  const carry = useCarry<string, string>(kit, {
    kind: 'targets',
    accepts: (item, target) => item !== target,
    onDrop: (item, target) => {
      placingClick.current = true;
      send({ type: 'move', nodeId: item, toId: target });
    },
  });
  const unlessPlacing = (run: () => void) => (event: MouseEvent) => {
    if (!placingClick.current || event.detail === 0) run();
  };
  const searching = app.search.text.trim() !== '';
  const tools = (inTrash ? TRASH_TOOLS : FOLDER_TOOLS).filter(({ command }) => !parts.hiddenCommands.includes(command));

  return (
    <div
      className='td-explorer'
      onPointerDownCapture={() => {
        placingClick.current = false;
      }}
    >
      <div className='td-toolbar' role='toolbar' aria-label={t(strings.fileExplorer)}>
        {tools.map(({ command, glyph, emoji }) => (
          <button
            key={command}
            type='button'
            className='td-tool td-tool-text'
            data-explorer-command={command}
            data-highlight={isHighlighted(highlight, { kind: 'command', command })}
            disabled={!isCommandEnabled(state, windowId, command, toyClipboard)}
            {...sayName(COMMAND_NAMES[command])}
            onClick={() => dispatch({ type: 'command', windowId, command })}
          >
            {glyph !== undefined && <ControlGlyph glyph={glyph} />}
            {emoji !== undefined && <Emoji id={emoji} decorative className='td-tool-picture' />}
            {t(COMMAND_NAMES[command])}
          </button>
        ))}
        <div className='td-search' data-highlight-key='search'>
          <ControlGlyph glyph='search' className='td-search-glyph' />
          <ToyTextField
            windowId={windowId}
            field='search'
            editor={app.search}
            label={t(strings.search)}
            className='td-text-input'
            onEscape={() => send({ type: 'clear-search' })}
          />
        </div>
      </div>
      <div className='td-explorer-main'>
        <nav className='td-places' aria-label={t(strings.places)}>
          {[
            { id: HOME_ID, label: strings.home, emoji: 'house' as const },
            { id: TRASH_ID, label: strings.trash, emoji: 'trash-can' as const },
          ].map((place) => (
            <button
              key={place.id}
              type='button'
              className='td-place'
              data-place={place.id}
              data-highlight-key={`place:${place.id}`}
              aria-current={app.folderId === place.id && !searching ? 'page' : undefined}
              {...carry.target(place.id)}
              {...sayName(place.label)}
              onClick={unlessPlacing(() => send({ type: 'open-node', nodeId: place.id }))}
            >
              <Emoji id={place.emoji} decorative className='td-place-picture' />
              {t(place.label)}
            </button>
          ))}
        </nav>
        <ul className='td-items' aria-label={t(strings.fileExplorer)}>
          {items.length === 0 && <li className='td-empty'>{t(searching ? strings.noMatches : strings.emptyFolder)}</li>}
          {items.map((node) => {
            const selected = node.id === app.selectedId;
            const renaming = app.rename?.nodeId === node.id ? app.rename : null;
            const { style: gripStyle, onPointerDown: gripDown, ...grip } = carry.item(node.id);
            return (
              <li
                key={node.id}
                className='td-item'
                data-item={node.name}
                data-selected={selected}
                data-carried={grip['data-carried']}
                style={{ translate: gripStyle.translate, pointerEvents: gripStyle.pointerEvents }}
                {...(node.kind === 'folder' ? carry.target(node.id) : {})}
              >
                {renaming === null ? (
                  <button
                    type='button'
                    className='td-item-open'
                    data-highlight-key={`item:${node.id}`}
                    onFocus={() => {
                      if (!selected) send({ type: 'select', nodeId: node.id });
                    }}
                    onClick={unlessPlacing(() => {
                      // Nothing in the trash opens, so a click there picks the item for Restore.
                      if (inTrash) send({ type: 'select', nodeId: node.id });
                      else if (node.kind === 'folder') send({ type: 'open-node', nodeId: node.id });
                      else open({ type: 'open-file', fileId: node.id });
                    })}
                  >
                    <Emoji id={nodePicture(node)} decorative className='td-item-picture' />
                    <span className='td-item-name' id={`${windowId}-${node.id}-name`}>
                      {node.name}
                    </span>
                    <span className='wk-visually-hidden'>{t(nodeKindName(node))}</span>
                    {selected && <ControlGlyph glyph='check' className='td-item-check' />}
                  </button>
                ) : (
                  <div className='td-item-open' data-renaming>
                    <Emoji id={nodePicture(node)} decorative className='td-item-picture' />
                    <ToyTextField
                      windowId={windowId}
                      field='rename'
                      editor={renaming.field}
                      label={t(strings.name)}
                      className='td-text-input td-rename'
                      focusOnMount
                      onEnter={() => send({ type: 'commit-rename' })}
                      onEscape={() => send({ type: 'cancel-rename' })}
                    />
                  </div>
                )}
                {!inTrash && renaming === null && (
                  <button
                    type='button'
                    {...grip}
                    onPointerDown={(event) => {
                      if (!selected) send({ type: 'select', nodeId: node.id });
                      gripDown(event);
                    }}
                    style={{ touchAction: 'none' }}
                    className='td-item-grip'
                    data-highlight-key={`move:${node.id}`}
                    aria-labelledby={`${windowId}-move ${windowId}-${node.id}-name`}
                    {...sayName(strings.moveItem)}
                  >
                    <span className='td-grip-dots' aria-hidden='true' />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <span id={`${windowId}-move`} hidden>
        {t(strings.moveItem)}
      </span>
      <WindowNotice windowId={windowId} />
    </div>
  );
}
