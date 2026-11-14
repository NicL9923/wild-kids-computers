import type { StampCategory } from '../features/paint-studio/stampCategory.ts';

/**
 * The paint studio's stamp categories, found by file convention: one module per category in
 * src/features/paint-studio/stamps/, default export from `defineStampCategory`.
 */
export const stampCategoryModules = import.meta.glob<{ default: StampCategory }>(
  [
    '../features/paint-studio/stamps/*.ts',
    '!../features/paint-studio/stamps/strings.ts',
    '!../features/paint-studio/stamps/*.test.ts',
  ],
  { eager: true },
);

export const stampCategories: readonly StampCategory[] = Object.values(stampCategoryModules)
  .map((module) => module.default)
  .toSorted((a, b) => a.order - b.order || a.id.localeCompare(b.id));
