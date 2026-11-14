import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import type { Band } from '../src/core/bands.ts';

/**
 * Rules and file formats for coloring pages, shared by the render tool and the tests.
 *
 * A coloring page starts as an SVG line drawing in assets/coloring/src/<page-id>.svg. The render
 * tool turns it into a line-art mask, assets/coloring/<page-id>.png, which the app decodes at
 * runtime and the paint engine uses to bound the fill tool. The mask stores the SHA-256 of the
 * SVG it came from in a tEXt chunk, so a test fails when a source changes without a new mask.
 */

export const PAGE_WIDTH = 1600;
export const PAGE_HEIGHT = 1000;

/** The tEXt keyword that holds the source hash inside a mask PNG. */
export const SOURCE_HASH_KEYWORD = 'wkc-source-sha256';

/**
 * The thinnest line each band's pages may use, in page pixels. Young children need thick lines
 * that a slightly wide click cannot land on by accident, and that read clearly at thumbnail size.
 */
export const MIN_STROKE_WIDTH: Record<Band, number> = { 'band-3-5': 10, 'band-6-8': 6.5, 'band-9-12': 4.5 };

/**
 * How many regions a page for each band has, not counting the paper around the drawing, and how
 * small a region may be: the diameter of the largest disc that fits inside it, in page pixels.
 * A 3-year-old needs few, big regions that a slightly wide click still hits.
 */
export const REGION_RULES: Record<Band, { fewest: number; most: number; minAcross: number }> = {
  'band-3-5': { fewest: 4, most: 8, minAcross: 90 },
  'band-6-8': { fewest: 10, most: 20, minAcross: 30 },
  'band-9-12': { fewest: 20, most: 40, minAcross: 16 },
};

/**
 * Regions smaller than this many pixels are specks where lines meet, too small to see or click.
 * Every larger region needs a sample point in its page entry.
 */
export const SPECK_AREA = 100;

/** Mask alpha is stored in this many even steps, so a pixel takes four bits. */
export const MASK_LEVELS = 16;

// ---------------------------------------------------------------------------------------------
// SVG source rules

const DRAWABLE = new Set(['path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect']);
const CONTAINERS = new Set(['svg', 'g']);

/** Every attribute a source may use. Anything else, such as style, class, or a dash array, is refused. */
const ALLOWED_ATTRIBUTES = new Set([
  'xmlns',
  'width',
  'height',
  'viewBox',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'transform',
]);

const BLACK = new Set(['#000', '#000000', 'black']);

/**
 * A transform may move, turn, or mirror, but never resize, because resizing would change the
 * drawn width of a line and hide it from the stroke width rule.
 */
const TRANSFORM_STEP = /\s*(translate|rotate|scale)\(([^)]*)\)\s*/y;

export interface RenderArgs {
  /** Render every selected page, not only those whose source changed. */
  all: boolean;
  /** Where to write previews, as given, or null for none. */
  previewDir: string | null;
  /** The pages to consider, sorted. Every page when no id was named. */
  ids: string[];
}

/**
 * Reads the render tool's command line: `--all`, `--preview <folder>`, and page ids in any order.
 * Throws on an unknown option, a preview flag without a folder, or an id with no source, so a
 * typo never quietly renders every page or none.
 */
export function parseRenderArgs(args: readonly string[], pageIds: readonly string[]): RenderArgs {
  let all = false;
  let previewDir: string | null = null;
  const named: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--all') {
      all = true;
    } else if (arg === '--preview') {
      const folder = args[i + 1];
      if (folder === undefined || folder.startsWith('--')) throw new Error('--preview needs a folder.');
      previewDir = folder;
      i++;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      named.push(arg);
    }
  }
  const missing = named.filter((id) => !pageIds.includes(id));
  if (missing.length > 0) throw new Error(`No coloring page source for: ${missing.join(', ')}`);
  const ids = (named.length === 0 ? [...pageIds] : pageIds.filter((id) => named.includes(id))).toSorted();
  return { all, previewDir, ids };
}

export interface SourceProblem {
  rule: string;
  detail: string;
}

interface Style {
  fill: string;
  stroke: string;
  strokeWidth: number;
  linecap: string;
  linejoin: string;
}

/** SVG defaults: black fill, no stroke. A source has to say fill="none" and stroke="#000" itself. */
const SVG_DEFAULT_STYLE: Style = { fill: 'black', stroke: 'none', strokeWidth: 1, linecap: 'butt', linejoin: 'miter' };

interface Tag {
  kind: 'open' | 'close' | 'self';
  name: string;
  attributes: Map<string, string>;
}

const ATTRIBUTE = /\s*([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*"([^"]*)"/y;

function parseAttributes(text: string, problems: SourceProblem[]): Map<string, string> {
  const attributes = new Map<string, string>();
  let at = 0;
  while (at < text.length) {
    if (text.slice(at).trim() === '') break;
    ATTRIBUTE.lastIndex = at;
    const match = ATTRIBUTE.exec(text);
    if (match === null) {
      problems.push({ rule: 'syntax', detail: `Cannot read the attributes "${text.trim()}".` });
      break;
    }
    attributes.set(match[1] ?? '', match[2] ?? '');
    at = ATTRIBUTE.lastIndex;
  }
  return attributes;
}

function tokenize(svg: string, problems: SourceProblem[]): Tag[] {
  const tags: Tag[] = [];
  let at = 0;
  while (at < svg.length) {
    const open = svg.indexOf('<', at);
    const between = (open === -1 ? svg.slice(at) : svg.slice(at, open)).trim();
    if (between !== '') problems.push({ rule: 'no-text', detail: `Text "${between.slice(0, 40)}" is not allowed.` });
    if (open === -1) break;
    if (svg.startsWith('<!--', open)) {
      const end = svg.indexOf('-->', open);
      if (end === -1) {
        problems.push({ rule: 'syntax', detail: 'A comment is never closed.' });
        break;
      }
      at = end + 3;
      continue;
    }
    const close = svg.indexOf('>', open);
    if (close === -1) {
      problems.push({ rule: 'syntax', detail: 'A tag is never closed.' });
      break;
    }
    const body = svg.slice(open + 1, close);
    at = close + 1;
    if (body.startsWith('?')) continue;
    if (body.startsWith('!')) {
      problems.push({ rule: 'syntax', detail: `"<${body.slice(0, 20)}" is not allowed.` });
      continue;
    }
    if (body.startsWith('/')) {
      tags.push({ kind: 'close', name: body.slice(1).trim(), attributes: new Map() });
      continue;
    }
    const self = body.endsWith('/');
    const inner = self ? body.slice(0, -1) : body;
    const name = /^[A-Za-z][-A-Za-z0-9]*/.exec(inner)?.[0] ?? '';
    tags.push({ kind: self ? 'self' : 'open', name, attributes: parseAttributes(inner.slice(name.length), problems) });
  }
  return tags;
}

function checkTransform(value: string, problems: SourceProblem[]): void {
  let at = 0;
  while (at < value.length) {
    TRANSFORM_STEP.lastIndex = at;
    const match = TRANSFORM_STEP.exec(value);
    if (match === null) {
      problems.push({ rule: 'transform', detail: `Transform "${value}" may only translate, rotate, or mirror.` });
      return;
    }
    if (match[1] === 'scale') {
      const factors = (match[2] ?? '').split(/[\s,]+/).filter((s) => s !== '');
      if (factors.length !== 2 || factors.some((f) => Math.abs(Number(f)) !== 1)) {
        problems.push({
          rule: 'transform',
          detail: `scale(${match[2]}) resizes lines. Only scale(-1 1) or scale(1 -1).`,
        });
      }
    }
    at = TRANSFORM_STEP.lastIndex;
  }
}

function styleOf(parent: Style, attributes: Map<string, string>, problems: SourceProblem[]): Style {
  const width = attributes.get('stroke-width');
  let strokeWidth = parent.strokeWidth;
  if (width !== undefined) {
    strokeWidth = Number(width);
    if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
      problems.push({ rule: 'stroke-width', detail: `stroke-width "${width}" is not a positive number.` });
    }
  }
  return {
    fill: attributes.get('fill') ?? parent.fill,
    stroke: attributes.get('stroke') ?? parent.stroke,
    strokeWidth,
    linecap: attributes.get('stroke-linecap') ?? parent.linecap,
    linejoin: attributes.get('stroke-linejoin') ?? parent.linejoin,
  };
}

/**
 * Checks one SVG source against the coloring page rules: 1600 by 1000, only shapes, black round
 * lines at least `minStrokeWidth` wide, no fill, no text, no gradient, no dashes, no images.
 * Returns every problem found, so one run lists them all.
 */
export function checkColoringSource(svg: string, minStrokeWidth: number): SourceProblem[] {
  const problems: SourceProblem[] = [];
  const tags = tokenize(svg, problems);
  const stack: { name: string; style: Style }[] = [];
  let drawables = 0;
  let sawRoot = false;
  for (const tag of tags) {
    if (tag.kind === 'close') {
      const top = stack.pop();
      if (top?.name !== tag.name) problems.push({ rule: 'syntax', detail: `</${tag.name}> closes nothing open.` });
      continue;
    }
    const where = `<${tag.name}>`;
    if (!DRAWABLE.has(tag.name) && !CONTAINERS.has(tag.name)) {
      problems.push({ rule: 'element', detail: `${where} is not allowed. Use only svg, g, and plain shapes.` });
    }
    if (tag.name === 'svg') {
      if (stack.length > 0 || sawRoot) problems.push({ rule: 'element', detail: 'Only one root <svg> is allowed.' });
      sawRoot = true;
      const size = [tag.attributes.get('width'), tag.attributes.get('height'), tag.attributes.get('viewBox')];
      if (
        size[0] !== String(PAGE_WIDTH) ||
        size[1] !== String(PAGE_HEIGHT) ||
        size[2] !== `0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}`
      ) {
        problems.push({
          rule: 'size',
          detail: `The root must say width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}".`,
        });
      }
    } else if (stack.length === 0) {
      problems.push({ rule: 'element', detail: `${where} sits outside the root <svg>.` });
    }
    for (const name of tag.attributes.keys()) {
      if (!ALLOWED_ATTRIBUTES.has(name))
        problems.push({ rule: 'attribute', detail: `${where} has "${name}", which is not allowed.` });
    }
    const transform = tag.attributes.get('transform');
    if (transform !== undefined) checkTransform(transform, problems);
    const style = styleOf(stack.at(-1)?.style ?? SVG_DEFAULT_STYLE, tag.attributes, problems);
    if (DRAWABLE.has(tag.name)) {
      drawables += 1;
      if (style.fill !== 'none')
        problems.push({ rule: 'no-fill', detail: `${where} has fill "${style.fill}". Lines only.` });
      if (!BLACK.has(style.stroke))
        problems.push({ rule: 'stroke', detail: `${where} has stroke "${style.stroke}". Use #000.` });
      if (style.strokeWidth < minStrokeWidth) {
        problems.push({
          rule: 'stroke-width',
          detail: `${where} has stroke-width ${style.strokeWidth}, under the ${minStrokeWidth} this page's bands need.`,
        });
      }
      if (style.linecap !== 'round' || style.linejoin !== 'round') {
        problems.push({ rule: 'round', detail: `${where} needs stroke-linecap="round" and stroke-linejoin="round".` });
      }
    }
    if (tag.kind === 'open') stack.push({ name: tag.name, style });
  }
  if (!sawRoot) problems.push({ rule: 'element', detail: 'There is no root <svg>.' });
  if (stack.length > 0) problems.push({ rule: 'syntax', detail: `<${stack.at(-1)?.name}> is never closed.` });
  if (sawRoot && drawables === 0) problems.push({ rule: 'element', detail: 'The drawing has no lines.' });
  return problems;
}

export function sourceHash(svg: string): string {
  return createHash('sha256').update(svg, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------------------------
// Mask PNG: four-bit palette, black at sixteen alpha levels

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Palette index for an alpha value: the nearest of the sixteen even levels. */
export function maskLevel(alpha: number): number {
  return Math.round((alpha * (MASK_LEVELS - 1)) / 255);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Encodes line-art coverage (one alpha byte per pixel) as a four-bit palette PNG whose colors
 * are all black, with alpha from the tRNS chunk. Any PNG decoder returns black lines on a
 * transparent page. Each row takes the filter with the smallest sum, the usual heuristic.
 */
export function encodeMaskPng(width: number, height: number, alpha: Uint8Array, sourceSha256: string): Buffer {
  if (alpha.length !== width * height)
    throw new RangeError(`Expected ${width * height} alpha values, got ${alpha.length}.`);
  const stride = Math.ceil(width / 2);
  const rows = Buffer.alloc((stride + 1) * height);
  let previous = new Uint8Array(stride);
  const raw = new Uint8Array(stride);
  const candidate = new Uint8Array(stride);
  const best = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    raw.fill(0);
    for (let x = 0; x < width; x++) {
      const level = maskLevel(alpha[y * width + x] ?? 0);
      raw[x >> 1] = (raw[x >> 1] ?? 0) | (x & 1 ? level : level << 4);
    }
    let bestFilter = 0;
    let bestScore = Infinity;
    for (let filter = 0; filter <= 4; filter++) {
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const left = i > 0 ? (raw[i - 1] ?? 0) : 0;
        const up = previous[i] ?? 0;
        const upLeft = i > 0 ? (previous[i - 1] ?? 0) : 0;
        const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter] ?? 0;
        const value = ((raw[i] ?? 0) - predictor) & 0xff;
        candidate[i] = value;
        score += value < 128 ? value : 256 - value;
      }
      if (score < bestScore) {
        bestScore = score;
        bestFilter = filter;
        best.set(candidate);
      }
    }
    rows[y * (stride + 1)] = bestFilter;
    rows.set(best, y * (stride + 1) + 1);
    previous = raw.slice();
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([4, 3, 0, 0, 0], 8); // bit depth 4, palette color, deflate, adaptive filters, no interlace
  const palette = new Uint8Array(MASK_LEVELS * 3); // every entry black
  const transparency = Uint8Array.from({ length: MASK_LEVELS }, (_, i) => Math.round((i * 255) / (MASK_LEVELS - 1)));
  const text = Buffer.from(`${SOURCE_HASH_KEYWORD}\0${sourceSha256}`, 'latin1');
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('PLTE', palette),
    chunk('tRNS', transparency),
    chunk('tEXt', text),
    chunk('IDAT', deflateSync(rows, { level: 9, memLevel: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** Reads the source hash a mask PNG carries, or null when it has none. */
export function readSourceHash(png: Uint8Array): string | null {
  const bytes = Buffer.from(png);
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);
    if (type === 'tEXt') {
      const data = bytes.toString('latin1', at + 8, at + 8 + length);
      const split = data.indexOf('\0');
      if (data.slice(0, split) === SOURCE_HASH_KEYWORD) return data.slice(split + 1);
    }
    at += 12 + length;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Regions of a mask

export interface Region {
  /** Open pixels in the region, connected through their four sides like the fill tool. */
  area: number;
  /** Whether the region reaches the edge of the page. Only the background may. */
  touchesEdge: boolean;
  /** Diameter of the largest disc that fits inside, in page pixels, measured with a 3-4 chamfer. */
  inscribed: number;
  /** The center of that disc: the safest place to click. */
  center: { x: number; y: number };
  /** Wall pixels that touch the region through a side. The fill grows into these. */
  rim: number;
}

export interface RegionMap {
  /** One label per pixel: 0 for a wall, otherwise the region number plus one. */
  labels: Int32Array;
  regions: Region[];
}

/**
 * Splits a mask into the regions the fill tool sees: pixels with alpha under `wallAlpha`,
 * connected through their four sides. Used by the tests to know every region a child could
 * click, and by `npm run coloring:regions` to suggest sample points.
 */
export function mapRegions(width: number, height: number, alpha: Uint8Array, wallAlpha: number): RegionMap {
  const total = width * height;
  const labels = new Int32Array(total);
  for (let p = 0; p < total; p++) labels[p] = (alpha[p] ?? 0) >= wallAlpha ? 0 : -1;
  const regions: Region[] = [];
  const stack: number[] = [];
  for (let start = 0; start < total; start++) {
    if (labels[start] !== -1) continue;
    const label = regions.length + 1;
    const region: Region = { area: 0, touchesEdge: false, inscribed: 0, center: { x: 0, y: 0 }, rim: 0 };
    regions.push(region);
    labels[start] = label;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop() ?? 0;
      region.area += 1;
      const x = p % width;
      const y = (p - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) region.touchesEdge = true;
      for (const [q, inside] of [
        [p - 1, x > 0],
        [p + 1, x < width - 1],
        [p - width, y > 0],
        [p + width, y < height - 1],
      ] as const) {
        if (inside && labels[q] === -1) {
          labels[q] = label;
          stack.push(q);
        }
      }
    }
  }
  // Rim: wall pixels with a side neighbor in the region, counted once per region.
  for (let p = 0; p < total; p++) {
    if (labels[p] !== 0) continue;
    const x = p % width;
    const y = (p - x) / width;
    const seen: number[] = [];
    for (const [q, inside] of [
      [p - 1, x > 0],
      [p + 1, x < width - 1],
      [p - width, y > 0],
      [p + width, y < height - 1],
    ] as const) {
      const label = inside ? (labels[q] ?? 0) : 0;
      if (label > 0 && !seen.includes(label)) {
        seen.push(label);
        const region = regions[label - 1];
        if (region !== undefined) region.rim += 1;
      }
    }
  }
  // Chamfer distance to the nearest wall: 3 for a side step, 4 for a diagonal one.
  const distance = new Int32Array(total);
  const far = 1 << 28;
  for (let p = 0; p < total; p++) distance[p] = labels[p] === 0 ? 0 : far;
  const relax = (p: number, q: number, step: number): void => {
    const through = (distance[q] ?? far) + step;
    if (through < (distance[p] ?? far)) distance[p] = through;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (x > 0) relax(p, p - 1, 3);
      if (y > 0) {
        relax(p, p - width, 3);
        if (x > 0) relax(p, p - width - 1, 4);
        if (x < width - 1) relax(p, p - width + 1, 4);
      }
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const p = y * width + x;
      if (x < width - 1) relax(p, p + 1, 3);
      if (y < height - 1) {
        relax(p, p + width, 3);
        if (x < width - 1) relax(p, p + width + 1, 4);
        if (x > 0) relax(p, p + width - 1, 4);
      }
    }
  }
  for (let p = 0; p < total; p++) {
    const label = labels[p] ?? 0;
    const region = regions[label - 1];
    if (region === undefined) continue;
    const diameter = ((distance[p] ?? 0) / 3) * 2;
    if (diameter > region.inscribed) {
      region.inscribed = diameter;
      region.center = { x: p % width, y: Math.floor(p / width) };
    }
  }
  return { labels, regions };
}
