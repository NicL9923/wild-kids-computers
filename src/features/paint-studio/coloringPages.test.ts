import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  checkColoringSource,
  mapRegions,
  MIN_STROKE_WIDTH,
  readSourceHash,
  REGION_RULES,
  sourceHash,
  SPECK_AREA,
  type RegionMap,
} from '../../../tools/coloringPages.ts';
import { rgba } from '../../core/paint/color.ts';
import { createDocument, DOCUMENT_HEIGHT, DOCUMENT_WIDTH, MASK_WALL_ALPHA } from '../../core/paint/document.ts';
import { History } from '../../core/paint/history.ts';
import { startStroke } from '../../core/paint/session.ts';
import { surfaceFromData, type Surface } from '../../core/paint/surface.ts';
import { testSettings } from '../../core/paint/testing/golden.ts';
import fill from '../../core/paint/tools/fill/index.ts';
import type { Band } from '../../core/bands.ts';
import { defineColoringPage, type ColoringPage, type PagePoint } from './coloringPage.ts';

/**
 * "Fill respects the lines", page by page. Every sample point of every page is filled with the
 * real fill tool on the real mask, and the fill must stay in its own region. A gap in an outline
 * lets the paint run into the paper or a neighbor, which these tests catch.
 */

const root = process.cwd();
const ASSETS = path.join(root, 'assets/coloring');
const modules = import.meta.glob<{ default: ColoringPage }>(['./coloringPages/*.ts', '!./coloringPages/strings.ts'], {
  eager: true,
});
const entries = Object.entries(modules).map(([file, module]) => ({
  file: path.basename(file, '.ts'),
  page: module.default,
}));
const pages = entries.map((entry) => entry.page);

const camel = (id: string): string => id.replace(/-([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());

function loadMask(id: string): { surface: Surface; alpha: Uint8Array; bytes: Buffer } {
  const bytes = readFileSync(path.join(ASSETS, `${id}.png`));
  const png = PNG.sync.read(bytes);
  const alpha = new Uint8Array(png.width * png.height);
  for (let p = 0; p < alpha.length; p++) alpha[p] = png.data[p * 4 + 3] ?? 0;
  return { surface: surfaceFromData(png.width, png.height, png.data), alpha, bytes };
}

const PAINT = rgba(240, 120, 30);

function isPaper(data: Uint8ClampedArray, point: PagePoint): boolean {
  const i = (point.y * DOCUMENT_WIDTH + point.x) * 4;
  return data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255 && data[i + 3] === 255;
}

interface FillResult {
  painted: number;
  reachedEdge: boolean;
  touched: PagePoint[];
}

/** Fills from one point, measures what changed, and puts every pixel back. */
function fillFrom(history: History, point: PagePoint, others: readonly PagePoint[]): FillResult {
  const doc = history.doc;
  const stroke = startStroke(history, fill, testSettings({ color: PAINT }));
  const rect = stroke.begin(point);
  const data = doc.paint.data;
  let painted = 0;
  let reachedEdge = false;
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      if (isPaper(data, { x, y })) continue;
      painted += 1;
      if (x === 0 || y === 0 || x === DOCUMENT_WIDTH - 1 || y === DOCUMENT_HEIGHT - 1) reachedEdge = true;
    }
  }
  const touched = others.filter((other) => !isPaper(data, other));
  stroke.cancel();
  return { painted, reachedEdge, touched };
}

function regionAt(map: RegionMap, point: PagePoint): number {
  return map.labels[point.y * DOCUMENT_WIDTH + point.x] ?? 0;
}

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

describe.each(pages)('coloring page $id', (page) => {
  const band = page.bands[0] ?? 'band-3-5';

  it('has a source that follows the line art rules for its youngest band', () => {
    const svg = readFileSync(path.join(ASSETS, 'src', `${page.id}.svg`), 'utf8');
    expect(checkColoringSource(svg, MIN_STROKE_WIDTH[band])).toEqual([]);
  });

  it('has a mask rendered from the current source', () => {
    const svg = readFileSync(path.join(ASSETS, 'src', `${page.id}.svg`), 'utf8');
    const { surface, bytes } = loadMask(page.id);
    expect([surface.width, surface.height]).toEqual([DOCUMENT_WIDTH, DOCUMENT_HEIGHT]);
    // A stale hash means the SVG changed after the mask was made. Run npm run coloring:render.
    expect(readSourceHash(bytes)).toBe(sourceHash(svg));
  });

  it('keeps every fill inside its own region', () => {
    const { surface, alpha } = loadMask(page.id);
    const map = mapRegions(DOCUMENT_WIDTH, DOCUMENT_HEIGHT, alpha, MASK_WALL_ALPHA);
    const doc = createDocument();
    doc.mask = surface;
    const history = new History(doc);

    // The paper is the one region that reaches the page edge, and the background point is on it.
    const edgeRegions = map.regions.flatMap((region, i) => (region.touchesEdge ? [i + 1] : []));
    expect(edgeRegions).toEqual([regionAt(map, page.background)]);

    // Every region big enough to see has exactly one sample point, and every point is in a region.
    const labels = page.regions.map((point) => regionAt(map, point));
    expect(labels, 'a sample point sits on a line').not.toContain(0);
    expect(new Set(labels).size, 'two sample points share a region').toBe(labels.length);
    const unsampled = map.regions.flatMap((region, i) =>
      !region.touchesEdge && region.area >= SPECK_AREA && !labels.includes(i + 1) ? [region.center] : [],
    );
    expect(unsampled, 'regions with no sample point').toEqual([]);

    // The band's size rules: how many regions, and how small one may be.
    const rules = REGION_RULES[band];
    expect(page.regions.length).toBeGreaterThanOrEqual(rules.fewest);
    expect(page.regions.length).toBeLessThanOrEqual(rules.most);
    const tooSmall = labels.flatMap((label, i) =>
      (map.regions[label - 1]?.inscribed ?? 0) < rules.minAcross ? [page.regions[i]] : [],
    );
    expect(tooSmall, `regions narrower than ${rules.minAcross} px`).toEqual([]);

    // The proof: fill from each point with the real tool.
    page.regions.forEach((point, i) => {
      const region = map.regions[(labels[i] ?? 0) - 1];
      const others = [page.background, ...page.regions.filter((_, j) => j !== i)];
      const result = fillFrom(history, point, others);
      const where = `fill from (${point.x}, ${point.y})`;
      expect(result.reachedEdge, `${where} reached the page edge`).toBe(false);
      expect(result.touched, `${where} ran into other regions`).toEqual([]);
      // The fill covers its region and grows one pixel under the line around it, and no more.
      expect(result.painted, `${where} painted more than its region`).toBeLessThanOrEqual(
        (region?.area ?? 0) + (region?.rim ?? 0),
      );
      expect(result.painted, `${where} painted nothing`).toBeGreaterThanOrEqual(region?.area ?? 1);
    });

    // Filling the paper leaves every region of the drawing untouched.
    const background = fillFrom(history, page.background, page.regions);
    expect(background.touched, 'the background fill ran into the drawing').toEqual([]);
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
