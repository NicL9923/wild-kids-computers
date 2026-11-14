import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { expect } from 'vitest';
import { rgba } from '../color.ts';
import { createDocument, type PaintDocument } from '../document.ts';
import { parseGlyphTable, type GlyphTable } from '../glyphs.ts';
import { History } from '../history.ts';
import { Path } from '../path.ts';
import { fillPath } from '../raster.ts';
import round from '../tips/round.ts';
import { sin, TAU } from '../math.ts';
import { startStroke, type StrokePainter } from '../session.ts';
import { surfaceFromData, type Surface } from '../surface.ts';
import type { ToolPoint, ToolSettings } from '../types.ts';

/**
 * Golden image tests for the paint engine. Test-only: this folder is excluded from the app build.
 *
 * expectGolden compares a surface with src/core/paint/__goldens__/<name>.png exactly, after
 * decoding. `npm run paint:goldens` sets WKC_UPDATE_GOLDENS=1, which rewrites goldens whose
 * pixels changed. A failing comparison writes the actual image and a difference image to
 * test-results/paint/ for review.
 */

const root = process.cwd();
const GOLDEN_DIR = path.join(root, 'src/core/paint/__goldens__');
const FIXTURE_DIR = path.join(root, 'src/core/paint/__fixtures__');
const RESULT_DIR = path.join(root, 'test-results/paint');

// Goldens are exact, and Node ships the V8 build that runs the engine. A different Node version
// is a different test environment, so refuse to run rather than pass or fail by accident.
const pinnedNode = readFileSync(path.join(root, '.node-version'), 'utf8').trim();
if (process.versions.node !== pinnedNode) {
  throw new Error(
    `Paint goldens need Node ${pinnedNode} from .node-version, but this is Node ${process.versions.node}.`,
  );
}

/** Golden names are <kind>-<id> or <kind>-<id>-<variant>. The registry test reads them back. */
const GOLDEN_NAME = /^(tool|tip|effect)-[a-z][a-zA-Z0-9]*(-[a-z0-9-]+)?$/;

function decodePng(bytes: Buffer): Surface {
  const png = PNG.sync.read(bytes);
  return surfaceFromData(png.width, png.height, png.data);
}

function encodePng(surface: Surface): Buffer {
  const png = new PNG({ width: surface.width, height: surface.height });
  png.data.set(surface.data);
  return PNG.sync.write(png, { colorType: 6 });
}

export function loadFixture(name: string): Surface {
  return decodePng(readFileSync(path.join(FIXTURE_DIR, `${name}.png`)));
}

function differenceImage(expected: Surface, actual: Surface): Surface {
  const diff = surfaceFromData(actual.width, actual.height, actual.data);
  for (let i = 0; i < diff.data.length; i += 4) {
    const same =
      expected.data[i] === actual.data[i] &&
      expected.data[i + 1] === actual.data[i + 1] &&
      expected.data[i + 2] === actual.data[i + 2] &&
      expected.data[i + 3] === actual.data[i + 3];
    // Unchanged pixels fade to a light gray, changed ones turn solid magenta.
    diff.data.set(same ? [230, 230, 230, 255] : [255, 0, 255, 255], i);
  }
  return diff;
}

export function expectGolden(name: string, actual: Surface): void {
  if (!GOLDEN_NAME.test(name)) throw new Error(`Golden name "${name}" must look like tool-brush or tip-chalk-wide.`);
  const file = path.join(GOLDEN_DIR, `${name}.png`);
  const updating = process.env.WKC_UPDATE_GOLDENS === '1';
  const expected = existsSync(file) ? decodePng(readFileSync(file)) : null;
  const matches =
    expected !== null &&
    expected.width === actual.width &&
    expected.height === actual.height &&
    Buffer.from(expected.data).equals(Buffer.from(actual.data));
  if (matches) return;
  if (updating) {
    writeFileSync(file, encodePng(actual));
    return;
  }
  mkdirSync(RESULT_DIR, { recursive: true });
  writeFileSync(path.join(RESULT_DIR, `${name}.actual.png`), encodePng(actual));
  if (expected === null) {
    expect.fail(`No golden for ${name}. Run npm run paint:goldens, then look at ${name}.png before committing it.`);
  }
  if (expected.width !== actual.width || expected.height !== actual.height) {
    expect.fail(
      `${name} is ${actual.width} by ${actual.height}, but its golden is ${expected.width} by ${expected.height}.`,
    );
  }
  const diff = differenceImage(expected, actual);
  writeFileSync(path.join(RESULT_DIR, `${name}.diff.png`), encodePng(diff));
  let changed = 0;
  for (let i = 0; i < diff.data.length; i += 4) if (diff.data[i + 1] === 0) changed += 1;
  expect.fail(`${name} differs from its golden in ${changed} pixels. See test-results/paint/${name}.diff.png.`);
}

/** Runs one stroke through a fresh History: begin at the first point, move through the rest, end. */
export function drawStroke(
  history: History,
  painter: StrokePainter,
  settings: ToolSettings,
  points: readonly ToolPoint[],
): void {
  const [first, ...rest] = points;
  if (first === undefined) throw new Error('A stroke needs at least one point.');
  const stroke = startStroke(history, painter, settings);
  stroke.begin(first);
  for (const point of rest) stroke.move(point);
  stroke.end();
}

/** The size of a golden picture: small enough to keep goldens tiny, with the 16:10 shape of the real canvas. */
const GOLDEN_WIDTH = 200;
const GOLDEN_HEIGHT = 125;

/** One wave across a width by height area, a few pixels apart like pointer events. */
export function wave(width = GOLDEN_WIDTH, height = GOLDEN_HEIGHT, count = 48): ToolPoint[] {
  const points: ToolPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    points.push({ x: width * (0.12 + 0.76 * t), y: height * (0.5 - 0.28 * sin(t * TAU)) });
  }
  return points;
}

/** A golden-sized document with its history. */
export function newPicture(width = GOLDEN_WIDTH, height = GOLDEN_HEIGHT): { doc: PaintDocument; history: History } {
  const doc = createDocument(width, height);
  return { doc, history: new History(doc) };
}

export const BLUE = rgba(40, 90, 220);
export const ORANGE = rgba(245, 140, 30);

/** Tool settings for tests: a blue round brush 12 px wide, seed 1. */
export function testSettings(overrides: Partial<ToolSettings> = {}): ToolSettings {
  return { color: BLUE, size: 12, tip: round, seed: 1, ...overrides };
}

/** Six vertical color bands across the picture, so distort and color effects have something to work on. */
export function paintBands(doc: PaintDocument): void {
  const colors = [
    rgba(230, 60, 60),
    rgba(250, 200, 40),
    rgba(70, 180, 80),
    rgba(50, 160, 230),
    rgba(120, 80, 200),
    rgba(30, 30, 30),
  ];
  const band = doc.width / colors.length;
  colors.forEach((color, i) => {
    fillPath(
      doc.paint,
      new Path().polygon([i * band, 0, (i + 1) * band, 0, (i + 1) * band, doc.height, i * band, doc.height]),
      color,
    );
  });
}

/** The glyph table the text tool ships with. */
export function loadFont(): GlyphTable {
  return parseGlyphTable(
    JSON.parse(readFileSync(path.join(root, 'assets/paint-fonts/meadow-sans.glyphs.json'), 'utf8')),
  );
}

export { History };
