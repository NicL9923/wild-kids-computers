/** What the component gallery shows: everything, or one full-screen piece for screenshots. */
export const GALLERY_VIEWS = ['all', 'map', 'finish', 'closing'] as const;

export type GalleryView = (typeof GALLERY_VIEWS)[number];

export function isGalleryView(value: unknown): value is GalleryView {
  return (GALLERY_VIEWS as readonly unknown[]).includes(value);
}
