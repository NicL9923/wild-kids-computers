import { describe, expect, it } from 'vitest';
import { checkAssetLicenses, globToRegExp } from './licenseManifest.ts';

const entry = (files: string, license = 'MIT') => ({
  files,
  source: 'drawn here',
  author: 'Wild Flowers Tech',
  license,
});

/** Builds an in-memory assets/ tree. Manifests are given as values; other files read as ''. */
function tree(contents: Record<string, unknown>) {
  return {
    files: Object.keys(contents),
    read: (file: string) => {
      const value = contents[file];
      return typeof value === 'string' ? value : JSON.stringify(value);
    },
  };
}

describe('checkAssetLicenses', () => {
  it('passes when every file matches an entry in the nearest manifest', () => {
    const problems = checkAssetLicenses(
      tree({
        'art/LICENSES.json': [entry('home/*.svg'), entry('logo.svg')],
        'art/home/meadow.svg': '',
        'art/home/fox.svg': '',
        'art/logo.svg': '',
        'art/coloring/LICENSES.json': [entry('*.svg', 'CC0-1.0')],
        'art/coloring/cat.svg': '',
      }),
    );
    expect(problems).toEqual([]);
  });

  it.each([
    {
      name: 'a file no entry matches',
      contents: { 'art/LICENSES.json': [entry('*.svg')], 'art/a.svg': '', 'art/b.png': '' },
      expected: [{ path: 'art/b.png', detail: 'matches no entry in art/LICENSES.json' }],
    },
    {
      name: 'an entry that matches no file',
      contents: { 'art/LICENSES.json': [entry('*.svg'), entry('gone.png')], 'art/a.svg': '' },
      expected: [{ path: 'art/LICENSES.json', detail: 'entry "gone.png" matches no file' }],
    },
    {
      name: 'a folder with no manifest',
      contents: { 'voice/en/abc.ogg': '' },
      expected: [{ path: 'voice/en/abc.ogg', detail: 'has no LICENSES.json in its folder or a parent folder' }],
    },
    {
      name: 'a file in assets/ itself',
      contents: { 'stray.svg': '' },
      expected: [{ path: 'stray.svg', detail: 'has no LICENSES.json in its folder or a parent folder' }],
    },
    {
      name: 'a manifest in assets/ itself',
      contents: { 'LICENSES.json': [entry('*')], 'art/a.svg': '' },
      expected: [
        { path: 'LICENSES.json', detail: 'must live in a folder under assets/, not in assets/ itself' },
        { path: 'art/a.svg', detail: 'has no LICENSES.json in its folder or a parent folder' },
      ],
    },
  ])('reports $name', ({ contents, expected }) => {
    expect(checkAssetLicenses(tree(contents))).toEqual(expected);
  });

  it.each([
    { name: 'a license outside the allowed set', manifest: [entry('a.svg', 'CC-BY-SA-4.0')], field: '0.license' },
    { name: 'a missing author', manifest: [{ files: 'a.svg', source: 's', license: 'MIT' }], field: '0.author' },
    { name: 'a blank source', manifest: [{ ...entry('a.svg'), source: '  ' }], field: '0.source' },
    { name: 'an unknown field', manifest: [{ ...entry('a.svg'), url: 'x' }], field: '0' },
    { name: 'an object instead of a list', manifest: { files: 'a.svg' }, field: '(root)' },
    { name: 'an empty list', manifest: [], field: '(root)' },
  ])('rejects a manifest with $name and names the field', ({ manifest, field }) => {
    const problems = checkAssetLicenses(tree({ 'art/LICENSES.json': manifest, 'art/a.svg': '' }));
    expect(problems[0]?.path).toBe('art/LICENSES.json');
    const prefix = `entry field ${field}: `;
    expect(problems[0]?.detail.slice(0, prefix.length)).toBe(prefix);
  });

  it('rejects a manifest that is not JSON, and then counts its files as unlicensed', () => {
    const problems = checkAssetLicenses(tree({ 'art/LICENSES.json': '{ nope', 'art/a.svg': '' }));
    expect(problems).toEqual([
      { path: 'art/LICENSES.json', detail: 'is not valid JSON' },
      { path: 'art/a.svg', detail: 'matches no entry in art/LICENSES.json' },
    ]);
  });
});

describe('globToRegExp', () => {
  it.each([
    { glob: '*.svg', path: 'fox.svg', matches: true },
    { glob: '*.svg', path: 'home/fox.svg', matches: false },
    { glob: '**/*.svg', path: 'home/deep/fox.svg', matches: true },
    { glob: '**/*.svg', path: 'fox.svg', matches: true },
    { glob: 'home/**', path: 'home/a/b.svg', matches: true },
    { glob: 'fox?.svg', path: 'fox1.svg', matches: true },
    { glob: 'fox?.svg', path: 'fox/.svg', matches: false },
    { glob: 'a.svg', path: 'aXsvg', matches: false },
    { glob: 'Andika-*.woff2', path: 'Andika-Bold.woff2', matches: true },
  ])('$glob matches $path: $matches', ({ glob, path, matches }) => {
    expect(globToRegExp(glob).test(path)).toBe(matches);
  });
});
