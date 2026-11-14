import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contentRulesMatched } from '../src/core/strings/contentRules.ts';

// Hard rule 2, the obvious case: no file or folder in the app, its assets, or its tools carries
// the name of a reference app or its mascot. String text is checked by the strings check.
const SCANNED_ROOTS = ['src', 'assets', 'electron', 'e2e', 'tools'];
const SKIPPED = new Set(['node_modules']);

function pathsUnder(root: string): string[] {
  const entries = readdirSync(root, { recursive: true, encoding: 'utf8' });
  return entries
    .filter((entry) => !entry.split(/[\\/]/).some((part) => SKIPPED.has(part)))
    .map((entry) => `${root}/${entry}`);
}

function referenceAppPaths(paths: readonly string[]): string[] {
  // File names join words with hyphens, underscores, dots, or case changes. Split them into words.
  return paths.filter((file) => {
    const words = file.replaceAll(/([a-z])([A-Z])/g, '$1 $2').replaceAll(/[-_./\\]+/g, ' ');
    return contentRulesMatched(words).includes('reference-app');
  });
}

describe('original work', () => {
  it.each([
    ['assets/emoji/tux.svg'],
    ['src/features/tux-paint-tools/index.ts'],
    ['src/features/gcomprisClone.ts'],
    ['tools/importTuxPaintStamps.ts'],
  ])('flags %s', (file) => {
    expect(referenceAppPaths([file])).toEqual([file]);
  });

  it.each([['assets/emoji/tuxedo.svg'], ['src/features/paint-studio/stamps/animals.ts']])('allows %s', (file) => {
    expect(referenceAppPaths([file])).toEqual([]);
  });

  it('finds no reference app name in any file name', () => {
    const paths = SCANNED_ROOTS.flatMap(pathsUnder);
    expect(paths.length).toBeGreaterThan(0);
    expect(referenceAppPaths(paths)).toEqual([]);
  });
});
