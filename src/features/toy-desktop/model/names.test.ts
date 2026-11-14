import { describe, expect, it } from 'vitest';
import { checkName, MAX_NAME_LENGTH, uniqueName } from './names.ts';

describe('checkName', () => {
  it.each([
    ['nothing', '', 'empty'],
    ['only spaces', '   ', 'empty'],
    ['one character too many', 'a'.repeat(MAX_NAME_LENGTH + 1), 'too-long'],
    ['a slash', 'Cats/Dogs', 'bad-character'],
    ['a backslash', 'Cats\\Dogs', 'bad-character'],
    ['a colon', 'Note: one', 'bad-character'],
    ['a star', 'Star*', 'bad-character'],
    ['a question mark', 'Why?', 'bad-character'],
    ['a double quote', 'My "best" note', 'bad-character'],
    ['angle brackets', '<fox>', 'bad-character'],
    ['a bar', 'a|b', 'bad-character'],
    ['a tab', 'a\tb', 'bad-character'],
    ['a delete control character', 'a\u007fb', 'bad-character'],
    ['one dot', '.', 'only-dots'],
    ['two dots', '..', 'only-dots'],
  ])('refuses %s', (_label, name, problem) => {
    expect(checkName(name, [])).toEqual({ ok: false, problem });
  });

  it('refuses a name already in the folder, ignoring capital letters', () => {
    expect(checkName('fox', ['Fox'])).toEqual({ ok: false, problem: 'duplicate' });
  });

  it('accepts a name that differs from a sibling only by an accent', () => {
    expect(checkName('café', ['Cafe'])).toEqual({ ok: true, name: 'café' });
  });

  it('trims spaces at either end and accepts the longest name', () => {
    const longest = 'b'.repeat(MAX_NAME_LENGTH);
    expect(checkName(`  ${longest}  `, [])).toEqual({ ok: true, name: longest });
  });

  it('counts an emoji as one character', () => {
    const name = `${'a'.repeat(MAX_NAME_LENGTH - 1)}🦊`;
    expect(checkName(name, [])).toEqual({ ok: true, name });
  });

  it('accepts dots inside a name and the characters around the refused ones', () => {
    expect(checkName('v1.2 - (draft) & more!', [])).toEqual({ ok: true, name: 'v1.2 - (draft) & more!' });
  });
});

describe('uniqueName', () => {
  it('keeps a free name', () => {
    expect(uniqueName('New folder', ['Pictures'])).toBe('New folder');
  });

  it('adds the next free number, ignoring capital letters', () => {
    expect(uniqueName('New folder', ['new folder', 'New folder 2'])).toBe('New folder 3');
  });

  it('shortens a long name so the number still fits', () => {
    const base = 'x'.repeat(MAX_NAME_LENGTH);
    const name = uniqueName(base, [base]);
    expect(name).toBe(`${'x'.repeat(MAX_NAME_LENGTH - 2)} 2`);
    expect(checkName(name, [base]).ok).toBe(true);
  });
});
