import { describe, expect, it } from 'vitest';
import type { OsFamily } from '../../src/core/platform/bridge.ts';
import { blockedShortcut, type KeyInput } from './shortcuts.ts';

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({
  key: k,
  code: mods.code ?? '',
  control: false,
  meta: false,
  alt: false,
  shift: false,
  ...mods,
});

describe('blockedShortcut', () => {
  it.each<[string, OsFamily, KeyInput, string]>([
    ['Ctrl+R', 'windows', key('r', { control: true }), 'reload'],
    ['Ctrl+Shift+R', 'linux', key('R', { control: true, shift: true }), 'reload'],
    ['Cmd+R', 'mac', key('r', { meta: true }), 'reload'],
    ['F5', 'linux', key('F5'), 'reload'],
    ['Ctrl+F4', 'windows', key('F4', { control: true }), 'close'],
    ['Alt+F4', 'windows', key('F4', { alt: true }), 'close'],
    ['Cmd+Q', 'mac', key('q', { meta: true }), 'quit'],
    ['Ctrl+Q', 'linux', key('q', { control: true }), 'quit'],
    ['Ctrl+=', 'windows', key('=', { control: true }), 'zoom'],
    ['Ctrl+Shift++', 'linux', key('+', { control: true, shift: true }), 'zoom'],
    ['Ctrl+-', 'linux', key('-', { control: true }), 'zoom'],
    ['Ctrl+0', 'windows', key('0', { control: true }), 'zoom'],
    ['Ctrl+numpad plus', 'linux', key('+', { control: true, code: 'NumpadAdd' }), 'zoom'],
    ['Cmd+-', 'mac', key('-', { meta: true }), 'zoom'],
    ['F12', 'windows', key('F12'), 'devtools'],
    ['Ctrl+Shift+I', 'linux', key('I', { control: true, shift: true }), 'devtools'],
    ['Ctrl+Shift+J', 'windows', key('J', { control: true, shift: true }), 'devtools'],
    ['Ctrl+Shift+C', 'linux', key('C', { control: true, shift: true }), 'devtools'],
    ['Cmd+Alt+I, whose key is a dead character', 'mac', key('ˆ', { meta: true, alt: true, code: 'KeyI' }), 'devtools'],
  ])('blocks %s on %s', (_label, os, input, expected) => {
    expect(blockedShortcut(input, os)).toBe(expected);
  });

  it.each<[string, OsFamily, KeyInput]>([
    ['Ctrl+C, taught in the shortcut workshop', 'windows', key('c', { control: true })],
    ['Ctrl+V', 'linux', key('v', { control: true })],
    ['Ctrl+Z', 'linux', key('z', { control: true })],
    ['Ctrl+A', 'windows', key('a', { control: true })],
    ['Ctrl+S', 'windows', key('s', { control: true })],
    ['Cmd+C', 'mac', key('c', { meta: true })],
    ['Ctrl+R on a Mac, which is not the primary modifier', 'mac', key('r', { control: true })],
    ['Ctrl+Z on AZERTY, where Z sits on the W key', 'windows', key('z', { control: true, code: 'KeyW' })],
    ['Ctrl+W, the toy desktop Close', 'linux', key('w', { control: true })],
    ['Cmd+W', 'mac', key('w', { meta: true })],
    ['plain R', 'linux', key('r')],
    ['plain 0', 'linux', key('0')],
    ['F4 alone', 'windows', key('F4')],
    ['Ctrl+Shift+I on a Mac', 'mac', key('I', { control: true, shift: true })],
    ['Cmd+Alt+K', 'mac', key('˚', { meta: true, alt: true, code: 'KeyK' })],
  ])('lets %s through on %s', (_label, os, input) => {
    expect(blockedShortcut(input, os)).toBeNull();
  });
});
