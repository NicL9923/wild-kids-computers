import { describe, expect, it } from 'vitest';
import { judge } from './judge.ts';
import { typedChar } from './level.ts';

const press = (key: string, code: string, capsLock = false) => ({
  key,
  code,
  getModifierState: (name: 'CapsLock') => name === 'CapsLock' && capsLock,
});

describe('judge', () => {
  it.each([
    ['a capital with Shift', press('A', 'KeyA'), 'A', 'right'],
    ['a sign with Shift', press('!', 'Digit1'), '!', 'right'],
    ['a small letter in a word', press('e', 'KeyE'), 'e', 'right'],
    ['the letter key without Shift', press('a', 'KeyA'), 'A', 'no-shift'],
    ['the number key without Shift', press('1', 'Digit1'), '!', 'no-shift'],
    ['Shift held for a small letter', press('E', 'KeyE'), 'e', 'extra-shift'],
    ['a capital made with Caps Lock', press('A', 'KeyA', true), 'A', 'caps-lock'],
    ['Shift with Caps Lock on, which types a small letter', press('a', 'KeyA', true), 'A', 'caps-lock'],
    ['a sign with Caps Lock on, which Caps Lock does not change', press('!', 'Digit1', true), '!', 'right'],
    ['another key', press('B', 'KeyB'), 'A', 'other'],
    ['another key with Caps Lock on', press('B', 'KeyB', true), 'A', 'other'],
  ])('%s', (_name, event, char, kind) => {
    expect(judge(event, typedChar(char))).toBe(kind);
  });
});
