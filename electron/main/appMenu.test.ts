import type { MenuItemConstructorOptions } from 'electron';
import { describe, expect, it } from 'vitest';
import { appMenuTemplate, type MenuCommand } from './appMenu.ts';

function editItems(template: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  const edit = template.at(-1);
  if (edit === undefined || !Array.isArray(edit.submenu)) throw new Error('No edit submenu');
  return edit.submenu;
}

function click(item: MenuItemConstructorOptions | undefined): void {
  if (item?.click === undefined) throw new Error(`${String(item?.label)} has no click handler`);
  // The handler takes the menu item, window, and event; the app's handler reads none of them.
  Reflect.apply(item.click, undefined, []);
}

describe('the macOS Edit menu', () => {
  it('sends undo and redo to the page, so the activity model handles them instead of the browser', () => {
    const sent: MenuCommand[] = [];
    const items = editItems(appMenuTemplate('mac', 'Wild Kids', (command) => sent.push(command)));
    const undo = items.find((item) => item.label === 'Undo');
    const redo = items.find((item) => item.label === 'Redo');
    expect([undo?.role, redo?.role]).toEqual([undefined, undefined]);
    expect([undo?.accelerator, redo?.accelerator]).toEqual(['Command+Z', 'Shift+Command+Z']);
    click(undo);
    click(redo);
    expect(sent).toEqual(['undo', 'redo']);
  });

  it('keeps the clipboard and select all roles, which fire the DOM events the app routes', () => {
    const items = editItems(appMenuTemplate('mac', 'Wild Kids', () => undefined));
    expect(items.flatMap((item) => (item.role === undefined ? [] : [item.role]))).toEqual([
      'cut',
      'copy',
      'paste',
      'selectAll',
    ]);
  });

  it('puts an empty app menu first, which macOS turns into the app menu', () => {
    expect(appMenuTemplate('mac', 'Wild Kids', () => undefined)[0]).toEqual({ label: 'Wild Kids', submenu: [] });
  });
});

describe('the menu on Windows and Linux', () => {
  it.each(['windows', 'linux'] as const)('on %s is the plain edit role, behind a hidden menu bar', (os) => {
    expect(appMenuTemplate(os, 'Wild Kids', () => undefined)).toEqual([{ role: 'editMenu' }]);
  });
});
