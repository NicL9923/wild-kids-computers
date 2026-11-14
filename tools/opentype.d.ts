// The small part of opentype.js that tools/buildGlyphTables.ts uses. Only tools/ reads fonts;
// the app ships glyph tables and no font parser. A local declaration avoids @types/opentype.js,
// which pulls the DOM library into the Node type check.
declare module 'opentype.js' {
  export interface PathCommand {
    type: 'M' | 'L' | 'Q' | 'C' | 'Z';
    x?: number;
    y?: number;
    x1?: number;
    y1?: number;
    x2?: number;
    y2?: number;
  }
  export interface Glyph {
    index: number;
    advanceWidth?: number;
    path: { commands: PathCommand[] };
  }
  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    tables: { os2?: { sCapHeight?: number } };
    charToGlyph(character: string): Glyph;
    getKerningValue(left: Glyph, right: Glyph): number;
  }
}
