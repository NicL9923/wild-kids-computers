import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { Font, PathCommand } from 'opentype.js';
import { format } from 'prettier';
import { GLYPH_TABLE_FORMAT, parseGlyphTable, type GlyphTable } from '../src/core/paint/glyphs.ts';

/**
 * Builds the text tool's glyph tables from font files: node tools/buildGlyphTables.ts
 *
 * Each face lists its font file and the name its table goes by. A table built from a font with
 * a Reserved Font Name under the OFL is a modified version, so it takes a different name.
 */

// opentype.js is CommonJS without named exports that Node's ESM loader can see, so load it with require.
function loadParser(): (buffer: ArrayBuffer) => Font {
  const loaded: unknown = createRequire(import.meta.url)('opentype.js');
  if (typeof loaded !== 'object' || loaded === null || !('parse' in loaded) || typeof loaded.parse !== 'function') {
    throw new Error('opentype.js did not load as expected.');
  }
  const parse: (buffer: ArrayBuffer) => Font = loaded.parse.bind(loaded);
  return parse;
}

const FONT_DIR = path.join(process.cwd(), 'assets/paint-fonts');

const FACES = [{ id: 'meadow-sans', family: 'Meadow Sans', file: 'Andika-Bold.ttf' }] as const;

/** Printable ASCII, Latin-1 Supplement (accented letters like é, ñ, ü, ø), and curly quotes/dashes. */
export const CHARACTERS = [
  ...Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => String.fromCodePoint(0x20 + i)),
  ...Array.from({ length: 0xff - 0xa0 + 1 }, (_, i) => 0xa0 + i)
    .filter((code) => code !== 0xad)
    .map((code) => String.fromCodePoint(code)),
  '‘',
  '’',
  '“',
  '”',
  '–',
  '—',
  '…',
];

function number(value: number | undefined): string {
  // Font units are integers or halves (implied on-curve points). Keep halves, drop noise.
  return String(Math.round((value ?? 0) * 2) / 2);
}

export function pathData(commands: readonly PathCommand[]): string {
  return commands
    .map((c) => {
      switch (c.type) {
        case 'M':
        case 'L':
          return `${c.type}${number(c.x)} ${number(c.y)}`;
        case 'Q':
          return `Q${number(c.x1)} ${number(c.y1)} ${number(c.x)} ${number(c.y)}`;
        case 'C':
          return `C${number(c.x1)} ${number(c.y1)} ${number(c.x2)} ${number(c.y2)} ${number(c.x)} ${number(c.y)}`;
        default:
          return 'Z';
      }
    })
    .join('');
}

export function buildTable(font: Font, family: string, characters: readonly string[]): GlyphTable {
  const capHeight = font.tables.os2?.sCapHeight;
  if (capHeight === undefined || capHeight <= 0) throw new Error(`${family}: the font has no cap height.`);
  const glyphs: Record<string, { advance: number; d: string }> = {};
  const present: string[] = [];
  for (const character of characters) {
    const glyph = font.charToGlyph(character);
    if (glyph.index === 0) continue;
    glyphs[character] = { advance: glyph.advanceWidth ?? 0, d: pathData(glyph.path.commands) };
    present.push(character);
  }
  const kerning: Record<string, number> = {};
  for (const left of present) {
    for (const right of present) {
      const amount = font.getKerningValue(font.charToGlyph(left), font.charToGlyph(right));
      if (amount !== 0) kerning[left + right] = amount;
    }
  }
  return {
    format: GLYPH_TABLE_FORMAT,
    family,
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    capHeight,
    glyphs,
    kerning,
  };
}

if (import.meta.main) {
  for (const face of FACES) {
    const bytes = readFileSync(path.join(FONT_DIR, face.file));
    const font = loadParser()(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const table = buildTable(font, face.family, CHARACTERS);
    // Prove the engine accepts what was written before writing it.
    parseGlyphTable(JSON.parse(JSON.stringify(table)));
    const text = await format(JSON.stringify(table), { parser: 'json', printWidth: 120 });
    writeFileSync(path.join(FONT_DIR, `${face.id}.glyphs.json`), text);
    console.log(
      `${face.id}: ${Object.keys(table.glyphs).length} glyphs, ${Object.keys(table.kerning).length} kerning pairs.`,
    );
  }
}
