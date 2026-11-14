import { useEffect, useState } from 'react';
import type { ActivityKit } from '../../../../activityShell/kit.ts';
import { withDeadline } from '../../../../core/activityKit/deadline.ts';
import { systemScheduler, type Scheduler } from '../../../../core/activityKit/scheduler.ts';
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
 * How long the gallery may take to give the round its painting, in milliseconds: a list, a
 * thumbnail read and decode, and a picture read. Each takes well under a second on a slow laptop,
 * and the child waits on an empty stage meanwhile, so past this the round uses the scene.
 */
export const JIGSAW_PICTURE_DEADLINE_MS = 5_000;

/** Real time: a test that pins the kit clock cannot stop the deadline. */
const realTime = systemScheduler();

/** The painting at that fraction of the gallery as PNG bytes, or null when none is fit to cut. */
async function galleryPainting(
  pictures: Pick<ActivityKit<unknown>, 'pictures'>['pictures'],
  pick: number,
  level: JigsawLevel,
): Promise<Uint8Array | null> {
  const listed = await pictures.list('gallery');
  if (!listed.ok || listed.value.length === 0) return null;
  const chosen = listed.value[Math.floor(pick * listed.value.length)];
  if (chosen === undefined) return null;
  const thumbnail = await pictures.read(chosen.id, 'thumbnail');
  const pixels = thumbnail.ok ? await pixelsOf(thumbnail.value) : null;
  if (pixels === null || !fitForPieces(pixels.data, pixels.width, pixels.height, level.columns, level.rows))
    return null;
  const full = await pictures.read(chosen.id, 'picture');
  return full.ok ? full.value : null;
}

/**
 * Picks the round's picture. With `level.gallery` null, the bundled scene at once. Otherwise the
 * painting at that fraction of the child's gallery, when its thumbnail shows something in every
 * piece. Any failure along the way, or a gallery that does not answer within
 * JIGSAW_PICTURE_DEADLINE_MS, falls back to the scene, so a round always has a picture. A
 * painting that arrives after the deadline is dropped, so the picture never changes mid-round.
 */
export function useJigsawPicture(
  kit: Pick<ActivityKit<unknown>, 'pictures'>,
  level: JigsawLevel,
  timers: Pick<Scheduler, 'setTimeout'> = realTime,
): JigsawPicture {
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
    const show = async (): Promise<void> => {
      let bytes: Uint8Array | null;
      try {
        bytes = await withDeadline(
          galleryPainting(pictures, pick, level),
          JIGSAW_PICTURE_DEADLINE_MS,
          timers,
          'The jigsaw picture',
        );
      } catch {
        bytes = null;
      }
      if (!current) return;
      if (bytes === null) {
        fallback();
        return;
      }
      url = URL.createObjectURL(new Blob([bytes.slice()], { type: 'image/png' }));
      setPicture({ status: 'ready', source: { kind: 'image', url, ...PICTURE }, from: 'gallery' });
    };
    void show();
    return () => {
      current = false;
      if (url !== null) URL.revokeObjectURL(url);
    };
  }, [pictures, level, timers]);
  return picture;
}
