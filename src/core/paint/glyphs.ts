import { Path } from './path.ts';

/**
 * Glyph tables for the text tool.
 *
 * tools/paint/buildGlyphTables.ts reads a font file and writes one table per face to
 * assets/paint-fonts/<face>.glyphs.json. The engine fills the outlines with its own path filler,
 * so the app ships no font parser and the text looks the same on every machine.
 *
 * Outlines are in font units with y pointing up. Each glyph's `d` uses M, L, Q, C, and Z with
 * absolute coordinates, like SVG path data.
 */

export const GLYPH_TABLE_FORMAT = 1;

interface Glyph {
  readonly advance: number;
  readonly d: string;
}

export interface GlyphTable {
  readonly format: typeof GLYPH_TABLE_FORMAT;
  readonly family: string;
  readonly unitsPerEm: number;
  readonly ascender: number;
  readonly descender: number;
  readonly capHeight: number;
  readonly glyphs: Readonly<Record<string, Glyph>>;
  /** Extra advance in font units for a pair of characters, keyed by the two characters. */
  readonly kerning: Readonly<Record<string, number>>;
}

type Command =
  | { op: 'M' | 'L'; x: number; y: number }
  | { op: 'Q'; values: number[] }
  | { op: 'C'; values: number[] }
  | { op: 'Z' };

const ARGUMENT_COUNT = { M: 2, L: 2, Q: 4, C: 6, Z: 0 } as const;

/** Parses glyph path data. Throws on anything outside the small grammar the build tool writes. */
export function parseGlyphPath(d: string): Command[] {
  const tokens = d.match(/[MLQCZ]|-?\d+(?:\.\d+)?|\S/g) ?? [];
  const commands: Command[] = [];
  let i = 0;
  while (i < tokens.length) {
    const op = tokens[i];
    if (op !== 'M' && op !== 'L' && op !== 'Q' && op !== 'C' && op !== 'Z') {
      throw new SyntaxError(`Glyph path has "${String(op)}" where a command letter belongs.`);
    }
    const count = ARGUMENT_COUNT[op];
    const values: number[] = [];
    for (let k = 1; k <= count; k++) {
      const token = tokens[i + k];
      const value = token === undefined ? Number.NaN : Number(token);
      if (!Number.isFinite(value)) throw new SyntaxError(`Glyph path command ${op} needs ${count} numbers.`);
      values.push(value);
    }
    i += count + 1;
    if (op === 'Z') commands.push({ op });
    else if (op === 'M' || op === 'L') commands.push({ op, x: values[0] ?? 0, y: values[1] ?? 0 });
    else commands.push({ op, values });
  }
  return commands;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new TypeError(`Glyph table field "${key}" must be a number.`);
  return value;
}

/** Checks a parsed JSON value and returns it as a glyph table. Throws with the reason on bad input. */
export function parseGlyphTable(value: unknown): GlyphTable {
  if (!isRecord(value)) throw new TypeError('A glyph table must be an object.');
  if (value.format !== GLYPH_TABLE_FORMAT) {
    throw new TypeError(`Glyph table format must be ${GLYPH_TABLE_FORMAT}, got ${String(value.format)}.`);
  }
  if (typeof value.family !== 'string' || value.family === '')
    throw new TypeError('Glyph table field "family" must be a name.');
  const unitsPerEm = finite(value, 'unitsPerEm');
  if (unitsPerEm <= 0) throw new TypeError('Glyph table field "unitsPerEm" must be positive.');
  const capHeight = finite(value, 'capHeight');
  if (capHeight <= 0) throw new TypeError('Glyph table field "capHeight" must be positive.');
  const ascender = finite(value, 'ascender');
  const descender = finite(value, 'descender');
  if (!isRecord(value.glyphs)) throw new TypeError('Glyph table field "glyphs" must be an object.');
  const glyphs: Record<string, Glyph> = {};
  for (const [character, glyph] of Object.entries(value.glyphs)) {
    if (!/^.$/su.test(character)) throw new TypeError(`Glyph key "${character}" must be one character.`);
    if (!isRecord(glyph) || typeof glyph.d !== 'string') throw new TypeError(`Glyph "${character}" needs path data.`);
    const advance = finite(glyph, 'advance');
    parseGlyphPath(glyph.d);
    glyphs[character] = { advance, d: glyph.d };
  }
  if (!isRecord(value.kerning)) throw new TypeError('Glyph table field "kerning" must be an object.');
  const kerning: Record<string, number> = {};
  for (const [pair, amount] of Object.entries(value.kerning)) {
    if (!/^.{2}$/su.test(pair) || typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new TypeError(`Kerning entry "${pair}" must pair two characters with a number.`);
    }
    kerning[pair] = amount;
  }
  return {
    format: GLYPH_TABLE_FORMAT,
    family: value.family,
    unitsPerEm,
    ascender,
    descender,
    capHeight,
    glyphs,
    kerning,
  };
}

/** The character drawn in place of one the table lacks. */
const REPLACEMENT = '?';

/**
 * Lays out text and returns its outlines as one path. (x, y) is the top left of the first
 * line's capital letters. size is the cap height in pixels. Lines break at "\n".
 */
export function textPath(table: GlyphTable, text: string, size: number, x: number, y: number): Path {
  const scale = size / table.capHeight;
  const lineHeight = (table.ascender - table.descender) * scale;
  const path = new Path(0.15);
  let baseline = y + table.capHeight * scale;
  for (const line of text.split('\n')) {
    let penX = x;
    let previous = '';
    for (const character of line) {
      const glyph = table.glyphs[character] ?? table.glyphs[REPLACEMENT];
      if (glyph === undefined) continue;
      penX += (table.kerning[previous + character] ?? 0) * scale;
      addGlyph(path, glyph.d, penX, baseline, scale);
      penX += glyph.advance * scale;
      previous = character;
    }
    baseline += lineHeight;
  }
  return path;
}

function addGlyph(path: Path, d: string, originX: number, baseline: number, scale: number): void {
  const px = (u: number): number => originX + u * scale;
  const py = (v: number): number => baseline - v * scale;
  for (const command of parseGlyphPath(d)) {
    switch (command.op) {
      case 'M':
        path.moveTo(px(command.x), py(command.y));
        break;
      case 'L':
        path.lineTo(px(command.x), py(command.y));
        break;
      case 'Q': {
        const [cx = 0, cy = 0, ex = 0, ey = 0] = command.values;
        path.quadTo(px(cx), py(cy), px(ex), py(ey));
        break;
      }
      case 'C': {
        const [ax = 0, ay = 0, bx = 0, by = 0, ex = 0, ey = 0] = command.values;
        path.cubicTo(px(ax), py(ay), px(bx), py(by), px(ex), py(ey));
        break;
      }
      case 'Z':
        path.close();
        break;
    }
  }
}
