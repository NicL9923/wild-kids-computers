import { useEffect, useState } from 'react';
import type { ActivityKit } from '../../../../activityShell/kit.ts';
import type { PictureSource } from '../../logic/PictureCrop.tsx';
import { fitForPieces } from '../../logic/pieceDetail.ts';
import { PICTURE, type JigsawLevel } from './level.ts';

/** The picture for a round: loading while the gallery is read, then a painting or the scene. */
export type JigsawPicture =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly source: PictureSource; readonly from: 'gallery' | 'scene' };

/** Decodes PNG bytes and returns their pixels, or null when the browser cannot read them. */
async function pixelsOf(bytes: Uint8Array): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(new Blob([bytes.slice()], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (context === null) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    return { data, width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

/**
 * Picks the round's picture. With `level.gallery` null, the bundled scene at once. Otherwise the
 * painting at that fraction of the child's gallery, when its thumbnail shows something in every
 * piece; any failure along the way falls back to the scene, so a round always has a picture.
 */
export function useJigsawPicture(kit: Pick<ActivityKit<unknown>, 'pictures'>, level: JigsawLevel): JigsawPicture {
  const scene: JigsawPicture = { status: 'ready', source: { kind: 'scene', scene: level.scene }, from: 'scene' };
  const [picture, setPicture] = useState<JigsawPicture>(level.gallery === null ? scene : { status: 'loading' });
  const { pictures } = kit;
  useEffect(() => {
    const pick = level.gallery;
    if (pick === null) return undefined;
    let current = true;
    let url: string | null = null;
    const fallback = () => {
      if (current) setPicture({ status: 'ready', source: { kind: 'scene', scene: level.scene }, from: 'scene' });
    };
    const load = async () => {
      const listed = await pictures.list('gallery');
      if (!listed.ok || listed.value.length === 0) return fallback();
      const chosen = listed.value[Math.floor(pick * listed.value.length)];
      if (chosen === undefined) return fallback();
      const thumbnail = await pictures.read(chosen.id, 'thumbnail');
      const pixels = thumbnail.ok ? await pixelsOf(thumbnail.value) : null;
      if (pixels === null || !fitForPieces(pixels.data, pixels.width, pixels.height, level.columns, level.rows))
        return fallback();
      const full = await pictures.read(chosen.id, 'picture');
      if (!full.ok || !current) return fallback();
      url = URL.createObjectURL(new Blob([full.value.slice()], { type: 'image/png' }));
      setPicture({ status: 'ready', source: { kind: 'image', url, ...PICTURE }, from: 'gallery' });
      return undefined;
    };
    void load().catch(fallback);
    return () => {
      current = false;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [pictures, level]);
  return picture;
}
