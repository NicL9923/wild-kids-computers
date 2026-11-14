import { DEFAULT_BAND, isBand, type Band } from '../../core/bands.ts';

/** What the component gallery shows: everything, or one full-screen piece for screenshots. */
export const GALLERY_VIEWS = ['all', 'map', 'finish', 'closing'] as const;

export type GalleryView = (typeof GALLERY_VIEWS)[number];

function isGalleryView(value: unknown): value is GalleryView {
  return (GALLERY_VIEWS as readonly unknown[]).includes(value);
}

export interface GallerySearch {
  band: Band;
  view: GalleryView;
}

/**
 * The gallery's search parameters, with a default for anything missing or unknown. The route
 * and the screen both run it, because the router's types cannot follow a route tree that is
 * found by file convention.
 */
export function parseGallerySearch(search: Record<string, unknown>): GallerySearch {
  return {
    band: isBand(search.band) ? search.band : DEFAULT_BAND,
    view: isGalleryView(search.view) ? search.view : 'all',
  };
}
