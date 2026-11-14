import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EMOJI_SELECTION } from './emoji/selection.ts';
import {
  colorSvgPath,
  emojiIdFor,
  emojiStringsSource,
  looksTheSame,
  pixelDifference,
  resolveSelection,
} from './importEmoji.ts';

describe('emojiIdFor', () => {
  it.each([
    ['hot dog', 'hot-dog'],
    ['T. rex', 't-rex'],
    ['piñata', 'pinata'],
    ['yo-yo', 'yo-yo'],
    ['TV', 'tv'],
  ])('makes %j into %j', (name, id) => {
    expect(emojiIdFor(name)).toBe(id);
  });
});

describe('resolveSelection', () => {
  it('resolves the real selection to about 400 unique emoji', () => {
    const emoji = resolveSelection(EMOJI_SELECTION);
    expect(emoji.length).toBeGreaterThanOrEqual(380);
    expect(emoji.length).toBeLessThanOrEqual(420);
  });

  it('rejects two entries with one id', () => {
    expect(() => resolveSelection({ a: [['Dog', 'dog']], b: [['Dog face', 'dog']] })).toThrow(
      'Emoji id "dog" is used by Dog and Dog face.',
    );
  });

  it('rejects one upstream folder listed twice', () => {
    expect(() =>
      resolveSelection({
        a: [
          ['Dog', 'dog'],
          ['Dog', 'puppy'],
        ],
      }),
    ).toThrow('Upstream folder "Dog" is listed as dog and puppy.');
  });

  it('rejects an explicit id that is not kebab-case', () => {
    expect(() => resolveSelection({ a: [['Dog', 'dog', 'Dog_1']] })).toThrow(
      'Emoji id "Dog_1" for Dog is not kebab-case.',
    );
  });
});

describe('emojiStringsSource', () => {
  it('writes the names, the allow list, and the categories', () => {
    const source = emojiStringsSource(
      resolveSelection({ animals: [['Dog', 'dog']], sky: [['Star', 'star', 'star', ['star']]] }),
    );
    expect(source).toContain(`  'dog': { text: "dog" },`);
    expect(source).toContain(`  'star': { text: "star", allow: ['star'] },`);
    expect(source).toContain(`  animals: ['dog'],`);
  });
});

describe('pixelDifference and looksTheSame', () => {
  it('accepts identical renders and a one-pixel edge shift', () => {
    const a = new Uint8Array(4000).fill(100);
    const b = a.slice();
    b[0] = 255;
    expect(looksTheSame(pixelDifference(a, a))).toBe(true);
    expect(looksTheSame(pixelDifference(a, b))).toBe(true);
  });

  it('rejects a render that changed a visible area', () => {
    const a = new Uint8Array(4000).fill(100);
    const b = a.slice().fill(200, 0, 400);
    expect(looksTheSame(pixelDifference(a, b))).toBe(false);
  });

  it('rejects renders of different sizes', () => {
    expect(pixelDifference(new Uint8Array(4), new Uint8Array(8))).toEqual({ mean: 255, visibleShare: 1 });
  });
});

describe('colorSvgPath', () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('finds a plain Color SVG and a Default-tone one, and fails when neither exists', () => {
    root = mkdtempSync(path.join(os.tmpdir(), 'wkc-emoji-'));
    mkdirSync(path.join(root, 'Fox', 'Color'), { recursive: true });
    writeFileSync(path.join(root, 'Fox', 'Color', 'fox_color.svg'), '<svg/>');
    mkdirSync(path.join(root, 'Baby', 'Default', 'Color'), { recursive: true });
    writeFileSync(path.join(root, 'Baby', 'Default', 'Color', 'baby_color_default.svg'), '<svg/>');

    expect(colorSvgPath(root, 'Fox')).toBe(path.join(root, 'Fox', 'Color', 'fox_color.svg'));
    expect(colorSvgPath(root, 'Baby')).toBe(path.join(root, 'Baby', 'Default', 'Color', 'baby_color_default.svg'));
    expect(() => colorSvgPath(root, 'Owl')).toThrow(/No single Color SVG for "Owl"/);
  });
});
