import { isSafeId } from '../../core/platform/names.ts';

/** The paint studio's own screens. */
export const PAINT_STUDIO_PATH = '/paint';
export const PAINT_GALLERY_PATH = '/paint/gallery';

// Screens other agents build, by the literal path from the shared path table. The coordinator
// replaces these with the owners' constants after the merge.
/** The home map, built by the app shell. */
export const HOME_PATH = '/home';
/** The calm closing screen when the session length is used up, built by the app shell. */
export const SESSION_CLOSING_PATH = '/closing';

/** The search parameters the studio reads: a gallery picture to open. */
export interface StudioSearch {
  readonly picture?: string;
}

/** Parses the studio's search parameters. Anything unexpected is dropped, never thrown. */
export function parseStudioSearch(search: Record<string, unknown>): StudioSearch {
  const picture = search.picture;
  return isSafeId(picture) ? { picture } : {};
}
