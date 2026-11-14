import { DOCUMENT_HEIGHT, DOCUMENT_WIDTH, flattenDocument } from '../../../core/paint/document.ts';
import type { Surface } from '../../../core/paint/surface.ts';
import { thumbnail } from '../../../core/paint/thumbnail.ts';
import type { EncodedPicture } from './autosave.ts';
import { decodePng, encodePng, fitOnPaper } from './browserPixels.ts';
import { readTextChunk, withTextChunk } from './pngText.ts';
import type { StudioDocument } from './studioDocument.ts';

/** The PNG text keyword that names the coloring page a picture was painted on. */
const PAGE_KEYWORD = 'wkc-coloring-page';

/** Gallery thumbnails fit in this box, twice the largest size the gallery shows them. */
const THUMBNAIL_WIDTH = 480;
const THUMBNAIL_HEIGHT = 300;

/**
 * The picture as files for the gallery: the flattened PNG, which any screen can show, with the
 * coloring page id in a text chunk, and a thumbnail. The pixels are read before the first await.
 */
export function encodePicture(studio: StudioDocument): Promise<EncodedPicture> {
  const flat = flattenDocument(studio.doc);
  const pageId = studio.pageId;
  const small = thumbnail(flat, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  return Promise.all([encodePng(flat), encodePng(small)]).then(([png, thumb]) => ({
    png: pageId === null ? png : withTextChunk(png, PAGE_KEYWORD, pageId),
    thumbnail: thumb,
  }));
}

export interface DecodedPicture {
  /** The flattened picture at the document size. */
  readonly picture: Surface;
  /** The coloring page it was painted on, or null. */
  readonly pageId: string | null;
}

/** Reads a saved picture. A picture of another size is fitted onto the paper. */
export async function decodePicture(png: Uint8Array): Promise<DecodedPicture> {
  const decoded = await decodePng(png);
  const picture =
    decoded.width === DOCUMENT_WIDTH && decoded.height === DOCUMENT_HEIGHT
      ? decoded
      : fitOnPaper(decoded, DOCUMENT_WIDTH, DOCUMENT_HEIGHT);
  return { picture, pageId: readTextChunk(png, PAGE_KEYWORD) };
}
