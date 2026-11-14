import type { CatalogSource } from '../core/strings/checkCatalogs.ts';
import type { SpokenHandle, StringHandle } from '../core/strings/defineStrings.ts';

/**
 * Every string catalog in the app, found by file convention:
 * - `src/**\/strings.ts`, next to the code that uses it
 * - `src/core/strings/shared/*.ts`, the clip sets every activity shares
 *
 * Each module exports one `defineStrings` result named `strings`. The strings and voice checks
 * read this registry under Vitest. The app itself imports catalogs directly and never this file.
 */
const modules = import.meta.glob<Record<string, unknown>>(
  ['/src/**/strings.ts', '/src/core/strings/shared/*.ts', '!/src/core/strings/shared/index.ts', '!**/*.test.ts'],
  { eager: true },
);

function isHandle(value: unknown): value is StringHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'kind' in value &&
    (value.kind === 'spoken' || value.kind === 'silent')
  );
}

/** Reads the `strings` export of one discovered module. Exported for its own test. */
export function catalogFromModule(path: string, module: Record<string, unknown>): CatalogSource {
  const strings = module.strings;
  if (typeof strings !== 'object' || strings === null) {
    throw new Error(`${path} must export the defineStrings result as "strings".`);
  }
  const handles = Object.values(strings);
  const notHandle = handles.find((value) => !isHandle(value));
  if (notHandle !== undefined) {
    throw new Error(`${path}: "strings" must be a defineStrings result, found ${JSON.stringify(notHandle)}.`);
  }
  return { path, handles: handles.filter(isHandle) };
}

export const catalogs: readonly CatalogSource[] = Object.entries(modules)
  .map(([path, module]) => catalogFromModule(path, module))
  .toSorted((a, b) => a.path.localeCompare(b.path));

export const allStrings: readonly StringHandle[] = catalogs.flatMap((catalog) => catalog.handles);

export const spokenStrings: readonly SpokenHandle[] = allStrings.filter(
  (handle): handle is SpokenHandle => handle.kind === 'spoken',
);
