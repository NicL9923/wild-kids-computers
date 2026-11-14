import { describe, expect, it } from 'vitest';
import type { KeyPress } from '../../toy-desktop/model/commands.ts';
import { editorKeyAction } from './editorKeys.ts';

const press = (key: string, mods: Partial<Omit<KeyPress, 'key'>> = {}): KeyPress => ({
  key,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('editorKeyAction', () => {
  it.each([
    ['a letter types it', press('m'), 'linux', { kind: 'op', op: { type: 'insert', text: 'm' } }],
    ['a capital types it', press('M', { shiftKey: true }), 'linux', { kind: 'op', op: { type: 'insert', text: 'M' } }],
    ['Backspace', press('Backspace'), 'linux', { kind: 'op', op: { type: 'backspace' } }],
    ['Delete', press('Delete'), 'windows', { kind: 'op', op: { type: 'delete' } }],
    ['the left arrow', press('ArrowLeft'), 'linux', { kind: 'op', op: { type: 'move', move: 'left', extend: false } }],
    [
      'Shift and the right arrow grows the selection',
      press('ArrowRight', { shiftKey: true }),
      'linux',
      { kind: 'op', op: { type: 'move', move: 'right', extend: true } },
    ],
    ['Home', press('Home'), 'linux', { kind: 'op', op: { type: 'move', move: 'line-start', extend: false } }],
    ['End', press('End'), 'linux', { kind: 'op', op: { type: 'move', move: 'line-end', extend: false } }],
    ['the up arrow', press('ArrowUp'), 'linux', { kind: 'op', op: { type: 'move', move: 'up', extend: false } }],
    ['the down arrow', press('ArrowDown'), 'mac', { kind: 'op', op: { type: 'move', move: 'down', extend: false } }],
    [
      'Ctrl and Home on Linux',
      press('Home', { ctrlKey: true }),
      'linux',
      { kind: 'op', op: { type: 'move', move: 'text-start', extend: false } },
    ],
    [
      'Command and the down arrow on a Mac',
      press('ArrowDown', { metaKey: true }),
      'mac',
      { kind: 'op', op: { type: 'move', move: 'text-end', extend: false } },
    ],
    [
      'Command and the left arrow on a Mac',
      press('ArrowLeft', { metaKey: true }),
      'mac',
      { kind: 'op', op: { type: 'move', move: 'line-start', extend: false } },
    ],
    [
      'Command, Shift, and the right arrow on a Mac',
      press('ArrowRight', { metaKey: true, shiftKey: true }),
      'mac',
      { kind: 'op', op: { type: 'move', move: 'line-end', extend: true } },
    ],
    [
      'Ctrl and End on Windows',
      press('End', { ctrlKey: true }),
      'windows',
      { kind: 'op', op: { type: 'move', move: 'text-end', extend: false } },
    ],
    [
      'Command and the up arrow on a Mac',
      press('ArrowUp', { metaKey: true }),
      'mac',
      { kind: 'op', op: { type: 'move', move: 'text-start', extend: false } },
    ],
    ['Ctrl+A on Linux', press('a', { ctrlKey: true }), 'linux', { kind: 'op', op: { type: 'select-all' } }],
    ['Command+C on a Mac', press('c', { metaKey: true }), 'mac', { kind: 'op', op: { type: 'copy' } }],
    ['Ctrl+X', press('x', { ctrlKey: true }), 'windows', { kind: 'op', op: { type: 'cut' } }],
    ['Ctrl+V', press('v', { ctrlKey: true }), 'linux', { kind: 'op', op: { type: 'paste' } }],
    ['Ctrl+Z', press('z', { ctrlKey: true }), 'linux', { kind: 'op', op: { type: 'undo' } }],
    ['Ctrl+Shift+Z', press('Z', { ctrlKey: true, shiftKey: true }), 'linux', { kind: 'op', op: { type: 'redo' } }],
    ['Ctrl+Y on Windows', press('y', { ctrlKey: true }), 'windows', { kind: 'op', op: { type: 'redo' } }],
    ['Ctrl+S', press('s', { ctrlKey: true }), 'linux', { kind: 'save' }],
    ['Command+S on a Mac', press('s', { metaKey: true }), 'mac', { kind: 'save' }],
  ] as const)('%s', (_name, key, os, action) => {
    expect(editorKeyAction(key, os, false)).toEqual(action);
  });

  it.each([
    ['Tab, which moves focus', press('Tab'), 'linux'],
    ['Enter in a one-line field', press('Enter'), 'linux'],
    ['Ctrl+C on a Mac, which is not its copy', press('c', { ctrlKey: true }), 'mac'],
    ['Command+V on Windows', press('v', { metaKey: true }), 'windows'],
    ['Ctrl+Y on a Mac', press('y', { metaKey: true }), 'mac'],
    ['a shortcut the editor does not have', press('n', { ctrlKey: true }), 'linux'],
    ['Alt with a letter', press('a', { altKey: true }), 'linux'],
    ['Ctrl with an arrow on Linux', press('ArrowLeft', { ctrlKey: true }), 'linux'],
    ['the Windows key with an arrow', press('ArrowLeft', { metaKey: true }), 'windows'],
    ['Alt with an arrow', press('ArrowRight', { altKey: true }), 'linux'],
    ['Control with an arrow on a Mac', press('ArrowUp', { ctrlKey: true }), 'mac'],
    ['a key that types nothing', press('F2'), 'linux'],
  ] as const)('leaves %s alone', (_name, key, os) => {
    expect(editorKeyAction(key, os, false)).toBeNull();
  });

  it('types a line break with Enter in a field of several lines', () => {
    expect(editorKeyAction(press('Enter'), 'linux', true)).toEqual({ kind: 'op', op: { type: 'insert', text: '\n' } });
  });
});
