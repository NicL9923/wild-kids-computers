import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BANDS } from '../core/bands.ts';
import { strings as emojiNames } from '../core/strings/shared/emoji.ts';
import { defineStampCategory } from '../features/paint-studio/stampCategory.ts';
import { strings as categoryNames } from '../features/paint-studio/stamps/strings.ts';
import { coloringPages, coloringPagesFor } from './coloringPages.ts';
import { stampCategories, stampCategoryModules } from './stampCategories.ts';

describe('stamp category registry', () => {
  it('finds about ten categories, each named after its file, with unique orders', () => {
    expect(stampCategories.length).toBeGreaterThanOrEqual(8);
    expect(stampCategories.length).toBeLessThanOrEqual(12);
    for (const [file, module] of Object.entries(stampCategoryModules)) {
      expect(path.basename(file, '.ts')).toBe(module.default.id);
      // A copied file that kept another category's title would say the wrong name aloud.
      expect(module.default.title).toBe(Object.entries(categoryNames).find(([key]) => key === module.default.id)?.[1]);
    }
    expect(new Set(stampCategories.map((category) => category.order)).size).toBe(stampCategories.length);
  });

  it('uses only bundled emoji, each with a spoken name', () => {
    for (const category of stampCategories) {
      for (const stamp of [category.icon, ...category.stamps])
        expect(Object.hasOwn(emojiNames, stamp), stamp).toBe(true);
    }
  });

  it.each([
    [{ id: 'Sea-bugs' }, 'camelCase'],
    [{ id: 'seaBugs!' }, 'camelCase'],
    [{ order: -1 }, 'order must be a whole number'],
    [{ order: 1.5 }, 'order must be a whole number'],
    [{ stamps: [] }, 'has no stamps'],
    [{ stamps: ['cat', 'dog', 'cat'] }, 'lists "cat" twice'],
  ] as const)('rejects a bad category: %o', (change, reason) => {
    const good = { id: 'pets', order: 1, title: categoryNames.animals, icon: 'cat', stamps: ['cat', 'dog'] } as const;
    expect(() => defineStampCategory({ ...good, ...change })).toThrow(reason);
  });
});

describe('stamp category order', () => {
  it('accepts order zero', () => {
    expect(
      defineStampCategory({ id: 'first', order: 0, title: categoryNames.animals, icon: 'cat', stamps: ['cat'] }).order,
    ).toBe(0);
  });
});

describe('coloring page registry', () => {
  it('has all thirty pages, and gives every band pages to pick from', () => {
    expect(coloringPages).toHaveLength(30);
    for (const band of BANDS) expect(coloringPagesFor(band).length, band).toBeGreaterThanOrEqual(8);
  });
});
