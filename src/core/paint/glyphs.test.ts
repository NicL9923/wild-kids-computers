import { describe, expect, it } from 'vitest';
import { GLYPH_TABLE_FORMAT, parseGlyphPath, parseGlyphTable, textPath } from './glyphs.ts';

function table(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: GLYPH_TABLE_FORMAT,
    family: 'Test',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    capHeight: 700,
    glyphs: {
      A: { advance: 600, d: 'M0 0L300 700L600 0Z' },
      V: { advance: 600, d: 'M0 700L300 0L600 700Z' },
      '?': { advance: 500, d: 'M0 0L500 0L500 700Q250 900 0 700Z' },
    },
    kerning: { AV: -100 },
    ...overrides,
  };
}

describe('parseGlyphTable', () => {
  it('accepts a well-formed table', () => {
    expect(parseGlyphTable(table()).glyphs.A?.advance).toBe(600);
  });

  it.each([
    ['a non-object', null, 'must be an object'],
    ['another format', table({ format: 2 }), 'format must be 1, got 2'],
    ['a missing family', table({ family: '' }), '"family" must be a name'],
    ['a zero em size', table({ unitsPerEm: 0 }), '"unitsPerEm" must be positive'],
    ['a string cap height', table({ capHeight: '700' }), '"capHeight" must be a number'],
    ['a zero cap height', table({ capHeight: 0 }), '"capHeight" must be positive'],
    ['a missing ascender', table({ ascender: undefined }), '"ascender" must be a number'],
    ['glyphs as an array', table({ glyphs: [] }), '"glyphs" must be an object'],
    [
      'a two-character glyph key',
      table({ glyphs: { AB: { advance: 1, d: 'M0 0Z' } } }),
      'Glyph key "AB" must be one character',
    ],
    ['a glyph without path data', table({ glyphs: { A: { advance: 1 } } }), 'Glyph "A" needs path data'],
    [
      'a glyph with an infinite advance',
      table({ glyphs: { A: { advance: Infinity, d: 'M0 0Z' } } }),
      '"advance" must be a number',
    ],
    ['broken path data', table({ glyphs: { A: { advance: 1, d: 'M0 0L5' } } }), 'command L needs 2 numbers'],
    ['missing kerning', table({ kerning: undefined }), '"kerning" must be an object'],
    ['a kerning key of one character', table({ kerning: { A: 5 } }), 'Kerning entry "A" must pair two characters'],
    [
      'a kerning amount that is not a number',
      table({ kerning: { AV: '5' } }),
      'Kerning entry "AV" must pair two characters',
    ],
  ])('rejects %s', (_label, value, reason) => {
    expect(() => parseGlyphTable(value)).toThrow(reason);
  });

  it('accepts a glyph key outside the basic plane as one character', () => {
    expect(() => parseGlyphTable(table({ glyphs: { '\u{1F98A}': { advance: 1, d: 'M0 0Z' } } }))).not.toThrow();
  });
});

describe('parseGlyphPath', () => {
  it('reads every command with negative and fractional numbers', () => {
    expect(parseGlyphPath('M-1 2.5L3 4Q5 6 7 8C1 2 3 4 5 6Z').map((c) => c.op)).toEqual(['M', 'L', 'Q', 'C', 'Z']);
  });

  it('rejects a number where a command letter belongs', () => {
    expect(() => parseGlyphPath('M0 0 5 5')).toThrow('Glyph path has "5" where a command letter belongs');
  });
});

describe('textPath', () => {
  const font = parseGlyphTable(table());

  it('scales so the cap height is the size and puts the top of the capitals at y', () => {
    const bounds = textPath(font, 'A', 70, 10, 20).bounds();
    expect(bounds).toEqual({ x0: 10, y0: 20, x1: 70, y1: 90 });
  });

  it('applies kerning between a pair', () => {
    const kerned = textPath(font, 'AV', 70, 0, 0).bounds();
    // 600 + 600 units, less 100 of kerning, at 0.1 px per unit.
    expect(kerned?.x1).toBeCloseTo(110, 10);
  });

  it('starts a new line one line height down after a line break', () => {
    const bounds = textPath(font, 'A\nA', 70, 0, 0).bounds();
    expect(bounds?.y1).toBeCloseTo(70 + 100, 10);
  });

  it('skips a character with no glyph when the table has no question mark either', () => {
    const bare = parseGlyphTable(table({ glyphs: { A: { advance: 600, d: 'M0 0L300 700L600 0Z' } } }));
    expect(textPath(bare, 'xA', 70, 0, 0).bounds()?.x0).toBe(0);
  });
});
