import type { Band } from '../core/bands.ts';
import type { ColoringPage } from '../features/paint-studio/coloringPage.ts';

/**
 * The paint studio's coloring pages, found by file convention: one entry module per page in
 * src/features/paint-studio/coloringPages/, default export from `defineColoringPage`.
 */
const modules = import.meta.glob<{ default: ColoringPage }>(
  ['../features/paint-studio/coloringPages/*.ts', '!../features/paint-studio/coloringPages/strings.ts'],
  { eager: true },
);

export const coloringPages: readonly ColoringPage[] = Object.values(modules)
  .map((module) => module.default)
  .toSorted((a, b) => a.order - b.order || a.id.localeCompare(b.id));

/** The pages a band sees, in picker order. */
export function coloringPagesFor(band: Band): readonly ColoringPage[] {
  return coloringPages.filter((page) => page.bands.includes(band));
}

export function coloringPageById(id: string): ColoringPage | undefined {
  return coloringPages.find((page) => page.id === id);
}
