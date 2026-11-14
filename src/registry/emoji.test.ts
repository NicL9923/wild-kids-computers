import { describe, expect, it } from 'vitest';
import { strings as emojiNames } from '../core/strings/shared/emoji.ts';
import { bundledEmojiIds, emojiIdFromPath, emojiUrl } from './emoji.ts';

describe('emoji registry', () => {
  it('has a file for every emoji id and an id for every file', () => {
    expect(bundledEmojiIds).toEqual(Object.keys(emojiNames).toSorted());
  });

  it('gives each id its own file URL', () => {
    expect(emojiUrl('elephant')).toMatch(/elephant\.svg/);
    expect(emojiUrl('computer-mouse')).not.toBe(emojiUrl('mouse'));
  });

  it('fails loudly for an id with no file', () => {
    // Reflect.apply stands in for an id that slipped past the type, such as one read from saved data.
    expect(() => Reflect.apply(emojiUrl, undefined, ['not-an-emoji'])).toThrow(
      /No bundled file for emoji "not-an-emoji"/,
    );
  });

  it('reads the id from a file path', () => {
    expect(emojiIdFromPath('/assets/emoji/hot-dog.svg')).toBe('hot-dog');
  });
});
