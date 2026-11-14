import { describe, expect, it } from 'vitest';
import { textEdit } from './textDiff.ts';

describe('textEdit', () => {
  it('finds nothing when the texts are the same', () => {
    expect(textEdit('fox', 'fox')).toBeNull();
  });

  it.each([
    ['an insertion', 'fox', 'fo x', { start: 2, end: 2, insert: ' ' }],
    ['a paste at the end', 'fox', 'foxes', { start: 3, end: 3, insert: 'es' }],
    ['a deletion', 'a fox', 'fox', { start: 0, end: 2, insert: '' }],
    ['a replacement', 'red fox', 'red owl', { start: 4, end: 7, insert: 'owl' }],
    ['a repeated letter', 'aa', 'aaa', { start: 2, end: 2, insert: 'a' }],
    ['everything gone', 'fox', '', { start: 0, end: 3, insert: '' }],
  ])('finds %s', (_label, before, after, edit) => {
    expect(textEdit(before, after)).toEqual(edit);
    // The table itself is right: applying each edit to the old text gives the new text.
    expect(before.slice(0, edit.start) + edit.insert + before.slice(edit.end)).toBe(after);
  });
});
