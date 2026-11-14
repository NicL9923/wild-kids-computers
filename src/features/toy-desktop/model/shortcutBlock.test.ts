import { describe, expect, it } from 'vitest';
import { blockedShortcut } from '../../../../electron/main/shortcuts.ts';
import { SHORTCUTS } from './commands.ts';

// The toy desktop teaches the conventions of a real computer. A shortcut its menus show must reach
// the page on every system, or the menu would promise a key that the main process swallows.
describe('toy desktop shortcuts and the main-process shortcut block', () => {
  it.each(['mac', 'windows', 'linux'] as const)('lets every menu shortcut through on %s', (os) => {
    const blocked = Object.entries(SHORTCUTS).flatMap(([command, shortcut]) => {
      const reason = blockedShortcut(
        {
          key: shortcut.shift ? shortcut.key.toUpperCase() : shortcut.key.toLowerCase(),
          code: shortcut.key.length === 1 ? `Key${shortcut.key.toUpperCase()}` : shortcut.key,
          control: shortcut.primary && os !== 'mac',
          meta: shortcut.primary && os === 'mac',
          alt: false,
          shift: shortcut.shift,
        },
        os,
      );
      return reason === null ? [] : [`${command} (${reason})`];
    });
    expect(blocked).toEqual([]);
  });
});
