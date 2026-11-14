import { PAPER } from '../../../core/paint/document.ts';
import { surfaceFromData, type Surface } from '../../../core/paint/surface.ts';

/**
 * Moving pixels between the engine and the browser's image codecs. The engine never decodes or
 * encodes images; the studio does it here with the platform's decoders, which only ever see
 * finished pictures, so they cannot change what the engine paints.
 */

function context(width: number, height: number): OffscreenCanvasRenderingContext2D {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('This browser cannot draw on an offscreen canvas.');
  return ctx;
}

function toSurface(ctx: OffscreenCanvasRenderingContext2D, width: number, height: number): Surface {
  return surfaceFromData(width, height, ctx.getImageData(0, 0, width, height).data);
}

/** Encodes straight RGBA pixels as a PNG file. */
export async function encodePng(surface: Surface): Promise<Uint8Array> {
  const ctx = context(surface.width, surface.height);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(surface.data), surface.width, surface.height), 0, 0);
  const blob = await ctx.canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

/** Decodes PNG bytes, such as a saved picture, at their own size. */
export async function decodePng(bytes: Uint8Array): Promise<Surface> {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  try {
    const ctx = context(bitmap.width, bitmap.height);
    ctx.drawImage(bitmap, 0, 0);
    return toSurface(ctx, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** Fetches a bundled PNG, such as a coloring page mask, and decodes it. */
export async function decodePngUrl(url: string): Promise<Surface> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}: ${response.status}`);
  return decodePng(new Uint8Array(await response.arrayBuffer()));
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => resolve(image), { once: true });
    image.addEventListener('error', () => reject(new Error(`Could not load ${url}`)), { once: true });
    image.src = url;
  });
}

/**
 * Draws a bundled SVG, such as a stamp, at exactly the size it will be placed, keeping its shape.
 * Drawing the vector at the final size keeps a big stamp sharp.
 */
export async function rasterizeSvg(url: string, longestSide: number): Promise<Surface> {
  const image = await loadImage(url);
  const naturalWidth = image.naturalWidth || longestSide;
  const naturalHeight = image.naturalHeight || longestSide;
  const scale = longestSide / Math.max(naturalWidth, naturalHeight);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  const ctx = context(width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return toSurface(ctx, width, height);
}

/** Scales any picture to fit the document on white paper, centered, keeping its shape. */
export function fitOnPaper(source: Surface, width: number, height: number): Surface {
  const from = context(source.width, source.height);
  from.putImageData(new ImageData(new Uint8ClampedArray(source.data), source.width, source.height), 0, 0);
  const ctx = context(width, height);
  ctx.fillStyle = `rgb(${PAPER.r} ${PAPER.g} ${PAPER.b})`;
  ctx.fillRect(0, 0, width, height);
  const scale = Math.min(width / source.width, height / source.height);
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(from.canvas, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return toSurface(ctx, width, height);
}
