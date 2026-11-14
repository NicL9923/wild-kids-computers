import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import {
  checkColoringSource,
  encodeMaskPng,
  MIN_STROKE_WIDTH,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  parseRenderArgs,
  readSourceHash,
  type RenderArgs,
  sourceHash,
} from './coloringPages.ts';

/**
 * Renders coloring page sources to line-art masks: npm run coloring:render
 *
 * Reads assets/coloring/src/<page-id>.svg and writes assets/coloring/<page-id>.png, a four-bit
 * palette PNG of black lines on a transparent page that records the hash of its source. Only
 * pages whose source changed are rendered, unless --all is given. The first run on a machine
 * may need `npx playwright install chromium`.
 *
 *   --all                 render every page, not only changed ones
 *   --preview <folder>    also write each page on white paper and a contact sheet, for review
 *   <page-id> ...         render only these pages
 */

const root = process.cwd();
const SOURCE_DIR = path.join(root, 'assets/coloring/src');
const MASK_DIR = path.join(root, 'assets/coloring');
const SHEET_COLUMNS = 5;
const SHEET_CELL = { width: 400, height: 250 };

const pageIds = readdirSync(SOURCE_DIR)
  .filter((file) => file.endsWith('.svg'))
  .map((file) => file.slice(0, -4));
let parsed: RenderArgs;
try {
  parsed = parseRenderArgs(process.argv.slice(2), pageIds);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
const { all, ids } = parsed;
const previewDir = parsed.previewDir === null ? null : path.resolve(parsed.previewDir);

// Bands are checked per page by the tests. Here every page must at least meet the thinnest band rule.
const floor = Math.min(...Object.values(MIN_STROKE_WIDTH));
let failed = false;
const sources = new Map<string, string>();
for (const id of ids) {
  const svg = readFileSync(path.join(SOURCE_DIR, `${id}.svg`), 'utf8');
  const problems = checkColoringSource(svg, floor);
  for (const problem of problems) console.error(`${id}.svg: ${problem.rule}: ${problem.detail}`);
  if (problems.length > 0) failed = true;
  sources.set(id, svg);
}
if (failed) process.exit(1);

const stale = ids.filter((id) => {
  if (all) return true;
  const mask = path.join(MASK_DIR, `${id}.png`);
  return !existsSync(mask) || readSourceHash(readFileSync(mask)) !== sourceHash(sources.get(id) ?? '');
});

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  // The drawing code runs in the page. It is a script here, not a function, so the Node project
  // that type checks tools/ does not need the DOM types.
  await page.setContent(`<!doctype html><script>
    window.renderAlpha = async (source, width, height) => {
      const image = new Image();
      image.src = 'data:image/svg+xml;base64,' + btoa(source);
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, width, height);
      const rgba = context.getImageData(0, 0, width, height).data;
      let out = '';
      for (let i = 3; i < rgba.length; i += 4) out += String.fromCharCode(rgba[i]);
      return btoa(out);
    };
  </script>`);
  for (const id of stale) {
    const svg = sources.get(id) ?? '';
    const alpha: unknown = await page.evaluate(`renderAlpha(${JSON.stringify(svg)}, ${PAGE_WIDTH}, ${PAGE_HEIGHT})`);
    if (typeof alpha !== 'string') throw new Error(`Rendering ${id} returned no pixels.`);
    const coverage = new Uint8Array(Buffer.from(alpha, 'base64'));
    const png = encodeMaskPng(PAGE_WIDTH, PAGE_HEIGHT, coverage, sourceHash(svg));
    writeFileSync(path.join(MASK_DIR, `${id}.png`), png);
    console.log(`${id}.png  ${(png.length / 1024).toFixed(1)} KiB`);
  }

  if (previewDir !== null) {
    mkdirSync(previewDir, { recursive: true });
    await page.setViewportSize({ width: PAGE_WIDTH, height: PAGE_HEIGHT });
    for (const id of ids) {
      await page.setContent(`<!doctype html><body style="margin:0;background:#fff">${sources.get(id) ?? ''}</body>`);
      await page.screenshot({
        path: path.join(previewDir, `${id}.png`),
        clip: { x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT },
      });
    }
    const rows = Math.ceil(ids.length / SHEET_COLUMNS);
    const cells = ids
      .map((id) => {
        const data = Buffer.from(sources.get(id) ?? '').toString('base64');
        return `<figure><img src="data:image/svg+xml;base64,${data}"><figcaption>${id}</figcaption></figure>`;
      })
      .join('');
    await page.setViewportSize({ width: SHEET_COLUMNS * SHEET_CELL.width, height: rows * (SHEET_CELL.height + 24) });
    await page.setContent(
      `<!doctype html><style>
        body{margin:0;display:grid;grid-template-columns:repeat(${SHEET_COLUMNS},${SHEET_CELL.width}px);background:#fff;font:16px sans-serif}
        figure{margin:0;border:1px solid #ccc}img{width:${SHEET_CELL.width - 2}px;height:${SHEET_CELL.height}px;display:block}
        figcaption{height:22px;text-align:center}
      </style>${cells}`,
    );
    await page.screenshot({ path: path.join(previewDir, 'contact-sheet.png'), fullPage: true });
    console.log(`Previews and contact-sheet.png in ${previewDir}`);
  }
} finally {
  await browser.close();
}
