import { parseGlyphTable, type GlyphTable } from '../core/paint/glyphs.ts';
import type { BrushTip, PaintEffect, PaintTool } from '../core/paint/types.ts';

/**
 * The paint registries. Each item is found by its file name, so adding a tool, tip, or effect
 * never edits this file. See src/core/paint/README.md.
 */

interface Ordered {
  readonly id: string;
  readonly order: number;
}

function sorted<T extends Ordered>(modules: Record<string, { default: T }>): T[] {
  return Object.values(modules)
    .map((module) => module.default)
    .toSorted((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** Module paths by item, for the registry test. */
export const paintToolModules = import.meta.glob<{ default: PaintTool }>('../core/paint/tools/*/index.ts', {
  eager: true,
});
export const brushTipModules = import.meta.glob<{ default: BrushTip }>(
  ['../core/paint/tips/*.ts', '!../core/paint/tips/*.test.ts'],
  { eager: true },
);
export const paintEffectModules = import.meta.glob<{ default: PaintEffect }>('../core/paint/effects/*/index.ts', {
  eager: true,
});

export const paintTools: readonly PaintTool[] = sorted(paintToolModules);
export const brushTips: readonly BrushTip[] = sorted(brushTipModules);
export const paintEffects: readonly PaintEffect[] = sorted(paintEffectModules);

const glyphTableLoaders = import.meta.glob<unknown>('../../assets/paint-fonts/*.glyphs.json', { import: 'default' });

/** The text tool's faces by id, such as "meadow-sans". Each loads and is checked on first use. */
export const paintFonts: ReadonlyMap<string, () => Promise<GlyphTable>> = new Map(
  Object.entries(glyphTableLoaders).map(([path, load]) => [
    path.replace(/^.*\//, '').replace(/\.glyphs\.json$/, ''),
    async () => parseGlyphTable(await load()),
  ]),
);
