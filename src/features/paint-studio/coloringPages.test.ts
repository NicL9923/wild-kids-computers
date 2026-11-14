import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Band } from '../../core/bands.ts';
import { defineColoringPage, type ColoringPage } from './coloringPage.ts';
import { ASSETS, entries, pages } from './testing/coloringPageTests.ts';

/** The page list as a whole. Each page's own checks are in coloringPagesBand*.test.ts. */

const camel = (id: string): string => id.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());

describe('coloring page entries', () => {
  it('has thirty pages with unique ids and orders', () => {
    expect(pages).toHaveLength(30);
    expect(new Set(pages.map((page) => page.id)).size).toBe(pages.length);
    expect(new Set(pages.map((page) => page.order)).size).toBe(pages.length);
  });

  it('pairs every source and mask with an entry, and every entry with both files', () => {
    const ids = pages.map((page) => page.id).toSorted();
    const sources = readdirSync(path.join(ASSETS, 'src'))
      .filter((file) => file.endsWith('.svg'))
      .map((file) => file.slice(0, -4))
      .toSorted();
    const masks = readdirSync(ASSETS)
      .filter((file) => file.endsWith('.png'))
      .map((file) => file.slice(0, -4))
      .toSorted();
    expect(sources).toEqual(ids);
    expect(masks).toEqual(ids);
  });

  it.each(entries)('names $file after its id and points at its own files', ({ file, page }) => {
    expect(file).toBe(camel(page.id));
    expect(page.mask).toMatch(new RegExp(`assets/coloring/${page.id}\\.png(\\?no-inline)?$`));
    expect(page.thumbnail).toMatch(new RegExp(`assets/coloring/src/${page.id}\\.svg(\\?no-inline)?$`));
  });
});

describe('defineColoringPage', () => {
  const good: ColoringPage = {
    id: 'hot-air-balloon',
    order: 10,
    title: 'Hot air balloon',
    bands: ['band-3-5', 'band-6-8'],
    mask: 'mask.png',
    thumbnail: 'source.svg',
    background: { x: 0, y: 0 },
    regions: [{ x: 800, y: 500 }],
  };

  const unknownBands: readonly Band[] = JSON.parse('["band-1-2"]');

  it('returns a good definition unchanged', () => {
    expect(defineColoringPage(good)).toBe(good);
  });

  it.each([
    ['an id that is not kebab-case', { id: 'hotAirBalloon' }, /kebab-case/],
    ['an order below zero', { order: -1 }, /order must be a whole number/],
    ['an order that is not whole', { order: 1.5 }, /order must be a whole number/],
    ['an empty title', { title: '  ' }, /title is empty/],
    ['no bands', { bands: [] }, /at least one band/],
    // Saved or hand-written data can name a band the type system never saw.
    ['an unknown band', { bands: unknownBands }, /unknown band/],
    ['bands out of order', { bands: ['band-6-8', 'band-3-5'] }, /youngest first/],
    ['a repeated band', { bands: ['band-3-5', 'band-3-5'] }, /youngest first/],
    ['a background point off the page', { background: { x: 1600, y: 0 } }, /background point \(1600, 0\)/],
    ['a region point that is not whole', { regions: [{ x: 10.5, y: 4 }] }, /region point 0/],
    ['a region point above the page', { regions: [{ x: 10, y: -1 }] }, /region point 0/],
    ['no region points', { regions: [] }, /a point inside each region/],
  ] satisfies [string, Partial<ColoringPage>, RegExp][])('rejects %s', (_case, change, reason) => {
    expect(() => defineColoringPage({ ...good, ...change })).toThrow(reason);
  });
});
