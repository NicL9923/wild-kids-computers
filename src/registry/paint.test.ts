import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EFFECT_GROUPS } from '../core/paint/types.ts';
import {
  brushTipModules,
  brushTips,
  paintEffectModules,
  paintEffects,
  paintFonts,
  paintToolModules,
  paintTools,
} from './paint.ts';

const GOLDEN_DIR = path.join(process.cwd(), 'src/core/paint/__goldens__');
const goldens = readdirSync(GOLDEN_DIR).filter((file) => file.endsWith('.png'));

/** The id a module path promises: the directory for tools and effects, the file name for tips. */
function idFromPath(modulePath: string): string {
  const parts = modulePath.split('/');
  const file = parts.at(-1) ?? '';
  return file === 'index.ts' ? (parts.at(-2) ?? '') : file.replace(/\.ts$/, '');
}

function duplicates(ids: readonly string[]): string[] {
  return ids.filter((id, i) => ids.indexOf(id) !== i);
}

const kinds = [
  { kind: 'tool', modules: paintToolModules, items: paintTools },
  { kind: 'tip', modules: brushTipModules, items: brushTips },
  { kind: 'effect', modules: paintEffectModules, items: paintEffects },
] as const;

describe('paint registry', () => {
  it('finds the reference tools, tips, and effects', () => {
    expect(paintTools.map((tool) => tool.id)).toEqual(['brush', 'eraser', 'line', 'shapes', 'fill', 'text', 'stamp']);
    expect(brushTips).toHaveLength(12);
    expect(new Set(paintEffects.map((effect) => effect.group))).toEqual(new Set(EFFECT_GROUPS));
  });

  describe.each(kinds)('$kind', ({ kind, modules, items }) => {
    it('has camelCase ids that match the file names', () => {
      for (const [modulePath, module] of Object.entries(modules)) {
        expect(module.default.id, modulePath).toBe(idFromPath(modulePath));
        expect(module.default.id).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    });

    it('has no duplicate ids', () => {
      expect(duplicates(items.map((item) => item.id))).toEqual([]);
    });

    it('has a golden image for every item', () => {
      const missing = items.filter(
        (item) => !goldens.some((file) => new RegExp(`^${kind}-${item.id}(-.+)?\\.png$`).test(file)),
      );
      expect(missing.map((item) => item.id)).toEqual([]);
    });
  });

  it('has a golden test file next to every tool and effect', () => {
    const missing = [...Object.keys(paintToolModules), ...Object.keys(paintEffectModules)]
      .map((modulePath) => path.join(process.cwd(), 'src/registry', modulePath.replace(/\.ts$/, '.test.ts')))
      .filter((testPath) => !existsSync(testPath));
    expect(missing).toEqual([]);
  });

  it('has no golden that belongs to nothing', () => {
    const ids = new Set(kinds.flatMap(({ kind, items }) => items.map((item) => `${kind}-${item.id}`)));
    const orphans = goldens.filter((file) => {
      const [kind = '', id = ''] = file.replace(/\.png$/, '').split('-');
      return !ids.has(`${kind}-${id}`);
    });
    expect(orphans).toEqual([]);
  });

  it('gives every effect one of the four groups', () => {
    for (const effect of paintEffects) expect(EFFECT_GROUPS).toContain(effect.group);
  });

  it('loads and checks the text tool font', async () => {
    const load = paintFonts.get('meadow-sans');
    if (load === undefined) throw new Error('The meadow-sans glyph table is missing.');
    const font = await load();
    expect(font.glyphs.a?.d).toMatch(/^M/);
    expect(font.glyphs['é']?.d).toMatch(/^M/);
    expect(font.glyphs['ñ']?.d).toMatch(/^M/);
    expect(font.glyphs['ü']?.d).toMatch(/^M/);
    expect(Object.keys(font.glyphs)).toHaveLength(197);
  });
});

describe('duplicates', () => {
  it('reports an id that appears twice', () => {
    expect(duplicates(['brush', 'fill', 'brush'])).toEqual(['brush']);
  });
});
