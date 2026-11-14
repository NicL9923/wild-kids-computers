import { isSafeId } from '../../core/platform/names.ts';

/** The paint studio's own screens. */
export const PAINT_STUDIO_PATH = '/paint';
export const PAINT_GALLERY_PATH = '/paint/gallery';

/** The search parameters the studio reads: a gallery picture to open. */
export interface StudioSearch {
  readonly picture?: string;
}

/** Parses the studio's search parameters. Anything unexpected is dropped, never thrown. */
export function parseStudioSearch(search: Record<string, unknown>): StudioSearch {
  const picture = search.picture;
  return isSafeId(picture) ? { picture } : {};
}
