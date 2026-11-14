import { describe, expect, it } from 'vitest';
import { checkCatalogs, formatProblems } from '../core/strings/checkCatalogs.ts';
import { defineStrings } from '../core/strings/defineStrings.ts';
import { allStrings, catalogFromModule, catalogs, spokenStrings } from './strings.ts';

// `npm run check:strings` runs this file. src/core/strings/checkCatalogs.test.ts proves each rule
// fails on a bad fixture; this applies the rules to every catalog in the app.
describe('every string catalog', () => {
  it('finds the shared clip sets', () => {
    const namespaces = new Set(allStrings.map((handle) => handle.namespace));
    for (const shared of ['letter-names', 'letter-sounds', 'numbers', 'colors', 'shapes', 'feedback']) {
      expect(namespaces, shared).toContain(shared);
    }
  });

  it('passes the namespace, content, and allow-list rules', () => {
    const problems = checkCatalogs(catalogs);
    expect(problems, formatProblems(problems)).toEqual([]);
  });

  it('gives every string a unique id', () => {
    const ids = allStrings.map((handle) => handle.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('lists only spoken strings as spoken', () => {
    expect(spokenStrings.length).toBeGreaterThan(0);
    expect(spokenStrings.every((handle) => handle.kind === 'spoken')).toBe(true);
  });
});

describe('catalogFromModule', () => {
  it('reads the handles of a strings export', () => {
    const strings = defineStrings('demo', { a: { text: 'A' } });
    expect(catalogFromModule('src/demo/strings.ts', { strings }).handles).toEqual([strings.a]);
  });

  it.each([
    ['no strings export', { other: 1 }, /must export the defineStrings result as "strings"/],
    ['a null strings export', { strings: null }, /must export the defineStrings result as "strings"/],
    ['a plain object of text', { strings: { a: 'A' } }, /"strings" must be a defineStrings result, found "A"/],
  ])('rejects a module with %s', (_label, module, reason) => {
    expect(() => catalogFromModule('src/bad/strings.ts', module)).toThrow(reason);
  });
});
