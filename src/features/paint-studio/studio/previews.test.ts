import { describe, expect, it } from 'vitest';
import { rgba } from '../../../core/paint/color.ts';
import { createDocument } from '../../../core/paint/document.ts';
import { paintSpectrum } from '../../../core/paint/testing/pictures.ts';
import { SHAPE_KINDS } from '../../../core/paint/types.ts';
import { brushTips, paintEffects } from '../../../registry/paint.ts';
import { effectPreview, effectPreviewBase, fillPreview, sampleScene, shapePreview, tipPreview } from './previews.ts';
import { FILL_STYLE_IDS, fillStyle } from './studioOptions.ts';

const RED = rgba(220, 38, 38);

const key = (surface: { data: Uint8ClampedArray }): string => Buffer.from(surface.data).toString('base64');

/**
 * How many previews look like no other and unlike blank paper. A preview that looks like another,
 * or like nothing, gives the child nothing to choose by.
 */
function distinctFromEachOtherAndBlank(
  previews: readonly { data: Uint8ClampedArray }[],
  blank: { data: Uint8ClampedArray },
): number {
  const keys = previews.map(key);
  return new Set(keys.filter((value) => value !== key(blank))).size;
}

describe('picker previews', () => {
  it('draws every brush tip differently', () => {
    const previews = brushTips.map((tip) => tipPreview(tip, RED));
    expect(distinctFromEachOtherAndBlank(previews, createDocument(96, 48).paint)).toBe(previews.length);
  });

  it('draws every shape differently, filled and outlined', () => {
    const previews = SHAPE_KINDS.flatMap((kind) => [
      shapePreview(kind, 'filled', RED),
      shapePreview(kind, 'outline', RED),
    ]);
    expect(distinctFromEachOtherAndBlank(previews, createDocument(56, 56).paint)).toBe(previews.length);
  });

  it('pours every fill style differently', () => {
    const previews = FILL_STYLE_IDS.map((id) => fillPreview(fillStyle(id, RED), RED));
    expect(new Set(previews.map(key)).size).toBe(previews.length);
  });

  it('previews on a sample scene until the picture has enough paint, then on the picture', () => {
    const blank = createDocument(320, 200);
    expect(key(effectPreviewBase(blank.paint))).toBe(key(sampleScene(128, 80)));
    const painted = createDocument(320, 200);
    paintSpectrum(painted);
    expect(key(effectPreviewBase(painted.paint))).not.toBe(key(sampleScene(128, 80)));
  });

  it('shows a visible change for every effect on a picture', () => {
    const doc = createDocument(320, 200);
    paintSpectrum(doc);
    const source = effectPreviewBase(doc.paint);
    for (const effect of paintEffects) {
      expect(key(effectPreview(effect, source)), effect.id).not.toBe(key(source));
    }
  });
});
