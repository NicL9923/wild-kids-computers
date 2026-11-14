import { describe, expect, it } from 'vitest';
import { BANDS } from '../../../core/bands.ts';
import { brushTips, paintEffects } from '../../../registry/paint.ts';
import { strings as effectNames } from '../effects/strings.ts';
import {
  effectsFor,
  missingNames,
  mixedColor,
  paletteFor,
  penBehavior,
  sizesFor,
  toolsFor,
  YOUNGEST_EFFECT_IDS,
} from './studioOptions.ts';

describe('studio options by band', () => {
  it('gives band-3-5 only brush, stamps, fill, eraser, and a short list of effects', () => {
    expect(toolsFor('band-3-5').toSorted()).toEqual(['brush', 'effects', 'eraser', 'fill', 'stamp']);
    expect(effectsFor('band-3-5').map((effect) => effect.id)).toEqual([...YOUNGEST_EFFECT_IDS]);
    expect(sizesFor('band-3-5')).toHaveLength(3);
    expect(paletteFor('band-3-5')).toHaveLength(10);
  });

  it('gives older bands every tool and all forty effects', () => {
    for (const band of BANDS.slice(1)) {
      expect(toolsFor(band)).toHaveLength(8);
      expect(effectsFor(band)).toHaveLength(40);
      expect(sizesFor(band)).toHaveLength(5);
      expect(paletteFor(band)).toHaveLength(12);
    }
  });

  it('names every tip and effect, and every name belongs to an effect or a group', () => {
    expect(
      missingNames(
        brushTips.map((tip) => tip.id),
        paintEffects.map((effect) => effect.id),
      ),
    ).toEqual([]);
    const ids = new Set(paintEffects.map((effect) => effect.id));
    const stale = Object.keys(effectNames).filter((key) => !key.startsWith('group-') && !ids.has(key));
    expect(stale).toEqual([]);
    expect(missingNames(['nope'], ['alsoNope'])).toEqual(['nope', 'alsoNope']);
  });

  it('acts once for fill, stamps, letters, and whole-picture effects, and paints with the rest', () => {
    const mirror = paintEffects.find((effect) => effect.id === 'mirror');
    const swirl = paintEffects.find((effect) => effect.id === 'swirl');
    expect(penBehavior('fill', undefined)).toBe('once');
    expect(penBehavior('stamp', undefined)).toBe('once');
    expect(penBehavior('text', undefined)).toBe('once');
    expect(penBehavior('effects', mirror)).toBe('once');
    expect(penBehavior('effects', swirl)).toBe('stroke');
    expect(penBehavior('brush', undefined)).toBe('stroke');
    expect(penBehavior('shapes', undefined)).toBe('stroke');
  });
});

describe('mixed colors', () => {
  it.each([
    [0, 50, [255, 0, 0]],
    [120, 50, [0, 255, 0]],
    [240, 50, [0, 0, 255]],
    [-120, 50, [0, 0, 255]],
    [60, 0, [0, 0, 0]],
    [60, 100, [255, 255, 255]],
    [300, 25, [128, 0, 128]],
  ])('hue %i at lightness %i is %o', (hue, lightness, rgb) => {
    const color = mixedColor(hue, lightness);
    expect([color.r, color.g, color.b]).toEqual(rgb);
  });
});
