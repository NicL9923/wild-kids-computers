import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { toyClipboard } from '../../../app/inputGuards.ts';
import { t } from '../../../core/strings/defineStrings.ts';
import type { MenuId } from '../model/appMenus.ts';
import { shortcutKeys, type CommandId, type Shortcut } from '../model/commands.ts';
import { menuBar } from '../model/menus.ts';
import { focusedWindow } from '../model/state.ts';
import { AppPicture } from './AppPicture.tsx';
import { useDesktopContext } from './desktopContext.ts';
import { APP_NAMES, COMMAND_NAMES, keyName, MENU_NAMES, MODIFIER_NAMES } from './labels.ts';
import { isHighlighted } from './parts.ts';
import { strings } from './strings.ts';
import { SystemSound } from './SystemSound.tsx';

/** The keys of a shortcut on this computer, such as "Ctrl" "S", drawn as key caps. */
function ShortcutKeys({ shortcut }: { readonly shortcut: Shortcut }) {
  const { os } = useDesktopContext();
  const { modifiers, key } = shortcutKeys(shortcut, os);
  const named = keyName(key);
  return (
    <span className='td-shortcut' data-shortcut>
      {modifiers.map((modifier) => (
        <kbd key={modifier} className='td-key'>
          {t(MODIFIER_NAMES[modifier])}
        </kbd>
      ))}
      <kbd className='td-key'>{named === null ? key : t(named)}</kbd>
    </span>
  );
}

/** The commands of the open menu, top to bottom. */
function menuItemsIn(bar: HTMLElement | null): HTMLButtonElement[] {
  return [...(bar?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
}

/**
 * The menus of the app in front, with every command, whether it can run now, and its shortcut.
 * Click a menu to open it, or use the arrow keys: down opens it, up and down move between
 * commands, left and right move between menus, Escape closes it.
 */
export function MenuBar() {
  const { desktop, kit, sayName, highlight, parts, focusContent } = useDesktopContext();
  const { state, dispatch } = desktop;
  const front = focusedWindow(state);
  const menus = (front === undefined ? [] : menuBar(state, front.id, toyClipboard)).map((menu) => ({
    ...menu,
    items: menu.items.filter((item) => !parts.hiddenCommands.includes(item.command)),
  }));
  // A menu belongs to one window. When another window comes forward, it is closed.
  const [opened, setOpened] = useState<{ menu: MenuId; windowId: string } | null>(null);
  const open = front !== undefined && opened?.windowId === front.id ? opened.menu : null;
  const setOpen = (menu: MenuId | null) =>
    setOpened(menu === null || front === undefined ? null : { menu, windowId: front.id });
  const buttons = useRef(new Map<MenuId, HTMLButtonElement>());
  const bar = useRef<HTMLFieldSetElement | null>(null);
  const focusFirst = useRef(false);

  useEffect(() => {
    if (opened === null) return undefined;
    return kit.scope.listen(document, 'pointerdown', (event: PointerEvent) => {
      if (event.target instanceof Node && bar.current?.contains(event.target)) return;
      setOpened(null);
    });
  }, [opened, kit.scope]);

  useEffect(() => {
    if (opened !== null && focusFirst.current) {
      focusFirst.current = false;
      menuItemsIn(bar.current)[0]?.focus();
    }
  }, [opened]);

  function openMenu(id: MenuId | null, withKeyboard: boolean): void {
    focusFirst.current = withKeyboard && id !== null;
    setOpen(id);
  }

  function shift(from: MenuId, by: number): void {
    const index = menus.findIndex((menu) => menu.id === from);
    const next = menus[(index + by + menus.length) % menus.length];
    if (next === undefined) return;
    buttons.current.get(next.id)?.focus();
    openMenu(next.id, true);
  }

  function onButtonKey(event: KeyboardEvent, id: MenuId): void {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openMenu(id, true);
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      const index = menus.findIndex((menu) => menu.id === id);
      const next = menus[(index + (event.key === 'ArrowRight' ? 1 : -1) + menus.length) % menus.length];
      if (next !== undefined) buttons.current.get(next.id)?.focus();
    } else if (event.key === 'Escape' && open !== null) {
      event.preventDefault();
      setOpen(null);
    }
  }

  function onItemKey(event: KeyboardEvent, id: MenuId, index: number): void {
    const items = menuItemsIn(bar.current);
    const count = items.length;
    const focusAt = (at: number) => items[(at + count) % count]?.focus();
    switch (event.key) {
      case 'ArrowDown':
        focusAt(index + 1);
        break;
      case 'ArrowUp':
        focusAt(index - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(count - 1);
        break;
      case 'ArrowRight':
        shift(id, 1);
        break;
      case 'ArrowLeft':
        shift(id, -1);
        break;
      case 'Escape':
        setOpen(null);
        buttons.current.get(id)?.focus();
        break;
      case 'Tab':
        setOpen(null);
        return;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  function run(command: CommandId, enabled: boolean): void {
    if (front === undefined || !enabled) return;
    setOpen(null);
    dispatch({ type: 'command', windowId: front.id, command });
    focusContent(front.id);
  }

  return (
    <fieldset className='td-menu-bar' ref={bar} data-menu-bar>
      <legend className='wk-visually-hidden'>{t(strings.menuBar)}</legend>
      {front === undefined ? (
        <span className='td-menu-app'>{state.settings.computerName}</span>
      ) : (
        <span className='td-menu-app'>
          <AppPicture app={front.app.kind} className='td-menu-app-picture' />
          {t(APP_NAMES[front.app.kind])}
        </span>
      )}
      {parts.menuBar &&
        menus.map((menu) => (
          <div key={menu.id} className='td-menu'>
            <button
              type='button'
              className='td-menu-button'
              data-menu={menu.id}
              data-highlight={isHighlighted(highlight, { kind: 'menu', menu: menu.id })}
              aria-haspopup='menu'
              aria-expanded={open === menu.id}
              ref={(element) => {
                if (element === null) buttons.current.delete(menu.id);
                else buttons.current.set(menu.id, element);
              }}
              {...sayName(MENU_NAMES[menu.id])}
              onClick={() => openMenu(open === menu.id ? null : menu.id, false)}
              onKeyDown={(event) => onButtonKey(event, menu.id)}
            >
              {t(MENU_NAMES[menu.id])}
            </button>
            {open === menu.id && (
              <ul className='td-menu-list' role='menu' aria-label={t(MENU_NAMES[menu.id])}>
                {menu.items.map((item, index) => (
                  <li key={item.command} role='none'>
                    <button
                      type='button'
                      role='menuitem'
                      className='td-menu-item'
                      data-command={item.command}
                      data-highlight={isHighlighted(highlight, { kind: 'command', command: item.command })}
                      aria-disabled={!item.enabled}
                      tabIndex={-1}
                      {...sayName(COMMAND_NAMES[item.command])}
                      onClick={() => run(item.command, item.enabled)}
                      onKeyDown={(event) => onItemKey(event, menu.id, index)}
                    >
                      <span className='td-menu-item-name'>{t(COMMAND_NAMES[item.command])}</span>
                      {item.shortcut !== null && <ShortcutKeys shortcut={item.shortcut} />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      {parts.systemSound && <SystemSound />}
    </fieldset>
  );
}
